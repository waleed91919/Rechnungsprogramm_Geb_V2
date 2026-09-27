/**
 * Kunden & Artikel Repository
 * Verwaltung von Stammdaten: Artikel und Kunden (inkl. Soft-Delete & Audit)
 */
function createKundenArtikelRepo(deps) {
    const { db, dbQuery, dbRun, appendAuditLog } = deps;

    return {
// --- Artikel ---
    async saveArtikel(artikel) {
        const einheit = artikel.einheit || 'Stk.';
        const herstellerName = artikel.hersteller_name || null;
        const herstellerKontakt = artikel.hersteller_kontakt || null;
        const chargeSeriennummer = artikel.charge_seriennummer || null;
        const euVerantwortlicher = artikel.eu_verantwortlicher || null;
        const warnhinweis = artikel.warnhinweis || null;

        if (artikel.id) {
            await dbRun(
                'UPDATE artikel SET name=?, ean=?, beschreibung=?, ek=?, vk=?, mwst=?, bestand=?, lieferant=?, katalog=?, ist_bauleistung=?, kostenart=?, lohnanteil_prozent=?, einheit=?, hersteller_name=?, hersteller_kontakt=?, charge_seriennummer=?, eu_verantwortlicher=?, warnhinweis=? WHERE id=?',
                [artikel.name, artikel.ean, artikel.beschreibung, artikel.ek, artikel.vk, artikel.mwst, artikel.bestand, artikel.lieferant, artikel.katalog, artikel.ist_bauleistung || 0, artikel.kostenart || 'MATERIAL', artikel.lohnanteil_prozent || 0, einheit, herstellerName, herstellerKontakt, chargeSeriennummer, euVerantwortlicher, warnhinweis, artikel.id]
            );
            return artikel.id;
        } else {
            const res = await dbRun(
                'INSERT INTO artikel (name, ean, beschreibung, ek, vk, mwst, bestand, lieferant, katalog, ist_bauleistung, kostenart, lohnanteil_prozent, einheit, hersteller_name, hersteller_kontakt, charge_seriennummer, eu_verantwortlicher, warnhinweis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [artikel.name, artikel.ean, artikel.beschreibung, artikel.ek, artikel.vk, artikel.mwst, artikel.bestand, artikel.lieferant, artikel.katalog, artikel.ist_bauleistung || 0, artikel.kostenart || 'MATERIAL', artikel.lohnanteil_prozent || 0, einheit, herstellerName, herstellerKontakt, chargeSeriennummer, euVerantwortlicher, warnhinweis]
            );
            return res.id;
        }
    },
    // GOBD-4 Fix: Artikel Soft-Delete mit Referenz-Integrität
    async deleteArtikel(id, grund = 'Benutzer-Löschung') {
        const tx = db.transaction((artId, reason) => {
            const art = db.prepare('SELECT * FROM artikel WHERE id=?').get(artId);
            if (!art) return { success: true };

            // Referenzprüfung: Wird Artikel in Belegen verwendet?
            const posCount = db.prepare('SELECT COUNT(*) as cnt FROM positionen WHERE artikelId=?').get(artId).cnt;
            if (posCount > 0) {
                // Bei Beleg-Referenzen ist physisches Löschen verboten -> Soft-Delete
                db.prepare('UPDATE artikel SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id=?').run(artId);
            } else {
                // Keine Belegreferenzen: Physisches Löschen zulässig
                db.prepare('DELETE FROM artikel WHERE id=?').run(artId);
            }

            appendAuditLog({
                entityType: 'ARTIKEL',
                entityId: artId,
                action: 'GELOESCHT',
                details: { name: art.name, artikelnummer: art.ean || art.id, grund: reason, softDelete: posCount > 0 }
            });
            return { success: true };
        });
        return tx(id, grund);
    },

    // --- Kunden ---
    async saveKunde(kunde) {
        // § 48b: sec48b_valid_until ist fachlich die Gültigkeit der Freistellungsbescheinigung;
        // falls nicht explizit gesetzt, wird sie aus freistellung_gueltig_bis gespiegelt.
        const sec48bValidUntil = kunde.sec48b_valid_until !== undefined ? kunde.sec48b_valid_until : (kunde.freistellung_gueltig_bis || null);
        const cleanIban = String(kunde.iban || '').replace(/[\s-]+/g, '').toUpperCase() || null;
        const cleanBic = String(kunde.bic || '').replace(/[\s-]+/g, '').toUpperCase() || null;
        if (kunde.id) {
            await dbRun(
                'UPDATE kunden SET kundennummer=?, name=?, adresse=?, plz=?, ort=?, telefon=?, email=?, ustId=?, ist_bauleistender_13b=?, ust_1_tg_gueltig_bis=?, hat_freistellungsbescheinigung=?, freistellung_gueltig_bis=?, ist_umsatzsteuerfreie_vermietung=?, customer_type=?, leitweg_id=?, peppol_id=?, buyer_reference=?, tax_number=?, sec48b_status=?, sec48b_certificate_path=?, is_subcontractor=?, sec48b_valid_until=?, iban=?, bic=?, bank_name=?, kontoinhaber=? WHERE id=?',
                [kunde.kundennummer, kunde.name, kunde.adresse, kunde.plz, kunde.ort, kunde.telefon, kunde.email, kunde.ustId, kunde.ist_bauleistender_13b || 0, kunde.ust_1_tg_gueltig_bis, kunde.hat_freistellungsbescheinigung || 0, kunde.freistellung_gueltig_bis, kunde.ist_umsatzsteuerfreie_vermietung || 0, kunde.customer_type || 'B2C', kunde.leitweg_id || null, kunde.peppol_id || null, kunde.buyer_reference || null, kunde.tax_number || null, kunde.sec48b_status || 'NONE', kunde.sec48b_certificate_path || null, kunde.is_subcontractor ? 1 : 0, sec48bValidUntil, cleanIban, cleanBic, kunde.bank_name || null, kunde.kontoinhaber || null, kunde.id]
            );
            return kunde.id;
        } else {
            // Generate sequence if needed
            let knr = kunde.kundennummer;
            if (!knr) {
                const row = await dbQuery('SELECT MAX(id) as mx FROM kunden');
                const nextId = (row && row[0] && row[0].mx) ? row[0].mx + 1 : 1;
                knr = `KD-${1000 + nextId}`;
            }

            const res = await dbRun(
                'INSERT INTO kunden (kundennummer, name, adresse, plz, ort, telefon, email, ustId, ist_bauleistender_13b, ust_1_tg_gueltig_bis, hat_freistellungsbescheinigung, freistellung_gueltig_bis, ist_umsatzsteuerfreie_vermietung, customer_type, leitweg_id, peppol_id, buyer_reference, tax_number, sec48b_status, sec48b_certificate_path, is_subcontractor, sec48b_valid_until, iban, bic, bank_name, kontoinhaber, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                [knr, kunde.name, kunde.adresse, kunde.plz, kunde.ort, kunde.telefon, kunde.email, kunde.ustId, kunde.ist_bauleistender_13b || 0, kunde.ust_1_tg_gueltig_bis, kunde.hat_freistellungsbescheinigung || 0, kunde.freistellung_gueltig_bis, kunde.ist_umsatzsteuerfreie_vermietung || 0, kunde.customer_type || 'B2C', kunde.leitweg_id || null, kunde.peppol_id || null, kunde.buyer_reference || null, kunde.tax_number || null, kunde.sec48b_status || 'NONE', kunde.sec48b_certificate_path || null, kunde.is_subcontractor ? 1 : 0, sec48bValidUntil, cleanIban, cleanBic, kunde.bank_name || null, kunde.kontoinhaber || null]
            );
            return res.id;
        }
    },
    // GOBD-4 Fix: Kunden Soft-Delete mit Referenz-Integrität
    async deleteKunde(id, grund = 'Benutzer-Löschung') {
        const tx = db.transaction((kId, reason) => {
            const kunde = db.prepare('SELECT * FROM kunden WHERE id=?').get(kId);
            if (!kunde) return { success: true };

            // Referenzprüfung: Dokumente, Projekte, Eingangsrechnungen
            const docCount = db.prepare('SELECT COUNT(*) as cnt FROM dokumente WHERE kundeId=?').get(kId).cnt;
            const projCount = db.prepare('SELECT COUNT(*) as cnt FROM projekte WHERE kundeId=?').get(kId).cnt;
            const erCount = db.prepare('SELECT COUNT(*) as cnt FROM eingangsrechnungen WHERE lieferant_id=?').get(kId).cnt;

            if (docCount > 0 || projCount > 0 || erCount > 0) {
                // Kunde hat historische Belege/Projekte -> Soft-Delete
                db.prepare('UPDATE kunden SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id=?').run(kId);
            } else {
                db.prepare('DELETE FROM kunden WHERE id=?').run(kId);
            }

            appendAuditLog({
                entityType: 'KUNDE',
                entityId: kId,
                action: 'GELOESCHT',
                details: { name: kunde.name, kundennummer: kunde.kundennummer, grund: reason, softDelete: (docCount + projCount + erCount) > 0 }
            });
            return { success: true };
        });
        return tx(id, grund);
    },

    // --- Kunden (Bulk Save) ---
    async bulkSaveKunden(kunden) {
        if (!kunden || !Array.isArray(kunden) || kunden.length === 0) return [];

        const bulkTransaction = db.transaction((kundenList) => {
            const updateStmt = db.prepare('UPDATE kunden SET kundennummer=?, name=?, adresse=?, plz=?, ort=?, telefon=?, email=?, ustId=?, ist_bauleistender_13b=?, ust_1_tg_gueltig_bis=?, hat_freistellungsbescheinigung=?, freistellung_gueltig_bis=?, ist_umsatzsteuerfreie_vermietung=?, customer_type=?, leitweg_id=?, peppol_id=?, buyer_reference=?, tax_number=?, sec48b_status=?, sec48b_certificate_path=?, is_subcontractor=?, sec48b_valid_until=?, iban=?, bic=?, bank_name=?, kontoinhaber=? WHERE id=?');
            const insertStmt = db.prepare('INSERT INTO kunden (kundennummer, name, adresse, plz, ort, telefon, email, ustId, ist_bauleistender_13b, ust_1_tg_gueltig_bis, hat_freistellungsbescheinigung, freistellung_gueltig_bis, ist_umsatzsteuerfreie_vermietung, customer_type, leitweg_id, peppol_id, buyer_reference, tax_number, sec48b_status, sec48b_certificate_path, is_subcontractor, sec48b_valid_until, iban, bic, bank_name, kontoinhaber, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');

            const ids = [];
            for (const k of kundenList) {
                const sec48bValidUntil = k.sec48b_valid_until !== undefined ? k.sec48b_valid_until : (k.freistellung_gueltig_bis || null);
                const cleanIban = String(k.iban || '').replace(/[\s-]+/g, '').toUpperCase() || null;
                const cleanBic = String(k.bic || '').replace(/[\s-]+/g, '').toUpperCase() || null;
                if (k.id) {
                    updateStmt.run(k.kundennummer, k.name, k.adresse, k.plz, k.ort, k.telefon, k.email, k.ustId, k.ist_bauleistender_13b || 0, k.ust_1_tg_gueltig_bis, k.hat_freistellungsbescheinigung || 0, k.freistellung_gueltig_bis, k.ist_umsatzsteuerfreie_vermietung || 0, k.customer_type || 'B2C', k.leitweg_id || null, k.peppol_id || null, k.buyer_reference || null, k.tax_number || null, k.sec48b_status || 'NONE', k.sec48b_certificate_path || null, k.is_subcontractor ? 1 : 0, sec48bValidUntil, cleanIban, cleanBic, k.bank_name || null, k.kontoinhaber || null, k.id);
                    ids.push(k.id);
                } else {
                    let knr = k.kundennummer;
                    if (!knr) {
                        const row = db.prepare('SELECT MAX(id) as mx FROM kunden').get();
                        const nextId = (row && row.mx) ? row.mx + 1 : 1;
                        knr = `KD-${1000 + nextId}`;
                    }
                    const res = insertStmt.run(knr, k.name, k.adresse, k.plz, k.ort, k.telefon, k.email, k.ustId, k.ist_bauleistender_13b || 0, k.ust_1_tg_gueltig_bis, k.hat_freistellungsbescheinigung || 0, k.freistellung_gueltig_bis, k.ist_umsatzsteuerfreie_vermietung || 0, k.customer_type || 'B2C', k.leitweg_id || null, k.peppol_id || null, k.buyer_reference || null, k.tax_number || null, k.sec48b_status || 'NONE', k.sec48b_certificate_path || null, k.is_subcontractor ? 1 : 0, sec48bValidUntil, cleanIban, cleanBic, k.bank_name || null, k.kontoinhaber || null);
                    ids.push(res.lastInsertRowid);
                }
            }
            return ids;
        });

        return bulkTransaction(kunden);
    }
    };
}

module.exports = createKundenArtikelRepo;
