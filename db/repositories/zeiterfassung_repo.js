/**
 * Zeiterfassung, Mitarbeiter & Sync Repository
 * MiLoG-konforme Zeiterfassung, Personalstamm und Local-First Sync Conflict Resolver
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

resolveSyncConflict(conflictId, resolutionStrategy, mergedData = null) {
        const conflict = db.prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(conflictId);
        if (!conflict) throw new Error(`Konflikt #${conflictId} nicht gefunden.`);

        const effectiveData = resolutionStrategy === 'RESOLVED_CLIENT'
            ? JSON.parse(conflict.client_data_json || '{}')
            : (resolutionStrategy === 'RESOLVED_MERGE' ? mergedData : null);

        const tx = db.transaction(() => {
            if (effectiveData && (resolutionStrategy === 'RESOLVED_CLIENT' || resolutionStrategy === 'RESOLVED_MERGE')) {
                const { entity_type, entity_uuid } = conflict;

                if (entity_type === 'ZEITERFASSUNG') {
                    ZeiterfassungController.saveZeiteintrag(db, effectiveData, auditLogger);
                } else if (entity_type === 'BAUTAGEBUCH') {
                    const upsertBt = db.prepare(`
                        INSERT INTO bautagebuch (
                            uuid, project_id, datum, wetter, temperatur_min, temperatur_max,
                            personal_eigen_anzahl, personal_eigen_stunden, personal_sub_json, geraete_json,
                            tagesbericht, vorkommnisse_behinderungen, fotos_json, updated_at
                        ) VALUES (
                            @uuid, @project_id, @datum, @wetter, @temperatur_min, @temperatur_max,
                            @personal_eigen_anzahl, @personal_eigen_stunden, @personal_sub_json, @geraete_json,
                            @tagesbericht, @vorkommnisse_behinderungen, @fotos_json, CURRENT_TIMESTAMP
                        ) ON CONFLICT(uuid) DO UPDATE SET
                            tagesbericht = excluded.tagesbericht,
                            vorkommnisse_behinderungen = excluded.vorkommnisse_behinderungen,
                            fotos_json = excluded.fotos_json,
                            personal_eigen_anzahl = excluded.personal_eigen_anzahl,
                            personal_eigen_stunden = excluded.personal_eigen_stunden,
                            personal_sub_json = excluded.personal_sub_json,
                            geraete_json = excluded.geraete_json,
                            updated_at = CURRENT_TIMESTAMP
                    `);
                    upsertBt.run({
                        uuid: entity_uuid,
                        project_id: parseInt(effectiveData.projekt_id || effectiveData.project_id, 10),
                        datum: effectiveData.datum,
                        wetter: effectiveData.wetter || 'HEITER',
                        temperatur_min: parseFloat(effectiveData.temperatur_min) || 0.0,
                        temperatur_max: parseFloat(effectiveData.temperatur_max) || 0.0,
                        personal_eigen_anzahl: parseInt(effectiveData.personal_eigen_anzahl, 10) || 0,
                        personal_eigen_stunden: parseFloat(effectiveData.personal_eigen_stunden) || 0.0,
                        personal_sub_json: typeof effectiveData.personal_sub_json === 'string'
                            ? effectiveData.personal_sub_json : JSON.stringify(effectiveData.personal_sub_json || []),
                        geraete_json: typeof effectiveData.geraete_json === 'string'
                            ? effectiveData.geraete_json : JSON.stringify(effectiveData.geraete_json || []),
                        tagesbericht: effectiveData.tagesbericht || '',
                        vorkommnisse_behinderungen: effectiveData.vorkommnisse || effectiveData.vorkommnisse_behinderungen || '',
                        fotos_json: typeof effectiveData.fotos_json === 'string'
                            ? effectiveData.fotos_json : JSON.stringify(effectiveData.fotos_json || [])
                    });
                } else if (entity_type === 'AUFMASS_ZEILE' || entity_type === 'AUFMASS') {
                    const upsertAufmass = db.prepare(`
                        INSERT INTO aufmass_zeilen (
                            uuid, blatt_id, oz_code, zeilen_nr, bezeichnung, formel_reb, formel_code,
                            rechenansatz, ergebnis, einheit, raum_id, version, updated_at
                        ) VALUES (
                            @uuid, @blatt_id, @oz_code, @zeilen_nr, @bezeichnung, @formel_code, @formel_code,
                            @rechenansatz, @ergebnis, @einheit, @raum_id, 1, CURRENT_TIMESTAMP
                        ) ON CONFLICT(uuid) DO UPDATE SET
                            rechenansatz = excluded.rechenansatz,
                            ergebnis = excluded.ergebnis,
                            bezeichnung = excluded.bezeichnung,
                            version = COALESCE(aufmass_zeilen.version, 1) + 1,
                            updated_at = CURRENT_TIMESTAMP
                    `);
                    upsertAufmass.run({
                        uuid: entity_uuid,
                        blatt_id: effectiveData.blatt_id || 1,
                        oz_code: effectiveData.oz || effectiveData.oz_code || '01.01.001',
                        zeilen_nr: effectiveData.zeilen_nr || 1,
                        bezeichnung: effectiveData.bezeichnung || '',
                        formel_code: effectiveData.formel_code || '91',
                        rechenansatz: effectiveData.rechenansatz || `${effectiveData.ergebnis || 0}=`,
                        ergebnis: parseFloat(effectiveData.ergebnis) || 0.0,
                        einheit: effectiveData.einheit || 'm²',
                        raum_id: effectiveData.raum_id || null
                    });
                } else if (entity_type === 'MAENGEL' || entity_type === 'MANGEL') {
                    db.prepare(`
                        UPDATE maengel SET
                            titel = COALESCE(@titel, titel),
                            beschreibung = COALESCE(@beschreibung, beschreibung),
                            status = COALESCE(@status, status),
                            frist_datum = COALESCE(@frist_datum, frist_datum),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE uuid = @uuid
                    `).run({
                        uuid: entity_uuid,
                        titel: effectiveData.titel,
                        beschreibung: effectiveData.beschreibung,
                        status: effectiveData.status,
                        frist_datum: effectiveData.frist_datum
                    });
                }

                if (auditLogger && auditLogger.appendAuditLog) {
                    auditLogger.appendAuditLog({
                        entityType: entity_type,
                        entityId: conflictId,
                        action: 'SYNC_CONFLICT_RESOLVED',
                        details: { strategy: resolutionStrategy, uuid: entity_uuid }
                    });
                }
            }

            db.prepare(`
                UPDATE sync_conflicts SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?
            `).run(resolutionStrategy, conflictId);
        });

        tx();
        return { success: true, conflictId, resolutionStrategy };
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
    },

getSyncConflicts() {
        return db.prepare("SELECT * FROM sync_conflicts WHERE status = 'OPEN' ORDER BY created_at DESC").all();
    }
    };
}

module.exports = createZeiterfassungRepo;
