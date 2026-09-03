/**
 * main/sync-bundle-importer.js - Desktop ERP Importer für verschlüsselte .wlsync Notfall-Dateien
 * Validiert PBKDF2/AES-GCM-256 Pakete, prüft Idempotenz gegen sync_processed_mutations
 * und erzeugt eine Quittung (.wlsync_ack).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CryptoSyncBundle = require('../pwa/js/crypto-sync-bundle');
const ZeiterfassungController = require('../controllers/ZeiterfassungController');
const BautagebuchMobileController = require('../controllers/BautagebuchMobileController');

class SyncBundleImporter {
    /**
     * @param {Object} db - better-sqlite3 Instanz
     * @param {Object} auditLogger - GoBD Audit Logger
     */
    constructor(db, auditLogger = null) {
        this.db = db;
        this.auditLogger = auditLogger;
    }

    /**
     * Importiert ein .wlsync Bundle aus einem Datei-Pfad oder String.
     * @param {string} bundlePathOrJson - Dateipfad zur .wlsync Datei oder JSON-String
     * @param {string} passphrase - Baustellen-Passwort zur Entschlüsselung
     * @returns {Promise<Object>} Import-Ergebnis { success, importedCount, skippedCount, ackBundle }
     */
    async importBundle(bundlePathOrJson, passphrase) {
        let bundleJson = bundlePathOrJson;
        if (typeof bundlePathOrJson === 'string' && fs.existsSync(bundlePathOrJson)) {
            bundleJson = fs.readFileSync(bundlePathOrJson, 'utf-8');
        }

        // 1. Entschlüsseln und SHA-256 verifizieren
        const payload = await CryptoSyncBundle.importFromBundle(bundleJson, passphrase);
        const { export_meta = {}, mutations = [], photos = [] } = payload;
        const deviceId = export_meta.deviceId || 'OFFLINE-DEVICE';

        let importedCount = 0;
        let skippedCount = 0;
        const processedUuids = [];

        // 2. Transaktionaler Import in SQLite mit Idempotenz-Prüfung
        const tx = this.db.transaction(() => {
            const checkStmt = this.db.prepare('SELECT id FROM sync_processed_mutations WHERE mutation_uuid = ?');
            const insertMutationRecordStmt = this.db.prepare(`
                INSERT INTO sync_processed_mutations (mutation_uuid, device_id, entity_type, entity_uuid, created_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            for (const mut of mutations) {
                if (!mut || !mut.uuid) continue;

                // Idempotenz: Bereits verarbeitet?
                const exists = checkStmt.get(mut.uuid);
                if (exists) {
                    skippedCount++;
                    processedUuids.push(mut.uuid);
                    continue;
                }

                // Mutation anwenden
                this._applyMutation(mut, deviceId);
                insertMutationRecordStmt.run(mut.uuid, deviceId, mut.entity_type || 'UNKNOWN', mut.entity_uuid || mut.uuid);
                importedCount++;
                processedUuids.push(mut.uuid);
            }
        });

        tx();

        // 3. Quittungs-Paket generieren (.wlsync_ack)
        const ackPayload = {
            magic: 'WLSYNC_ACK',
            version: '1.0',
            device_id: deviceId,
            imported_at: new Date().toISOString(),
            imported_count: importedCount,
            skipped_count: skippedCount,
            acked_uuids: processedUuids
        };

        if (this.auditLogger && typeof this.auditLogger.appendAuditLog === 'function') {
            this.auditLogger.appendAuditLog({
                entityType: 'SYNC_BUNDLE',
                entityId: 0,
                action: 'USB_BUNDLE_IMPORTED',
                details: { deviceId, importedCount, skippedCount }
            });
        }

        return {
            success: true,
            deviceId,
            importedCount,
            skippedCount,
            ackedUuids: processedUuids,
            ackBundle: JSON.stringify(ackPayload, null, 2)
        };
    }

    _applyMutation(mut, deviceId) {
        const { entity_type, entity_uuid, payload } = mut;
        const data = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});
        data.uuid = data.uuid || entity_uuid || mut.uuid;
        data.device_id = data.device_id || deviceId;

        if (entity_type === 'ZEITERFASSUNG') {
            ZeiterfassungController.saveZeiteintrag(this.db, data, this.auditLogger);
        } else if (entity_type === 'BAUTAGEBUCH') {
            const upsertBtStmt = this.db.prepare(`
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
        } else if (entity_type === 'VOB_MELDUNG' || entity_type === 'BEDENKEN_BEHINDERUNGEN') {
            BautagebuchMobileController.saveVobMeldung(this.db, data, this.auditLogger);
        } else if (entity_type === 'AUFMASS_ZEILE' || entity_type === 'AUFMASS') {
            const stmt = this.db.prepare(`
                INSERT INTO aufmass_zeilen (
                    uuid, blatt_id, oz_code, zeilen_nr, bezeichnung, formel_reb, formel_code, rechenansatz, ergebnis, einheit, raum_id
                ) VALUES (
                    @uuid, @blatt_id, @oz_code, @zeilen_nr, @bezeichnung, @formel_code, @formel_code, @rechenansatz, @ergebnis, @einheit, @raum_id
                ) ON CONFLICT(uuid) DO UPDATE SET
                    rechenansatz = excluded.rechenansatz,
                    ergebnis = excluded.ergebnis
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
                raum_id: data.raum_id || null
            });
        } else if (entity_type === 'GERAETE_BUCHUNG' || entity_type === 'GERAET') {
            const stmt = this.db.prepare(`
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
                projekt_id: parseInt(data.projekt_id, 10),
                geraet_code: data.geraet_code || 'GERAET',
                datum: data.datum || new Date().toISOString().split('T')[0],
                betriebsstunden: parseFloat(data.betriebsstunden || data.stunden) || 0.0,
                stillstand_stunden: parseFloat(data.stillstand_stunden) || 0.0,
                stillstand_grund: data.stillstand_grund || null,
                device_id: deviceId
            });
        } else if (entity_type === 'LIEFERSCHEIN') {
            const stmt = this.db.prepare(`
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
                projekt_id: parseInt(data.projekt_id, 10),
                lieferant_name: data.lieferant_name || 'Lieferant',
                lieferschein_nr: data.lieferschein_nr || '',
                datum: data.datum || new Date().toISOString().split('T')[0],
                foto_pfad: data.foto_pfad || '',
                sha256_hash: data.sha256_hash || '',
                status: data.status || 'ERFASST',
                device_id: deviceId
            });
        }
    }
}

module.exports = SyncBundleImporter;
