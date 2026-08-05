/**
 * AufmassModel.js - Datenzugriffsschicht für Aufmaß-Daten (SQLite CRUD)
 */
window.AufmassModel = class AufmassModel {
    constructor(dbInterface) {
        this.db = dbInterface || (window.api ? window.api : null);
    }

    /**
     * Lädt ein einzelnes Aufmaß anhand der verknüpften Rechnungspositions-ID.
     * @param {string|number} positionId 
     */
    async getAufmassByPositionId(positionId) {
        if (!this.db) return null;
        if (typeof this.db.getAufmassByPositionId === 'function') {
            return await this.db.getAufmassByPositionId(positionId);
        }
        const state = await this.db.getFullState();
        return (state && state.aufmasse) ? state.aufmasse.find(a => String(a.position_id) === String(positionId)) : null;
    }

    /**
     * Speichert ein Aufmaß gezielt für eine bestimmte Rechnungsposition.
     * @param {string|number} positionId 
     * @param {Object} aufmassData 
     */
    async saveAufmassForPosition(positionId, aufmassData) {
        if (!this.db) return null;
        if (typeof this.db.saveAufmassForPosition === 'function') {
            return await this.db.saveAufmassForPosition(positionId, aufmassData);
        }
        return await this.saveAufmass({ ...aufmassData, position_id: positionId });
    }

    /**
     * Lädt ein einzelnes Aufmaß inklusive aller Positionen anhand der Aufmaß-ID.
     * @param {number} id 
     */
    async getAufmassById(id) {
        if (!this.db) return null;
        if (typeof this.db.getAufmassById === 'function') {
            return await this.db.getAufmassById(id);
        }
        const state = await this.db.getFullState();
        return (state && state.aufmasse) ? state.aufmasse.find(a => a.id === id) : null;
    }

    /**
     * Lädt alle Aufmaße zu einer bestimmten Rechnungs-ID.
     * @param {number} rechnungId 
     */
    async getAufmasseByRechnungId(rechnungId) {
        if (!this.db) return [];
        if (typeof this.db.getAufmasseByRechnungId === 'function') {
            return await this.db.getAufmasseByRechnungId(rechnungId);
        }
        const state = await this.db.getFullState();
        return (state && state.aufmasse) ? state.aufmasse.filter(a => a.rechnung_id === rechnungId) : [];
    }

    /**
     * Lädt alle Aufmaße zu einer bestimmten Projekt-ID.
     * @param {number} projektId 
     */
    async getAufmasseByProjektId(projektId) {
        if (!this.db) return [];
        if (typeof this.db.getAufmasseByProjektId === 'function') {
            return await this.db.getAufmasseByProjektId(projektId);
        }
        const state = await this.db.getFullState();
        return (state && state.aufmasse) ? state.aufmasse.filter(a => a.projekt_id === projektId) : [];
    }

    /**
     * Speichert ein Aufmaß samt seiner Positionen.
     * @param {Object} aufmassData 
     */
    async saveAufmass(aufmassData) {
        if (!this.db) return null;
        if (typeof this.db.saveAufmass === 'function') {
            return await this.db.saveAufmass(aufmassData);
        }
        return null;
    }

    /**
     * Löscht ein Aufmaß anhand der ID.
     * @param {number} id 
     */
    async deleteAufmass(id) {
        if (!this.db) return null;
        if (typeof this.db.deleteAufmass === 'function') {
            return await this.db.deleteAufmass(id);
        }
        return null;
    }
};
