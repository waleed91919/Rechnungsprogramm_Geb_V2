/**
 * controllers/BautagebuchMobileController.js - Mobiler Bautagebuch- & VOB/B-Meldungs-Kern
 * Isomorph lauffähig in Node.js (Electron-Backend/IPC) und Browser (PWA/Renderer).
 */

class BautagebuchMobileController {
    /**
     * Kategorien für Bedenkenanzeigen nach § 4 Abs. 3 VOB/B
     */
    static BEDENKEN_KATEGORIEN = {
        VORLEISTUNG_UNGEEIGNET: 'Ungeeignete Vorleistung des Vorunternehmers',
        PLANUNGSFEHLER: 'Fehlerhafte / lückenhafte Planung oder Leistungsbeschreibung',
        GUETE_STOFFE: 'Ungeeignete oder vom AG gelieferte Baustoffe',
        UNFALLGEFAHR: 'Sicherheitsmängel / Verstoß gegen ArbSchG / UVV',
        BAUGRUND: 'Unerwartete Baugrundverhältnisse'
    };

    /**
     * Ursachen für Behinderungsanzeigen nach § 6 Abs. 1 VOB/B
     */
    static BEHINDERUNG_URSACHEN = {
        AG_VERZUG: 'Verzug oder unterlassene Mitwirkung des Auftraggebers',
        FEHLENDE_VORLEISTUNG: 'Fehlende / unvollständige Vorleistung Dritter',
        BAUFREIHEIT_FEHLT: 'Keine Baufreiheit / Baustelle blockiert',
        PLANUNG_FEHLT: 'Fehlende Ausführungspläne / Freigaben',
        WITTERUNG: 'Außergewöhnliche Witterungsverhältnisse (z.B. Frost/Starkregen)',
        HOEHERE_GEWALT: 'Höhere Gewalt / Unvorhersehbare Ereignisse'
    };

    /**
     * Validiert und strukturiert einen Tagesbericht vor Ort.
     */
    static buildDailyReport(data = {}) {
        if (!data.projekt_id) throw new Error('Projekt-ID ist zwingend erforderlich.');
        if (!data.datum) throw new Error('Berichtsdatum fehlt.');
        if (!data.tagesbericht || data.tagesbericht.trim().length < 5) {
            throw new Error('Bitte erfassen Sie eine aussagekräftige Leistungsbeschreibung (mind. 5 Zeichen).');
        }

        const report = {
            uuid: data.uuid || this.generateUUID(),
            projekt_id: parseInt(data.projekt_id, 10),
            datum: data.datum,
            wetter_code: data.wetter_code || 'HEITER',
            temperatur_min: parseFloat(data.temperatur_min) || 0.0,
            temperatur_max: parseFloat(data.temperatur_max) || 0.0,
            regen_mm: parseFloat(data.regen_mm) || 0.0,
            wind_staerke: data.wind_staerke || '0-2 Bft',
            personal_eigen_anzahl: parseInt(data.personal_eigen_anzahl, 10) || 0,
            personal_eigen_stunden: parseFloat(data.personal_eigen_stunden) || 0.0,
            personal_sub_json: typeof data.personal_sub_json === 'string' ? data.personal_sub_json : JSON.stringify(data.personal_sub_json || []),
            geraete_json: typeof data.geraete_json === 'string' ? data.geraete_json : JSON.stringify(data.geraete_json || []),
            tagesbericht: data.tagesbericht.trim(),
            vorkommnisse: (data.vorkommnisse || '').trim(),
            fotos_json: typeof data.fotos_json === 'string' ? data.fotos_json : JSON.stringify(data.fotos_json || []),
            status: data.status || 'DRAFT',
            unterzeichnet_polier: data.unterzeichnet_polier ? 1 : 0,
            unterzeichnet_am: data.unterzeichnet_am || null,
            created_at: data.created_at || new Date().toISOString()
        };

        return report;
    }

    /**
     * Erstellt eine formelle Bedenkenanzeige nach § 4 Abs. 3 VOB/B.
     */
    static createBedenkenanzeige(data = {}) {
        const text = data.begruendung || data.sachverhalt;
        if (!data.projekt_id || !data.betreff || !text) {
            throw new Error('Pflichtangaben für Bedenkenanzeige unvollständig (§ 4 Abs. 3 VOB/B).');
        }

        return {
            uuid: data.uuid || this.generateUUID(),
            projekt_id: parseInt(data.projekt_id, 10),
            typ: 'BEDENKEN_4_3',
            datum: data.datum || new Date().toISOString().split('T')[0],
            beginn_datum: data.beginn_datum || null,
            voraussichtliches_ende: data.voraussichtliches_ende || null,
            betreff: data.betreff.trim(),
            sachverhalt: text.trim(),
            kategorie: data.kategorie || 'VORLEISTUNG_UNGEEIGNET',
            ursache: null,
            betroffene_gewerke: (data.betroffene_gewerke || '').trim(),
            vorschlag_abhilfe: (data.vorschlag_abhilfe || '').trim(),
            auswirkung_bauzeit_tage: parseInt(data.auswirkung_bauzeit_tage, 10) || 0,
            mehrkosten_angemeldet: data.mehrkosten_angemeldet ? 1 : 0,
            geschaetzte_mehrkosten_eur: parseFloat(data.geschaetzte_mehrkosten_eur) || 0.0,
            unterschrift_svg: data.unterschrift_svg || null,
            status: data.status || 'OFFEN',
            created_at: data.created_at || new Date().toISOString()
        };
    }

    /**
     * Erstellt eine formelle Behinderungsanzeige nach § 6 Abs. 1 VOB/B.
     */
    static createBehinderungsanzeige(data = {}) {
        const text = data.hinderungsgrund || data.sachverhalt;
        if (!data.projekt_id || !text) {
            throw new Error('Pflichtangaben für Behinderungsanzeige unvollständig (§ 6 Abs. 1 VOB/B).');
        }

        return {
            uuid: data.uuid || this.generateUUID(),
            projekt_id: parseInt(data.projekt_id, 10),
            typ: 'BEHINDERUNG_6_1',
            datum: data.datum || new Date().toISOString().split('T')[0],
            beginn_datum: data.beginn_datum || data.datum || new Date().toISOString().split('T')[0],
            voraussichtliches_ende: data.voraussichtliches_ende || null,
            betreff: (data.betreff || `Behinderungsanzeige gem. § 6 Abs. 1 VOB/B: ${text}`).trim(),
            sachverhalt: text.trim(),
            ursache: data.ursache || 'AG_VERZUG',
            kategorie: null,
            betroffene_gewerke: (data.betroffene_gewerke || '').trim(),
            vorschlag_abhilfe: (data.vorschlag_abhilfe || '').trim(),
            auswirkung_bauzeit_tage: parseInt(data.auswirkung_bauzeit_tage, 10) || 0,
            mehrkosten_angemeldet: data.mehrkosten_angemeldet ? 1 : 0,
            geschaetzte_mehrkosten_eur: parseFloat(data.geschaetzte_mehrkosten_eur) || 0.0,
            unterschrift_svg: data.unterschrift_svg || null,
            status: data.status || 'OFFEN',
            created_at: data.created_at || new Date().toISOString()
        };
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

    // =========================================================================
    // SQLite DB Helper-Methoden (Electron Desktop Backend)
    // =========================================================================

    /**
     * Speichert eine Bedenken- oder Behinderungsanzeige in SQLite.
     */
    static saveVobMeldung(db, data, auditLogger = null) {
        if (!db) throw new Error('Database required.');
        if (!data.projekt_id) throw new Error('Projekt-ID ist erforderlich.');

        let meldung;
        if (data.typ === 'BEHINDERUNG_6_1') {
            meldung = this.createBehinderungsanzeige(data);
        } else {
            meldung = this.createBedenkenanzeige(data);
        }

        const stmt = db.prepare(`
            INSERT INTO bedenken_behinderungen (
                uuid, projekt_id, typ, datum, beginn_datum, voraussichtliches_ende,
                betreff, sachverhalt, ursache, kategorie, betroffene_gewerke, vorschlag_abhilfe,
                auswirkung_bauzeit_tage, mehrkosten_angemeldet, geschaetzte_mehrkosten_eur,
                unterschrift_svg, status, pdf_pfad, created_at
            ) VALUES (
                @uuid, @projekt_id, @typ, @datum, @beginn_datum, @voraussichtliches_ende,
                @betreff, @sachverhalt, @ursache, @kategorie, @betroffene_gewerke, @vorschlag_abhilfe,
                @auswirkung_bauzeit_tage, @mehrkosten_angemeldet, @geschaetzte_mehrkosten_eur,
                @unterschrift_svg, @status, @pdf_pfad, @created_at
            ) ON CONFLICT(uuid) DO UPDATE SET
                datum = excluded.datum,
                beginn_datum = excluded.beginn_datum,
                voraussichtliches_ende = excluded.voraussichtliches_ende,
                betreff = excluded.betreff,
                sachverhalt = excluded.sachverhalt,
                ursache = excluded.ursache,
                kategorie = excluded.kategorie,
                betroffene_gewerke = excluded.betroffene_gewerke,
                vorschlag_abhilfe = excluded.vorschlag_abhilfe,
                auswirkung_bauzeit_tage = excluded.auswirkung_bauzeit_tage,
                mehrkosten_angemeldet = excluded.mehrkosten_angemeldet,
                geschaetzte_mehrkosten_eur = excluded.geschaetzte_mehrkosten_eur,
                unterschrift_svg = excluded.unterschrift_svg,
                status = excluded.status,
                pdf_pfad = excluded.pdf_pfad
        `);

        const res = stmt.run({
            uuid: meldung.uuid,
            projekt_id: meldung.projekt_id,
            typ: meldung.typ,
            datum: meldung.datum,
            beginn_datum: meldung.beginn_datum || null,
            voraussichtliches_ende: meldung.voraussichtliches_ende || null,
            betreff: meldung.betreff,
            sachverhalt: meldung.sachverhalt,
            ursache: meldung.ursache || null,
            kategorie: meldung.kategorie || null,
            betroffene_gewerke: meldung.betroffene_gewerke || null,
            vorschlag_abhilfe: meldung.vorschlag_abhilfe || null,
            auswirkung_bauzeit_tage: meldung.auswirkung_bauzeit_tage || 0,
            mehrkosten_angemeldet: meldung.mehrkosten_angemeldet ? 1 : 0,
            geschaetzte_mehrkosten_eur: meldung.geschaetzte_mehrkosten_eur || 0.0,
            unterschrift_svg: meldung.unterschrift_svg || null,
            status: meldung.status || 'OFFEN',
            pdf_pfad: data.pdf_pfad || null,
            created_at: meldung.created_at
        });

        if (auditLogger && auditLogger.appendAuditLog) {
            auditLogger.appendAuditLog({
                entityType: 'VOB_MELDUNG',
                entityId: res.lastInsertRowid || 0,
                action: meldung.typ === 'BEHINDERUNG_6_1' ? 'BEHINDERUNGSANZEIGE_ERSTELLT' : 'BEDENKENANZEIGE_ERSTELLT',
                details: { uuid: meldung.uuid, projekt_id: meldung.projekt_id, betreff: meldung.betreff, status: meldung.status }
            });
        }

        return {
            success: true,
            uuid: meldung.uuid,
            id: res.lastInsertRowid,
            meldung
        };
    }

    /**
     * Lädt VOB/B Meldungen mit Filtern.
     */
    static getVobMeldungen(db, filter = {}) {
        if (!db) return [];
        let query = `
            SELECT b.*, p.name AS projekt_name, p.kundeId, k.name AS kunde_name
            FROM bedenken_behinderungen b
            JOIN projekte p ON b.projekt_id = p.id
            LEFT JOIN kunden k ON p.kundeId = k.id
            WHERE 1=1
        `;
        const params = [];

        if (filter.projekt_id) {
            query += ' AND b.projekt_id = ?';
            params.push(parseInt(filter.projekt_id, 10));
        }
        if (filter.typ) {
            query += ' AND b.typ = ?';
            params.push(filter.typ);
        }
        if (filter.status) {
            query += ' AND b.status = ?';
            params.push(filter.status);
        }

        query += ' ORDER BY b.datum DESC, b.id DESC';

        return db.prepare(query).all(...params);
    }

    /**
     * Löscht eine VOB-Meldung.
     */
    static deleteVobMeldung(db, idOrUuid, auditLogger = null) {
        if (!db) return { success: false };
        let stmt;
        if (typeof idOrUuid === 'number') {
            stmt = db.prepare('DELETE FROM bedenken_behinderungen WHERE id = ?');
        } else {
            stmt = db.prepare('DELETE FROM bedenken_behinderungen WHERE uuid = ?');
        }
        const res = stmt.run(idOrUuid);

        if (auditLogger && auditLogger.appendAuditLog) {
            auditLogger.appendAuditLog({
                entityType: 'VOB_MELDUNG',
                entityId: typeof idOrUuid === 'number' ? idOrUuid : 0,
                action: 'VOB_MELDUNG_GELOESCHT',
                details: { identifier: idOrUuid }
            });
        }

        return { success: res.changes > 0 };
    }

    /**
     * Generiert formell rechtssicheres HTML für eine Bedenken- oder Behinderungsanzeige.
     */
    static generateVobHtml(meldung = {}, projekt = {}, companyInfo = {}) {
        const isBedenken = meldung.typ === 'BEDENKEN_4_3';
        const docTitel = isBedenken ? 'BEDENKENANZEIGE' : 'BEHINDERUNGSANZEIGE';
        const normRef = isBedenken ? 'gemäß § 4 Abs. 3 VOB/B' : 'gemäß § 6 Abs. 1 VOB/B';
        const datumStr = meldung.datum ? new Date(meldung.datum).toLocaleDateString('de-DE') : new Date().toLocaleDateString('de-DE');

        let detailSection = '';
        if (isBedenken) {
            detailSection = `
                <div class="box">
                    <div class="box-title">Bedenkenursache & Sachverhalt</div>
                    <div class="box-row"><strong>Kategorie:</strong> ${meldung.kategorie || 'Allgemein'}</div>
                    <div class="box-row"><strong>Betroffene Gewerke / Bauteile:</strong> ${meldung.betroffene_gewerke || 'Gesamtes Bauwerk'}</div>
                    <div class="box-content">${(meldung.sachverhalt || '').replace(/\n/g, '<br/>')}</div>
                </div>
                ${meldung.vorschlag_abhilfe ? `
                    <div class="box">
                        <div class="box-title">Vorschlag zur fachgerechten Abhilfe</div>
                        <div class="box-content">${meldung.vorschlag_abhilfe.replace(/\n/g, '<br/>')}</div>
                    </div>
                ` : ''}
            `;
        } else {
            detailSection = `
                <div class="box">
                    <div class="box-title">Hinderungstatsachen & Ursache</div>
                    <div class="box-row"><strong>Ursache:</strong> ${meldung.ursache || 'AG_VERZUG'}</div>
                    <div class="box-row"><strong>Beginn der Behinderung:</strong> ${meldung.beginn_datum ? new Date(meldung.beginn_datum).toLocaleDateString('de-DE') : '-'}</div>
                    <div class="box-row"><strong>Voraussichtliches Ende:</strong> ${meldung.voraussichtliches_ende ? new Date(meldung.voraussichtliches_ende).toLocaleDateString('de-DE') : 'Noch unbestimmt'}</div>
                    <div class="box-content">${(meldung.sachverhalt || '').replace(/\n/g, '<br/>')}</div>
                </div>
                <div class="box">
                    <div class="box-title">Auswirkungen auf Bauzeit & Vergütung</div>
                    <div class="box-row"><strong>Voraussichtlicher Bauzeitverzug:</strong> ${meldung.auswirkung_bauzeit_tage || 0} Werktage</div>
                    <div class="box-row"><strong>Mehrkosten angemeldet:</strong> ${meldung.mehrkosten_angemeldet ? 'JA' : 'NEIN'}</div>
                    ${meldung.mehrkosten_angemeldet ? `<div class="box-row"><strong>Geschätzte Mehrkosten:</strong> ${parseFloat(meldung.geschaetzte_mehrkosten_eur || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</div>` : ''}
                </div>
            `;
        }

        const signatureSection = meldung.unterschrift_svg ? `
            <div class="sig-box">
                <div><strong>Elektronisch unterzeichnet vor Ort:</strong></div>
                <div style="max-width: 250px; height: 80px; margin-top: 5px;">${meldung.unterschrift_svg}</div>
                <div style="font-size: 10px; color: #64748b;">Datum: ${datumStr} | UUID: ${meldung.uuid}</div>
            </div>
        ` : '';

        return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<title>${docTitel} - ${projekt.name || 'Projekt'}</title>
<style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 25mm 20mm; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; }
    .company { font-weight: bold; font-size: 16px; color: #0f172a; }
    .meta { text-align: right; color: #475569; font-size: 11px; }
    .title { font-size: 20px; font-weight: bold; color: #0f172a; margin-bottom: 5px; }
    .subtitle { font-size: 13px; font-weight: 600; color: #2563eb; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.05em; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; }
    .box-title { font-weight: bold; font-size: 12px; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    .box-row { margin-bottom: 4px; font-size: 11px; }
    .box-content { margin-top: 8px; font-size: 12px; color: #0f172a; }
    .legal-notice { font-size: 10px; color: #64748b; background: #fff; border-left: 3px solid #f59e0b; padding: 8px 12px; margin-top: 25px; }
    .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
    .sig-box { border-top: 1px solid #94a3b8; width: 280px; padding-top: 8px; }
</style>
</head>
<body>
    <div class="header">
        <div class="company">${companyInfo.firmenname || 'W-Link ERP Baupartner'}</div>
        <div class="meta">
            <div>Datum: ${datumStr}</div>
            <div>Projekt: ${projekt.name || 'Bauvorhaben'}</div>
            <div>Referenz: ${meldung.uuid.substring(0, 8)}</div>
        </div>
    </div>

    <div class="title">${docTitel}</div>
    <div class="subtitle">${normRef}</div>

    <div class="box">
        <div class="box-title">Bauvorhaben & Betreff</div>
        <div class="box-row"><strong>Bauvorhaben:</strong> ${projekt.name || '-'}</div>
        <div class="box-row"><strong>Betreff:</strong> ${meldung.betreff}</div>
    </div>

    ${detailSection}

    <div class="legal-notice">
        <strong>Hinweis nach VOB/B:</strong> Diese Meldung dient der formellen Wahrung der Rechte des Auftragnehmers nach den Bestimmungen der Vergabe- und Vertragsordnung für Bauleistungen (VOB/B). Wir bitten um unverzügliche Prüfung und schriftliche Stellungnahme bzw. Anweisung.
    </div>

    <div class="footer">
        <div class="sig-box">
            ${signatureSection || `<div>Unterschrift Auftragnehmer / Bauleiter vor Ort</div><div style="height: 40px;"></div><div style="font-size: 10px; color: #64748b;">Ort, Datum</div>`}
        </div>
        <div class="sig-box" style="text-align: right;">
            <div>Kenntnisnahme Auftraggeber / Bauleitung</div>
            <div style="height: 40px;"></div>
            <div style="font-size: 10px; color: #64748b;">Ort, Datum, Unterschrift</div>
        </div>
    </div>
</body>
</html>`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BautagebuchMobileController;
}
if (typeof window !== 'undefined') {
    window.BautagebuchMobileController = BautagebuchMobileController;
}
