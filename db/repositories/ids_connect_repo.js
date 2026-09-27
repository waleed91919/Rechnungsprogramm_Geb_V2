/**
 * IDS Connect & Open Masterdata Repository
 * Großhandel-Schnittstelle (IDS Connect 2.5) & Warenkorb-Import
 */
const IDSConnectController = require('../../controllers/IDSConnectController');
const IDSConnectService = require('../../main/ids-connect-service');

let idsConnectServiceInstance = null;

function createIdsConnectRepo(deps) {
    const { db, appendAuditLog, auditLogger } = deps;

    return {
getIdsConnectService() {
        if (!idsConnectServiceInstance) {
            idsConnectServiceInstance = new IDSConnectService(db, auditLogger);
        }
        return idsConnectServiceInstance;
    },

    getIdsKonten(filter = {}) {
        let sql = 'SELECT * FROM ids_connect_konten';
        const params = [];
        if (filter.search) {
            sql += ' WHERE name LIKE ? OR kundennummer LIKE ? OR grosshaendler_code LIKE ?';
            const s = `%${filter.search}%`;
            params.push(s, s, s);
        }
        sql += ' ORDER BY is_default DESC, name ASC';
        return db.prepare(sql).all(...params);
    },

    getIdsKontoById(id) {
        return db.prepare('SELECT * FROM ids_connect_konten WHERE id = ?').get(id);
    },

    saveIdsKonto(data) {
        const isDefault = data.is_default ? 1 : 0;
        const tx = db.transaction(() => {
            if (isDefault) {
                db.prepare('UPDATE ids_connect_konten SET is_default = 0').run();
            }
            if (data.id) {
                db.prepare(`
                    UPDATE ids_connect_konten SET
                        name = ?, grosshaendler_code = ?, shop_url = ?, rest_api_url = ?,
                        kundennummer = ?, benutzername = ?, passwort_enc = ?, api_key = ?,
                        standard_aufschlag_prozent = ?, is_default = ?
                    WHERE id = ?
                `).run(
                    data.name, data.grosshaendler_code, data.shop_url, data.rest_api_url || null,
                    data.kundennummer, data.benutzername || null, data.passwort_enc || null,
                    data.api_key || null, parseFloat(data.standard_aufschlag_prozent) || 25.0,
                    isDefault, data.id
                );
                appendAuditLog({ action: 'IDS_KONTO_UPDATE', entityType: 'IDS_KONTO', entityId: data.id, details: { name: data.name } });
                return data.id;
            } else {
                const res = db.prepare(`
                    INSERT INTO ids_connect_konten (
                        name, grosshaendler_code, shop_url, rest_api_url,
                        kundennummer, benutzername, passwort_enc, api_key,
                        standard_aufschlag_prozent, is_default
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    data.name, data.grosshaendler_code, data.shop_url, data.rest_api_url || null,
                    data.kundennummer, data.benutzername || null, data.passwort_enc || null,
                    data.api_key || null, parseFloat(data.standard_aufschlag_prozent) || 25.0,
                    isDefault
                );
                appendAuditLog({ action: 'IDS_KONTO_INSERT', entityType: 'IDS_KONTO', entityId: res.lastInsertRowid, details: { name: data.name } });
                return res.lastInsertRowid;
            }
        });
        const id = tx();
        return { success: true, id };
    },

    deleteIdsKonto(id) {
        const row = db.prepare('SELECT name FROM ids_connect_konten WHERE id = ?').get(id);
        db.prepare('DELETE FROM ids_connect_konten WHERE id = ?').run(id);
        appendAuditLog({ action: 'IDS_KONTO_DELETE', entityType: 'IDS_KONTO', entityId: id, details: { name: row ? row.name : null } });
        return { success: true, id };
    },

    getIdsWarenkoerbe(filter = {}) {
        let sql = `
            SELECT w.*, k.name AS konto_name, p.name AS projekt_name, d.nr AS angebot_nr
            FROM ids_warenkoerbe w
            LEFT JOIN ids_connect_konten k ON w.konto_id = k.id
            LEFT JOIN projekte p ON w.projekt_id = p.id
            LEFT JOIN dokumente d ON w.angebot_id = d.id
        `;
        const conditions = [];
        const params = [];
        if (filter.status) {
            conditions.push('w.status = ?');
            params.push(filter.status);
        }
        if (filter.konto_id) {
            conditions.push('w.konto_id = ?');
            params.push(filter.konto_id);
        }
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY w.created_at DESC';
        return db.prepare(sql).all(...params);
    },

    getIdsWarenkorbDetails(id) {
        const row = db.prepare('SELECT * FROM ids_warenkoerbe WHERE id = ?').get(id);
        if (!row) return null;
        try {
            const parsed = IDSConnectController.parseShoppingCartXml(row.cart_xml);
            return { ...row, parsedCart: parsed };
        } catch (err) {
            return { ...row, parsedCart: null, parseError: err.message };
        }
    },

    deleteIdsWarenkorb(id) {
        db.prepare('DELETE FROM ids_warenkoerbe WHERE id = ?').run(id);
        appendAuditLog({ action: 'IDS_WARENKORB_DELETE', entityType: 'IDS_WARENKORB', entityId: id, details: {} });
        return { success: true, id };
    },

    importCartToDocument(cartId, dokumentId, aufschlagProzent = 25.0, replaceExisting = false) {
        const cartRow = db.prepare('SELECT * FROM ids_warenkoerbe WHERE id = ?').get(cartId);
        if (!cartRow) throw new Error(`Warenkorb #${cartId} nicht gefunden.`);
        const doc = db.prepare('SELECT * FROM dokumente WHERE id = ?').get(dokumentId);
        if (!doc) throw new Error(`Dokument #${dokumentId} nicht gefunden.`);
        if (doc.isLocked) throw new Error(`Dokument #${dokumentId} ist gesperrt und kann nicht geändert werden.`);

        const parsed = IDSConnectController.parseShoppingCartXml(cartRow.cart_xml);
        const aufschlag = parseFloat(aufschlagProzent) >= 0 ? parseFloat(aufschlagProzent) : 25.0;

        const tx = db.transaction(() => {
            if (replaceExisting) {
                db.prepare('DELETE FROM positionen WHERE dokumentId = ?').run(dokumentId);
            }

            const insertPosStmt = db.prepare(`
                INSERT INTO positionen (
                    dokumentId, name, menge, einheit, preis, ek, mwst, rabatt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            let insertedCount = 0;
            for (const it of parsed.items) {
                const calc = IDSConnectController.calculateCalculatedPrices(it.netPrice, aufschlag, 19.0);
                const posName = it.shortDescription || it.supplierItemNumber;
                insertPosStmt.run(
                    dokumentId,
                    posName,
                    it.quantity || 1,
                    it.quantityUnit || 'Stk',
                    calc.vkNetto,
                    calc.netEk,
                    19,
                    0
                );
                insertedCount++;
            }

            // Gesamtsummen des Dokuments aktualisieren
            const posRows = db.prepare('SELECT * FROM positionen WHERE dokumentId = ?').all(dokumentId);
            let totalNetto = 0;
            let totalSteuer = 0;
            for (const p of posRows) {
                const lineNetto = (p.preis * p.menge) * (1 - (p.rabatt || 0) / 100);
                totalNetto += lineNetto;
                totalSteuer += lineNetto * ((p.mwst || 19) / 100);
            }
            totalNetto = Math.round(totalNetto * 100) / 100;
            totalSteuer = Math.round(totalSteuer * 100) / 100;
            const totalBrutto = Math.round((totalNetto + totalSteuer) * 100) / 100;

            db.prepare(`
                UPDATE dokumente SET netto = ?, steuer = ?, brutto = ? WHERE id = ?
            `).run(totalNetto, totalSteuer, totalBrutto, dokumentId);

            appendAuditLog({
                action: 'IDS_CART_IMPORTED_TO_DOC',
                entityType: 'DOCUMENT',
                entityId: dokumentId,
                details: {
                    cartId,
                    insertedCount,
                    totalNetto,
                    totalBrutto
                }
            });

            return { insertedCount, totalNetto, totalBrutto };
        });

        const res = tx();
        return { success: true, ...res };
    }
    };
}

module.exports = createIdsConnectRepo;
