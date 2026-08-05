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
     */
    async storniereRechnung(updatedOriginal, stornoDoc) {
        if (!this.db) return null;
        await this.db.saveDocument(updatedOriginal);
        await this.db.saveDocument(stornoDoc);
        return await this.db.getFullState();
    }

    /**
     * Markiert eine Rechnung als bezahlt.
     */
    async markAsPaid(doc) {
        if (!this.db) return null;
        doc.status = 'Bezahlt';
        await this.db.saveDocument(doc);
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
