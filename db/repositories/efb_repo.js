/**
 * EFB-Preisblätter Repository
 * Formblätter 221 & 223 (VHB Bund)
 */
const EFBController = require('../../controllers/EFBController');

function createEfbRepo(deps) {
    const { db, appendAuditLog } = deps;

    const repo = {
// --- EFB-Preisblätter 221 & 223 (VHB Bund) ---
    getEfbProfile(projektId) {
        if (!projektId) return EFBController.getDefaultProfile();
        const row = db.prepare('SELECT * FROM efb_profile WHERE projekt_id = ?').get(projektId);
        return row || EFBController.getDefaultProfile();
    },

    saveEfbProfile(profileData) {
        if (!profileData || !profileData.projekt_id) {
            throw new Error('Projekt-ID für EFB-Profil erforderlich.');
        }
        const pId = Number(profileData.projekt_id);
        const existing = db.prepare('SELECT id FROM efb_profile WHERE projekt_id = ?').get(pId);

        const tx = db.transaction(() => {
            if (existing) {
                db.prepare(`
                    UPDATE efb_profile SET
                        name = ?, mittellohn_eur = ?, lohngebundene_kosten_prozent = ?, lohnnebenkosten_prozent = ?,
                        kalkulationslohn_eur = ?, zuschlag_lohn_bgk = ?, zuschlag_lohn_agk = ?, zuschlag_lohn_wug = ?,
                        zuschlag_stoff_bgk = ?, zuschlag_stoff_agk = ?, zuschlag_stoff_wug = ?,
                        zuschlag_geraet_bgk = ?, zuschlag_geraet_agk = ?, zuschlag_geraet_wug = ?,
                        zuschlag_sonst_bgk = ?, zuschlag_sonst_agk = ?, zuschlag_sonst_wug = ?,
                        zuschlag_nu_bgk = ?, zuschlag_nu_agk = ?, zuschlag_nu_wug = ?,
                        wug_gewinn_prozent = ?, wug_betriebswagnis_prozent = ?, wug_leistungswagnis_prozent = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(
                    profileData.name || 'Standard-Zuschlagsprofil',
                    parseFloat(profileData.mittellohn_eur) || 24.50,
                    parseFloat(profileData.lohngebundene_kosten_prozent) || 85.00,
                    parseFloat(profileData.lohnnebenkosten_prozent) || 12.50,
                    parseFloat(profileData.kalkulationslohn_eur) || 48.39,
                    parseFloat(profileData.zuschlag_lohn_bgk) || 18.00,
                    parseFloat(profileData.zuschlag_lohn_agk) || 22.00,
                    parseFloat(profileData.zuschlag_lohn_wug) || 8.80,
                    parseFloat(profileData.zuschlag_stoff_bgk) || 12.00,
                    parseFloat(profileData.zuschlag_stoff_agk) || 14.00,
                    parseFloat(profileData.zuschlag_stoff_wug) || 6.00,
                    parseFloat(profileData.zuschlag_geraet_bgk) || 15.00,
                    parseFloat(profileData.zuschlag_geraet_agk) || 16.00,
                    parseFloat(profileData.zuschlag_geraet_wug) || 6.00,
                    parseFloat(profileData.zuschlag_sonst_bgk) || 10.00,
                    parseFloat(profileData.zuschlag_sonst_agk) || 12.00,
                    parseFloat(profileData.zuschlag_sonst_wug) || 5.00,
                    parseFloat(profileData.zuschlag_nu_bgk) || 8.00,
                    parseFloat(profileData.zuschlag_nu_agk) || 10.00,
                    parseFloat(profileData.zuschlag_nu_wug) || 4.00,
                    parseFloat(profileData.wug_gewinn_prozent) || 5.00,
                    parseFloat(profileData.wug_betriebswagnis_prozent) || 2.00,
                    parseFloat(profileData.wug_leistungswagnis_prozent) || 1.80,
                    existing.id
                );
                appendAuditLog({
                    entityType: 'EFB_PROFIL',
                    entityId: existing.id,
                    action: 'AKTUALISIERT',
                    details: `EFB-Profil für Projekt #${pId} aktualisiert`
                });
                return { success: true, id: existing.id };
            } else {
                const res = db.prepare(`
                    INSERT INTO efb_profile (
                        projekt_id, name, mittellohn_eur, lohngebundene_kosten_prozent, lohnnebenkosten_prozent,
                        kalkulationslohn_eur, zuschlag_lohn_bgk, zuschlag_lohn_agk, zuschlag_lohn_wug,
                        zuschlag_stoff_bgk, zuschlag_stoff_agk, zuschlag_stoff_wug,
                        zuschlag_geraet_bgk, zuschlag_geraet_agk, zuschlag_geraet_wug,
                        zuschlag_sonst_bgk, zuschlag_sonst_agk, zuschlag_sonst_wug,
                        zuschlag_nu_bgk, zuschlag_nu_agk, zuschlag_nu_wug,
                        wug_gewinn_prozent, wug_betriebswagnis_prozent, wug_leistungswagnis_prozent
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    pId,
                    profileData.name || 'Standard-Zuschlagsprofil',
                    parseFloat(profileData.mittellohn_eur) || 24.50,
                    parseFloat(profileData.lohngebundene_kosten_prozent) || 85.00,
                    parseFloat(profileData.lohnnebenkosten_prozent) || 12.50,
                    parseFloat(profileData.kalkulationslohn_eur) || 48.39,
                    parseFloat(profileData.zuschlag_lohn_bgk) || 18.00,
                    parseFloat(profileData.zuschlag_lohn_agk) || 22.00,
                    parseFloat(profileData.zuschlag_lohn_wug) || 8.80,
                    parseFloat(profileData.zuschlag_stoff_bgk) || 12.00,
                    parseFloat(profileData.zuschlag_stoff_agk) || 14.00,
                    parseFloat(profileData.zuschlag_stoff_wug) || 6.00,
                    parseFloat(profileData.zuschlag_geraet_bgk) || 15.00,
                    parseFloat(profileData.zuschlag_geraet_agk) || 16.00,
                    parseFloat(profileData.zuschlag_geraet_wug) || 6.00,
                    parseFloat(profileData.zuschlag_sonst_bgk) || 10.00,
                    parseFloat(profileData.zuschlag_sonst_agk) || 12.00,
                    parseFloat(profileData.zuschlag_sonst_wug) || 5.00,
                    parseFloat(profileData.zuschlag_nu_bgk) || 8.00,
                    parseFloat(profileData.zuschlag_nu_agk) || 10.00,
                    parseFloat(profileData.zuschlag_nu_wug) || 4.00,
                    parseFloat(profileData.wug_gewinn_prozent) || 5.00,
                    parseFloat(profileData.wug_betriebswagnis_prozent) || 2.00,
                    parseFloat(profileData.wug_leistungswagnis_prozent) || 1.80
                );
                appendAuditLog({
                    entityType: 'EFB_PROFIL',
                    entityId: Number(res.lastInsertRowid),
                    action: 'ERSTELLT',
                    details: `EFB-Profil für Projekt #${pId} erstellt`
                });
                return { success: true, id: res.lastInsertRowid };
            }
        });
        return tx();
    },

    getEfbKalkulation(projektId) {
        const pId = Number(projektId);
        const project = db.prepare('SELECT * FROM projekte WHERE id = ?').get(pId) || { id: pId, name: 'Projekt' };
        const profile = this.getEfbProfile(pId);

        // Lade alle Positionen des Projekts
        const positions = db.prepare(`
            SELECT p.*, d.type as dok_type, d.nr as dok_nr
            FROM positionen p
            JOIN dokumente d ON p.dokumentId = d.id
            WHERE d.projektId = ?
            ORDER BY d.id DESC, p.id ASC
        `).all(pId);

        const efb221 = EFBController.calculateEFB221(project, positions, profile);
        const efb223 = EFBController.calculateEFB223(positions, efb221);

        return {
            efb221,
            efb223,
            profile,
            project,
            positions
        };
    }
    };

    return repo;
}

module.exports = createEfbRepo;
