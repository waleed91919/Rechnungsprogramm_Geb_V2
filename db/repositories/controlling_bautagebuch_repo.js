/**
 * Controlling & Bautagebuch Repository
 * Nachträge (VOB/B), Bautagebuch, Abnahmeprotokolle, Eingangsrechnungen, Projekt-Controlling & VOB-Meldungen
 */
const BautagebuchMobileController = require('../../controllers/BautagebuchMobileController');
const AngebotController = require('../../controllers/AngebotController');

function createControllingBautagebuchRepo(deps) {
    const { db, dbQuery, dbRun, appendAuditLog, auditLogger, getEinstellung: injectedGetEinstellung, dbAPI } = deps;
    const getEinstellung = (key) => {
        if (injectedGetEinstellung) return injectedGetEinstellung(key);
        if (dbAPI && dbAPI.getEinstellung) return dbAPI.getEinstellung(key);
        const row = db.prepare('SELECT value FROM einstellungen WHERE key = ?').get(key);
        return row ? row.value : null;
    };

    return {
// --- Nachtragsverwaltung (VOB/B) ---
    async getNachtraege(projectId) {
        const rows = await dbQuery('SELECT * FROM nachtraege WHERE project_id = ? ORDER BY id ASC', [projectId]);
        for (const n of rows) {
            n.positionen = await dbQuery('SELECT * FROM nachtrag_positionen WHERE nachtrag_id = ? ORDER BY id ASC', [n.id]);
        }
        return rows;
    },

    async saveNachtrag(nachtragData, positionen = []) {
        const tx = db.transaction((n, posList) => {
            let nId = n.id;
            let sumNetto = 0;
            for (const p of posList) {
                sumNetto += (p.menge || 0) * (p.einheitspreis || 0);
            }
            const sumBrutto = sumNetto * 1.19;

            if (nId) {
                db.prepare(`
                    UPDATE nachtraege 
                    SET nachtrag_nr=?, titel=?, beschreibung=?, rechtsgrundlage=?, summe_netto=?, summe_brutto=?, status=?, eingereicht_am=?, entschieden_am=?, begruendung=?
                    WHERE id=?
                `).run(
                    n.nachtrag_nr, n.titel, n.beschreibung || '', n.rechtsgrundlage || 'VOB_2_6',
                    sumNetto, sumBrutto, n.status || 'EINGEREICHT', n.eingereicht_am || null, n.entschieden_am || null, n.begruendung || '', nId
                );
                db.prepare('DELETE FROM nachtrag_positionen WHERE nachtrag_id=?').run(nId);
            } else {
                const info = db.prepare(`
                    INSERT INTO nachtraege (project_id, nachtrag_nr, titel, beschreibung, rechtsgrundlage, summe_netto, summe_brutto, status, eingereicht_am, entschieden_am, begruendung)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    n.project_id, n.nachtrag_nr, n.titel, n.beschreibung || '', n.rechtsgrundlage || 'VOB_2_6',
                    sumNetto, sumBrutto, n.status || 'EINGEREICHT', n.eingereicht_am || null, n.entschieden_am || null, n.begruendung || ''
                );
                nId = info.lastInsertRowid;
            }

            const insertPos = db.prepare(`
                INSERT INTO nachtrag_positionen (nachtrag_id, oz_code, kurztext, langtext, menge, einheit, einheitspreis, gesamtpreis, cost_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const p of posList) {
                const gp = (p.menge || 0) * (p.einheitspreis || 0);
                insertPos.run(
                    nId,
                    p.oz_code || '',
                    p.kurztext || '',
                    p.langtext || '',
                    p.menge || 0,
                    p.einheit || 'Stk.',
                    p.einheitspreis || 0,
                    gp,
                    p.cost_type || 'MATERIAL'
                );
            }
            return nId;
        });
        return tx(nachtragData, positionen);
    },

    async updateNachtragStatus(nachtragId, status) {
        const decidedDate = (status === 'GENEHMIGT' || status === 'ABGELEHNT') ? new Date().toISOString().split('T')[0] : null;
        await dbRun('UPDATE nachtraege SET status = ?, entschieden_am = COALESCE(?, entschieden_am) WHERE id = ?', [status, decidedDate, nachtragId]);
        return { success: true };
    },

    async deleteNachtrag(nachtragId) {
        const tx = db.transaction((id) => {
            db.prepare('DELETE FROM nachtrag_positionen WHERE nachtrag_id=?').run(id);
            db.prepare('DELETE FROM nachtraege WHERE id=?').run(id);
        });
        return tx(nachtragId);
    },

    // --- Bautagebuch ---
    async getBautagebuch(projectId) {
        return await dbQuery('SELECT * FROM bautagebuch WHERE project_id = ? ORDER BY datum DESC, bericht_nr DESC', [projectId]);
    },

    async saveBautagebuch(data) {
        if (data.id) {
            await dbRun(`
                UPDATE bautagebuch 
                SET bericht_nr=?, datum=?, wetter=?, temperatur_min=?, temperatur_max=?, personal_eigen_anzahl=?, personal_eigen_stunden=?,
                    personal_sub_json=?, geraete_json=?, tagesbericht=?, vorkommnisse_behinderungen=?, unterzeichnet_bauleiter=?, fotos_json=?
                WHERE id=?
            `, [
                data.bericht_nr || 1, data.datum, data.wetter || '', data.temperatur_min || null, data.temperatur_max || null,
                data.personal_eigen_anzahl || 0, data.personal_eigen_stunden || 0,
                typeof data.personal_sub_json === 'object' ? JSON.stringify(data.personal_sub_json) : (data.personal_sub_json || '[]'),
                typeof data.geraete_json === 'object' ? JSON.stringify(data.geraete_json) : (data.geraete_json || '[]'),
                data.tagesbericht, data.vorkommnisse_behinderungen || '', data.unterzeichnet_bauleiter || 0,
                typeof data.fotos_json === 'object' ? JSON.stringify(data.fotos_json) : (data.fotos_json || '[]'),
                data.id
            ]);
            return data.id;
        } else {
            const res = await dbRun(`
                INSERT INTO bautagebuch (project_id, bericht_nr, datum, wetter, temperatur_min, temperatur_max, personal_eigen_anzahl, personal_eigen_stunden, personal_sub_json, geraete_json, tagesbericht, vorkommnisse_behinderungen, unterzeichnet_bauleiter, fotos_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.project_id, data.bericht_nr || 1, data.datum, data.wetter || '', data.temperatur_min || null, data.temperatur_max || null,
                data.personal_eigen_anzahl || 0, data.personal_eigen_stunden || 0,
                typeof data.personal_sub_json === 'object' ? JSON.stringify(data.personal_sub_json) : (data.personal_sub_json || '[]'),
                typeof data.geraete_json === 'object' ? JSON.stringify(data.geraete_json) : (data.geraete_json || '[]'),
                data.tagesbericht, data.vorkommnisse_behinderungen || '', data.unterzeichnet_bauleiter || 0,
                typeof data.fotos_json === 'object' ? JSON.stringify(data.fotos_json) : (data.fotos_json || '[]')
            ]);
            return res.id;
        }
    },

    async deleteBautagebuch(id) {
        return await dbRun('DELETE FROM bautagebuch WHERE id=?', [id]);
    },

    // --- Abnahmeprotokolle (VOB/B § 12) ---
    async getAbnahmeprotokolle(projectId) {
        return await dbQuery('SELECT * FROM abnahmeprotokolle WHERE project_id = ? ORDER BY datum DESC', [projectId]);
    },

    async saveAbnahmeprotokoll(data) {
        if (data.id) {
            await dbRun(`
                UPDATE abnahmeprotokolle 
                SET datum=?, ort=?, auftraggeber_vertreter=?, auftragnehmer_vertreter=?, abnahme_status=?, gewaehrleistung_beginn=?, gewaehrleistung_ende=?, gewaehrleistung_jahre=?, sicherheitseinbehalt_prozent=?, maengel_json=?, unterschrift_ag_data=?, unterschrift_an_data=?, pdf_pfad=?
                WHERE id=?
            `, [
                data.datum, data.ort, data.auftraggeber_vertreter, data.auftragnehmer_vertreter, data.abnahme_status,
                data.gewaehrleistung_beginn, data.gewaehrleistung_ende, data.gewaehrleistung_jahre || 4, data.sicherheitseinbehalt_prozent || 5.0,
                typeof data.maengel_json === 'object' ? JSON.stringify(data.maengel_json) : (data.maengel_json || '[]'),
                data.unterschrift_ag_data || '', data.unterschrift_an_data || '', data.pdf_pfad || '', data.id
            ]);
            return data.id;
        } else {
            const res = await dbRun(`
                INSERT INTO abnahmeprotokolle (project_id, datum, ort, auftraggeber_vertreter, auftragnehmer_vertreter, abnahme_status, gewaehrleistung_beginn, gewaehrleistung_ende, gewaehrleistung_jahre, sicherheitseinbehalt_prozent, maengel_json, unterschrift_ag_data, unterschrift_an_data, pdf_pfad)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.project_id, data.datum, data.ort, data.auftraggeber_vertreter, data.auftragnehmer_vertreter, data.abnahme_status,
                data.gewaehrleistung_beginn, data.gewaehrleistung_ende, data.gewaehrleistung_jahre || 4, data.sicherheitseinbehalt_prozent || 5.0,
                typeof data.maengel_json === 'object' ? JSON.stringify(data.maengel_json) : (data.maengel_json || '[]'),
                data.unterschrift_ag_data || '', data.unterschrift_an_data || '', data.pdf_pfad || ''
            ]);
            return res.id;
        }
    },

    // --- Eingangsrechnungen & Nachkalkulation ---
    async getEingangsrechnungen(projectId = null) {
        if (projectId) {
            return await dbQuery(`
                SELECT e.*, k.name as lieferant_name, k.sec48b_status, k.sec48b_valid_until
                FROM eingangsrechnungen e
                LEFT JOIN kunden k ON e.lieferant_id = k.id
                WHERE e.project_id = ?
                ORDER BY e.rechnungs_datum DESC
            `, [projectId]);
        }
        return await dbQuery(`
            SELECT e.*, k.name as lieferant_name, k.sec48b_status, k.sec48b_valid_until, p.name as projekt_name
            FROM eingangsrechnungen e
            LEFT JOIN kunden k ON e.lieferant_id = k.id
            LEFT JOIN projekte p ON e.project_id = p.id
            ORDER BY e.rechnungs_datum DESC
        `);
    },

    async saveEingangsrechnung(data) {
        // § 48b EStG Check
        let bauabzug = 0;
        let sec48bChecked = 0;
        if (data.lieferant_id) {
            const lieferant = db.prepare('SELECT * FROM kunden WHERE id = ?').get(data.lieferant_id);
            if (lieferant && lieferant.is_subcontractor) {
                sec48bChecked = 1;
                const today = new Date().toISOString().split('T')[0];
                const isValid = lieferant.sec48b_status === 'VALID' && (!lieferant.sec48b_valid_until || lieferant.sec48b_valid_until >= today);
                if (!isValid && data.kostenart === 'SUBCONTRACTOR') {
                    // 15 % Bauabzugsteuer einbehalten
                    bauabzug = Math.round((data.betrag_brutto || (data.betrag_netto * 1.19)) * 0.15 * 100) / 100;
                }
            }
        }

        const ust = data.betrag_ust !== undefined ? data.betrag_ust : Math.round(data.betrag_netto * ((data.steuersatz || 19) / 100) * 100) / 100;
        const brutto = data.betrag_brutto !== undefined ? data.betrag_brutto : Math.round((data.betrag_netto + ust) * 100) / 100;

        if (data.id) {
            await dbRun(`
                UPDATE eingangsrechnungen 
                SET project_id=?, lieferant_id=?, rechnungs_nr=?, rechnungs_datum=?, faelligkeits_datum=?, betrag_netto=?, steuersatz=?, betrag_ust=?, betrag_brutto=?, kostenart=?, sec48b_geprueft=?, bauabzugsteuer_einbehalten=?, zahlungs_status=?, bezahlt_am=?, beleg_pfad=?
                WHERE id=?
            `, [
                data.project_id || null, data.lieferant_id || null, data.rechnungs_nr, data.rechnungs_datum, data.faelligkeits_datum,
                data.betrag_netto, data.steuersatz || 19.0, ust, brutto, data.kostenart || 'MATERIAL',
                sec48bChecked, bauabzug, data.zahlungs_status || 'OFFEN', data.bezahlt_am || null, data.beleg_pfad || '', data.id
            ]);
            return { id: data.id, bauabzugsteuer: bauabzug };
        } else {
            const res = await dbRun(`
                INSERT INTO eingangsrechnungen (project_id, lieferant_id, rechnungs_nr, rechnungs_datum, faelligkeits_datum, betrag_netto, steuersatz, betrag_ust, betrag_brutto, kostenart, sec48b_geprueft, bauabzugsteuer_einbehalten, zahlungs_status, bezahlt_am, beleg_pfad)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.project_id || null, data.lieferant_id || null, data.rechnungs_nr, data.rechnungs_datum, data.faelligkeits_datum,
                data.betrag_netto, data.steuersatz || 19.0, ust, brutto, data.kostenart || 'MATERIAL',
                sec48bChecked, bauabzug, data.zahlungs_status || 'OFFEN', data.bezahlt_am || null, data.beleg_pfad || ''
            ]);
            return { id: res.id, bauabzugsteuer: bauabzug };
        }
    },

    // GOBD-3 Fix: Soft-Delete mit Zahlungsprüfung und Audit-Trail
    async deleteEingangsrechnung(id, grund = 'Benutzer-Löschung') {
        const tx = db.transaction((erId, reason) => {
            const er = db.prepare('SELECT * FROM eingangsrechnungen WHERE id=?').get(erId);
            if (!er) return { success: true, alreadyDeleted: true };

            // Bezahlte oder teilweise bezahlte Belege dürfen niemals gelöscht werden
            if (er.zahlungs_status !== 'OFFEN') {
                throw new Error(`Eingangsrechnung #${er.rechnungs_nr} kann nicht gelöscht werden: Status ist "${er.zahlungs_status}". Nur offene Rechnungen dürfen storniert werden.`);
            }

            // Prüfe auf vorhandene Zahlungszuordnungen
            const zahlungen = db.prepare('SELECT COUNT(*) as cnt FROM zahlung_zuordnungen WHERE eingangsrechnung_id=? AND (storno_flag=0 OR storno_flag IS NULL)').get(erId);
            if (zahlungen && zahlungen.cnt > 0) {
                throw new Error(`Eingangsrechnung #${er.rechnungs_nr} besitzt aktive Zahlungsbuchungen und kann nicht gelöscht werden.`);
            }

            // GoBD Soft-Delete
            db.prepare(`
                UPDATE eingangsrechnungen SET
                    is_deleted = 1,
                    deleted_at = CURRENT_TIMESTAMP,
                    deletion_reason = ?
                WHERE id = ?
            `).run(String(reason).trim(), erId);

            appendAuditLog({
                entityType: 'EINGANGSRECHNUNG',
                entityId: erId,
                action: 'GELOESCHT',
                details: {
                    rechnungs_nr: er.rechnungs_nr,
                    lieferant_id: er.lieferant_id,
                    betrag_brutto: er.betrag_brutto,
                    grund: reason
                }
            });

            return { success: true, id: erId };
        });

        return tx(id, grund);
    },

    // --- Projekt Controlling / Soll-Ist-Analyse ---
    async getControllingStats(projectId) {
        const projekt = db.prepare('SELECT * FROM projekte WHERE id = ?').get(projectId);
        if (!projekt) return null;

        // 1. Soll-Kosten aus verknüpften Angeboten
        const angebote = db.prepare("SELECT * FROM dokumente WHERE projektId = ? AND type = 'angebot'").all(projectId);
        let sollNetto = 0;
        let sollLohn = 0;
        let sollMaterial = 0;
        let sollGeraet = 0;
        let sollSub = 0;

        for (const ang of angebote) {
            sollNetto += ang.netto || 0;
            const pos = db.prepare('SELECT * FROM positionen WHERE dokumentId = ?').all(ang.id);
            for (const p of pos) {
                const gp = (p.menge || 0) * (p.preis || 0);
                if (p.cost_type === 'LOHN') sollLohn += gp;
                else if (p.cost_type === 'MATERIAL') sollMaterial += gp;
                else if (p.cost_type === 'GERÄT') sollGeraet += gp;
                else sollSub += gp;
            }
        }

        // Falls keine differenzierten Angebotspositionen vorliegen, nutze Projektbudget
        if (sollNetto === 0 && projekt.budget > 0) {
            sollNetto = projekt.budget;
        }

        // 2. Genehmigte Nachträge (Erhöhung des Soll-Auftragsvolumens)
        const nachtraege = db.prepare("SELECT * FROM nachtraege WHERE project_id = ? AND status = 'GENEHMIGT'").all(projectId);
        let nachtragNetto = 0;
        for (const n of nachtraege) {
            nachtragNetto += n.summe_netto || 0;
        }

        // 3. Ist-Kosten aus Eingangsrechnungen
        const eingangsrechnungen = db.prepare('SELECT * FROM eingangsrechnungen WHERE project_id = ?').all(projectId);
        let istMaterial = 0;
        let istSub = 0;
        let istGeraet = 0;
        let istSonstiges = 0;
        let bauabzugsteuerGesamt = 0;

        for (const er of eingangsrechnungen) {
            const netto = er.betrag_netto || 0;
            if (er.kostenart === 'MATERIAL') istMaterial += netto;
            else if (er.kostenart === 'SUBCONTRACTOR') istSub += netto;
            else if (er.kostenart === 'EQUIPMENT') istGeraet += netto;
            else istSonstiges += netto;
            bauabzugsteuerGesamt += er.bauabzugsteuer_einbehalten || 0;
        }

        // 4. Ist-Lohnkosten aus Bautagebuch
        const tagebuch = db.prepare('SELECT SUM(personal_eigen_stunden) as gesamt_stunden FROM bautagebuch WHERE project_id = ?').get(projectId);
        const istLohnStunden = (tagebuch && tagebuch.gesamt_stunden) || 0;
        const stundensatzStd = 55.00; // Kalkulatorischer Standard-Verrechnungssatz
        const istLohn = istLohnStunden * stundensatzStd;

        const istGesamt = istMaterial + istSub + istGeraet + istSonstiges + istLohn;

        // 5. Bisher abgerechneter Umsatz nach VOB/B § 16 (Ausgangsrechnungen, ohne Entwürfe & Stornos)
        const rechnungen = db.prepare("SELECT * FROM dokumente WHERE projektId = ? AND type = 'rechnung' AND status NOT IN ('Entwurf', 'Storniert') ORDER BY id ASC").all(projectId);
        
        let istUmsatzNetto = 0;
        const hasCumulative = rechnungen.some(r => {
            if (r.rechnungsart === 'SCHLUSSRECHNUNG' || r.rechnungsart === 'TEILSCHLUSSRECHNUNG' || r.rechnungsart === 'ABSCHLAG_KUMULIERT') return true;
            if (r.typ === 'SCHLUSSRECHNUNG' || r.typ === 'TEILSCHLUSSRECHNUNG') return true;
            try {
                const vCheck = db.prepare('SELECT COUNT(*) as cnt FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id = ?').get(r.id);
                return vCheck && vCheck.cnt > 0;
            } catch (_e) { return false; }
        });

        if (hasCumulative) {
            const sr = rechnungen.find(r => r.rechnungsart === 'SCHLUSSRECHNUNG' || r.typ === 'SCHLUSSRECHNUNG');
            if (sr) {
                istUmsatzNetto = sr.netto || 0;
            } else {
                istUmsatzNetto = Math.max(0, ...rechnungen.map(r => r.kumulierte_leistung_netto || r.netto || 0));
            }
        } else {
            for (const r of rechnungen) {
                istUmsatzNetto += (r.netto || 0);
            }
        }

        // 6. Kennzahlen
        const gesamtAuftragsvolumen = sollNetto + nachtragNetto;
        const deckungsbeitrag = istUmsatzNetto - istGesamt;
        const margeProzent = istUmsatzNetto > 0 ? Math.round((deckungsbeitrag / istUmsatzNetto) * 1000) / 10 : 0;
        const budgetAuslastungProzent = gesamtAuftragsvolumen > 0 ? Math.round((istGesamt / gesamtAuftragsvolumen) * 1000) / 10 : 0;

        return {
            projektId: projectId,
            projektName: projekt.name,
            gesamtAuftragsvolumen: Math.round(gesamtAuftragsvolumen * 100) / 100,
            sollNetto: Math.round(sollNetto * 100) / 100,
            nachtragNetto: Math.round(nachtragNetto * 100) / 100,
            sollKosten: {
                lohn: Math.round(sollLohn * 100) / 100,
                material: Math.round(sollMaterial * 100) / 100,
                geraet: Math.round(sollGeraet * 100) / 100,
                sub: Math.round(sollSub * 100) / 100
            },
            istKosten: {
                lohn: Math.round(istLohn * 100) / 100,
                lohnStunden: istLohnStunden,
                material: Math.round(istMaterial * 100) / 100,
                subcontractor: Math.round(istSub * 100) / 100,
                geraet: Math.round(istGeraet * 100) / 100,
                sonstiges: Math.round(istSonstiges * 100) / 100,
                gesamt: Math.round(istGesamt * 100) / 100,
                bauabzugsteuer: Math.round(bauabzugsteuerGesamt * 100) / 100
            },
            istUmsatzNetto: Math.round(istUmsatzNetto * 100) / 100,
            deckungsbeitrag: Math.round(deckungsbeitrag * 100) / 100,
            margeProzent,
            budgetAuslastungProzent
        };
    },

    // --- Projekte ---
    async saveProjekt(projekt) {
        const tx = db.transaction((p) => {
            let projId = p.id;
            if (projId) {
                db.prepare(`
                    UPDATE projekte SET
                        name=?, kundeId=?, start=?, ende=?, budget=?, status=?,
                        sicherheitseinbehalt_prozent=?, source_angebot_id=?, source_angebot_version=?,
                        gaeb_phase=?, hoai_vob_flag=?
                    WHERE id=?
                `).run(
                    p.name,
                    p.kundeId || null,
                    p.start || null,
                    p.ende || null,
                    p.budget || 0,
                    p.status || null,
                    p.sicherheitseinbehalt_prozent || 0,
                    p.source_angebot_id || null,
                    p.source_angebot_version || null,
                    p.gaeb_phase || null,
                    p.hoai_vob_flag || 'VOB',
                    projId
                );
            } else {
                const res = db.prepare(`
                    INSERT INTO projekte (
                        name, kundeId, start, ende, budget, status,
                        sicherheitseinbehalt_prozent, source_angebot_id, source_angebot_version,
                        gaeb_phase, hoai_vob_flag
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    p.name,
                    p.kundeId || null,
                    p.start || null,
                    p.ende || null,
                    p.budget || 0,
                    p.status || null,
                    p.sicherheitseinbehalt_prozent || 0,
                    p.source_angebot_id || null,
                    p.source_angebot_version || null,
                    p.gaeb_phase || null,
                    p.hoai_vob_flag || 'VOB'
                );
                projId = Number(res.lastInsertRowid);
            }

            if (Array.isArray(p.positionen)) {
                db.prepare('DELETE FROM projekt_positionen WHERE projekt_id = ?').run(projId);
                const insertPosStmt = db.prepare(`
                    INSERT INTO projekt_positionen (
                        projekt_id, source_angebot_id, source_angebot_version, source_angebot_pos_id,
                        oz_code, titel, name, menge, einheit, preis,
                        cost_type, positionstyp, in_endsumme_enthalten,
                        zeitansatz_h, lohn_ep, stoff_ep, geraet_ep, sonst_ep,
                        ekt_stoff_je_me, ekt_geraet_je_me, ekt_sonst_je_me, ekt_nu_je_me
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                for (const pos of p.positionen) {
                    const inEndsumme = AngebotController.normalizeInEndsumme(pos.in_endsumme_enthalten, pos.positionstyp);
                    insertPosStmt.run(
                        projId,
                        pos.source_angebot_id || p.source_angebot_id || null,
                        pos.source_angebot_version || p.source_angebot_version || null,
                        pos.source_angebot_pos_id || pos.sourceOfferPositionId || null,
                        pos.oz_code || null,
                        pos.titel || null,
                        pos.name || '',
                        pos.menge !== undefined ? parseFloat(pos.menge) : 1,
                        pos.einheit || 'Stk.',
                        pos.preis !== undefined ? parseFloat(pos.preis) : 0,
                        pos.cost_type || 'MATERIAL',
                        (pos.positionstyp || 'NORMAL').toUpperCase().trim(),
                        inEndsumme,
                        parseFloat(pos.zeitansatz_h) || 0.0,
                        parseFloat(pos.lohn_ep) || 0.0,
                        parseFloat(pos.stoff_ep) || 0.0,
                        parseFloat(pos.geraet_ep) || 0.0,
                        parseFloat(pos.sonst_ep) || 0.0,
                        parseFloat(pos.ekt_stoff_je_me) || 0.0,
                        parseFloat(pos.ekt_geraet_je_me) || 0.0,
                        parseFloat(pos.ekt_sonst_je_me) || 0.0,
                        parseFloat(pos.ekt_nu_je_me) || 0.0
                    );
                }
            }

            return projId;
        });

        return tx(projekt);
    },

    getProjektMitPositionen(projektId) {
        const projekt = db.prepare('SELECT * FROM projekte WHERE id = ?').get(projektId);
        if (!projekt) return null;
        const positions = db.prepare('SELECT * FROM projekt_positionen WHERE projekt_id = ? ORDER BY id ASC').all(projektId);
        projekt.positionen = positions.map(p => ({
            ...p,
            sourceOfferPositionId: p.source_angebot_pos_id
        }));
        return projekt;
    },

    getProjekt(projektId) {
        return this.getProjektMitPositionen(projektId);
    },

getVobMeldungen(filter = {}) {
        return BautagebuchMobileController.getVobMeldungen(db, filter);
    },

    saveVobMeldung(data) {
        return BautagebuchMobileController.saveVobMeldung(db, data, auditLogger);
    },

    deleteVobMeldung(id) {
        return BautagebuchMobileController.deleteVobMeldung(db, id, auditLogger);
    },

    generateVobMeldungPdfHtml(id) {
        const meldung = db.prepare('SELECT * FROM bedenken_behinderungen WHERE id = ?').get(id);
        if (!meldung) throw new Error(`VOB-Meldung #${id} nicht gefunden.`);

        const projekt = db.prepare('SELECT * FROM projekte WHERE id = ?').get(meldung.projekt_id) || { name: 'Bauvorhaben' };
        const companyInfo = {
            firmenname: this.getEinstellung('firmenname') || 'W-Link ERP',
            iban: this.getEinstellung('iban') || '',
            bic: this.getEinstellung('bic') || '',
            steuer: this.getEinstellung('steuer') || ''
        };

        const html = BautagebuchMobileController.generateVobHtml(meldung, projekt, companyInfo);
        return { success: true, html, meldung, projekt };
    }
    };
}

module.exports = createControllingBautagebuchRepo;
