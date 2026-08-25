const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let dbPath;
try {
    // Try to get the path from Electron's app module
    const { app } = require('electron');
    if (app) {
        dbPath = path.join(app.getPath('userData'), 'database.sqlite');
    } else {
        dbPath = path.join(__dirname, 'database.sqlite');
    }
} catch (e) {
    // Fallback for testing or scripts outside of Electron
    dbPath = path.join(__dirname, 'database.sqlite');
}
// Explicit override (e.g. isolated test databases)
if (process.env.RECHNUNGSPROGRAMM_DB_PATH) {
    dbPath = process.env.RECHNUNGSPROGRAMM_DB_PATH;
}

console.log('Database path:', dbPath);
const db = new Database(dbPath, { verbose: console.log });

// Enable security and performance features (WAL Mode, Foreign Keys)
db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 30000000000;
    PRAGMA page_size = 4096;
`);

const { createSchema, runMigrations, seedDefaultData } = require('./schema.js');
const { createAuditLogger, calculateDocumentContentHash } = require('./main/audit.js');
const DauerrechnungController = require('./controllers/DauerrechnungController');
const InvoiceController = require('./controllers/InvoiceController');
const ReinigungController = require('./controllers/ReinigungController');
const BankingController = require('./controllers/BankingController');
const SepaController = require('./controllers/SepaController');

console.log('Connected to the SQLite database using better-sqlite3 (Expert Mode).');
initDb();

// Zentrale GoBD-Audit-Hashkette (nach Schema-Init, damit audit_logs existiert)
const auditLogger = createAuditLogger(db);
const appendAuditLog = auditLogger.appendAuditLog;

// Lädt einen Beleg inkl. Positionen und Verrechnungen (für Schutz-/Hashvergleiche)
function getDocumentWithChildren(docId) {
    const doc = db.prepare('SELECT * FROM dokumente WHERE id=?').get(docId);
    if (doc) {
        doc.positionen = db.prepare('SELECT * FROM positionen WHERE dokumentId=?').all(docId);
        doc.verrechnungen = db.prepare('SELECT * FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?').all(docId);
    }
    return doc;
}

function isLockedInt(doc) {
    return doc && doc.isLocked ? 1 : 0;
}

/**
 * Kernlogik des Beleg-Schreibens OHNE eigene Transaktion. Wird von saveDocument()
 * (eigenes Transaction-Wrapper) und vom atomaren Storno (storniereRechnung)
 * innerhalb einer übergeordneten better-sqlite3-Transaktion aufgerufen -
 * verschachtelte db.transaction()-Aufrufe sind in better-sqlite3 verboten.
 */
function applyDocumentWrite(d, requestedLockedInt) {
    let docId = d.id;
    let existing = null;
    let action = 'ERSTELLT';

    // GoBD: Inhalts-Hash NACH konsistentem Algorithmus berechnen und persistieren
    d.sha256_hash = calculateDocumentContentHash(d);

    if (docId) {
        existing = getDocumentWithChildren(docId);
        if (!existing) {
            throw new Error(`Dokument mit ID ${docId} wurde nicht gefunden.`);
        }

        const existingWasLocked = !!existing.isLocked;
        if (existingWasLocked) {
            // GoBD-Änderungssperre: Entsperren NUR über entsperreBeleg()
            if (requestedLockedInt === 0) {
                throw new Error(`Beleg ${existing.nr} ist gesperrt (GoBD). Eine Freigabe ist nur über die explizite Funktion 'Beleg entsperren' mit Begründung möglich.`);
            }
            // GoBD-Änderungssperre: Nur Buchhaltungs-/Statusfelder änderbar
            const oldContentHash = calculateDocumentContentHash(existing);
            const newContentHash = calculateDocumentContentHash(d);
            if (oldContentHash !== newContentHash) {
                throw new Error(`Beleg ${existing.nr} ist gesperrt (GoBD-Änderungssperre): Inhaltsfelder dürfen nicht mehr geändert werden. Bitte erstellen Sie eine Stornorechnung/Korrekturrechnung.`);
            }
        }
    }

    // Datenintegrität: Belegnummer darf nur an DIESER Beleg selbst vergeben sein
    // (gilt für Neu-Anlage UND Update; bei gesperrten Belegen greift vorher die
    // GoBD-Änderungssperre über den Inhalts-Hash). Der UNIQUE-Index auf dokumente(nr)
    // greift zusätzlich als letzter Riegel; hier mit deutscher Fehlermeldung.
    const nrConflict = db.prepare('SELECT id FROM dokumente WHERE nr = ? AND id IS NOT ?').get(d.nr, docId == null ? null : docId);
    if (nrConflict) {
        throw new Error(`Die Belegnummer "${d.nr}" ist bereits vergeben (Dokument #${nrConflict.id}). Bitte verwenden Sie eine andere Nummer.`);
    }

    if (docId) {

        const updateStmt = db.prepare('UPDATE dokumente SET type=?, nr=?, datum=?, faellig=?, kundeId=?, projektId=?, status=?, isLocked=?, netto=?, steuer=?, brutto=?, globalRabattAbzug=?, globalRabattType=?, globalRabattValue=?, anzahlung=?, mahnungLevel=?, mahnungDatum=?, mahnungGebuehr=?, eingabemodus=?, vortext=?, fusstext=?, leistungszeitraum_von=?, leistungszeitraum_bis=?, baustellen_adresse=?, vob_vereinbart=?, ist_privatkunde=?, unterliegt_bauabzugsteuer=?, bauabzugsteuer_betrag=?, ausweis_35a_erforderlich=?, summe_lohnkosten_brutto=?, rechnungsart=?, kumulierte_leistung_netto=?, sicherheitseinbehalt=?, unterliegt_13b=?, leitweg_id=?, buyer_reference=?, objekt_typ=?, objekt_id=?, sha256_hash=? WHERE id=?');
        updateStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, isLockedInt(d), d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.mahnungLevel || 0, d.mahnungDatum || null, d.mahnungGebuehr || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.objekt_typ || null, d.objekt_id == null ? null : d.objekt_id, d.sha256_hash || null, docId);

        action = (calculateDocumentContentHash(existing) === calculateDocumentContentHash(d)) ? 'STATUS_GEÄNDERT' : 'GEÄNDERT';

        if (d.type === 'rechnung') {
            // Restore stock: Group by artikelId in memory to avoid N+1 and slow subqueries
            const oldPositions = db.prepare('SELECT artikelId, menge FROM positionen WHERE dokumentId=?').all(docId);
            if (oldPositions.length > 0) {
                const restoreStockMap = new Map();
                for (const p of oldPositions) {
                    if (p.artikelId) {
                        restoreStockMap.set(p.artikelId, (restoreStockMap.get(p.artikelId) || 0) + p.menge);
                    }
                }
                const restoreStockStmt = db.prepare('UPDATE artikel SET bestand = bestand + ? WHERE id=?');
                for (const [artId, qty] of restoreStockMap.entries()) {
                    restoreStockStmt.run(qty, artId);
                }
            }
        }

        const deletePosStmt = db.prepare('DELETE FROM positionen WHERE dokumentId=?');
        deletePosStmt.run(docId);
        const deleteVerrechnungStmt = db.prepare('DELETE FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?');
        deleteVerrechnungStmt.run(docId);
    } else {
        const insertStmt = db.prepare('INSERT INTO dokumente (type, nr, datum, faellig, kundeId, projektId, status, isLocked, netto, steuer, brutto, globalRabattAbzug, globalRabattType, globalRabattValue, anzahlung, eingabemodus, vortext, fusstext, leistungszeitraum_von, leistungszeitraum_bis, baustellen_adresse, vob_vereinbart, ist_privatkunde, unterliegt_bauabzugsteuer, bauabzugsteuer_betrag, ausweis_35a_erforderlich, summe_lohnkosten_brutto, rechnungsart, kumulierte_leistung_netto, sicherheitseinbehalt, unterliegt_13b, leitweg_id, buyer_reference, objekt_typ, objekt_id, sha256_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const res = insertStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, isLockedInt(d), d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.objekt_typ || null, d.objekt_id == null ? null : d.objekt_id, d.sha256_hash || null);
        docId = res.lastInsertRowid;
    }

    // Insert new positions and deduct stock
    if (d.positionen && d.positionen.length > 0) {
        const insertPosStmt = db.prepare('INSERT INTO positionen (dokumentId, artikelId, name, menge, einheit, preis, ek, mwst, rabatt, steuer_schluessel, is13b, cost_type, oz_code, is_tax_deductible_35a) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const stockDeductionMap = new Map();

        for (const p of d.positionen) {
            insertPosStmt.run(docId, p.artikelId || null, p.name || null, p.menge, p.einheit || 'Stk.', p.preis, p.ek || 0, p.mwst, p.rabatt || 0, p.steuer_schluessel || null, p.is13b ? 1 : 0, p.cost_type || 'MATERIAL', p.oz_code || null, p.is_tax_deductible_35a ? 1 : 0);

            if (d.type === 'rechnung' && p.artikelId) {
                stockDeductionMap.set(p.artikelId, (stockDeductionMap.get(p.artikelId) || 0) + p.menge);
            }
        }

        if (stockDeductionMap.size > 0) {
            // Optimization idea rejected: Dynamic CASE ... WHEN ... THEN SQL string approach is discouraged.
            // Relying on a Node-level loop executing a prepared statement strictly within a single SQLite
            // transaction is highly performant in better-sqlite3, much safer, and significantly easier to read.
            const deductStockStmt = db.prepare('UPDATE artikel SET bestand = bestand - ? WHERE id=?');
            for (const [artId, qty] of stockDeductionMap.entries()) {
                deductStockStmt.run(qty, artId);
            }
        }
    }

    insertVerrechnungenGuarded(docId, d.verrechnungen);

    // GoBD: Audit-Eintrag INNERHALB derselben Transaktion - schlägt er
    // fehl, wird die gesamte Mutation zurückgerollt.
    appendAuditLog({
        entityType: 'DOCUMENT',
        entityId: docId,
        action,
        details: {
            nr: d.nr,
            type: d.type,
            status: d.status,
            vorherigerStatus: existing ? existing.status : null,
            isLocked: isLockedInt(d) === 1,
            brutto: d.brutto || 0,
            sha256_hash: d.sha256_hash
        }
    });

    return docId;
}

/**
 * Fügt Verrechnungen eines Belegs ein - MIT Doppelverrechnungs-Schutz:
 * Eine Vorrechnung darf global nur in EINER aktuellen Rechnung verrechnet sein.
 * Wird innerhalb einer bestehenden Transaktion aufgerufen (kein eigenes Wrapper nötig).
 */
function insertVerrechnungenGuarded(docId, verrechnungen) {
    if (!verrechnungen || verrechnungen.length === 0) return;

    const checkUsedStmt = db.prepare('SELECT aktuelle_rechnung_id FROM rechnung_verrechnungen WHERE vorherige_rechnung_id = ? AND aktuelle_rechnung_id != ?');
    const seenPairs = new Set();
    for (const v of verrechnungen) {
        if (!v || !v.vorherige_rechnung_id) continue;
        if (v.vorherige_rechnung_id === docId) {
            throw new Error('Ein Beleg kann nicht mit sich selbst verrechnet werden.');
        }
        const pairKey = `${docId}->${v.vorherige_rechnung_id}`;
        if (seenPairs.has(pairKey)) {
            throw new Error(`Doppelte Verrechnung: Die Rechnung #${v.vorherige_rechnung_id} kann innerhalb desselben Belegs nur einmal abgezogen werden.`);
        }
        seenPairs.add(pairKey);

        const usedBy = checkUsedStmt.get(v.vorherige_rechnung_id, docId);
        if (usedBy) {
            throw new Error(`Doppelverrechnung blockiert: Die Rechnung #${v.vorherige_rechnung_id} ist bereits in Rechnung #${usedBy.aktuelle_rechnung_id} verrechnet und kann nicht erneut abgezogen werden.`);
        }
    }

    const insertVerrechnungStmt = db.prepare('INSERT INTO rechnung_verrechnungen (aktuelle_rechnung_id, vorherige_rechnung_id, abzugsbetrag_netto) VALUES (?, ?, ?)');
    for (const v of verrechnungen) {
        if (!v || !v.vorherige_rechnung_id) continue;
        insertVerrechnungStmt.run(docId, v.vorherige_rechnung_id, v.abzugsbetrag_netto || 0);
    }
}

function initDb() {
    createSchema(db);
    runMigrations(db);
    seedDefaultData(db);
}

// Utility wrappers exposing Promises to conform to the previous API signature
const dbQuery = async (sql, params = []) => {
    return db.prepare(sql).all(params);
};

const dbRun = async (sql, params = []) => {
    const info = db.prepare(sql).run(params);
    return { id: info.lastInsertRowid, changes: info.changes };
};

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

// --- Dauerrechnungen F2: Nummernkreis (Spiegel js/editor.js extractLaufendeNummer + INV-Vergabe) ---
function extractLaufendeNummerMain(nr) {
    const groups = String(nr || '').match(/\d+/g);
    return (groups && groups.length > 0) ? (parseInt(groups[groups.length - 1], 10) || 0) : 0;
}

function generateNaechsteRechnungsNr() {
    const jahr = new Date().getFullYear();
    const rows = db.prepare("SELECT nr FROM dokumente WHERE type='rechnung'").all();
    const maxNr = rows.reduce((max, r) => Math.max(max, extractLaufendeNummerMain(r.nr)), 0);
    return `INV-${jahr}-${String(maxNr + 1).padStart(3, '0')}`;
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

const dbAPI = {
    // --- Initial Full State Load (for init.js) ---
    async getFullState() {
        const state = {
            artikel: await dbQuery('SELECT * FROM artikel'),
            kunden: await dbQuery('SELECT * FROM kunden'),
            rechnungen: [],
            angebote: [],
            projekte: await dbQuery('SELECT * FROM projekte'),
            einstellungen: {}
        };

        // Load settings
        const settingsRows = await dbQuery('SELECT * FROM einstellungen');
        settingsRows.forEach(row => state.einstellungen[row.key] = row.value);

        // Load documents
        const docs = await dbQuery('SELECT * FROM dokumente');
        const posRows = await dbQuery('SELECT * FROM positionen');
        const verrechnungenRows = await dbQuery('SELECT * FROM rechnung_verrechnungen');

        docs.forEach(d => {
            d.isLocked = !!d.isLocked; // Convert 1/0 to true/false
            d.positionen = posRows.filter(p => p.dokumentId === d.id);
            d.verrechnungen = verrechnungenRows.filter(v => v.aktuelle_rechnung_id === d.id);
            if (d.type === 'rechnung') {
                state.rechnungen.push(d);
            } else if (d.type === 'angebot') {
                state.angebote.push(d);
            }
        });

        // Load aufmasse
        const aufmassRows = await dbQuery('SELECT * FROM aufmass');
        const aufmassPosRows = await dbQuery('SELECT * FROM aufmass_positionen');
        aufmassRows.forEach(a => {
            a.positionen = aufmassPosRows.filter(p => p.aufmass_id === a.id);
        });
        state.aufmasse = aufmassRows;

        state.objekte = {
            liegenschaften: await dbQuery('SELECT * FROM liegenschaften ORDER BY name ASC'),
            gebaeude: await dbQuery('SELECT * FROM gebaeude ORDER BY name ASC'),
            etagen: await dbQuery('SELECT * FROM etagen ORDER BY COALESCE(ebene_nummer, 999), name ASC'),
            raeume: await dbQuery('SELECT * FROM raeume ORDER BY name ASC')
        };

        const plaene = await dbQuery('SELECT * FROM abrechnungsplaene ORDER BY name ASC');
        const planPosRows = await dbQuery('SELECT * FROM abrechnungsplan_positionen ORDER BY sortier_index ASC');
        plaene.forEach(p => {
            p.positionen = planPosRows.filter(pos => pos.plan_id === p.id);
        });
        state.abrechnungsplaene = plaene;
        state.dauerrechnungLaeufe = await dbQuery('SELECT * FROM dauerrechnung_laeufe ORDER BY rechnungs_datum DESC');

        return state;
    },

    // --- Aufmaß ---
    async getAufmassById(id) {
        const aufmass = db.prepare('SELECT * FROM aufmass WHERE id=?').get(id);
        if (aufmass) {
            aufmass.positionen = db.prepare('SELECT * FROM aufmass_positionen WHERE aufmass_id=? ORDER BY sortier_index ASC').all(id);
        }
        return aufmass || null;
    },

    async getAufmassByPositionId(positionId) {
        if (!positionId) return null;
        const posIdStr = String(positionId);
        const aufmass = db.prepare('SELECT * FROM aufmass WHERE position_id=?').get(posIdStr);
        if (aufmass) {
            aufmass.positionen = db.prepare('SELECT * FROM aufmass_positionen WHERE aufmass_id=? ORDER BY sortier_index ASC').all(aufmass.id);
        }
        return aufmass || null;
    },

    async saveAufmassForPosition(positionId, data) {
        if (!positionId) return null;
        const posIdStr = String(positionId);

        const saveTransaction = db.transaction((aufmassData) => {
            let existing = db.prepare('SELECT id FROM aufmass WHERE position_id=?').get(posIdStr);
            let aufmassId;

            if (existing) {
                aufmassId = existing.id;
                db.prepare('UPDATE aufmass SET titel=?, rechnung_id=?, projekt_id=?, bemerkung=?, einheit=? WHERE id=?')
                  .run(aufmassData.titel || ('Aufmaß Position ' + posIdStr), aufmassData.rechnung_id || null, aufmassData.projekt_id || null, aufmassData.bemerkung || '', aufmassData.einheit || 'm²', aufmassId);
                db.prepare('DELETE FROM aufmass_positionen WHERE aufmass_id=?').run(aufmassId);
            } else {
                const info = db.prepare('INSERT INTO aufmass (position_id, titel, rechnung_id, projekt_id, bemerkung, einheit) VALUES (?, ?, ?, ?, ?, ?)')
                  .run(posIdStr, aufmassData.titel || ('Aufmaß Position ' + posIdStr), aufmassData.rechnung_id || null, aufmassData.projekt_id || null, aufmassData.bemerkung || '', aufmassData.einheit || 'm²');
                aufmassId = info.lastInsertRowid;
            }

            if (aufmassData.positionen && Array.isArray(aufmassData.positionen)) {
                const insertPos = db.prepare('INSERT INTO aufmass_positionen (aufmass_id, raum, bezeichnung, formel, ergebnis, einheit, sortier_index) VALUES (?, ?, ?, ?, ?, ?, ?)');
                aufmassData.positionen.forEach((p, idx) => {
                    const label = p.raum || p.bezeichnung || '';
                    insertPos.run(aufmassId, label, label, p.formel || '', p.ergebnis || 0, p.einheit || 'm²', idx);
                });
            }

            return aufmassId;
        });

        return saveTransaction(data);
    },

    async getAufmasseByRechnungId(rechnungId) {
        const list = db.prepare('SELECT * FROM aufmass WHERE rechnung_id=?').all(rechnungId);
        list.forEach(a => {
            a.positionen = db.prepare('SELECT * FROM aufmass_positionen WHERE aufmass_id=? ORDER BY sortier_index ASC').all(a.id);
        });
        return list;
    },

    async getAufmasseByProjektId(projektId) {
        const list = db.prepare('SELECT * FROM aufmass WHERE projekt_id=?').all(projektId);
        list.forEach(a => {
            a.positionen = db.prepare('SELECT * FROM aufmass_positionen WHERE aufmass_id=? ORDER BY sortier_index ASC').all(a.id);
        });
        return list;
    },

    async saveAufmass(aufmass) {
        const saveTransaction = db.transaction((data) => {
            let aufmassId = data.id;
            if (aufmassId) {
                db.prepare('UPDATE aufmass SET titel=?, rechnung_id=?, projekt_id=?, bemerkung=? WHERE id=?')
                  .run(data.titel, data.rechnung_id || null, data.projekt_id || null, data.bemerkung || '', aufmassId);
                db.prepare('DELETE FROM aufmass_positionen WHERE aufmass_id=?').run(aufmassId);
            } else {
                const info = db.prepare('INSERT INTO aufmass (titel, rechnung_id, projekt_id, bemerkung) VALUES (?, ?, ?, ?)')
                  .run(data.titel, data.rechnung_id || null, data.projekt_id || null, data.bemerkung || '');
                aufmassId = info.lastInsertRowid;
            }

            if (data.positionen && Array.isArray(data.positionen)) {
                const insertPos = db.prepare('INSERT INTO aufmass_positionen (aufmass_id, raum, bezeichnung, formel, ergebnis, einheit, sortier_index) VALUES (?, ?, ?, ?, ?, ?, ?)');
                data.positionen.forEach((p, idx) => {
                    insertPos.run(aufmassId, p.raum || '', p.bezeichnung || '', p.formel || '', p.ergebnis || 0, p.einheit || 'm²', idx);
                });
            }

            return aufmassId;
        });

        return saveTransaction(aufmass);
    },

    async deleteAufmass(id) {
        const delTransaction = db.transaction((aufmassId) => {
            db.prepare('DELETE FROM aufmass_positionen WHERE aufmass_id=?').run(aufmassId);
            db.prepare('DELETE FROM aufmass WHERE id=?').run(aufmassId);
        });
        return delTransaction(id);
    },

    // --- Artikel ---
    async saveArtikel(artikel) {
        if (artikel.id) {
            await dbRun(
                'UPDATE artikel SET name=?, ean=?, beschreibung=?, ek=?, vk=?, mwst=?, bestand=?, lieferant=?, katalog=?, ist_bauleistung=?, kostenart=?, lohnanteil_prozent=? WHERE id=?',
                [artikel.name, artikel.ean, artikel.beschreibung, artikel.ek, artikel.vk, artikel.mwst, artikel.bestand, artikel.lieferant, artikel.katalog, artikel.ist_bauleistung || 0, artikel.kostenart || 'MATERIAL', artikel.lohnanteil_prozent || 0, artikel.id]
            );
            return artikel.id;
        } else {
            const res = await dbRun(
                'INSERT INTO artikel (name, ean, beschreibung, ek, vk, mwst, bestand, lieferant, katalog, ist_bauleistung, kostenart, lohnanteil_prozent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [artikel.name, artikel.ean, artikel.beschreibung, artikel.ek, artikel.vk, artikel.mwst, artikel.bestand, artikel.lieferant, artikel.katalog, artikel.ist_bauleistung || 0, artikel.kostenart || 'MATERIAL', artikel.lohnanteil_prozent || 0]
            );
            return res.id;
        }
    },
    async deleteArtikel(id) {
        return await dbRun('DELETE FROM artikel WHERE id=?', [id]);
    },

    // --- Kunden ---
    async saveKunde(kunde) {
        // § 48b: sec48b_valid_until ist fachlich die Gültigkeit der Freistellungsbescheinigung;
        // falls nicht explizit gesetzt, wird sie aus freistellung_gueltig_bis gespiegelt.
        const sec48bValidUntil = kunde.sec48b_valid_until !== undefined ? kunde.sec48b_valid_until : (kunde.freistellung_gueltig_bis || null);
        if (kunde.id) {
            await dbRun(
                'UPDATE kunden SET kundennummer=?, name=?, adresse=?, plz=?, ort=?, telefon=?, email=?, ustId=?, ist_bauleistender_13b=?, ust_1_tg_gueltig_bis=?, hat_freistellungsbescheinigung=?, freistellung_gueltig_bis=?, ist_umsatzsteuerfreie_vermietung=?, customer_type=?, leitweg_id=?, peppol_id=?, buyer_reference=?, tax_number=?, sec48b_status=?, sec48b_certificate_path=?, is_subcontractor=?, sec48b_valid_until=? WHERE id=?',
                [kunde.kundennummer, kunde.name, kunde.adresse, kunde.plz, kunde.ort, kunde.telefon, kunde.email, kunde.ustId, kunde.ist_bauleistender_13b || 0, kunde.ust_1_tg_gueltig_bis, kunde.hat_freistellungsbescheinigung || 0, kunde.freistellung_gueltig_bis, kunde.ist_umsatzsteuerfreie_vermietung || 0, kunde.customer_type || 'B2C', kunde.leitweg_id || null, kunde.peppol_id || null, kunde.buyer_reference || null, kunde.tax_number || null, kunde.sec48b_status || 'NONE', kunde.sec48b_certificate_path || null, kunde.is_subcontractor ? 1 : 0, sec48bValidUntil, kunde.id]
            );
            return kunde.id;
        } else {
            // Generate sequence if needed
            let knr = kunde.kundennummer;
            if (!knr) {
                const row = await dbQuery('SELECT MAX(id) as mx FROM kunden');
                const nextId = (row && row[0] && row[0].mx) ? row[0].mx + 1 : 1;
                knr = `KD-${1000 + nextId}`;
            }

            const res = await dbRun(
                'INSERT INTO kunden (kundennummer, name, adresse, plz, ort, telefon, email, ustId, ist_bauleistender_13b, ust_1_tg_gueltig_bis, hat_freistellungsbescheinigung, freistellung_gueltig_bis, ist_umsatzsteuerfreie_vermietung, customer_type, leitweg_id, peppol_id, buyer_reference, tax_number, sec48b_status, sec48b_certificate_path, is_subcontractor, sec48b_valid_until, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                [knr, kunde.name, kunde.adresse, kunde.plz, kunde.ort, kunde.telefon, kunde.email, kunde.ustId, kunde.ist_bauleistender_13b || 0, kunde.ust_1_tg_gueltig_bis, kunde.hat_freistellungsbescheinigung || 0, kunde.freistellung_gueltig_bis, kunde.ist_umsatzsteuerfreie_vermietung || 0, kunde.customer_type || 'B2C', kunde.leitweg_id || null, kunde.peppol_id || null, kunde.buyer_reference || null, kunde.tax_number || null, kunde.sec48b_status || 'NONE', kunde.sec48b_certificate_path || null, kunde.is_subcontractor ? 1 : 0, sec48bValidUntil]
            );
            return res.id;
        }
    },
    async deleteKunde(id) {
        return await dbRun('DELETE FROM kunden WHERE id=?', [id]);
    },

    // --- Kunden (Bulk Save) ---
    async bulkSaveKunden(kunden) {
        if (!kunden || !Array.isArray(kunden) || kunden.length === 0) return [];

        const bulkTransaction = db.transaction((kundenList) => {
            const updateStmt = db.prepare('UPDATE kunden SET kundennummer=?, name=?, adresse=?, plz=?, ort=?, telefon=?, email=?, ustId=?, ist_bauleistender_13b=?, ust_1_tg_gueltig_bis=?, hat_freistellungsbescheinigung=?, freistellung_gueltig_bis=?, ist_umsatzsteuerfreie_vermietung=?, customer_type=?, leitweg_id=?, peppol_id=?, buyer_reference=?, tax_number=?, sec48b_status=?, sec48b_certificate_path=?, is_subcontractor=?, sec48b_valid_until=? WHERE id=?');
            const insertStmt = db.prepare('INSERT INTO kunden (kundennummer, name, adresse, plz, ort, telefon, email, ustId, ist_bauleistender_13b, ust_1_tg_gueltig_bis, hat_freistellungsbescheinigung, freistellung_gueltig_bis, ist_umsatzsteuerfreie_vermietung, customer_type, leitweg_id, peppol_id, buyer_reference, tax_number, sec48b_status, sec48b_certificate_path, is_subcontractor, sec48b_valid_until, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');

            const ids = [];
            for (const k of kundenList) {
                const sec48bValidUntil = k.sec48b_valid_until !== undefined ? k.sec48b_valid_until : (k.freistellung_gueltig_bis || null);
                if (k.id) {
                    updateStmt.run(k.kundennummer, k.name, k.adresse, k.plz, k.ort, k.telefon, k.email, k.ustId, k.ist_bauleistender_13b || 0, k.ust_1_tg_gueltig_bis, k.hat_freistellungsbescheinigung || 0, k.freistellung_gueltig_bis, k.ist_umsatzsteuerfreie_vermietung || 0, k.customer_type || 'B2C', k.leitweg_id || null, k.peppol_id || null, k.buyer_reference || null, k.tax_number || null, k.sec48b_status || 'NONE', k.sec48b_certificate_path || null, k.is_subcontractor ? 1 : 0, sec48bValidUntil, k.id);
                    ids.push(k.id);
                } else {
                    let knr = k.kundennummer;
                    if (!knr) {
                        const row = db.prepare('SELECT MAX(id) as mx FROM kunden').get();
                        const nextId = (row && row.mx) ? row.mx + 1 : 1;
                        knr = `KD-${1000 + nextId}`;
                    }
                    const res = insertStmt.run(knr, k.name, k.adresse, k.plz, k.ort, k.telefon, k.email, k.ustId, k.ist_bauleistender_13b || 0, k.ust_1_tg_gueltig_bis, k.hat_freistellungsbescheinigung || 0, k.freistellung_gueltig_bis, k.ist_umsatzsteuerfreie_vermietung || 0, k.customer_type || 'B2C', k.leitweg_id || null, k.peppol_id || null, k.buyer_reference || null, k.tax_number || null, k.sec48b_status || 'NONE', k.sec48b_certificate_path || null, k.is_subcontractor ? 1 : 0, sec48bValidUntil);
                    ids.push(res.lastInsertRowid);
                }
            }
            return ids;
        });

        return bulkTransaction(kunden);
    },

    // --- Dokumente (Rechnungen/Angebote) ---
    async saveDocument(doc) {
        const requestedLockedInt = doc.isLocked ? 1 : 0;

        // Wrap the document and position saving in a transaction for data integrity
        const saveTransaction = db.transaction((d) => applyDocumentWrite(d, requestedLockedInt));

        return saveTransaction(doc);
    },


    // --- Dokumente (Bulk Save) ---
    async bulkSaveDocuments(docs) {
        if (!docs || !Array.isArray(docs) || docs.length === 0) return [];

        const bulkTransaction = db.transaction((docsList) => {
            const updateStmt = db.prepare('UPDATE dokumente SET type=?, nr=?, datum=?, faellig=?, kundeId=?, projektId=?, status=?, isLocked=?, netto=?, steuer=?, brutto=?, globalRabattAbzug=?, globalRabattType=?, globalRabattValue=?, anzahlung=?, mahnungLevel=?, mahnungDatum=?, mahnungGebuehr=?, eingabemodus=?, vortext=?, fusstext=?, leistungszeitraum_von=?, leistungszeitraum_bis=?, baustellen_adresse=?, vob_vereinbart=?, ist_privatkunde=?, unterliegt_bauabzugsteuer=?, bauabzugsteuer_betrag=?, ausweis_35a_erforderlich=?, summe_lohnkosten_brutto=?, rechnungsart=?, kumulierte_leistung_netto=?, sicherheitseinbehalt=?, unterliegt_13b=?, leitweg_id=?, buyer_reference=?, objekt_typ=?, objekt_id=?, sha256_hash=? WHERE id=?');
            const insertDocStmt = db.prepare('INSERT INTO dokumente (type, nr, datum, faellig, kundeId, projektId, status, isLocked, netto, steuer, brutto, globalRabattAbzug, globalRabattType, globalRabattValue, anzahlung, eingabemodus, vortext, fusstext, leistungszeitraum_von, leistungszeitraum_bis, baustellen_adresse, vob_vereinbart, ist_privatkunde, unterliegt_bauabzugsteuer, bauabzugsteuer_betrag, ausweis_35a_erforderlich, summe_lohnkosten_brutto, rechnungsart, kumulierte_leistung_netto, sicherheitseinbehalt, unterliegt_13b, leitweg_id, buyer_reference, objekt_typ, objekt_id, sha256_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            const deletePosStmt = db.prepare('DELETE FROM positionen WHERE dokumentId=?');
            const deleteVerrechnungStmt = db.prepare('DELETE FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?');
            const insertPosStmt = db.prepare('INSERT INTO positionen (dokumentId, artikelId, name, menge, einheit, preis, ek, mwst, rabatt, steuer_schluessel, is13b, cost_type, oz_code, is_tax_deductible_35a) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            const restoreStockStmt = db.prepare('UPDATE artikel SET bestand = bestand + ? WHERE id=?');
            const deductStockStmt = db.prepare('UPDATE artikel SET bestand = bestand - ? WHERE id=?');

            const docIds = [];

            for (const d of docsList) {
                let docId = d.id;
                let existing = null;
                let action = 'ERSTELLT';

                // GoBD: Inhalts-Hash konsistent berechnen und persistieren
                d.sha256_hash = calculateDocumentContentHash(d);

                if (docId) {
                    existing = getDocumentWithChildren(docId);
                    if (!existing) {
                        throw new Error(`Dokument mit ID ${docId} wurde nicht gefunden.`);
                    }

                    if (existing.isLocked) {
                        // GoBD-Änderungssperre: Entsperren NUR über entsperreBeleg()
                        if (!d.isLocked) {
                            throw new Error(`Beleg ${existing.nr} ist gesperrt (GoBD). Eine Freigabe ist nur über die explizite Funktion 'Beleg entsperren' mit Begründung möglich.`);
                        }
                        // GoBD-Änderungssperre: Nur Buchhaltungs-/Statusfelder änderbar
                        const oldContentHash = calculateDocumentContentHash(existing);
                        const newContentHash = calculateDocumentContentHash(d);
                        if (oldContentHash !== newContentHash) {
                            throw new Error(`Beleg ${existing.nr} ist gesperrt (GoBD-Änderungssperre): Inhaltsfelder dürfen nicht mehr geändert werden. Bitte erstellen Sie eine Stornorechnung/Korrekturrechnung.`);
                        }
                    }

                    updateStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, isLockedInt(d), d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.mahnungLevel || 0, d.mahnungDatum || null, d.mahnungGebuehr || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.objekt_typ || null, d.objekt_id == null ? null : d.objekt_id, d.sha256_hash || null, docId);

                    action = (calculateDocumentContentHash(existing) === calculateDocumentContentHash(d)) ? 'STATUS_GEÄNDERT' : 'GEÄNDERT';

                    if (d.type === 'rechnung') {
                        // Restore stock
                        const oldPositions = db.prepare('SELECT artikelId, menge FROM positionen WHERE dokumentId=?').all(docId);
                        if (oldPositions.length > 0) {
                            const restoreStockMap = new Map();
                            for (const p of oldPositions) {
                                if (p.artikelId) {
                                    restoreStockMap.set(p.artikelId, (restoreStockMap.get(p.artikelId) || 0) + p.menge);
                                }
                            }
                            for (const [artId, qty] of restoreStockMap.entries()) {
                                restoreStockStmt.run(qty, artId);
                            }
                        }
                    }

                    deletePosStmt.run(docId);
                    deleteVerrechnungStmt.run(docId);
                } else {
                    const res = insertDocStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, isLockedInt(d), d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.objekt_typ || null, d.objekt_id == null ? null : d.objekt_id, d.sha256_hash || null);
                    docId = res.lastInsertRowid;
                }

                if (d.positionen && d.positionen.length > 0) {
                    const stockDeductionMap = new Map();

                    for (const p of d.positionen) {
                        insertPosStmt.run(docId, p.artikelId || null, p.name || null, p.menge, p.einheit || 'Stk.', p.preis, p.ek || 0, p.mwst, p.rabatt || 0, p.steuer_schluessel || null, p.is13b ? 1 : 0, p.cost_type || 'MATERIAL', p.oz_code || null, p.is_tax_deductible_35a ? 1 : 0);

                        if (d.type === 'rechnung' && p.artikelId) {
                            stockDeductionMap.set(p.artikelId, (stockDeductionMap.get(p.artikelId) || 0) + p.menge);
                        }
                    }

                    if (stockDeductionMap.size > 0) {
                        for (const [artId, qty] of stockDeductionMap.entries()) {
                            deductStockStmt.run(qty, artId);
                        }
                    }
                }
                
                insertVerrechnungenGuarded(docId, d.verrechnungen);

                // GoBD: Audit-Eintrag INNERHALB derselben Transaktion
                appendAuditLog({
                    entityType: 'DOCUMENT',
                    entityId: docId,
                    action,
                    details: {
                        nr: d.nr,
                        type: d.type,
                        status: d.status,
                        vorherigerStatus: existing ? existing.status : null,
                        isLocked: isLockedInt(d) === 1,
                        brutto: d.brutto || 0,
                        sha256_hash: d.sha256_hash
                    }
                });

                docIds.push(docId);
            }
            return docIds;
        });

        return bulkTransaction(docs);
    },

    async deleteDocument(id) {
        const delTransaction = db.transaction((docId) => {
            // SELECT fetches only strictly necessary columns.
            const doc = db.prepare('SELECT type, nr, status, isLocked FROM dokumente WHERE id=?').get(docId);
            if (!doc) return 0;

            // GoBD-Löschsperre: Gesperrte Belege dürfen nicht gelöscht werden
            if (doc.isLocked) {
                throw new Error(`Beleg ${doc.nr} ist gesperrt (GoBD-Löschsperre) und kann nicht gelöscht werden. Bitte verwenden Sie eine Stornorechnung.`);
            }

            if (doc.type === 'rechnung') {
                // Restore stock: Group by artikelId in memory to avoid N+1 and slow subqueries.
                // Node-level loop is executed within a transaction, making it safe and highly optimized.
                const positions = db.prepare('SELECT artikelId, menge FROM positionen WHERE dokumentId=?').all(docId);
                if (positions.length > 0) {
                    const restoreStockMap = new Map();
                    for (const p of positions) {
                        if (p.artikelId) {
                            restoreStockMap.set(p.artikelId, (restoreStockMap.get(p.artikelId) || 0) + p.menge);
                        }
                    }
                    const restoreStockStmt = db.prepare('UPDATE artikel SET bestand = bestand + ? WHERE id=?');
                    // OPTIMIZATION NOTE:
                    // This node-level loop uses in-memory JS Map aggregation and executes
                    // individual prepared UPDATE statements inside a single SQLite transaction.
                    // This prevents N+1 queries and avoids the overhead of complex dynamic SQL strings.
                    for (const [artId, qty] of restoreStockMap.entries()) {
                        restoreStockStmt.run(qty, artId);
                    }
                }
            }
            db.prepare('DELETE FROM positionen WHERE dokumentId=?').run(docId);
            db.prepare('DELETE FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?').run(docId);
            db.prepare('DELETE FROM dokumente WHERE id=?').run(docId);

            // GoBD: Audit-Eintrag INNERHALB derselben Transaktion
            appendAuditLog({
                entityType: 'DOCUMENT',
                entityId: docId,
                action: 'GELÖSCHT',
                details: { nr: doc.nr, type: doc.type, status: doc.status }
            });
        });
        return delTransaction(id);
    },

    // --- GoBD: Schmaler Status-/Buchhaltungspfad (auch für gesperrte Belege) ---
    async updateDocumentStatus(id, patch = {}) {
        if (typeof id !== 'number') throw new Error('Ungültige Dokumenten-ID');
        const allowedKeys = ['status', 'faellig'];
        const keys = Object.keys(patch).filter(k => allowedKeys.includes(k) && patch[k] !== undefined);
        if (keys.length === 0) {
            throw new Error('updateDocumentStatus: Keine gültigen Felder übergeben (erlaubt: status, faellig).');
        }

        const tx = db.transaction((docId, changes) => {
            const doc = db.prepare('SELECT id, nr, status, faellig FROM dokumente WHERE id=?').get(docId);
            if (!doc) throw new Error(`Dokument mit ID ${docId} wurde nicht gefunden.`);

            const setClauses = keys.map(k => `${k}=?`);
            const values = keys.map(k => changes[k]);
            values.push(docId);
            db.prepare(`UPDATE dokumente SET ${setClauses.join(', ')} WHERE id=?`).run(...values);

            // GoBD: Status-/Fälligkeitsänderungen sind an gesperrten Belegen erlaubt,
            // werden aber lückenlos protokolliert.
            appendAuditLog({
                entityType: 'DOCUMENT',
                entityId: docId,
                action: 'STATUS_GEÄNDERT',
                details: {
                    nr: doc.nr,
                    vorherigerStatus: doc.status,
                    neuerStatus: changes.status !== undefined ? changes.status : doc.status,
                    altesZahlungsziel: doc.faellig || null,
                    neuesZahlungsziel: changes.faellig !== undefined ? changes.faellig : (doc.faellig || null)
                }
            });
            return { success: true, id: docId };
        });
        return tx(id, patch);
    },

    // --- GoBD: Expliziter Freigabe-Weg (isLocked true -> false), audit-pflichtig ---
    async entsperreBeleg(id, grund) {
        if (typeof id !== 'number') throw new Error('Ungültige Dokumenten-ID');
        if (!grund || typeof grund !== 'string' || !grund.trim()) {
            throw new Error('Entsperren ohne Begründung ist nicht erlaubt (GoBD-Auditpflicht).');
        }

        const tx = db.transaction((docId, begruendung) => {
            const doc = db.prepare('SELECT id, nr, status FROM dokumente WHERE id=?').get(docId);
            if (!doc) throw new Error(`Dokument mit ID ${docId} wurde nicht gefunden.`);

            const info = db.prepare('UPDATE dokumente SET isLocked=0 WHERE id=? AND isLocked=1').run(docId);
            if (info.changes === 0) {
                return { success: true, id: docId, alreadyUnlocked: true };
            }

            appendAuditLog({
                entityType: 'DOCUMENT',
                entityId: docId,
                action: 'ENTSPERRT',
                details: { nr: doc.nr, status: doc.status, grund: begruendung }
            });
            return { success: true, id: docId, alreadyUnlocked: false };
        });
        return tx(id, grund.trim());
    },

    // --- Atomares Storno: Original-Status + Gutschrift in EINER Transaktion ---
    // Schlägt ein Schritt fehl, wird BEIDES zurückgerollt (kein halber Zustand
    // "Original storniert, aber ohne Gutschrift").
    async storniereRechnung(updatedOriginal, stornoDoc) {
        if (!updatedOriginal || updatedOriginal.id == null) {
            throw new Error('Storno: Original-Rechnung bzw. ID fehlt.');
        }
        if (!stornoDoc || !stornoDoc.nr) {
            throw new Error('Storno: Die Gutschrift benötigt eine gültige Belegnummer.');
        }

        const tx = db.transaction((origPatch, storno) => {
            const orig = db.prepare('SELECT id, nr, status FROM dokumente WHERE id = ?').get(origPatch.id);
            if (!orig) throw new Error(`Dokument mit ID ${origPatch.id} wurde nicht gefunden.`);

            // 1. Original über den schmalen Status-Pfad setzen (audit-protokolliert,
            //    auch an gesperrten Belegen erlaubt - GoBD).
            const neuerStatus = origPatch.status || 'Storniert';
            db.prepare('UPDATE dokumente SET status = ? WHERE id = ?').run(neuerStatus, orig.id);
            appendAuditLog({
                entityType: 'DOCUMENT',
                entityId: orig.id,
                action: 'STATUS_GEÄNDERT',
                details: {
                    nr: orig.nr,
                    vorherigerStatus: orig.status,
                    neuerStatus
                }
            });

            // 2. Gutschrift in derselben Transaktion anlegen (inkl. Audit).
            return applyDocumentWrite(storno, storno.isLocked ? 1 : 0);
        });

        const stornoId = tx(updatedOriginal, stornoDoc);
        return { success: true, originalId: updatedOriginal.id, stornoId };
    },

    // --- GoBD: Prüfung der Audit-Hashkette ---
    verifiziereAuditKette() {
        return auditLogger.verifiziereAuditKette();
    },

    // --- Aufmaßcenter (REB 23.003 & DA11) ---
    async getAufmassBlaetter(projectId) {
        const blaetter = await dbQuery('SELECT * FROM aufmass_blaetter WHERE project_id = ? ORDER BY id ASC', [projectId]);
        for (const blatt of blaetter) {
            blatt.zeilen = await dbQuery('SELECT * FROM aufmass_zeilen WHERE blatt_id = ? ORDER BY zeilen_nr ASC', [blatt.id]);
        }
        return blaetter;
    },

    async saveAufmassBlatt(blattData, zeilen = []) {
        const tx = db.transaction((b, zList) => {
            let blattId = b.id;
            if (blattId) {
                db.prepare('UPDATE aufmass_blaetter SET blatt_nummer=?, titel=?, status=?, invoice_id=? WHERE id=?')
                  .run(b.blatt_nummer, b.titel, b.status || 'DRAFT', b.invoice_id || null, blattId);
                db.prepare('DELETE FROM aufmass_zeilen WHERE blatt_id=?').run(blattId);
            } else {
                const info = db.prepare('INSERT INTO aufmass_blaetter (project_id, invoice_id, blatt_nummer, titel, status) VALUES (?, ?, ?, ?, ?)')
                               .run(b.project_id, b.invoice_id || null, b.blatt_nummer, b.titel, b.status || 'DRAFT');
                blattId = info.lastInsertRowid;
            }

            const insertZeile = db.prepare(`
                INSERT INTO aufmass_zeilen (blatt_id, oz_code, zeilen_nr, bezeichnung, formel_reb, rechenansatz, ergebnis, einheit, vorzeichen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            let idx = 1;
            for (const z of zList) {
                insertZeile.run(
                    blattId,
                    z.oz_code || '01.01.0010',
                    z.zeilen_nr || idx++,
                    z.bezeichnung || '',
                    z.formel_reb || '91',
                    z.rechenansatz || '',
                    z.ergebnis !== undefined ? z.ergebnis : 0,
                    z.einheit || 'm²',
                    z.vorzeichen !== undefined ? z.vorzeichen : 1
                );
            }
            return blattId;
        });
        return tx(blattData, zeilen);
    },

    async deleteAufmassBlatt(blattId) {
        const tx = db.transaction((id) => {
            db.prepare('DELETE FROM aufmass_zeilen WHERE blatt_id=?').run(id);
            db.prepare('DELETE FROM aufmass_blaetter WHERE id=?').run(id);
        });
        return tx(blattId);
    },

    async mergeSchlussaufmass(projectId) {
        // Aggregiert alle Aufmaßzeilen aller freigegebenen/verifizierten Blätter
        const rows = await dbQuery(`
            SELECT z.oz_code, z.einheit, SUM(z.ergebnis * z.vorzeichen) as summe_menge
            FROM aufmass_zeilen z
            JOIN aufmass_blaetter b ON z.blatt_id = b.id
            WHERE b.project_id = ? AND b.status IN ('VERIFIED', 'FINALIZED', 'SUBMITTED', 'DRAFT')
            GROUP BY z.oz_code, z.einheit
        `, [projectId]);
        return rows;
    },

    // --- Nachtragsverwaltung (VOB/B) ---
    async getNachtraege(projectId) {
        const rows = await dbQuery('SELECT * FROM nachtraege WHERE project_id = ? ORDER BY id ASC', [projectId]);
        for (const n of rows) {
            n.positionen = await dbQuery('SELECT * FROM nachtrag_positionen WHERE nachtrag_id = ? ORDER BY id ASC', [n.id]);
        }
        return rows;
    },

    async saveNachtrag(nachtragData, positionen = []) {
        const tx = db.transaction((n, posList) => {
            let nId = n.id;
            let sumNetto = 0;
            for (const p of posList) {
                sumNetto += (p.menge || 0) * (p.einheitspreis || 0);
            }
            const sumBrutto = sumNetto * 1.19;

            if (nId) {
                db.prepare(`
                    UPDATE nachtraege 
                    SET nachtrag_nr=?, titel=?, beschreibung=?, rechtsgrundlage=?, summe_netto=?, summe_brutto=?, status=?, eingereicht_am=?, entschieden_am=?, begruendung=?
                    WHERE id=?
                `).run(
                    n.nachtrag_nr, n.titel, n.beschreibung || '', n.rechtsgrundlage || 'VOB_2_6',
                    sumNetto, sumBrutto, n.status || 'EINGEREICHT', n.eingereicht_am || null, n.entschieden_am || null, n.begruendung || '', nId
                );
                db.prepare('DELETE FROM nachtrag_positionen WHERE nachtrag_id=?').run(nId);
            } else {
                const info = db.prepare(`
                    INSERT INTO nachtraege (project_id, nachtrag_nr, titel, beschreibung, rechtsgrundlage, summe_netto, summe_brutto, status, eingereicht_am, entschieden_am, begruendung)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    n.project_id, n.nachtrag_nr, n.titel, n.beschreibung || '', n.rechtsgrundlage || 'VOB_2_6',
                    sumNetto, sumBrutto, n.status || 'EINGEREICHT', n.eingereicht_am || null, n.entschieden_am || null, n.begruendung || ''
                );
                nId = info.lastInsertRowid;
            }

            const insertPos = db.prepare(`
                INSERT INTO nachtrag_positionen (nachtrag_id, oz_code, kurztext, langtext, menge, einheit, einheitspreis, gesamtpreis, cost_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const p of posList) {
                const gp = (p.menge || 0) * (p.einheitspreis || 0);
                insertPos.run(
                    nId,
                    p.oz_code || '',
                    p.kurztext || '',
                    p.langtext || '',
                    p.menge || 0,
                    p.einheit || 'Stk.',
                    p.einheitspreis || 0,
                    gp,
                    p.cost_type || 'MATERIAL'
                );
            }
            return nId;
        });
        return tx(nachtragData, positionen);
    },

    async updateNachtragStatus(nachtragId, status) {
        const decidedDate = (status === 'GENEHMIGT' || status === 'ABGELEHNT') ? new Date().toISOString().split('T')[0] : null;
        await dbRun('UPDATE nachtraege SET status = ?, entschieden_am = COALESCE(?, entschieden_am) WHERE id = ?', [status, decidedDate, nachtragId]);
        return { success: true };
    },

    async deleteNachtrag(nachtragId) {
        const tx = db.transaction((id) => {
            db.prepare('DELETE FROM nachtrag_positionen WHERE nachtrag_id=?').run(id);
            db.prepare('DELETE FROM nachtraege WHERE id=?').run(id);
        });
        return tx(nachtragId);
    },

    // --- Bautagebuch ---
    async getBautagebuch(projectId) {
        return await dbQuery('SELECT * FROM bautagebuch WHERE project_id = ? ORDER BY datum DESC, bericht_nr DESC', [projectId]);
    },

    async saveBautagebuch(data) {
        if (data.id) {
            await dbRun(`
                UPDATE bautagebuch 
                SET bericht_nr=?, datum=?, wetter=?, temperatur_min=?, temperatur_max=?, personal_eigen_anzahl=?, personal_eigen_stunden=?,
                    personal_sub_json=?, geraete_json=?, tagesbericht=?, vorkommnisse_behinderungen=?, unterzeichnet_bauleiter=?, fotos_json=?
                WHERE id=?
            `, [
                data.bericht_nr || 1, data.datum, data.wetter || '', data.temperatur_min || null, data.temperatur_max || null,
                data.personal_eigen_anzahl || 0, data.personal_eigen_stunden || 0,
                typeof data.personal_sub_json === 'object' ? JSON.stringify(data.personal_sub_json) : (data.personal_sub_json || '[]'),
                typeof data.geraete_json === 'object' ? JSON.stringify(data.geraete_json) : (data.geraete_json || '[]'),
                data.tagesbericht, data.vorkommnisse_behinderungen || '', data.unterzeichnet_bauleiter || 0,
                typeof data.fotos_json === 'object' ? JSON.stringify(data.fotos_json) : (data.fotos_json || '[]'),
                data.id
            ]);
            return data.id;
        } else {
            const res = await dbRun(`
                INSERT INTO bautagebuch (project_id, bericht_nr, datum, wetter, temperatur_min, temperatur_max, personal_eigen_anzahl, personal_eigen_stunden, personal_sub_json, geraete_json, tagesbericht, vorkommnisse_behinderungen, unterzeichnet_bauleiter, fotos_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.project_id, data.bericht_nr || 1, data.datum, data.wetter || '', data.temperatur_min || null, data.temperatur_max || null,
                data.personal_eigen_anzahl || 0, data.personal_eigen_stunden || 0,
                typeof data.personal_sub_json === 'object' ? JSON.stringify(data.personal_sub_json) : (data.personal_sub_json || '[]'),
                typeof data.geraete_json === 'object' ? JSON.stringify(data.geraete_json) : (data.geraete_json || '[]'),
                data.tagesbericht, data.vorkommnisse_behinderungen || '', data.unterzeichnet_bauleiter || 0,
                typeof data.fotos_json === 'object' ? JSON.stringify(data.fotos_json) : (data.fotos_json || '[]')
            ]);
            return res.id;
        }
    },

    async deleteBautagebuch(id) {
        return await dbRun('DELETE FROM bautagebuch WHERE id=?', [id]);
    },

    // --- Abnahmeprotokolle (VOB/B § 12) ---
    async getAbnahmeprotokolle(projectId) {
        return await dbQuery('SELECT * FROM abnahmeprotokolle WHERE project_id = ? ORDER BY datum DESC', [projectId]);
    },

    async saveAbnahmeprotokoll(data) {
        if (data.id) {
            await dbRun(`
                UPDATE abnahmeprotokolle 
                SET datum=?, ort=?, auftraggeber_vertreter=?, auftragnehmer_vertreter=?, abnahme_status=?, gewaehrleistung_beginn=?, gewaehrleistung_ende=?, gewaehrleistung_jahre=?, sicherheitseinbehalt_prozent=?, maengel_json=?, unterschrift_ag_data=?, unterschrift_an_data=?, pdf_pfad=?
                WHERE id=?
            `, [
                data.datum, data.ort, data.auftraggeber_vertreter, data.auftragnehmer_vertreter, data.abnahme_status,
                data.gewaehrleistung_beginn, data.gewaehrleistung_ende, data.gewaehrleistung_jahre || 4, data.sicherheitseinbehalt_prozent || 5.0,
                typeof data.maengel_json === 'object' ? JSON.stringify(data.maengel_json) : (data.maengel_json || '[]'),
                data.unterschrift_ag_data || '', data.unterschrift_an_data || '', data.pdf_pfad || '', data.id
            ]);
            return data.id;
        } else {
            const res = await dbRun(`
                INSERT INTO abnahmeprotokolle (project_id, datum, ort, auftraggeber_vertreter, auftragnehmer_vertreter, abnahme_status, gewaehrleistung_beginn, gewaehrleistung_ende, gewaehrleistung_jahre, sicherheitseinbehalt_prozent, maengel_json, unterschrift_ag_data, unterschrift_an_data, pdf_pfad)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.project_id, data.datum, data.ort, data.auftraggeber_vertreter, data.auftragnehmer_vertreter, data.abnahme_status,
                data.gewaehrleistung_beginn, data.gewaehrleistung_ende, data.gewaehrleistung_jahre || 4, data.sicherheitseinbehalt_prozent || 5.0,
                typeof data.maengel_json === 'object' ? JSON.stringify(data.maengel_json) : (data.maengel_json || '[]'),
                data.unterschrift_ag_data || '', data.unterschrift_an_data || '', data.pdf_pfad || ''
            ]);
            return res.id;
        }
    },

    // --- Eingangsrechnungen & Nachkalkulation ---
    async getEingangsrechnungen(projectId = null) {
        if (projectId) {
            return await dbQuery(`
                SELECT e.*, k.name as lieferant_name, k.sec48b_status, k.sec48b_valid_until
                FROM eingangsrechnungen e
                LEFT JOIN kunden k ON e.lieferant_id = k.id
                WHERE e.project_id = ?
                ORDER BY e.rechnungs_datum DESC
            `, [projectId]);
        }
        return await dbQuery(`
            SELECT e.*, k.name as lieferant_name, k.sec48b_status, k.sec48b_valid_until, p.name as projekt_name
            FROM eingangsrechnungen e
            LEFT JOIN kunden k ON e.lieferant_id = k.id
            LEFT JOIN projekte p ON e.project_id = p.id
            ORDER BY e.rechnungs_datum DESC
        `);
    },

    async saveEingangsrechnung(data) {
        // § 48b EStG Check
        let bauabzug = 0;
        let sec48bChecked = 0;
        if (data.lieferant_id) {
            const lieferant = db.prepare('SELECT * FROM kunden WHERE id = ?').get(data.lieferant_id);
            if (lieferant && lieferant.is_subcontractor) {
                sec48bChecked = 1;
                const today = new Date().toISOString().split('T')[0];
                const isValid = lieferant.sec48b_status === 'VALID' && (!lieferant.sec48b_valid_until || lieferant.sec48b_valid_until >= today);
                if (!isValid && data.kostenart === 'SUBCONTRACTOR') {
                    // 15 % Bauabzugsteuer einbehalten
                    bauabzug = Math.round((data.betrag_brutto || (data.betrag_netto * 1.19)) * 0.15 * 100) / 100;
                }
            }
        }

        const ust = data.betrag_ust !== undefined ? data.betrag_ust : Math.round(data.betrag_netto * ((data.steuersatz || 19) / 100) * 100) / 100;
        const brutto = data.betrag_brutto !== undefined ? data.betrag_brutto : Math.round((data.betrag_netto + ust) * 100) / 100;

        if (data.id) {
            await dbRun(`
                UPDATE eingangsrechnungen 
                SET project_id=?, lieferant_id=?, rechnungs_nr=?, rechnungs_datum=?, faelligkeits_datum=?, betrag_netto=?, steuersatz=?, betrag_ust=?, betrag_brutto=?, kostenart=?, sec48b_geprueft=?, bauabzugsteuer_einbehalten=?, zahlungs_status=?, bezahlt_am=?, beleg_pfad=?
                WHERE id=?
            `, [
                data.project_id || null, data.lieferant_id || null, data.rechnungs_nr, data.rechnungs_datum, data.faelligkeits_datum,
                data.betrag_netto, data.steuersatz || 19.0, ust, brutto, data.kostenart || 'MATERIAL',
                sec48bChecked, bauabzug, data.zahlungs_status || 'OFFEN', data.bezahlt_am || null, data.beleg_pfad || '', data.id
            ]);
            return { id: data.id, bauabzugsteuer: bauabzug };
        } else {
            const res = await dbRun(`
                INSERT INTO eingangsrechnungen (project_id, lieferant_id, rechnungs_nr, rechnungs_datum, faelligkeits_datum, betrag_netto, steuersatz, betrag_ust, betrag_brutto, kostenart, sec48b_geprueft, bauabzugsteuer_einbehalten, zahlungs_status, bezahlt_am, beleg_pfad)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.project_id || null, data.lieferant_id || null, data.rechnungs_nr, data.rechnungs_datum, data.faelligkeits_datum,
                data.betrag_netto, data.steuersatz || 19.0, ust, brutto, data.kostenart || 'MATERIAL',
                sec48bChecked, bauabzug, data.zahlungs_status || 'OFFEN', data.bezahlt_am || null, data.beleg_pfad || ''
            ]);
            return { id: res.id, bauabzugsteuer: bauabzug };
        }
    },

    async deleteEingangsrechnung(id) {
        return await dbRun('DELETE FROM eingangsrechnungen WHERE id=?', [id]);
    },

    // --- Projekt Controlling / Soll-Ist-Analyse ---
    async getControllingStats(projectId) {
        const projekt = db.prepare('SELECT * FROM projekte WHERE id = ?').get(projectId);
        if (!projekt) return null;

        // 1. Soll-Kosten aus verknüpften Angeboten
        const angebote = db.prepare("SELECT * FROM dokumente WHERE projektId = ? AND type = 'angebot'").all(projectId);
        let sollNetto = 0;
        let sollLohn = 0;
        let sollMaterial = 0;
        let sollGeraet = 0;
        let sollSub = 0;

        for (const ang of angebote) {
            sollNetto += ang.netto || 0;
            const pos = db.prepare('SELECT * FROM positionen WHERE dokumentId = ?').all(ang.id);
            for (const p of pos) {
                const gp = (p.menge || 0) * (p.preis || 0);
                if (p.cost_type === 'LOHN') sollLohn += gp;
                else if (p.cost_type === 'MATERIAL') sollMaterial += gp;
                else if (p.cost_type === 'GERÄT') sollGeraet += gp;
                else sollSub += gp;
            }
        }

        // Falls keine differenzierten Angebotspositionen vorliegen, nutze Projektbudget
        if (sollNetto === 0 && projekt.budget > 0) {
            sollNetto = projekt.budget;
        }

        // 2. Genehmigte Nachträge (Erhöhung des Soll-Auftragsvolumens)
        const nachtraege = db.prepare("SELECT * FROM nachtraege WHERE project_id = ? AND status = 'GENEHMIGT'").all(projectId);
        let nachtragNetto = 0;
        for (const n of nachtraege) {
            nachtragNetto += n.summe_netto || 0;
        }

        // 3. Ist-Kosten aus Eingangsrechnungen
        const eingangsrechnungen = db.prepare('SELECT * FROM eingangsrechnungen WHERE project_id = ?').all(projectId);
        let istMaterial = 0;
        let istSub = 0;
        let istGeraet = 0;
        let istSonstiges = 0;
        let bauabzugsteuerGesamt = 0;

        for (const er of eingangsrechnungen) {
            const netto = er.betrag_netto || 0;
            if (er.kostenart === 'MATERIAL') istMaterial += netto;
            else if (er.kostenart === 'SUBCONTRACTOR') istSub += netto;
            else if (er.kostenart === 'EQUIPMENT') istGeraet += netto;
            else istSonstiges += netto;
            bauabzugsteuerGesamt += er.bauabzugsteuer_einbehalten || 0;
        }

        // 4. Ist-Lohnkosten aus Bautagebuch
        const tagebuch = db.prepare('SELECT SUM(personal_eigen_stunden) as gesamt_stunden FROM bautagebuch WHERE project_id = ?').get(projectId);
        const istLohnStunden = (tagebuch && tagebuch.gesamt_stunden) || 0;
        const stundensatzStd = 55.00; // Kalkulatorischer Standard-Verrechnungssatz
        const istLohn = istLohnStunden * stundensatzStd;

        const istGesamt = istMaterial + istSub + istGeraet + istSonstiges + istLohn;

        // 5. Bisher abgerechneter Umsatz (Ausgangsrechnungen)
        const rechnungen = db.prepare("SELECT * FROM dokumente WHERE projektId = ? AND type = 'rechnung'").all(projectId);
        let istUmsatzNetto = 0;
        for (const r of rechnungen) {
            istUmsatzNetto += r.netto || 0;
        }

        // 6. Kennzahlen
        const gesamtAuftragsvolumen = sollNetto + nachtragNetto;
        const deckungsbeitrag = istUmsatzNetto - istGesamt;
        const margeProzent = istUmsatzNetto > 0 ? Math.round((deckungsbeitrag / istUmsatzNetto) * 1000) / 10 : 0;
        const budgetAuslastungProzent = gesamtAuftragsvolumen > 0 ? Math.round((istGesamt / gesamtAuftragsvolumen) * 1000) / 10 : 0;

        return {
            projektId: projectId,
            projektName: projekt.name,
            gesamtAuftragsvolumen: Math.round(gesamtAuftragsvolumen * 100) / 100,
            sollNetto: Math.round(sollNetto * 100) / 100,
            nachtragNetto: Math.round(nachtragNetto * 100) / 100,
            sollKosten: {
                lohn: Math.round(sollLohn * 100) / 100,
                material: Math.round(sollMaterial * 100) / 100,
                geraet: Math.round(sollGeraet * 100) / 100,
                sub: Math.round(sollSub * 100) / 100
            },
            istKosten: {
                lohn: Math.round(istLohn * 100) / 100,
                lohnStunden: istLohnStunden,
                material: Math.round(istMaterial * 100) / 100,
                subcontractor: Math.round(istSub * 100) / 100,
                geraet: Math.round(istGeraet * 100) / 100,
                sonstiges: Math.round(istSonstiges * 100) / 100,
                gesamt: Math.round(istGesamt * 100) / 100,
                bauabzugsteuer: Math.round(bauabzugsteuerGesamt * 100) / 100
            },
            istUmsatzNetto: Math.round(istUmsatzNetto * 100) / 100,
            deckungsbeitrag: Math.round(deckungsbeitrag * 100) / 100,
            margeProzent,
            budgetAuslastungProzent
        };
    },

    // --- Projekte ---
    async saveProjekt(projekt) {
        if (projekt.id) {
            await dbRun(
                'UPDATE projekte SET name=?, kundeId=?, start=?, ende=?, budget=?, status=?, sicherheitseinbehalt_prozent=? WHERE id=?',
                [projekt.name, projekt.kundeId, projekt.start, projekt.ende, projekt.budget, projekt.status, projekt.sicherheitseinbehalt_prozent || 0, projekt.id]
            );
            return projekt.id;
        } else {
            const res = await dbRun(
                'INSERT INTO projekte (name, kundeId, start, ende, budget, status, sicherheitseinbehalt_prozent) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [projekt.name, projekt.kundeId, projekt.start, projekt.ende, projekt.budget, projekt.status, projekt.sicherheitseinbehalt_prozent || 0]
            );
            return res.id;
        }
    },

    // --- Einstellungen ---
    async saveEinstellung(key, value) {
        await dbRun('INSERT OR REPLACE INTO einstellungen (key, value) VALUES (?, ?)', [key, value]);
    },

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
                db.prepare('UPDATE raeume SET etage_id=?, name=?, raum_nr=?, flaeche=?, einheit=?, raumtyp=?, empfaenger_kunde_id=?, empfaenger_art=?, notizen=?, aktiv=? WHERE id=?')
                  .run(d.etage_id, d.name, d.raum_nr || null, isNaN(flaeche) ? 0 : flaeche, d.einheit || 'm²', d.raumtyp || null, empfaengerKundeId, empfaengerArt, d.notizen || null, d.aktiv === 0 ? 0 : 1, d.id);
                return d.id;
            }
            const res = db.prepare('INSERT INTO raeume (etage_id, name, raum_nr, flaeche, einheit, raumtyp, empfaenger_kunde_id, empfaenger_art, notizen, aktiv) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .run(d.etage_id, d.name, d.raum_nr || null, isNaN(flaeche) ? 0 : flaeche, d.einheit || 'm²', d.raumtyp || null, empfaengerKundeId, empfaengerArt, d.notizen || null, d.aktiv === 0 ? 0 : 1);
            return res.lastInsertRowid;
        });
        return tx(data);
    },

    async deleteRaum(id) {
        const tx = db.transaction((raumId) => {
            const r = db.prepare('SELECT id FROM raeume WHERE id=?').get(raumId);
            if (!r) throw new Error('Raum nicht gefunden.');
            pruefeObjektLvBezug('RAUM', raumId, 'Der Raum');
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
        const ebene = OBJEKT_EBENEN[objektTyp];
        const knoten = db.prepare(`SELECT * FROM ${ebene.tabelle} WHERE id=?`).get(objektId);
        if (!knoten) throw new Error('Objekt nicht gefunden.');

        const gebaeude = objektTyp === 'LIEGENSCHAFT' ? await dbQuery('SELECT * FROM gebaeude WHERE liegenschaft_id=? ORDER BY name ASC', [objektId]) : [];
        const etagen = objektTyp === 'GEBAEUDE'
            ? await dbQuery('SELECT * FROM etagen WHERE gebaeude_id=? ORDER BY COALESCE(ebene_nummer, 999), name ASC', [objektId])
            : (objektTyp === 'LIEGENSCHAFT' ? await dbQuery('SELECT e.* FROM etagen e JOIN gebaeude g ON g.id=e.gebaeude_id WHERE g.liegenschaft_id=? ORDER BY COALESCE(e.ebene_nummer, 999), e.name ASC', [objektId]) : []);
        const raeume = objektTyp === 'ETAGE'
            ? await dbQuery('SELECT * FROM raeume WHERE etage_id=? ORDER BY name ASC', [objektId])
            : await dbQuery('SELECT r.* FROM raeume r ' +
                (objektTyp === 'GEBAEUDE' ? 'JOIN etagen e ON e.id=r.etage_id WHERE e.gebaeude_id=?' :
                 objektTyp === 'LIEGENSCHAFT' ? 'JOIN etagen e ON e.id=r.etage_id JOIN gebaeude g ON g.id=e.gebaeude_id WHERE g.liegenschaft_id=?' :
                 'WHERE r.etage_id=?') + ' ORDER BY r.name ASC', [objektId]);

        const flaecheGesamt = Math.round(raeume.reduce((s, r) => s + (r.einheit === 'm²' ? (parseFloat(r.flaeche) || 0) : 0), 0) * 100) / 100;

        return {
            knoten,
            pfad: baueObjektPfad(objektTyp, objektId),
            empfaenger: loeseObjektEmpfaengerAuf(objektTyp, objektId),
            kinder: { gebaeude, etagen, raeume },
            kennzahlen: {
                flaecheGesamt,
                anzahlRaeume: raeume.length,
                anzahlEtagen: etagen.length,
                anzahlGebaeude: gebaeude.length
            },
            plaene: []
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

    // --- Dauerrechnungen (F2) ---
    async saveAbrechnungsplan(plan, positionen = []) {
        if (!plan || typeof plan !== 'object' || !plan.name || !String(plan.name).trim()) {
            throw new Error('Ungültige Plan-Daten: Name fehlt.');
        }
        if (!['LIEGENSCHAFT', 'GEBAEUDE', 'ETAGE', 'RAUM'].includes(plan.objekt_typ) || plan.objekt_id == null) {
            throw new Error('Ungültige Plan-Daten: Objekt fehlt oder ist ungültig.');
        }
        if (!['MONATLICH', 'QUARTALSWEISE', 'JAEHRLICH', 'WOCHEN_INTERVALL'].includes(plan.rhythmus)) {
            throw new Error('Ungültige Plan-Daten: Rhythmus fehlt oder ist ungültig.');
        }
        if (!plan.start_datum) {
            throw new Error('Ungültige Plan-Daten: Startdatum fehlt.');
        }
        if (plan.rhythmus === 'WOCHEN_INTERVALL' && !(parseInt(plan.intervall_wochen, 10) >= 1)) {
            throw new Error('Wochenintervall benötigt Intervall >= 1.');
        }
        if (plan.rhythmus === 'JAEHRLICH' && !(parseInt(plan.abrechnungsmonat, 10) >= 1 && parseInt(plan.abrechnungsmonat, 10) <= 12)) {
            throw new Error('Jährlicher Rhythmus benötigt Abrechnungsmonat.');
        }
        if (plan.preis_modus === 'POSITIONEN' && (!Array.isArray(positionen) || positionen.length === 0)) {
            throw new Error('POSITIONEN ohne Positionen: Bitte mindestens eine Position hinzufügen.');
        }
        if (plan.preis_modus !== 'POSITIONEN' && !((parseFloat(plan.pauschale_netto) || 0) > 0)) {
            throw new Error('PAUSCHALE ohne Betrag > 0.');
        }

        const heuteIso = new Date().toISOString().split('T')[0];
        const tx = db.transaction((p, posList) => {
            const empfaengerKundeId = Number(p.empfaenger_kunde_id);
            if (!empfaengerKundeId) {
                throw new Error('Kein Rechnungsempfänger ermittelbar – bitte Empfänger am Objekt setzen oder direkt wählen.');
            }

            let planId = p.id || null;
            const colNames = `name, objekt_typ, objekt_id, empfaenger_kunde_id, rhythmus, intervall_wochen, abrechnungstag, abrechnungsmonat, abrechnungs_modus, start_datum, ende_datum, preis_modus, preise_live, pauschale_netto, mwst_satz, zahlungsziel_tage, als_entwurf, aktiv, bemerkung, naechste_lauf_am`;
            const colPlaceholders = `?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`;
            const values = [
                p.name.trim(), p.objekt_typ, Number(p.objekt_id), empfaengerKundeId,
                p.rhythmus,
                p.rhythmus === 'WOCHEN_INTERVALL' ? parseInt(p.intervall_wochen, 10) : null,
                parseInt(p.abrechnungstag, 10) || 1,
                p.rhythmus === 'JAEHRLICH' ? parseInt(p.abrechnungsmonat, 10) : null,
                ['NACHTRAEGLICH', 'VORAUS'].includes(p.abrechnungs_modus) ? p.abrechnungs_modus : 'NACHTRAEGLICH',
                p.start_datum, p.ende_datum || null,
                p.preis_modus === 'POSITIONEN' ? 'POSITIONEN' : 'PAUSCHALE',
                p.preise_live === 1 || p.preise_live === true ? 1 : 0,
                parseFloat(p.pauschale_netto) || 0,
                [0, 7, 19].includes(parseInt(p.mwst_satz, 10)) ? parseInt(p.mwst_satz, 10) : 19,
                parseInt(p.zahlungsziel_tage, 10) >= 0 ? parseInt(p.zahlungsziel_tage, 10) : 14,
                p.als_entwurf === 0 || p.als_entwurf === false ? 0 : 1,
                p.aktiv === 0 ? 0 : 1,
                p.bemerkung || null,
                DauerrechnungController.berechneNaechstenTermin({ ...p, letzte_lauf_am: p.letzte_lauf_am || null }, heuteIso)
            ];

            try {
                if (planId) {
                    const existing = db.prepare('SELECT letzte_lauf_am FROM abrechnungsplaene WHERE id=?').get(planId);
                    if (!existing) throw new Error(`Abrechnungsplan #${planId} wurde nicht gefunden.`);
                    values[values.length - 1] = DauerrechnungController.berechneNaechstenTermin(
                        { ...p, letzte_lauf_am: p.letzte_lauf_am != null ? p.letzte_lauf_am : existing.letzte_lauf_am }, heuteIso);
                    db.prepare(`UPDATE abrechnungsplaene SET ${colNames.split(',').map(c => `${c.trim()}=?`).join(', ')} WHERE id=?`).run(...values, planId);
                } else {
                    const res = db.prepare(`INSERT INTO abrechnungsplaene (${colNames}) VALUES (${colPlaceholders})`).run(...values);
                    planId = res.lastInsertRowid;
                }
            } catch (e) {
                if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    throw new Error('Plan mit diesem Namen existiert für dieses Objekt bereits.');
                }
                throw e;
            }

            db.prepare('DELETE FROM abrechnungsplan_positionen WHERE plan_id=?').run(planId);
            const insertPos = db.prepare('INSERT INTO abrechnungsplan_positionen (plan_id, artikelId, name, menge, einheit, preis, mwst, sortier_index, lv_position_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            (posList || []).forEach((pos, idx) => {
                insertPos.run(
                    planId,
                    pos.artikelId ? Number(pos.artikelId) : null,
                    pos.name || null,
                    parseFloat(pos.menge) || 0,
                    pos.einheit || 'Stk.',
                    parseFloat(pos.preis) || 0,
                    parseInt(pos.mwst, 10) || 0,
                    idx,
                    pos.lv_position_id == null ? null : Number(pos.lv_position_id)
                );
            });

            appendAuditLog({
                entityType: 'ABRECHNUNGSPLAN',
                entityId: planId,
                action: plan.id ? 'GEÄNDERT' : 'ERSTELLT',
                details: { name: p.name.trim(), objektTyp: p.objekt_typ, objektId: Number(p.objekt_id), rhythmus: p.rhythmus, preiseLive: (p.preise_live === 1 || p.preise_live === true) ? 1 : 0 }
            });

            return planId;
        });

        const id = tx(plan, positionen);
        const gespeichert = db.prepare('SELECT naechste_lauf_am FROM abrechnungsplaene WHERE id=?').get(id);
        return { id, naechste_lauf_am: gespeichert ? gespeichert.naechste_lauf_am : null };
    },

    async getAbrechnungsplaene(filter = {}) {
        let rows = await dbQuery('SELECT * FROM abrechnungsplaene ORDER BY name ASC');
        if (filter.objektTyp) rows = rows.filter(p => p.objekt_typ === filter.objektTyp);
        if (filter.objektId != null) rows = rows.filter(p => p.objekt_id === Number(filter.objektId));
        if (filter.aktiv !== undefined && filter.aktiv !== null && filter.aktiv !== '') {
            rows = rows.filter(p => p.aktiv === (Number(filter.aktiv) ? 1 : 0));
        }
        if (filter.nurFaellig) {
            const heuteIso = new Date().toISOString().split('T')[0];
            rows = rows.filter(p => p.aktiv === 1 && p.naechste_lauf_am && p.naechste_lauf_am <= heuteIso);
        }

        const posRows = await dbQuery('SELECT * FROM abrechnungsplan_positionen ORDER BY sortier_index ASC');
        for (const p of rows) {
            p.positionen = posRows.filter(pos => pos.plan_id === p.id);
            p.objektPfad = baueObjektPfad(p.objekt_typ, p.objekt_id);
            const kunde = db.prepare('SELECT id, name FROM kunden WHERE id=?').get(p.empfaenger_kunde_id);
            p.empfaengerName = kunde ? kunde.name : null;
        }
        return rows;
    },

    async deleteAbrechnungsplan(id) {
        const tx = db.transaction((planId) => {
            const plan = db.prepare('SELECT id, name FROM abrechnungsplaene WHERE id=?').get(planId);
            if (!plan) throw new Error('Ungültige Plan-ID');
            const laeufe = db.prepare('SELECT COUNT(*) AS c FROM dauerrechnung_laeufe WHERE plan_id=?').get(planId).c;
            if (laeufe > 0) {
                throw new Error('Plan hat Läufe und kann nicht gelöscht werden – bitte deaktivieren.');
            }
            db.prepare('DELETE FROM abrechnungsplan_positionen WHERE plan_id=?').run(planId);
            db.prepare('DELETE FROM abrechnungsplaene WHERE id=?').run(planId);
            return { changes: 1 };
        });
        return tx(id);
    },

    async updateAbrechnungsplanStatus(id, aktiv) {
        if (typeof id !== 'number') throw new Error('Ungültige Plan-ID');
        const tx = db.transaction((planId, neuerStatus) => {
            const plan = db.prepare('SELECT id, name, aktiv FROM abrechnungsplaene WHERE id=?').get(planId);
            if (!plan) throw new Error('Ungültige Plan-ID');
            db.prepare('UPDATE abrechnungsplaene SET aktiv=? WHERE id=?').run(neuerStatus ? 1 : 0, planId);
            appendAuditLog({
                entityType: 'ABRECHNUNGSPLAN',
                entityId: planId,
                action: neuerStatus ? 'AKTIVIERT' : 'DEAKTIVIERT',
                details: { name: plan.name }
            });
            return { success: true, id: planId };
        });
        return tx(id, !!aktiv);
    },

    async getPlanLaeufe(planId) {
        if (typeof planId !== 'number') throw new Error('Ungültige Plan-ID');
        return await dbQuery(`
            SELECT l.*, d.nr AS dokumentNr, d.brutto AS dokumentBrutto, d.status AS dokumentStatus, d.isLocked AS dokumentLocked
            FROM dauerrechnung_laeufe l
            LEFT JOIN dokumente d ON d.id = l.dokument_id
            WHERE l.plan_id = ?
            ORDER BY l.rechnungs_datum DESC, l.id DESC
        `, [planId]);
    },

    _ladePlanPositionen(planId) {
        return db.prepare('SELECT * FROM abrechnungsplan_positionen WHERE plan_id=? ORDER BY sortier_index ASC').all(planId);
    },

    _ladePlanPositionenFuerGenerierung(plan) {
        const rows = this._ladePlanPositionen(plan.id);
        if (Number(plan.preise_live) !== 1) return rows;
        const artStmt = db.prepare('SELECT id, vk FROM artikel WHERE id=?');
        return rows.map(p => {
            if (p.lv_position_id != null) {
                const lvPos = db.prepare('SELECT * FROM lv_positionen WHERE id=?').get(p.lv_position_id);
                if (!lvPos) return p;
                const kalk = kalkuliereLvPosition(lvPos, leseZuschlagsProfil(), ladeObjekteState());
                return { ...p, preis: kalk.nettoMonat };
            }
            if (!p.artikelId) return p;
            const art = artStmt.get(p.artikelId);
            return (art && art.vk != null) ? { ...p, preis: art.vk } : p;
        });
    },

    async uebernehmeLvInAbrechnungsplan(payload = {}) {
        const objektTyp = payload.objekt_typ;
        if (!OBJEKT_EBENEN[objektTyp]) throw new Error('Ungültiger Objekttyp');
        const oid = Number(payload.objekt_id);
        if (!Number.isInteger(oid)) throw new Error('Ungültige Objekt-ID');

        const empfaenger = loeseObjektEmpfaengerAuf(objektTyp, oid);
        if (!empfaenger || !empfaenger.kundeId) {
            throw new Error('Kein Rechnungsempfänger ermittelbar – bitte Empfänger am Objekt setzen oder direkt wählen.');
        }

        const putzplan = await this.getPutzplan(objektTyp, oid);
        const nurIds = Array.isArray(payload.nur_position_ids) && payload.nur_position_ids.length > 0
            ? new Set(payload.nur_position_ids.map(Number))
            : null;

        const planPositionen = [];
        for (const bereich of putzplan.bereiche) {
            if (bereich.aktiv === 0) continue;
            for (const pos of bereich.positionen) {
                if (nurIds && !nurIds.has(pos.id)) continue;
                planPositionen.push({
                    name: `[${bereich.name}] ${pos.bezeichnung}`,
                    menge: 1,
                    einheit: 'Monat',
                    preis: pos.kalkulation.nettoMonat,
                    mwst: pos.mwst,
                    lv_position_id: pos.id
                });
            }
        }
        if (planPositionen.length === 0) throw new Error('Kein LV-Inhalt zum Übernehmen vorhanden.');

        let planId = payload.plan_id ? Number(payload.plan_id) : null;
        let planName;
        if (planId) {
            const existing = db.prepare('SELECT id, name FROM abrechnungsplaene WHERE id=?').get(planId);
            if (!existing) throw new Error(`Abrechnungsplan #${planId} wurde nicht gefunden.`);
            planName = existing.name;
        } else {
            planName = `${putzplan.objektPfad} – Reinigungs-LV`;
        }

        const heuteIso = new Date().toISOString().split('T')[0];
        const rhythmus = ['MONATLICH', 'QUARTALSWEISE', 'JAEHRLICH'].includes(payload.rhythmus) ? payload.rhythmus : 'MONATLICH';
        const plan = {
            id: planId,
            name: planName,
            objekt_typ: objektTyp,
            objekt_id: oid,
            empfaenger_kunde_id: empfaenger.kundeId,
            rhythmus,
            abrechnungstag: parseInt(payload.abrechnungstag, 10) || 1,
            abrechnungs_modus: 'NACHTRAEGLICH',
            start_datum: payload.start_datum || heuteIso,
            preis_modus: 'POSITIONEN',
            preise_live: 1,
            pauschale_netto: 0,
            mwst_satz: parseInt(payload.mwst, 10) || 19,
            zahlungsziel_tage: payload.zahlungsziel_tage != null ? parseInt(payload.zahlungsziel_tage, 10) : 14,
            als_entwurf: 1,
            aktiv: 1
        };

        const res = await this.saveAbrechnungsplan(plan, planPositionen);
        const monatsNetto = Math.round(planPositionen.reduce((s, p) => s + (parseFloat(p.preis) || 0), 0) * 100) / 100;

        return {
            planId: res.id,
            anzahlPositionen: planPositionen.length,
            monatsNetto,
            naechste_lauf_am: res.naechste_lauf_am
        };
    },

    _erzeugeRechnungAusLaufTx(planRow, lauf) {
        const plan = { ...planRow };
        const positionenDb = plan.preis_modus === 'POSITIONEN' ? this._ladePlanPositionenFuerGenerierung(plan).map(p => ({
            artikelId: p.artikelId,
            name: p.name,
            menge: p.menge,
            einheit: p.einheit,
            preis: p.preis,
            mwst: p.mwst,
            ek: 0
        })) : [];
        const positionsListe = DauerrechnungController.berechnePositionsListe(plan, positionenDb);

        const totals = InvoiceController.calculateTotals({
            positionen: positionsListe.map(pos => ({ ...pos, rabatt: 0 })),
            mode: 'netto',
            globalRabatt: { value: 0, type: '%' },
            anzahlung: 0
        });

        const faelligAm = DauerrechnungController.addTage(lauf.rechnungsDatum, plan.zahlungsziel_tage || 14);
        const alsEntwurf = plan.als_entwurf === 1;

        const doc = {
            id: null,
            type: 'rechnung',
            nr: generateNaechsteRechnungsNr(),
            datum: lauf.rechnungsDatum,
            faellig: faelligAm,
            kundeId: plan.empfaenger_kunde_id,
            projektId: null,
            objekt_typ: plan.objekt_typ,
            objekt_id: plan.objekt_id,
            rechnungsart: 'REGULAER',
            leistungszeitraum_von: lauf.periodeVon,
            leistungszeitraum_bis: lauf.periodeBis,
            vortext: `Dauerrechnung laut Abrechnungsplan "${plan.name}"`,
            status: alsEntwurf ? 'Entwurf' : 'Ausstehend',
            isLocked: !alsEntwurf,
            positionen: positionsListe,
            netto: totals.nettoNachRabatt,
            steuer: totals.totalTax,
            brutto: totals.bruttoNachRabatt,
            zahlbetrag: totals.zahlbetrag,
            eingabemodus: 'netto'
        };

        const dokumentId = applyDocumentWrite(doc, doc.isLocked ? 1 : 0);

        try {
            db.prepare(`INSERT INTO dauerrechnung_laeufe (plan_id, periode_von, periode_bis, rechnungs_datum, faellig_am, status, dokument_id)
                        VALUES (?, ?, ?, ?, ?, 'ERSTELLT', ?)`)
              .run(plan.id, lauf.periodeVon, lauf.periodeBis, lauf.rechnungsDatum, faelligAm, dokumentId);
        } catch (e) {
            if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                throw new Error(`Zeitraum ${lauf.periodeVon} bis ${lauf.periodeBis} bereits abgerechnet.`);
            }
            throw e;
        }

        const heuteIso = new Date().toISOString().split('T')[0];
        db.prepare('UPDATE abrechnungsplaene SET letzte_lauf_am=?, naechste_lauf_am=? WHERE id=?')
          .run(lauf.rechnungsDatum, DauerrechnungController.berechneNaechstenTermin({ ...plan, letzte_lauf_am: lauf.rechnungsDatum }, heuteIso), plan.id);

        appendAuditLog({
            entityType: 'ABRECHNUNGSPLAN',
            entityId: plan.id,
            action: 'LAUF_ERSTELLT',
            details: {
                laufId: null,
                dokumentId,
                nr: doc.nr,
                periodeVon: lauf.periodeVon,
                periodeBis: lauf.periodeBis,
                brutto: doc.brutto
            }
        });

        return {
            dokumentId,
            nr: doc.nr,
            brutto: doc.brutto,
            laufId: db.prepare('SELECT id FROM dauerrechnung_laeufe WHERE plan_id=? AND periode_von=? AND periode_bis=? AND status=\'ERSTELLT\'').get(plan.id, lauf.periodeVon, lauf.periodeBis).id
        };
    },

    erzeugeRechnungAusLauf(plan, lauf) {
        const tx = db.transaction((p, l) => this._erzeugeRechnungAusLaufTx(p, l));
        return tx(plan, lauf);
    },

    _erzeugeSammelrechnungTx(kundeId, eintraege) {
        if (!Array.isArray(eintraege) || eintraege.length < 2) {
            throw new Error('Sammelrechnung benötigt mindestens 2 Läufe.');
        }

        let minPeriode = null;
        let maxPeriode = null;
        let alleGesperrtMoeglich = true;
        let zahlungszielMax = 0;
        const positionsListen = [];
        const vorbereitete = [];

        for (const eintrag of eintraege) {
            let planId;
            let periodeVon;
            let periodeBis;
            let rechnungsDatum;
            let laufRow = null;

            if (eintrag.laufId != null) {
                laufRow = db.prepare('SELECT * FROM dauerrechnung_laeufe WHERE id=?').get(Number(eintrag.laufId));
                if (!laufRow) throw new Error(`Lauf #${eintrag.laufId} wurde nicht gefunden.`);
                if (laufRow.status !== 'ERSTELLT') throw new Error(`Lauf #${laufRow.id} ist nicht im Status ERSTELLT.`);
                if (laufRow.dokument_id) throw new Error(`Lauf #${laufRow.id} wurde bereits abgerechnet.`);
                planId = laufRow.plan_id;
                periodeVon = laufRow.periode_von;
                periodeBis = laufRow.periode_bis;
                rechnungsDatum = laufRow.rechnungs_datum;
            } else {
                planId = Number(eintrag.planId);
                periodeVon = eintrag.periodeVon || eintrag.periode_von;
                periodeBis = eintrag.periodeBis || eintrag.periode_bis;
                rechnungsDatum = eintrag.rechnungsDatum || eintrag.rechnungs_datum;
                laufRow = db.prepare("SELECT * FROM dauerrechnung_laeufe WHERE plan_id=? AND periode_von=? AND periode_bis=? AND status='ERSTELLT'")
                  .get(planId, periodeVon, periodeBis) || null;
                if (laufRow && laufRow.dokument_id) throw new Error(`Lauf #${laufRow.id} wurde bereits abgerechnet.`);
            }

            const plan = db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(planId);
            if (!plan) throw new Error(`Abrechnungsplan #${planId} wurde nicht gefunden.`);
            if (Number(plan.empfaenger_kunde_id) !== Number(kundeId)) {
                throw new Error('Alle Läufe müssen denselben Rechnungsempfänger haben.');
            }
            if (plan.als_entwurf !== 1) alleGesperrtMoeglich = false;
            zahlungszielMax = Math.max(zahlungszielMax, plan.zahlungsziel_tage || 14);

            const pfad = baueObjektPfad(plan.objekt_typ, plan.objekt_id);
            const positionenDb = plan.preis_modus === 'POSITIONEN' ? this._ladePlanPositionenFuerGenerierung(plan).map(p => ({
                artikelId: p.artikelId,
                name: p.name,
                menge: p.menge,
                einheit: p.einheit,
                preis: p.preis,
                mwst: p.mwst,
                ek: 0
            })) : [];
            for (const pos of DauerrechnungController.berechnePositionsListe(plan, positionenDb)) {
                positionsListen.push({ ...pos, name: `[${pfad}] ${pos.name}` });
            }

            minPeriode = minPeriode === null || periodeVon < minPeriode ? periodeVon : minPeriode;
            maxPeriode = maxPeriode === null || periodeBis > maxPeriode ? periodeBis : maxPeriode;

            vorbereitete.push({ laufRow, plan, periodeVon, periodeBis, rechnungsDatum });
        }

        const totals = InvoiceController.calculateTotals({
            positionen: positionsListen.map(pos => ({ ...pos, rabatt: 0 })),
            mode: 'netto',
            globalRabatt: { value: 0, type: '%' },
            anzahlung: 0
        });

        const heuteIso = new Date().toISOString().split('T')[0];
        const alsEntwurf = !alleGesperrtMoeglich;
        const faelligAm = DauerrechnungController.addTage(heuteIso, zahlungszielMax || 14);
        const doc = {
            id: null,
            type: 'rechnung',
            nr: generateNaechsteRechnungsNr(),
            datum: heuteIso,
            faellig: faelligAm,
            kundeId: Number(kundeId),
            projektId: null,
            objekt_typ: null,
            objekt_id: null,
            rechnungsart: 'SAMMELRECHNUNG',
            leistungszeitraum_von: minPeriode,
            leistungszeitraum_bis: maxPeriode,
            vortext: 'Sammelrechnung über mehrere Abrechnungspläne',
            status: alsEntwurf ? 'Entwurf' : 'Ausstehend',
            isLocked: !alsEntwurf,
            positionen: positionsListen,
            netto: totals.nettoNachRabatt,
            steuer: totals.totalTax,
            brutto: totals.bruttoNachRabatt,
            zahlbetrag: totals.zahlbetrag,
            eingabemodus: 'netto'
        };

        const sammelDokumentId = applyDocumentWrite(doc, doc.isLocked ? 1 : 0);

        for (const v of vorbereitete) {
            if (v.laufRow && v.laufRow.id) {
                db.prepare('UPDATE dauerrechnung_laeufe SET dokument_id=? WHERE id=?').run(sammelDokumentId, v.laufRow.id);
            } else {
                try {
                    db.prepare(`INSERT INTO dauerrechnung_laeufe (plan_id, periode_von, periode_bis, rechnungs_datum, faellig_am, status, dokument_id)
                                VALUES (?, ?, ?, ?, ?, 'ERSTELLT', ?)`)
                      .run(v.plan.id, v.periodeVon, v.periodeBis, v.rechnungsDatum, faelligAm, sammelDokumentId);
                } catch (e) {
                    if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                        throw new Error(`Zeitraum ${v.periodeVon} bis ${v.periodeBis} bereits abgerechnet.`);
                    }
                    throw e;
                }
            }

            appendAuditLog({
                entityType: 'ABRECHNUNGSPLAN',
                entityId: v.plan.id,
                action: 'LAUF_IN_SAMMELRECHNUNG',
                details: { periodeVon: v.periodeVon, periodeBis: v.periodeBis, sammelDokumentId, nr: doc.nr }
            });

            db.prepare('UPDATE abrechnungsplaene SET letzte_lauf_am=?, naechste_lauf_am=? WHERE id=?')
              .run(
                  v.rechnungsDatum,
                  DauerrechnungController.berechneNaechstenTermin({ ...v.plan, letzte_lauf_am: v.rechnungsDatum }, heuteIso),
                  v.plan.id
              );
        }

        return { dokumentId: sammelDokumentId, nr: doc.nr, brutto: doc.brutto, kundeId: Number(kundeId), anzahlLaeufe: eintraege.length };
    },

    erzeugeSammelrechnung(kundeId, laeufe) {
        const normalisiert = (laeufe || []).map(e => {
            if (!e || typeof e !== 'object') return e;
            if (e.laufId != null) return { laufId: e.laufId };
            if (e.planId != null || e.plan_id != null) {
                return {
                    planId: e.planId != null ? e.planId : e.plan_id,
                    periodeVon: e.periodeVon != null ? e.periodeVon : e.periode_von,
                    periodeBis: e.periodeBis != null ? e.periodeBis : e.periode_bis,
                    rechnungsDatum: e.rechnungsDatum != null ? e.rechnungsDatum : e.rechnungs_datum
                };
            }
            return e;
        });
        const tx = db.transaction((k, list) => this._erzeugeSammelrechnungTx(k, list));
        return tx(kundeId, normalisiert);
    },

    async dauerrechnungenVorschau(stichdatum) {
        const stichdatumIso = stichdatum || new Date().toISOString().split('T')[0];
        const plaene = db.prepare('SELECT * FROM abrechnungsplaene WHERE aktiv=1 ORDER BY id ASC').all();
        const faellig = [];
        let gesamtNetto = 0;

        for (const plan of plaene) {
            const virtuellesPlan = { ...plan };
            for (let i = 0; i < 120; i++) {
                const termin = DauerrechnungController.berechneNaechstenTermin(virtuellesPlan, null);
                if (!termin || termin > stichdatumIso) break;
                const zeitraum = DauerrechnungController.berechneLeistungszeitraum(virtuellesPlan, termin);
                if (zeitraum.periodeVon <= zeitraum.periodeBis) {
                    const bereitsErstellt = db.prepare("SELECT id FROM dauerrechnung_laeufe WHERE plan_id=? AND periode_von=? AND periode_bis=? AND status='ERSTELLT'")
                      .get(plan.id, zeitraum.periodeVon, zeitraum.periodeBis);
                    if (!bereitsErstellt) {
                        const positionenDb = plan.preis_modus === 'POSITIONEN' ? this._ladePlanPositionenFuerGenerierung(plan).map(p => ({
                            artikelId: p.artikelId, name: p.name, menge: p.menge, einheit: p.einheit, preis: p.preis, mwst: p.mwst
                        })) : [];
                        const positionsListe = DauerrechnungController.berechnePositionsListe(plan, positionenDb);
                        const nettoErwartet = Math.round(positionsListe.reduce((s, pos) => s + (parseFloat(pos.menge) || 0) * (parseFloat(pos.preis) || 0), 0) * 100) / 100;
                        const kunde = db.prepare('SELECT id, name FROM kunden WHERE id=?').get(plan.empfaenger_kunde_id);

                        faellig.push({
                            planId: plan.id,
                            planName: plan.name,
                            objektPfad: baueObjektPfad(plan.objekt_typ, plan.objekt_id),
                            empfaengerKundeId: plan.empfaenger_kunde_id,
                            empfaengerName: kunde ? kunde.name : null,
                            rechnungsDatum: termin,
                            periodeVon: zeitraum.periodeVon,
                            periodeBis: zeitraum.periodeBis,
                            nettoErwartet,
                            gruppeKundeId: plan.empfaenger_kunde_id
                        });
                        gesamtNetto += nettoErwartet;
                    }
                }

                if (termin >= stichdatumIso) break;
                virtuellesPlan.letzte_lauf_am = termin;
            }
        }

        return { faellig, gesamtNetto: Math.round(gesamtNetto * 100) / 100 };
    },

    async generiereFaelligeRechnungen(optionen = {}) {
        const stichdatumIso = optionen.stichdatum || new Date().toISOString().split('T')[0];
        const vorschau = await this.dauerrechnungenVorschau(stichdatumIso);
        const kandidaten = vorschau.faellig.filter(eintrag =>
            (!optionen.planIds || optionen.planIds.includes(eintrag.planId)) &&
            (optionen.nurEntwuerfe ? (db.prepare('SELECT als_entwurf FROM abrechnungsplaene WHERE id=?').get(eintrag.planId) || {}).als_entwurf === 1 : true)
        );

        const erstellt = [];
        const sammelrechnungen = [];
        const uebersprungen = [];
        const verarbeitet = new Set();
        const schluessel = eintrag => `${eintrag.planId}:${eintrag.rechnungsDatum}:${eintrag.periodeVon}:${eintrag.periodeBis}`;

        if (optionen.sammelProKunde) {
            const gruppen = DauerrechnungController.gruppiereFuerSammelrechnung(kandidaten);
            for (const [kundeId, liste] of gruppen.entries()) {
                if (liste.length < 2) continue;
                try {
                    const res = this.erzeugeSammelrechnung(kundeId, liste);
                    sammelrechnungen.push(res);
                    liste.forEach(eintrag => {
                        verarbeitet.add(schluessel(eintrag));
                        erstellt.push({ planId: eintrag.planId, dokumentId: res.dokumentId, nr: res.nr, brutto: Math.round((res.brutto / liste.length) * 100) / 100 });
                    });
                } catch (e) {
                    liste.forEach(eintrag => uebersprungen.push({ planId: eintrag.planId, grund: e.message }));
                }
            }
        }

        for (const eintrag of kandidaten) {
            if (verarbeitet.has(schluessel(eintrag))) continue;
            try {
                const plan = db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(eintrag.planId);
                if (!plan) throw new Error('Plan nicht gefunden');
                if (plan.aktiv !== 1) throw new Error('Plan ist deaktiviert');
                const existierend = db.prepare("SELECT id FROM dauerrechnung_laeufe WHERE plan_id=? AND periode_von=? AND periode_bis=? AND status='ERSTELLT'")
                  .get(eintrag.planId, eintrag.periodeVon, eintrag.periodeBis);
                if (existierend) throw new Error(`Zeitraum ${eintrag.periodeVon} bis ${eintrag.periodeBis} bereits abgerechnet.`);

                const res = this.erzeugeRechnungAusLauf(plan, {
                    rechnungsDatum: eintrag.rechnungsDatum,
                    periodeVon: eintrag.periodeVon,
                    periodeBis: eintrag.periodeBis
                });
                erstellt.push({ planId: eintrag.planId, laufId: res.laufId, dokumentId: res.dokumentId, nr: res.nr, brutto: res.brutto });
            } catch (e) {
                if (!uebersprungen.some(u => u.planId === eintrag.planId)) {
                    uebersprungen.push({ planId: eintrag.planId, grund: e.message });
                }
            }
        }

        return { erstellt, sammelrechnungen, uebersprungen };
    },

    async autoRunDauerrechnungen() {
        try {
            const heuteIso = new Date().toISOString().split('T')[0];
            const lastRun = db.prepare("SELECT value FROM einstellungen WHERE key='dauerrechnungen_last_auto_run'").get();
            if (lastRun && lastRun.value === heuteIso) {
                return { ausgefuehrt: false, erstellteAnzahl: 0, grund: 'Auto-Lauf wurde heute bereits durchgeführt.' };
            }

            const autoEinstellung = db.prepare("SELECT value FROM einstellungen WHERE key='dauerrechnungen_auto_erstellen'").get();
            if (autoEinstellung && autoEinstellung.value === 'false') {
                db.prepare("INSERT OR REPLACE INTO einstellungen (key, value) VALUES ('dauerrechnungen_last_auto_run', ?)").run(heuteIso);
                return { ausgefuehrt: false, erstellteAnzahl: 0, grund: 'Auto-Erstellung ist deaktiviert.' };
            }

            const ergebnis = await this.generiereFaelligeRechnungen({ nurEntwuerfe: true, sammelProKunde: false });

            db.prepare("INSERT OR REPLACE INTO einstellungen (key, value) VALUES ('dauerrechnungen_last_auto_run', ?)").run(heuteIso);
            return { ausgefuehrt: true, erstellteAnzahl: ergebnis.erstellt.length };
        } catch (e) {
            console.error('Auto-Run Dauerrechnungen:', e.message);
            return { ausgefuehrt: false, erstellteAnzahl: 0, grund: e.message };
        }
    },

    _loescheEntwurfInnerhalbTx(docId) {
        const doc = db.prepare('SELECT type, nr, status, isLocked FROM dokumente WHERE id=?').get(docId);
        if (!doc) return;
        if (doc.type === 'rechnung') {
            const positions = db.prepare('SELECT artikelId, menge FROM positionen WHERE dokumentId=?').all(docId);
            if (positions.length > 0) {
                const restoreStockMap = new Map();
                for (const p of positions) {
                    if (p.artikelId) {
                        restoreStockMap.set(p.artikelId, (restoreStockMap.get(p.artikelId) || 0) + p.menge);
                    }
                }
                const restoreStockStmt = db.prepare('UPDATE artikel SET bestand = bestand + ? WHERE id=?');
                for (const [artId, qty] of restoreStockMap.entries()) {
                    restoreStockStmt.run(qty, artId);
                }
            }
        }
        db.prepare('DELETE FROM positionen WHERE dokumentId=?').run(docId);
        db.prepare('DELETE FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?').run(docId);
        db.prepare('DELETE FROM dokumente WHERE id=?').run(docId);

        appendAuditLog({
            entityType: 'DOCUMENT',
            entityId: docId,
            action: 'GELÖSCHT',
            details: { nr: doc.nr, type: doc.type, status: doc.status, grund: 'Lauf-Storno (Entwurf)' }
        });
    },

    async storniereLauf(laufId, grund) {
        if (!grund || typeof grund !== 'string' || !grund.trim()) {
            throw new Error('Storno ohne Begründung nicht erlaubt (GoBD).');
        }
        if (typeof laufId !== 'number') throw new Error('Ungültige Lauf-ID');

        const lauf = db.prepare('SELECT * FROM dauerrechnung_laeufe WHERE id=?').get(laufId);
        if (!lauf) throw new Error('Ungültige Lauf-ID');

        const doc = lauf.dokument_id ? getDocumentWithChildren(lauf.dokument_id) : null;
        const istEntwurf = !!(doc && !doc.isLocked && doc.status === 'Entwurf');

        let stornoDokumentId = null;
        if (doc && !istEntwurf) {
            const stornoData = InvoiceController.createStornoData(doc);
            const res = await this.storniereRechnung(stornoData.updatedOriginal, stornoData.stornoDoc);
            stornoDokumentId = res.stornoId;
        }

        const tx = db.transaction((laufZeile, begruendung) => {
            let dokumentGeloescht = false;
            if (istEntwurf && laufZeile.dokument_id) {
                const entwurfId = laufZeile.dokument_id;
                const weitereReferenzen = db.prepare("SELECT COUNT(*) c FROM dauerrechnung_laeufe WHERE dokument_id=? AND id != ? AND status='ERSTELLT'")
                  .get(entwurfId, laufZeile.id).c;
                db.prepare('UPDATE dauerrechnung_laeufe SET dokument_id=NULL WHERE id=?').run(laufZeile.id);
                if (weitereReferenzen === 0) {
                    this._loescheEntwurfInnerhalbTx(entwurfId);
                    dokumentGeloescht = true;
                }
            }

            db.prepare("UPDATE dauerrechnung_laeufe SET status='STORNIERT', storno_grund=? WHERE id=?")
              .run(begruendung.trim(), laufZeile.id);

            appendAuditLog({
                entityType: 'ABRECHNUNGSPLAN',
                entityId: laufZeile.plan_id,
                action: 'LAUF_STORNIERT',
                details: {
                    laufId: laufZeile.id,
                    grund: begruendung.trim(),
                    dokumentGeloescht,
                    stornorechnungId: stornoDokumentId
                }
            });

            const plan = db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(laufZeile.plan_id);
            if (plan) {
                const heuteIso = new Date().toISOString().split('T')[0];
                db.prepare('UPDATE abrechnungsplaene SET naechste_lauf_am=? WHERE id=?')
                  .run(DauerrechnungController.berechneNaechstenTermin(plan, heuteIso), plan.id);
            }

            return {
                success: true,
                laufId: laufZeile.id,
                dokumentStorniert: dokumentGeloescht || !!stornoDokumentId,
                stornoDokumentId: stornoDokumentId || undefined
            };
        });

        return tx(lauf, grund);
    },

    // --- Backup ---
    async backup(destinationPath) {
        return db.backup(destinationPath);
    },

    // --- Restore ---
    async restore(sourcePath) {
        // 1. Create an emergency backup of the CURRENT state before overwriting
        const emergencyPath = dbPath + '.emergency-backup-' + Date.now();
        fs.copyFileSync(dbPath, emergencyPath);
        console.log('Emergency backup created at:', emergencyPath);

        // 2. Close the active database connection
        db.close();

        // 3. Overwrite the database file with the selected backup
        fs.copyFileSync(sourcePath, dbPath);
        console.log('Database overwritten with backup from:', sourcePath);

        // 4. Relaunch the application to load the new database
        const { app } = require('electron');
        app.relaunch();
        app.exit(0);
    },

    // --- Banking, OPOS & SEPA (F11) ---
    getBankKonten() {
        return db.prepare('SELECT * FROM bank_konten ORDER BY ist_standard DESC, id ASC').all();
    },

    saveBankKonto(konto) {
        if (!konto || !konto.kontoname || !konto.iban) {
            throw new Error('Kontoname und IBAN sind Pflichtfelder.');
        }
        const cleanIban = String(konto.iban).replace(/[\s-]+/g, '').toUpperCase();
        const cleanBic = String(konto.bic || '').replace(/[\s-]+/g, '').toUpperCase();
        if (!SepaController.validateIban(cleanIban)) {
            throw new Error(`Ungültige IBAN: ${konto.iban}`);
        }

        const tx = db.transaction(() => {
            if (konto.ist_standard) {
                db.prepare('UPDATE bank_konten SET ist_standard = 0').run();
            }

            let kontoId = konto.id;
            if (kontoId) {
                db.prepare(`
                    UPDATE bank_konten
                    SET kontoname = ?, bankname = ?, iban = ?, bic = ?, kontoinhaber = ?,
                        glaeubiger_id = ?, waehrung = ?, aktueller_saldo = ?, saldo_datum = ?,
                        ist_standard = ?, aktiv = ?
                    WHERE id = ?
                `).run(
                    konto.kontoname.trim(),
                    (konto.bankname || '').trim(),
                    cleanIban,
                    cleanBic,
                    (konto.kontoinhaber || '').trim(),
                    (konto.glaeubiger_id || '').trim(),
                    konto.waehrung || 'EUR',
                    parseFloat(konto.aktueller_saldo) || 0.0,
                    konto.saldo_datum || null,
                    konto.ist_standard ? 1 : 0,
                    konto.aktiv !== undefined ? (konto.aktiv ? 1 : 0) : 1,
                    kontoId
                );
                appendAuditLog({ entityType: 'BANK_KONTO', entityId: Number(kontoId), action: 'AKTUALISIERT', details: { kontoname: konto.kontoname, iban: cleanIban } });
            } else {
                const info = db.prepare(`
                    INSERT INTO bank_konten (
                        kontoname, bankname, iban, bic, kontoinhaber, glaeubiger_id,
                        waehrung, aktueller_saldo, saldo_datum, ist_standard, aktiv
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    konto.kontoname.trim(),
                    (konto.bankname || '').trim(),
                    cleanIban,
                    cleanBic,
                    (konto.kontoinhaber || '').trim(),
                    (konto.glaeubiger_id || '').trim(),
                    konto.waehrung || 'EUR',
                    parseFloat(konto.aktueller_saldo) || 0.0,
                    konto.saldo_datum || null,
                    konto.ist_standard ? 1 : 0,
                    konto.aktiv !== undefined ? (konto.aktiv ? 1 : 0) : 1
                );
                kontoId = info.lastInsertRowid;
                appendAuditLog({ entityType: 'BANK_KONTO', entityId: Number(kontoId), action: 'ERSTELLT', details: { kontoname: konto.kontoname, iban: cleanIban } });
            }

            return db.prepare('SELECT * FROM bank_konten WHERE id = ?').get(kontoId);
        });

        return tx();
    },

    deleteBankKonto(id) {
        const txCount = db.prepare('SELECT COUNT(*) as cnt FROM bank_transaktionen WHERE bank_konto_id = ?').get(id).cnt;
        if (txCount > 0) {
            db.prepare('UPDATE bank_konten SET aktiv = 0 WHERE id = ?').run(id);
            appendAuditLog({ entityType: 'BANK_KONTO', entityId: Number(id), action: 'DEAKTIVIERT', details: 'Konto deaktiviert, da Transaktionen existieren.' });
        } else {
            db.prepare('DELETE FROM bank_konten WHERE id = ?').run(id);
            appendAuditLog({ entityType: 'BANK_KONTO', entityId: Number(id), action: 'GELOESCHT', details: 'Bankkonto gelöscht.' });
        }
        return { success: true };
    },

    importBankTransactions(kontoId, transactions, meta = {}) {
        if (!kontoId || !Array.isArray(transactions)) {
            throw new Error('Ungültige Transaktionsdaten.');
        }
        const konto = db.prepare('SELECT * FROM bank_konten WHERE id = ?').get(kontoId);
        if (!konto) throw new Error(`Bankkonto #${kontoId} nicht gefunden.`);

        const tx = db.transaction(() => {
            let inserted = 0;
            let duplicates = 0;

            const insertStmt = db.prepare(`
                INSERT INTO bank_transaktionen (
                    bank_konto_id, buchungstag, valuta, betrag, waehrung,
                    partner_name, partner_iban, partner_bic, buchungstext,
                    verwendungszweck, transaktions_code, gv_code, primanota,
                    dedup_hash, status, import_datei, import_format
                ) VALUES (
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, 'OFFEN', ?, ?
                )
            `);

            for (const t of transactions) {
                const hash = t.dedupHash || BankingController.calculateTransactionHash({
                    iban: konto.iban,
                    buchungstag: t.buchungstag,
                    betrag: t.betrag,
                    verwendungszweck: t.verwendungszweck,
                    partnerIban: t.partnerIban,
                    primanota: t.primanota
                });

                try {
                    insertStmt.run(
                        kontoId,
                        t.buchungstag,
                        t.valuta || t.buchungstag,
                        Math.round((parseFloat(t.betrag) || 0) * 100) / 100,
                        t.waehrung || 'EUR',
                        t.partnerName || '',
                        t.partnerIban || '',
                        t.partnerBic || '',
                        t.buchungstext || '',
                        t.verwendungszweck || '',
                        t.transaktionsCode || '',
                        t.gvCode || '',
                        t.primanota || '',
                        hash,
                        meta.filename || 'manuell',
                        t.importFormat || meta.format || 'CSV_GENERIC'
                    );
                    inserted++;
                } catch (err) {
                    if (err.message && err.message.includes('UNIQUE constraint failed')) {
                        duplicates++;
                    } else {
                        throw err;
                    }
                }
            }

            if (meta.closingBalance !== undefined && meta.closingBalance !== null) {
                db.prepare('UPDATE bank_konten SET aktueller_saldo = ?, saldo_datum = ? WHERE id = ?').run(
                    parseFloat(meta.closingBalance),
                    meta.saldoDatum || new Date().toISOString().substring(0, 10),
                    kontoId
                );
            }

            appendAuditLog({
                entityType: 'BANK_IMPORT',
                entityId: Number(kontoId),
                action: 'IMPORTIERT',
                details: {
                    datei: meta.filename,
                    total: transactions.length,
                    neu: inserted,
                    duplikate: duplicates
                }
            });

            return { total: transactions.length, inserted, duplicates, kontoId };
        });

        return tx();
    },

    getBankTransaktionen(filter = {}) {
        let sql = `
            SELECT bt.*, bk.kontoname, bk.iban as konto_iban
            FROM bank_transaktionen bt
            JOIN bank_konten bk ON bt.bank_konto_id = bk.id
            WHERE 1=1
        `;
        const params = [];

        if (filter.bank_konto_id) {
            sql += ' AND bt.bank_konto_id = ?';
            params.push(filter.bank_konto_id);
        }
        if (filter.status) {
            sql += ' AND bt.status = ?';
            params.push(filter.status);
        }
        if (filter.datum_von) {
            sql += ' AND bt.buchungstag >= ?';
            params.push(filter.datum_von);
        }
        if (filter.datum_bis) {
            sql += ' AND bt.buchungstag <= ?';
            params.push(filter.datum_bis);
        }
        if (filter.search) {
            sql += ' AND (bt.verwendungszweck LIKE ? OR bt.partner_name LIKE ? OR bt.partner_iban LIKE ?)';
            const s = `%${filter.search}%`;
            params.push(s, s, s);
        }

        sql += ' ORDER BY bt.buchungstag DESC, bt.id DESC';

        const rows = db.prepare(sql).all(...params);
        const zuordnungStmt = db.prepare(`
            SELECT zz.*, d.nr as dokument_nr, d.datum as dokument_datum, er.rechnungs_nr as eingangsrechnung_nr
            FROM zahlung_zuordnungen zz
            LEFT JOIN dokumente d ON zz.dokument_id = d.id
            LEFT JOIN eingangsrechnungen er ON zz.eingangsrechnung_id = er.id
            WHERE zz.transaktion_id = ?
        `);

        for (const r of rows) {
            r.zuordnungen = zuordnungStmt.all(r.id);
        }

        return rows;
    },

    runOposMatching(kontoId = null) {
        let txSql = `SELECT * FROM bank_transaktionen WHERE status IN ('OFFEN', 'TEILWEISE_ZUGEORDNET')`;
        const txParams = [];
        if (kontoId) {
            txSql += ' AND bank_konto_id = ?';
            txParams.push(kontoId);
        }
        txSql += ' ORDER BY buchungstag ASC';
        const transaktionen = db.prepare(txSql).all(...txParams);

        const offeneRechnungen = db.prepare(`
            SELECT d.*, k.name as kunden_name, k.iban as kunden_iban, k.kundennummer
            FROM dokumente d
            LEFT JOIN kunden k ON d.kundeId = k.id
            WHERE d.type = 'rechnung' AND d.status NOT IN ('Bezahlt', 'Storniert')
            ORDER BY d.datum ASC
        `).all();

        const eingangsrechnungen = db.prepare(`
            SELECT er.*, k.name as lieferant_name, k.iban as lieferant_iban
            FROM eingangsrechnungen er
            LEFT JOIN kunden k ON er.lieferant_id = k.id
            WHERE er.zahlungs_status != 'BEZAHLT'
            ORDER BY er.rechnungs_datum ASC
        `).all();

        const tolRow = db.prepare('SELECT value FROM einstellungen WHERE key = ?').get('matching_auto_skonto_toleranz_tage');
        const skontoToleranzTage = tolRow ? parseInt(tolRow.value, 10) : 2;

        const matches = BankingController.matchTransactionsAgainstOpos({
            transaktionen,
            offeneRechnungen,
            eingangsrechnungen,
            skontoToleranzTage
        });

        return {
            matches,
            offeneTransaktionenCount: transaktionen.length,
            offeneRechnungenCount: offeneRechnungen.length
        };
    },

    applyPaymentMatching(matches = [], options = {}) {
        if (!Array.isArray(matches) || matches.length === 0) {
            return { success: true, count: 0 };
        }

        const tx = db.transaction(() => {
            let applied = 0;

            for (const m of matches) {
                const txRow = db.prepare('SELECT * FROM bank_transaktionen WHERE id = ?').get(m.transaktionId);
                if (!txRow) continue;

                const matchBetrag = Math.round((parseFloat(m.betrag) || 0) * 100) / 100;
                const skontoAbzug = Math.round((parseFloat(m.skontoAbzug) || 0) * 100) / 100;
                const diffGrund = m.differenzGrund || (skontoAbzug > 0 ? 'SKONTO' : null);

                db.prepare(`
                    INSERT INTO zahlung_zuordnungen (
                        transaktion_id, dokument_id, eingangsrechnung_id,
                        betrag, skonto_abzug, differenz_grund, benutzer_notiz
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                    m.transaktionId,
                    m.dokumentId || null,
                    m.eingangsrechnungId || null,
                    matchBetrag,
                    skontoAbzug,
                    diffGrund,
                    m.benutzerNotiz || null
                );

                const newZugeordnet = Math.round(((txRow.zugeordneter_betrag || 0) + matchBetrag) * 100) / 100;
                const txAbs = Math.round(Math.abs(txRow.betrag) * 100) / 100;
                const txStatus = newZugeordnet >= txAbs - 0.009 ? 'ZUGEORDNET' : 'TEILWEISE_ZUGEORDNET';

                db.prepare('UPDATE bank_transaktionen SET zugeordneter_betrag = ?, status = ? WHERE id = ?').run(
                    newZugeordnet,
                    txStatus,
                    txRow.id
                );

                if (m.dokumentId) {
                    const doc = getDocumentWithChildren(m.dokumentId);
                    if (doc) {
                        const altBezahlt = Math.round((parseFloat(doc.bezahlt_betrag) || 0) * 100) / 100;
                        const neuBezahlt = Math.round((altBezahlt + matchBetrag) * 100) / 100;
                        const docBrutto = Math.round((parseFloat(doc.brutto) || 0) * 100) / 100;
                        const totalErledigt = Math.round((neuBezahlt + skontoAbzug) * 100) / 100;
                        const neuOffen = Math.max(0, Math.round((docBrutto - totalErledigt) * 100) / 100);

                        const isFull = neuOffen <= 0.009;
                        const newStatus = isFull ? 'Bezahlt' : 'Teilweise bezahlt';
                        const newLocked = isFull ? 1 : (doc.isLocked ? 1 : 0);
                        const newMahnung = isFull ? 0 : doc.mahnungLevel;

                        doc.bezahlt_betrag = neuBezahlt;
                        doc.offener_betrag = neuOffen;
                        doc.status = newStatus;
                        doc.isLocked = newLocked;
                        doc.mahnungLevel = newMahnung;
                        doc.sha256_hash = calculateDocumentContentHash(doc);

                        db.prepare(`
                            UPDATE dokumente
                            SET bezahlt_betrag = ?, offener_betrag = ?, status = ?,
                                isLocked = ?, mahnungLevel = ?, sha256_hash = ?
                            WHERE id = ?
                        `).run(neuBezahlt, neuOffen, newStatus, newLocked, newMahnung, doc.sha256_hash, doc.id);

                        appendAuditLog({
                            entityType: 'DOKUMENT',
                            entityId: Number(doc.id),
                            action: 'ZAHLUNGSEINGANG',
                            details: {
                                transaktionId: txRow.id,
                                buchungstag: txRow.buchungstag,
                                zahlbetrag: matchBetrag,
                                skontoAbzug,
                                status: newStatus
                            }
                        });
                    }
                }

                if (m.eingangsrechnungId) {
                    const er = db.prepare('SELECT * FROM eingangsrechnungen WHERE id = ?').get(m.eingangsrechnungId);
                    if (er) {
                        db.prepare(`
                            UPDATE eingangsrechnungen
                            SET zahlungs_status = 'BEZAHLT', bezahlt_am = ?
                            WHERE id = ?
                        `).run(txRow.buchungstag, er.id);

                        appendAuditLog({
                            entityType: 'EINGANGSRECHNUNG',
                            entityId: Number(er.id),
                            action: 'BEZAHLT',
                            details: {
                                transaktionId: txRow.id,
                                betrag: matchBetrag
                            }
                        });
                    }
                }

                applied++;
            }

            return { success: true, count: applied };
        });

        return tx();
    },

    unmatchTransaction(zuordnungId, grund = '') {
        const zuordnung = db.prepare('SELECT * FROM zahlung_zuordnungen WHERE id = ?').get(zuordnungId);
        if (!zuordnung) throw new Error(`Zuordnung #${zuordnungId} nicht gefunden.`);

        const tx = db.transaction(() => {
            if (zuordnung.dokument_id) {
                const doc = getDocumentWithChildren(zuordnung.dokument_id);
                if (doc) {
                    const altBezahlt = Math.round((parseFloat(doc.bezahlt_betrag) || 0) * 100) / 100;
                    const neuBezahlt = Math.max(0, Math.round((altBezahlt - zuordnung.betrag) * 100) / 100);
                    const docBrutto = Math.round((parseFloat(doc.brutto) || 0) * 100) / 100;
                    const neuOffen = Math.round((docBrutto - neuBezahlt) * 100) / 100;

                    const newStatus = neuBezahlt <= 0.009 ? 'Ausstehend' : 'Teilweise bezahlt';
                    const newLocked = 0;

                    doc.bezahlt_betrag = neuBezahlt;
                    doc.offener_betrag = neuOffen;
                    doc.status = newStatus;
                    doc.isLocked = newLocked;
                    doc.sha256_hash = calculateDocumentContentHash(doc);

                    db.prepare(`
                        UPDATE dokumente
                        SET bezahlt_betrag = ?, offener_betrag = ?, status = ?,
                            isLocked = ?, sha256_hash = ?
                        WHERE id = ?
                    `).run(neuBezahlt, neuOffen, newStatus, newLocked, doc.sha256_hash, doc.id);

                    appendAuditLog({
                        entityType: 'DOKUMENT',
                        entityId: Number(doc.id),
                        action: 'ZAHLUNG_ENTKOPPELT',
                        details: {
                            zuordnungId,
                            betrag: zuordnung.betrag,
                            grund: grund || 'Manuelle Entkopplung'
                        }
                    });
                }
            }

            if (zuordnung.eingangsrechnung_id) {
                db.prepare(`
                    UPDATE eingangsrechnungen
                    SET zahlungs_status = 'OFFEN', bezahlt_am = NULL
                    WHERE id = ?
                `).run(zuordnung.eingangsrechnung_id);

                appendAuditLog({
                    entityType: 'EINGANGSRECHNUNG',
                    entityId: Number(zuordnung.eingangsrechnung_id),
                    action: 'ZAHLUNG_ENTKOPPELT',
                    details: {
                        zuordnungId,
                        grund: grund || 'Manuelle Entkopplung'
                    }
                });
            }

            const txRow = db.prepare('SELECT * FROM bank_transaktionen WHERE id = ?').get(zuordnung.transaktion_id);
            if (txRow) {
                const neuZugeordnet = Math.max(0, Math.round(((txRow.zugeordneter_betrag || 0) - zuordnung.betrag) * 100) / 100);
                const txStatus = neuZugeordnet <= 0.009 ? 'OFFEN' : 'TEILWEISE_ZUGEORDNET';
                db.prepare('UPDATE bank_transaktionen SET zugeordneter_betrag = ?, status = ? WHERE id = ?').run(
                    neuZugeordnet,
                    txStatus,
                    txRow.id
                );
            }

            db.prepare('DELETE FROM zahlung_zuordnungen WHERE id = ?').run(zuordnungId);

            return { success: true };
        });

        return tx();
    },

    getKundenMandate(kundeId = null) {
        let sql = `
            SELECT m.*, k.name as kunden_name, k.kundennummer
            FROM kunden_sepa_mandate m
            JOIN kunden k ON m.kunde_id = k.id
            WHERE 1=1
        `;
        const params = [];
        if (kundeId) {
            sql += ' AND m.kunde_id = ?';
            params.push(kundeId);
        }
        sql += ' ORDER BY m.status ASC, m.created_at DESC';
        return db.prepare(sql).all(...params);
    },

    saveSepaMandat(mandat) {
        if (!mandat || !mandat.kunde_id || !mandat.mandatsreferenz || !mandat.iban) {
            throw new Error('Kunde, Mandatsreferenz und IBAN sind Pflichtfelder.');
        }
        const cleanIban = String(mandat.iban).replace(/[\s-]+/g, '').toUpperCase();
        const cleanBic = String(mandat.bic || '').replace(/[\s-]+/g, '').toUpperCase();
        if (!SepaController.validateIban(cleanIban)) {
            throw new Error(`Ungültige IBAN: ${mandat.iban}`);
        }

        const tx = db.transaction(() => {
            let mandatId = mandat.id;
            const unterschrift = mandat.unterschrifts_datum || new Date().toISOString().substring(0, 10);
            const preNotTage = parseInt(mandat.pre_notification_tage, 10) || 14;

            if (mandatId) {
                db.prepare(`
                    UPDATE kunden_sepa_mandate
                    SET mandatsreferenz = ?, mandats_typ = ?, sequenz_typ = ?,
                        unterschrifts_datum = ?, iban = ?, bic = ?, kontoinhaber = ?,
                        bank_name = ?, status = ?, gueltig_bis = ?, pre_notification_tage = ?,
                        bemerkung = ?
                    WHERE id = ?
                `).run(
                    mandat.mandatsreferenz.trim(),
                    mandat.mandats_typ || 'CORE',
                    mandat.sequenz_typ || 'FRST',
                    unterschrift,
                    cleanIban,
                    cleanBic,
                    (mandat.kontoinhaber || '').trim(),
                    (mandat.bank_name || '').trim(),
                    mandat.status || 'AKTIV',
                    mandat.gueltig_bis || null,
                    preNotTage,
                    mandat.bemerkung || null,
                    mandatId
                );
                appendAuditLog({ entityType: 'SEPA_MANDAT', entityId: Number(mandatId), action: 'AKTUALISIERT', details: { ref: mandat.mandatsreferenz } });
            } else {
                const info = db.prepare(`
                    INSERT INTO kunden_sepa_mandate (
                        kunde_id, mandatsreferenz, mandats_typ, sequenz_typ,
                        unterschrifts_datum, iban, bic, kontoinhaber,
                        bank_name, status, gueltig_bis, pre_notification_tage, bemerkung
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    mandat.kunde_id,
                    mandat.mandatsreferenz.trim(),
                    mandat.mandats_typ || 'CORE',
                    mandat.sequenz_typ || 'FRST',
                    unterschrift,
                    cleanIban,
                    cleanBic,
                    (mandat.kontoinhaber || '').trim(),
                    (mandat.bank_name || '').trim(),
                    mandat.status || 'AKTIV',
                    mandat.gueltig_bis || null,
                    preNotTage,
                    mandat.bemerkung || null
                );
                mandatId = info.lastInsertRowid;
                appendAuditLog({ entityType: 'SEPA_MANDAT', entityId: Number(mandatId), action: 'ERSTELLT', details: { ref: mandat.mandatsreferenz } });
            }

            db.prepare(`
                UPDATE kunden
                SET iban = ?, bic = ?, bank_name = ?, kontoinhaber = ?, sepa_mandat_aktiv = ?
                WHERE id = ?
            `).run(
                cleanIban,
                cleanBic,
                (mandat.bank_name || '').trim(),
                (mandat.kontoinhaber || '').trim(),
                mandat.status === 'AKTIV' ? 1 : 0,
                mandat.kunde_id
            );

            return db.prepare(`
                SELECT m.*, k.name as kunden_name, k.kundennummer
                FROM kunden_sepa_mandate m
                JOIN kunden k ON m.kunde_id = k.id
                WHERE m.id = ?
            `).get(mandatId);
        });

        return tx();
    },

    deleteSepaMandat(id) {
        const mandate = db.prepare('SELECT * FROM kunden_sepa_mandate WHERE id = ?').get(id);
        if (!mandate) return { success: true };

        const posCount = db.prepare('SELECT COUNT(*) as cnt FROM sepa_lastschrift_positionen WHERE mandat_id = ?').get(id).cnt;
        if (posCount > 0) {
            db.prepare("UPDATE kunden_sepa_mandate SET status = 'WIDERRUFEN' WHERE id = ?").run(id);
            appendAuditLog({ entityType: 'SEPA_MANDAT', entityId: Number(id), action: 'WIDERRUFEN', details: 'Mandat widerrufen.' });
        } else {
            db.prepare('DELETE FROM kunden_sepa_mandate WHERE id = ?').run(id);
            appendAuditLog({ entityType: 'SEPA_MANDAT', entityId: Number(id), action: 'GELOESCHT', details: 'Mandat gelöscht.' });
        }

        const activeRemaining = db.prepare("SELECT COUNT(*) as cnt FROM kunden_sepa_mandate WHERE kunde_id = ? AND status = 'AKTIV'").get(mandate.kunde_id).cnt;
        if (activeRemaining === 0) {
            db.prepare('UPDATE kunden SET sepa_mandat_aktiv = 0 WHERE id = ?').run(mandate.kunde_id);
        }

        return { success: true };
    },

    getOffeneRechnungenFuerSepa() {
        return db.prepare(`
            SELECT d.*, k.name as kunden_name, k.kundennummer,
                   m.id as mandat_id, m.mandatsreferenz, m.mandats_typ, m.sequenz_typ,
                   m.unterschrifts_datum, m.iban as mandat_iban, m.bic as mandat_bic,
                   m.kontoinhaber as mandat_kontoinhaber, m.pre_notification_tage
            FROM dokumente d
            JOIN kunden k ON d.kundeId = k.id
            JOIN kunden_sepa_mandate m ON m.kunde_id = k.id AND m.status = 'AKTIV'
            WHERE d.type = 'rechnung' AND d.status NOT IN ('Bezahlt', 'Storniert')
              AND (d.offener_betrag IS NULL OR d.offener_betrag > 0)
            ORDER BY d.faellig ASC, d.id ASC
        `).all();
    },

    createSepaRun(payload = {}) {
        if (!payload.bankKontoId) {
            throw new Error('Bankkonto für den Lastschriftlauf ist erforderlich.');
        }
        const bankKonto = db.prepare('SELECT * FROM bank_konten WHERE id = ?').get(payload.bankKontoId);
        if (!bankKonto) throw new Error(`Bankkonto #${payload.bankKontoId} nicht gefunden.`);

        const settingsRows = db.prepare('SELECT key, value FROM einstellungen').all();
        const settings = {};
        for (const r of settingsRows) settings[r.key] = r.value;

        const creditorId = bankKonto.glaeubiger_id || settings.glaeubiger_id || 'DE98ZZZ09999999999';
        const creditorName = bankKonto.kontoinhaber || settings.firmenname || 'W-Link ERP';
        const creditorIban = bankKonto.iban;
        const creditorBic = bankKonto.bic;

        const xmlFormat = payload.xmlFormat || settings.sepa_xml_standard || 'pain.008.001.08';
        const schemeType = payload.sammelTyp || 'CORE';
        const sequenceType = payload.sequenzTyp || 'RCUR';
        const executionDate = payload.ausfuehrungsDatum || SepaController.getNextTarget2BankingDay(new Date().toISOString().substring(0, 10), 1);

        const tx = db.transaction(() => {
            const todayStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
            const randomSuffix = String(Math.floor(1000 + Math.random() * 9000));
            const laufNr = `SEPA-${todayStr}-${randomSuffix}`;
            const msgId = `MSG-${todayStr}-${randomSuffix}`;

            let invoiceIds = Array.isArray(payload.invoiceIds) ? payload.invoiceIds : [];
            let items = [];

            if (invoiceIds.length > 0) {
                const placeholders = invoiceIds.map(() => '?').join(',');
                items = db.prepare(`
                    SELECT d.*, k.name as kunden_name, k.kundennummer,
                           m.id as mandat_id, m.mandatsreferenz, m.mandats_typ, m.sequenz_typ,
                           m.unterschrifts_datum, m.iban as mandat_iban, m.bic as mandat_bic,
                           m.kontoinhaber as mandat_kontoinhaber, m.pre_notification_tage
                    FROM dokumente d
                    JOIN kunden k ON d.kundeId = k.id
                    JOIN kunden_sepa_mandate m ON m.kunde_id = k.id AND m.status = 'AKTIV'
                    WHERE d.id IN (${placeholders})
                `).all(...invoiceIds);
            } else if (Array.isArray(payload.positions) && payload.positions.length > 0) {
                items = payload.positions;
            }

            if (items.length === 0) {
                throw new Error('Keine fälligen Rechnungen mit aktivem SEPA-Mandat ausgewählt.');
            }

            const transactions = [];
            let totalSum = 0;

            for (const item of items) {
                const offenerBetrag = item.betrag !== undefined
                    ? parseFloat(item.betrag)
                    : (item.offener_betrag !== null && item.offener_betrag !== undefined
                        ? parseFloat(item.offener_betrag)
                        : Math.round(((item.brutto || 0) - (item.bezahlt_betrag || 0)) * 100) / 100);

                if (offenerBetrag <= 0) continue;

                const posBetrag = Math.round(offenerBetrag * 100) / 100;
                totalSum += posBetrag;

                const endToEndId = `E2E-${item.nr || item.dokument_id || Date.now()}-${item.mandat_id}`;
                const verwendungszweck = item.verwendungszweck || `Rechnung ${item.nr || ''}`;

                transactions.push({
                    dokumentId: item.id || item.dokument_id,
                    dauerrechnungLaufId: item.dauerrechnung_lauf_id || null,
                    mandatId: item.mandat_id,
                    endToEndId,
                    betrag: posBetrag,
                    mandatsreferenz: item.mandatsreferenz,
                    unterschriftsDatum: item.unterschrifts_datum,
                    kundenName: item.kunden_name,
                    kontoinhaber: item.mandat_kontoinhaber || item.kunden_name,
                    iban: item.mandat_iban || item.iban,
                    bic: item.mandat_bic || item.bic,
                    verwendungszweck,
                    belegNr: item.nr
                });
            }

            totalSum = Math.round(totalSum * 100) / 100;

            const xmlContent = SepaController.generatePain008Xml({
                msgId,
                initiatorName: creditorName,
                creditorName,
                creditorIban,
                creditorBic,
                creditorId,
                executionDate,
                schemeType,
                sequenceType,
                schemaVersion: xmlFormat,
                transactions
            });

            const runInfo = db.prepare(`
                INSERT INTO sepa_lastschrift_laeufe (
                    lauf_nr, bank_konto_id, sammel_typ, sequenz_typ,
                    ausfuehrungs_datum, anzahl_transaktionen, summe_gesamt,
                    xml_format, xml_content, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ERSTELLT')
            `).run(
                laufNr,
                payload.bankKontoId,
                schemeType,
                sequenceType,
                executionDate,
                transactions.length,
                totalSum,
                xmlFormat,
                xmlContent
            );

            const laufId = runInfo.lastInsertRowid;

            const posStmt = db.prepare(`
                INSERT INTO sepa_lastschrift_positionen (
                    lauf_id, dokument_id, dauerrechnung_lauf_id, mandat_id,
                    betrag, verwendungszweck, end_to_end_id, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'EINGEREICHT')
            `);

            for (const txItem of transactions) {
                posStmt.run(
                    laufId,
                    txItem.dokumentId || null,
                    txItem.dauerrechnungLaufId || null,
                    txItem.mandatId,
                    txItem.betrag,
                    txItem.verwendungszweck,
                    txItem.endToEndId
                );

                db.prepare(`
                    UPDATE kunden_sepa_mandate
                    SET letzter_einzug_am = ?, letzte_lauf_nr = ?,
                        sequenz_typ = CASE WHEN sequenz_typ = 'FRST' THEN 'RCUR' ELSE sequenz_typ END
                    WHERE id = ?
                `).run(executionDate, laufNr, txItem.mandatId);
            }

            appendAuditLog({
                entityType: 'SEPA_RUN',
                entityId: Number(laufId),
                action: 'ERSTELLT',
                details: {
                    laufNr,
                    anzahl: transactions.length,
                    summe: totalSum,
                    ausfuehrung: executionDate
                }
            });

            return {
                id: laufId,
                laufId,
                laufNr,
                anzahlTransaktionen: transactions.length,
                summeGesamt: totalSum,
                ausfuehrungsDatum: executionDate,
                xmlContent
            };
        });

        return tx();
    },

    getSepaLaeufe() {
        return db.prepare(`
            SELECT sl.*, bk.kontoname, bk.iban as konto_iban
            FROM sepa_lastschrift_laeufe sl
            JOIN bank_konten bk ON sl.bank_konto_id = bk.id
            ORDER BY sl.created_at DESC, sl.id DESC
        `).all();
    },

    getSepaLaufDetails(laufId) {
        const lauf = db.prepare(`
            SELECT sl.*, bk.kontoname, bk.iban as konto_iban, bk.bic as konto_bic
            FROM sepa_lastschrift_laeufe sl
            JOIN bank_konten bk ON sl.bank_konto_id = bk.id
            WHERE sl.id = ?
        `).get(laufId);
        if (!lauf) throw new Error(`SEPA-Lauf #${laufId} nicht gefunden.`);

        lauf.positionen = db.prepare(`
            SELECT sp.*, d.nr as beleg_nr, d.datum as beleg_datum,
                   m.mandatsreferenz, m.iban as kunden_iban, m.kontoinhaber, k.name as kunden_name
            FROM sepa_lastschrift_positionen sp
            LEFT JOIN dokumente d ON sp.dokument_id = d.id
            JOIN kunden_sepa_mandate m ON sp.mandat_id = m.id
            JOIN kunden k ON m.kunde_id = k.id
            WHERE sp.lauf_id = ?
            ORDER BY sp.id ASC
        `).all(laufId);

        return lauf;
    },

    exportSepaRunXml(laufId) {
        const lauf = db.prepare('SELECT * FROM sepa_lastschrift_laeufe WHERE id = ?').get(laufId);
        if (!lauf) throw new Error(`SEPA-Lauf #${laufId} nicht gefunden.`);

        db.prepare("UPDATE sepa_lastschrift_laeufe SET status = 'EXPORTIERT', exportiert_am = CURRENT_TIMESTAMP WHERE id = ?").run(laufId);
        appendAuditLog({
            entityType: 'SEPA_RUN',
            entityId: Number(laufId),
            action: 'EXPORTIERT',
            details: `XML-Export für Lauf ${lauf.lauf_nr}`
        });

        return {
            id: laufId,
            laufId,
            laufNr: lauf.lauf_nr,
            xmlContent: lauf.xml_content,
            summeGesamt: lauf.summe_gesamt
        };
    }
};

module.exports = {
    db,
    dbAPI,
    appendAuditLog: auditLogger.appendAuditLog,
    verifiziereAuditKette: auditLogger.verifiziereAuditKette,
    calculateDocumentContentHash
};
