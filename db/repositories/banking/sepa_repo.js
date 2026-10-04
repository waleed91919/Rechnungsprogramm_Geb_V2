const SepaController = require('../../../controllers/SepaController');
const { calculateDocumentContentHash } = require('../../../main/audit.js');

module.exports = function(deps) {
    const { db, dbQuery, dbRun, appendAuditLog, getDocumentWithChildren } = deps;

    return {
getKundenMandate(kundeId = null) {
        let sql = `
            SELECT m.*, k.name as kunden_name, k.kundennummer
            FROM kunden_sepa_mandate m
            JOIN kunden k ON m.kunde_id = k.id
            WHERE 1=1
        `;
        const params = [];
        if (kundeId) {
            sql += ' AND m.kunde_id = ?';
            params.push(kundeId);
        }
        sql += ' ORDER BY m.status ASC, m.created_at DESC';
        return db.prepare(sql).all(...params);
    },

saveSepaMandat(mandat) {
        if (!mandat || !mandat.kunde_id || !mandat.mandatsreferenz || !mandat.iban) {
            throw new Error('Kunde, Mandatsreferenz und IBAN sind Pflichtfelder.');
        }
        const cleanIban = String(mandat.iban).replace(/[\s-]+/g, '').toUpperCase();
        const cleanBic = String(mandat.bic || '').replace(/[\s-]+/g, '').toUpperCase();
        if (!SepaController.validateIban(cleanIban)) {
            throw new Error(`Ungültige IBAN: ${mandat.iban}`);
        }

        const tx = db.transaction(() => {
            let mandatId = mandat.id;
            const unterschrift = mandat.unterschrifts_datum || new Date().toISOString().substring(0, 10);
            const preNotTage = parseInt(mandat.pre_notification_tage, 10) || 14;

            if (mandatId) {
                db.prepare(`
                    UPDATE kunden_sepa_mandate
                    SET mandatsreferenz = ?, mandats_typ = ?, sequenz_typ = ?,
                        unterschrifts_datum = ?, iban = ?, bic = ?, kontoinhaber = ?,
                        bank_name = ?, status = ?, gueltig_bis = ?, pre_notification_tage = ?,
                        bemerkung = ?
                    WHERE id = ?
                `).run(
                    mandat.mandatsreferenz.trim(),
                    mandat.mandats_typ || 'CORE',
                    mandat.sequenz_typ || 'FRST',
                    unterschrift,
                    cleanIban,
                    cleanBic,
                    (mandat.kontoinhaber || '').trim(),
                    (mandat.bank_name || '').trim(),
                    mandat.status || 'AKTIV',
                    mandat.gueltig_bis || null,
                    preNotTage,
                    mandat.bemerkung || null,
                    mandatId
                );
                appendAuditLog({ entityType: 'SEPA_MANDAT', entityId: Number(mandatId), action: 'AKTUALISIERT', details: { ref: mandat.mandatsreferenz } });
            } else {
                const info = db.prepare(`
                    INSERT INTO kunden_sepa_mandate (
                        kunde_id, mandatsreferenz, mandats_typ, sequenz_typ,
                        unterschrifts_datum, iban, bic, kontoinhaber,
                        bank_name, status, gueltig_bis, pre_notification_tage, bemerkung
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    mandat.kunde_id,
                    mandat.mandatsreferenz.trim(),
                    mandat.mandats_typ || 'CORE',
                    mandat.sequenz_typ || 'FRST',
                    unterschrift,
                    cleanIban,
                    cleanBic,
                    (mandat.kontoinhaber || '').trim(),
                    (mandat.bank_name || '').trim(),
                    mandat.status || 'AKTIV',
                    mandat.gueltig_bis || null,
                    preNotTage,
                    mandat.bemerkung || null
                );
                mandatId = info.lastInsertRowid;
                appendAuditLog({ entityType: 'SEPA_MANDAT', entityId: Number(mandatId), action: 'ERSTELLT', details: { ref: mandat.mandatsreferenz } });
            }

            db.prepare(`
                UPDATE kunden
                SET iban = ?, bic = ?, bank_name = ?, kontoinhaber = ?, sepa_mandat_aktiv = ?
                WHERE id = ?
            `).run(
                cleanIban,
                cleanBic,
                (mandat.bank_name || '').trim(),
                (mandat.kontoinhaber || '').trim(),
                mandat.status === 'AKTIV' ? 1 : 0,
                mandat.kunde_id
            );

            return db.prepare(`
                SELECT m.*, k.name as kunden_name, k.kundennummer
                FROM kunden_sepa_mandate m
                JOIN kunden k ON m.kunde_id = k.id
                WHERE m.id = ?
            `).get(mandatId);
        });

        return tx();
    },

deleteSepaMandat(id) {
        const mandate = db.prepare('SELECT * FROM kunden_sepa_mandate WHERE id = ?').get(id);
        if (!mandate) return { success: true };

        const posCount = db.prepare('SELECT COUNT(*) as cnt FROM sepa_lastschrift_positionen WHERE mandat_id = ?').get(id).cnt;
        if (posCount > 0) {
            db.prepare("UPDATE kunden_sepa_mandate SET status = 'WIDERRUFEN' WHERE id = ?").run(id);
            appendAuditLog({ entityType: 'SEPA_MANDAT', entityId: Number(id), action: 'WIDERRUFEN', details: 'Mandat widerrufen.' });
        } else {
            db.prepare('DELETE FROM kunden_sepa_mandate WHERE id = ?').run(id);
            appendAuditLog({ entityType: 'SEPA_MANDAT', entityId: Number(id), action: 'GELOESCHT', details: 'Mandat gelöscht.' });
        }

        const activeRemaining = db.prepare("SELECT COUNT(*) as cnt FROM kunden_sepa_mandate WHERE kunde_id = ? AND status = 'AKTIV'").get(mandate.kunde_id).cnt;
        if (activeRemaining === 0) {
            db.prepare('UPDATE kunden SET sepa_mandat_aktiv = 0 WHERE id = ?').run(mandate.kunde_id);
        }

        return { success: true };
    },

getOffeneRechnungenFuerSepa() {
        return db.prepare(`
            SELECT d.*, k.name as kunden_name, k.kundennummer,
                   m.id as mandat_id, m.mandatsreferenz, m.mandats_typ, m.sequenz_typ,
                   m.unterschrifts_datum, m.iban as mandat_iban, m.bic as mandat_bic,
                   m.kontoinhaber as mandat_kontoinhaber, m.pre_notification_tage
            FROM dokumente d
            JOIN kunden k ON d.kundeId = k.id
            JOIN kunden_sepa_mandate m ON m.kunde_id = k.id AND m.status = 'AKTIV'
            WHERE d.type = 'rechnung' AND d.status NOT IN ('Bezahlt', 'Storniert')
              AND (d.offener_betrag IS NULL OR d.offener_betrag > 0)
            ORDER BY d.faellig ASC, d.id ASC
        `).all();
    },

createSepaRun(payload = {}) {
        if (!payload.bankKontoId) {
            throw new Error('Bankkonto für den Lastschriftlauf ist erforderlich.');
        }
        const bankKonto = db.prepare('SELECT * FROM bank_konten WHERE id = ?').get(payload.bankKontoId);
        if (!bankKonto) throw new Error(`Bankkonto #${payload.bankKontoId} nicht gefunden.`);

        const settingsRows = db.prepare('SELECT key, value FROM einstellungen').all();
        const settings = {};
        for (const r of settingsRows) settings[r.key] = r.value;

        const creditorIdRaw = bankKonto.glaeubiger_id || settings.glaeubiger_id || '';
        if (!creditorIdRaw || !SepaController.validateGlaeubigerId(creditorIdRaw)) {
            throw new Error(`Keine gültige Gläubiger-Identifikationsnummer hinterlegt (Bankkonto "${bankKonto.kontoname}" bzw. Einstellungen). Bitte hinterlegen Sie eine gültige Gläubiger-ID (Format DE##ZZZ###########, Prüfziffer nach ISO 7064), bevor Sie einen SEPA-Lastschriftlauf erstellen.`);
        }
        const creditorId = creditorIdRaw;
        const creditorName = bankKonto.kontoinhaber || settings.firmenname || 'W-Link ERP';
        const creditorIban = bankKonto.iban;
        const creditorBic = bankKonto.bic;

        const xmlFormat = payload.xmlFormat || settings.sepa_xml_standard || 'pain.008.001.08';
        const schemeType = payload.sammelTyp || 'CORE';
        const sequenceType = payload.sequenzTyp || 'RCUR';
        const rawExecDate = payload.ausfuehrungsDatum || SepaController.getNextTarget2BankingDay(new Date().toISOString().substring(0, 10), 1);
        const executionDate = SepaController.assertAndNormalizeExecutionDate(rawExecDate, true);



        let fristVerletzungen = [];
        let gefiltertePositionen = [];

        const tx = db.transaction(() => {
            const todayStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
            const randomSuffix = String(Math.floor(1000 + Math.random() * 9000));
            const laufNr = `SEPA-${todayStr}-${randomSuffix}`;
            const msgId = `MSG-${todayStr}-${randomSuffix}`;

            let invoiceIds = Array.isArray(payload.invoiceIds) ? payload.invoiceIds : [];
            let items = [];

            if (invoiceIds.length > 0) {
                const placeholders = invoiceIds.map(() => '?').join(',');
                items = db.prepare(`
                    SELECT d.*, k.name as kunden_name, k.kundennummer,
                           m.id as mandat_id, m.mandatsreferenz, m.mandats_typ, m.sequenz_typ,
                           m.unterschrifts_datum, m.iban as mandat_iban, m.bic as mandat_bic,
                           m.kontoinhaber as mandat_kontoinhaber, m.pre_notification_tage
                    FROM dokumente d
                    JOIN kunden k ON d.kundeId = k.id
                    JOIN kunden_sepa_mandate m ON m.kunde_id = k.id AND m.status = 'AKTIV'
                    WHERE d.id IN (${placeholders})
                `).all(...invoiceIds);
            } else if (Array.isArray(payload.positions) && payload.positions.length > 0) {
                items = payload.positions;
            }

            if (items.length === 0) {
                throw new Error('Keine fälligen Rechnungen mit aktivem SEPA-Mandat ausgewählt.');
            }

            const heuteIso = new Date().toISOString().substring(0, 10);
            fristVerletzungen = [];
            for (const item of items) {
                const tage = parseInt(item.pre_notification_tage, 10)
                    || parseInt(settings.sepa_pre_notification_standard_tage, 10)
                    || 14;
                const minDateIso = new Date(Date.parse(heuteIso + 'T00:00:00Z') + tage * 86400000).toISOString().substring(0, 10);
                if (String(executionDate) < minDateIso) {
                    fristVerletzungen.push({ mandatsreferenz: item.mandatsreferenz, fristTage: tage, fruehesterTermin: minDateIso });
                }
            }
            if (fristVerletzungen.length > 0 && !payload.preNotFristBestaetigt) {
                const detailListe = fristVerletzungen
                    .map(v => `${v.mandatsreferenz}: frühester Einzugstermin ${v.fruehesterTermin} (Pre-Notification-Frist ${v.fristTage} Tage)`)
                    .join(' | ');
                throw new Error(`Pre-Notification-Frist (Art. 5.6 SEPA Rulebook) nicht eingehalten für ${fristVerletzungen.length} Mandat(e): ${detailListe}. Bitte passen Sie das Ausführungsdatum an oder bestätigen Sie die vereinbarte verkürzte Frist.`);
            }

            const transactions = [];
            let totalSum = 0;
            gefiltertePositionen = [];

            for (const item of items) {
                if (item.mandats_typ && schemeType && String(item.mandats_typ).toUpperCase() !== String(schemeType).toUpperCase()) {
                    gefiltertePositionen.push({ nr: item.nr || item.dokument_id || null, mandatsreferenz: item.mandatsreferenz, mandats_typ: item.mandats_typ, laufTyp: schemeType });
                    continue;
                }

                const offenerBetrag = item.betrag !== undefined
                    ? parseFloat(item.betrag)
                    : (item.offener_betrag !== null && item.offener_betrag !== undefined
                        ? parseFloat(item.offener_betrag)
                        : Math.round(((item.brutto || 0) - (item.bezahlt_betrag || 0)) * 100) / 100);

                if (offenerBetrag <= 0) continue;

                const posBetrag = Math.round(offenerBetrag * 100) / 100;
                totalSum += posBetrag;

                const endToEndId = `E2E-${item.nr || item.dokument_id || Date.now()}-${item.mandat_id}`;
                const verwendungszweck = item.verwendungszweck || `Rechnung ${item.nr || ''}`;

                transactions.push({
                    dokumentId: item.id || item.dokument_id,
                    dauerrechnungLaufId: item.dauerrechnung_lauf_id || null,
                    mandatId: item.mandat_id,
                    endToEndId,
                    betrag: posBetrag,
                    mandatsreferenz: item.mandatsreferenz,
                    unterschriftsDatum: item.unterschrifts_datum,
                    kundenName: item.kunden_name,
                    kontoinhaber: item.mandat_kontoinhaber || item.kunden_name,
                    iban: item.mandat_iban || item.iban,
                    bic: item.mandat_bic || item.bic,
                    verwendungszweck,
                    belegNr: item.nr,
                    seqTp: item.sequenz_typ
                });
            }

            if (transactions.length === 0) {
                throw new Error('Keine positionierbaren Lastschrift-Posten gefunden (alle Positionen wurden gefiltert oder haben keinen offenen Betrag).');
            }

            totalSum = Math.round(totalSum * 100) / 100;

            const effektiveTypen = [...new Set(transactions.map(t => t.seqTp))];
            const laufSeqTyp = effektiveTypen.length === 1 ? effektiveTypen[0] : 'MIXED';

            const xmlContent = SepaController.generatePain008Xml({
                msgId,
                initiatorName: creditorName,
                creditorName,
                creditorIban,
                creditorBic,
                creditorId,
                executionDate,
                schemeType,
                sequenceType,
                schemaVersion: xmlFormat,
                transactions
            });

            const runInfo = db.prepare(`
                INSERT INTO sepa_lastschrift_laeufe (
                    lauf_nr, bank_konto_id, sammel_typ, sequenz_typ,
                    ausfuehrungs_datum, anzahl_transaktionen, summe_gesamt,
                    xml_format, xml_content, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ERSTELLT')
            `).run(
                laufNr,
                payload.bankKontoId,
                schemeType,
                laufSeqTyp,
                executionDate,
                transactions.length,
                totalSum,
                xmlFormat,
                xmlContent
            );

            const laufId = runInfo.lastInsertRowid;

            if (fristVerletzungen.length > 0 && payload.preNotFristBestaetigt) {
                appendAuditLog({
                    entityType: 'SEPA_RUN',
                    entityId: Number(laufId),
                    action: 'PRENOT_FRIST_ABWEICHEND_BESTAETIGT',
                    details: { laufNr, fristVerletzungen }
                });
            }

            if (gefiltertePositionen.length > 0) {
                appendAuditLog({
                    entityType: 'SEPA_RUN',
                    entityId: Number(laufId),
                    action: 'POSITIONEN_GEFILTERT_SCHEME_MISMATCH',
                    details: { laufNr, gefiltertePositionen }
                });
            }

            const posStmt = db.prepare(`
                INSERT INTO sepa_lastschrift_positionen (
                    lauf_id, dokument_id, dauerrechnung_lauf_id, mandat_id,
                    betrag, verwendungszweck, end_to_end_id, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'EINGEREICHT')
            `);

            for (const txItem of transactions) {
                posStmt.run(
                    laufId,
                    txItem.dokumentId || null,
                    txItem.dauerrechnungLaufId || null,
                    txItem.mandatId,
                    txItem.betrag,
                    txItem.verwendungszweck,
                    txItem.endToEndId
                );

                db.prepare(`
                    UPDATE kunden_sepa_mandate
                    SET letzter_einzug_am = ?, letzte_lauf_nr = ?
                    WHERE id = ?
                `).run(executionDate, laufNr, txItem.mandatId);
            }

            appendAuditLog({
                entityType: 'SEPA_RUN',
                entityId: Number(laufId),
                action: 'ERSTELLT',
                details: {
                    laufNr,
                    anzahl: transactions.length,
                    summe: totalSum,
                    ausfuehrung: executionDate,
                    sequenzTyp: laufSeqTyp,
                    prenotFristBestaetigt: fristVerletzungen.length > 0 && !!payload.preNotFristBestaetigt,
                    gefiltertSchemeMismatch: gefiltertePositionen.length
                }
            });

            return {
                id: laufId,
                laufId,
                laufNr,
                anzahlTransaktionen: transactions.length,
                summeGesamt: totalSum,
                ausfuehrungsDatum: executionDate,
                xmlContent,
                warnings: gefiltertePositionen.map(f => `Position ${f.nr || f.mandatsreferenz} wurde gefiltert: Mandatstyp ${f.mandats_typ} passt nicht zum Lauf-Typ ${f.laufTyp}.`),
                gefiltertePositionen,
                prenotFristAbweichung: fristVerletzungen.length > 0
            };
        });

        return tx();
    },

getSepaLaeufe() {
        return db.prepare(`
            SELECT sl.*, bk.kontoname, bk.iban as konto_iban
            FROM sepa_lastschrift_laeufe sl
            JOIN bank_konten bk ON sl.bank_konto_id = bk.id
            ORDER BY sl.erstellt_am DESC, sl.id DESC
        `).all();
    },

getSepaLaufDetails(laufId) {
        const lauf = db.prepare(`
            SELECT sl.*, bk.kontoname, bk.iban as konto_iban, bk.bic as konto_bic
            FROM sepa_lastschrift_laeufe sl
            JOIN bank_konten bk ON sl.bank_konto_id = bk.id
            WHERE sl.id = ?
        `).get(laufId);
        if (!lauf) throw new Error(`SEPA-Lauf #${laufId} nicht gefunden.`);

        lauf.positionen = db.prepare(`
            SELECT sp.*, d.nr as beleg_nr, d.datum as beleg_datum,
                   m.mandatsreferenz, m.iban as kunden_iban, m.kontoinhaber, k.name as kunden_name
            FROM sepa_lastschrift_positionen sp
            LEFT JOIN dokumente d ON sp.dokument_id = d.id
            JOIN kunden_sepa_mandate m ON sp.mandat_id = m.id
            JOIN kunden k ON m.kunde_id = k.id
            WHERE sp.lauf_id = ?
            ORDER BY sp.id ASC
        `).all(laufId);

        return lauf;
    },

exportSepaRunXml(laufId) {
        const lauf = db.prepare('SELECT * FROM sepa_lastschrift_laeufe WHERE id = ?').get(laufId);
        if (!lauf) throw new Error(`SEPA-Lauf #${laufId} nicht gefunden.`);

        const tx = db.transaction(() => {
            db.prepare("UPDATE sepa_lastschrift_laeufe SET status = 'EXPORTIERT', exportiert_am = CURRENT_TIMESTAMP WHERE id = ?").run(laufId);
            db.prepare(`
                UPDATE kunden_sepa_mandate SET sequenz_typ = 'RCUR'
                WHERE sequenz_typ = 'FRST'
                  AND id IN (SELECT DISTINCT mandat_id FROM sepa_lastschrift_positionen WHERE lauf_id = ?)
            `).run(laufId);
            appendAuditLog({
                entityType: 'SEPA_RUN',
                entityId: Number(laufId),
                action: 'EXPORTIERT',
                details: `XML-Export für Lauf ${lauf.lauf_nr}`
            });
        });
        tx();

        return {
            id: laufId,
            laufId,
            laufNr: lauf.lauf_nr,
            xmlContent: lauf.xml_content,
            summeGesamt: lauf.summe_gesamt
        };
    },

storniereSepaLauf(laufId, grund) {
        const tx = db.transaction(() => {
            const lauf = db.prepare('SELECT * FROM sepa_lastschrift_laeufe WHERE id = ?').get(laufId);
            if (!lauf) throw new Error(`SEPA-Lauf #${laufId} nicht gefunden.`);
            if (lauf.status === 'EINGEREICHT') throw new Error('Ein eingereichter Lauf kann nicht storniert werden.');
            if (lauf.status === 'STORNIERT') return { success: true, bereitsStorniert: true };

            db.prepare("UPDATE sepa_lastschrift_laeufe SET status = 'STORNIERT' WHERE id = ?").run(laufId);
            db.prepare("UPDATE sepa_lastschrift_positionen SET status = 'STORNIERT' WHERE lauf_id = ? AND status = 'EINGEREICHT'").run(laufId);
            db.prepare(`
                UPDATE kunden_sepa_mandate SET sequenz_typ = 'FRST'
                WHERE letzte_lauf_nr = ?
                  AND sequenz_typ = 'RCUR'
                  AND id IN (SELECT DISTINCT mandat_id FROM sepa_lastschrift_positionen WHERE lauf_id = ?)
                  AND NOT EXISTS (
                      SELECT 1 FROM sepa_lastschrift_positionen sp2
                      JOIN sepa_lastschrift_laeufe l2 ON l2.id = sp2.lauf_id
                      WHERE sp2.mandat_id = kunden_sepa_mandate.id
                        AND l2.status IN ('EXPORTIERT', 'EINGEREICHT') AND l2.id != ?
                  )
            `).run(lauf.lauf_nr, laufId, laufId);
            appendAuditLog({ entityType: 'SEPA_RUN', entityId: Number(laufId), action: 'STORNIERT', details: grund || 'Manuelle Stornierung' });

            return { success: true };
        });
        return tx();
    },

markiereRuecklastschrift(positionId, grund) {
        const tx = db.transaction(() => {
            const pos = db.prepare('SELECT * FROM sepa_lastschrift_positionen WHERE id = ?').get(positionId);
            if (!pos) throw new Error(`SEPA-Position #${positionId} nicht gefunden.`);
            if (pos.status === 'RUECKLASTSCHRIFT') return { success: true, bereitsMarkiert: true };

            db.prepare("UPDATE sepa_lastschrift_positionen SET status = 'RUECKLASTSCHRIFT' WHERE id = ?").run(positionId);

            const lauf = db.prepare('SELECT * FROM sepa_lastschrift_laeufe WHERE id = ?').get(pos.lauf_id);
            if (lauf && lauf.sequenz_typ === 'FRST') {
                db.prepare(`
                    UPDATE kunden_sepa_mandate SET sequenz_typ = 'FRST'
                    WHERE id = ? AND sequenz_typ = 'RCUR'
                `).run(pos.mandat_id);
            }

            appendAuditLog({
                entityType: 'SEPA_POSITION',
                entityId: Number(positionId),
                action: 'RUECKLASTSCHRIFT',
                details: {
                    mandatId: pos.mandat_id,
                    laufNr: lauf ? lauf.lauf_nr : null,
                    betrag: pos.betrag,
                    grund: grund || 'Rücklastschrift durch Zahlungsinstitut'
                }
            });

            return { success: true };
        });
        return tx();
    }
    };
};
