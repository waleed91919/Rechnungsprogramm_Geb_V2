/**
 * Zeiterfassung & Mitarbeiter Repository
 * MiLoG-konforme Zeiterfassung und Personalstamm
 */
const ZeiterfassungController = require('../../controllers/ZeiterfassungController');

function createZeiterfassungRepo(deps) {
    const { db, appendAuditLog, auditLogger } = deps;

    return {
        getMitarbeiter(filter = {}) {
            let query = 'SELECT * FROM mitarbeiter WHERE 1=1';
            const params = [];
            if (filter.aktiv !== undefined) {
                query += ' AND aktiv = ?';
                params.push(filter.aktiv ? 1 : 0);
            }
            if (filter.search) {
                query += ' AND (vorname LIKE ? OR nachname LIKE ? OR personalnummer LIKE ?)';
                const s = `%${filter.search}%`;
                params.push(s, s, s);
            }
            query += ' ORDER BY nachname ASC, vorname ASC';
            return db.prepare(query).all(...params);
        },

        saveMitarbeiter(ma) {
            const stmt = db.prepare(`
                INSERT INTO mitarbeiter (
                    id, personalnummer, vorname, nachname, lohngruppe_id, tarif_stundensatz,
                    ist_kolonnenfuehrer, pin_hash, nfc_tag_uid, telefon, email, aktiv
                ) VALUES (
                    @id, @personalnummer, @vorname, @nachname, @lohngruppe_id, @tarif_stundensatz,
                    @ist_kolonnenfuehrer, @pin_hash, @nfc_tag_uid, @telefon, @email, @aktiv
                ) ON CONFLICT(id) DO UPDATE SET
                    personalnummer = excluded.personalnummer,
                    vorname = excluded.vorname,
                    nachname = excluded.nachname,
                    lohngruppe_id = excluded.lohngruppe_id,
                    tarif_stundensatz = excluded.tarif_stundensatz,
                    ist_kolonnenfuehrer = excluded.ist_kolonnenfuehrer,
                    pin_hash = excluded.pin_hash,
                    nfc_tag_uid = excluded.nfc_tag_uid,
                    telefon = excluded.telefon,
                    email = excluded.email,
                    aktiv = excluded.aktiv,
                    updated_at = CURRENT_TIMESTAMP
            `);

            let pnr = ma.personalnummer;
            if (!pnr && !ma.id) {
                const row = db.prepare('SELECT MAX(id) as mx FROM mitarbeiter').get();
                const nextId = (row && row.mx) ? row.mx + 1 : 1;
                pnr = `MA-${100 + nextId}`;
            }

            const res = stmt.run({
                id: ma.id || null,
                personalnummer: pnr,
                vorname: ma.vorname,
                nachname: ma.nachname,
                lohngruppe_id: ma.lohngruppe_id || 'LG1',
                tarif_stundensatz: parseFloat(ma.tarif_stundensatz) || 15.00,
                ist_kolonnenfuehrer: ma.ist_kolonnenfuehrer ? 1 : 0,
                pin_hash: ma.pin_hash || null,
                nfc_tag_uid: ma.nfc_tag_uid || null,
                telefon: ma.telefon || null,
                email: ma.email || null,
                aktiv: ma.aktiv !== undefined ? (ma.aktiv ? 1 : 0) : 1
            });

            return { success: true, id: ma.id || res.lastInsertRowid };
        },

        deleteMitarbeiter(id) {
            db.prepare('DELETE FROM mitarbeiter WHERE id = ?').run(id);
            return { success: true };
        },

        getZeiteintraege(filter = {}) {
            return ZeiterfassungController.getZeiteintraege(db, filter);
        },

        saveZeiteintrag(data) {
            return ZeiterfassungController.saveZeiteintrag(db, data, auditLogger);
        },

        deleteZeiteintrag(id, meta = {}) {
            return ZeiterfassungController.deleteZeiteintrag(db, id, auditLogger, meta);
        },

        getZeiterfassungMonatsauswertung(monat, jahr, mitarbeiterId = null) {
            const m = parseInt(monat, 10);
            const y = parseInt(jahr, 10);
            const von = `${y}-${String(m).padStart(2, '0')}-01`;
            const bis = `${y}-${String(m).padStart(2, '0')}-31T23:59:59`;

            let filter = { datum_von: von, datum_bis: bis };
            if (mitarbeiterId) filter.mitarbeiter_id = mitarbeiterId;

            const eintraege = ZeiterfassungController.getZeiteintraege(db, filter);
            const mitarbeiterList = mitarbeiterId
                ? [db.prepare('SELECT * FROM mitarbeiter WHERE id = ?').get(mitarbeiterId)]
                : db.prepare('SELECT * FROM mitarbeiter WHERE aktiv = 1').all();

            const auswertungen = mitarbeiterList.filter(Boolean).map(ma => {
                const maEintraege = eintraege.filter(e => e.mitarbeiter_id === ma.id);
                const uebersicht = ZeiterfassungController.calculateMonatsuebersicht(maEintraege, ma);
                const arbzg = ZeiterfassungController.pruefeArbzgKonformitaet(maEintraege);
                return {
                    ...uebersicht,
                    arbzg
                };
            });

            return {
                monat: m,
                jahr: y,
                auswertungen,
                gesamtEintraege: eintraege.length
            };
        }
    };
}

module.exports = createZeiterfassungRepo;
