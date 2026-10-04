const BankingController = require('../../../controllers/BankingController');
const { calculateDocumentContentHash } = require('../../../main/audit.js');

module.exports = function(deps) {
    const { db, dbQuery, dbRun, appendAuditLog, getDocumentWithChildren } = deps;

    return {
importBankTransactions(kontoId, transactions, meta = {}) {
        if (!kontoId || !Array.isArray(transactions)) {
            throw new Error('Ungültige Transaktionsdaten.');
        }
        const konto = db.prepare('SELECT * FROM bank_konten WHERE id = ?').get(kontoId);
        if (!konto) throw new Error(`Bankkonto #${kontoId} nicht gefunden.`);

        const tx = db.transaction(() => {
            let inserted = 0;
            let duplicates = 0;

            const insertStmt = db.prepare(`
                INSERT INTO bank_transaktionen (
                    bank_konto_id, buchungstag, valuta, betrag, waehrung,
                    partner_name, partner_iban, partner_bic, buchungstext,
                    verwendungszweck, transaktions_code, gv_code, primanota,
                    dedup_hash, status, import_datei, import_format
                ) VALUES (
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, 'OFFEN', ?, ?
                )
            `);

            const existsPrimanotaStmt = db.prepare('SELECT id FROM bank_transaktionen WHERE bank_konto_id = ? AND primanota = ?');

            for (const t of transactions) {
                const primanotaKey = String(t.primanota || '').trim();
                if (primanotaKey) {
                    const exists = existsPrimanotaStmt.get(kontoId, primanotaKey);
                    if (exists) { duplicates++; continue; }
                }

                const hash = t.dedupHash || BankingController.calculateTransactionHash({
                    iban: konto.iban,
                    buchungstag: t.buchungstag,
                    betrag: t.betrag,
                    verwendungszweck: t.verwendungszweck,
                    partnerIban: t.partnerIban,
                    primanota: t.primanota
                });

                try {
                    insertStmt.run(
                        kontoId,
                        t.buchungstag,
                        t.valuta || t.buchungstag,
                        Math.round((parseFloat(t.betrag) || 0) * 100) / 100,
                        t.waehrung || 'EUR',
                        t.partnerName || '',
                        t.partnerIban || '',
                        t.partnerBic || '',
                        t.buchungstext || '',
                        t.verwendungszweck || '',
                        t.transaktionsCode || '',
                        t.gvCode || '',
                        t.primanota || '',
                        hash,
                        meta.filename || 'manuell',
                        t.importFormat || meta.format || 'CSV_GENERIC'
                    );
                    inserted++;
                } catch (err) {
                    if (err.message && err.message.includes('UNIQUE constraint failed')) {
                        duplicates++;
                    } else {
                        throw err;
                    }
                }
            }

            if (meta.closingBalance !== undefined && meta.closingBalance !== null) {
                db.prepare('UPDATE bank_konten SET aktueller_saldo = ?, saldo_datum = ? WHERE id = ?').run(
                    parseFloat(meta.closingBalance),
                    meta.saldoDatum || new Date().toISOString().substring(0, 10),
                    kontoId
                );
            }

            appendAuditLog({
                entityType: 'BANK_IMPORT',
                entityId: Number(kontoId),
                action: 'IMPORTIERT',
                details: {
                    datei: meta.filename,
                    total: transactions.length,
                    neu: inserted,
                    duplikate: duplicates
                }
            });

            return { total: transactions.length, inserted, duplicates, kontoId };
        });

        return tx();
    },

getBankTransaktionen(filter = {}) {
        let sql = `
            SELECT bt.*, bk.kontoname, bk.iban as konto_iban
            FROM bank_transaktionen bt
            JOIN bank_konten bk ON bt.bank_konto_id = bk.id
            WHERE 1=1
        `;
        const params = [];

        if (filter.bank_konto_id) {
            sql += ' AND bt.bank_konto_id = ?';
            params.push(filter.bank_konto_id);
        }
        if (filter.status) {
            sql += ' AND bt.status = ?';
            params.push(filter.status);
        }
        if (filter.datum_von) {
            sql += ' AND bt.buchungstag >= ?';
            params.push(filter.datum_von);
        }
        if (filter.datum_bis) {
            sql += ' AND bt.buchungstag <= ?';
            params.push(filter.datum_bis);
        }
        if (filter.search) {
            sql += ' AND (bt.verwendungszweck LIKE ? OR bt.partner_name LIKE ? OR bt.partner_iban LIKE ?)';
            const s = `%${filter.search}%`;
            params.push(s, s, s);
        }

        sql += ' ORDER BY bt.buchungstag DESC, bt.id DESC';

        const rows = db.prepare(sql).all(...params);
        const zuordnungStmt = db.prepare(`
            SELECT zz.*, d.nr as dokument_nr, d.datum as dokument_datum, er.rechnungs_nr as eingangsrechnung_nr
            FROM zahlung_zuordnungen zz
            LEFT JOIN dokumente d ON zz.dokument_id = d.id
            LEFT JOIN eingangsrechnungen er ON zz.eingangsrechnung_id = er.id
            WHERE zz.transaktion_id = ? AND zz.storno_flag = 0
        `);

        for (const r of rows) {
            r.zuordnungen = zuordnungStmt.all(r.id);
        }

        return rows;
    }
    };
};
