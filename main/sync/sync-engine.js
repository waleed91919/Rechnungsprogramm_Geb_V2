const ZeiterfassungController = require('../../controllers/ZeiterfassungController');
const BautagebuchMobileController = require('../../controllers/BautagebuchMobileController');

function handlePushSync(serverState, body, res) {
    const { device_id = 'MOBILE_PWA', mutations = [] } = body;
    if (!Array.isArray(mutations)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Mutations array required' }));
    }

    const ackedUuids = [];
    const conflicts = [];

    const syncTx = serverState.db.transaction(() => {
        const checkMutationStmt = serverState.db.prepare('SELECT id FROM sync_processed_mutations WHERE mutation_uuid = ?');
        const recordMutationStmt = serverState.db.prepare(`
            INSERT INTO sync_processed_mutations (mutation_uuid, device_id, entity_type, entity_uuid, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        for (const mut of mutations) {
            if (!mut || !mut.uuid) continue;

            // 1. Idempotenz-Prüfung: Bereits verarbeitet?
            const existing = checkMutationStmt.get(mut.uuid);
            if (existing) {
                ackedUuids.push(mut.uuid);
                continue;
            }

            // 2. Fachentität verarbeiten & Konflikte abfangen
            try {
                const conflictInfo = applyEntityMutation(serverState, mut, device_id);
                if (conflictInfo && conflictInfo.conflict) {
                    conflicts.push(conflictInfo);
                    recordMutationStmt.run(mut.uuid, device_id, mut.entity_type, mut.entity_uuid);
                    ackedUuids.push(mut.uuid);
                } else {
                    recordMutationStmt.run(mut.uuid, device_id, mut.entity_type, mut.entity_uuid);
                    ackedUuids.push(mut.uuid);
                }
            } catch (_mutationErr) {
                conflicts.push({ uuid: mut.uuid, error: 'Mutation konnte nicht verarbeitet werden.' });
            }
        }
    });

    syncTx();

    // WebSocket & SSE Broadcast über neue Daten
    if (ackedUuids.length > 0) {
        serverState.broadcast({
            type: 'SYNC_UPDATE',
            count: ackedUuids.length,
            device_id
        });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'SUCCESS',
        acked_uuids: ackedUuids,
        conflicts,
        server_time: new Date().toISOString()
    }));
}

function handlePullSync(serverState, body, res) {
    const projekte = serverState.db.prepare("SELECT id, name, start, ende, status FROM projekte WHERE status != 'ARCHIVIERT'").all();
    const liegenschaften = serverState.db.prepare('SELECT id, objekt_nr, name, ort FROM liegenschaften WHERE aktiv = 1').all();
    const mitarbeiter = serverState.db.prepare('SELECT id, personalnummer, vorname, nachname FROM mitarbeiter WHERE aktiv = 1').all();
    const lvPositionen = serverState.db.prepare('SELECT id, bereich_id, positionsnr, bezeichnung, menge, menge_einheit FROM lv_positionen').all();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        server_time: new Date().toISOString(),
        data: {
            projekte,
            liegenschaften,
            mitarbeiter,
            lv_positionen: lvPositionen
        }
    }));
}

function applyEntityMutation(serverState, mut, deviceId) {
    const { entity_type, mutation_type, entity_uuid, payload, lamport_timestamp, hlc_timestamp } = mut;
    const data = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});
    data.uuid = data.uuid || entity_uuid || mut.uuid;
    data.device_id = deviceId;
    if (hlc_timestamp && serverState.hlc) {
        serverState.hlc.receive(hlc_timestamp);
    }

    if (entity_type === 'ZEITERFASSUNG') {
        const serverRecord = serverState.db.prepare('SELECT * FROM zeiterfassung WHERE uuid = ?').get(data.uuid);
        if (serverRecord && (serverRecord.status === 'FREIGEGEBEN' || serverRecord.status === 'ABGERECHNET')) {
            quarantineConflict(serverState, 'ZEITERFASSUNG', data.uuid, deviceId, serverRecord, data, 'GoBD-Status FREIGEGEBEN/ABGERECHNET auf dem Server hat Vorrang.');
            return { conflict: true, reason: 'GoBD-geschützt', uuid: mut.uuid };
        }

        ZeiterfassungController.saveZeiteintrag(serverState.db, data, serverState.auditLogger);
        return { conflict: false };

    } else if (entity_type === 'BAUTAGEBUCH') {
        const serverBt = serverState.db.prepare('SELECT * FROM bautagebuch WHERE uuid = ?').get(data.uuid);
        if (serverBt && serverBt.unterzeichnet_bauleiter === 1 && !data.unterzeichnet_polier) {
            quarantineConflict(serverState, 'BAUTAGEBUCH', data.uuid, deviceId, serverBt, data, 'Bauleiter-Signatur auf dem Server vorhanden.');
            return { conflict: true, reason: 'Bauleiter-Signatur vorhanden', uuid: mut.uuid };
        }

        const upsertBtStmt = serverState.db.prepare(`
            INSERT INTO bautagebuch (
                uuid, project_id, datum, wetter, temperatur_min, temperatur_max,
                personal_eigen_anzahl, personal_eigen_stunden, personal_sub_json, geraete_json,
                tagesbericht, vorkommnisse_behinderungen, fotos_json, created_at
            ) VALUES (
                @uuid, @project_id, @datum, @wetter, @temperatur_min, @temperatur_max,
                @personal_eigen_anzahl, @personal_eigen_stunden, @personal_sub_json, @geraete_json,
                @tagesbericht, @vorkommnisse_behinderungen, @fotos_json, @created_at
            ) ON CONFLICT(uuid) DO UPDATE SET
                tagesbericht = excluded.tagesbericht,
                vorkommnisse_behinderungen = excluded.vorkommnisse_behinderungen,
                fotos_json = excluded.fotos_json,
                personal_eigen_anzahl = excluded.personal_eigen_anzahl,
                personal_eigen_stunden = excluded.personal_eigen_stunden
        `);

        upsertBtStmt.run({
            uuid: data.uuid,
            project_id: parseInt(data.projekt_id || data.project_id, 10),
            datum: data.datum,
            wetter: data.wetter || data.wetter_code || 'HEITER',
            temperatur_min: parseFloat(data.temperatur_min) || 0.0,
            temperatur_max: parseFloat(data.temperatur_max) || 0.0,
            personal_eigen_anzahl: parseInt(data.personal_eigen_anzahl, 10) || 0,
            personal_eigen_stunden: parseFloat(data.personal_eigen_stunden) || 0.0,
            personal_sub_json: typeof data.personal_sub_json === 'string' ? data.personal_sub_json : JSON.stringify(data.personal_sub_json || []),
            geraete_json: typeof data.geraete_json === 'string' ? data.geraete_json : JSON.stringify(data.geraete_json || []),
            tagesbericht: data.tagesbericht || '',
            vorkommnisse_behinderungen: data.vorkommnisse || data.vorkommnisse_behinderungen || '',
            fotos_json: typeof data.fotos_json === 'string' ? data.fotos_json : JSON.stringify(data.fotos_json || []),
            created_at: data.created_at || new Date().toISOString()
        });

        return { conflict: false };

    } else if (entity_type === 'VOB_MELDUNG' || entity_type === 'BEDENKEN_BEHINDERUNGEN') {
        BautagebuchMobileController.saveVobMeldung(serverState.db, data, serverState.auditLogger);
        return { conflict: false };

    } else if (entity_type === 'AUFMASS_ZEILE' || entity_type === 'AUFMASS') {
        const existing = serverState.db.prepare('SELECT * FROM aufmass_zeilen WHERE uuid = ?').get(data.uuid);

        if (existing) {
            const isSameContent = existing.rechenansatz === data.rechenansatz &&
                                  Math.abs(existing.ergebnis - data.ergebnis) < 0.0001;

            if (!isSameContent) {
                const isStale = (data.base_version !== undefined && data.base_version < existing.version) ||
                                (existing.updated_by_device && existing.updated_by_device !== deviceId);

                if (isStale) {
                    quarantineConflict(
                        serverState,
                        'AUFMASS_ZEILE',
                        data.uuid,
                        deviceId,
                        existing,
                        data,
                        `Aufmaß-Kollision: Server hat Version ${existing.version || 1} (${existing.rechenansatz}), Client sendet (${data.rechenansatz})`
                    );
                    return { conflict: true, reason: 'Aufmaß-Kollision', uuid: mut.uuid };
                }
            }
        }

        const currentHlc = (serverState.hlc && hlc_timestamp) ? serverState.hlc.now() : (hlc_timestamp || new Date().toISOString());

        const stmt = serverState.db.prepare(`
            INSERT INTO aufmass_zeilen (
                uuid, blatt_id, oz_code, zeilen_nr, bezeichnung, formel_reb, formel_code, rechenansatz, ergebnis, einheit, raum_id, version, hlc_timestamp, updated_by_device, last_synced_at
            ) VALUES (
                @uuid, @blatt_id, @oz_code, @zeilen_nr, @bezeichnung, @formel_code, @formel_code, @rechenansatz, @ergebnis, @einheit, @raum_id, 1, @hlc_timestamp, @updated_by_device, CURRENT_TIMESTAMP
            ) ON CONFLICT(uuid) DO UPDATE SET
                rechenansatz = excluded.rechenansatz,
                ergebnis = excluded.ergebnis,
                bezeichnung = excluded.bezeichnung,
                version = COALESCE(aufmass_zeilen.version, 1) + 1,
                hlc_timestamp = excluded.hlc_timestamp,
                updated_by_device = excluded.updated_by_device,
                last_synced_at = CURRENT_TIMESTAMP
        `);
        stmt.run({
            uuid: data.uuid,
            blatt_id: data.blatt_id || 1,
            oz_code: data.oz || data.oz_code || '01.01.001',
            zeilen_nr: data.zeilen_nr || 1,
            bezeichnung: data.bezeichnung || '',
            formel_code: data.formel_code || '91',
            rechenansatz: data.rechenansatz || `${data.ergebnis || 0}=`,
            ergebnis: parseFloat(data.ergebnis) || 0.0,
            einheit: data.einheit || 'm²',
            raum_id: data.raum_id || null,
            hlc_timestamp: currentHlc,
            updated_by_device: deviceId
        });
        return { conflict: false };

    } else if (entity_type === 'MAENGEL' || entity_type === 'MANGEL') {
        const stmt = serverState.db.prepare(`
            INSERT INTO maengel (
                uuid, projekt_id, plan_id, mangel_nr, x_pct, y_pct, titel, beschreibung, status, frist_datum, created_at
            ) VALUES (
                @uuid, @projekt_id, @plan_id, @mangel_nr, @x_pct, @y_pct, @titel, @beschreibung, @status, @frist_datum, @created_at
            ) ON CONFLICT(uuid) DO UPDATE SET
                status = excluded.status,
                titel = excluded.titel
        `);
        stmt.run({
            uuid: data.uuid,
            projekt_id: parseInt(data.projekt_id, 10) || 1,
            plan_id: data.plan_id || null,
            mangel_nr: data.mangel_nr || 'M-001',
            x_pct: parseFloat(data.x_pct) || 0.0,
            y_pct: parseFloat(data.y_pct) || 0.0,
            titel: data.titel || 'Mangel',
            beschreibung: data.beschreibung || '',
            status: data.status || 'ERFASST',
            frist_datum: data.frist_datum || null,
            created_at: data.created_at || new Date().toISOString()
        });
        return { conflict: false };

    } else if (entity_type === 'GERAETE_BUCHUNG' || entity_type === 'GERAET') {
        const stmt = serverState.db.prepare(`
            INSERT INTO geraete_buchungen (
                uuid, projekt_id, geraet_code, datum, betriebsstunden, stillstand_stunden, stillstand_grund, device_id
            ) VALUES (
                @uuid, @projekt_id, @geraet_code, @datum, @betriebsstunden, @stillstand_stunden, @stillstand_grund, @device_id
            ) ON CONFLICT(uuid) DO UPDATE SET
                betriebsstunden = excluded.betriebsstunden,
                stillstand_stunden = excluded.stillstand_stunden,
                stillstand_grund = excluded.stillstand_grund
        `);
        stmt.run({
            uuid: data.uuid,
            projekt_id: parseInt(data.projekt_id, 10) || 1,
            geraet_code: data.geraet_code || 'GERAET',
            datum: data.datum || new Date().toISOString().split('T')[0],
            betriebsstunden: parseFloat(data.betriebsstunden || data.stunden) || 0.0,
            stillstand_stunden: parseFloat(data.stillstand_stunden) || 0.0,
            stillstand_grund: data.stillstand_grund || null,
            device_id: deviceId
        });
        return { conflict: false };

    } else if (entity_type === 'LIEFERSCHEIN') {
        const stmt = serverState.db.prepare(`
            INSERT INTO lieferscheine_digital (
                uuid, projekt_id, lieferant_name, lieferschein_nr, datum, foto_pfad, sha256_hash, status, device_id
            ) VALUES (
                @uuid, @projekt_id, @lieferant_name, @lieferschein_nr, @datum, @foto_pfad, @sha256_hash, @status, @device_id
            ) ON CONFLICT(uuid) DO UPDATE SET
                lieferschein_nr = excluded.lieferschein_nr,
                status = excluded.status
        `);
        stmt.run({
            uuid: data.uuid,
            projekt_id: parseInt(data.projekt_id, 10) || 1,
            lieferant_name: data.lieferant_name || 'Lieferant',
            lieferschein_nr: data.lieferschein_nr || '',
            datum: data.datum || new Date().toISOString().split('T')[0],
            foto_pfad: data.foto_pfad || '',
            sha256_hash: data.sha256_hash || '',
            status: data.status || 'ERFASST',
            device_id: deviceId
        });
        return { conflict: false };
    }

    return { conflict: false };
}

function quarantineConflict(serverState, entityType, entityUuid, deviceId, serverData, clientData, reason) {
    const stmt = serverState.db.prepare(`
        INSERT INTO sync_conflicts (
            entity_type, entity_uuid, client_device_id, server_data_json, client_data_json, conflict_reason, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', CURRENT_TIMESTAMP)
    `);
    stmt.run(
        entityType,
        entityUuid,
        deviceId,
        JSON.stringify(serverData || {}),
        JSON.stringify(clientData || {}),
        reason || 'Inhaltlicher Konflikt'
    );
}

function getOpenConflicts(serverState) {
    return serverState.db.prepare("SELECT * FROM sync_conflicts WHERE status = 'OPEN' ORDER BY created_at DESC").all();
}

function resolveConflict(serverState, conflictId, resolutionStrategy, mergedData = null) {
    const conflict = serverState.db.prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(conflictId);
    if (!conflict) throw new Error(`Konflikt #${conflictId} nicht gefunden.`);

    const effectiveData = resolutionStrategy === 'RESOLVED_CLIENT'
        ? JSON.parse(conflict.client_data_json || '{}')
        : (resolutionStrategy === 'RESOLVED_MERGE' ? mergedData : null);

    const tx = serverState.db.transaction(() => {
        if (effectiveData && (resolutionStrategy === 'RESOLVED_CLIENT' || resolutionStrategy === 'RESOLVED_MERGE')) {
            const { entity_type, entity_uuid } = conflict;

            if (entity_type === 'ZEITERFASSUNG') {
                ZeiterfassungController.saveZeiteintrag(serverState.db, effectiveData, serverState.auditLogger);

            } else if (entity_type === 'BAUTAGEBUCH') {
                const upsertBt = serverState.db.prepare(`
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
                const upsertAufmass = serverState.db.prepare(`
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
                serverState.db.prepare(`
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

            if (serverState.auditLogger && serverState.auditLogger.appendAuditLog) {
                serverState.auditLogger.appendAuditLog({
                    entityType: entity_type,
                    entityId: conflictId,
                    action: 'SYNC_CONFLICT_RESOLVED',
                    details: { strategy: resolutionStrategy, uuid: entity_uuid }
                });
            }
        }

        serverState.db.prepare(`
            UPDATE sync_conflicts SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(resolutionStrategy, conflictId);
    });

    tx();
    return { success: true, conflictId, resolutionStrategy };
}

module.exports = {
    handlePushSync,
    handlePullSync,
    applyEntityMutation,
    quarantineConflict,
    getOpenConflicts,
    resolveConflict
};
