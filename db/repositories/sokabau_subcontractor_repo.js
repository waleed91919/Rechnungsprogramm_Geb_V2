/**
 * SOKA-BAU & Subunternehmer Compliance Repository
 * ZVK Meldedaten, Tarifbeitragssätze & Nachweiskontrolle (§ 14 AEntG)
 */
const SokaBauController = require('../../controllers/SokaBauController');
const SubcontractorComplianceController = require('../../controllers/SubcontractorComplianceController');

function createSokabauSubcontractorRepo(deps) {
    const { db, appendAuditLog, getEinstellung: injectedGetEinstellung, dbAPI } = deps;
    const getEinstellung = (key) => {
        if (injectedGetEinstellung) return injectedGetEinstellung(key);
        if (dbAPI && dbAPI.getEinstellung) return dbAPI.getEinstellung(key);
        const row = db.prepare('SELECT value FROM einstellungen WHERE key = ?').get(key);
        return row ? row.value : null;
    };

    return {
getSokaBeitragssaetze(stichtag = new Date()) {
        return db.prepare('SELECT * FROM soka_beitragssaetze ORDER BY gueltig_ab DESC, tarifgebiet ASC').all();
    },

    saveSokaBeitragssatz(data) {
        if (data.id) {
            db.prepare(`
                UPDATE soka_beitragssaetze SET
                    gueltig_ab = ?, gueltig_bis = ?, tarifgebiet = ?, ulak_prozent = ?,
                    zvk_prozent = ?, bbv_prozent = ?, winterbau_ag_prozent = ?,
                    winterbau_an_prozent = ?, urlaubsverguetung_prozent = ?,
                    mindestlohn_1 = ?, mindestlohn_2 = ?, bezeichnung = ?
                WHERE id = ?
            `).run(
                data.gueltig_ab, data.gueltig_bis || null, data.tarifgebiet,
                parseFloat(data.ulak_prozent) || 0, parseFloat(data.zvk_prozent) || 0,
                parseFloat(data.bbv_prozent) || 0, parseFloat(data.winterbau_ag_prozent) || 0,
                parseFloat(data.winterbau_an_prozent) || 0, parseFloat(data.urlaubsverguetung_prozent) || 0,
                parseFloat(data.mindestlohn_1) || 14.35, parseFloat(data.mindestlohn_2) || 16.50,
                data.bezeichnung || null, data.id
            );
            appendAuditLog({ action: 'SOKA_BEITRAGSSATZ_UPDATE', entityType: 'SOKA_BEITRAGSSATZ', entityId: data.id, details: { tarifgebiet: data.tarifgebiet } });
            return { success: true, id: data.id };
        } else {
            const res = db.prepare(`
                INSERT INTO soka_beitragssaetze (
                    gueltig_ab, gueltig_bis, tarifgebiet, ulak_prozent,
                    zvk_prozent, bbv_prozent, winterbau_ag_prozent,
                    winterbau_an_prozent, urlaubsverguetung_prozent,
                    mindestlohn_1, mindestlohn_2, bezeichnung
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                data.gueltig_ab, data.gueltig_bis || null, data.tarifgebiet,
                parseFloat(data.ulak_prozent) || 0, parseFloat(data.zvk_prozent) || 0,
                parseFloat(data.bbv_prozent) || 0, parseFloat(data.winterbau_ag_prozent) || 0,
                parseFloat(data.winterbau_an_prozent) || 0, parseFloat(data.urlaubsverguetung_prozent) || 0,
                parseFloat(data.mindestlohn_1) || 14.35, parseFloat(data.mindestlohn_2) || 16.50,
                data.bezeichnung || null
            );
            appendAuditLog({ action: 'SOKA_BEITRAGSSATZ_INSERT', entityType: 'SOKA_BEITRAGSSATZ', entityId: res.lastInsertRowid, details: { tarifgebiet: data.tarifgebiet } });
            return { success: true, id: res.lastInsertRowid };
        }
    },

    getSokaMeldungen(filter = {}) {
        let sql = 'SELECT * FROM soka_bau_meldungen';
        const params = [];
        if (filter.melde_monat) {
            sql += ' WHERE melde_monat = ?';
            params.push(filter.melde_monat);
        }
        sql += ' ORDER BY melde_monat DESC, id DESC';
        return db.prepare(sql).all(...params);
    },

    getSokaMeldungDetails(id) {
        const meldung = db.prepare('SELECT * FROM soka_bau_meldungen WHERE id = ?').get(id);
        if (!meldung) return null;
        const anMeldungen = db.prepare('SELECT * FROM soka_bau_arbeitnehmer_monat WHERE meldung_id = ?').all(id);
        for (const an of anMeldungen) {
            an.ausfallzeiten = db.prepare('SELECT * FROM soka_bau_ausfallzeiten WHERE arbeitnehmer_monat_id = ?').all(an.id);
            an.complianceWarnings = an.compliance_fehler ? JSON.parse(an.compliance_fehler) : [];
        }
        return {
            ...meldung,
            arbeitnehmerMeldungen: anMeldungen
        };
    },

    generateSokaMonatsmeldung(meldeMonat, tarifgebiet = 'WEST') {
        const cleanMonat = meldeMonat.includes('-') ? meldeMonat : `${meldeMonat.slice(0, 4)}-${meldeMonat.slice(4, 6)}`;
        const betrieb = {
            betriebsnummer: this.getEinstellung('soka_betriebsnummer') || '98765432',
            name: this.getEinstellung('firmenname') || 'W-Link Bau GmbH'
        };

        const saetze = SokaBauController.getBeitragssaetze(tarifgebiet, `${cleanMonat}-01`, db);
        const mitarbeiterList = db.prepare('SELECT * FROM mitarbeiter WHERE aktiv = 1').all();

        const vonDate = `${cleanMonat}-01`;
        const bisDate = `${cleanMonat}-31T23:59:59`;

        const anMeldungen = mitarbeiterList.map(ma => {
            const zeitEntries = db.prepare(`
                SELECT * FROM zeiterfassung 
                WHERE mitarbeiter_id = ? AND zeit_von >= ? AND zeit_von <= ?
            `).all(ma.id, vonDate, bisDate);

            let geleisteteStunden = 0;
            const ausfallzeiten = [];

            zeitEntries.forEach(z => {
                const h = (z.dauer_min || 0) / 60;
                if (z.taetigkeit_typ === 'PRODUKTIV' || z.taetigkeit_typ === 'RUESTZEIT' || z.taetigkeit_typ === 'WEGEZEIT_FAHRER') {
                    geleisteteStunden += h;
                } else if (z.taetigkeit_typ === 'SCHLECHTWEWETTER') {
                    ausfallzeiten.push({
                        schluessel: '04',
                        bezeichnung: 'Saison-KUG / Schlechtwetter',
                        von: (z.zeit_von || '').slice(0, 10),
                        bis: (z.zeit_bis || z.zeit_von || '').slice(0, 10),
                        stunden: h
                    });
                }
            });

            if (geleisteteStunden === 0 && zeitEntries.length === 0) {
                geleisteteStunden = 168.0;
            }

            const stundensatz = parseFloat(ma.tarif_stundensatz) || 20.0;
            const bruttoLohn = Math.round(geleisteteStunden * stundensatz * 100) / 100;

            return SokaBauController.calculateArbeitnehmerMonat(ma, {
                bruttoLohn,
                geleisteteStunden,
                beschaeftigungstage: 30,
                ausfallzeiten,
                genommenerUrlaubTage: 0,
                ausbezahltesUrlaubsentgelt: 0
            }, saetze);
        });

        return SokaBauController.calculateMonatsmeldungGesamt(betrieb, anMeldungen, cleanMonat, tarifgebiet);
    },

    saveSokaMeldung(data) {
        const cleanMonat = data.meldeMonat || data.melde_monat;
        const bnr = data.betriebsnummer || this.getEinstellung('soka_betriebsnummer') || '98765432';
        const tarif = data.tarifgebiet || 'WEST';

        const tx = db.transaction(() => {
            const existing = db.prepare('SELECT id FROM soka_bau_meldungen WHERE melde_monat = ?').get(cleanMonat);
            if (existing) {
                db.prepare('DELETE FROM soka_bau_meldungen WHERE id = ?').run(existing.id);
            }

            const insertMeldungStmt = db.prepare(`
                INSERT INTO soka_bau_meldungen (
                    melde_monat, betriebsnummer, tarifgebiet, status,
                    anzahl_arbeitnehmer, bruttolohn_gesamt, beitrag_gesamt,
                    erstattung_gesamt, zahlbetrag
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const mRes = insertMeldungStmt.run(
                cleanMonat, bnr, tarif, data.status || 'VALIDIERT',
                data.anzahlArbeitnehmer || (data.arbeitnehmerMeldungen ? data.arbeitnehmerMeldungen.length : 0),
                data.bruttolohnGesamt || 0, data.beitragGesamt || 0,
                data.erstattungGesamt || 0, data.zahlbetrag || 0
            );

            const meldungId = mRes.lastInsertRowid;

            const insertAnStmt = db.prepare(`
                INSERT INTO soka_bau_arbeitnehmer_monat (
                    meldung_id, mitarbeiter_id, an_nummer, vsnr, name, vorname,
                    beschaeftigungstage, geleistete_stunden, bruttolohn,
                    ulak_beitrag, zvk_beitrag, bbv_beitrag, winterbau_ag_beitrag,
                    gesamt_beitrag, urlaub_erworben_tage, urlaub_erworben_eur,
                    urlaub_genommen_tage, urlaub_ausbezahlt_eur,
                    compliance_status, compliance_fehler
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const insertAusfallStmt = db.prepare(`
                INSERT INTO soka_bau_ausfallzeiten (
                    arbeitnehmer_monat_id, schluessel, bezeichnung, von_datum, bis_datum, stunden
                ) VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (const an of data.arbeitnehmerMeldungen || []) {
                const anRes = insertAnStmt.run(
                    meldungId, an.mitarbeiterId, an.anNummer, an.vsnr,
                    an.name, an.vorname, an.beschaeftigungstage,
                    an.geleisteteStunden, an.bruttoLohn,
                    an.beitraege ? an.beitraege.ulakBeitrag : 0,
                    an.beitraege ? an.beitraege.zvkBeitrag : 0,
                    an.beitraege ? an.beitraege.bbvBeitrag : 0,
                    an.beitraege ? (an.beitraege.winterbauAg || 0) : 0,
                    an.beitraege ? an.beitraege.gesamtBeitrag : 0,
                    an.urlaub ? an.urlaub.erworbeneUrlaubstage : 0,
                    an.urlaub ? an.urlaub.erworbeneUrlaubsverguetung : 0,
                    an.urlaub ? (an.urlaub.genommeneTage || 0) : 0,
                    an.urlaub ? (an.urlaub.ausbezahltesUrlaubsentgelt || 0) : 0,
                    an.complianceStatus || 'VALID',
                    an.complianceWarnings && an.complianceWarnings.length > 0 ? JSON.stringify(an.complianceWarnings) : null
                );

                const anId = anRes.lastInsertRowid;

                for (const af of an.ausfallzeiten || []) {
                    insertAusfallStmt.run(
                        anId, af.schluessel, af.bezeichnung || 'Ausfallzeit',
                        af.von || af.von_datum, af.bis || af.bis_datum,
                        parseFloat(af.stunden) || 0
                    );
                }
            }

            appendAuditLog({
                action: 'SOKA_MELDUNG_SAVED',
                entityType: 'SOKA_MELDUNG',
                entityId: meldungId,
                details: {
                    meldeMonat: cleanMonat,
                    anzahlAn: (data.arbeitnehmerMeldungen || []).length,
                    zahlbetrag: data.zahlbetrag
                }
            });

            return meldungId;
        });

        const meldungId = tx();
        return { success: true, meldungId };
    },

    deleteSokaMeldung(id) {
        db.prepare('DELETE FROM soka_bau_meldungen WHERE id = ?').run(id);
        appendAuditLog({ action: 'SOKA_MELDUNG_DELETE', entityType: 'SOKA_MELDUNG', entityId: id, details: {} });
        return { success: true, id };
    },

    exportSokaFiles(meldungId, exportDir = null) {
        const details = this.getSokaMeldungDetails(meldungId);
        if (!details) throw new Error(`SOKA-Meldung #${meldungId} nicht gefunden.`);

        const betrieb = {
            betriebsnummer: details.betriebsnummer,
            name: this.getEinstellung('firmenname') || 'W-Link Bau GmbH'
        };

        const anMeldungen = details.arbeitnehmerMeldungen.map(an => ({
            mitarbeiterId: an.mitarbeiter_id,
            anNummer: an.an_nummer,
            vsnr: an.vsnr,
            name: an.name,
            vorname: an.vorname,
            tarifgebiet: details.tarifgebiet,
            beschaeftigungstage: an.beschaeftigungstage,
            geleisteteStunden: an.geleistete_stunden,
            bruttoLohn: an.bruttolohn,
            beitraege: {
                ulakBeitrag: an.ulak_beitrag,
                zvkBeitrag: an.zvk_beitrag,
                bbvBeitrag: an.bbv_beitrag,
                winterbauAg: an.winterbau_ag_beitrag,
                gesamtBeitrag: an.gesamt_beitrag
            },
            urlaub: {
                erworbeneUrlaubstage: an.urlaub_erworben_tage,
                erworbeneUrlaubsverguetung: an.urlaub_erworben_eur,
                genommeneTage: an.urlaub_genommen_tage,
                ausbezahltesUrlaubsentgelt: an.urlaub_ausbezahlt_eur,
                ulakErstattungsanspruch: an.urlaub_ausbezahlt_eur
            },
            ausfallzeiten: an.ausfallzeiten || []
        }));

        const dtaContent = SokaBauController.generateDtaBauString(betrieb, anMeldungen, details.melde_monat);
        const xmlContent = SokaBauController.generateSokaBauXml(betrieb, anMeldungen, details.melde_monat);

        const crypto = require('crypto');
        const dtaHash = crypto.createHash('sha256').update(dtaContent, 'utf8').digest('hex');
        const xmlHash = crypto.createHash('sha256').update(xmlContent, 'utf8').digest('hex');

        let dtaPath = null;
        let xmlPath = null;

        if (exportDir && fs.existsSync(exportDir)) {
            const cleanMonat = details.melde_monat.replace(/[^0-9]/g, '');
            dtaPath = path.join(exportDir, `SOKA_DTA_${cleanMonat}_${details.betriebsnummer}.dta`);
            xmlPath = path.join(exportDir, `SOKA_MELDE_${cleanMonat}_${details.betriebsnummer}.xml`);
            fs.writeFileSync(dtaPath, dtaContent, 'latin1');
            fs.writeFileSync(xmlPath, xmlContent, 'utf8');
        }

        db.prepare(`
            UPDATE soka_bau_meldungen SET
                status = 'EXPORTIERT',
                dta_dateipfad = ?,
                xml_dateipfad = ?,
                sha256_hash = ?,
                exportiert_am = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(dtaPath, xmlPath, dtaHash, meldungId);

        appendAuditLog({
            action: 'SOKA_FILES_EXPORTED',
            entityType: 'SOKA_MELDUNG',
            entityId: meldungId,
            details: {
                dtaHash,
                xmlHash,
                dtaPath,
                xmlPath
            }
        });

        return {
            success: true,
            meldungId,
            dtaContent,
            xmlContent,
            dtaPath,
            xmlPath,
            sha256Hash: dtaHash,
            xmlSha256: xmlHash
        };
    },

getSubcontractorCompliance(kundeId, pruefDatum = new Date()) {
        const sub = db.prepare('SELECT * FROM kunden WHERE id = ?').get(kundeId);
        if (!sub) return null;
        const nachweise = db.prepare('SELECT * FROM subcontractor_compliance_nachweise WHERE kunde_id = ?').all(kundeId);
        return SubcontractorComplianceController.verifySubcontractorCompliance(sub, nachweise, pruefDatum);
    },

    auditAllSubcontractors(pruefDatum = new Date()) {
        const subs = db.prepare('SELECT * FROM kunden WHERE is_subcontractor = 1 OR hat_freistellungsbescheinigung = 1 OR ist_subunternehmer = 1').all();
        const nachweise = db.prepare('SELECT * FROM subcontractor_compliance_nachweise').all();
        return SubcontractorComplianceController.auditAllSubcontractors(subs, nachweise, pruefDatum);
    },

    saveSubcontractorNachweis(data) {
        if (data.id) {
            db.prepare(`
                UPDATE subcontractor_compliance_nachweise SET
                    kunde_id = ?, nachweis_typ = ?, zertifikatsnummer = ?, aussteller = ?,
                    gueltig_von = ?, gueltig_bis = ?, status = ?, dokument_dateipfad = ?, bemerkung = ?
                WHERE id = ?
            `).run(
                data.kunde_id, data.nachweis_typ, data.zertifikatsnummer || null, data.aussteller,
                data.gueltig_von, data.gueltig_bis, data.status || 'ACTIVE',
                data.dokument_dateipfad || null, data.bemerkung || null, data.id
            );
            appendAuditLog({ action: 'SUBCONTRACTOR_NACHWEIS_UPDATE', entityType: 'SUBCONTRACTOR_NACHWEIS', entityId: data.id, details: { kunde_id: data.kunde_id, typ: data.nachweis_typ } });
            return { success: true, id: data.id };
        } else {
            const res = db.prepare(`
                INSERT INTO subcontractor_compliance_nachweise (
                    kunde_id, nachweis_typ, zertifikatsnummer, aussteller,
                    gueltig_von, gueltig_bis, status, dokument_dateipfad, bemerkung
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                data.kunde_id, data.nachweis_typ, data.zertifikatsnummer || null, data.aussteller,
                data.gueltig_von, data.gueltig_bis, data.status || 'ACTIVE',
                data.dokument_dateipfad || null, data.bemerkung || null
            );
            appendAuditLog({ action: 'SUBCONTRACTOR_NACHWEIS_INSERT', entityType: 'SUBCONTRACTOR_NACHWEIS', entityId: res.lastInsertRowid, details: { kunde_id: data.kunde_id, typ: data.nachweis_typ } });
            return { success: true, id: res.lastInsertRowid };
        }
    },

    deleteSubcontractorNachweis(id) {
        db.prepare('DELETE FROM subcontractor_compliance_nachweise WHERE id = ?').run(id);
        appendAuditLog({ action: 'SUBCONTRACTOR_NACHWEIS_DELETE', entityType: 'SUBCONTRACTOR_NACHWEIS', entityId: id, details: {} });
        return { success: true, id };
    },

    getSubcontractorNachweise(kundeId = null) {
        if (kundeId) {
            return db.prepare(`
                SELECT n.*, k.name AS kunde_name
                FROM subcontractor_compliance_nachweise n
                JOIN kunden k ON n.kunde_id = k.id
                WHERE n.kunde_id = ?
                ORDER BY n.gueltig_bis DESC
            `).all(kundeId);
        }
        return db.prepare(`
            SELECT n.*, k.name AS kunde_name
            FROM subcontractor_compliance_nachweise n
            JOIN kunden k ON n.kunde_id = k.id
            ORDER BY n.gueltig_bis ASC
        `).all();
    }
    };
}

module.exports = createSokabauSubcontractorRepo;
