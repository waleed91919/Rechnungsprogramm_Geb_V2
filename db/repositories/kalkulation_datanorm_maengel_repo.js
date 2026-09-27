/**
 * Kalkulation, Datanorm & Mängel Repository
 * Zuschlagskalkulation (Mittellohn), DATANORM 4.0/5.0 Streaming & Mängelkataster
 */
const KalkulationController = require('../../controllers/KalkulationController');
const DatanormParser = require('../../controllers/DatanormParser');
const MaengelController = require('../../controllers/MaengelController');
const MaengelPdfBuilder = require('../../main/maengel-pdf-builder');

function createKalkulationDatanormMaengelRepo(deps) {
    const { db, appendAuditLog, getEinstellung: injectedGetEinstellung, dbAPI } = deps;
    const getEinstellung = (key) => {
        if (injectedGetEinstellung) return injectedGetEinstellung(key);
        if (dbAPI && dbAPI.getEinstellung) return dbAPI.getEinstellung(key);
        const row = db.prepare('SELECT value FROM einstellungen WHERE key = ?').get(key);
        return row ? row.value : null;
    };

    const repo = {
// --- 1. Zuschlagskalkulation & Mittellohn ---
    getZuschlagskalkulationStamm(id = null) {
        if (id) {
            return db.prepare('SELECT * FROM zuschlagskalkulation_stamm WHERE id = ?').get(id);
        }
        const standard = db.prepare('SELECT * FROM zuschlagskalkulation_stamm WHERE ist_standard = 1 LIMIT 1').get();
        if (standard) return standard;
        return db.prepare('SELECT * FROM zuschlagskalkulation_stamm ORDER BY id ASC LIMIT 1').get() || KalkulationController.getDefaultProfile();
    },

    getAllZuschlagskalkulationStamm() {
        return db.prepare('SELECT * FROM zuschlagskalkulation_stamm ORDER BY ist_standard DESC, name ASC').all();
    },

    saveZuschlagskalkulationStamm(profileData) {
        const p = { ...profileData };
        const mlStruct = KalkulationController.calculateMittellohnStructure(p);
        p.kalkulationslohn_eur = mlStruct.kalkulationslohn;

        const tx = db.transaction(() => {
            if (p.ist_standard) {
                db.prepare('UPDATE zuschlagskalkulation_stamm SET ist_standard = 0').run();
            }

            if (p.id) {
                db.prepare(`
                    UPDATE zuschlagskalkulation_stamm SET
                        name = @name,
                        ist_standard = @ist_standard,
                        mittellohn_eur = @mittellohn_eur,
                        lohngebundene_kosten_prozent = @lohngebundene_kosten_prozent,
                        lohnnebenkosten_prozent = @lohnnebenkosten_prozent,
                        kalkulationslohn_eur = @kalkulationslohn_eur,
                        kalkulationsverfahren = @kalkulationsverfahren,
                        endsumme_umlage_basis = @endsumme_umlage_basis,
                        zuschlag_lohn_bgk = @zuschlag_lohn_bgk,
                        zuschlag_lohn_agk = @zuschlag_lohn_agk,
                        zuschlag_lohn_wug = @zuschlag_lohn_wug,
                        zuschlag_stoff_bgk = @zuschlag_stoff_bgk,
                        zuschlag_stoff_agk = @zuschlag_stoff_agk,
                        zuschlag_stoff_wug = @zuschlag_stoff_wug,
                        zuschlag_geraet_bgk = @zuschlag_geraet_bgk,
                        zuschlag_geraet_agk = @zuschlag_geraet_agk,
                        zuschlag_geraet_wug = @zuschlag_geraet_wug,
                        zuschlag_sonst_bgk = @zuschlag_sonst_bgk,
                        zuschlag_sonst_agk = @zuschlag_sonst_agk,
                        zuschlag_sonst_wug = @zuschlag_sonst_wug,
                        zuschlag_nu_bgk = @zuschlag_nu_bgk,
                        zuschlag_nu_agk = @zuschlag_nu_agk,
                        zuschlag_nu_wug = @zuschlag_nu_wug,
                        wug_gewinn_prozent = @wug_gewinn_prozent,
                        wug_betriebswagnis_prozent = @wug_betriebswagnis_prozent,
                        wug_leistungswagnis_prozent = @wug_leistungswagnis_prozent,
                        skonto_abzug_kalkulation_prozent = @skonto_abzug_kalkulation_prozent,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = @id
                `).run(p);
                return p.id;
            } else {
                const res = db.prepare(`
                    INSERT INTO zuschlagskalkulation_stamm (
                        name, ist_standard, mittellohn_eur, lohngebundene_kosten_prozent, lohnnebenkosten_prozent,
                        kalkulationslohn_eur, kalkulationsverfahren, endsumme_umlage_basis,
                        zuschlag_lohn_bgk, zuschlag_lohn_agk, zuschlag_lohn_wug,
                        zuschlag_stoff_bgk, zuschlag_stoff_agk, zuschlag_stoff_wug,
                        zuschlag_geraet_bgk, zuschlag_geraet_agk, zuschlag_geraet_wug,
                        zuschlag_sonst_bgk, zuschlag_sonst_agk, zuschlag_sonst_wug,
                        zuschlag_nu_bgk, zuschlag_nu_agk, zuschlag_nu_wug,
                        wug_gewinn_prozent, wug_betriebswagnis_prozent, wug_leistungswagnis_prozent,
                        skonto_abzug_kalkulation_prozent
                    ) VALUES (
                        @name, @ist_standard, @mittellohn_eur, @lohngebundene_kosten_prozent, @lohnnebenkosten_prozent,
                        @kalkulationslohn_eur, @kalkulationsverfahren, @endsumme_umlage_basis,
                        @zuschlag_lohn_bgk, @zuschlag_lohn_agk, @zuschlag_lohn_wug,
                        @zuschlag_stoff_bgk, @zuschlag_stoff_agk, @zuschlag_stoff_wug,
                        @zuschlag_geraet_bgk, @zuschlag_geraet_agk, @zuschlag_geraet_wug,
                        @zuschlag_sonst_bgk, @zuschlag_sonst_agk, @zuschlag_sonst_wug,
                        @zuschlag_nu_bgk, @zuschlag_nu_agk, @zuschlag_nu_wug,
                        @wug_gewinn_prozent, @wug_betriebswagnis_prozent, @wug_leistungswagnis_prozent,
                        @skonto_abzug_kalkulation_prozent
                    )
                `).run(p);
                return res.lastInsertRowid;
            }
        });

        const id = tx();
        return { success: true, id };
    },

    deleteZuschlagskalkulationStamm(id) {
        db.prepare('DELETE FROM zuschlagskalkulation_stamm WHERE id = ?').run(id);
        return { success: true };
    },

    getProjectKalkulationProfile(projektId) {
        const pId = Number(projektId);
        let projProfile = db.prepare('SELECT * FROM zuschlagskalkulation_projekte WHERE projekt_id = ?').get(pId);
        if (!projProfile) {
            const stamm = this.getZuschlagskalkulationStamm();
            projProfile = {
                ...stamm,
                projekt_id: pId,
                stamm_profil_id: stamm.id || null
            };
            delete projProfile.id;
        }
        return projProfile;
    },

    saveProjectKalkulationProfile(projektId, profileData) {
        const pId = Number(projektId);
        const p = { ...profileData, projekt_id: pId };
        const mlStruct = KalkulationController.calculateMittellohnStructure(p);
        p.kalkulationslohn_eur = mlStruct.kalkulationslohn;

        const tx = db.transaction(() => {
            const existing = db.prepare('SELECT id FROM zuschlagskalkulation_projekte WHERE projekt_id = ?').get(pId);
            if (existing) {
                db.prepare(`
                    UPDATE zuschlagskalkulation_projekte SET
                        stamm_profil_id = @stamm_profil_id,
                        mittellohn_eur = @mittellohn_eur,
                        lohngebundene_kosten_prozent = @lohngebundene_kosten_prozent,
                        lohnnebenkosten_prozent = @lohnnebenkosten_prozent,
                        kalkulationslohn_eur = @kalkulationslohn_eur,
                        kalkulationsverfahren = @kalkulationsverfahren,
                        endsumme_umlage_basis = @endsumme_umlage_basis,
                        zuschlag_lohn_bgk = @zuschlag_lohn_bgk,
                        zuschlag_lohn_agk = @zuschlag_lohn_agk,
                        zuschlag_lohn_wug = @zuschlag_lohn_wug,
                        zuschlag_stoff_bgk = @zuschlag_stoff_bgk,
                        zuschlag_stoff_agk = @zuschlag_stoff_agk,
                        zuschlag_stoff_wug = @zuschlag_stoff_wug,
                        zuschlag_geraet_bgk = @zuschlag_geraet_bgk,
                        zuschlag_geraet_agk = @zuschlag_geraet_agk,
                        zuschlag_geraet_wug = @zuschlag_geraet_wug,
                        zuschlag_sonst_bgk = @zuschlag_sonst_bgk,
                        zuschlag_sonst_agk = @zuschlag_sonst_agk,
                        zuschlag_sonst_wug = @zuschlag_sonst_wug,
                        zuschlag_nu_bgk = @zuschlag_nu_bgk,
                        zuschlag_nu_agk = @zuschlag_nu_agk,
                        zuschlag_nu_wug = @zuschlag_nu_wug,
                        wug_gewinn_prozent = @wug_gewinn_prozent,
                        wug_betriebswagnis_prozent = @wug_betriebswagnis_prozent,
                        wug_leistungswagnis_prozent = @wug_leistungswagnis_prozent,
                        skonto_abzug_kalkulation_prozent = @skonto_abzug_kalkulation_prozent,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE projekt_id = @projekt_id
                `).run(p);
            } else {
                db.prepare(`
                    INSERT INTO zuschlagskalkulation_projekte (
                        projekt_id, stamm_profil_id, mittellohn_eur, lohngebundene_kosten_prozent, lohnnebenkosten_prozent,
                        kalkulationslohn_eur, kalkulationsverfahren, endsumme_umlage_basis,
                        zuschlag_lohn_bgk, zuschlag_lohn_agk, zuschlag_lohn_wug,
                        zuschlag_stoff_bgk, zuschlag_stoff_agk, zuschlag_stoff_wug,
                        zuschlag_geraet_bgk, zuschlag_geraet_agk, zuschlag_geraet_wug,
                        zuschlag_sonst_bgk, zuschlag_sonst_agk, zuschlag_sonst_wug,
                        zuschlag_nu_bgk, zuschlag_nu_agk, zuschlag_nu_wug,
                        wug_gewinn_prozent, wug_betriebswagnis_prozent, wug_leistungswagnis_prozent,
                        skonto_abzug_kalkulation_prozent
                    ) VALUES (
                        @projekt_id, @stamm_profil_id, @mittellohn_eur, @lohngebundene_kosten_prozent, @lohnnebenkosten_prozent,
                        @kalkulationslohn_eur, @kalkulationsverfahren, @endsumme_umlage_basis,
                        @zuschlag_lohn_bgk, @zuschlag_lohn_agk, @zuschlag_lohn_wug,
                        @zuschlag_stoff_bgk, @zuschlag_stoff_agk, @zuschlag_stoff_wug,
                        @zuschlag_geraet_bgk, @zuschlag_geraet_agk, @zuschlag_geraet_wug,
                        @zuschlag_sonst_bgk, @zuschlag_sonst_agk, @zuschlag_sonst_wug,
                        @zuschlag_nu_bgk, @zuschlag_nu_agk, @zuschlag_nu_wug,
                        @wug_gewinn_prozent, @wug_betriebswagnis_prozent, @wug_leistungswagnis_prozent,
                        @skonto_abzug_kalkulation_prozent
                    )
                `).run(p);
            }
        });

        tx();
        return { success: true };
    },

    getProjectKalkulation(projektId) {
        const pId = Number(projektId);
        const project = db.prepare('SELECT * FROM projekte WHERE id = ?').get(pId) || { id: pId, name: 'Projekt' };
        const profile = this.getProjectKalkulationProfile(pId);

        // Positionen aus Angeboten/Rechnungen dieses Projekts
        const positions = db.prepare(`
            SELECT p.*, d.type AS doc_type, d.nr AS doc_nr
            FROM positionen p
            JOIN dokumente d ON p.dokumentId = d.id
            WHERE d.projektId = ?
            ORDER BY d.id ASC, p.id ASC
        `).all(pId);

        // Ist-Kosten & Stunden aus Eingangsrechnungen und Bautagebuch
        const eingangsrechnungen = db.prepare('SELECT * FROM eingangsrechnungen WHERE project_id = ?').all(pId);
        let actualMaterial = 0;
        let actualSub = 0;
        eingangsrechnungen.forEach(er => {
            const b = parseFloat(er.betrag_netto) || 0;
            if (er.kostenart === 'SUB' || er.kostenart === 'NACHUNTERNEHMER') {
                actualSub += b;
            } else {
                actualMaterial += b;
            }
        });

        const bautagebuchEintraege = db.prepare('SELECT * FROM bautagebuch WHERE project_id = ?').all(pId);
        let actualHours = 0;
        bautagebuchEintraege.forEach(bt => {
            const anzahl = parseFloat(bt.anzahl_arbeiter) || 1;
            const h = parseFloat(bt.arbeitsstunden) || 0;
            actualHours += (anzahl * h);
        });

        const calculationResult = KalkulationController.calculateProjectKalkulation(
            positions,
            profile,
            { material: actualMaterial, sub: actualSub, hours: actualHours }
        );

        return {
            project,
            profile,
            calculationResult,
            positionsCount: positions.length,
            actualCosts: { material: actualMaterial, sub: actualSub, hours: actualHours }
        };
    },

    // --- 2. DATANORM 4.0 & 5.0 High-Performance Streaming Import ---
    async startDatanormImport(payload = {}, progressCallback = null) {
        const { filePaths, options = {} } = payload;
        if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
            throw new Error('Keine Dateipfade für den DATANORM-Import übergeben.');
        }

        const res = await DatanormParser.importDatanormFiles(filePaths, db, options, progressCallback);

        appendAuditLog({
            entityType: 'DATANORM',
            entityId: 0,
            action: 'DATANORM_IMPORTIERT',
            details: {
                filesCount: res.filesCount,
                totalInserted: res.totalInserted,
                totalUpdated: res.totalUpdated,
                totalLines: res.totalLines
            }
        });

        return res;
    },

    getDatanormKataloge(filter = {}) {
        let query = 'SELECT * FROM datanorm_kataloge WHERE 1=1';
        const params = [];
        if (filter.status) {
            query += ' AND status = ?';
            params.push(filter.status);
        }
        query += ' ORDER BY import_datum DESC';
        const kataloge = db.prepare(query).all(...params);

        const stmtWrg = db.prepare('SELECT * FROM datanorm_warengruppen WHERE katalog_id = ?');
        const stmtRab = db.prepare('SELECT * FROM datanorm_rabattgruppen WHERE katalog_id = ?');

        return kataloge.map(k => ({
            ...k,
            warengruppen: stmtWrg.all(k.id),
            rabattgruppen: stmtRab.all(k.id)
        }));
    },

    deleteDatanormKatalog(katalogId) {
        const kId = Number(katalogId);
        const kat = db.prepare('SELECT * FROM datanorm_kataloge WHERE id = ?').get(kId);
        if (!kat) return { success: false, error: 'Katalog nicht gefunden' };

        const tx = db.transaction(() => {
            db.prepare('DELETE FROM artikel WHERE katalog = ?').run(kat.katalog_name);
            db.prepare('DELETE FROM datanorm_kataloge WHERE id = ?').run(kId);

            appendAuditLog({
                entityType: 'DATANORM',
                entityId: kId,
                action: 'DATANORM_GELOESCHT',
                details: { katalog_name: kat.katalog_name }
            });
        });

        tx();
        return { success: true };
    },

    // --- 3. Projektübergreifendes Mängelkataster & Fristenmanagement ---
    getMaengelKataster(filter = {}) {
        return MaengelController.getKataster(db, filter);
    },

    getMangelDetails(mangelId) {
        return MaengelController.getMangelDetails(db, Number(mangelId));
    },

    saveMangel(mangelData, fotos = []) {
        return MaengelController.saveMangel(db, mangelData, fotos, auditLogger);
    },

    updateMangelStatus(mangelId, newStatus, kommentar = '', geaendertVon = 'Bauleiter') {
        return MaengelController.updateMangelStatus(db, Number(mangelId), newStatus, kommentar, geaendertVon, auditLogger);
    },

    deleteMangel(mangelId) {
        return MaengelController.deleteMangel(db, Number(mangelId), auditLogger);
    },

    executeMangelErsatzvornahme(payload) {
        return MaengelController.executeErsatzvornahme(db, payload, auditLogger);
    },

    generateMahnschreiben(mangelId, stufe = 1, optionen = {}) {
        const mangel = this.getMangelDetails(mangelId);
        if (!mangel) throw new Error(`Mangel mit ID ${mangelId} nicht gefunden.`);

        let partner = {};
        if (mangel.subunternehmer_kunde_id) {
            partner = db.prepare('SELECT * FROM kunden WHERE id = ?').get(mangel.subunternehmer_kunde_id) || {};
        }

        const companyInfo = {
            firmenname: this.getEinstellung('firmenname') || 'W-Link ERP',
            iban: this.getEinstellung('iban') || '',
            bic: this.getEinstellung('bic') || '',
            steuer: this.getEinstellung('steuer') || ''
        };

        const schreiben = MaengelController.generateMahnschreibenText(mangel, partner, stufe, optionen);
        const html = MaengelController.generateMahnschreibenHtml(mangel, partner, stufe, optionen, companyInfo);

        // Status bei Erzeugung von Mahnschreiben automatisch anpassen
        if (stufe === 1 && mangel.status === 'ERFASST') {
            this.updateMangelStatus(mangelId, 'MAENGELRUEGE_VERSCHICKT', 'Mängelrüge Stufe 1 erstellt');
        } else if (stufe === 2 && (mangel.status === 'MAENGELRUEGE_VERSCHICKT' || mangel.status === 'IN_NACHBESSERUNG')) {
            this.updateMangelStatus(mangelId, 'MAHNUNG_STUFE_2', 'Nachfristsetzung Stufe 2 mit Ersatzvornahmeandrohung erstellt');
        }

        return {
            success: true,
            stufe,
            schreiben,
            html,
            mangel
        };
    },

    generateMangelProtokollPdf(mangelId) {
        const mangel = this.getMangelDetails(mangelId);
        if (!mangel) throw new Error(`Mangel mit ID ${mangelId} nicht gefunden.`);

        const companyInfo = {
            firmenname: this.getEinstellung('firmenname') || 'W-Link ERP',
            iban: this.getEinstellung('iban') || '',
            bic: this.getEinstellung('bic') || '',
            steuer: this.getEinstellung('steuer') || ''
        };

        const html = MaengelPdfBuilder.buildMangelProtokollHtml(mangel, mangel.fotos || [], mangel.historie || [], companyInfo);
        return {
            success: true,
            html,
            mangel
        };
    }
    };

    return repo;
}

module.exports = createKalkulationDatanormMaengelRepo;
