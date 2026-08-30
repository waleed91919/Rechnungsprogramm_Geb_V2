/**
 * controllers/ZeiterfassungController.js - Gesetzes- & Tarifkonformer Zeiterfassungs-Rechenkern
 * Konform nach BAG 2022/2026, ArbZG §§ 3-5, MiLoG, SchwarzArbG § 19, BRTV-Bau § 7 & RTV Gebäudereinigung.
 * Isomorph lauffähig in Node.js (Electron-Backend/IPC) und Browser (PWA/Renderer).
 */

class ZeiterfassungController {
    /**
     * Gültige Tätigkeitsarten im System
     */
    static TAETIGKEITEN = {
        PRODUKTIV: 'PRODUKTIV',             // Gewerk / Position / Regie
        RUESTZEIT: 'RUESTZEIT',             // Lager / Vorbereitung / Laden
        WEGEZEIT_FAHRER: 'WEGEZEIT_FAHRER', // Lenkzeit (gilt voll als Arbeitszeit)
        WEGEZEIT_MITFAHRER: 'WEGEZEIT_MITFAHRER', // Tarifliche Wegezeitentschädigung
        SCHLECHTWEWETTER: 'SCHLECHTWEWETTER', // Saison-KUG (§ 101 SGB III)
        BEREITSCHAFT: 'BEREITSCHAFT',
        REINIGUNG: 'REINIGUNG'
    };

    /**
     * Statuswerte eines Zeiteintrags
     */
    static STATUS = {
        ERFASST: 'ERFASST',
        GEPRUEFT: 'GEPRUEFT',
        FREIGEGEBEN: 'FREIGEGEBEN',
        ABGERECHNET: 'ABGERECHNET',
        STORNIERT: 'STORNIERT'
    };

    /**
     * Tarifliche Lohngruppen-Referenz (Bau & Gebäudereinigung)
     */
    static LOHNGRUPPEN = {
        LG1: { id: 'LG1', name: 'LG 1 - Innenreinigung / Helfer', satz: 15.00 },
        LG2: { id: 'LG2', name: 'LG 2 - Bauhelfer', satz: 16.50 },
        LG3: { id: 'LG3', name: 'LG 3 - Fachhelfer / Maschinist', satz: 18.20 },
        LG4: { id: 'LG4', name: 'LG 4 - Baufacharbeiter / Geselle', satz: 21.00 },
        LG5: { id: 'LG5', name: 'LG 5 - Spezialfacharbeiter / Vorarbeiter', satz: 24.50 },
        LG6: { id: 'LG6', name: 'LG 6 - Werkpolier / Meister / Glasreinigung', satz: 28.50 }
    };

    /**
     * Berechnet die Netto-Arbeitszeit unter Berücksichtigung der gesetzlichen Pausenabzüge (§ 4 ArbZG).
     * @param {Date|string} start - Beginn der Arbeitszeit
     * @param {Date|string} ende - Ende der Arbeitszeit
     * @param {number} manuellePauseMin - Manuell gestempelte Pausenminuten
     * @returns {Object} { valid, bruttoMin, bruttoStunden, gesetzlichePflichtPauseMin, manuellePauseMin, effektivePauseMin, nettoMin, nettoStunden, hasVerstoss, verstoesse }
     */
    static calculateWorkTime(start, ende, manuellePauseMin = 0) {
        const dStart = new Date(start);
        const dEnde = new Date(ende);

        if (isNaN(dStart.getTime()) || isNaN(dEnde.getTime()) || dEnde <= dStart) {
            return { valid: false, error: 'Ungültiges Start- oder Enddatum' };
        }

        const bruttoMin = Math.round((dEnde - dStart) / (1000 * 60));
        const bruttoStunden = Math.round((bruttoMin / 60) * 100) / 100;
        const pauseMin = Math.max(0, parseInt(manuellePauseMin, 10) || 0);

        // Gesetzliche Mindestpausen nach § 4 ArbZG:
        // > 6 bis 9 Stunden: mind. 30 Minuten
        // > 9 Stunden: mind. 45 Minuten
        let gesetzlichePflichtPauseMin = 0;
        if (bruttoStunden > 9.0) {
            gesetzlichePflichtPauseMin = 45;
        } else if (bruttoStunden > 6.0) {
            gesetzlichePflichtPauseMin = 30;
        }

        // Effektive Pause ist das Maximum aus erfasster Pause und gesetzlicher Pflichtpause
        const effektivePauseMin = Math.max(pauseMin, gesetzlichePflichtPauseMin);
        const nettoMin = Math.max(0, bruttoMin - effektivePauseMin);
        const nettoStunden = Math.round((nettoMin / 60) * 100) / 100;

        // Verstöße gegen Arbeitszeitgesetz ermitteln
        const verstoesse = [];
        if (nettoStunden > 10.0) {
            verstoesse.push('Überschreitung der absoluten Höchstarbeitszeit von 10 Stunden (§ 3 ArbZG).');
        }
        if (bruttoStunden > 6.0 && pauseMin < 30) {
            verstoesse.push('Unzureichende Ruhepause: Bei mehr als 6 Stunden Arbeit sind mindestens 30 Minuten Pause vorgeschrieben (§ 4 ArbZG).');
        }
        if (bruttoStunden > 9.0 && pauseMin < 45) {
            verstoesse.push('Unzureichende Ruhepause: Bei mehr als 9 Stunden Arbeit sind mindestens 45 Minuten Pause vorgeschrieben (§ 4 ArbZG).');
        }

        return {
            valid: true,
            bruttoMin,
            bruttoStunden,
            gesetzlichePflichtPauseMin,
            manuellePauseMin: pauseMin,
            effektivePauseMin,
            nettoMin,
            nettoStunden,
            hasVerstoss: verstoesse.length > 0,
            verstoesse
        };
    }

    /**
     * Berechnet die tarifliche Wegezeitentschädigung nach BRTV-Bau § 7 (Staffel 2024-2026).
     * @param {number} distanzKm - Kürzeste einfache Straßenentfernung Betrieb <-> Baustelle
     * @param {boolean} taeglicheHeimfahrt - true = tägliche Rückkehr; false = Übernachtungsbaustelle
     * @param {number} abwesenheitStunden - Gesamtdauer der Abwesenheit von der Wohnung
     * @returns {Object} { entschädigungEur, steuerfrei, kategorie, bemerkung }
     */
    static calculateBRTVWegezeit(distanzKm, taeglicheHeimfahrt = true, abwesenheitStunden = 8.5) {
        const km = Math.max(0, parseFloat(distanzKm) || 0);

        if (taeglicheHeimfahrt) {
            // Voraussetzung: > 8 Stunden berufsbedingte Abwesenheit
            if (abwesenheitStunden <= 8.0) {
                return { entschädigungEur: 0.0, steuerfrei: true, bemerkung: 'Abwesenheit <= 8h: Kein tariflicher Anspruch' };
            }
            if (km <= 50) {
                return { entschädigungEur: 7.00, steuerfrei: true, kategorie: 'BRTV § 7 Ziff. 3.2 (0-50 km)' };
            } else if (km <= 75) {
                return { entschädigungEur: 8.00, steuerfrei: true, kategorie: 'BRTV § 7 Ziff. 3.2 (51-75 km)' };
            } else {
                return { entschädigungEur: 9.00, steuerfrei: true, kategorie: 'BRTV § 7 Ziff. 3.2 (> 75 km)' };
            }
        } else {
            // Fernbaustellen / Übernachtung (Entschädigung pro An-/Abreisefahrt, steuerpflichtig)
            if (km < 75) {
                return { entschädigungEur: 0.0, steuerfrei: false, bemerkung: 'Entfernung < 75 km für Fernbaustelle' };
            } else if (km <= 200) {
                return { entschädigungEur: 9.00, steuerfrei: false, kategorie: 'BRTV § 7 Ziff. 4.2 (75-200 km)' };
            } else if (km <= 300) {
                return { entschädigungEur: 18.00, steuerfrei: false, kategorie: 'BRTV § 7 Ziff. 4.2 (201-300 km)' };
            } else if (km <= 400) {
                return { entschädigungEur: 27.00, steuerfrei: false, kategorie: 'BRTV § 7 Ziff. 4.2 (301-400 km)' };
            } else {
                return { entschädigungEur: 39.00, steuerfrei: false, kategorie: 'BRTV § 7 Ziff. 4.2 (> 400 km)' };
            }
        }
    }

    /**
     * Prüft die Einhaltung der gesetzlichen Mindestruhezeit nach § 5 ArbZG (11 Stunden).
     * @param {Date|string} vorherigesEnde - Ende der letzten Schicht
     * @param {Date|string} neuesterStart - Beginn der aktuellen Schicht
     * @returns {Object} { valid, ruhezeitStunden, warnung }
     */
    static checkRuhezeit(vorherigesEnde, neuesterStart) {
        if (!vorherigesEnde || !neuesterStart) return { valid: true };
        const dVorher = new Date(vorherigesEnde);
        const dNeu = new Date(neuesterStart);
        if (isNaN(dVorher.getTime()) || isNaN(dNeu.getTime())) return { valid: true };

        const diffStunden = (dNeu - dVorher) / (1000 * 60 * 60);

        if (diffStunden < 11.0) {
            return {
                valid: false,
                ruhezeitStunden: Math.round(diffStunden * 100) / 100,
                warnung: `Verstoß gegen § 5 ArbZG: Die ununterbrochene Ruhezeit beträgt nur ${diffStunden.toFixed(1)} h (gesetzlich gefordert: mind. 11 h).`
            };
        }
        return { valid: true, ruhezeitStunden: Math.round(diffStunden * 100) / 100 };
    }

    /**
     * Validiert einen Stempel-Event inklusive QR-Code und punktuellem Geofence-Snapshot.
     * @param {Object} eventData - { mitarbeiter_id, zeitstempel, qr_code_scanned, geo_lat, geo_lng }
     * @param {Object|null} targetLocation - { lat, lng }
     */
    static validatePunchEvent(eventData, targetLocation = null) {
        if (!eventData || !eventData.mitarbeiter_id) return { valid: false, error: 'Mitarbeiter-ID fehlt.' };
        if (!eventData.zeitstempel && !eventData.zeit_von) return { valid: false, error: 'Zeitstempel fehlt.' };

        let geofenceOk = true;
        let distanzMeter = null;

        const lat = eventData.geo_lat != null ? parseFloat(eventData.geo_lat) : null;
        const lng = eventData.geo_lng != null ? parseFloat(eventData.geo_lng) : null;

        if (targetLocation && targetLocation.lat != null && targetLocation.lng != null && lat != null && lng != null) {
            distanzMeter = this.calculateHaversineDistance(
                targetLocation.lat, targetLocation.lng,
                lat, lng
            );
            // Toleranzbereich: 250 Meter um das Bauobjekt
            if (distanzMeter > 250) {
                geofenceOk = false;
            }
        }

        return {
            valid: true,
            geofenceOk,
            distanzMeter: distanzMeter !== null ? Math.round(distanzMeter) : null,
            qrValid: Boolean(eventData.qr_code_scanned)
        };
    }

    /**
     * Berechnet die Großkreisentfernung (Haversine) in Metern.
     */
    static calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Erdradius in Metern
        const rad = Math.PI / 180;
        const phi1 = lat1 * rad;
        const phi2 = lat2 * rad;
        const deltaPhi = (lat2 - lat1) * rad;
        const deltaLambda = (lon2 - lon1) * rad;

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    /**
     * Erzeugt eine RFC 4122 v4 konforme UUID.
     */
    static generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Berechnet eine Monatsauswertung für einen Mitarbeiter (Soll/Ist, Überstunden, BRTV Wegezeiten, ArbZG Verstöße).
     */
    static calculateMonatsuebersicht(zeiteintraege = [], mitarbeiter = {}) {
        let gesamtBruttoMin = 0;
        let gesamtNettoMin = 0;
        let gesamtPauseMin = 0;
        let gesamtWegezeitEur = 0;
        let verstoesseCount = 0;
        const tagMap = new Map();

        for (const ze of zeiteintraege) {
            const start = ze.zeit_von;
            const ende = ze.zeit_bis;
            const pause = ze.pause_min || 0;

            if (start && ende) {
                const calc = this.calculateWorkTime(start, ende, pause);
                if (calc.valid) {
                    gesamtBruttoMin += calc.bruttoMin;
                    gesamtNettoMin += calc.nettoMin;
                    gesamtPauseMin += calc.effektivePauseMin;
                    if (calc.hasVerstoss) verstoesseCount++;
                }
            } else if (ze.dauer_min) {
                gesamtNettoMin += ze.dauer_min;
            }

            gesamtWegezeitEur += (parseFloat(ze.wegezeit_eur) || 0);

            // Tagesgruppierung
            if (start) {
                const tagStr = start.split('T')[0];
                if (!tagMap.has(tagStr)) {
                    tagMap.set(tagStr, []);
                }
                tagMap.get(tagStr).push(ze);
            }
        }

        const gesamtNettoStunden = Math.round((gesamtNettoMin / 60) * 100) / 100;
        const stundensatz = parseFloat(mitarbeiter.tarif_stundensatz) || 15.00;
        const bruttoVerdienstEur = Math.round((gesamtNettoStunden * stundensatz + gesamtWegezeitEur) * 100) / 100;

        return {
            mitarbeiterId: mitarbeiter.id,
            mitarbeiterName: `${mitarbeiter.vorname || ''} ${mitarbeiter.nachname || ''}`.trim() || 'Mitarbeiter',
            anzahlEintraege: zeiteintraege.length,
            arbeitstage: tagMap.size,
            gesamtBruttoStunden: Math.round((gesamtBruttoMin / 60) * 100) / 100,
            gesamtNettoStunden,
            gesamtPauseMin,
            gesamtWegezeitEur: Math.round(gesamtWegezeitEur * 100) / 100,
            tarifStundensatz: stundensatz,
            bruttoVerdienstEur,
            verstoesseCount
        };
    }

    /**
     * Prüft eine Liste von Zeiteinträgen auf chronologische ArbZG-Konformität (inkl. Schichtabstände).
     */
    static pruefeArbzgKonformitaet(zeiteintraege = []) {
        const sorted = [...zeiteintraege].filter(z => z.zeit_von && z.zeit_bis)
            .sort((a, b) => new Date(a.zeit_von) - new Date(b.zeit_von));

        const resultate = [];
        let vorherigesEnde = null;

        for (const eintrag of sorted) {
            const timeCalc = this.calculateWorkTime(eintrag.zeit_von, eintrag.zeit_bis, eintrag.pause_min);
            let ruhezeitCheck = { valid: true };

            if (vorherigesEnde) {
                ruhezeitCheck = this.checkRuhezeit(vorherigesEnde, eintrag.zeit_von);
            }

            const istKonform = timeCalc.valid && !timeCalc.hasVerstoss && ruhezeitCheck.valid;
            const fehler = [...(timeCalc.verstoesse || [])];
            if (!ruhezeitCheck.valid && ruhezeitCheck.warnung) {
                fehler.push(ruhezeitCheck.warnung);
            }

            resultate.push({
                uuid: eintrag.uuid,
                mitarbeiterId: eintrag.mitarbeiter_id,
                zeitVon: eintrag.zeit_von,
                zeitBis: eintrag.zeit_bis,
                nettoStunden: timeCalc.nettoStunden || 0,
                istKonform,
                fehler
            });

            vorherigesEnde = eintrag.zeit_bis;
        }

        return {
            gesamtGeprueft: resultate.length,
            gesamtKonform: resultate.filter(r => r.istKonform).length,
            gesamtNichtKonform: resultate.filter(r => !r.istKonform).length,
            details: resultate
        };
    }

    // =========================================================================
    // SQLite DB Helper-Methoden (Desktop / Electron Backend)
    // =========================================================================

    /**
     * Speichert einen Arbeitszeiteintrag in SQLite (mit ArbZG-Prüfung und Audit).
     */
    static saveZeiteintrag(db, data, auditLogger = null) {
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

        const stmt = db.prepare(`
            INSERT INTO zeiterfassung (
                uuid, mitarbeiter_id, projekt_id, liegenschaft_id, gebaeude_id, raum_id,
                taetigkeit_typ, zeit_von, zeit_bis, dauer_min, pause_min, qr_code_scanned,
                geo_lat, geo_lng, bemerkung, wegezeit_eur, status, device_id, created_at, updated_at
            ) VALUES (
                @uuid, @mitarbeiter_id, @projekt_id, @liegenschaft_id, @gebaeude_id, @raum_id,
                @taetigkeit_typ, @zeit_von, @zeit_bis, @dauer_min, @pause_min, @qr_code_scanned,
                @geo_lat, @geo_lng, @bemerkung, @wegezeit_eur, @status, @device_id, @created_at, CURRENT_TIMESTAMP
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
            created_at: data.created_at || new Date().toISOString()
        };

        const res = stmt.run(params);

        if (auditLogger && auditLogger.appendAuditLog) {
            auditLogger.appendAuditLog({
                entityType: 'ZEITERFASSUNG',
                entityId: res.lastInsertRowid || 0,
                action: 'ZEITERFASSUNG_GESPEICHERT',
                details: { uuid, mitarbeiter_id: params.mitarbeiter_id, zeit_von: params.zeit_von, dauer_min: dauerMin }
            });
        }

        return {
            success: true,
            uuid,
            id: res.lastInsertRowid,
            arbzg: arbzgCheck
        };
    }

    /**
     * Lädt Zeiterfassungseinträge mit flexiblen Filtern.
     */
    static getZeiteintraege(db, filter = {}) {
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
            WHERE 1=1
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

    /**
     * Löscht einen Zeiteintrag.
     */
    static deleteZeiteintrag(db, idOrUuid, auditLogger = null) {
        if (!db) return { success: false };
        let stmt;
        if (typeof idOrUuid === 'number') {
            stmt = db.prepare('DELETE FROM zeiterfassung WHERE id = ?');
        } else {
            stmt = db.prepare('DELETE FROM zeiterfassung WHERE uuid = ?');
        }
        const res = stmt.run(idOrUuid);

        if (auditLogger && auditLogger.appendAuditLog) {
            auditLogger.appendAuditLog({
                entityType: 'ZEITERFASSUNG',
                entityId: typeof idOrUuid === 'number' ? idOrUuid : 0,
                action: 'ZEITERFASSUNG_GELOESCHT',
                details: { identifier: idOrUuid }
            });
        }

        return { success: res.changes > 0 };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZeiterfassungController;
}
if (typeof window !== 'undefined') {
    window.ZeiterfassungController = ZeiterfassungController;
}
