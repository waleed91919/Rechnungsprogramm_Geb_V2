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
            liegenschaften: await dbQuery('SELECT * FROM liegenschaften ORDER BY name ASC'),
            gebaeude: await dbQuery('SELECT * FROM gebaeude ORDER BY name ASC'),
            etagen: await dbQuery('SELECT * FROM etagen ORDER BY COALESCE(ebene_nummer, 999), name ASC'),
            raeume: await dbQuery('SELECT * FROM raeume ORDER BY name ASC')
        };

        const plaene = await dbQuery('SELECT * FROM abrechnungsplaene ORDER BY name ASC');
        const planPosRows = await dbQuery('SELECT * FROM abrechnungsplan_positionen ORDER BY sortier_index ASC');
        plaene.forEach(p => {
            p.positionen = planPosRows.filter(pos => pos.plan_id === p.id);
        });
        state.abrechnungsplaene = plaene;
        state.dauerrechnungLaeufe = await dbQuery('SELECT * FROM dauerrechnung_laeufe ORDER BY rechnungs_datum DESC');

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
