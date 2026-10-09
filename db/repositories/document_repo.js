/**
 * Document Repository
 * Belege (Rechnungen, Angebote, Gutschriften), GoBD-Schutz, Statusverwaltung, Audit
 */
const { calculateDocumentContentHash } = require('../../main/audit.js');
const AngebotController = require('../../controllers/AngebotController');

function createDocumentRepo(deps) {
    const { db, dbQuery, dbRun, appendAuditLog, auditLogger } = deps;

// Lädt einen Beleg inkl. Positionen und Verrechnungen (für Schutz-/Hashvergleiche)
function getDocumentWithChildren(docId) {
    const doc = db.prepare('SELECT * FROM dokumente WHERE id=?').get(docId);
    if (doc) {
        doc.positionen = db.prepare('SELECT * FROM positionen WHERE dokumentId=?').all(docId);
        doc.verrechnungen = db.prepare('SELECT * FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?').all(docId);
    }
    return doc;
}

function isLockedInt(doc) {
    return doc && doc.isLocked ? 1 : 0;
}

// J8: Optionale Herkunftsspalte `positionen.lieferschein_quelle` (LS:{id}:POS:{pos}).
// Defensiv per PRAGMA geprüft, damit Altschemata ohne Migration nicht brechen.
function hasLieferscheinQuelleColumn() {
    try {
        const cols = db.prepare(`PRAGMA table_info(positionen)`).all();
        return cols.some(c => c.name === 'lieferschein_quelle');
    } catch (_e) {
        return false;
    }
}

/**
 * Kernlogik des Beleg-Schreibens OHNE eigene Transaktion. Wird von saveDocument()
 * (eigenes Transaction-Wrapper) und vom atomaren Storno (storniereRechnung)
 * innerhalb einer übergeordneten better-sqlite3-Transaktion aufgerufen -
 * verschachtelte db.transaction()-Aufrufe sind in better-sqlite3 verboten.
 */
function applyDocumentWrite(d, requestedLockedInt) {
    let docId = d.id;
    let existing = null;
    let action = 'ERSTELLT';

    // GoBD: Inhalts-Hash NACH konsistentem Algorithmus berechnen und persistieren
    d.sha256_hash = calculateDocumentContentHash(d);

    if (docId) {
        existing = getDocumentWithChildren(docId);
        if (!existing) {
            throw new Error(`Dokument mit ID ${docId} wurde nicht gefunden.`);
        }

        // GOBD-1 Fix: Vollständige Erfassung aller unveränderlichen GoBD-Status
        const GOBD_PROTECTED_STATUSES = ['Festgeschrieben', 'Bezahlt', 'Storniert'];
        const isCurrentlyLocked = existing.isLocked === 1 || GOBD_PROTECTED_STATUSES.includes(existing.status);

        if (isCurrentlyLocked) {
            // 1. Entsperren ist nach GoBD strikt verboten (GOBD-2)
            if (requestedLockedInt === 0) {
                throw new Error(`GoBD-Schutzverletzung: Beleg ${existing.nr} ist festgeschrieben/gesperrt. Ein Aufheben der Sperre ist unzulässig. Korrekturen müssen über Storno/Gutschrift erfolgen.`);
            }

            // 2. Inhaltsprüfung: Haben sich Positionen, Beträge oder Stammdaten geändert?
            const oldContentHash = calculateDocumentContentHash(existing);
            const newContentHash = calculateDocumentContentHash(d);

            if (oldContentHash !== newContentHash) {
                throw new Error(`GoBD-Änderungssperre (GOBD-1): Beleg ${existing.nr} (Status: ${existing.status}) ist revisionssicher fixiert. Inhaltliche Mutationen sind gesetzlich untersagt (§ 146 Abs. 4 AO). Bitte erstellen Sie eine Stornorechnung.`);
            }

            // 3. Wenn der Inhalt identisch ist, dürfen NUR Status- & Mahnfelder aktualisiert werden!
            const updateStatusOnlyStmt = db.prepare(`
                UPDATE dokumente SET
                    status=?, mahnungLevel=?, mahnungDatum=?, mahnungGebuehr=?,
                    skonto_tage=?, skonto_prozent=?, sepa_mandat_id=?, isLocked=1
                WHERE id=?
            `);
            updateStatusOnlyStmt.run(
                d.status, d.mahnungLevel || 0, d.mahnungDatum || null, d.mahnungGebuehr || 0,
                d.skonto_tage || 0, d.skonto_prozent || 0, d.sepa_mandat_id || null, docId
            );

            appendAuditLog({
                entityType: 'DOCUMENT',
                entityId: docId,
                action: 'STATUS_GEÄNDERT',
                details: { nr: existing.nr, oldStatus: existing.status, newStatus: d.status, reason: 'Status-Aktualisierung bei festgeschriebenem Beleg' }
            });

            return docId; // Beende hier atomar, ohne DELETE auf Positionen auszuführen!
        }

        // Angebot-Freeze-Schutz & State-Transition-Guard:
        // Wenn ein Angebot den Status 'VERSENDET', 'ANGENOMMEN' oder 'ABGELEHNT' hat
        // oder freeze_snapshot_json gesetzt ist, darf der Snapshot/Inhalt nicht mutiert werden
        // und es darf kein Statuswechsel auf ENTWURF/DRAFT erfolgen.
        const FROZEN_ANGEBOT_STATUSES = ['VERSENDET', 'ANGENOMMEN', 'ABGELEHNT'];
        const isFrozenAngebot = Boolean(existing.freeze_snapshot_json) ||
            FROZEN_ANGEBOT_STATUSES.includes(existing.angebot_status);

        if (isFrozenAngebot) {
            // 1. Verbiete jeglichen Rückfall auf ENTWURF oder DRAFT
            const reqAngebotStatus = typeof d.angebot_status === 'string' ? d.angebot_status.toUpperCase().trim() : null;
            const reqStatus = typeof d.status === 'string' ? d.status.toUpperCase().trim() : null;

            if (
                reqAngebotStatus === 'ENTWURF' ||
                reqAngebotStatus === 'DRAFT' ||
                reqStatus === 'ENTWURF' ||
                reqStatus === 'DRAFT' ||
                d.angebot_status === 'ENTWURF' ||
                d.status === 'Entwurf' ||
                d.status === 'DRAFT'
            ) {
                throw new Error('Unzulässiger Statusübergang: Ein fixiertes Angebot kann nicht auf ENTWURF zurückgesetzt werden.');
            }

            // 2. Verbiete das Leeren oder Löschen von freeze_snapshot_json
            if (existing.freeze_snapshot_json && (d.freeze_snapshot_json === null || d.freeze_snapshot_json === '' || d.freeze_snapshot_json === false)) {
                throw new Error('Unzulässige Operation: Der Freeze-Snapshot eines fixierten Angebots darf nicht gelöscht oder geleert werden.');
            }

            // Prüfung: Wurde versucht, den Freeze-Snapshot zu manipulieren?
            const snapshotModified = d.freeze_snapshot_json !== undefined &&
                d.freeze_snapshot_json !== null &&
                d.freeze_snapshot_json !== existing.freeze_snapshot_json;

            if (snapshotModified) {
                throw new Error(`Änderungssperre: Freeze-Snapshot von Angebot ${existing.nr} darf nicht manipuliert werden.`);
            }

            // 3. Erlaube nur gültige Vorwärtsübergänge: VERSENDET -> ANGENOMMEN oder ABGELEHNT
            const currentStatus = (existing.angebot_status || 'VERSENDET').toUpperCase().trim();
            const nextAngebotStatus = (d.angebot_status || currentStatus).toUpperCase().trim();

            if (currentStatus === 'VERSENDET') {
                const allowedNext = ['VERSENDET', 'ANGENOMMEN', 'ABGELEHNT'];
                if (!allowedNext.includes(nextAngebotStatus)) {
                    throw new Error(`Unzulässiger Statusübergang: Von VERSENDET kann nur nach ANGENOMMEN oder ABGELEHNT gewechselt werden (angefordert: ${nextAngebotStatus}).`);
                }
            } else if (currentStatus === 'ANGENOMMEN') {
                if (nextAngebotStatus !== 'ANGENOMMEN') {
                    throw new Error(`Unzulässiger Statusübergang: Ein bereits angenommenes Angebot kann nicht mehr geändert werden (angefordert: ${nextAngebotStatus}).`);
                }
            } else if (currentStatus === 'ABGELEHNT') {
                if (nextAngebotStatus !== 'ABGELEHNT') {
                    throw new Error(`Unzulässiger Statusübergang: Ein abgelehntes Angebot kann nicht mehr geändert werden (angefordert: ${nextAngebotStatus}).`);
                }
            }

            // Prüfung: Wurden Beträge mutiert?
            const amountsModified = (d.netto !== undefined && Math.abs(parseFloat(d.netto) - parseFloat(existing.netto)) > 0.001) ||
                (d.brutto !== undefined && Math.abs(parseFloat(d.brutto) - parseFloat(existing.brutto)) > 0.001) ||
                (d.steuer !== undefined && Math.abs(parseFloat(d.steuer) - parseFloat(existing.steuer)) > 0.001);

            let positionsModified = false;
            if (d.positionen && Array.isArray(d.positionen)) {
                if (d.positionen.length !== (existing.positionen || []).length) {
                    positionsModified = true;
                } else {
                    for (let i = 0; i < d.positionen.length; i++) {
                        const pNew = d.positionen[i];
                        const pOld = existing.positionen[i];
                        if (
                            pNew.name !== pOld.name ||
                            parseFloat(pNew.menge) !== parseFloat(pOld.menge) ||
                            parseFloat(pNew.preis) !== parseFloat(pOld.preis) ||
                            parseFloat(pNew.rabatt || 0) !== parseFloat(pOld.rabatt || 0) ||
                            (pNew.positionstyp || 'NORMAL') !== (pOld.positionstyp || 'NORMAL') ||
                            (pNew.titel || null) !== (pOld.titel || null)
                        ) {
                            positionsModified = true;
                            break;
                        }
                    }
                }
            }

            if (amountsModified || positionsModified) {
                throw new Error(`Änderungssperre: Angebot ${existing.nr} (Status: ${existing.angebot_status || existing.status}) ist mit Freeze-Snapshot fixiert. Inhaltliche Mutationen sind nicht zulässig; bitte erstellen Sie eine neue Version.`);
            }

            // Wenn der Inhalt unverändert ist, dürfen Status- & Annahmefelder aktualisiert werden (z.B. bei acceptAngebot)
            const updateAngebotStatusOnlyStmt = db.prepare(`
                UPDATE dokumente SET
                    angebot_status=?, status=?, angenommen_am=?, angenommene_version=?
                WHERE id=?
            `);
            const targetAngebotStatus = d.angebot_status || existing.angebot_status;
            const targetGeneralStatus = d.status || existing.status;
            const targetAngenommenAm = d.angenommen_am !== undefined ? d.angenommen_am : existing.angenommen_am;
            const targetAngenommeneVersion = d.angenommene_version !== undefined ? d.angenommene_version : existing.angenommene_version;

            updateAngebotStatusOnlyStmt.run(targetAngebotStatus, targetGeneralStatus, targetAngenommenAm, targetAngenommeneVersion, docId);

            appendAuditLog({
                entityType: 'DOCUMENT',
                entityId: docId,
                action: 'STATUS_GEÄNDERT',
                details: {
                    nr: existing.nr,
                    type: 'angebot',
                    oldStatus: existing.angebot_status,
                    newStatus: targetAngebotStatus,
                    angenommen_am: targetAngenommenAm,
                    angenommene_version: targetAngenommeneVersion,
                    reason: 'Status-Aktualisierung bei fixiertem Angebot'
                }
            });

            return docId;
        }
    }

    // Datenintegrität: Belegnummer darf für denselben Belegtyp nicht doppelt vergeben sein
    const docType = d.type || (existing ? existing.type : 'rechnung');
    const nrConflict = db.prepare('SELECT id FROM dokumente WHERE type = ? AND nr = ? AND id IS NOT ?').get(docType, d.nr, docId == null ? null : docId);
    if (nrConflict) {
        throw new Error(`Die Belegnummer "${d.nr}" ist bereits vergeben (Dokument #${nrConflict.id}). Bitte verwenden Sie eine andere Nummer.`);
    }

    // J1 Schlussrechnungs-Sperre: Genau eine Schlussrechnung pro Projekt
    if (d.type === 'rechnung' && d.rechnungsart === 'SCHLUSSRECHNUNG' && d.projektId) {
        const currentDocId = docId || -1;
        const existingSchluss = db.prepare(`
            SELECT nr FROM dokumente
            WHERE projektId = ? AND rechnungsart = 'SCHLUSSRECHNUNG' AND id != ? AND status != 'Storniert'
        `).get(d.projektId, currentDocId);

        if (existingSchluss) {
            throw new Error(`Für dieses Projekt existiert bereits die Schlussrechnung ${existingSchluss.nr}. Es ist genau eine Schlussrechnung pro Projekt zulässig.`);
        }
    }

    if (docId) {
        action = (calculateDocumentContentHash(existing) === calculateDocumentContentHash(d)) ? 'STATUS_GEÄNDERT' : 'GEÄNDERT';

        if (d.type === 'rechnung') {
            // Restore stock: Group by artikelId in memory to avoid N+1 and slow subqueries
            const oldPositions = db.prepare('SELECT artikelId, menge FROM positionen WHERE dokumentId=?').all(docId);
            if (oldPositions.length > 0) {
                const restoreStockMap = new Map();
                for (const p of oldPositions) {
                    if (p.artikelId) {
                        restoreStockMap.set(p.artikelId, (restoreStockMap.get(p.artikelId) || 0) + p.menge);
                    }
                }
                const restoreStockStmt = db.prepare('UPDATE artikel SET bestand = bestand + ? WHERE id=?');
                for (const [artId, qty] of restoreStockMap.entries()) {
                    restoreStockStmt.run(qty, artId);
                }
            }
        }

        // ACHTUNG REVIEWER-AUFLAGE: Positionen und Verrechnungen VOR dem Dokumentenkopf-Update löschen und neu schreiben!
        // Da der Beleg in der DB noch Entwurf (isLocked=0) ist, blockiert der SQLite-Trigger trg_prevent_locked_positionen_delete hier nicht!
        const deletePosStmt = db.prepare('DELETE FROM positionen WHERE dokumentId=?');
        deletePosStmt.run(docId);
        const deleteVerrechnungStmt = db.prepare('DELETE FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?');
        deleteVerrechnungStmt.run(docId);

        // Neue Positionen einfügen
        if (d.positionen && d.positionen.length > 0) {
            const withLsQuelle = hasLieferscheinQuelleColumn();
            const insertPosStmt = withLsQuelle
                ? db.prepare('INSERT INTO positionen (dokumentId, artikelId, name, menge, einheit, preis, ek, mwst, rabatt, steuer_schluessel, is13b, cost_type, oz_code, is_tax_deductible_35a, titel, positionstyp, in_endsumme_enthalten, bieterangabe_wert, lieferschein_quelle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                : db.prepare('INSERT INTO positionen (dokumentId, artikelId, name, menge, einheit, preis, ek, mwst, rabatt, steuer_schluessel, is13b, cost_type, oz_code, is_tax_deductible_35a, titel, positionstyp, in_endsumme_enthalten, bieterangabe_wert) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            const stockDeductionMap = new Map();

            for (const p of d.positionen) {
                const baseArgs = [
                    docId,
                    p.artikelId || null,
                    p.name || null,
                    p.menge,
                    p.einheit || 'Stk.',
                    p.preis,
                    p.ek || 0,
                    p.mwst,
                    p.rabatt || 0,
                    p.steuer_schluessel || null,
                    p.is13b ? 1 : 0,
                    p.cost_type || 'MATERIAL',
                    p.oz_code || null,
                    p.is_tax_deductible_35a ? 1 : 0,
                    p.titel || null,
                    p.positionstyp || 'NORMAL',
                    AngebotController.normalizeInEndsumme(p.in_endsumme_enthalten, p.positionstyp),
                    p.bieterangabe_wert || null
                ];
                if (withLsQuelle) baseArgs.push(p.lieferschein_quelle || null);
                insertPosStmt.run(...baseArgs);

                if (d.type === 'rechnung' && p.artikelId) {
                    stockDeductionMap.set(p.artikelId, (stockDeductionMap.get(p.artikelId) || 0) + p.menge);
                }
            }

            if (stockDeductionMap.size > 0) {
                const deductStockStmt = db.prepare('UPDATE artikel SET bestand = bestand - ? WHERE id=?');
                for (const [artId, qty] of stockDeductionMap.entries()) {
                    deductStockStmt.run(qty, artId);
                }
            }
        }

        // Neue Verrechnungen einfügen
        insertVerrechnungenGuarded(docId, d.verrechnungen, d.rechnungsart || (existing ? existing.rechnungsart : 'REGULAER'), d.projektId || (existing ? existing.projektId : null));

        const docVersion = d.version !== undefined && d.version !== null ? parseInt(d.version, 10) : (existing ? (existing.version || 1) : 1);
        const parentAngebotId = d.parent_angebot_id !== undefined ? d.parent_angebot_id : (existing ? (existing.parent_angebot_id || null) : null);
        const angebotStatus = d.angebot_status || (existing ? (existing.angebot_status || 'ENTWURF') : 'ENTWURF');
        const freezeSnapshot = d.freeze_snapshot_json !== undefined ? d.freeze_snapshot_json : (existing ? (existing.freeze_snapshot_json || null) : null);
        const auftraggeberTyp = d.auftraggeber_typ || (existing ? (existing.auftraggeber_typ || 'PRIVAT') : 'PRIVAT');
        const vergabeVerfahren = d.vergabe_verfahren || (existing ? (existing.vergabe_verfahren || 'DIREKT') : 'DIREKT');
        const vertragsgrundlage = d.vertragsgrundlage || (existing ? (existing.vertragsgrundlage || 'BGB_WERKVERTRAG') : 'BGB_WERKVERTRAG');
        const angenommenAm = d.angenommen_am !== undefined ? d.angenommen_am : (existing ? (existing.angenommen_am || null) : null);
        const angenommeneVersion = d.angenommene_version !== undefined ? d.angenommene_version : (existing ? (existing.angenommene_version || null) : null);

        // ERST JETZT Dokumentenkopf mit isLocked und neuem Status aktualisieren
        const updateStmt = db.prepare('UPDATE dokumente SET type=?, nr=?, datum=?, faellig=?, kundeId=?, projektId=?, status=?, isLocked=?, netto=?, steuer=?, brutto=?, globalRabattAbzug=?, globalRabattType=?, globalRabattValue=?, anzahlung=?, mahnungLevel=?, mahnungDatum=?, mahnungGebuehr=?, eingabemodus=?, vortext=?, fusstext=?, leistungszeitraum_von=?, leistungszeitraum_bis=?, baustellen_adresse=?, vob_vereinbart=?, ist_privatkunde=?, unterliegt_bauabzugsteuer=?, bauabzugsteuer_betrag=?, ausweis_35a_erforderlich=?, summe_lohnkosten_brutto=?, rechnungsart=?, kumulierte_leistung_netto=?, sicherheitseinbehalt=?, sicherheitseinbehalt_prozent=?, unterliegt_13b=?, leitweg_id=?, buyer_reference=?, objekt_typ=?, objekt_id=?, skonto_tage=?, skonto_prozent=?, sepa_mandat_id=?, sha256_hash=?, zahlbetrag=?, version=?, parent_angebot_id=?, angebot_status=?, freeze_snapshot_json=?, auftraggeber_typ=?, vergabe_verfahren=?, vertragsgrundlage=?, angenommen_am=?, angenommene_version=? WHERE id=?');
        updateStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, requestedLockedInt, d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.mahnungLevel || 0, d.mahnungDatum || null, d.mahnungGebuehr || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.sicherheitseinbehalt_prozent || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.objekt_typ || null, d.objekt_id == null ? null : d.objekt_id, d.skonto_tage || 0, d.skonto_prozent || 0, d.sepa_mandat_id == null ? null : d.sepa_mandat_id, d.sha256_hash || null, d.zahlbetrag !== undefined && d.zahlbetrag !== null ? d.zahlbetrag : 0, docVersion, parentAngebotId, angebotStatus, freezeSnapshot, auftraggeberTyp, vergabeVerfahren, vertragsgrundlage, angenommenAm, angenommeneVersion, docId);

    } else {
        const docVersion = d.version !== undefined && d.version !== null ? parseInt(d.version, 10) : 1;
        const parentAngebotId = d.parent_angebot_id || null;
        const angebotStatus = d.angebot_status || 'ENTWURF';
        const freezeSnapshot = d.freeze_snapshot_json || null;
        const auftraggeberTyp = d.auftraggeber_typ || 'PRIVAT';
        const vergabeVerfahren = d.vergabe_verfahren || 'DIREKT';
        const vertragsgrundlage = d.vertragsgrundlage || 'BGB_WERKVERTRAG';
        const angenommenAm = d.angenommen_am || null;
        const angenommeneVersion = d.angenommene_version !== undefined ? d.angenommene_version : null;

        const insertStmt = db.prepare('INSERT INTO dokumente (type, nr, datum, faellig, kundeId, projektId, status, isLocked, netto, steuer, brutto, globalRabattAbzug, globalRabattType, globalRabattValue, anzahlung, eingabemodus, vortext, fusstext, leistungszeitraum_von, leistungszeitraum_bis, baustellen_adresse, vob_vereinbart, ist_privatkunde, unterliegt_bauabzugsteuer, bauabzugsteuer_betrag, ausweis_35a_erforderlich, summe_lohnkosten_brutto, rechnungsart, kumulierte_leistung_netto, sicherheitseinbehalt, sicherheitseinbehalt_prozent, unterliegt_13b, leitweg_id, buyer_reference, objekt_typ, objekt_id, skonto_tage, skonto_prozent, sepa_mandat_id, sha256_hash, zahlbetrag, version, parent_angebot_id, angebot_status, freeze_snapshot_json, auftraggeber_typ, vergabe_verfahren, vertragsgrundlage, angenommen_am, angenommene_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const res = insertStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, requestedLockedInt, d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.sicherheitseinbehalt_prozent || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.objekt_typ || null, d.objekt_id == null ? null : d.objekt_id, d.skonto_tage || 0, d.skonto_prozent || 0, d.sepa_mandat_id == null ? null : d.sepa_mandat_id, d.sha256_hash || null, d.zahlbetrag !== undefined && d.zahlbetrag !== null ? d.zahlbetrag : 0, docVersion, parentAngebotId, angebotStatus, freezeSnapshot, auftraggeberTyp, vergabeVerfahren, vertragsgrundlage, angenommenAm, angenommeneVersion);
        docId = res.lastInsertRowid;

        // Positionen einfügen
        if (d.positionen && d.positionen.length > 0) {
            const withLsQuelle = hasLieferscheinQuelleColumn();
            const insertPosStmt = withLsQuelle
                ? db.prepare('INSERT INTO positionen (dokumentId, artikelId, name, menge, einheit, preis, ek, mwst, rabatt, steuer_schluessel, is13b, cost_type, oz_code, is_tax_deductible_35a, titel, positionstyp, in_endsumme_enthalten, bieterangabe_wert, lieferschein_quelle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                : db.prepare('INSERT INTO positionen (dokumentId, artikelId, name, menge, einheit, preis, ek, mwst, rabatt, steuer_schluessel, is13b, cost_type, oz_code, is_tax_deductible_35a, titel, positionstyp, in_endsumme_enthalten, bieterangabe_wert) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            const stockDeductionMap = new Map();

            for (const p of d.positionen) {
                const baseArgs = [
                    docId,
                    p.artikelId || null,
                    p.name || null,
                    p.menge,
                    p.einheit || 'Stk.',
                    p.preis,
                    p.ek || 0,
                    p.mwst,
                    p.rabatt || 0,
                    p.steuer_schluessel || null,
                    p.is13b ? 1 : 0,
                    p.cost_type || 'MATERIAL',
                    p.oz_code || null,
                    p.is_tax_deductible_35a ? 1 : 0,
                    p.titel || null,
                    p.positionstyp || 'NORMAL',
                    AngebotController.normalizeInEndsumme(p.in_endsumme_enthalten, p.positionstyp),
                    p.bieterangabe_wert || null
                ];
                if (withLsQuelle) baseArgs.push(p.lieferschein_quelle || null);
                insertPosStmt.run(...baseArgs);

                if (d.type === 'rechnung' && p.artikelId) {
                    stockDeductionMap.set(p.artikelId, (stockDeductionMap.get(p.artikelId) || 0) + p.menge);
                }
            }

            if (stockDeductionMap.size > 0) {
                const deductStockStmt = db.prepare('UPDATE artikel SET bestand = bestand - ? WHERE id=?');
                for (const [artId, qty] of stockDeductionMap.entries()) {
                    deductStockStmt.run(qty, artId);
                }
            }
        }

        // Verrechnungen einfügen
        insertVerrechnungenGuarded(docId, d.verrechnungen, d.rechnungsart || 'REGULAER', d.projektId);
    }

    // GoBD: Audit-Eintrag INNERHALB derselben Transaktion
    appendAuditLog({
        entityType: 'DOCUMENT',
        entityId: docId,
        action,
        details: {
            nr: d.nr,
            type: d.type,
            status: d.status,
            vorherigerStatus: existing ? existing.status : null,
            isLocked: requestedLockedInt === 1,
            brutto: d.brutto || 0,
            sha256_hash: d.sha256_hash
        }
    });

    return docId;
}

/**
 * Fügt Verrechnungen eines Belegs ein - MIT Doppelverrechnungs-Schutz:
 * Eine Vorrechnung darf global nur in EINER aktuellen Rechnung verrechnet sein.
 * Wird innerhalb einer bestehenden Transaktion aufgerufen (kein eigenes Wrapper nötig).
 */
function insertVerrechnungenGuarded(docId, verrechnungen, rechnungsart, projektId) {
    if (!verrechnungen) verrechnungen = [];

    // J1: "Schluss verrechnet alle"-Check
    if (rechnungsart === 'SCHLUSSRECHNUNG' && projektId) {
        // Finde alle kumulativen Vorrechnungen für das Projekt (nicht storniert)
        const previousDocs = db.prepare(`
            SELECT id, nr FROM dokumente
            WHERE projektId = ?
            AND id != ?
            AND status != 'Storniert'
            AND type = 'rechnung'
            AND rechnungsart IN ('ABSCHLAG', 'TEILSCHLUSSRECHNUNG', 'ABSCHLAG_KUMULIERT')
        `).all(projektId, docId || -1);

        const verrechneteIds = new Set(verrechnungen.map(v => v.vorherige_rechnung_id));
        const missingNrs = [];

        for (const prev of previousDocs) {
            if (!verrechneteIds.has(prev.id)) {
                missingNrs.push(prev.nr);
            }
        }

        if (missingNrs.length > 0) {
            throw new Error(`Unvollständige Verrechnung: Eine Schlussrechnung muss alle Vorrechnungen (Abschläge/Teilschluss) des Projekts abziehen. Es fehlen: ${missingNrs.join(', ')}`);
        }
    }

    if (verrechnungen.length === 0) return;

    const checkUsedStmt = db.prepare(`
        SELECT rv.aktuelle_rechnung_id
        FROM rechnung_verrechnungen rv
        JOIN dokumente d ON rv.aktuelle_rechnung_id = d.id
        WHERE rv.vorherige_rechnung_id = ?
        AND rv.aktuelle_rechnung_id != ?
        AND d.status != 'Storniert'
    `);
    const seenPairs = new Set();
    for (const v of verrechnungen) {
        if (!v || !v.vorherige_rechnung_id) continue;
        if (v.vorherige_rechnung_id === docId) {
            throw new Error('Ein Beleg kann nicht mit sich selbst verrechnet werden.');
        }
        const pairKey = `${docId}->${v.vorherige_rechnung_id}`;
        if (seenPairs.has(pairKey)) {
            throw new Error(`Doppelte Verrechnung: Die Rechnung #${v.vorherige_rechnung_id} kann innerhalb desselben Belegs nur einmal abgezogen werden.`);
        }
        seenPairs.add(pairKey);

        const usedBy = checkUsedStmt.get(v.vorherige_rechnung_id, docId);
        if (usedBy) {
            throw new Error(`Doppelverrechnung blockiert: Die Rechnung #${v.vorherige_rechnung_id} ist bereits in der nicht stornierten Rechnung #${usedBy.aktuelle_rechnung_id} verrechnet und kann nicht erneut abgezogen werden.`);
        }
    }

    const insertVerrechnungStmt = db.prepare('INSERT INTO rechnung_verrechnungen (aktuelle_rechnung_id, vorherige_rechnung_id, abzugsbetrag_netto, abzugsbetrag_brutto) VALUES (?, ?, ?, ?)');
    for (const v of verrechnungen) {
        if (!v || !v.vorherige_rechnung_id) continue;
        const bruttoVal = (v.abzugsbetrag_brutto !== undefined && v.abzugsbetrag_brutto !== null && Number.isFinite(parseFloat(v.abzugsbetrag_brutto)))
            ? parseFloat(v.abzugsbetrag_brutto)
            : Math.round(((parseFloat(v.abzugsbetrag_netto) || 0) * 1.19) * 100) / 100;
        insertVerrechnungStmt.run(docId, v.vorherige_rechnung_id, v.abzugsbetrag_netto || 0, bruttoVal);
    }
}

    const repo = {
// GoBD B-3: Atomares Laden eines Belegs per ID direkt aus der Datenbank
    getDocumentById(docId) {
        return getDocumentWithChildren(docId);
    },

getDokumente: async () => await dbQuery('SELECT * FROM dokumente WHERE COALESCE(is_deleted, 0) = 0'),

// --- Dokumente (Rechnungen/Angebote) ---
    async saveDocument(doc) {
        const requestedLockedInt = doc.isLocked ? 1 : 0;

        // Wrap the document and position saving in a transaction for data integrity
        const saveTransaction = db.transaction((d) => applyDocumentWrite(d, requestedLockedInt));

        try {
            return saveTransaction(doc);
        } catch (err) {
            if (err.message && (err.message.includes('UNIQUE constraint failed') || err.code === 'SQLITE_CONSTRAINT_UNIQUE')) {
                if (err.message.includes('dokumente.type') || err.message.includes('dokumente.nr') || err.message.includes('idx_dokumente')) {
                    throw new Error(`Die Belegnummer "${doc.nr}" ist bereits vergeben. Bitte verwenden Sie eine andere Nummer.`);
                }
            }
            throw err;
        }
    },


    // --- Dokumente (Bulk Save) ---
    async bulkSaveDocuments(docs) {
        if (!docs || !Array.isArray(docs) || docs.length === 0) return [];

        const bulkTransaction = db.transaction((docsList) => {
            const docIds = [];
            for (const d of docsList) {
                const requestedLockedInt = isLockedInt(d);
                const docId = applyDocumentWrite(d, requestedLockedInt);
                docIds.push(docId);
            }
            return docIds;
        });

        try {
            return bulkTransaction(docs);
        } catch (err) {
            if (err.message && (err.message.includes('UNIQUE constraint failed') || err.code === 'SQLITE_CONSTRAINT_UNIQUE')) {
                if (err.message.includes('dokumente.type') || err.message.includes('dokumente.nr') || err.message.includes('idx_dokumente')) {
                    throw new Error(`Eine Belegnummer ist bereits vergeben. Bitte überprüfen Sie die Nummernvergabe.`);
                }
            }
            throw err;
        }
    },

    async deleteDocument(id) {
        const delTransaction = db.transaction((docId) => {
            // SELECT fetches only strictly necessary columns.
            const doc = db.prepare('SELECT type, nr, status, isLocked, angebot_status, freeze_snapshot_json FROM dokumente WHERE id=?').get(docId);
            if (!doc) return 0;

            // GoBD- & Angebot-Löschsperre: Gesperrte Belege sowie Rechnungen mit vergebener Belegnummer (außer Entwurf)
            // und fixierte Angebote (Status VERSENDET/ANGENOMMEN mit Freeze-Snapshot) dürfen nicht gelöscht werden
            const isRechnung = doc.type && doc.type.toLowerCase() === 'rechnung';
            const isAngebot = doc.type && doc.type.toLowerCase() === 'angebot';
            const isDraft = isRechnung
                ? (doc.status === 'Entwurf' || doc.status === 'DRAFT')
                : (doc.status === 'Entwurf' || doc.status === 'DRAFT' || doc.angebot_status === 'ENTWURF');
            const hasBelegnummer = Boolean(doc.nr && String(doc.nr).trim().length > 0);
            const isProtectedOffer = isAngebot &&
                (doc.angebot_status === 'VERSENDET' || doc.angebot_status === 'ANGENOMMEN' || Boolean(doc.freeze_snapshot_json));

            if (Boolean(doc.isLocked) || (isRechnung && hasBelegnummer && !isDraft) || isProtectedOffer) {
                throw new Error(`Beleg ${doc.nr || id} ist gesperrt/fixiert (GoBD-/Freeze-Löschsperre) und kann nicht gelöscht werden. Bitte verwenden Sie eine Stornorechnung oder erstellen Sie eine neue Version.`);
            }

            if (doc.type === 'rechnung') {
                // Restore stock: Group by artikelId in memory to avoid N+1 and slow subqueries.
                // Node-level loop is executed within a transaction, making it safe and highly optimized.
                const positions = db.prepare('SELECT artikelId, menge FROM positionen WHERE dokumentId=?').all(docId);
                if (positions.length > 0) {
                    const restoreStockMap = new Map();
                    for (const p of positions) {
                        if (p.artikelId) {
                            restoreStockMap.set(p.artikelId, (restoreStockMap.get(p.artikelId) || 0) + p.menge);
                        }
                    }
                    const restoreStockStmt = db.prepare('UPDATE artikel SET bestand = bestand + ? WHERE id=?');
                    // OPTIMIZATION NOTE:
                    // This node-level loop uses in-memory JS Map aggregation and executes
                    // individual prepared UPDATE statements inside a single SQLite transaction.
                    // This prevents N+1 queries and avoids the overhead of complex dynamic SQL strings.
                    for (const [artId, qty] of restoreStockMap.entries()) {
                        restoreStockStmt.run(qty, artId);
                    }
                }
            }
            db.prepare('DELETE FROM positionen WHERE dokumentId=?').run(docId);
            db.prepare('DELETE FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?').run(docId);
            db.prepare('DELETE FROM dokumente WHERE id=?').run(docId);

            // GoBD: Audit-Eintrag INNERHALB derselben Transaktion
            appendAuditLog({
                entityType: 'DOCUMENT',
                entityId: docId,
                action: 'GELÖSCHT',
                details: { nr: doc.nr, type: doc.type, status: doc.status }
            });
        });
        return delTransaction(id);
    },

    // --- GoBD: Schmaler Status-/Buchhaltungspfad (auch für gesperrte Belege) ---
    async updateDocumentStatus(id, patch = {}) {
        if (typeof id !== 'number') throw new Error('Ungültige Dokumenten-ID');
        const allowedKeys = ['status', 'faellig'];
        const keys = Object.keys(patch).filter(k => allowedKeys.includes(k) && patch[k] !== undefined);
        if (keys.length === 0) {
            throw new Error('updateDocumentStatus: Keine gültigen Felder übergeben (erlaubt: status, faellig).');
        }

        const tx = db.transaction((docId, changes) => {
            const doc = db.prepare('SELECT id, nr, status, faellig FROM dokumente WHERE id=?').get(docId);
            if (!doc) throw new Error(`Dokument mit ID ${docId} wurde nicht gefunden.`);

            const setClauses = keys.map(k => `${k}=?`);
            const values = keys.map(k => changes[k]);
            values.push(docId);
            db.prepare(`UPDATE dokumente SET ${setClauses.join(', ')} WHERE id=?`).run(...values);

            // GoBD: Status-/Fälligkeitsänderungen sind an gesperrten Belegen erlaubt,
            // werden aber lückenlos protokolliert.
            appendAuditLog({
                entityType: 'DOCUMENT',
                entityId: docId,
                action: 'STATUS_GEÄNDERT',
                details: {
                    nr: doc.nr,
                    vorherigerStatus: doc.status,
                    neuerStatus: changes.status !== undefined ? changes.status : doc.status,
                    altesZahlungsziel: doc.faellig || null,
                    neuesZahlungsziel: changes.faellig !== undefined ? changes.faellig : (doc.faellig || null)
                }
            });
            return { success: true, id: docId };
        });
        return tx(id, patch);
    },

    // --- GOBD-2: GoBD-konformes Blockieren jeglicher Entsperr-Versuche ---
    async entsperreBeleg(id, grund) {
        throw new Error('GoBD-Verstoß (GOBD-2): Das Entsperren festgeschriebener Belege ist nach § 146 Abs. 4 AO und GoBD Rz. 110 unzulässig. Korrekturen müssen zwingend über eine Stornorechnung bzw. Gutschrift erfolgen.');
    },

    // --- Atomares Storno: Original-Status + Gutschrift in EINER Transaktion ---
    // Schlägt ein Schritt fehl, wird BEIDES zurückgerollt (kein halber Zustand
    // "Original storniert, aber ohne Gutschrift").
    async storniereRechnung(updatedOriginal, stornoDoc) {
        if (!updatedOriginal || updatedOriginal.id == null) {
            throw new Error('Storno: Original-Rechnung bzw. ID fehlt.');
        }
        if (!stornoDoc || !stornoDoc.nr) {
            throw new Error('Storno: Die Gutschrift benötigt eine gültige Belegnummer.');
        }

        const tx = db.transaction((origPatch, storno) => {
            const orig = db.prepare('SELECT id, nr, status FROM dokumente WHERE id = ?').get(origPatch.id);
            if (!orig) throw new Error(`Dokument mit ID ${origPatch.id} wurde nicht gefunden.`);

            // 1. Original über den schmalen Status-Pfad setzen (audit-protokolliert,
            //    auch an gesperrten Belegen erlaubt - GoBD).
            const neuerStatus = origPatch.status || 'Storniert';
            db.prepare('UPDATE dokumente SET status = ? WHERE id = ?').run(neuerStatus, orig.id);
            appendAuditLog({
                entityType: 'DOCUMENT',
                entityId: orig.id,
                action: 'STATUS_GEÄNDERT',
                details: {
                    nr: orig.nr,
                    vorherigerStatus: orig.status,
                    neuerStatus
                }
            });

            // 2. Gutschrift in derselben Transaktion anlegen (inkl. Audit).
            return applyDocumentWrite(storno, storno.isLocked ? 1 : 0);
        });

        const stornoId = tx(updatedOriginal, stornoDoc);
        return { success: true, originalId: updatedOriginal.id, stornoId };
    },

// --- GoBD: Prüfung der Audit-Hashkette ---
    verifiziereAuditKette() {
        return auditLogger.verifiziereAuditKette();
    },

        // Interne Hilfsfunktionen für Belegschreibzugriffe (auch für Dauerrechnungen)
        getDocumentWithChildren,
        isLockedInt,
        applyDocumentWrite,
        insertVerrechnungenGuarded
    };

    return repo;
}

module.exports = createDocumentRepo;
