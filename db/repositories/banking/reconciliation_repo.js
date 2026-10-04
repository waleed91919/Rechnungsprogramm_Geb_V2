const BankingController = require('../../../controllers/BankingController');
const { calculateDocumentContentHash } = require('../../../main/audit.js');

module.exports = function(deps) {
    const { db, dbQuery, dbRun, appendAuditLog, getDocumentWithChildren } = deps;

    return {
runOposMatching(kontoId = null) {
        let txSql = `SELECT * FROM bank_transaktionen WHERE status IN ('OFFEN', 'TEILWEISE_ZUGEORDNET')`;
        const txParams = [];
        if (kontoId) {
            txSql += ' AND bank_konto_id = ?';
            txParams.push(kontoId);
        }
        txSql += ' ORDER BY buchungstag ASC';
        const transaktionen = db.prepare(txSql).all(...txParams);

        const offeneRechnungen = db.prepare(`
            SELECT d.*, k.name as kunden_name, k.iban as kunden_iban, k.kundennummer
            FROM dokumente d
            LEFT JOIN kunden k ON d.kundeId = k.id
            WHERE d.type = 'rechnung' AND d.status NOT IN ('Bezahlt', 'Storniert')
            ORDER BY d.datum ASC
        `).all();

        const eingangsrechnungen = db.prepare(`
            SELECT er.*, k.name as lieferant_name, k.iban as lieferant_iban
            FROM eingangsrechnungen er
            LEFT JOIN kunden k ON er.lieferant_id = k.id
            WHERE er.zahlungs_status != 'BEZAHLT'
            ORDER BY er.rechnungs_datum ASC
        `).all();

        const tolRow = db.prepare('SELECT value FROM einstellungen WHERE key = ?').get('matching_auto_skonto_toleranz_tage');
        const skontoToleranzTage = tolRow ? parseInt(tolRow.value, 10) : 2;

        const matches = BankingController.matchTransactionsAgainstOpos({
            transaktionen,
            offeneRechnungen,
            eingangsrechnungen,
            skontoToleranzTage
        });

        return {
            matches,
            offeneTransaktionenCount: transaktionen.length,
            offeneRechnungenCount: offeneRechnungen.length
        };
    },

applyPaymentMatching(matches = [], options = {}) {
        if (!Array.isArray(matches) || matches.length === 0) {
            return { success: true, count: 0 };
        }

        const tx = db.transaction(() => {
            let applied = 0;

            for (const m of matches) {
                const txRow = db.prepare('SELECT * FROM bank_transaktionen WHERE id = ?').get(m.transaktionId);
                if (!txRow) continue;

                const matchBetrag = Math.round((parseFloat(m.betrag) || 0) * 100) / 100;
                const skontoAbzug = Math.round((parseFloat(m.skontoAbzug) || 0) * 100) / 100;
                const diffGrund = m.differenzGrund || (skontoAbzug > 0 ? 'SKONTO' : null);

                db.prepare(`
                    INSERT INTO zahlung_zuordnungen (
                        transaktion_id, dokument_id, eingangsrechnung_id,
                        betrag, skonto_abzug, differenz_grund, benutzer_notiz
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                    m.transaktionId,
                    m.dokumentId || null,
                    m.eingangsrechnungId || null,
                    matchBetrag,
                    skontoAbzug,
                    diffGrund,
                    m.benutzerNotiz || null
                );

                const newZugeordnet = Math.round(((txRow.zugeordneter_betrag || 0) + matchBetrag) * 100) / 100;
                const txAbs = Math.round(Math.abs(txRow.betrag) * 100) / 100;
                const txStatus = newZugeordnet >= txAbs - 0.009 ? 'ZUGEORDNET' : 'TEILWEISE_ZUGEORDNET';

                db.prepare('UPDATE bank_transaktionen SET zugeordneter_betrag = ?, status = ? WHERE id = ?').run(
                    newZugeordnet,
                    txStatus,
                    txRow.id
                );

                if (m.dokumentId) {
                    const doc = getDocumentWithChildren(m.dokumentId);
                    if (doc) {
                        const altBezahlt = Math.round((parseFloat(doc.bezahlt_betrag) || 0) * 100) / 100;
                        const neuBezahlt = Math.round((altBezahlt + matchBetrag) * 100) / 100;
                        const docBrutto = Math.round((parseFloat(doc.brutto) || 0) * 100) / 100;
                        const totalErledigt = Math.round((neuBezahlt + skontoAbzug) * 100) / 100;
                        const neuOffen = Math.max(0, Math.round((docBrutto - totalErledigt) * 100) / 100);

                        const isFull = neuOffen <= 0.009;
                        const newStatus = isFull ? 'Bezahlt' : 'Teilweise bezahlt';
                        const wasLockedVorZahlung = doc.isLocked ? 1 : 0;
                        const newLocked = isFull ? 1 : (doc.isLocked ? 1 : 0);
                        const newMahnung = isFull ? 0 : doc.mahnungLevel;

                        doc.bezahlt_betrag = neuBezahlt;
                        doc.offener_betrag = neuOffen;
                        doc.status = newStatus;
                        doc.isLocked = newLocked;
                        doc.mahnungLevel = newMahnung;
                        doc.sha256_hash = calculateDocumentContentHash(doc);

                        db.prepare(`
                            UPDATE dokumente
                            SET bezahlt_betrag = ?, offener_betrag = ?, status = ?,
                                isLocked = ?, mahnungLevel = ?, was_locked_vor_zahlung = ?, sha256_hash = ?
                            WHERE id = ?
                        `).run(neuBezahlt, neuOffen, newStatus, newLocked, newMahnung, wasLockedVorZahlung, doc.sha256_hash, doc.id);

                        appendAuditLog({
                            entityType: 'DOKUMENT',
                            entityId: Number(doc.id),
                            action: 'ZAHLUNGSEINGANG',
                            details: {
                                transaktionId: txRow.id,
                                buchungstag: txRow.buchungstag,
                                zahlbetrag: matchBetrag,
                                skontoAbzug,
                                status: newStatus
                            }
                        });
                    }
                }

                if (m.eingangsrechnungId) {
                    const er = db.prepare('SELECT * FROM eingangsrechnungen WHERE id = ?').get(m.eingangsrechnungId);
                    if (er) {
                        db.prepare(`
                            UPDATE eingangsrechnungen
                            SET zahlungs_status = 'BEZAHLT', bezahlt_am = ?
                            WHERE id = ?
                        `).run(txRow.buchungstag, er.id);

                        appendAuditLog({
                            entityType: 'EINGANGSRECHNUNG',
                            entityId: Number(er.id),
                            action: 'BEZAHLT',
                            details: {
                                transaktionId: txRow.id,
                                betrag: matchBetrag
                            }
                        });
                    }
                }

                applied++;
            }

            return { success: true, count: applied };
        });

        return tx();
    },

unmatchTransaction(zuordnungId, grund = '') {
        const zuordnung = db.prepare('SELECT * FROM zahlung_zuordnungen WHERE id = ? AND storno_flag = 0').get(zuordnungId);
        if (!zuordnung) throw new Error(`Zuordnung #${zuordnungId} nicht gefunden oder bereits storniert.`);

        const tx = db.transaction(() => {
            if (zuordnung.dokument_id) {
                const doc = getDocumentWithChildren(zuordnung.dokument_id);
                if (doc) {
                    const altBezahlt = Math.round((parseFloat(doc.bezahlt_betrag) || 0) * 100) / 100;
                    const neuBezahlt = Math.max(0, Math.round((altBezahlt - zuordnung.betrag) * 100) / 100);
                    const docBrutto = Math.round((parseFloat(doc.brutto) || 0) * 100) / 100;
                    const neuOffen = Math.round((docBrutto - neuBezahlt) * 100) / 100;

                    const newStatus = neuBezahlt <= 0.009 ? 'Ausstehend' : 'Teilweise bezahlt';
                    const newLocked = (doc.was_locked_vor_zahlung !== undefined && doc.was_locked_vor_zahlung !== null)
                        ? (doc.was_locked_vor_zahlung ? 1 : 0)
                        : 0;

                    doc.bezahlt_betrag = neuBezahlt;
                    doc.offener_betrag = neuOffen;
                    doc.status = newStatus;
                    doc.isLocked = newLocked;
                    doc.sha256_hash = calculateDocumentContentHash(doc);

                    db.prepare(`
                        UPDATE dokumente
                        SET bezahlt_betrag = ?, offener_betrag = ?, status = ?,
                            isLocked = ?, sha256_hash = ?
                        WHERE id = ?
                    `).run(neuBezahlt, neuOffen, newStatus, newLocked, doc.sha256_hash, doc.id);

                    appendAuditLog({
                        entityType: 'DOKUMENT',
                        entityId: Number(doc.id),
                        action: 'ZAHLUNG_ENTKOPPELT',
                        details: {
                            zuordnungId,
                            betrag: zuordnung.betrag,
                            grund: grund || 'Manuelle Entkopplung'
                        }
                    });
                }
            }

            if (zuordnung.eingangsrechnung_id) {
                db.prepare(`
                    UPDATE eingangsrechnungen
                    SET zahlungs_status = 'OFFEN', bezahlt_am = NULL
                    WHERE id = ?
                `).run(zuordnung.eingangsrechnung_id);

                appendAuditLog({
                    entityType: 'EINGANGSRECHNUNG',
                    entityId: Number(zuordnung.eingangsrechnung_id),
                    action: 'ZAHLUNG_ENTKOPPELT',
                    details: {
                        zuordnungId,
                        grund: grund || 'Manuelle Entkopplung'
                    }
                });
            }

            const txRow = db.prepare('SELECT * FROM bank_transaktionen WHERE id = ?').get(zuordnung.transaktion_id);
            if (txRow) {
                const neuZugeordnet = Math.max(0, Math.round(((txRow.zugeordneter_betrag || 0) - zuordnung.betrag) * 100) / 100);
                const txStatus = neuZugeordnet <= 0.009 ? 'OFFEN' : 'TEILWEISE_ZUGEORDNET';
                db.prepare('UPDATE bank_transaktionen SET zugeordneter_betrag = ?, status = ? WHERE id = ?').run(
                    neuZugeordnet,
                    txStatus,
                    txRow.id
                );
            }

            db.prepare('UPDATE zahlung_zuordnungen SET storno_flag = 1, storniert_am = CURRENT_TIMESTAMP, storno_grund = ? WHERE id = ?').run(grund || 'Manuelle Entkopplung', zuordnungId);

            return { success: true };
        });

        return tx();
    }
    };
};
