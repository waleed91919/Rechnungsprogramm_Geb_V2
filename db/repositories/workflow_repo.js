/**
 * workflow_repo.js — Vorgangs-Strang (End-to-End State) Persistenz-Schicht.
 *
 * Schließt die Lücken zwischen den bestehenden Teilstrecken, ohne deren
 * Guards (GoBD, J1-Schluss-Sperre, Freeze, §14-VOB/B-Prüfbarkeit) zu umgehen:
 *  - Vorgänger → Rechnung (Angebot/Auftrag/Lieferschein, speichernd, mit Herkunft)
 *  - Aufmaß → Abschlag (aus freigegebenen Blättern, inkl. Einbehalt)
 *  - Aufmaß + Nachträge → Schlussrechnung (Verrechnungen automatisch, J1-konform)
 *  - Sicherheitseinbehalt-Freigabe nach Gewährleistung (HELD → RELEASED/Bürgschaft)
 *  - Vorgangskette (ein Strang lesbar: GAEB → Angebot → AB → Aufmaß → Belege → OPOS → Einbehalt)
 *
 * Reine Bausteine in controllers/WorkflowController.js (DB-frei, testbar),
 * Summen via controllers/InvoiceController.js (Money-SSoT).
 */
const WorkflowController = require('../../controllers/WorkflowController');
const InvoiceController = require('../../controllers/InvoiceController');
const NachtragController = require('../../controllers/NachtragController');

function createWorkflowRepo(deps) {
    const { db, appendAuditLog, dbAPI } = deps;

    const audit = (entityType, entityId, action, details) => {
        try {
            appendAuditLog({ entityType, entityId, action, details });
        } catch (_e) { /* Audit darf Workflow nie brechen */ }
    };

    function loadProjekt(pId) {
        const projekt = db.prepare('SELECT * FROM projekte WHERE id=?').get(pId);
        if (!projekt) throw new Error(`Projekt #${pId} nicht gefunden.`);
        return projekt;
    }

    function requireKunde(projekt) {
        const kundeId = projekt.kunde_id || projekt.kundeId || null;
        if (!kundeId) {
            throw new Error('Das Projekt besitzt keinen zugeordneten Kunden. Bitte erst Kunden im Projekt hinterlegen (kein Abtippen auf Belegebene).');
        }
        return kundeId;
    }

    function nextBelegNr(type) {
        const prefixMap = { rechnung: 'RE', auftrag: 'AB', angebot: 'A', lieferschein: 'LS' };
        const prefix = prefixMap[type] || 'RE';
        const year = new Date().getFullYear();
        const rows = db.prepare('SELECT nr FROM dokumente WHERE type=?').all(type);
        return WorkflowController.nextBelegNr(prefix, rows.map(r => r.nr), year);
    }

    function previousAbschlaege(pId) {
        return db.prepare(`
            SELECT * FROM dokumente
            WHERE projektId=? AND type='rechnung' AND status!='Storniert'
              AND rechnungsart IN ('ABSCHLAG','TEILSCHLUSSRECHNUNG','ABSCHLAG_KUMULIERT')
            ORDER BY id ASC
        `).all(pId);
    }

    function retentionRateOf(projekt) {
        const r = parseFloat(projekt.sicherheitseinbehalt_prozent);
        return Number.isFinite(r) && r >= 0 ? r : 5.0;
    }

    function applyTotals(doc, totals, { kumulierteNetto = null } = {}) {
        doc.netto = totals.nettoNachRabatt;
        doc.steuer = totals.totalTax;
        doc.brutto = totals.bruttoNachRabatt;
        doc.zahlbetrag = totals.zahlbetrag;
        doc.sicherheitseinbehalt = totals.sicherheitseinbehaltNetto || 0;
        if (kumulierteNetto !== null) doc.kumulierte_leistung_netto = kumulierteNetto;
        return doc;
    }

    function setBlattInvoice(blattIds, invoiceId) {
        if (!blattIds || blattIds.length === 0) return;
        const stmt = db.prepare('UPDATE aufmass_blaetter SET invoice_id=? WHERE id=?');
        for (const bId of new Set(blattIds.filter(Boolean))) {
            try { stmt.run(invoiceId, bId); } catch (_e) { /* Blatt evtl. gelöscht */ }
        }
    }

    const repo = {
        // --- Vorgänger → Rechnung (speichernd, ohne Abtippen) ---
        async createRechnungFromVorgaenger(vorgaengerId, opts = {}) {
            const vId = Number(vorgaengerId);
            if (!Number.isInteger(vId) || vId <= 0) throw new Error('Ungültige Vorgänger-ID.');
            const src = dbAPI.getDocumentById(vId);
            if (!src) throw new Error(`Quellbeleg #${vId} nicht gefunden.`);
            const doc = WorkflowController.buildRechnungFromVorgaenger(src, {
                rechnungsart: opts.rechnungsart || 'REGULAER',
                nr: opts.nr || nextBelegNr('rechnung'),
                datum: opts.datum,
                faellig: opts.faellig,
                bemerkung: opts.bemerkung
            });
            const totals = InvoiceController.calculateTotals({ positionen: doc.positionen });
            applyTotals(doc, totals);
            const id = await dbAPI.saveDocument(doc);
            audit('DOCUMENT', id, 'VORGANG_UEBERNAHME', {
                quelle: `${doc.herkunft_typ} #${src.id} (${src.nr || ''})`,
                ziel: `RECHNUNG #${id} (${doc.nr})`,
                positionen: doc.positionen.length
            });
            return { success: true, id, nr: doc.nr, herkunft: { typ: doc.herkunft_typ, id: src.id } };
        },

        // --- Aufmaß → Abschlag (nur freigegebene Blätter, § 14 VOB/B) ---
        async createAbschlagFromAufmass(projectId, opts = {}) {
            const pId = Number(projectId);
            if (!Number.isInteger(pId) || pId <= 0) throw new Error('Ungültige Projekt-ID.');
            const projekt = loadProjekt(pId);
            const kundeId = requireKunde(projekt);

            const merge = await dbAPI.mergeSchlussaufmass(pId, { includeDrafts: opts.includeDrafts === true });
            const rows = (merge && merge.rows) || [];
            if (rows.length === 0) {
                throw new Error('Keine freigegebenen Aufmaßmengen (Blätter prüfen: Status VERIFIED/FINALIZED erforderlich).');
            }
            if (merge.warnings && merge.warnings.length > 0) {
                const ozs = merge.warnings.map(w => w.oz_code).join(', ');
                throw new Error(`Übergabe blockiert (Prüfbarkeit §14 VOB/B): Kein Vertragspreis für OZ(s): ${ozs}`);
            }
            const priced = rows.filter(r => (parseFloat(r.einheitspreis) || 0) > 0);
            const skippedZeroPrice = rows.filter(r => !((parseFloat(r.einheitspreis) || 0) > 0)).map(r => r.oz_code);
            if (priced.length === 0) {
                throw new Error('Keine bepreisten Aufmaßmengen (alle Einheitspreise 0 — LV-Preise prüfen).');
            }

            const previous = previousAbschlaege(pId);
            const rate = opts.sicherheitseinbehaltProzent !== undefined
                ? parseFloat(opts.sicherheitseinbehaltProzent) : retentionRateOf(projekt);
            const positionen = WorkflowController.buildPositionenFromAufmass(priced);
            const totals = InvoiceController.calculateTotals({
                positionen,
                sicherheitseinbehaltProzent: rate,
                retentionMode: 'EXECUTION',
                contractTotalNet: parseFloat(projekt.budget) || 0,
                previousInvoices: previous
            });
            const prevNet = previous.reduce((s, d) => s + (parseFloat(d.kumulierte_leistung_netto) || parseFloat(d.netto) || 0), 0);
            const R2 = (v) => WorkflowController.round2(v);

            const today = new Date().toISOString().slice(0, 10);
            const doc = {
                id: null,
                type: 'rechnung',
                typ: 'RECHNUNG',
                nr: opts.nr || nextBelegNr('rechnung'),
                kundeId,
                projektId: pId,
                status: 'Entwurf',
                isLocked: 0,
                datum: opts.datum || today,
                faellig: opts.faellig || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
                eingabemodus: 'netto',
                rechnungsart: opts.kumuliert === false ? 'ABSCHLAG' : 'ABSCHLAG_KUMULIERT',
                sicherheitseinbehalt_prozent: rate,
                retentionMode: 'EXECUTION',
                herkunft_typ: 'AUFMASS',
                herkunft_id: null,
                bemerkung: `Automatisch aus freigegebenem Aufmaß erzeugt (${priced.length} Positionen).`,
                positionen
            };
            applyTotals(doc, totals, { kumulierteNetto: R2(prevNet + totals.positionenNetto) });

            const id = await dbAPI.saveDocument(doc);
            setBlattInvoice(priced.map(r => r.blatt_id), id);
            audit('DOCUMENT', id, 'ABSCHLAG_AUS_AUFMASS', {
                projektId: pId, positionen: positionen.length, kumulierteNetto: doc.kumulierte_leistung_netto,
                einbehalt: doc.sicherheitseinbehalt, skippedZeroPrice
            });
            return { success: true, id, nr: doc.nr, positionCount: positionen.length, skippedZeroPrice };
        },

        // --- Aufmaß + Nachträge → Schlussrechnung (Verrechnungen automatisch) ---
        async createSchlussrechnung(projectId, opts = {}) {
            const pId = Number(projectId);
            if (!Number.isInteger(pId) || pId <= 0) throw new Error('Ungültige Projekt-ID.');
            const projekt = loadProjekt(pId);
            const kundeId = requireKunde(projekt);

            const existingSchluss = db.prepare(`
                SELECT nr FROM dokumente
                WHERE projektId=? AND rechnungsart='SCHLUSSRECHNUNG' AND status!='Storniert'
            `).get(pId);
            if (existingSchluss) {
                throw new Error(`Für dieses Projekt existiert bereits die Schlussrechnung ${existingSchluss.nr} (genau eine je Projekt).`);
            }

            const merge = await dbAPI.mergeSchlussaufmass(pId, { includeDrafts: false });
            const rows = (merge && merge.rows) || [];
            if (rows.length === 0) {
                throw new Error('Keine freigegebenen Aufmaßmengen für die Schlussrechnung (Blätter freigeben).');
            }
            if (merge.warnings && merge.warnings.length > 0) {
                const ozs = merge.warnings.map(w => w.oz_code).join(', ');
                throw new Error(`Schlussrechnung blockiert (§14 VOB/B): Kein Vertragspreis für OZ(s): ${ozs}`);
            }
            const priced = rows.filter(r => (parseFloat(r.einheitspreis) || 0) > 0);
            const skippedZeroPrice = rows.filter(r => !((parseFloat(r.einheitspreis) || 0) > 0)).map(r => r.oz_code);
            if (priced.length === 0) {
                throw new Error('Keine bepreisten Aufmaßmengen für die Schlussrechnung.');
            }

            const previous = previousAbschlaege(pId);

            // Genehmigte Nachträge: Positionen in den Beleg + idempotent in den LV-Stamm
            let nachtragPositions = [];
            let lvAdded = 0;
            try {
                const nachtraege = await dbAPI.getNachtraege(pId);
                nachtragPositions = NachtragController.extractApprovedPositionsForInvoice(nachtraege || []);
                for (const n of (nachtraege || []).filter(n => n.status === 'GENEHMIGT')) {
                    try {
                        const lvRes = await dbAPI.uebernehmeNachtragInsLV(n.id);
                        lvAdded += (lvRes && lvRes.added) || 0;
                    } catch (_e) { /* LV-Stand ggf. bereits übernommen */ }
                }
            } catch (_e) { /* Nachtragsmodul ohne Daten */ }

            const build = WorkflowController.buildSchlussrechnung({
                mergeRows: priced,
                previousDocs: previous,
                nachtragPositions
            });

            const rate = opts.sicherheitseinbehaltProzent !== undefined
                ? parseFloat(opts.sicherheitseinbehaltProzent) : retentionRateOf(projekt);
            const totals = InvoiceController.calculateTotals({
                positionen: build.positionen,
                sicherheitseinbehaltProzent: rate,
                retentionMode: 'WARRANTY',
                contractTotalNet: parseFloat(projekt.budget) || 0,
                previousInvoices: previous,
                verrechnungen: build.verrechnungen
            });

            const today = new Date().toISOString().slice(0, 10);
            const doc = {
                id: null,
                type: 'rechnung',
                typ: 'RECHNUNG',
                nr: opts.nr || nextBelegNr('rechnung'),
                kundeId,
                projektId: pId,
                status: 'Entwurf',
                isLocked: 0,
                datum: opts.datum || today,
                faellig: opts.faellig || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
                eingabemodus: 'netto',
                rechnungsart: 'SCHLUSSRECHNUNG',
                sicherheitseinbehalt_prozent: rate,
                retentionMode: 'WARRANTY',
                herkunft_typ: 'AUFMASS',
                herkunft_id: null,
                bemerkung: `Schlussrechnung aus freigegebenem Aufmaß (${build.aufmassCount} Pos.) + ${build.nachtragCount} Nachtrags-Pos.; ${previous.length} Vorrechnung(en) automatisch verrechnet.`,
                positionen: build.positionen,
                verrechnungen: build.verrechnungen
            };
            // Schluss: Positionen SIND die Gesamtleistung → kumuliert = Beleg-Netto
            applyTotals(doc, totals, { kumulierteNetto: totals.nettoNachRabatt });

            const id = await dbAPI.saveDocument(doc);
            setBlattInvoice(priced.map(r => r.blatt_id), id);
            audit('DOCUMENT', id, 'SCHLUSSRECHNUNG_ERZEUGT', {
                projektId: pId, positionen: build.positionen.length,
                verrechnet: previous.map(d => d.nr), skippedOz: build.skippedOz,
                skippedZeroPrice, lvAdded, einbehalt: doc.sicherheitseinbehalt
            });
            return {
                success: true, id, nr: doc.nr,
                verrechnet: previous.map(d => ({ id: d.id, nr: d.nr })),
                skippedOz: build.skippedOz, skippedZeroPrice, lvAdded
            };
        },

        // --- Sicherheitseinbehalt: lesen + freigeben (nach Gewährleistung) ---
        getSecurityRetentions(projectId) {
            const pId = Number(projectId);
            if (!Number.isInteger(pId) || pId <= 0) throw new Error('Ungültige Projekt-ID.');
            return db.prepare(`
                SELECT sr.*, d.nr as rechnung_nr, d.datum as rechnung_datum, d.zahlbetrag as rechnung_zahlbetrag
                FROM security_retentions sr
                LEFT JOIN dokumente d ON d.id = sr.invoice_id
                WHERE sr.project_id=?
                ORDER BY sr.id ASC
            `).all(pId);
        },

        releaseSecurityRetention(retentionId, opts = {}) {
            const rId = Number(retentionId);
            if (!Number.isInteger(rId) || rId <= 0) throw new Error('Ungültige Einbehalt-ID.');
            const tx = db.transaction(() => {
                const row = db.prepare('SELECT * FROM security_retentions WHERE id=?').get(rId);
                if (!row) throw new Error(`Sicherheitseinbehalt #${rId} nicht gefunden.`);
                const patch = WorkflowController.buildRetentionRelease(row, opts);
                db.prepare('UPDATE security_retentions SET status=?, guarantee_document_ref=? WHERE id=?')
                    .run(patch.status, patch.guarantee_document_ref, rId);
                audit('SECURITY_RETENTION', rId, 'EINBEHALT_FREIGEGEBEN', {
                    project_id: row.project_id, invoice_id: row.invoice_id,
                    amount: row.amount, modus: patch.status,
                    garantie: patch.guarantee_document_ref, freigabeDatum: patch.released_at
                });
                const updated = db.prepare('SELECT * FROM security_retentions WHERE id=?').get(rId);
                // Freigegebener Einbehalt = fällige Werklohnforderung (InvoiceController.computeProjectBalance):
                // Der OPOS-Abgleich erwartet nun amount zusätzlich zum Zahlbetrag.
                updated.offenerRest = WorkflowController.round2(row.amount);
                return updated;
            });
            return tx();
        },

        // --- Ein Strang lesbar: GAEB → Angebot → AB → Aufmaß → Belege → OPOS → Einbehalt ---
        async getVorgangskette(projectId) {
            const pId = Number(projectId);
            if (!Number.isInteger(pId) || pId <= 0) throw new Error('Ungültige Projekt-ID.');
            const projekt = loadProjekt(pId);

            const dokumente = db.prepare(`SELECT * FROM dokumente WHERE projektId=? ORDER BY id ASC`).all(pId);
            // Quell-Angebot (projekte.source_angebot_id) gehört zum Strang, auch wenn
            // es selbst kein projektId trägt (Freeze: Angebot wird nicht umgeschrieben).
            const srcAngebotId = projekt.source_angebot_id ? Number(projekt.source_angebot_id) : null;
            let angebote = dokumente.filter(d => d.type === 'angebot');
            if (srcAngebotId && !angebote.some(a => Number(a.id) === srcAngebotId)) {
                const srcAng = db.prepare(`SELECT * FROM dokumente WHERE id=?`).get(srcAngebotId);
                if (srcAng) {
                    angebote = [srcAng, ...angebote];
                    if (!dokumente.some(d => Number(d.id) === srcAngebotId)) dokumente.unshift(srcAng);
                }
            }
            const auftraege = dokumente.filter(d => d.type === 'auftrag');
            const rechnungen = dokumente.filter(d => d.type === 'rechnung').map(d => {
                const positionen = db.prepare('SELECT id FROM positionen WHERE dokumentId=?').all(d.id);
                const verrechnungen = db.prepare('SELECT * FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?').all(d.id);
                const gezahlt = db.prepare('SELECT COALESCE(SUM(betrag),0) as s FROM zahlung_zuordnungen WHERE dokument_id=?').get(d.id);
                return {
                    id: d.id, nr: d.nr, rechnungsart: d.rechnungsart, status: d.status,
                    netto: d.netto, brutto: d.brutto, zahlbetrag: d.zahlbetrag,
                    sicherheitseinbehalt: d.sicherheitseinbehalt,
                    herkunft_typ: d.herkunft_typ, herkunft_id: d.herkunft_id,
                    parent_angebot_id: d.parent_angebot_id, source_auftrag_id: d.source_auftrag_id,
                    positionenCount: positionen.length, verrechnungen,
                    bezahlt: gezahlt ? gezahlt.s : 0,
                    offen: WorkflowController.offenerBetrag(d, gezahlt ? gezahlt.s : 0)
                };
            });

            let gaebImports = [];
            try {
                const angebotIds = [...new Set([
                    ...angebote.map(a => a.id),
                    ...dokumente.map(d => d.parent_angebot_id).filter(Boolean)
                ])];
                if (angebotIds.length > 0) {
                    const ph = angebotIds.map(() => '?').join(',');
                    gaebImports = db.prepare(`
                        SELECT DISTINCT gi.id, gi.file_name, gi.project_name, gi.imported_at, gla.angebot_id
                        FROM gaeb_imports gi
                        JOIN gaeb_import_angebote gla ON gla.import_id = gi.id
                        WHERE gla.angebot_id IN (${ph})
                    `).all(...angebotIds);
                }
            } catch (_e) { gaebImports = []; }

            let blaetter = [];
            try {
                const raw = await dbAPI.getAufmassBlaetter(pId);
                blaetter = (raw || []).map(b => ({
                    id: b.id, blatt_nummer: b.blatt_nummer, titel: b.titel,
                    status: b.status, invoice_id: b.invoice_id,
                    zeilenCount: Array.isArray(b.zeilen) ? b.zeilen.length : 0
                }));
            } catch (_e) { blaetter = []; }

            let nachtraege = [];
            try {
                const raw = await dbAPI.getNachtraege(pId);
                nachtraege = (raw || []).map(n => ({
                    id: n.id, nachtrag_nr: n.nachtrag_nr, titel: n.titel,
                    status: n.status, summe_netto: n.summe_netto,
                    positionenCount: Array.isArray(n.positionen) ? n.positionen.length : 0
                }));
            } catch (_e) { nachtraege = []; }

            let einbehalte = [];
            try {
                einbehalte = repo.getSecurityRetentions(pId);
            } catch (_e) { einbehalte = []; }

            return { projekt, gaebImports, angebote, auftraege, blaetter, rechnungen, nachtraege, einbehalte };
        }
    };

    return repo;
}

module.exports = createWorkflowRepo;
