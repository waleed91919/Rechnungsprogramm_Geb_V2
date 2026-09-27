/**
 * models/AngebotModel.js - Datenzugriffsschicht für Angebote
 */
class AngebotModel {
    constructor(dbInterface) {
        this.db = dbInterface || (typeof window !== 'undefined' && window.api ? window.api : null);
    }

    async saveAngebot(angebot) {
        if (!this.db) return null;
        return await this.db.saveDocument(angebot);
    }

    async getAngebote() {
        if (!this.db) return [];
        const fullState = await this.db.getFullState();
        return fullState ? (fullState.angebote || []) : [];
    }

    async saveProjekt(projekt) {
        if (!this.db) return null;
        return await this.db.saveProjekt(projekt);
    }
}

if (typeof window !== 'undefined') {
    window.AngebotModel = AngebotModel;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AngebotModel;
}
