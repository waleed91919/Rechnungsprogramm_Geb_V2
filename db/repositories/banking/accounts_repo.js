const SepaController = require('../../../controllers/SepaController');

module.exports = function(deps) {
    const { db, dbQuery, dbRun, appendAuditLog, getDocumentWithChildren } = deps;

    return {
getBankKonten() {
        return db.prepare('SELECT * FROM bank_konten ORDER BY ist_standard DESC, id ASC').all();
    },

saveBankKonto(konto) {
        if (!konto || !konto.kontoname || !konto.iban) {
            throw new Error('Kontoname und IBAN sind Pflichtfelder.');
        }
        const cleanIban = String(konto.iban).replace(/[\s-]+/g, '').toUpperCase();
        const cleanBic = String(konto.bic || '').replace(/[\s-]+/g, '').toUpperCase();
        if (!SepaController.validateIban(cleanIban)) {
            throw new Error(`Ungültige IBAN: ${konto.iban}`);
        }

        const tx = db.transaction(() => {
            if (konto.ist_standard) {
                db.prepare('UPDATE bank_konten SET ist_standard = 0').run();
            }

            let kontoId = konto.id;
            if (kontoId) {
                db.prepare(`
                    UPDATE bank_konten
                    SET kontoname = ?, bankname = ?, iban = ?, bic = ?, kontoinhaber = ?,
                        glaeubiger_id = ?, waehrung = ?, aktueller_saldo = ?, saldo_datum = ?,
                        ist_standard = ?, aktiv = ?
                    WHERE id = ?
                `).run(
                    konto.kontoname.trim(),
                    (konto.bankname || '').trim(),
                    cleanIban,
                    cleanBic,
                    (konto.kontoinhaber || '').trim(),
                    (konto.glaeubiger_id || '').trim(),
                    konto.waehrung || 'EUR',
                    parseFloat(konto.aktueller_saldo) || 0.0,
                    konto.saldo_datum || null,
                    konto.ist_standard ? 1 : 0,
                    konto.aktiv !== undefined ? (konto.aktiv ? 1 : 0) : 1,
                    kontoId
                );
                appendAuditLog({ entityType: 'BANK_KONTO', entityId: Number(kontoId), action: 'AKTUALISIERT', details: { kontoname: konto.kontoname, iban: cleanIban } });
            } else {
                const info = db.prepare(`
                    INSERT INTO bank_konten (
                        kontoname, bankname, iban, bic, kontoinhaber, glaeubiger_id,
                        waehrung, aktueller_saldo, saldo_datum, ist_standard, aktiv
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    konto.kontoname.trim(),
                    (konto.bankname || '').trim(),
                    cleanIban,
                    cleanBic,
                    (konto.kontoinhaber || '').trim(),
                    (konto.glaeubiger_id || '').trim(),
                    konto.waehrung || 'EUR',
                    parseFloat(konto.aktueller_saldo) || 0.0,
                    konto.saldo_datum || null,
                    konto.ist_standard ? 1 : 0,
                    konto.aktiv !== undefined ? (konto.aktiv ? 1 : 0) : 1
                );
                kontoId = info.lastInsertRowid;
                appendAuditLog({ entityType: 'BANK_KONTO', entityId: Number(kontoId), action: 'ERSTELLT', details: { kontoname: konto.kontoname, iban: cleanIban } });
            }

            return db.prepare('SELECT * FROM bank_konten WHERE id = ?').get(kontoId);
        });

        return tx();
    },

deleteBankKonto(id) {
        const txCount = db.prepare('SELECT COUNT(*) as cnt FROM bank_transaktionen WHERE bank_konto_id = ?').get(id).cnt;
        if (txCount > 0) {
            db.prepare('UPDATE bank_konten SET aktiv = 0 WHERE id = ?').run(id);
            appendAuditLog({ entityType: 'BANK_KONTO', entityId: Number(id), action: 'DEAKTIVIERT', details: 'Konto deaktiviert, da Transaktionen existieren.' });
        } else {
            db.prepare('DELETE FROM bank_konten WHERE id = ?').run(id);
            appendAuditLog({ entityType: 'BANK_KONTO', entityId: Number(id), action: 'GELOESCHT', details: 'Bankkonto gelöscht.' });
        }
        return { success: true };
    }
    };
};
