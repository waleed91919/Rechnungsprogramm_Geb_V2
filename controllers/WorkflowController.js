/**
 * WorkflowController.js — Durchgängiger Datenfluss (End-to-End State).
 *
 * Kette: GAEB X83 Import → EFB-Kalkulation → Angebot → Auftragsbestätigung (AB)
 *   → Aufmaß (DA11/X31) → Abschlag → Nachtrag → Schlussrechnung
 *   → OPOS-Zahlungsabgleich (abzgl. Einbehalt) → Freigabe Sicherheitseinbehalt.
 *
 * Reine, DB-freie Bausteine: jeder Übergang kopiert Zahlen per Referenz
 * (IDs statt Abtippen). Persistenz/Herkunftsspalten liegen in
 * db/repositories/workflow_repo.js, IPC in main/ipc/ipc-workflow.js.
 *
 * SSoT: alle Rundungen über js/money.js (EN 16931, 2 NK, mit EPSILON).
 */
'use strict';

function __resolveMoney_wf() {
    if (typeof Money !== 'undefined' && Money && typeof Money.round2 === 'function') return Money;
    if (typeof window !== 'undefined' && window.Money) return window.Money;
    if (typeof globalThis !== 'undefined' && globalThis.Money) return globalThis.Money;
    try {
        if (typeof require !== 'undefined') return require('../js/money');
    } catch (e) { /* Renderer ohne money.js geladen */ }
    return null;
}

function __resolveDA11_wf() {
    if (typeof DA11Service !== 'undefined' && DA11Service) return DA11Service;
    if (typeof window !== 'undefined' && window.DA11Service) return window.DA11Service;
    if (typeof globalThis !== 'undefined' && globalThis.DA11Service) return globalThis.DA11Service;
    try {
        if (typeof require !== 'undefined') return require('../js/da11');
    } catch (e) { /* kein Parser verfügbar */ }
    return null;
}

/** Herkunftstypen des Vorgangs-Strangs (dokumente.herkunft_typ / positionen.herkunft_typ). */
const VORGANG_HERKUNFT = Object.freeze({
    GAEB: 'GAEB',
    ANGEBOT: 'ANGEBOT',
    AUFTRAG: 'AUFTRAG',
    LIEFERSCHEIN: 'LIEFERSCHEIN',
    AUFMASS: 'AUFMASS',
    NACHTRAG: 'NACHTRAG',
    ABSCHLAG: 'ABSCHLAG'
});

/** Erlaubte Vorgänger für eine speichernde Rechnungs-Erzeugung (kein Abtippen). */
const RECHNUNG_QUELLEN = Object.freeze(['angebot', 'auftrag', 'lieferschein']);

class WorkflowController {
    // ---------- OZ / Beträge (SSoT-nah) ----------

    /**
     * Normalisiert eine OZ für den Positions-Match.
     * DA11 liefert 9-stellig ohne Punkte ("01020030"), LV/GAEB mit Punkten
     * ("01.02.0030") — ohne Normierung matcht DA11 nie einen LV-Preis.
     */
    static normalizeOz(oz) {
        const s = (oz === undefined || oz === null) ? '' : String(oz);
        return s.toUpperCase().replace(/[^0-9A-Z]/g, '');
    }

    static round2(v) {
        const M = __resolveMoney_wf();
        if (M) return M.round2(v);
        const n = parseFloat(v);
        return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
    }

    static round3(v) {
        const n = parseFloat(v);
        return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 1000) / 1000 : 0;
    }

    /**
     * Fälliger Zahlbetrag eines Belegs: zahlbetrag (>0) hat Vorrang vor brutto.
     * Der Einbehalt ist bereits in zahlbetrag abgezogen (InvoiceController:
     * zahlbetrag = brutto − Anzahlung − Einbehalt − Verrechnungen).
     */
    static sollBetrag(doc) {
        const zb = parseFloat(doc && (doc.zahlbetrag !== undefined ? doc.zahlbetrag : doc.zahlBetrag));
        if (Number.isFinite(zb) && zb > 0) return WorkflowController.round2(zb);
        return WorkflowController.round2(doc && doc.brutto);
    }

    /** Offener Rest gegen bereits zugeordnete Zahlungen (nie negativ). */
    static offenerBetrag(doc, bezahlt) {
        const soll = WorkflowController.sollBetrag(doc);
        const paid = WorkflowController.round2(bezahlt);
        return Math.max(0, WorkflowController.round2(soll - paid));
    }

    // ---------- Vorgänger → Rechnung (speichernd, ohne Abtippen) ----------

    /**
     * Baut aus Angebot/Auftrag/Lieferschein einen Rechnungs-Entwurf.
     * Positionen werden per Referenz kopiert (herkunft_typ/herkunft_id +
     * parent_angebot_id/source_auftrag_id/lieferschein_quelle), Summen rechnet
     * der Aufrufer via InvoiceController.calculateTotals (kein Abtippen).
     */
    static buildRechnungFromVorgaenger(src, opts = {}) {
        if (!src || typeof src !== 'object') throw new Error('buildRechnungFromVorgaenger: Quellbeleg fehlt.');
        const srcType = String(src.type || '').toLowerCase();
        if (!RECHNUNG_QUELLEN.includes(srcType)) {
            throw new Error(`buildRechnungFromVorgaenger: Typ "${src.type}" kann nicht in eine Rechnung übernommen werden (erlaubt: ${RECHNUNG_QUELLEN.join(', ')}).`);
        }
        if (!src.id) throw new Error('buildRechnungFromVorgaenger: Quellbeleg ist nicht gespeichert (keine ID).');
        const srcPos = Array.isArray(src.positionen) ? src.positionen : [];
        if (srcPos.length === 0) throw new Error('buildRechnungFromVorgaenger: Quellbeleg enthält keine Positionen.');

        const herkunftTyp = srcType === 'angebot' ? VORGANG_HERKUNFT.ANGEBOT
            : srcType === 'auftrag' ? VORGANG_HERKUNFT.AUFTRAG
            : VORGANG_HERKUNFT.LIEFERSCHEIN;
        const today = new Date().toISOString().slice(0, 10);

        const positionen = srcPos.map((p) => {
            const copy = JSON.parse(JSON.stringify(p));
            delete copy.id;
            copy.herkunft_typ = herkunftTyp;
            copy.herkunft_id = src.id;
            if (srcType === 'lieferschein') {
                copy.lieferschein_quelle = `LS:${src.id}:POS:${p.id || p.oz || p.oz_code || p.name || '?'}`;
            }
            // Nachtrags-/Aufmaß-Herkunft bleibt erhalten (Kette reißt nicht ab).
            return copy;
        });

        return {
            id: null,
            type: 'rechnung',
            typ: opts.typ || 'RECHNUNG',
            nr: opts.nr || null,
            kundeId: src.kundeId !== undefined ? src.kundeId : (src.kunde_id || null),
            projektId: src.projektId !== undefined ? src.projektId : (src.projekt_id || null),
            status: 'Entwurf',
            isLocked: 0,
            datum: opts.datum || today,
            faellig: opts.faellig || null,
            eingabemodus: src.eingabemodus || 'netto',
            rechnungsart: opts.rechnungsart || 'REGULAER',
            // Vorgänger-Referenzen (kein Abtippen, Kette bleibt lesbar):
            parent_angebot_id: srcType === 'angebot' ? src.id : (src.parent_angebot_id || null),
            source_auftrag_id: srcType === 'auftrag' ? src.id : (src.source_auftrag_id || null),
            herkunft_typ: herkunftTyp,
            herkunft_id: src.id,
            // Kopf-Konditionen wandern mit (kein Neu-Eintippen):
            globalRabattAbzug: src.globalRabattAbzug || 0,
            globalRabattType: src.globalRabattType || '%',
            globalRabattValue: src.globalRabattValue || 0,
            anzahlung: src.anzahlung || 0,
            vortext: src.vortext || '',
            fusstext: src.fusstext || '',
            leistungszeitraum_von: src.leistungszeitraum_von || null,
            leistungszeitraum_bis: src.leistungszeitraum_bis || null,
            baustellen_adresse: src.baustellen_adresse || null,
            vob_vereinbart: src.vob_vereinbart || 0,
            unterliegt_13b: src.unterliegt_13b || 0,
            unterliegt_bauabzugsteuer: src.unterliegt_bauabzugsteuer || 0,
            leitweg_id: src.leitweg_id || null,
            buyer_reference: src.buyer_reference || null,
            objekt_typ: src.objekt_typ || null,
            objekt_id: src.objekt_id == null ? null : src.objekt_id,
            skonto_tage: src.skonto_tage || 0,
            skonto_prozent: src.skonto_prozent || 0,
            bemerkung: opts.bemerkung || `Erstellt aus ${herkunftTyp} ${src.nr || src.id} ohne Neu-Erfassung.`,
            positionen
        };
    }

    // ---------- Aufmaß → Abschlag/Schluss ----------

    /**
     * Baut aus mergeSchlussaufmass-Zeilen Belegpositionen mit Herkunft je Blatt.
     * Rundung erst auf Positionsebene (Menge 3 NK), Preise aus LV-Preisfindung.
     */
    static buildPositionenFromAufmass(mergeRows = [], opts = {}) {
        const now = new Date().toISOString();
        const quelle = opts.quelle || 'mergeSchlussaufmass';
        return (mergeRows || []).map((a, idx) => ({
            name: a.bezeichnung || a.oz_code || `Aufmaßposition ${idx + 1}`,
            oz: a.oz_code,
            oz_code: a.oz_code,
            menge: WorkflowController.round3(a.summe_menge),
            preis: parseFloat(a.einheitspreis) || 0,
            einheit: a.einheit || 'm²',
            mwst: a.mwst !== undefined && a.mwst !== null ? a.mwst : 19,
            aufmass_blatt_id: a.blatt_id !== undefined ? a.blatt_id : (a.aufmass_blatt_id || null),
            aufmass_menge: WorkflowController.round3(a.summe_menge),
            aufmass_quelle: quelle,
            aufmass_zeitstempel: now,
            herkunft_typ: VORGANG_HERKUNFT.AUFMASS,
            herkunft_id: a.blatt_id !== undefined ? a.blatt_id : (a.aufmass_blatt_id || null)
        }));
    }

    /**
     * Baut die Schlussrechnung: Aufmaßmengen (gemessen gewinnt) + genehmigte
     * Nachträge (nur OZs, die NICHT bereits gemessen sind — kein Doppel-Ansatz)
     * + automatische Verrechnung ALLER Vor-Abschläge (J1-Guard-konform).
     */
    static buildSchlussrechnung({ mergeRows = [], previousDocs = [], nachtragPositions = [] } = {}) {
        if (!Array.isArray(mergeRows) || mergeRows.length === 0) {
            throw new Error('buildSchlussrechnung: Keine Aufmaßmengen (mergeSchlussaufmass leer — Blätter prüfen/freigeben).');
        }
        const coveredOz = new Set(
            mergeRows.map((r) => WorkflowController.normalizeOz(r.oz_code)).filter(Boolean)
        );
        const skippedOz = [];
        const freshNachtraege = [];
        for (const np of (nachtragPositions || [])) {
            const key = WorkflowController.normalizeOz(np.oz_code);
            if (key && coveredOz.has(key)) {
                skippedOz.push(np.oz_code); // gemessene Menge gewinnt, kein Doppel-Ansatz
                continue;
            }
            freshNachtraege.push({
                ...np,
                mwst: np.mwst !== undefined ? np.mwst : 19,
                herkunft_typ: np.herkunft_typ || VORGANG_HERKUNFT.NACHTRAG,
                herkunft_id: np.herkunft_id !== undefined ? np.herkunft_id : (np.nachtrag_id || null)
            });
        }

        const aufmassPositionen = WorkflowController.buildPositionenFromAufmass(mergeRows);
        const positionen = aufmassPositionen.concat(freshNachtraege);

        const verrechnungen = (previousDocs || []).map((d) => {
            const netto = d.kumulierte_leistung_netto !== undefined && d.kumulierte_leistung_netto !== null
                && parseFloat(d.kumulierte_leistung_netto) !== 0
                ? parseFloat(d.kumulierte_leistung_netto) : parseFloat(d.netto);
            const brutto = parseFloat(d.brutto);
            return {
                vorherige_rechnung_id: d.id,
                abzugsbetrag_netto: WorkflowController.round2(netto),
                abzugsbetrag_brutto: WorkflowController.round2(brutto)
            };
        });

        return { positionen, verrechnungen, skippedOz, aufmassCount: aufmassPositionen.length, nachtragCount: freshNachtraege.length };
    }

    // ---------- DA11-Import (Aufmaß-Daten herein, ohne Abtippen) ----------

    /**
     * Wandelt DA11-/REB-23.003-Text in importfertige Blätter+Zeilen.
     * OZs bleiben original (mit Punkten o. 9-stellig), der Match gegen LV
     * läuft überall über normalizeOz (s. aufmass_repo.mergeSchlussaufmass).
     */
    static parseDa11ToImport(content) {
        const DA11 = __resolveDA11_wf();
        if (!DA11 || typeof DA11.parseDA11 !== 'function') {
            throw new Error('parseDa11ToImport: DA11-Parser (js/da11.js) nicht verfügbar.');
        }
        const parsed = DA11.parseDA11(content);
        if (!parsed || parsed.success !== true || !Array.isArray(parsed.blaetter) || parsed.blaetter.length === 0) {
            throw new Error('parseDa11ToImport: Keine Aufmaßzeilen (Satzart 11) in der DA11-Datei gefunden.');
        }
        const blaetter = parsed.blaetter.map((b) => ({
            blatt_nummer: String(b.blatt_nummer || '000001'),
            titel: b.titel || `Aufmaßblatt ${b.blatt_nummer || ''}`.trim(),
            status: 'DRAFT',
            zeilen: (b.zeilen || []).map((z, idx) => ({
                oz_code: z.oz_code,
                zeilen_nr: z.zeilen_nr || (idx + 1),
                bezeichnung: z.bezeichnung || '',
                formel_reb: z.formel_reb || '91',
                rechenansatz: z.rechenansatz || '',
                ergebnis: parseFloat(z.ergebnis) || 0,
                einheit: z.einheit || 'm²',
                vorzeichen: z.vorzeichen !== undefined ? z.vorzeichen : 1
            }))
        }));
        return { projektName: parsed.projektName || null, ozMaske: parsed.ozMaske || null, blaetter };
    }

    // ---------- Nummernkreis (server-seitig, ohne Abtippen/Kollision) ----------

    static nextBelegNr(prefix, existingNrs = [], year = new Date().getFullYear()) {
        const rx = new RegExp(`^${String(prefix).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}-${year}-(\\d+)$`);
        let max = 0;
        for (const nr of (existingNrs || [])) {
            const m = String(nr || '').match(rx);
            if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
        }
        return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
    }

    // ---------- Sicherheitseinbehalt-Freigabe (nach Gewährleistung) ----------

    static buildRetentionRelease(retention, opts = {}) {
        if (!retention || retention.id == null) throw new Error('buildRetentionRelease: Einbehalt fehlt.');
        if (retention.status !== 'HELD') {
            throw new Error(`buildRetentionRelease: Einbehalt #${retention.id} ist nicht freigebbar (Status: ${retention.status}).`);
        }
        const mode = String(opts.mode || 'RELEASED').toUpperCase();
        if (mode !== 'RELEASED' && mode !== 'GUARANTEE_SUBSTITUTED') {
            throw new Error('buildRetentionRelease: Modus muss RELEASED oder GUARANTEE_SUBSTITUTED sein.');
        }
        const guaranteeRef = (opts.guaranteeRef || '').trim();
        if (mode === 'GUARANTEE_SUBSTITUTED' && !guaranteeRef) {
            throw new Error('buildRetentionRelease: Bürgschaftsablösung erfordert eine Bürgschafts-Referenz (guaranteeRef).');
        }
        return {
            status: mode,
            guarantee_document_ref: mode === 'GUARANTEE_SUBSTITUTED' ? guaranteeRef : null,
            released_at: opts.freigabeDatum || new Date().toISOString().slice(0, 10)
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkflowController;
    module.exports.VORGANG_HERKUNFT = VORGANG_HERKUNFT;
    module.exports.RECHNUNG_QUELLEN = RECHNUNG_QUELLEN;
}
if (typeof window !== 'undefined') {
    window.WorkflowController = WorkflowController;
    window.VORGANG_HERKUNFT = VORGANG_HERKUNFT;
}
