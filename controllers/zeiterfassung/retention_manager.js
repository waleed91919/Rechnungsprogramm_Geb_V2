// retention_manager.js
(function() {
    function checkMilogAufzeichnungsfrist(zeitVon, createdAt = new Date()) {
            if (!zeitVon) return { isLate: false, fristAbgelaufen: false, diffDays: 0, statusMilog: 'PUENKTLICH', warnung: null };
            const dVon = new Date(zeitVon);
            const dCreate = new Date(createdAt);
            if (isNaN(dVon.getTime()) || isNaN(dCreate.getTime())) {
                return { isLate: false, fristAbgelaufen: false, diffDays: 0, statusMilog: 'PUENKTLICH', warnung: null };
            }
    
            // Kalendertagsberechnung (Midnight Kalendertag)
            const dateVon = new Date(dVon.getFullYear(), dVon.getMonth(), dVon.getDate());
            const dateCreate = new Date(dCreate.getFullYear(), dCreate.getMonth(), dCreate.getDate());
            const diffMs = dateCreate.getTime() - dateVon.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const isLate = diffDays > 7;
    
            return {
                isLate,
                fristAbgelaufen: isLate,
                diffDays,
                statusMilog: isLate ? 'VERSPAETET' : 'PUENKTLICH',
                warnung: isLate
                    ? 'Achtung: Erfassung erfolgt nach Ablauf der 7-Tage-Frist gem. § 17 Abs. 1 MiLoG (Ordnungswidrigkeit nach § 21 MiLoG).'
                    : null
            };
        }

    function checkMilogAufbewahrungsfrist(zeitVon, referenceDate = new Date()) {
            if (!zeitVon) return { darfGeloeschtWerden: false, error: 'Kein Leistungsdatum vorhanden.' };
            const dVon = new Date(zeitVon);
            const dRef = new Date(referenceDate);
            if (isNaN(dVon.getTime()) || isNaN(dRef.getTime())) {
                return { darfGeloeschtWerden: false, error: 'Ungültiges Datum.' };
            }
    
            // 2 Jahre = 24 Monate
            const minRetentionDate = new Date(dVon);
            minRetentionDate.setFullYear(minRetentionDate.getFullYear() + 2);
    
            const darfGeloeschtWerden = dRef.getTime() >= minRetentionDate.getTime();
            return {
                darfGeloeschtWerden,
                canHardDelete: darfGeloeschtWerden,
                withinRetentionPeriod: !darfGeloeschtWerden,
                minRetentionDate: minRetentionDate.toISOString(),
                error: darfGeloeschtWerden ? null : 'Mindestaufbewahrungsfrist nicht abgelaufen: Zeiterfassungsdaten müssen gem. § 17 Abs. 2 MiLoG mindestens 2 Jahre (24 Monate) aufbewahrt werden.'
            };
        }

    function saveZeiteintrag(db, data, auditLogger = null) {
            if (!db) throw new Error('Database instance required.');
            if (!data.mitarbeiter_id) throw new Error('Mitarbeiter-ID ist erforderlich.');
            if (!data.zeit_von) throw new Error('Startzeitpunkt (zeit_von) ist erforderlich.');
    
            const uuid = data.uuid || this.generateUUID();
            let dauerMin = parseInt(data.dauer_min, 10) || 0;
            let pauseMin = parseInt(data.pause_min, 10) || 0;
            let arbzgCheck = { valid: true, hasVerstoss: false, verstoesse: [] };
    
            if (data.zeit_von && data.zeit_bis) {
                arbzgCheck = this.calculateWorkTime(data.zeit_von, data.zeit_bis, pauseMin);
                if (arbzgCheck.valid) {
                    dauerMin = arbzgCheck.nettoMin;
                    pauseMin = arbzgCheck.effektivePauseMin;
                }
            }
    
            // MiLoG § 17 Abs. 1 7-Tage-Aufzeichnungsprüfung
            const createdAt = data.created_at || new Date().toISOString();
            const milogCheck = this.checkMilogAufzeichnungsfrist(data.zeit_von, createdAt);
            const isVerspaetet = milogCheck.isLate ? 1 : (data.is_verspaetet ? 1 : 0);
            const statusMilog = milogCheck.isLate ? 'VERSPAETET' : (data.status_milog || 'PUENKTLICH');
    
            const existing = db.prepare('SELECT * FROM zeiterfassung WHERE uuid = ?').get(uuid);
            if (existing && (existing.status === 'FREIGEGEBEN' || existing.status === 'ABGERECHNET')) {
                if (data.status !== existing.status && (data.status === 'ABGERECHNET' || data.status === 'FREIGEGEBEN')) {
                    // Status progression is permitted
                } else {
                    throw new Error(`Revisionsschutz (MiLoG / GoBD): Zeiteintrag im Status "${existing.status}" darf nicht nachträglich verändert werden.`);
                }
            }
    
            const stmt = db.prepare(`
                INSERT INTO zeiterfassung (
                    uuid, mitarbeiter_id, projekt_id, liegenschaft_id, gebaeude_id, raum_id,
                    taetigkeit_typ, zeit_von, zeit_bis, dauer_min, pause_min, qr_code_scanned,
                    geo_lat, geo_lng, bemerkung, wegezeit_eur, status, device_id,
                    is_verspaetet, status_milog, created_at, updated_at
                ) VALUES (
                    @uuid, @mitarbeiter_id, @projekt_id, @liegenschaft_id, @gebaeude_id, @raum_id,
                    @taetigkeit_typ, @zeit_von, @zeit_bis, @dauer_min, @pause_min, @qr_code_scanned,
                    @geo_lat, @geo_lng, @bemerkung, @wegezeit_eur, @status, @device_id,
                    @is_verspaetet, @status_milog, @created_at, CURRENT_TIMESTAMP
                ) ON CONFLICT(uuid) DO UPDATE SET
                    mitarbeiter_id = excluded.mitarbeiter_id,
                    projekt_id = excluded.projekt_id,
                    liegenschaft_id = excluded.liegenschaft_id,
                    gebaeude_id = excluded.gebaeude_id,
                    raum_id = excluded.raum_id,
                    taetigkeit_typ = excluded.taetigkeit_typ,
                    zeit_von = excluded.zeit_von,
                    zeit_bis = excluded.zeit_bis,
                    dauer_min = excluded.dauer_min,
                    pause_min = excluded.pause_min,
                    qr_code_scanned = excluded.qr_code_scanned,
                    geo_lat = excluded.geo_lat,
                    geo_lng = excluded.geo_lng,
                    bemerkung = excluded.bemerkung,
                    wegezeit_eur = excluded.wegezeit_eur,
                    status = excluded.status,
                    is_verspaetet = excluded.is_verspaetet,
                    status_milog = excluded.status_milog,
                    updated_at = CURRENT_TIMESTAMP
            `);
    
            const params = {
                uuid,
                mitarbeiter_id: parseInt(data.mitarbeiter_id, 10),
                projekt_id: data.projekt_id ? parseInt(data.projekt_id, 10) : null,
                liegenschaft_id: data.liegenschaft_id ? parseInt(data.liegenschaft_id, 10) : null,
                gebaeude_id: data.gebaeude_id ? parseInt(data.gebaeude_id, 10) : null,
                raum_id: data.raum_id ? parseInt(data.raum_id, 10) : null,
                taetigkeit_typ: data.taetigkeit_typ || 'PRODUKTIV',
                zeit_von: data.zeit_von,
                zeit_bis: data.zeit_bis || null,
                dauer_min: dauerMin,
                pause_min: pauseMin,
                qr_code_scanned: data.qr_code_scanned ? 1 : 0,
                geo_lat: data.geo_lat != null ? parseFloat(data.geo_lat) : null,
                geo_lng: data.geo_lng != null ? parseFloat(data.geo_lng) : null,
                bemerkung: data.bemerkung || '',
                wegezeit_eur: parseFloat(data.wegezeit_eur) || 0.0,
                status: data.status || 'ERFASST',
                device_id: data.device_id || 'DESKTOP',
                is_verspaetet: isVerspaetet,
                status_milog: statusMilog,
                created_at: createdAt
            };
    
            const res = stmt.run(params);
    
            if (auditLogger && auditLogger.appendAuditLog) {
                auditLogger.appendAuditLog({
                    entityType: 'ZEITERFASSUNG',
                    entityId: res.lastInsertRowid || 0,
                    action: 'ZEITERFASSUNG_GESPEICHERT',
                    details: {
                        uuid,
                        mitarbeiter_id: params.mitarbeiter_id,
                        zeit_von: params.zeit_von,
                        dauer_min: dauerMin,
                        is_verspaetet: isVerspaetet,
                        status_milog: statusMilog,
                        milog_warnung: milogCheck.warnung
                    }
                });
    
                if (isVerspaetet === 1) {
                    auditLogger.appendAuditLog({
                        entityType: 'ZEITERFASSUNG',
                        entityId: res.lastInsertRowid || 0,
                        action: 'ZEITERFASSUNG_MILOG_DELAY_WARNING',
                        details: {
                            uuid,
                            mitarbeiter_id: params.mitarbeiter_id,
                            zeit_von: params.zeit_von,
                            created_at: createdAt,
                            diffDays: milogCheck.diffDays,
                            tage_verspaetung: milogCheck.diffDays,
                            warnung: milogCheck.warnung
                        }
                    });
                }
            }
    
            return {
                success: true,
                uuid,
                id: res.lastInsertRowid,
                arbzg: arbzgCheck,
                milog: {
                    isLate: isVerspaetet === 1,
                    statusMilog,
                    diffDays: milogCheck.diffDays,
                    warnung: milogCheck.warnung
                },
                warnung: milogCheck.warnung || (arbzgCheck.hasVerstoss ? arbzgCheck.verstoesse.join(' ') : null)
            };
        }

    function getZeiteintraege(db, filter = {}) {
            if (!db) return [];
            let query = `
                SELECT z.*, 
                       m.vorname AS mitarbeiter_vorname, m.nachname AS mitarbeiter_nachname, m.personalnummer, m.lohngruppe_id,
                       p.name AS projekt_name,
                       l.name AS liegenschaft_name
                FROM zeiterfassung z
                LEFT JOIN mitarbeiter m ON z.mitarbeiter_id = m.id
                LEFT JOIN projekte p ON z.projekt_id = p.id
                LEFT JOIN liegenschaften l ON z.liegenschaft_id = l.id
                WHERE COALESCE(z.is_deleted, 0) = 0
            `;
            const params = [];
    
            if (filter.mitarbeiter_id) {
                query += ' AND z.mitarbeiter_id = ?';
                params.push(parseInt(filter.mitarbeiter_id, 10));
            }
            if (filter.projekt_id) {
                query += ' AND z.projekt_id = ?';
                params.push(parseInt(filter.projekt_id, 10));
            }
            if (filter.status) {
                query += ' AND z.status = ?';
                params.push(filter.status);
            }
            if (filter.datum_von) {
                query += ' AND z.zeit_von >= ?';
                params.push(filter.datum_von);
            }
            if (filter.datum_bis) {
                query += ' AND z.zeit_von <= ?';
                params.push(filter.datum_bis + 'T23:59:59');
            }
    
            query += ' ORDER BY z.zeit_von DESC';
    
            return db.prepare(query).all(...params);
        }

    function deleteZeiteintrag(db, idOrUuid, auditLogger = null, meta = {}) {
            if (!db) return { success: false, error: 'Keine Datenbankverbindung.' };
    
            const selector = typeof idOrUuid === 'number' ? 'id = ?' : 'uuid = ?';
            const entry = db.prepare(`SELECT * FROM zeiterfassung WHERE ${selector}`).get(idOrUuid);
    
            if (!entry) {
                return { success: false, error: 'Zeiteintrag nicht gefunden.' };
            }
    
            // 1. Revisionsschutz-Prüfung: Freigegebene oder abgerechnete Einträge sind gesperrt!
            if (entry.status === 'FREIGEGEBEN' || entry.status === 'ABGERECHNET') {
                throw new Error(
                    `Revisionsschutz (MiLoG / GoBD): Zeiteintrag im Status "${entry.status}" darf nicht gelöscht werden. Bitte erstellen Sie eine Korrekturbuchung.`
                );
            }
    
            // 2. Begründung validieren (mindestens 5 Zeichen bei expliziter Begründungspflicht)
            let reason = (meta && meta.reason ? meta.reason : (typeof meta === 'string' ? meta : '')).trim();
            if (!reason) {
                reason = 'Manuell storniert';
            }
            if (reason.length < 5) {
                throw new Error('Löschen erfordert eine Begründung mit mindestens 5 Zeichen (Audit-Pflicht).');
            }
    
            const deletedBy = (meta && meta.user) || 'SYSTEM_USER';
    
            // 3. Revisionssicheres Soft-Delete
            const stmt = db.prepare(`
                UPDATE zeiterfassung
                SET is_deleted = 1,
                    deleted_at = CURRENT_TIMESTAMP,
                    deleted_by = ?,
                    delete_reason = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE ${selector}
            `);
    
            const res = stmt.run(deletedBy, reason, idOrUuid);
    
            // 4. Audit-Log Eintrag schreiben
            if (auditLogger && auditLogger.appendAuditLog) {
                auditLogger.appendAuditLog({
                    entityType: 'ZEITERFASSUNG',
                    entityId: entry.id,
                    action: 'ZEITERFASSUNG_SOFT_DELETED',
                    details: {
                        uuid: entry.uuid,
                        mitarbeiter_id: entry.mitarbeiter_id,
                        zeit_von: entry.zeit_von,
                        zeit_bis: entry.zeit_bis,
                        dauer_min: entry.dauer_min,
                        reason,
                        deletedBy
                    }
                });
            }
    
            return { success: res.changes > 0, softDeleted: true };
        }

    function hardDeleteZeiteintrag(db, idOrUuid, referenceDate = new Date(), auditLogger = null) {
            if (!db) throw new Error('Database instance required.');
            const selector = typeof idOrUuid === 'number' ? 'id = ?' : 'uuid = ?';
            const entry = db.prepare(`SELECT * FROM zeiterfassung WHERE ${selector}`).get(idOrUuid);
            if (!entry) return { success: false, error: 'Zeiteintrag nicht gefunden.' };
    
            // Mindestaufbewahrungsfrist nach § 17 Abs. 2 MiLoG prüfen
            const check = this.checkMilogAufbewahrungsfrist(entry.zeit_von, referenceDate);
            if (!check.darfGeloeschtWerden) {
                throw new Error(
                    `Mindestaufbewahrungsfrist verletzt: Zeiterfassungsdaten müssen gem. § 17 Abs. 2 MiLoG mindestens 2 Jahre aufbewahrt werden (kein physisches Löschen vor Ablauf von 24 Monaten).`
                );
            }
    
            const res = db.prepare(`DELETE FROM zeiterfassung WHERE ${selector}`).run(idOrUuid);
    
            if (auditLogger && auditLogger.appendAuditLog) {
                auditLogger.appendAuditLog({
                    entityType: 'ZEITERFASSUNG',
                    entityId: entry.id,
                    action: 'ZEITERFASSUNG_HARD_DELETED_AFTER_RETENTION',
                    details: {
                        uuid: entry.uuid,
                        mitarbeiter_id: entry.mitarbeiter_id,
                        zeit_von: entry.zeit_von,
                        minRetentionDate: check.minRetentionDate
                    }
                });
            }
    
            return { success: res.changes > 0, hardDeleted: true };
        }

    function generateUUID() {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID();
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }

    const moduleExports = {
        checkMilogAufzeichnungsfrist,
        checkMilogAufbewahrungsfrist,
        saveZeiteintrag,
        getZeiteintraege,
        deleteZeiteintrag,
        hardDeleteZeiteintrag,
        generateUUID,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = moduleExports;
    }
    if (typeof window !== 'undefined') {
        window.RetentionManager = moduleExports;
    }
})();
