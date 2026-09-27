/**
 * Objekt- & Reinigungs-LV Repository
 * Liegenschaften, Gebäude, Etagen, Räume, Putzplan & Reinigungs-LV (F1 & F3)
 */
const ReinigungController = require('../../controllers/ReinigungController');

function createObjektReinigungRepo(deps) {
    const { db, dbQuery, dbRun, appendAuditLog } = deps;

// --- Objektverwaltung F1: Anwendungs-Löschschutz (polymorphe Beleg-Referenz) ---
function sammleObjektNachkommen(typ, id) {
    const knoten = [{ typ, id }];
    if (typ === 'LIEGENSCHAFT') {
        for (const g of db.prepare('SELECT id FROM gebaeude WHERE liegenschaft_id=?').all(id)) {
            knoten.push(...sammleObjektNachkommen('GEBAEUDE', g.id));
        }
    } else if (typ === 'GEBAEUDE') {
        for (const e of db.prepare('SELECT id FROM etagen WHERE gebaeude_id=?').all(id)) {
            knoten.push(...sammleObjektNachkommen('ETAGE', e.id));
        }
    } else if (typ === 'ETAGE') {
        for (const r of db.prepare('SELECT id FROM raeume WHERE etage_id=?').all(id)) {
            knoten.push({ typ: 'RAUM', id: r.id });
        }
    }
    return knoten;
}

function pruefeObjektBelegbezug(typ, id, label) {
    const stmt = db.prepare('SELECT COUNT(*) AS c FROM dokumente WHERE objekt_typ=? AND objekt_id=?');
    let gesamt = 0;
    for (const k of sammleObjektNachkommen(typ, id)) {
        gesamt += stmt.get(k.typ, k.id).c;
    }
    if (gesamt > 0) {
        throw new Error(`${label} hat Belege und kann nicht gelöscht werden – bitte stattdessen deaktivieren.`);
    }
}

// --- Putzplan/Reinigungs-LV F3: Objekt-Löschschutz (Bereiche/Einträge im Teilbaum) ---
function pruefeObjektLvBezug(typ, id, label) {
    const bereichStmt = db.prepare('SELECT COUNT(*) AS c FROM lv_bereiche WHERE objekt_typ=? AND objekt_id=?');
    const eintragStmt = db.prepare('SELECT COUNT(*) AS c FROM putzplan_eintraege WHERE objekt_typ=? AND objekt_id=?');
    let gesamt = 0;
    for (const k of sammleObjektNachkommen(typ, id)) {
        gesamt += bereichStmt.get(k.typ, k.id).c + eintragStmt.get(k.typ, k.id).c;
    }
    if (gesamt > 0) {
        throw new Error(`${label} enthält Putzplan-/LV-Daten und kann nicht gelöscht werden – bitte stattdessen deaktivieren.`);
    }
}

// --- Dauerrechnungen F2: Objekt-Löschschutz (Abrechnungspläne im Teilbaum) ---
function pruefeObjektPlanBezug(typ, id, label) {
    const planTableExists = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='abrechnungsplaene'").get();
    if (!planTableExists) return;
    const planStmt = db.prepare('SELECT COUNT(*) AS c FROM abrechnungsplaene WHERE objekt_typ=? AND objekt_id=?');
    let gesamt = 0;
    for (const k of sammleObjektNachkommen(typ, id)) {
        gesamt += planStmt.get(k.typ, k.id).c;
    }
    if (gesamt > 0) {
        throw new Error(`${label} ist in Abrechnungsplänen referenziert und kann nicht gelöscht werden – bitte stattdessen deaktivieren.`);
    }
}

function ladeObjekteState() {
    return {
        liegenschaften: db.prepare('SELECT * FROM liegenschaften').all(),
        gebaeude: db.prepare('SELECT * FROM gebaeude').all(),
        etagen: db.prepare('SELECT * FROM etagen').all(),
        raeume: db.prepare('SELECT * FROM raeume').all()
    };
}

function leseZuschlagsProfil() {
    const row = db.prepare("SELECT value FROM einstellungen WHERE key='reinigung_zuschlagsprofil'").get();
    if (!row || !row.value) return ReinigungController.DEFAULT_ZUSCHLAGSPROFIL;
    try {
        const parsed = JSON.parse(row.value);
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : ReinigungController.DEFAULT_ZUSCHLAGSPROFIL;
    } catch (_e) {
        return ReinigungController.DEFAULT_ZUSCHLAGSPROFIL;
    }
}

function validiereZuschlaegeJson(zuschlaegeJson) {
    if (zuschlaegeJson == null || zuschlaegeJson === '') return null;
    let parsed;
    try {
        parsed = typeof zuschlaegeJson === 'string' ? JSON.parse(zuschlaegeJson) : zuschlaegeJson;
    } catch (_e) {
        throw new Error('Ungültige Zuschlags-Struktur (JSON).');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Ungültige Zuschlags-Struktur.');
    }
    const normalisiert = {};
    for (const [key, val] of Object.entries(parsed)) {
        if (!(key in ReinigungController.ZUSCHLAG_LABELS)) {
            throw new Error(`Unbekannter Zuschlagstyp: ${key}`);
        }
        const roh = (val != null && typeof val === 'object') ? val.prozent : val;
        const n = parseFloat(roh);
        if (isNaN(n) || n < 0 || n > 100) {
            throw new Error(`Ungültiger Anteil für "${key}": Prozent muss zwischen 0 und 100 liegen.`);
        }
        normalisiert[key] = n;
    }
    return Object.keys(normalisiert).length > 0 ? JSON.stringify(normalisiert) : null;
}

function kalkuliereLvPosition(posRow, profil, objekteState) {
    const eintraege = db.prepare('SELECT * FROM putzplan_eintraege WHERE position_id=? ORDER BY id ASC').all(posRow.id)
        .map(e => ({ ...e, _label: baueObjektPfad(e.objekt_typ, e.objekt_id) }));
    return ReinigungController.positionsKalkulation(
        posRow,
        eintraege,
        (typ, id) => ReinigungController.autoMengeFuerObjekt(typ, id, objekteState),
        profil
    );
}


const OBJEKT_EBENEN = {
    LIEGENSCHAFT: { tabelle: 'liegenschaften', eltern: null },
    GEBAEUDE: { tabelle: 'gebaeude', elternFeld: 'liegenschaft_id', elternTyp: 'LIEGENSCHAFT' },
    ETAGE: { tabelle: 'etagen', elternFeld: 'gebaeude_id', elternTyp: 'GEBAEUDE' },
    RAUM: { tabelle: 'raeume', elternFeld: 'etage_id', elternTyp: 'ETAGE' }
};

function loeseObjektEmpfaengerAuf(typ, id) {
    let curTyp = typ;
    let curId = id;
    let quelle = null;
    while (curTyp && curId != null) {
        const ebene = OBJEKT_EBENEN[curTyp];
        if (!ebene) return null;
        const knoten = db.prepare(`SELECT * FROM ${ebene.tabelle} WHERE id=?`).get(curId);
        if (!knoten) return null;
        if (knoten.empfaenger_kunde_id) {
            const kunde = db.prepare('SELECT id, name FROM kunden WHERE id=?').get(knoten.empfaenger_kunde_id);
            return {
                kundeId: knoten.empfaenger_kunde_id,
                name: kunde ? kunde.name : null,
                art: knoten.empfaenger_art || null,
                quelle: quelle === null ? 'DIREKT' : `GEERBT_VON_${curTyp}`
            };
        }
        if (!ebene.elternFeld) break;
        quelle = curTyp;
        curTyp = ebene.elternTyp;
        curId = knoten[ebene.elternFeld];
    }
    return null;
}

function baueObjektPfad(typ, id) {
    const teile = [];
    let curTyp = typ;
    let curId = id;
    while (curTyp && curId != null) {
        const ebene = OBJEKT_EBENEN[curTyp];
        if (!ebene) break;
        const knoten = db.prepare(`SELECT * FROM ${ebene.tabelle} WHERE id=?`).get(curId);
        if (!knoten) break;
        teile.unshift(knoten.objekt_nr || knoten.name);
        if (!ebene.elternFeld) break;
        curTyp = ebene.elternTyp;
        curId = knoten[ebene.elternFeld];
    }
    return teile.join(' › ');
}

    const repo = {
// --- Objektverwaltung (F1) ---
    async saveLiegenschaft(data) {
        const tx = db.transaction((d) => {
            const empfaengerKundeId = d.empfaenger_kunde_id ? Number(d.empfaenger_kunde_id) : null;
            const empfaengerArt = empfaengerKundeId ? (d.empfaenger_art || null) : null;
            if (d.id) {
                db.prepare('UPDATE liegenschaften SET objekt_nr=?, name=?, strasse=?, plz=?, ort=?, empfaenger_kunde_id=?, empfaenger_art=?, notizen=?, aktiv=? WHERE id=?')
                  .run(d.objekt_nr || null, d.name, d.strasse || null, d.plz || null, d.ort || null, empfaengerKundeId, empfaengerArt, d.notizen || null, d.aktiv === 0 ? 0 : 1, d.id);
                return d.id;
            }
            const res = db.prepare('INSERT INTO liegenschaften (objekt_nr, name, strasse, plz, ort, empfaenger_kunde_id, empfaenger_art, notizen, aktiv) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .run(d.objekt_nr || null, d.name, d.strasse || null, d.plz || null, d.ort || null, empfaengerKundeId, empfaengerArt, d.notizen || null, d.aktiv === 0 ? 0 : 1);
            return res.lastInsertRowid;
        });
        return tx(data);
    },

    async deleteLiegenschaft(id) {
        const tx = db.transaction((liegId) => {
            const lieg = db.prepare('SELECT id FROM liegenschaften WHERE id=?').get(liegId);
            if (!lieg) throw new Error('Liegenschaft nicht gefunden.');
            pruefeObjektLvBezug('LIEGENSCHAFT', liegId, 'Die Liegenschaft');
            pruefeObjektPlanBezug('LIEGENSCHAFT', liegId, 'Die Liegenschaft');
            pruefeObjektBelegbezug('LIEGENSCHAFT', liegId, 'Die Liegenschaft');
            return db.prepare('DELETE FROM liegenschaften WHERE id=?').run(liegId).changes;
        });
        return { changes: tx(id) };
    },

    async saveGebaeude(data) {
        const tx = db.transaction((d) => {
            const empfaengerKundeId = d.empfaenger_kunde_id ? Number(d.empfaenger_kunde_id) : null;
            const empfaengerArt = empfaengerKundeId ? (d.empfaenger_art || null) : null;
            if (d.id) {
                db.prepare('UPDATE gebaeude SET liegenschaft_id=?, name=?, strasse=?, plz=?, ort=?, baujahr=?, geschosse=?, empfaenger_kunde_id=?, empfaenger_art=?, notizen=?, aktiv=? WHERE id=?')
                  .run(d.liegenschaft_id, d.name, d.strasse || null, d.plz || null, d.ort || null, d.baujahr == null || d.baujahr === '' ? null : Number(d.baujahr), d.geschosse == null || d.geschosse === '' ? null : Number(d.geschosse), empfaengerKundeId, empfaengerArt, d.notizen || null, d.aktiv === 0 ? 0 : 1, d.id);
                return d.id;
            }
            const res = db.prepare('INSERT INTO gebaeude (liegenschaft_id, name, strasse, plz, ort, baujahr, geschosse, empfaenger_kunde_id, empfaenger_art, notizen, aktiv) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .run(d.liegenschaft_id, d.name, d.strasse || null, d.plz || null, d.ort || null, d.baujahr == null || d.baujahr === '' ? null : Number(d.baujahr), d.geschosse == null || d.geschosse === '' ? null : Number(d.geschosse), empfaengerKundeId, empfaengerArt, d.notizen || null, d.aktiv === 0 ? 0 : 1);
            return res.lastInsertRowid;
        });
        return tx(data);
    },

    async deleteGebaeude(id) {
        const tx = db.transaction((gebId) => {
            const g = db.prepare('SELECT id FROM gebaeude WHERE id=?').get(gebId);
            if (!g) throw new Error('Gebäude nicht gefunden.');
            pruefeObjektLvBezug('GEBAEUDE', gebId, 'Das Gebäude');
            pruefeObjektPlanBezug('GEBAEUDE', gebId, 'Das Gebäude');
            pruefeObjektBelegbezug('GEBAEUDE', gebId, 'Das Gebäude');
            return db.prepare('DELETE FROM gebaeude WHERE id=?').run(gebId).changes;
        });
        return { changes: tx(id) };
    },

    async saveEtage(data) {
        const tx = db.transaction((d) => {
            const empfaengerKundeId = d.empfaenger_kunde_id ? Number(d.empfaenger_kunde_id) : null;
            const empfaengerArt = empfaengerKundeId ? (d.empfaenger_art || null) : null;
            if (d.id) {
                db.prepare('UPDATE etagen SET gebaeude_id=?, name=?, ebene_nummer=?, empfaenger_kunde_id=?, empfaenger_art=?, notizen=?, aktiv=? WHERE id=?')
                  .run(d.gebaeude_id, d.name, d.ebene_nummer == null || d.ebene_nummer === '' ? null : Number(d.ebene_nummer), empfaengerKundeId, empfaengerArt, d.notizen || null, d.aktiv === 0 ? 0 : 1, d.id);
                return d.id;
            }
            const res = db.prepare('INSERT INTO etagen (gebaeude_id, name, ebene_nummer, empfaenger_kunde_id, empfaenger_art, notizen, aktiv) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .run(d.gebaeude_id, d.name, d.ebene_nummer == null || d.ebene_nummer === '' ? null : Number(d.ebene_nummer), empfaengerKundeId, empfaengerArt, d.notizen || null, d.aktiv === 0 ? 0 : 1);
            return res.lastInsertRowid;
        });
        return tx(data);
    },

    async deleteEtage(id) {
        const tx = db.transaction((etgId) => {
            const e = db.prepare('SELECT id FROM etagen WHERE id=?').get(etgId);
            if (!e) throw new Error('Etage nicht gefunden.');
            pruefeObjektLvBezug('ETAGE', etgId, 'Die Etage');
            pruefeObjektPlanBezug('ETAGE', etgId, 'Die Etage');
            pruefeObjektBelegbezug('ETAGE', etgId, 'Die Etage');
            return db.prepare('DELETE FROM etagen WHERE id=?').run(etgId).changes;
        });
        return { changes: tx(id) };
    },

    async saveRaum(data) {
        const tx = db.transaction((d) => {
            const flaeche = parseFloat(d.flaeche);
            if (!isNaN(flaeche) && flaeche < 0) throw new Error('Ungültige Fläche: Der Wert darf nicht negativ sein.');
            const empfaengerKundeId = d.empfaenger_kunde_id ? Number(d.empfaenger_kunde_id) : null;
            const empfaengerArt = empfaengerKundeId ? (d.empfaenger_art || null) : null;
            if (d.id) {
                db.prepare('UPDATE raeume SET etage_id=?, name=?, raum_nr=?, flaeche=?, einheit=?, raumtyp=?, bodenbelag=?, empfaenger_kunde_id=?, empfaenger_art=?, notizen=?, aktiv=? WHERE id=?')
                  .run(d.etage_id, d.name, d.raum_nr || null, isNaN(flaeche) ? 0 : flaeche, d.einheit || 'm²', d.raumtyp || null, d.bodenbelag || null, empfaengerKundeId, empfaengerArt, d.notizen || null, d.aktiv === 0 ? 0 : 1, d.id);
                return d.id;
            }
            const res = db.prepare('INSERT INTO raeume (etage_id, name, raum_nr, flaeche, einheit, raumtyp, bodenbelag, empfaenger_kunde_id, empfaenger_art, notizen, aktiv) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .run(d.etage_id, d.name, d.raum_nr || null, isNaN(flaeche) ? 0 : flaeche, d.einheit || 'm²', d.raumtyp || null, d.bodenbelag || null, empfaengerKundeId, empfaengerArt, d.notizen || null, d.aktiv === 0 ? 0 : 1);
            return res.lastInsertRowid;
        });
        return tx(data);
    },

    async deleteRaum(id) {
        const tx = db.transaction((raumId) => {
            const r = db.prepare('SELECT id FROM raeume WHERE id=?').get(raumId);
            if (!r) throw new Error('Raum nicht gefunden.');
            pruefeObjektLvBezug('RAUM', raumId, 'Der Raum');
            pruefeObjektPlanBezug('RAUM', raumId, 'Der Raum');
            pruefeObjektBelegbezug('RAUM', raumId, 'Der Raum');
            return db.prepare('DELETE FROM raeume WHERE id=?').run(raumId).changes;
        });
        return { changes: tx(id) };
    },

    async getObjektBaum() {
        const liegenschaften = await dbQuery('SELECT * FROM liegenschaften ORDER BY name ASC');
        const gebaeude = await dbQuery('SELECT * FROM gebaeude ORDER BY name ASC');
        const etagen = await dbQuery('SELECT * FROM etagen ORDER BY COALESCE(ebene_nummer, 999), name ASC');
        const raeume = await dbQuery('SELECT * FROM raeume ORDER BY name ASC');

        const flaecheJeEtage = new Map();
        for (const r of raeume) {
            const wert = r.einheit === 'm²' ? (parseFloat(r.flaeche) || 0) : 0;
            flaecheJeEtage.set(r.etage_id, (flaecheJeEtage.get(r.etage_id) || 0) + wert);
        }
        const etagenJeGebaeude = new Map();
        for (const e of etagen) {
            etagenJeGebaeude.set(e.gebaeude_id, (etagenJeGebaeude.get(e.gebaeude_id) || 0) + 1);
        }
        const gebaeudeJeLiegenschaft = new Map();
        for (const g of gebaeude) {
            gebaeudeJeLiegenschaft.set(g.liegenschaft_id, (gebaeudeJeLiegenschaft.get(g.liegenschaft_id) || 0) + 1);
        }

        for (const l of liegenschaften) l.kindCount = gebaeudeJeLiegenschaft.get(l.id) || 0;
        for (const g of gebaeude) {
            g.kindCount = etagenJeGebaeude.get(g.id) || 0;
            let summe = 0;
            for (const e of etagen.filter(x => x.gebaeude_id === g.id)) summe += flaecheJeEtage.get(e.id) || 0;
            g.flaeche_summe = Math.round(summe * 100) / 100;
        }
        for (const e of etagen) {
            e.kindCount = raeume.filter(x => x.etage_id === e.id).length;
            e.flaeche_summe = Math.round((flaecheJeEtage.get(e.id) || 0) * 100) / 100;
        }
        for (const r of raeume) {
            r.kindCount = 0;
            r.flaeche_summe = r.einheit === 'm²' ? (parseFloat(r.flaeche) || 0) : 0;
        }
        return { liegenschaften, gebaeude, etagen, raeume };
    },

    async getObjektDetails(objektTyp, objektId) {
        if (!OBJEKT_EBENEN[objektTyp]) throw new Error('Ungültiger Objekttyp');
        const numId = Number(objektId);
        const ebene = OBJEKT_EBENEN[objektTyp];
        const knoten = db.prepare(`SELECT * FROM ${ebene.tabelle} WHERE id=?`).get(numId);
        if (!knoten) throw new Error('Objekt nicht gefunden.');

        let gebaeude = [];
        let etagen = [];
        let raeume = [];
        let anzahlGebaeude = 0;
        let anzahlEtagen = 0;
        let anzahlRaeume = 0;
        let flaecheGesamt = 0;

        if (objektTyp === 'LIEGENSCHAFT') {
            gebaeude = await dbQuery('SELECT * FROM gebaeude WHERE liegenschaft_id=? ORDER BY name ASC', [numId]);
            etagen = await dbQuery('SELECT e.* FROM etagen e JOIN gebaeude g ON g.id=e.gebaeude_id WHERE g.liegenschaft_id=? ORDER BY COALESCE(e.ebene_nummer, 999), e.name ASC', [numId]);
            raeume = await dbQuery('SELECT r.* FROM raeume r JOIN etagen e ON e.id=r.etage_id JOIN gebaeude g ON g.id=e.gebaeude_id WHERE g.liegenschaft_id=? ORDER BY r.name ASC', [numId]);
            anzahlGebaeude = gebaeude.length;
            anzahlEtagen = etagen.length;
            anzahlRaeume = raeume.length;
            flaecheGesamt = Math.round(raeume.reduce((s, r) => s + (r.einheit === 'm²' ? (parseFloat(r.flaeche) || 0) : 0), 0) * 100) / 100;
        } else if (objektTyp === 'GEBAEUDE') {
            etagen = await dbQuery('SELECT * FROM etagen WHERE gebaeude_id=? ORDER BY COALESCE(ebene_nummer, 999), name ASC', [numId]);
            raeume = await dbQuery('SELECT r.* FROM raeume r JOIN etagen e ON e.id=r.etage_id WHERE e.gebaeude_id=? ORDER BY r.name ASC', [numId]);
            anzahlEtagen = etagen.length;
            anzahlRaeume = raeume.length;
            flaecheGesamt = Math.round(raeume.reduce((s, r) => s + (r.einheit === 'm²' ? (parseFloat(r.flaeche) || 0) : 0), 0) * 100) / 100;
        } else if (objektTyp === 'ETAGE') {
            raeume = await dbQuery('SELECT * FROM raeume WHERE etage_id=? ORDER BY name ASC', [numId]);
            anzahlRaeume = raeume.length;
            flaecheGesamt = Math.round(raeume.reduce((s, r) => s + (r.einheit === 'm²' ? (parseFloat(r.flaeche) || 0) : 0), 0) * 100) / 100;
        } else if (objektTyp === 'RAUM') {
            flaecheGesamt = knoten.einheit === 'm²' ? (parseFloat(knoten.flaeche) || 0) : 0;
            flaecheGesamt = Math.round(flaecheGesamt * 100) / 100;
        }

        const planTableExists = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='abrechnungsplaene'").get();
        const plaene = planTableExists
            ? await dbQuery('SELECT * FROM abrechnungsplaene WHERE objekt_typ=? AND objekt_id=? ORDER BY name ASC', [objektTyp, numId])
            : [];

        return {
            knoten,
            pfad: baueObjektPfad(objektTyp, numId),
            empfaenger: loeseObjektEmpfaengerAuf(objektTyp, numId),
            kinder: { gebaeude, etagen, raeume },
            kennzahlen: {
                flaecheGesamt,
                anzahlRaeume,
                anzahlEtagen,
                anzahlGebaeude
            },
            plaene
        };
    },

    async getObjektHistorie(objektTyp, objektId, includeKinder = true) {
        if (!OBJEKT_EBENEN[objektTyp]) throw new Error('Ungültiger Objekttyp');

        const knoten = includeKinder
            ? sammleObjektNachkommen(objektTyp, Number(objektId))
            : [{ typ: objektTyp, id: Number(objektId) }];

        const laufeTabelleExistiert = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dauerrechnung_laeufe'").get();

        const sqlDirekt = `
            SELECT d.id, d.type, d.nr, d.datum, d.faellig, d.status, d.netto, d.brutto,
                   d.isLocked, d.kundeId, k.name AS kundeName, ? AS matchArt
            FROM dokumente d LEFT JOIN kunden k ON k.id = d.kundeId
            WHERE d.objekt_typ = ? AND d.objekt_id = ?`;

        const sqlDauerrechnung = `
            SELECT d.id, d.type, d.nr, d.datum, d.faellig, d.status, d.netto, d.brutto,
                   d.isLocked, d.kundeId, k.name AS kundeName, 'DAUERRECHNUNG' AS matchArt
            FROM dokumente d
            JOIN dauerrechnung_laeufe l ON l.dokument_id = d.id
            JOIN abrechnungsplaene p ON l.plan_id = p.id
            LEFT JOIN kunden k ON k.id = d.kundeId
            WHERE p.objekt_typ = ? AND p.objekt_id = ?`;

        const ergebnisMap = new Map();
        for (const k of knoten) {
            const rows = laufeTabelleExistiert
                ? db.prepare(`SELECT * FROM (${sqlDirekt}) UNION ALL SELECT * FROM (${sqlDauerrechnung}) ORDER BY datum DESC, id DESC`).all('DIREKT', k.typ, k.id, k.typ, k.id)
                : db.prepare(sqlDirekt).all('DIREKT', k.typ, k.id);
            for (const row of rows) {
                row.isLocked = !!row.isLocked;
                if (!ergebnisMap.has(row.id)) ergebnisMap.set(row.id, row);
            }
        }

        return Array.from(ergebnisMap.values()).sort((a, b) => {
            const da = a.datum || '';
            const db_ = b.datum || '';
            if (da === db_) return b.id - a.id;
            return da < db_ ? 1 : -1;
        });
    },

    // --- Putzplan/Reinigungs-LV (F3) ---
    async getZuschlagsProfil() {
        return leseZuschlagsProfil();
    },

    async saveZuschlagsProfil(profil) {
        const pruefung = ReinigungController.validateProfil(profil);
        if (!pruefung.valid) throw new Error(pruefung.message);
        db.prepare("INSERT OR REPLACE INTO einstellungen (key, value) VALUES ('reinigung_zuschlagsprofil', ?)")
          .run(JSON.stringify(profil));
        return { success: true };
    },

    async getPutzplan(objektTyp, objektId) {
        if (!OBJEKT_EBENEN[objektTyp]) throw new Error('Ungültiger Objekttyp');
        const oid = Number(objektId);
        if (!Number.isInteger(oid)) throw new Error('Ungültige Objekt-ID');
        const knoten = db.prepare(`SELECT * FROM ${OBJEKT_EBENEN[objektTyp].tabelle} WHERE id=?`).get(oid);
        if (!knoten) throw new Error('Objekt nicht gefunden.');

        const profil = leseZuschlagsProfil();
        const objekteState = ladeObjekteState();
        const bereicheRows = db.prepare('SELECT * FROM lv_bereiche WHERE objekt_typ=? AND objekt_id=? ORDER BY sortier_index ASC, id ASC').all(objektTyp, oid);
        const bereiche = bereicheRows.map(b => {
            const positionen = db.prepare("SELECT * FROM lv_positionen WHERE bereich_id=? ORDER BY CASE WHEN positionsnr IS NULL THEN 1 ELSE 0 END, positionsnr ASC, id ASC").all(b.id)
                .map(p => ({ ...p, kalkulation: kalkuliereLvPosition(p, profil, objekteState) }));
            return { ...b, positionen };
        });

        return {
            objektPfad: baueObjektPfad(objektTyp, oid),
            empfaenger: loeseObjektEmpfaengerAuf(objektTyp, oid),
            bereiche,
            summen: ReinigungController.summiere(bereiche)
        };
    },

    async saveLvBereich(data) {
        if (!data || typeof data !== 'object') throw new Error('Ungültige Bereichs-Daten');
        if (!data.name || !String(data.name).trim()) throw new Error('Bitte einen Bereichsnamen eingeben.');
        if (!OBJEKT_EBENEN[data.objekt_typ]) throw new Error('Ungültiger Objekttyp');
        if (!Number.isInteger(Number(data.objekt_id))) throw new Error('Ungültige Objekt-ID');

        const tx = db.transaction((d) => {
            const sortier = parseInt(d.sortier_index, 10) || 0;
            const aktiv = d.aktiv === 0 ? 0 : 1;
            let bereichId = d.id ? Number(d.id) : null;
            try {
                if (bereichId) {
                    const existing = db.prepare('SELECT id FROM lv_bereiche WHERE id=?').get(bereichId);
                    if (!existing) throw new Error('Leistungsbereich wurde nicht gefunden.');
                    db.prepare('UPDATE lv_bereiche SET objekt_typ=?, objekt_id=?, name=?, positionsnr_prefix=?, sortier_index=?, notizen=?, aktiv=? WHERE id=?')
                      .run(d.objekt_typ, Number(d.objekt_id), String(d.name).trim(), d.positionsnr_prefix || null, sortier, d.notizen || null, aktiv, bereichId);
                } else {
                    const res = db.prepare('INSERT INTO lv_bereiche (objekt_typ, objekt_id, name, positionsnr_prefix, sortier_index, notizen, aktiv) VALUES (?, ?, ?, ?, ?, ?, ?)')
                      .run(d.objekt_typ, Number(d.objekt_id), String(d.name).trim(), d.positionsnr_prefix || null, sortier, d.notizen || null, aktiv);
                    bereichId = res.lastInsertRowid;
                }
            } catch (e) {
                if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    throw new Error('Leistungsbereich mit diesem Namen existiert an diesem Objekt bereits.');
                }
                throw e;
            }

            appendAuditLog({
                entityType: 'LV_BEREICH',
                entityId: bereichId,
                action: d.id ? 'GEÄNDERT' : 'ERSTELLT',
                details: { name: String(d.name).trim(), objektPfad: baueObjektPfad(d.objekt_typ, Number(d.objekt_id)) }
            });
            return bereichId;
        });

        return tx(data);
    },

    async deleteLvBereich(id) {
        const bereichId = Number(id);
        if (!Number.isInteger(bereichId)) throw new Error('Ungültige Bereichs-ID');
        const tx = db.transaction((bid) => {
            const bereich = db.prepare('SELECT * FROM lv_bereiche WHERE id=?').get(bid);
            if (!bereich) throw new Error('Leistungsbereich wurde nicht gefunden.');
            const verlinkt = db.prepare(`
                SELECT ap.name FROM abrechnungsplan_positionen app
                JOIN lv_positionen lp ON lp.id = app.lv_position_id
                JOIN abrechnungsplaene ap ON ap.id = app.plan_id
                WHERE lp.bereich_id = ? LIMIT 1`).get(bid);
            if (verlinkt) {
                throw new Error(`Der Bereich enthält eine Position, die in Abrechnungsplan "${verlinkt.name}" verlinkt ist – bitte zuerst dort entfernen.`);
            }
            const changes = db.prepare('DELETE FROM lv_bereiche WHERE id=?').run(bid).changes;
            appendAuditLog({
                entityType: 'LV_BEREICH',
                entityId: bid,
                action: 'GELÖSCHT',
                details: { name: bereich.name, objektPfad: baueObjektPfad(bereich.objekt_typ, bereich.objekt_id) }
            });
            return { changes };
        });
        return tx(bereichId);
    },

    async saveLvPosition(data, eintraege = []) {
        if (!data || typeof data !== 'object') throw new Error('Ungültige Positions-Daten');
        if (!data.bezeichnung || !String(data.bezeichnung).trim()) throw new Error('Bitte eine Bezeichnung eingeben.');
        if (!Number.isInteger(Number(data.bereich_id))) throw new Error('Ungültige Bereichs-ID');
        if (!((parseFloat(data.turnus_wert) || 0) > 0)) throw new Error('Turnus-Wert muss größer 0 sein.');
        if (![0, 7, 19].includes(parseInt(data.mwst, 10) || 19)) throw new Error('Ungültiger MwSt-Satz.');
        if (!Array.isArray(eintraege)) throw new Error('Ungültige Eintragsliste');
        const zuschlaegeJson = validiereZuschlaegeJson(data.zuschlaege_json);

        const tx = db.transaction((d, liste) => {
            const bereich = db.prepare('SELECT * FROM lv_bereiche WHERE id=?').get(Number(d.bereich_id));
            if (!bereich) throw new Error('Leistungsbereich wurde nicht gefunden.');

            const turnusWert = parseFloat(d.turnus_wert);
            if (!(turnusWert > 0)) throw new Error('Turnus-Wert muss größer 0 sein.');
            const zeitbedarf = Math.max(0, parseFloat(d.zeitbedarf_min_je_einheit) || 0);
            const stundensatz = Math.max(0, parseFloat(d.kalk_stundensatz) || 0);
            const menge = Math.max(0, parseFloat(d.menge) || 0);

            let posId = d.id ? Number(d.id) : null;
            if (posId) {
                const existing = db.prepare('SELECT * FROM lv_positionen WHERE id=?').get(posId);
                if (!existing) throw new Error('LV-Position wurde nicht gefunden.');
                db.prepare(`UPDATE lv_positionen SET positionsnr=?, bezeichnung=?, beschreibung=?, menge=?, menge_einheit=?, turnus_typ=?, turnus_wert=?, zeitbedarf_min_je_einheit=?, kalk_stundensatz=?, zuschlaege_json=?, mwst=?, notizen=? WHERE id=?`)
                  .run(d.positionsnr || null, String(d.bezeichnung).trim(), d.beschreibung || null, menge, d.menge_einheit || 'm²', d.turnus_typ || 'X_PRO_WOCHE', turnusWert, zeitbedarf, stundensatz, zuschlaegeJson, parseInt(d.mwst, 10) || 19, d.notizen || null, posId);
            } else {
                const res = db.prepare(`INSERT INTO lv_positionen (bereich_id, positionsnr, bezeichnung, beschreibung, menge, menge_einheit, turnus_typ, turnus_wert, zeitbedarf_min_je_einheit, kalk_stundensatz, zuschlaege_json, mwst, notizen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                  .run(Number(d.bereich_id), d.positionsnr || null, String(d.bezeichnung).trim(), d.beschreibung || null, menge, d.menge_einheit || 'm²', d.turnus_typ || 'X_PRO_WOCHE', turnusWert, zeitbedarf, stundensatz, zuschlaegeJson, parseInt(d.mwst, 10) || 19, d.notizen || null);
                posId = res.lastInsertRowid;
            }

            db.prepare('DELETE FROM putzplan_eintraege WHERE position_id=?').run(posId);
            const seen = new Set();
            const insertEintrag = db.prepare('INSERT INTO putzplan_eintraege (position_id, objekt_typ, objekt_id, menge_override, turnus_typ, turnus_wert, notizen) VALUES (?, ?, ?, ?, ?, ?, ?)');
            for (const e of liste) {
                if (!e || !OBJEKT_EBENEN[e.objekt_typ] || !Number.isInteger(Number(e.objekt_id))) {
                    throw new Error('Ungültige Zuordnung: Objekt fehlt oder Typ unbekannt.');
                }
                const key = `${e.objekt_typ}:${Number(e.objekt_id)}`;
                if (seen.has(key)) throw new Error('Position ist diesem Objekt bereits zugeordnet.');
                seen.add(key);
                const override = e.menge_override == null || e.menge_override === '' ? null : parseFloat(e.menge_override);
                if (override != null && !(override >= 0)) throw new Error('Ungültige Mengen-Angabe im Eintrag.');
                const eTurnusWert = parseFloat(e.turnus_wert);
                if (!((eTurnusWert || 0) > 0)) throw new Error('Turnus-Wert muss größer 0 sein.');
                insertEintrag.run(posId, e.objekt_typ, Number(e.objekt_id), override, e.turnus_typ || d.turnus_typ || 'X_PRO_WOCHE', eTurnusWert, e.notizen || null);
            }

            const profil = leseZuschlagsProfil();
            const posRow = db.prepare('SELECT * FROM lv_positionen WHERE id=?').get(posId);
            const kalkulation = kalkuliereLvPosition(posRow, profil, ladeObjekteState());

            appendAuditLog({
                entityType: 'LV_POSITION',
                entityId: posId,
                action: d.id ? 'GEÄNDERT' : 'ERSTELLT',
                details: {
                    name: String(d.bezeichnung).trim(),
                    objektPfad: baueObjektPfad(bereich.objekt_typ, bereich.objekt_id),
                    nettoMonat: kalkulation.nettoMonat
                }
            });
            return { id: posId, kalkulation };
        });

        return tx(data, eintraege);
    },

    async deleteLvPosition(id) {
        const posId = Number(id);
        if (!Number.isInteger(posId)) throw new Error('Ungültige Positions-ID');
        const tx = db.transaction((pid) => {
            const pos = db.prepare('SELECT * FROM lv_positionen WHERE id=?').get(pid);
            if (!pos) throw new Error('LV-Position wurde nicht gefunden.');
            const verlinkt = db.prepare(`
                SELECT ap.name FROM abrechnungsplan_positionen app
                JOIN abrechnungsplaene ap ON ap.id = app.plan_id
                WHERE app.lv_position_id = ? LIMIT 1`).get(pid);
            if (verlinkt) {
                throw new Error(`Position ist in Abrechnungsplan "${verlinkt.name}" verlinkt – bitte zuerst dort entfernen.`);
            }
            const bereich = db.prepare('SELECT * FROM lv_bereiche WHERE id=?').get(pos.bereich_id);
            const changes = db.prepare('DELETE FROM lv_positionen WHERE id=?').run(pid).changes;
            appendAuditLog({
                entityType: 'LV_POSITION',
                entityId: pid,
                action: 'GELÖSCHT',
                details: {
                    name: pos.bezeichnung,
                    objektPfad: bereich ? baueObjektPfad(bereich.objekt_typ, bereich.objekt_id) : null,
                    nettoMonat: null
                }
            });
            return { changes };
        });
        return tx(posId);
    },

        // Interne Hilfsfunktionen für Dauerrechnungen
        sammleObjektNachkommen,
        pruefeObjektBelegbezug,
        pruefeObjektLvBezug,
        pruefeObjektPlanBezug,
        ladeObjekteState,
        leseZuschlagsProfil,
        validiereZuschlaegeJson,
        kalkuliereLvPosition,
        OBJEKT_EBENEN,
        loeseObjektEmpfaengerAuf,
        baueObjektPfad
    };

    return repo;
}

module.exports = createObjektReinigungRepo;
