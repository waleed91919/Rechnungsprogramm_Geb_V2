/**
 * gobd.js - GoBD Unveränderbarkeit, SHA-256 Hash-Kettung & Audit Trail Engine
 */
const crypto = require('crypto');

class GoBDAuditEngine {
    /**
     * Erzeugt einen kryptografischen SHA-256 Hash eines Rechnungs- oder Belegdokuments.
     */
    static calculateDocumentHash(doc, previousHash = '') {
        const payload = {
            id: doc.id,
            nr: doc.nr,
            type: doc.type,
            datum: doc.datum,
            kundeId: doc.kundeId,
            netto: parseFloat(doc.netto || 0).toFixed(2),
            steuer: parseFloat(doc.steuer || 0).toFixed(2),
            brutto: parseFloat(doc.brutto || 0).toFixed(2),
            status: doc.status,
            isLocked: doc.isLocked ? 1 : 0,
            positionen: (doc.positionen || []).map(p => ({
                name: p.name,
                menge: parseFloat(p.menge || 0).toFixed(2),
                preis: parseFloat(p.preis || 0).toFixed(2),
                mwst: p.mwst
            })),
            previousHash
        };

        const jsonString = JSON.stringify(payload);
        return crypto.createHash('sha256').update(jsonString, 'utf8').digest('hex');
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
