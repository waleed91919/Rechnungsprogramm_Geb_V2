const BankingController = require('../../../controllers/BankingController');
const { calculateDocumentContentHash } = require('../../../main/audit.js');
const Money = require('../../../js/money');

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
                if (!m.transaktionId && m.differenzGrund === 'MANUELL_BEZAHLT') {
                    if (m.dokumentId) {
                        const doc = getDocumentWithChildren(m.dokumentId);
                        if (doc) {
                            const newStatus = 'Bezahlt';
                            const newLocked = 1;
                            const newMahnung = 0;
                            const wasLockedVorZahlung = doc.isLocked ? 1 : 0;
                            
                            doc.status = newStatus;
                            doc.isLocked = newLocked;
                            doc.mahnungLevel = newMahnung;
                            
                            db.prepare(`
                                UPDATE dokumente
                                SET status = ?, isLocked = ?, mahnungLevel = ?, was_locked_vor_zahlung = ?
                                WHERE id = ?
                            `).run(newStatus, newLocked, newMahnung, wasLockedVorZahlung, doc.id);
                            
                            appendAuditLog({
                                entityType: 'DOKUMENT',
                                entityId: Number(doc.id),
                                action: 'MANUELL_BEZAHLT',
                                details: {
                                    betrag: m.betrag || 0,
                                    grund: m.benutzerNotiz || '0-Balance Manuell Bezahlt'
                                }
                            });
                            applied++;
                        }
                    }
                    continue;
                }

                const txRow = db.prepare('SELECT * FROM bank_transaktionen WHERE id = ?').get(m.transaktionId);
                if (!txRow) continue;

                const matchBetrag = Money.round2(parseFloat(m.betrag) || 0);
                const skontoAbzug = Money.round2(parseFloat(m.skontoAbzug) || 0);
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

                const newZugeordnet = Money.round2((txRow.zugeordneter_betrag || 0) + matchBetrag);
                const txAbs = Money.round2(Math.abs(txRow.betrag));
                const txStatus = newZugeordnet >= txAbs - 0.009 ? 'ZUGEORDNET' : 'TEILWEISE_ZUGEORDNET';

                db.prepare('UPDATE bank_transaktionen SET zugeordneter_betrag = ?, status = ? WHERE id = ?').run(
                    newZugeordnet,
                    txStatus,
                    txRow.id
                );

                if (m.dokumentId) {
                    const doc = getDocumentWithChildren(m.dokumentId);
                    if (doc) {
                        const altBezahlt = Money.round2(parseFloat(doc.bezahlt_betrag) || 0);
                        const neuBezahlt = Money.round2(altBezahlt + matchBetrag);
                        // VOB/B § 17: fällig ist der Zahlbetrag (abzgl. Einbehalt), nicht das Brutto.
                        const _zb = parseFloat(doc.zahlbetrag);
                        const docSoll = (Number.isFinite(_zb) && _zb > 0)
                            ? Money.round2(_zb)
                            : Money.round2(parseFloat(doc.brutto) || 0);
                        const totalErledigt = Money.round2(neuBezahlt + skontoAbzug);
                        const neuOffen = Math.max(0, Money.round2(docSoll - totalErledigt));

                        const isKuerzung = (diffGrund === 'ARCHITEKTEN_KUERZUNG_KUMULIERT');
                        const isFull = isKuerzung || (neuOffen <= 0.009);
                        const newStatus = isFull ? 'Bezahlt' : 'Teilweise bezahlt';
                        const wasLockedVorZahlung = doc.isLocked ? 1 : 0;
                        const newLocked = isFull ? 1 : (doc.isLocked ? 1 : 0);
                        const newMahnung = isFull ? 0 : doc.mahnungLevel;
                        const finalOffen = isKuerzung ? 0 : neuOffen;

                        let geprueftNetto = (doc.geprueft_netto !== undefined && doc.geprueft_netto !== null) ? doc.geprueft_netto : null;
                        let kuerzungGrund = doc.kuerzung_grund || null;

                        if (isKuerzung) {
                            kuerzungGrund = 'ARCHITEKTEN_KUERZUNG_KUMULIERT';
                            const docNet = parseFloat(doc.netto) || 0;
                            if (m.geprueftNetto !== undefined && m.geprueftNetto !== null && parseFloat(m.geprueftNetto) > 0) {
                                geprueftNetto = Money.round2(parseFloat(m.geprueftNetto));
                            } else if (docSoll > 0 && docNet > 0) {
                                geprueftNetto = Money.round2(neuBezahlt * (docNet / docSoll));
                            } else {
                                geprueftNetto = Money.round2(neuBezahlt);
                            }
                        }

                        doc.bezahlt_betrag = neuBezahlt;
                        doc.offener_betrag = finalOffen;
                        doc.status = newStatus;
                        doc.isLocked = newLocked;
                        doc.mahnungLevel = newMahnung;
                        doc.geprueft_netto = geprueftNetto;
                        doc.kuerzung_grund = kuerzungGrund;
                        doc.sha256_hash = calculateDocumentContentHash(doc);

                        db.prepare(`
                            UPDATE dokumente
                            SET bezahlt_betrag = ?, offener_betrag = ?, status = ?,
                                isLocked = ?, mahnungLevel = ?, was_locked_vor_zahlung = ?, sha256_hash = ?,
                                geprueft_netto = ?, kuerzung_grund = ?
                            WHERE id = ?
                        `).run(neuBezahlt, finalOffen, newStatus, newLocked, newMahnung, wasLockedVorZahlung, doc.sha256_hash, geprueftNetto, kuerzungGrund, doc.id);

                        appendAuditLog({
                            entityType: 'DOKUMENT',
                            entityId: Number(doc.id),
                            action: isKuerzung ? 'ARCHITEKTEN_KUERZUNG' : 'ZAHLUNGSEINGANG',
                            details: {
                                transaktionId: txRow.id,
                                buchungstag: txRow.buchungstag,
                                zahlbetrag: matchBetrag,
                                skontoAbzug,
                                geprueftNetto,
                                differenzGrund: diffGrund,
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
                    const altBezahlt = Money.round2(parseFloat(doc.bezahlt_betrag) || 0);
                    const neuBezahlt = Math.max(0, Money.round2(altBezahlt - zuordnung.betrag));
                    const _zbU = parseFloat(doc.zahlbetrag);
                    const docSollU = (Number.isFinite(_zbU) && _zbU > 0)
                        ? Money.round2(_zbU)
                        : Money.round2(parseFloat(doc.brutto) || 0);
                    const neuOffen = Math.max(0, Money.round2(docSollU - neuBezahlt));

                    const newStatus = neuBezahlt <= 0.009 ? 'Ausstehend' : 'Teilweise bezahlt';
                    const newLocked = (doc.was_locked_vor_zahlung !== undefined && doc.was_locked_vor_zahlung !== null)
                        ? (doc.was_locked_vor_zahlung ? 1 : 0)
                        : 0;

                    const remainingKuerzung = db.prepare('SELECT COUNT(*) as c FROM zahlung_zuordnungen WHERE dokument_id = ? AND id != ? AND storno_flag = 0 AND differenz_grund = ?').get(zuordnung.dokument_id, zuordnungId, 'ARCHITEKTEN_KUERZUNG_KUMULIERT');
                    const resetKuerzung = (!remainingKuerzung || remainingKuerzung.c === 0);

                    doc.bezahlt_betrag = neuBezahlt;
                    doc.offener_betrag = neuOffen;
                    doc.status = newStatus;
                    doc.isLocked = newLocked;
                    if (resetKuerzung) {
                        doc.geprueft_netto = null;
                        doc.kuerzung_grund = null;
                    }
                    doc.sha256_hash = calculateDocumentContentHash(doc);

                    db.prepare(`
                        UPDATE dokumente
                        SET bezahlt_betrag = ?, offener_betrag = ?, status = ?,
                            isLocked = ?, sha256_hash = ?` + (resetKuerzung ? `, geprueft_netto = NULL, kuerzung_grund = NULL` : '') + `
                        WHERE id = ?
                    `).run(neuBezahlt, neuOffen, newStatus, newLocked, doc.sha256_hash, doc.id);

                    appendAuditLog({
                        entityType: 'DOKUMENT',
                        entityId: Number(doc.id),
                        action: 'ZAHLUNG_ENTKOPPELT',
                        details: {
                            zuordnungId,
                            betrag: zuordnung.betrag,
                            resetKuerzung,
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
