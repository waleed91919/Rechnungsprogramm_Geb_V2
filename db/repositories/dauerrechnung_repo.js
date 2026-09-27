/**
 * Dauerrechnung Repository
 * Abrechnungspläne, periodische Rechnungsläufe, Sammelrechnungen (F2)
 */
const DauerrechnungController = require('../../controllers/DauerrechnungController');
const InvoiceController = require('../../controllers/InvoiceController');

function createDauerrechnungRepo(deps) {
    const {
        db, dbQuery, dbRun, appendAuditLog, dbAPI,
        applyDocumentWrite, getDocumentWithChildren,
        baueObjektPfad, loeseObjektEmpfaengerAuf, ladeObjekteState,
        leseZuschlagsProfil, kalkuliereLvPosition, OBJEKT_EBENEN
    } = deps;

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

    const repo = {
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
    }
    };

    return repo;
}

module.exports = createDauerrechnungRepo;
