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

    // J13: Defensive Spaltenprüfung für den Nachtrag→LV-Write, damit auch
    // Altschemata/:memory:-Test-DBs ohne gelaufene Migration funktionieren.
    function ensureNachtragLvColumns() {
        const cols = db.prepare(`PRAGMA table_info(projekt_positionen)`).all().map(c => c.name);
        if (!cols.includes('nachtrag_id')) {
            db.exec(`ALTER TABLE projekt_positionen ADD COLUMN nachtrag_id INTEGER REFERENCES nachtraege(id) ON DELETE SET NULL`);
        }
        if (!cols.includes('nachtrag_pos_id')) {
            db.exec(`ALTER TABLE projekt_positionen ADD COLUMN nachtrag_pos_id INTEGER`);
        }
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_projekt_positionen_nachtrag_unique ON projekt_positionen(projekt_id, nachtrag_id, nachtrag_pos_id) WHERE nachtrag_id IS NOT NULL`);
    }

    // J13: Schreibt alle Positionen eines GENEHMIGT-Nachtrags idempotent in den
    // LV-Stamm. Muss INNERHALB einer better-sqlite3-Transaktion laufen.
    function insertNachtragLvPositionen(nachtragId) {
        ensureNachtragLvColumns();
        const nachtrag = db.prepare('SELECT * FROM nachtraege WHERE id = ?').get(nachtragId);
        if (!nachtrag) throw new Error(`Nachtrag mit ID ${nachtragId} wurde nicht gefunden.`);
        if (nachtrag.status !== 'GENEHMIGT') {
            throw new Error(`Nachtrag ${nachtrag.nachtrag_nr || nachtragId} ist nicht genehmigt (Status: ${nachtrag.status}) — LV-Übernahme blockiert.`);
        }
        const posList = db.prepare('SELECT * FROM nachtrag_positionen WHERE nachtrag_id = ? ORDER BY id ASC').all(nachtragId);
        const existsStmt = db.prepare('SELECT id FROM projekt_positionen WHERE projekt_id = ? AND nachtrag_id = ? AND nachtrag_pos_id = ?');
        const insertStmt = db.prepare(`
            INSERT INTO projekt_positionen (
                projekt_id, source_angebot_id, source_angebot_version, source_angebot_pos_id,
                nachtrag_id, nachtrag_pos_id,
                oz_code, titel, name, menge, einheit, preis,
                cost_type, positionstyp, in_endsumme_enthalten
            ) VALUES (?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        let added = 0;
        let skipped = 0;
        posList.forEach((p, idx) => {
            const posId = (p.id !== undefined && p.id !== null) ? p.id : (idx + 1);
            if (existsStmt.get(nachtrag.project_id, nachtrag.id, posId)) {
                skipped++;
                return; // Idempotenz-Key N:{nachtrag_id}:POS:{pos_id} bereits im LV
            }
            insertStmt.run(
                nachtrag.project_id,
                nachtrag.id,
                posId,
                p.oz_code || null,
                p.kurztext || p.bezeichnung || 'Nachtragsposition',
                `[${nachtrag.nachtrag_nr}] ${p.kurztext || p.bezeichnung || 'Nachtragsposition'}`,
                parseFloat(p.menge) || 0,
                p.einheit || 'Stk.',
                parseFloat(p.einheitspreis) || 0,
                p.cost_type || 'MATERIAL',
                'NACHTRAG',
                1
            );
            added++;
        });
        return { added, skipped };
    }

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
        const tx = db.transaction((id) => {
            const row = db.prepare('SELECT id FROM nachtraege WHERE id = ?').get(id);
            if (!row) throw new Error(`Nachtrag mit ID ${id} wurde nicht gefunden.`);
            db.prepare('UPDATE nachtraege SET status = ?, entschieden_am = COALESCE(?, entschieden_am) WHERE id = ?').run(status, decidedDate, id);
            let lv = { added: 0, skipped: 0 };
            if (status === 'GENEHMIGT') {
                lv = insertNachtragLvPositionen(id);
            }
            return lv;
        });
        const lv = tx(nachtragId);
        return { success: true, lvAdded: lv.added, lvSkipped: lv.skipped };
    },

    // J13: GENEHMIGT-Nachtrag idempotent in den LV-Stamm (projekt_positionen)
    // übernehmen. Bereits vorhandene Keys (N:{nachtrag_id}:POS:{pos_id}) werden
    // übersprungen — kein Doppel-Write, weder im Beleg noch im LV.
    async uebernehmeNachtragInsLV(nachtragId) {
        ensureNachtragLvColumns();
        const tx = db.transaction((id) => insertNachtragLvPositionen(id));
        const res = tx(nachtragId);
        return { success: true, added: res.added, skipped: res.skipped };
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
        const selectCols = `e.id, e.project_id, e.lieferant_id, e.rechnungs_nr, e.rechnungs_datum, e.faelligkeits_datum, e.betrag_netto, e.steuersatz, e.betrag_ust, e.betrag_brutto, e.kostenart, e.sec48b_geprueft, e.bauabzugsteuer_einbehalten, e.zahlungs_status, e.bezahlt_am, e.beleg_pfad, e.is_deleted, e.deleted_at, e.deletion_reason`;
        if (projectId) {
            return await dbQuery(`
                SELECT ${selectCols}, k.name as lieferant_name, COALESCE(k.sec48b_status, 'NONE') as sec48b_status, k.sec48b_valid_until
                FROM eingangsrechnungen e
                LEFT JOIN kunden k ON e.lieferant_id = k.id
                WHERE e.project_id = ?
                ORDER BY e.rechnungs_datum DESC
            `, [projectId]);
        }
        return await dbQuery(`
            SELECT ${selectCols}, k.name as lieferant_name, COALESCE(k.sec48b_status, 'NONE') as sec48b_status, k.sec48b_valid_until, p.name as projekt_name
            FROM eingangsrechnungen e
            LEFT JOIN kunden k ON e.lieferant_id = k.id
            LEFT JOIN projekte p ON e.project_id = p.id
            ORDER BY e.rechnungs_datum DESC
        `);
    },

    async saveEingangsrechnung(data) {
        const ust = data.betrag_ust !== undefined ? data.betrag_ust : Math.round(data.betrag_netto * ((data.steuersatz || 19) / 100) * 100) / 100;
        const brutto = data.betrag_brutto !== undefined ? data.betrag_brutto : Math.round((data.betrag_netto + ust) * 100) / 100;

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
                    bauabzug = Math.round(brutto * 0.15 * 100) / 100;
                }
            }
        }

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
            const sVer = p.source_angebot_id ? (parseInt(p.source_angebot_version, 10) || 1) : null;
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
                    sVer,
                    p.gaeb_phase || null,
                    p.hoai_vob_flag || 'VOB',
                    projId
                );
            } else {
                if (!projId && p.source_angebot_id) {
                    const existing = db.prepare('SELECT id, name FROM projekte WHERE source_angebot_id = ? AND COALESCE(source_angebot_version, 1) = ?').get(
                        p.source_angebot_id,
                        sVer
                    );
                    if (existing) {
                        throw new Error(`Doppel-Projektanlage verhindert: Für Angebot #${p.source_angebot_id} (Version ${sVer}) existiert bereits Projekt #${existing.id} ("${existing.name}").`);
                    }
                }

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
                    sVer,
                    p.gaeb_phase || null,
                    p.hoai_vob_flag || 'VOB'
                );
                projId = Number(res.lastInsertRowid);
            }

            if (Array.isArray(p.positionen)) {
                const existingRows = db.prepare('SELECT id, name FROM projekt_positionen WHERE projekt_id = ?').all(projId);
                const existingIdSet = new Set(existingRows.map(r => Number(r.id)));
                const keptIds = [];

                const insertPosStmt = db.prepare(`
                    INSERT INTO projekt_positionen (
                        projekt_id, source_angebot_id, source_angebot_version, source_angebot_pos_id,
                        oz_code, titel, name, menge, einheit, preis,
                        cost_type, positionstyp, in_endsumme_enthalten,
                        zeitansatz_h, lohn_ep, stoff_ep, geraet_ep, sonst_ep,
                        ekt_stoff_je_me, ekt_geraet_je_me, ekt_sonst_je_me, ekt_nu_je_me
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                const updatePosStmt = db.prepare(`
                    UPDATE projekt_positionen SET
                        source_angebot_id = ?,
                        source_angebot_version = ?,
                        source_angebot_pos_id = ?,
                        oz_code = ?,
                        titel = ?,
                        name = ?,
                        menge = ?,
                        einheit = ?,
                        preis = ?,
                        cost_type = ?,
                        positionstyp = ?,
                        in_endsumme_enthalten = ?,
                        zeitansatz_h = ?,
                        lohn_ep = ?,
                        stoff_ep = ?,
                        geraet_ep = ?,
                        sonst_ep = ?,
                        ekt_stoff_je_me = ?,
                        ekt_geraet_je_me = ?,
                        ekt_sonst_je_me = ?,
                        ekt_nu_je_me = ?
                    WHERE id = ? AND projekt_id = ?
                `);

                for (const pos of p.positionen) {
                    const inEndsumme = AngebotController.normalizeInEndsumme(pos.in_endsumme_enthalten, pos.positionstyp);
                    const sAngId = pos.source_angebot_id || p.source_angebot_id || null;
                    const sAngVer = pos.source_angebot_version || sVer || null;
                    const sAngPosId = pos.source_angebot_pos_id || pos.sourceOfferPositionId || null;
                    const ozCode = pos.oz_code || null;
                    const titel = pos.titel || null;
                    const name = pos.name || '';
                    const menge = pos.menge !== undefined ? parseFloat(pos.menge) : 1;
                    const einheit = pos.einheit || 'Stk.';
                    const preis = pos.preis !== undefined ? parseFloat(pos.preis) : 0;
                    const costType = pos.cost_type || 'MATERIAL';
                    const positionstyp = (pos.positionstyp || 'NORMAL').toUpperCase().trim();
                    const zeitansatzH = parseFloat(pos.zeitansatz_h) || 0.0;
                    const lohnEp = parseFloat(pos.lohn_ep) || 0.0;
                    const stoffEp = parseFloat(pos.stoff_ep) || 0.0;
                    const geraetEp = parseFloat(pos.geraet_ep) || 0.0;
                    const sonstEp = parseFloat(pos.sonst_ep) || 0.0;
                    const ektStoff = parseFloat(pos.ekt_stoff_je_me) || 0.0;
                    const ektGeraet = parseFloat(pos.ekt_geraet_je_me) || 0.0;
                    const ektSonst = parseFloat(pos.ekt_sonst_je_me) || 0.0;
                    const ektNu = parseFloat(pos.ekt_nu_je_me) || 0.0;

                    const rawId = pos.id;
                    const isNumericId = typeof rawId === 'number' || (typeof rawId === 'string' && /^\d+$/.test(rawId.trim()));
                    const numericId = isNumericId ? Number(rawId) : null;

                    if (numericId !== null && existingIdSet.has(numericId)) {
                        updatePosStmt.run(
                            sAngId,
                            sAngVer,
                            sAngPosId,
                            ozCode,
                            titel,
                            name,
                            menge,
                            einheit,
                            preis,
                            costType,
                            positionstyp,
                            inEndsumme,
                            zeitansatzH,
                            lohnEp,
                            stoffEp,
                            geraetEp,
                            sonstEp,
                            ektStoff,
                            ektGeraet,
                            ektSonst,
                            ektNu,
                            numericId,
                            projId
                        );
                        keptIds.push(numericId);
                        pos.id = numericId;
                    } else {
                        const insInfo = insertPosStmt.run(
                            projId,
                            sAngId,
                            sAngVer,
                            sAngPosId,
                            ozCode,
                            titel,
                            name,
                            menge,
                            einheit,
                            preis,
                            costType,
                            positionstyp,
                            inEndsumme,
                            zeitansatzH,
                            lohnEp,
                            stoffEp,
                            geraetEp,
                            sonstEp,
                            ektStoff,
                            ektGeraet,
                            ektSonst,
                            ektNu
                        );
                        const newId = Number(insInfo.lastInsertRowid);
                        keptIds.push(newId);
                        pos.id = newId;
                    }
                }

                const keptIdSet = new Set(keptIds);
                const toDelete = existingRows.filter(r => !keptIdSet.has(Number(r.id)));

                if (toDelete.length > 0) {
                    for (const posToDelete of toDelete) {
                        const posId = Number(posToDelete.id);
                        const posName = posToDelete.name || '';
                        const linkedAufmass = db.prepare(`
                            SELECT id, titel FROM aufmass
                            WHERE (projekt_position_id IS NOT NULL AND projekt_position_id = ?)
                               OR (projekt_position_id IS NULL AND projekt_id = ? AND (CAST(position_id AS INTEGER) = ? OR position_id = ?))
                        `).get(posId, projId, posId, String(posId));

                        if (linkedAufmass) {
                            throw new Error('Löschen der Projektposition verhindert: Auf Position #' + posId + ' ("' + posName + '") verweisen bereits Aufmaße. Löschen Sie zuerst die zugehörigen Aufmaße.');
                        }
                    }

                    const toDeleteIds = toDelete.map(r => Number(r.id));
                    const placeholders = toDeleteIds.map(() => '?').join(',');
                    db.prepare(`DELETE FROM projekt_positionen WHERE projekt_id = ? AND id IN (${placeholders})`).run(projId, ...toDeleteIds);
                }
            }

            return projId;
        });

        try {
            return tx(projekt);
        } catch (err) {
            if (err && typeof err.message === 'string' && err.message.startsWith('Doppel-Projektanlage verhindert')) {
                throw err;
            }
            if (err && typeof err.message === 'string' && err.message.startsWith('Löschen der Projektposition verhindert')) {
                throw err;
            }
            if (
                err &&
                (err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
                 err.code === 'SQLITE_CONSTRAINT' ||
                 (typeof err.message === 'string' && (err.message.includes('UNIQUE constraint failed') || err.message.includes('SQLITE_CONSTRAINT_UNIQUE'))))
            ) {
                const sId = projekt && projekt.source_angebot_id;
                const sVer = sId ? (parseInt(projekt.source_angebot_version, 10) || 1) : 1;
                if (sId) {
                    const existing = db.prepare('SELECT id, name FROM projekte WHERE source_angebot_id = ? AND COALESCE(source_angebot_version, 1) = ?').get(sId, sVer);
                    const existingInfo = existing ? ` existiert bereits Projekt #${existing.id} ("${existing.name}").` : '.';
                    throw new Error(`Doppel-Projektanlage verhindert: Für Angebot #${sId} (Version ${sVer})${existingInfo}`);
                }
            }
            throw err;
        }
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
