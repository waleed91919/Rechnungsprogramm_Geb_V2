/**
 * System Repository
 * Globale Anwendungseinstellungen und getFullState
 */
function createSystemRepo(deps) {
    const { db, dbQuery, dbRun } = deps;

    return {
async getFullState() {
        const state = {
            artikel: await dbQuery('SELECT * FROM artikel WHERE COALESCE(is_deleted, 0) = 0'),
            kunden: await dbQuery('SELECT * FROM kunden WHERE COALESCE(is_deleted, 0) = 0'),
            rechnungen: [],
            angebote: [],
            dokumente: [],
            projekte: await dbQuery('SELECT * FROM projekte'),
            einstellungen: {}
        };

        // Load settings
        const settingsRows = await dbQuery('SELECT * FROM einstellungen');
        settingsRows.forEach(row => state.einstellungen[row.key] = row.value);

        // Load documents
        const docs = await dbQuery('SELECT * FROM dokumente');
        const posRows = await dbQuery('SELECT * FROM positionen');
        const verrechnungenRows = await dbQuery('SELECT * FROM rechnung_verrechnungen');

        docs.forEach(d => {
            d.isLocked = !!d.isLocked; // Convert 1/0 to true/false
            d.positionen = posRows.filter(p => p.dokumentId === d.id);
            d.verrechnungen = verrechnungenRows.filter(v => v.aktuelle_rechnung_id === d.id);
            if (d.type === 'rechnung') {
                state.rechnungen.push(d);
            } else if (d.type === 'angebot') {
                state.angebote.push(d);
            } else {
                // J7/J8: Auftragsbestätigungen, Lieferscheine u.a. Belegtypen
                // landen in state.dokumente (Frontend-Lookup analog J7/J8).
                state.dokumente.push(d);
            }
        });

        // Load aufmasse
        const aufmassRows = await dbQuery('SELECT * FROM aufmass');
        const aufmassPosRows = await dbQuery('SELECT * FROM aufmass_positionen');
        aufmassRows.forEach(a => {
            a.positionen = aufmassPosRows.filter(p => p.aufmass_id === a.id);
        });
        state.aufmasse = aufmassRows;

        state.objekte = {
            liegenschaften: [],
            gebaeude: [],
            etagen: [],
            raeume: []
        };
        state.abrechnungsplaene = [];
        state.dauerrechnungLaeufe = [];

        return state;
    },

// --- Einstellungen ---
    async saveEinstellung(key, value) {
        await dbRun('INSERT OR REPLACE INTO einstellungen (key, value) VALUES (?, ?)', [key, value]);
    },

getEinstellung(key) {
        const row = db.prepare('SELECT value FROM einstellungen WHERE key = ?').get(key);
        return row ? row.value : null;
    }
    };
}

module.exports = createSystemRepo;
