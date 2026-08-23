/**
 * InvoiceModel.js - Datenzugriffsschicht für Rechnungsdaten (SQLite CRUD)
 */
window.InvoiceModel = class InvoiceModel {
    constructor(dbInterface) {
        this.db = dbInterface || (window.api ? window.api : null);
    }

    /**
     * Speichert oder aktualisiert ein Rechnungsdokument in der SQLite-Datenbank.
     */
    async saveDocument(doc) {
        if (!this.db) return null;
        return await this.db.saveDocument(doc);
    }

    /**
     * Löscht ein Dokument anhand seiner ID.
     */
    async deleteDocument(id) {
        if (!this.db) return null;
        return await this.db.deleteDocument(id);
    }

    /**
     * Storniert eine bestehende Rechnung in der Datenbank und speichert die Gutschrift.
     * GoBD: Die Statusänderung am (ggf. gesperrten) Original läuft über den schmalen
     * Status-Pfad, die Gutschrift wird neu angelegt - beides wird audit-protokolliert.
     * ATOMAR: Unterstützt die DB-Schicht das (dbAPI.storniereRechnung), laufen beide
     * Schritte in EINER Transaktion - schlägt die Gutschrift fehl, wird auch die
     * Statusänderung am Original zurückgerollt.
     */
    async storniereRechnung(updatedOriginal, stornoDoc) {
        if (!this.db) return null;
        if (typeof this.db.storniereRechnung === 'function') {
            await this.db.storniereRechnung(updatedOriginal, stornoDoc);
            return await this.db.getFullState();
        }
        // Fallback für alternative DB-Interfaces ohne atomaren Storno-Pfad
        const neuerStatus = updatedOriginal.status || 'Storniert';
        if (updatedOriginal.id != null && typeof this.db.updateDocumentStatus === 'function') {
            await this.db.updateDocumentStatus(updatedOriginal.id, { status: neuerStatus });
        } else {
            // Fallback für alternative DB-Interfaces ohne Status-Pfad
            await this.db.saveDocument(updatedOriginal);
        }
        await this.db.saveDocument(stornoDoc);
        return await this.db.getFullState();
    }

    /**
     * Markiert eine Rechnung als bezahlt.
     * GoBD: Bezahlung ist ein Buchhaltungsstatus und darf auch an gesperrten
     * Belegen geändert werden - nur über den schmalen Status-Pfad.
     */
    async markAsPaid(doc) {
        if (!this.db) return null;
        doc.status = 'Bezahlt';
        if (doc.id != null && typeof this.db.updateDocumentStatus === 'function') {
            await this.db.updateDocumentStatus(doc.id, { status: 'Bezahlt' });
        } else {
            // Fallback für alternative DB-Interfaces ohne Status-Pfad
            await this.db.saveDocument(doc);
        }
        return await this.db.getFullState();
    }

    /**
     * Lädt den aktuellen Gesamtzustand aus der Datenbank.
     */
    async getFullState() {
        if (!this.db) return null;
        return await this.db.getFullState();
    }
};
