/**
 * controllers/ZeiterfassungController.js - Gesetzes- & Tarifkonformer Zeiterfassungs-Rechenkern
 * Konform nach BAG 2022/2026, ArbZG §§ 3-5, MiLoG, SchwarzArbG § 19, BRTV-Bau § 7 & RTV Gebäudereinigung.
 * Isomorph lauffähig in Node.js (Electron-Backend/IPC) und Browser (PWA/Renderer).
 */


const ZeiterfassungConstants = typeof require !== 'undefined' ? require('./zeiterfassung/constants') : window.ZeiterfassungConstants;
const ArbzgCalculator = typeof require !== 'undefined' ? require('./zeiterfassung/arbzg_calculator') : window.ArbzgCalculator;
const TarifCalculator = typeof require !== 'undefined' ? require('./zeiterfassung/tarif_calculator') : window.TarifCalculator;
const GeofenceUtils = typeof require !== 'undefined' ? require('./zeiterfassung/geofence_utils') : window.GeofenceUtils;
const RetentionManager = typeof require !== 'undefined' ? require('./zeiterfassung/retention_manager') : window.RetentionManager;

class ZeiterfassungController {
    /**
     * Gültige Tätigkeitsarten im System
     */
    static TAETIGKEITEN = ZeiterfassungConstants.TAETIGKEITEN

    /**
     * Statuswerte eines Zeiteintrags
     */
    static STATUS = ZeiterfassungConstants.STATUS

    /**
     * Tarifliche Lohngruppen-Referenz (Bau & Gebäudereinigung)
     */
    static LOHNGRUPPEN = ZeiterfassungConstants.LOHNGRUPPEN

    /**
     * Berechnet die Netto-Arbeitszeit unter Berücksichtigung der gesetzlichen Pausenabzüge (§ 4 ArbZG).
     * @param {Date|string} start - Beginn der Arbeitszeit
     * @param {Date|string} ende - Ende der Arbeitszeit
     * @param {number} manuellePauseMin - Manuell gestempelte Pausenminuten
     * @returns {Object} { valid, bruttoMin, bruttoStunden, gesetzlichePflichtPauseMin, manuellePauseMin, effektivePauseMin, nettoMin, nettoStunden, hasVerstoss, verstoesse }
     */
    static calculateWorkTime(start, ende, manuellePauseMin = 0) {
        return ArbzgCalculator.calculateWorkTime.apply(this, arguments);
    }

    /**
     * Berechnet die tarifliche Wegezeitentschädigung nach BRTV-Bau § 7 (Staffel 2024-2026).
     * @param {number} distanzKm - Kürzeste einfache Straßenentfernung Betrieb <-> Baustelle
     * @param {boolean} taeglicheHeimfahrt - true = tägliche Rückkehr; false = Übernachtungsbaustelle
     * @param {number} abwesenheitStunden - Gesamtdauer der Abwesenheit von der Wohnung
     * @returns {Object} { entschädigungEur, steuerfrei, kategorie, bemerkung }
     */
    static calculateBRTVWegezeit(distanzKm, taeglicheHeimfahrt = true, abwesenheitStunden = 8.5) {
        return TarifCalculator.calculateBRTVWegezeit.apply(this, arguments);
    }

    /**
     * Prüft die Einhaltung der gesetzlichen Mindestruhezeit nach § 5 ArbZG (11 Stunden).
     * @param {Date|string} vorherigesEnde - Ende der letzten Schicht
     * @param {Date|string} neuesterStart - Beginn der aktuellen Schicht
     * @returns {Object} { valid, ruhezeitStunden, warnung }
     */
    static checkRuhezeit(vorherigesEnde, neuesterStart) {
        return ArbzgCalculator.checkRuhezeit.apply(this, arguments);
    }

    /**
     * Validiert einen Stempel-Event inklusive QR-Code und punktuellem Geofence-Snapshot.
     * @param {Object} eventData - { mitarbeiter_id, zeitstempel, qr_code_scanned, geo_lat, geo_lng }
     * @param {Object|null} targetLocation - { lat, lng }
     */
    static validatePunchEvent(eventData, targetLocation = null) {
        return GeofenceUtils.validatePunchEvent.apply(this, arguments);
    }

    /**
     * Berechnet die Großkreisentfernung (Haversine) in Metern.
     */
    static calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        return GeofenceUtils.calculateHaversineDistance.apply(this, arguments);
    }

    /**
     * Erzeugt eine RFC 4122 v4 konforme UUID.
     */
    static generateUUID() {
        return RetentionManager.generateUUID.apply(this, arguments);
    }

    /**
     * Berechnet eine Monatsauswertung für einen Mitarbeiter (Soll/Ist, Überstunden, BRTV Wegezeiten, ArbZG Verstöße).
     */
    static calculateMonatsuebersicht(zeiteintraege = [], mitarbeiter = {}) {
        return TarifCalculator.calculateMonatsuebersicht.apply(this, arguments);
    }

    /**
     * Prüft eine Liste von Zeiteinträgen auf chronologische ArbZG-Konformität (inkl. Schichtabstände).
     */
    static pruefeArbzgKonformitaet(zeiteintraege = []) {
        return ArbzgCalculator.pruefeArbzgKonformitaet.apply(this, arguments);
    }

    // =========================================================================
    // SQLite DB Helper-Methoden (Desktop / Electron Backend)
    // =========================================================================

    /**
     * Prüft die Einhaltung der 7-Tage-Aufzeichnungsfrist nach § 17 Abs. 1 MiLoG i.V.m. § 2a SchwarzArbG.
     * Arbeitszeiten müssen spätestens bis zum Ablauf des 7. auf den Tag der Arbeitsleistung folgenden
     * Kalendertages aufgezeichnet werden.
     * @param {Date|string} zeitVon - Tag/Beginn der Arbeitsleistung
     * @param {Date|string} createdAt - Tag/Zeitpunkt der Erfassung (Default: now)
     * @returns {Object} { isLate, fristAbgelaufen, diffDays, statusMilog, warnung }
     */
    static checkMilogAufzeichnungsfrist(zeitVon, createdAt = new Date()) {
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

    /**
     * Prüft die Einhaltung der 2-jährigen Mindestaufbewahrungsfrist nach § 17 Abs. 2 MiLoG.
     * Stempel- und Arbeitszeitdaten dürfen vor Ablauf von 24 Monaten (2 Jahren) nicht physisch gelöscht werden.
     * @param {Date|string} zeitVon - Tag der Arbeitsleistung
     * @param {Date|string} referenceDate - Prüfdatum (Default: now)
     * @returns {Object} { darfGeloeschtWerden, minRetentionDate, error }
     */
    static checkMilogAufbewahrungsfrist(zeitVon, referenceDate = new Date()) {
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

    /**
     * Speichert einen Arbeitszeiteintrag in SQLite (mit ArbZG-Prüfung, MiLoG 7-Tage-Check und Audit).
     */
    static saveZeiteintrag(db, data, auditLogger = null) {
        return RetentionManager.saveZeiteintrag.apply(this, arguments);
    }

    /**
     * Lädt Zeiterfassungseinträge mit flexiblen Filtern.
     */
    static getZeiteintraege(db, filter = {}) {
        return RetentionManager.getZeiteintraege.apply(this, arguments);
    }

    /**
     * Revisionssicheres Soft-Delete eines Zeiteintrags (EuGH C-55/18, BAG 1 ABR 22/21, § 17 MiLoG & GoBD).
     */
    static deleteZeiteintrag(db, idOrUuid, auditLogger = null, meta = {}) {
        return RetentionManager.deleteZeiteintrag.apply(this, arguments);
    }

    /**
     * Physisches Löschen (Hard-Delete) - STRIKT GESPERRT vor Ablauf der gesetzlichen
     * 2-jährigen Mindestaufbewahrungsfrist (§ 17 Abs. 2 MiLoG).
     * @param {Object} db - SQLite Datenbank
     * @param {number|string} idOrUuid - ID oder UUID des Zeiteintrags
     * @param {Date|string} referenceDate - Referenzdatum (Default: now)
     * @param {Object|null} auditLogger - AuditLogger
     */
    static hardDeleteZeiteintrag(db, idOrUuid, referenceDate = new Date(), auditLogger = null) {
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
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZeiterfassungController;
}
if (typeof window !== 'undefined') {
    window.ZeiterfassungController = ZeiterfassungController;
}
