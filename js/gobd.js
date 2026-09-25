/**
 * gobd.js - GoBD Unveränderbarkeit, SHA-256 Hash-Kettung & Audit Trail Engine
 * Stand: 24.09.2026 - Vereinheitlicht mit main/audit.js (calculateDocumentContentHash).
 * Status-Änderungen ('BEZAHLT', 'Überfällig', etc.) invalidieren den steuerlichen Inhalts-Hash nicht (K1-8).
 */
const crypto = require('crypto');

let auditModule = null;
try {
    auditModule = require('../main/audit.js');
} catch (_e) {
    // Browser-Fallback oder alternatives Modul-Laden
}

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

function calculateContentHash(doc) {
    if (auditModule && typeof auditModule.calculateDocumentContentHash === 'function') {
        return auditModule.calculateDocumentContentHash(doc);
    }
    if (!doc || typeof doc !== 'object') {
        return crypto.createHash('sha256').update('', 'utf8').digest('hex');
    }
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
    return crypto.createHash('sha256').update(JSON.stringify(content), 'utf8').digest('hex');
}

class GoBDAuditEngine {
    /**
     * Liefert den einheitlichen kanonischen Inhalts-Hash nach main/audit.js.
     * Status- und Mahnungsänderungen ('BEZAHLT') invalidieren diesen Hash nicht.
     */
    static calculateDocumentContentHash(doc) {
        return calculateContentHash(doc);
    }

    /**
     * Erzeugt einen kryptografischen SHA-256 Hash eines Dokuments (mit optionaler Verkettung zu previousHash).
     */
    static calculateDocumentHash(doc, previousHash = '') {
        const contentHash = calculateContentHash(doc);
        if (!previousHash) return contentHash;
        return crypto.createHash('sha256').update(contentHash + ':' + previousHash, 'utf8').digest('hex');
    }

    /**
     * Prüft die Unveränderbarkeit eines Dokuments (GoBD Immutability Guard).
     * @param {Object} existingDoc - Das in der DB gespeicherte Dokument.
     * @returns {Object} { canEdit: boolean, reason: string|null }
     */
    static validateImmutability(existingDoc) {
        if (existingDoc && (existingDoc.isLocked || existingDoc.status === 'POSTED' || existingDoc.status === 'Festgeschrieben' || existingDoc.status === 'Bezahlt')) {
            return {
                canEdit: false,
                reason: `Das Dokument ${existingDoc.nr} ist nach GoBD festgeschrieben/gesperrt und darf nicht direkt bearbeitet werden. Bitte erstellen Sie eine Stornorechnung / Korrekturrechnung.`
            };
        }

        return { canEdit: true, reason: null };
    }

    /**
     * Erstellt einen Audit-Log-Eintrag für die Datenbank.
     */
    static createAuditEntry({ entityType = 'DOCUMENT', entityId, action, doc, previousHash = '' }) {
        const currentHash = this.calculateDocumentHash(doc, previousHash);
        return {
            entity_type: entityType,
            entity_id: entityId,
            action, // e.g. 'CREATED', 'POSTED', 'CANCELLED'
            previous_hash: previousHash,
            current_hash: currentHash,
            details: JSON.stringify({ status: doc.status, nr: doc.nr, brutto: doc.brutto })
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GoBDAuditEngine;
} else {
    window.GoBDAuditEngine = GoBDAuditEngine;
}
