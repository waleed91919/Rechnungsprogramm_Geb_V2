/**
 * audit.js - Zentrale GoBD-Audit-Hashkette
 *
 * Lückenlose, manipulationssichere Protokollierung aller Belegmutationen:
 * Jeder Eintrag verkettet previous_hash -> current_hash. Der Hash wird über
 * (previous_hash | timestamp | entity | action | payload-hash) gebildet.
 * Schlägt das Protokollieren fehl, MUSS die Mutation fehlschlagen (GoBD:
 * keine unprotokollierten Änderungen). Alle Funktionen sind synchron und
 * dürfen daher innerhalb von better-sqlite3-Transaktionen laufen.
 */
const crypto = require('crypto');

const SCHEME_V2 = 1;

function sha256Hex(value) {
    return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

// Normalisierung: null/undefined/'' werden gleichbehandelt, Zahlen 2-stellig,
// Booleans als 0/1 - verhindert Fehlalarme bei reiner Formatierungs-Drift.
function normText(v) {
    return (v === null || v === undefined) ? '' : String(v);
}
function normNum(v) {
    const n = parseFloat(v);
    return (isNaN(n) ? 0 : n).toFixed(2);
}
function normBool(v) {
    return v ? 1 : 0;
}

/**
 * Kanonischer Inhalts-Hash eines Belegs (NUR Inhaltsfelder).
 * Status-/Buchhaltungsfelder (status, faellig, isLocked, mahnung*) sind
 * bewusst AUSGESCHLOSSEN, da sie an gesperrten Belegen änderbar bleiben.
 * Dieser eine Algorithmus gilt für Änderungsschutz UND dokumente.sha256_hash.
 */
function calculateDocumentContentHash(doc) {
    if (!doc || typeof doc !== 'object') return sha256Hex('');
    const content = {
        nr: normText(doc.nr),
        type: normText(doc.type),
        datum: normText(doc.datum),
        kundeId: doc.kundeId || null,
        projektId: doc.projektId || null,
        netto: normNum(doc.netto),
        steuer: normNum(doc.steuer),
        brutto: normNum(doc.brutto),
        globalRabattAbzug: normNum(doc.globalRabattAbzug),
        globalRabattType: normText(doc.globalRabattType || '%'),
        globalRabattValue: normNum(doc.globalRabattValue),
        anzahlung: normNum(doc.anzahlung),
        eingabemodus: normText(doc.eingabemodus || 'netto'),
        vortext: normText(doc.vortext),
        fusstext: normText(doc.fusstext),
        leistungszeitraum_von: normText(doc.leistungszeitraum_von),
        leistungszeitraum_bis: normText(doc.leistungszeitraum_bis),
        baustellen_adresse: normText(doc.baustellen_adresse),
        vob_vereinbart: normBool(doc.vob_vereinbart),
        ist_privatkunde: normBool(doc.ist_privatkunde),
        unterliegt_bauabzugsteuer: normBool(doc.unterliegt_bauabzugsteuer),
        bauabzugsteuer_betrag: normNum(doc.bauabzugsteuer_betrag),
        ausweis_35a_erforderlich: normBool(doc.ausweis_35a_erforderlich),
        summe_lohnkosten_brutto: normNum(doc.summe_lohnkosten_brutto),
        rechnungsart: normText(doc.rechnungsart || 'REGULAER'),
        kumulierte_leistung_netto: normNum(doc.kumulierte_leistung_netto),
        sicherheitseinbehalt: normNum(doc.sicherheitseinbehalt),
        unterliegt_13b: normBool(doc.unterliegt_13b),
        leitweg_id: normText(doc.leitweg_id),
        buyer_reference: normText(doc.buyer_reference),
        objekt_typ: normText(doc.objekt_typ),
        objekt_id: doc.objekt_id || null,
        positionen: (doc.positionen || []).map(p => ({
            name: normText(p.name),
            artikelId: p.artikelId || null,
            menge: normNum(p.menge),
            einheit: normText(p.einheit || 'Stk.'),
            preis: normNum(p.preis),
            ek: normNum(p.ek),
            mwst: p.mwst === undefined ? null : parseFloat(p.mwst) || 0,
            rabatt: normNum(p.rabatt),
            cost_type: normText(p.cost_type || 'MATERIAL')
        })),
        verrechnungen: (doc.verrechnungen || []).map(v => ({
            vorherige_rechnung_id: v.vorherige_rechnung_id || null,
            abzugsbetrag_netto: normNum(v.abzugsbetrag_netto)
        }))
    };
    return sha256Hex(JSON.stringify(content));
}

/**
 * Fabrik: bindet die Audit-Funktionen an eine geöffnete better-sqlite3-Instanz.
 */
function createAuditLogger(db) {
    // Migration: Schema-Markierung zur Trennung von Alt-Einträgen (alter
    // ZUGFeRD-Export hat den PDF-Buffer gehasht, keine Nachberechnung möglich).
    try {
        db.exec(`ALTER TABLE audit_logs ADD COLUMN hash_scheme INTEGER NOT NULL DEFAULT 0`);
    } catch (e) {
        if (!String(e.message || '').includes('duplicate column')) {
            console.warn('[Audit Migration Warning]:', e.message);
        }
    }

    const getLastRowStmt = db.prepare('SELECT current_hash FROM audit_logs ORDER BY id DESC LIMIT 1');
    const insertStmt = db.prepare(
        'INSERT INTO audit_logs (entity_type, entity_id, action, previous_hash, current_hash, timestamp, details, hash_scheme) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    /**
     * Hängt einen Eintrag an die Hash-Kette an und gibt den neuen Chain-Hash zurück.
     * Muss innerhalb derselben Transaktion wie die Mutation aufgerufen werden.
     */
    function appendAuditLog({ entityType = 'DOCUMENT', entityId = 0, action, details = null }) {
        if (!action || typeof action !== 'string') {
            throw new Error('appendAuditLog: action fehlt.');
        }
        const lastRow = getLastRowStmt.get();
        const previousHash = (lastRow && lastRow.current_hash) || '';
        const timestamp = new Date().toISOString();
        const detailsText = JSON.stringify(details === undefined ? null : details);
        const payloadHash = sha256Hex(detailsText);
        const currentHash = sha256Hex([previousHash, timestamp, String(entityType), String(entityId == null ? 0 : entityId), action, payloadHash].join('|'));

        insertStmt.run(
            String(entityType),
            (typeof entityId === 'number' && Number.isFinite(entityId)) ? entityId : 0,
            action,
            previousHash,
            currentHash,
            timestamp,
            detailsText,
            SCHEME_V2
        );
        return currentHash;
    }

    /**
     * Geht alle Einträge durch und prüft previous_hash-Verkettung + Hashes.
     */
    function verifiziereAuditKette() {
        const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id ASC').all();
        const errors = [];
        let expectedPrevious = '';
        let legacyCount = 0;

        for (const row of rows) {
            const storedPrevious = row.previous_hash || '';
            if (storedPrevious !== expectedPrevious) {
                errors.push(`Verkettung bricht bei Eintrag #${row.id} (${row.action}): previous_hash passt nicht.`);
            }

            if (row.hash_scheme === SCHEME_V2) {
                const payloadHash = sha256Hex(row.details === null || row.details === undefined ? 'null' : String(row.details));
                const recomputed = sha256Hex([
                    storedPrevious,
                    row.timestamp === null || row.timestamp === undefined ? '' : String(row.timestamp),
                    String(row.entity_type),
                    String(row.entity_id),
                    String(row.action),
                    payloadHash
                ].join('|'));
                if (recomputed !== row.current_hash) {
                    errors.push(`Hash-Fehler bei Eintrag #${row.id} (${row.action}): current_hash stimmt nicht mit den gespeicherten Daten überein.`);
                }
            } else {
                legacyCount++;
            }

            expectedPrevious = row.current_hash;
        }

        return {
            valid: errors.length === 0,
            checked: rows.length,
            legacyEntries: legacyCount,
            errors
        };
    }

    return {
        appendAuditLog,
        verifiziereAuditKette,
        SCHEME_V2
    };
}

module.exports = { createAuditLogger, calculateDocumentContentHash, sha256Hex };
