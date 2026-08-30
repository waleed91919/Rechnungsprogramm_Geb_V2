/**
 * controllers/MaengelController.js - Rechtssicheres Mängelkataster & Fristenmanagement
 * Konform nach VOB/B §§ 12, 13 und BGB §§ 634, 635, 640, 641 Abs. 3 (Druckzuschlag mind. 200%).
 * Isomorph aufgebaut für Node.js Backend und Electron Renderer UI.
 */

class MaengelController {
    /**
     * Erlaubte Status-Werte im Mängel-Lebenszyklus.
     */
    static getValidStatuses() {
        return [
            'ERFASST',
            'MAENGELRUEGE_VERSCHICKT',
            'IN_NACHBESSERUNG',
            'MAHNUNG_STUFE_2',
            'ZUR_ABNAHME',
            'ERLEDIGT',
            'ERSATZVORNAHME',
            'ABGEWIESEN'
        ];
    }

    /**
     * Berechnet den Ampel-Status und verbleibende Tage für einen Mangel.
     * @param {string|Date} fristDate - Gesetzte Nachbesserungsfrist
     * @param {string} status - Aktueller Mängelstatus
     * @returns {Object} { color: 'GREEN'|'YELLOW'|'RED'|'GRAY', daysRemaining: number|null, isOverdue: boolean, text: string }
     */
    static calculateFristAmpel(fristDate, status) {
        if (!fristDate || status === 'ERLEDIGT' || status === 'ABGEWIESEN') {
            return { color: 'GRAY', daysRemaining: null, isOverdue: false, text: 'Erledigt / Keine Frist' };
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const target = new Date(fristDate);
        target.setHours(0, 0, 0, 0);

        if (isNaN(target.getTime())) {
            return { color: 'GRAY', daysRemaining: null, isOverdue: false, text: 'Ungültiges Fristdatum' };
        }

        const diffTime = target.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysRemaining < 0) {
            return { color: 'RED', daysRemaining, isOverdue: true, text: `Überfällig seit ${Math.abs(daysRemaining)} Tagen!` };
        } else if (daysRemaining <= 7) {
            return { color: 'YELLOW', daysRemaining, isOverdue: false, text: `Frist läuft in ${daysRemaining} Tagen ab` };
        } else {
            return { color: 'GREEN', daysRemaining, isOverdue: false, text: `Fristgerecht (${daysRemaining} Tage verbleibend)` };
        }
    }

    /**
     * Berechnet den gesetzlichen Druckzuschlag / Einbehalt nach § 641 Abs. 3 BGB (mind. 200%).
     * @param {number} geschaetzteKosten - Geschätzte Kosten der Mängelbeseitigung in EUR
     * @param {number} faktor - Sicherheitsfaktor (Standard: 2.0 = doppelte Kosten)
     */
    static calculateDruckzuschlag(geschaetzteKosten = 0, faktor = 2.0) {
        const basis = Math.max(0, parseFloat(geschaetzteKosten) || 0);
        const f = Math.max(1.0, parseFloat(faktor) || 2.0);
        const einbehalt = Math.round((basis * f) * 100) / 100;
        return {
            geschaetzteKosten: basis,
            faktor: f,
            einbehaltBetrag: einbehalt,
            begruendung: `Druckzuschlag gemäß § 641 Abs. 3 BGB (${Math.round(f * 100)}% der geschätzten Mängelbeseitigungskosten)`
        };
    }

    /**
     * Generiert das rechtssichere Anschreiben für Stufe 1 (Mängelrüge) oder Stufe 2 (Nachfrist & Ersatzvornahmeandrohung).
     * @param {Object} mangel - Mängeldatensatz
     * @param {Object} partner - Adressat / Subunternehmer / Auftraggeber
     * @param {number} stufe - 1 (Mängelrüge) oder 2 (Nachfristsetzung / Mahnung)
     * @param {Object} optionen - Zusatzoptionen wie { fristDatum, nachfristDatum, bemerkung }
     */
    static generateMahnschreibenText(mangel = {}, partner = {}, stufe = 1, optionen = {}) {
        const mangelNr = mangel.mangel_nr || `M-${mangel.id || '001'}`;
        const datumStr = new Date().toLocaleDateString('de-DE');
        const defaultFristDate = new Date(Date.now() + (stufe === 1 ? 14 : 7) * 86400000);
        const fristRaw = optionen.fristDatum || (stufe === 1 ? mangel.nachbesserungsfrist : (mangel.nachfrist_stufe2 || mangel.nachbesserungsfrist));
        const fristStr = fristRaw
            ? new Date(fristRaw).toLocaleDateString('de-DE')
            : defaultFristDate.toLocaleDateString('de-DE');

        const druckzuschlag = MaengelController.calculateDruckzuschlag(
            mangel.geschaetzte_beseitigungskosten_eur || 0,
            mangel.druckzuschlag_faktor || 2.0
        );

        const empfaengerName = partner.name || partner.firmenname || mangel.subunternehmer_name || 'Nachunternehmer';
        const projektName = mangel.projekt_name || 'Bauvorhaben';
        const ortStr = [mangel.ort_beschreibung, mangel.bauteil, mangel.gewerk].filter(Boolean).join(', ') || 'Baustelle';

        if (stufe === 1) {
            return {
                stufe: 1,
                betreff: `Mängelrüge nach § 13 Abs. 5 Nr. 1 VOB/B – BV: ${projektName} – Mangel-Nr. ${mangelNr}`,
                empfaenger: empfaengerName,
                fristDatum: fristStr,
                text: `Sehr geehrte Damen und Herren,\n\n` +
                    `bei der Überprüfung der Arbeiten im Bauvorhaben „${projektName}“ wurden am ${mangel.erfasst_am ? new Date(mangel.erfasst_am).toLocaleDateString('de-DE') : datumStr} ` +
                    `im Bereich „${ortStr}“ folgende Mängel festgestellt:\n\n` +
                    `Bezeichnung: ${mangel.titel || 'Mangel'}\n` +
                    `Beschreibung: ${mangel.beschreibung || 'Keine nähere Beschreibung angegeben.'}\n\n` +
                    `Wir fordern Sie hiermit gemäß § 13 Abs. 5 Nr. 1 VOB/B auf, die Mängel bis spätestens zum\n\n` +
                    `   >>> ${fristStr} <<<\n\n` +
                    `vollständig, fachgerecht und dauerhaft zu beseitigen und uns die Fertigstellung unverzüglich schriftlich anzuzeigen.\n\n` +
                    `Mit freundlichen Grüßen\nBauleitung / Projektleitung`
            };
        } else {
            const ruegeDatumStr = mangel.maengelruege_versandt_am 
                ? new Date(mangel.maengelruege_versandt_am).toLocaleDateString('de-DE')
                : (mangel.erfasst_am ? new Date(mangel.erfasst_am).toLocaleDateString('de-DE') : 'unserem vorherigen Schreiben');

            return {
                stufe: 2,
                betreff: `Nachfristsetzung mit Androhung von Ersatzvornahme gem. § 13 Abs. 5 Nr. 2 VOB/B – Mangel-Nr. ${mangelNr}`,
                empfaenger: empfaengerName,
                fristDatum: fristStr,
                einbehaltBetrag: druckzuschlag.einbehaltBetrag,
                text: `Sehr geehrte Damen und Herren,\n\n` +
                    `auf unsere Mängelrüge vom ${ruegeDatumStr} haben Sie die festgestellten Mängel ` +
                    `im Bauvorhaben „${projektName}“ (Mangel-Nr. ${mangelNr}, Bereich: ${ortStr}) nicht innerhalb der gesetzten Frist beseitigt.\n\n` +
                    `Wir setzen Ihnen hiermit eine letztmalige Nachfrist zur Mängelbeseitigung bis zum\n\n` +
                    `   >>> ${fristStr} <<<\n\n` +
                    `Sollte auch diese Nachfrist fruchtlos verstreichen, werden wir die Mängelbeseitigung ohne weitere Ankündigung ` +
                    `im Wege der Ersatzvornahme durch einen Drittbetrieb auf Ihre Kosten ausführen lassen (§ 13 Abs. 5 Nr. 2 VOB/B).\n\n` +
                    `Vorsorglich machen wir gemäß § 641 Abs. 3 BGB von unserem gesetzlichen Zurückbehaltungsrecht Gebrauch und behalten ` +
                    `einen Betrag in Höhe von ${druckzuschlag.einbehaltBetrag.toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR ` +
                    `(Druckzuschlag mind. 200% der geschätzten Mängelbeseitigungskosten) von fälligen Vergütungen bzw. Sicherheitseinbehalten ein.\n\n` +
                    `Mit freundlichen Grüßen\nBauleitung / Geschäftsführung`
            };
        }
    }

    /**
     * Erzeugt druckfertiges HTML für Mängelrüge / Nachfristsetzung im DIN A4 Format.
     */
    static generateMahnschreibenHtml(mangel = {}, partner = {}, stufe = 1, optionen = {}, companyInfo = {}) {
        const schreiben = MaengelController.generateMahnschreibenText(mangel, partner, stufe, optionen);
        const datumStr = new Date().toLocaleDateString('de-DE');

        return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>${schreiben.betreff}</title>
<style>
    @page { size: A4 portrait; margin: 20mm 20mm 20mm 25mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; color: #0f172a; line-height: 1.5; margin: 0; padding: 0; background: #fff; }
    .sender-line { font-size: 8pt; color: #64748b; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin-bottom: 25px; }
    .recipient-box { margin-bottom: 35px; font-size: 10pt; line-height: 1.4; }
    .date-line { text-align: right; margin-bottom: 25px; font-size: 10pt; color: #334155; }
    .subject { font-size: 12pt; font-weight: bold; color: ${stufe === 1 ? '#0f172a' : '#991b1b'}; margin-bottom: 20px; }
    .body-text { white-space: pre-line; margin-bottom: 30px; font-size: 10.5pt; }
    .alert-box { background: ${stufe === 1 ? '#f8fafc' : '#fef2f2'}; border-left: 4px solid ${stufe === 1 ? '#0284c7' : '#ef4444'}; padding: 12px 15px; margin: 18px 0; border-radius: 2px; font-size: 10pt; }
    .footer-sign { margin-top: 40px; }
</style>
</head>
<body>
    <div class="sender-line">${companyInfo.firmenname || 'W-Link ERP'} &bull; ${companyInfo.strasse || ''} &bull; ${companyInfo.plz || ''} ${companyInfo.ort || ''}</div>
    
    <div class="recipient-box">
        <strong>${partner.name || partner.firmenname || mangel.subunternehmer_name || 'Nachunternehmer'}</strong><br>
        ${partner.ansprechpartner ? `z. Hd. ${partner.ansprechpartner}<br>` : ''}
        ${partner.strasse || ''}<br>
        ${partner.plz || ''} ${partner.ort || ''}
    </div>

    <div class="date-line">Datum: ${datumStr}</div>

    <div class="subject">${schreiben.betreff}</div>

    <div class="body-text">${schreiben.text}</div>

    <div class="alert-box">
        <strong>Rechtlicher Hinweis:</strong> ${stufe === 1 
            ? 'Mit Zugang dieser Mängelrüge beginnt die Verjährungsfrist für den gerügten Mangel gem. § 13 Abs. 5 Nr. 1 VOB/B neu zu laufen (mindestens 2 Jahre Hemmung/Neubeginn ab Zugang).'
            : 'Nach Ablauf dieser Nachfrist sind Sie gem. § 13 Abs. 5 Nr. 2 VOB/B von der Nachbesserung ausgeschlossen. Der Anspruch auf Ersatz der Mehrkosten bleibt vollumfänglich vorbehalten.'}
    </div>

    <div class="footer-sign">
        <p>Mit freundlichen Grüßen</p>
        <p style="margin-top: 30px;"><strong>${companyInfo.firmenname || 'W-Link ERP System'}</strong><br>Bauleitung / Geschäftsführung</p>
    </div>
</body>
</html>`;
    }

    // =========================================================================
    // DATABASE METHODS (Für Node.js Backend & IPC)
    // =========================================================================

    /**
     * Speichert einen Mangeleintrag (Neu oder Update) mit Audit-Historie.
     */
    static saveMangel(db, mangelData = {}, fotos = [], auditLogger = null) {
        if (!db) throw new Error('Database handle fehlt in saveMangel.');
        const m = { ...mangelData };
        let mangelId = m.id ? parseInt(m.id, 10) : null;
        let isNew = !mangelId;

        const druckzuschlag = MaengelController.calculateDruckzuschlag(
            m.geschaetzte_beseitigungskosten_eur || 0,
            m.druckzuschlag_faktor || 2.0
        );

        const tx = db.transaction(() => {
            if (isNew) {
                // Eindeutige Mangel-Nummer pro Projekt ermitteln
                if (!m.mangel_nr) {
                    const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM maengelkataster WHERE projekt_id = ?').get(m.projekt_id);
                    const nextNum = (countRow ? countRow.cnt : 0) + 1;
                    m.mangel_nr = `M-${String(nextNum).padStart(3, '0')}`;
                }

                const insertStmt = db.prepare(`
                    INSERT INTO maengelkataster (
                        projekt_id, mangel_nr, titel, beschreibung, gewerk, bauteil,
                        objekt_typ, objekt_id, ort_beschreibung, schweregrad, status,
                        verursacher_typ, subunternehmer_kunde_id, erfasst_von,
                        nachbesserungsfrist, nachfrist_stufe2, geschaetzte_beseitigungskosten_eur,
                        tatsaechliche_ersatzvornahme_kosten_eur, druckzuschlag_faktor,
                        einbehalt_betrag_eur, verknuepfte_eingangsrechnung_id,
                        verknuepfter_einbehalt_id, bemerkungen
                    ) VALUES (
                        @projekt_id, @mangel_nr, @titel, @beschreibung, @gewerk, @bauteil,
                        @objekt_typ, @objekt_id, @ort_beschreibung, @schweregrad, @status,
                        @verursacher_typ, @subunternehmer_kunde_id, @erfasst_von,
                        @nachbesserungsfrist, @nachfrist_stufe2, @geschaetzte_beseitigungskosten_eur,
                        @tatsaechliche_ersatzvornahme_kosten_eur, @druckzuschlag_faktor,
                        @einbehalt_betrag_eur, @verknuepfte_eingangsrechnung_id,
                        @verknuepfter_einbehalt_id, @bemerkungen
                    )
                `);

                const res = insertStmt.run({
                    projekt_id: m.projekt_id,
                    mangel_nr: m.mangel_nr,
                    titel: m.titel || 'Unbenannter Mangel',
                    beschreibung: m.beschreibung || '',
                    gewerk: m.gewerk || '',
                    bauteil: m.bauteil || '',
                    objekt_typ: m.objekt_typ || null,
                    objekt_id: m.objekt_id || null,
                    ort_beschreibung: m.ort_beschreibung || '',
                    schweregrad: m.schweregrad || 'MITTEL',
                    status: m.status || 'ERFASST',
                    verursacher_typ: m.verursacher_typ || 'SUB',
                    subunternehmer_kunde_id: m.subunternehmer_kunde_id || null,
                    erfasst_von: m.erfasst_von || 'Bauleiter',
                    nachbesserungsfrist: m.nachbesserungsfrist || null,
                    nachfrist_stufe2: m.nachfrist_stufe2 || null,
                    geschaetzte_beseitigungskosten_eur: parseFloat(m.geschaetzte_beseitigungskosten_eur) || 0,
                    tatsaechliche_ersatzvornahme_kosten_eur: parseFloat(m.tatsaechliche_ersatzvornahme_kosten_eur) || 0,
                    druckzuschlag_faktor: druckzuschlag.faktor,
                    einbehalt_betrag_eur: druckzuschlag.einbehaltBetrag,
                    verknuepfte_eingangsrechnung_id: m.verknuepfte_eingangsrechnung_id || null,
                    verknuepfter_einbehalt_id: m.verknuepfter_einbehalt_id || null,
                    bemerkungen: m.bemerkungen || ''
                });

                mangelId = res.lastInsertRowid;

                // Erster Historien-Eintrag
                db.prepare(`
                    INSERT INTO maengel_historie (mangel_id, alter_status, neuer_status, geaendert_von, kommentar)
                    VALUES (?, NULL, ?, ?, ?)
                `).run(mangelId, m.status || 'ERFASST', m.erfasst_von || 'Bauleiter', 'Mangel neu erfasst');
            } else {
                const existing = db.prepare('SELECT * FROM maengelkataster WHERE id = ?').get(mangelId);
                if (!existing) throw new Error(`Mangel mit ID ${mangelId} nicht gefunden.`);

                const updateStmt = db.prepare(`
                    UPDATE maengelkataster SET
                        titel = @titel,
                        beschreibung = @beschreibung,
                        gewerk = @gewerk,
                        bauteil = @bauteil,
                        objekt_typ = @objekt_typ,
                        objekt_id = @objekt_id,
                        ort_beschreibung = @ort_beschreibung,
                        schweregrad = @schweregrad,
                        status = @status,
                        verursacher_typ = @verursacher_typ,
                        subunternehmer_kunde_id = @subunternehmer_kunde_id,
                        nachbesserungsfrist = @nachbesserungsfrist,
                        nachfrist_stufe2 = @nachfrist_stufe2,
                        geschaetzte_beseitigungskosten_eur = @geschaetzte_beseitigungskosten_eur,
                        tatsaechliche_ersatzvornahme_kosten_eur = @tatsaechliche_ersatzvornahme_kosten_eur,
                        druckzuschlag_faktor = @druckzuschlag_faktor,
                        einbehalt_betrag_eur = @einbehalt_betrag_eur,
                        verknuepfte_eingangsrechnung_id = @verknuepfte_eingangsrechnung_id,
                        verknuepfter_einbehalt_id = @verknuepfter_einbehalt_id,
                        bemerkungen = @bemerkungen
                    WHERE id = @id
                `);

                updateStmt.run({
                    id: mangelId,
                    titel: m.titel !== undefined ? m.titel : existing.titel,
                    beschreibung: m.beschreibung !== undefined ? m.beschreibung : existing.beschreibung,
                    gewerk: m.gewerk !== undefined ? m.gewerk : existing.gewerk,
                    bauteil: m.bauteil !== undefined ? m.bauteil : existing.bauteil,
                    objekt_typ: m.objekt_typ !== undefined ? m.objekt_typ : existing.objekt_typ,
                    objekt_id: m.objekt_id !== undefined ? m.objekt_id : existing.objekt_id,
                    ort_beschreibung: m.ort_beschreibung !== undefined ? m.ort_beschreibung : existing.ort_beschreibung,
                    schweregrad: m.schweregrad !== undefined ? m.schweregrad : existing.schweregrad,
                    status: m.status !== undefined ? m.status : existing.status,
                    verursacher_typ: m.verursacher_typ !== undefined ? m.verursacher_typ : existing.verursacher_typ,
                    subunternehmer_kunde_id: m.subunternehmer_kunde_id !== undefined ? m.subunternehmer_kunde_id : existing.subunternehmer_kunde_id,
                    nachbesserungsfrist: m.nachbesserungsfrist !== undefined ? m.nachbesserungsfrist : existing.nachbesserungsfrist,
                    nachfrist_stufe2: m.nachfrist_stufe2 !== undefined ? m.nachfrist_stufe2 : existing.nachfrist_stufe2,
                    geschaetzte_beseitigungskosten_eur: m.geschaetzte_beseitigungskosten_eur !== undefined ? parseFloat(m.geschaetzte_beseitigungskosten_eur) : existing.geschaetzte_beseitigungskosten_eur,
                    tatsaechliche_ersatzvornahme_kosten_eur: m.tatsaechliche_ersatzvornahme_kosten_eur !== undefined ? parseFloat(m.tatsaechliche_ersatzvornahme_kosten_eur) : existing.tatsaechliche_ersatzvornahme_kosten_eur,
                    druckzuschlag_faktor: druckzuschlag.faktor,
                    einbehalt_betrag_eur: druckzuschlag.einbehaltBetrag,
                    verknuepfte_eingangsrechnung_id: m.verknuepfte_eingangsrechnung_id !== undefined ? m.verknuepfte_eingangsrechnung_id : existing.verknuepfte_eingangsrechnung_id,
                    verknuepfter_einbehalt_id: m.verknuepfter_einbehalt_id !== undefined ? m.verknuepfter_einbehalt_id : existing.verknuepfter_einbehalt_id,
                    bemerkungen: m.bemerkungen !== undefined ? m.bemerkungen : existing.bemerkungen
                });

                if (m.status && m.status !== existing.status) {
                    db.prepare(`
                        INSERT INTO maengel_historie (mangel_id, alter_status, neuer_status, geaendert_von, kommentar)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(mangelId, existing.status, m.status, m.geaendert_von || 'System', m.kommentar || 'Status aktualisiert');
                }
            }

            // Fotos hinzufügen
            if (Array.isArray(fotos) && fotos.length > 0) {
                const insertFotoStmt = db.prepare(`
                    INSERT INTO maengel_fotos (mangel_id, dateipfad, thumbnail_base64, typ, kommentar)
                    VALUES (?, ?, ?, ?, ?)
                `);
                for (const f of fotos) {
                    insertFotoStmt.run(mangelId, f.dateipfad || '', f.thumbnail_base64 || null, f.typ || 'VOR_NACHBESSERUNG', f.kommentar || '');
                }
            }

            if (auditLogger && typeof auditLogger.appendAuditLog === 'function') {
                auditLogger.appendAuditLog({
                    entityType: 'MANGEL',
                    entityId: Number(mangelId),
                    action: isNew ? 'MANGEL_ERSTELLT' : 'MANGEL_AKTUALISIERT',
                    details: { mangel_nr: m.mangel_nr, status: m.status || 'ERFASST', titel: m.titel }
                });
            }

            return mangelId;
        });

        const id = tx();
        return { success: true, mangelId: id };
    }

    /**
     * Führt einen Statuswechsel für einen Mangel durch.
     */
    static updateMangelStatus(db, mangelId, newStatus, kommentar = '', geaendertVon = 'Bauleiter', auditLogger = null) {
        if (!db) throw new Error('Database handle fehlt in updateMangelStatus.');
        const valid = MaengelController.getValidStatuses();
        if (!valid.includes(newStatus)) {
            throw new Error(`Ungültiger Status "${newStatus}". Erlaubt: ${valid.join(', ')}`);
        }

        const existing = db.prepare('SELECT * FROM maengelkataster WHERE id = ?').get(mangelId);
        if (!existing) throw new Error(`Mangel mit ID ${mangelId} nicht gefunden.`);

        const nowIso = new Date().toISOString();
        let extraSql = '';
        if (newStatus === 'MAENGELRUEGE_VERSCHICKT') {
            extraSql = ', maengelruege_versandt_am = CURRENT_TIMESTAMP';
        } else if (newStatus === 'MAHNUNG_STUFE_2') {
            extraSql = ', mahnung_stufe2_versandt_am = CURRENT_TIMESTAMP';
        } else if (newStatus === 'ERLEDIGT') {
            extraSql = ', erledigt_am = CURRENT_TIMESTAMP';
        } else if (newStatus === 'ZUR_ABNAHME') {
            extraSql = ', abnahme_am = CURRENT_TIMESTAMP';
        }

        const tx = db.transaction(() => {
            db.prepare(`UPDATE maengelkataster SET status = ? ${extraSql} WHERE id = ?`).run(newStatus, mangelId);

            db.prepare(`
                INSERT INTO maengel_historie (mangel_id, alter_status, neuer_status, geaendert_am, geaendert_von, kommentar)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
            `).run(mangelId, existing.status, newStatus, geaendertVon, kommentar);

            if (auditLogger && typeof auditLogger.appendAuditLog === 'function') {
                auditLogger.appendAuditLog({
                    entityType: 'MANGEL',
                    entityId: Number(mangelId),
                    action: 'STATUS_GEWECHSELT',
                    details: { alter_status: existing.status, neuer_status: newStatus, kommentar }
                });
            }
        });

        tx();
        return { success: true, alterStatus: existing.status, neuerStatus: newStatus };
    }

    /**
     * Liefert alle Mängel mit Fristen-Ampel, Projektinfo und Fotovorschau.
     */
    static getKataster(db, filter = {}) {
        if (!db) return [];
        let query = `
            SELECT m.*, p.name AS projekt_name, k.name AS subunternehmer_name
            FROM maengelkataster m
            LEFT JOIN projekte p ON m.projekt_id = p.id
            LEFT JOIN kunden k ON m.subunternehmer_kunde_id = k.id
            WHERE 1=1
        `;
        const params = [];

        if (filter.projektId) {
            query += ' AND m.projekt_id = ?';
            params.push(parseInt(filter.projektId, 10));
        }
        if (filter.status) {
            query += ' AND m.status = ?';
            params.push(filter.status);
        }
        if (filter.subId) {
            query += ' AND m.subunternehmer_kunde_id = ?';
            params.push(parseInt(filter.subId, 10));
        }
        if (filter.schweregrad) {
            query += ' AND m.schweregrad = ?';
            params.push(filter.schweregrad);
        }

        query += ' ORDER BY m.erfasst_am DESC, m.id DESC';

        const rows = db.prepare(query).all(...params);

        const stmtFotos = db.prepare('SELECT id, dateipfad, thumbnail_base64, typ, aufnahme_datum FROM maengel_fotos WHERE mangel_id = ?');

        return rows.map(r => {
            const fristAmpel = MaengelController.calculateFristAmpel(r.nachbesserungsfrist, r.status);
            const nachfristAmpel = r.nachfrist_stufe2 ? MaengelController.calculateFristAmpel(r.nachfrist_stufe2, r.status) : null;
            const druckzuschlag = MaengelController.calculateDruckzuschlag(r.geschaetzte_beseitigungskosten_eur, r.druckzuschlag_faktor);
            const fotos = stmtFotos.all(r.id);

            return {
                ...r,
                fristAmpel,
                nachfristAmpel,
                druckzuschlag,
                fotos
            };
        });
    }

    /**
     * Liefert einen einzelnen Mangel inkl. Historie und Fotos.
     */
    static getMangelDetails(db, mangelId) {
        if (!db) return null;
        const r = db.prepare(`
            SELECT m.*, p.name AS projekt_name, k.name AS subunternehmer_name, k.email AS subunternehmer_email
            FROM maengelkataster m
            LEFT JOIN projekte p ON m.projekt_id = p.id
            LEFT JOIN kunden k ON m.subunternehmer_kunde_id = k.id
            WHERE m.id = ?
        `).get(mangelId);

        if (!r) return null;

        const fotos = db.prepare('SELECT * FROM maengel_fotos WHERE mangel_id = ? ORDER BY id ASC').all(mangelId);
        const historie = db.prepare('SELECT * FROM maengel_historie WHERE mangel_id = ? ORDER BY geaendert_am ASC').all(mangelId);
        const fristAmpel = MaengelController.calculateFristAmpel(r.nachbesserungsfrist, r.status);
        const druckzuschlag = MaengelController.calculateDruckzuschlag(r.geschaetzte_beseitigungskosten_eur, r.druckzuschlag_faktor);

        return {
            ...r,
            fotos,
            historie,
            fristAmpel,
            druckzuschlag
        };
    }

    /**
     * Vollzieht eine Ersatzvornahme und verknüpft ggf. mit Eingangsrechnung oder Einbehalt.
     */
    static executeErsatzvornahme(db, payload = {}, auditLogger = null) {
        const { mangelId, rechnungId, einbehaltId, tatsaechlicheKosten, kommentar, geaendertVon } = payload;
        if (!db) throw new Error('Database handle fehlt in executeErsatzvornahme.');

        const existing = db.prepare('SELECT * FROM maengelkataster WHERE id = ?').get(mangelId);
        if (!existing) throw new Error(`Mangel mit ID ${mangelId} nicht gefunden.`);

        const kosten = parseFloat(tatsaechlicheKosten) || 0;

        const tx = db.transaction(() => {
            db.prepare(`
                UPDATE maengelkataster SET
                    status = 'ERSATZVORNAHME',
                    tatsaechliche_ersatzvornahme_kosten_eur = ?,
                    verknuepfte_eingangsrechnung_id = ?,
                    verknuepfter_einbehalt_id = ?
                WHERE id = ?
            `).run(kosten, rechnungId || null, einbehaltId || null, mangelId);

            // Falls ein Sicherheitseinbehalt verknüpft ist, ggf. dessen Mangel-ID referenzieren
            if (einbehaltId) {
                db.prepare('UPDATE security_retentions SET mangel_id = ? WHERE id = ?').run(mangelId, einbehaltId);
            }

            db.prepare(`
                INSERT INTO maengel_historie (mangel_id, alter_status, neuer_status, geaendert_am, geaendert_von, kommentar)
                VALUES (?, ?, 'ERSATZVORNAHME', CURRENT_TIMESTAMP, ?, ?)
            `).run(mangelId, existing.status, geaendertVon || 'Bauleiter', kommentar || `Ersatzvornahme ausgeführt. Kosten: ${kosten.toFixed(2)} €`);

            if (auditLogger && typeof auditLogger.appendAuditLog === 'function') {
                auditLogger.appendAuditLog({
                    entityType: 'MANGEL',
                    entityId: Number(mangelId),
                    action: 'ERSATZVORNAHME_DURCHGEFUEHRT',
                    details: { kosten, rechnungId, einbehaltId, kommentar }
                });
            }
        });

        tx();
        return { success: true, mangelId, kosten };
    }

    /**
     * Löscht einen Mangel und alle verknüpften Fotos & Historie.
     */
    static deleteMangel(db, mangelId, auditLogger = null) {
        if (!db) throw new Error('Database handle fehlt in deleteMangel.');
        const existing = db.prepare('SELECT * FROM maengelkataster WHERE id = ?').get(mangelId);
        if (!existing) return { success: false, error: 'Mangel nicht gefunden' };

        const tx = db.transaction(() => {
            db.prepare('DELETE FROM maengelkataster WHERE id = ?').run(mangelId);

            if (auditLogger && typeof auditLogger.appendAuditLog === 'function') {
                auditLogger.appendAuditLog({
                    entityType: 'MANGEL',
                    entityId: Number(mangelId),
                    action: 'MANGEL_GELOESCHT',
                    details: { mangel_nr: existing.mangel_nr, titel: existing.titel }
                });
            }
        });

        tx();
        return { success: true };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MaengelController;
}
if (typeof window !== 'undefined') {
    window.MaengelController = MaengelController;
}
