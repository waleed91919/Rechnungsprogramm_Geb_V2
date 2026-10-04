/**
 * projects_schema.js
 */

function createSchema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS projekte (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            kundeId INTEGER,
            start TEXT,
            ende TEXT,
            budget REAL DEFAULT 0,
            status TEXT,
            source_angebot_id INTEGER,
            source_angebot_version INTEGER,
            archived_source_angebot_id INTEGER,
            archived_source_angebot_version INTEGER,
            archived_source_note TEXT,
            archived_source_at TEXT,
            FOREIGN KEY(source_angebot_id) REFERENCES dokumente(id)
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS projekt_source_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projekt_id INTEGER NOT NULL REFERENCES projekte(id) ON DELETE CASCADE,
            original_angebot_id INTEGER,
            original_angebot_version INTEGER,
            reason TEXT NOT NULL,
            migrated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS projekt_positionen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projekt_id INTEGER NOT NULL REFERENCES projekte(id) ON DELETE CASCADE,
            source_angebot_id INTEGER REFERENCES dokumente(id),
            source_angebot_version INTEGER,
            source_angebot_pos_id INTEGER REFERENCES positionen(id),
            oz_code TEXT,
            titel TEXT,
            name TEXT NOT NULL,
            menge REAL DEFAULT 1,
            einheit TEXT DEFAULT 'Stk.',
            preis REAL DEFAULT 0,
            cost_type TEXT DEFAULT 'MATERIAL',
            positionstyp TEXT DEFAULT 'NORMAL',
            in_endsumme_enthalten INTEGER DEFAULT 1,
            zeitansatz_h REAL DEFAULT 0.0,
            lohn_ep REAL DEFAULT 0.0,
            stoff_ep REAL DEFAULT 0.0,
            geraet_ep REAL DEFAULT 0.0,
            sonst_ep REAL DEFAULT 0.0,
            ekt_stoff_je_me REAL DEFAULT 0.0,
            ekt_geraet_je_me REAL DEFAULT 0.0,
            ekt_sonst_je_me REAL DEFAULT 0.0,
            ekt_nu_je_me REAL DEFAULT 0.0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS efb_profile (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projekt_id INTEGER REFERENCES projekte(id) ON DELETE CASCADE,
            name TEXT NOT NULL DEFAULT 'Standard-Zuschlagsprofil',
            mittellohn_eur REAL NOT NULL DEFAULT 24.50,
            lohngebundene_kosten_prozent REAL NOT NULL DEFAULT 85.00,
            lohnnebenkosten_prozent REAL NOT NULL DEFAULT 12.50,
            kalkulationslohn_eur REAL NOT NULL DEFAULT 48.39,
            zuschlag_lohn_bgk REAL NOT NULL DEFAULT 18.00,
            zuschlag_lohn_agk REAL NOT NULL DEFAULT 22.00,
            zuschlag_lohn_wug REAL NOT NULL DEFAULT 8.80,
            zuschlag_stoff_bgk REAL NOT NULL DEFAULT 12.00,
            zuschlag_stoff_agk REAL NOT NULL DEFAULT 14.00,
            zuschlag_stoff_wug REAL NOT NULL DEFAULT 6.00,
            zuschlag_geraet_bgk REAL NOT NULL DEFAULT 15.00,
            zuschlag_geraet_agk REAL NOT NULL DEFAULT 16.00,
            zuschlag_geraet_wug REAL NOT NULL DEFAULT 6.00,
            zuschlag_sonst_bgk REAL NOT NULL DEFAULT 10.00,
            zuschlag_sonst_agk REAL NOT NULL DEFAULT 12.00,
            zuschlag_sonst_wug REAL NOT NULL DEFAULT 5.00,
            zuschlag_nu_bgk REAL NOT NULL DEFAULT 8.00,
            zuschlag_nu_agk REAL NOT NULL DEFAULT 10.00,
            zuschlag_nu_wug REAL NOT NULL DEFAULT 4.00,
            wug_gewinn_prozent REAL NOT NULL DEFAULT 5.00,
            wug_betriebswagnis_prozent REAL NOT NULL DEFAULT 2.00,
            wug_leistungswagnis_prozent REAL NOT NULL DEFAULT 1.80,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS zuschlagskalkulation_stamm (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            ist_standard INTEGER DEFAULT 0 CHECK(ist_standard IN (0, 1)),
            mittellohn_eur REAL NOT NULL DEFAULT 26.00,
            lohngebundene_kosten_prozent REAL NOT NULL DEFAULT 84.50,
            lohnnebenkosten_prozent REAL NOT NULL DEFAULT 13.50,
            kalkulationslohn_eur REAL NOT NULL DEFAULT 51.48,
            kalkulationsverfahren TEXT NOT NULL DEFAULT 'ZUSCHLAGSKALKULATION' CHECK(kalkulationsverfahren IN ('ZUSCHLAGSKALKULATION', 'ENDSUMMENKALKULATION')),
            endsumme_umlage_basis TEXT NOT NULL DEFAULT 'HERSTELLKOSTEN' CHECK(endsumme_umlage_basis IN ('HERSTELLKOSTEN', 'LOHNSTUNDEN')),
            zuschlag_lohn_bgk REAL NOT NULL DEFAULT 18.00,
            zuschlag_lohn_agk REAL NOT NULL DEFAULT 22.00,
            zuschlag_lohn_wug REAL NOT NULL DEFAULT 8.00,
            zuschlag_stoff_bgk REAL NOT NULL DEFAULT 12.00,
            zuschlag_stoff_agk REAL NOT NULL DEFAULT 14.00,
            zuschlag_stoff_wug REAL NOT NULL DEFAULT 6.00,
            zuschlag_geraet_bgk REAL NOT NULL DEFAULT 15.00,
            zuschlag_geraet_agk REAL NOT NULL DEFAULT 16.00,
            zuschlag_geraet_wug REAL NOT NULL DEFAULT 6.00,
            zuschlag_sonst_bgk REAL NOT NULL DEFAULT 10.00,
            zuschlag_sonst_agk REAL NOT NULL DEFAULT 12.00,
            zuschlag_sonst_wug REAL NOT NULL DEFAULT 5.00,
            zuschlag_nu_bgk REAL NOT NULL DEFAULT 8.00,
            zuschlag_nu_agk REAL NOT NULL DEFAULT 10.00,
            zuschlag_nu_wug REAL NOT NULL DEFAULT 4.00,
            wug_gewinn_prozent REAL NOT NULL DEFAULT 5.00,
            wug_betriebswagnis_prozent REAL NOT NULL DEFAULT 2.00,
            wug_leistungswagnis_prozent REAL NOT NULL DEFAULT 1.00,
            skonto_abzug_kalkulation_prozent REAL NOT NULL DEFAULT 0.00,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    db.exec(`CREATE TABLE IF NOT EXISTS zuschlagskalkulation_projekte (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projekt_id INTEGER NOT NULL UNIQUE REFERENCES projekte(id) ON DELETE CASCADE,
            stamm_profil_id INTEGER REFERENCES zuschlagskalkulation_stamm(id) ON DELETE SET NULL,
            mittellohn_eur REAL NOT NULL DEFAULT 26.00,
            lohngebundene_kosten_prozent REAL NOT NULL DEFAULT 84.50,
            lohnnebenkosten_prozent REAL NOT NULL DEFAULT 13.50,
            kalkulationslohn_eur REAL NOT NULL DEFAULT 51.48,
            kalkulationsverfahren TEXT NOT NULL DEFAULT 'ZUSCHLAGSKALKULATION' CHECK(kalkulationsverfahren IN ('ZUSCHLAGSKALKULATION', 'ENDSUMMENKALKULATION')),
            endsumme_umlage_basis TEXT NOT NULL DEFAULT 'HERSTELLKOSTEN' CHECK(endsumme_umlage_basis IN ('HERSTELLKOSTEN', 'LOHNSTUNDEN')),
            zuschlag_lohn_bgk REAL NOT NULL DEFAULT 18.00,
            zuschlag_lohn_agk REAL NOT NULL DEFAULT 22.00,
            zuschlag_lohn_wug REAL NOT NULL DEFAULT 8.00,
            zuschlag_stoff_bgk REAL NOT NULL DEFAULT 12.00,
            zuschlag_stoff_agk REAL NOT NULL DEFAULT 14.00,
            zuschlag_stoff_wug REAL NOT NULL DEFAULT 6.00,
            zuschlag_geraet_bgk REAL NOT NULL DEFAULT 15.00,
            zuschlag_geraet_agk REAL NOT NULL DEFAULT 16.00,
            zuschlag_geraet_wug REAL NOT NULL DEFAULT 6.00,
            zuschlag_sonst_bgk REAL NOT NULL DEFAULT 10.00,
            zuschlag_sonst_agk REAL NOT NULL DEFAULT 12.00,
            zuschlag_sonst_wug REAL NOT NULL DEFAULT 5.00,
            zuschlag_nu_bgk REAL NOT NULL DEFAULT 8.00,
            zuschlag_nu_agk REAL NOT NULL DEFAULT 10.00,
            zuschlag_nu_wug REAL NOT NULL DEFAULT 4.00,
            wug_gewinn_prozent REAL NOT NULL DEFAULT 5.00,
            wug_betriebswagnis_prozent REAL NOT NULL DEFAULT 2.00,
            wug_leistungswagnis_prozent REAL NOT NULL DEFAULT 1.00,
            skonto_abzug_kalkulation_prozent REAL NOT NULL DEFAULT 0.00,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

}

module.exports = {
    createSchema
};
