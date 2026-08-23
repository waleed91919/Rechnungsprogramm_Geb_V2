const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let dbPath;
try {
    // Try to get the path from Electron's app module
    const { app } = require('electron');
    if (app) {
        dbPath = path.join(app.getPath('userData'), 'database.sqlite');
    } else {
        dbPath = path.join(__dirname, 'database.sqlite');
    }
} catch (e) {
    // Fallback for testing or scripts outside of Electron
    dbPath = path.join(__dirname, 'database.sqlite');
}
// Explicit override (e.g. isolated test databases)
if (process.env.RECHNUNGSPROGRAMM_DB_PATH) {
    dbPath = process.env.RECHNUNGSPROGRAMM_DB_PATH;
}

console.log('Database path:', dbPath);
const db = new Database(dbPath, { verbose: console.log });

// Enable security and performance features (WAL Mode, Foreign Keys)
db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 30000000000;
    PRAGMA page_size = 4096;
`);

const { createSchema, runMigrations, seedDefaultData } = require('./schema.js');
const { createAuditLogger, calculateDocumentContentHash } = require('./main/audit.js');

console.log('Connected to the SQLite database using better-sqlite3 (Expert Mode).');
initDb();

// Zentrale GoBD-Audit-Hashkette (nach Schema-Init, damit audit_logs existiert)
const auditLogger = createAuditLogger(db);
const appendAuditLog = auditLogger.appendAuditLog;

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

        const existingWasLocked = !!existing.isLocked;
        if (existingWasLocked) {
            // GoBD-Änderungssperre: Entsperren NUR über entsperreBeleg()
            if (requestedLockedInt === 0) {
                throw new Error(`Beleg ${existing.nr} ist gesperrt (GoBD). Eine Freigabe ist nur über die explizite Funktion 'Beleg entsperren' mit Begründung möglich.`);
            }
            // GoBD-Änderungssperre: Nur Buchhaltungs-/Statusfelder änderbar
            const oldContentHash = calculateDocumentContentHash(existing);
            const newContentHash = calculateDocumentContentHash(d);
            if (oldContentHash !== newContentHash) {
                throw new Error(`Beleg ${existing.nr} ist gesperrt (GoBD-Änderungssperre): Inhaltsfelder dürfen nicht mehr geändert werden. Bitte erstellen Sie eine Stornorechnung/Korrekturrechnung.`);
            }
        }
    }

    // Datenintegrität: Belegnummer darf nur an DIESER Beleg selbst vergeben sein
    // (gilt für Neu-Anlage UND Update; bei gesperrten Belegen greift vorher die
    // GoBD-Änderungssperre über den Inhalts-Hash). Der UNIQUE-Index auf dokumente(nr)
    // greift zusätzlich als letzter Riegel; hier mit deutscher Fehlermeldung.
    const nrConflict = db.prepare('SELECT id FROM dokumente WHERE nr = ? AND id IS NOT ?').get(d.nr, docId == null ? null : docId);
    if (nrConflict) {
        throw new Error(`Die Belegnummer "${d.nr}" ist bereits vergeben (Dokument #${nrConflict.id}). Bitte verwenden Sie eine andere Nummer.`);
    }

    if (docId) {

        const updateStmt = db.prepare('UPDATE dokumente SET type=?, nr=?, datum=?, faellig=?, kundeId=?, projektId=?, status=?, isLocked=?, netto=?, steuer=?, brutto=?, globalRabattAbzug=?, globalRabattType=?, globalRabattValue=?, anzahlung=?, mahnungLevel=?, mahnungDatum=?, mahnungGebuehr=?, eingabemodus=?, vortext=?, fusstext=?, leistungszeitraum_von=?, leistungszeitraum_bis=?, baustellen_adresse=?, vob_vereinbart=?, ist_privatkunde=?, unterliegt_bauabzugsteuer=?, bauabzugsteuer_betrag=?, ausweis_35a_erforderlich=?, summe_lohnkosten_brutto=?, rechnungsart=?, kumulierte_leistung_netto=?, sicherheitseinbehalt=?, unterliegt_13b=?, leitweg_id=?, buyer_reference=?, sha256_hash=? WHERE id=?');
        updateStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, isLockedInt(d), d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.mahnungLevel || 0, d.mahnungDatum || null, d.mahnungGebuehr || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.sha256_hash || null, docId);

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

        const deletePosStmt = db.prepare('DELETE FROM positionen WHERE dokumentId=?');
        deletePosStmt.run(docId);
        const deleteVerrechnungStmt = db.prepare('DELETE FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?');
        deleteVerrechnungStmt.run(docId);
    } else {
        const insertStmt = db.prepare('INSERT INTO dokumente (type, nr, datum, faellig, kundeId, projektId, status, isLocked, netto, steuer, brutto, globalRabattAbzug, globalRabattType, globalRabattValue, anzahlung, eingabemodus, vortext, fusstext, leistungszeitraum_von, leistungszeitraum_bis, baustellen_adresse, vob_vereinbart, ist_privatkunde, unterliegt_bauabzugsteuer, bauabzugsteuer_betrag, ausweis_35a_erforderlich, summe_lohnkosten_brutto, rechnungsart, kumulierte_leistung_netto, sicherheitseinbehalt, unterliegt_13b, leitweg_id, buyer_reference, sha256_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const res = insertStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, isLockedInt(d), d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.sha256_hash || null);
        docId = res.lastInsertRowid;
    }

    // Insert new positions and deduct stock
    if (d.positionen && d.positionen.length > 0) {
        const insertPosStmt = db.prepare('INSERT INTO positionen (dokumentId, artikelId, name, menge, einheit, preis, ek, mwst, rabatt, steuer_schluessel, is13b, cost_type, oz_code, is_tax_deductible_35a) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const stockDeductionMap = new Map();

        for (const p of d.positionen) {
            insertPosStmt.run(docId, p.artikelId || null, p.name || null, p.menge, p.einheit || 'Stk.', p.preis, p.ek || 0, p.mwst, p.rabatt || 0, p.steuer_schluessel || null, p.is13b ? 1 : 0, p.cost_type || 'MATERIAL', p.oz_code || null, p.is_tax_deductible_35a ? 1 : 0);

            if (d.type === 'rechnung' && p.artikelId) {
                stockDeductionMap.set(p.artikelId, (stockDeductionMap.get(p.artikelId) || 0) + p.menge);
            }
        }

        if (stockDeductionMap.size > 0) {
            // Optimization idea rejected: Dynamic CASE ... WHEN ... THEN SQL string approach is discouraged.
            // Relying on a Node-level loop executing a prepared statement strictly within a single SQLite
            // transaction is highly performant in better-sqlite3, much safer, and significantly easier to read.
            const deductStockStmt = db.prepare('UPDATE artikel SET bestand = bestand - ? WHERE id=?');
            for (const [artId, qty] of stockDeductionMap.entries()) {
                deductStockStmt.run(qty, artId);
            }
        }
    }

    insertVerrechnungenGuarded(docId, d.verrechnungen);

    // GoBD: Audit-Eintrag INNERHALB derselben Transaktion - schlägt er
    // fehl, wird die gesamte Mutation zurückgerollt.
    appendAuditLog({
        entityType: 'DOCUMENT',
        entityId: docId,
        action,
        details: {
            nr: d.nr,
            type: d.type,
            status: d.status,
            vorherigerStatus: existing ? existing.status : null,
            isLocked: isLockedInt(d) === 1,
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
function insertVerrechnungenGuarded(docId, verrechnungen) {
    if (!verrechnungen || verrechnungen.length === 0) return;

    const checkUsedStmt = db.prepare('SELECT aktuelle_rechnung_id FROM rechnung_verrechnungen WHERE vorherige_rechnung_id = ? AND aktuelle_rechnung_id != ?');
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
            throw new Error(`Doppelverrechnung blockiert: Die Rechnung #${v.vorherige_rechnung_id} ist bereits in Rechnung #${usedBy.aktuelle_rechnung_id} verrechnet und kann nicht erneut abgezogen werden.`);
        }
    }

    const insertVerrechnungStmt = db.prepare('INSERT INTO rechnung_verrechnungen (aktuelle_rechnung_id, vorherige_rechnung_id, abzugsbetrag_netto) VALUES (?, ?, ?)');
    for (const v of verrechnungen) {
        if (!v || !v.vorherige_rechnung_id) continue;
        insertVerrechnungStmt.run(docId, v.vorherige_rechnung_id, v.abzugsbetrag_netto || 0);
    }
}

function initDb() {
    createSchema(db);
    runMigrations(db);
    seedDefaultData(db);
}

// Utility wrappers exposing Promises to conform to the previous API signature
const dbQuery = async (sql, params = []) => {
    return db.prepare(sql).all(params);
};

const dbRun = async (sql, params = []) => {
    const info = db.prepare(sql).run(params);
    return { id: info.lastInsertRowid, changes: info.changes };
};

const dbAPI = {
    // --- Initial Full State Load (for init.js) ---
    async getFullState() {
        const state = {
            artikel: await dbQuery('SELECT * FROM artikel'),
            kunden: await dbQuery('SELECT * FROM kunden'),
            rechnungen: [],
            angebote: [],
            projekte: await dbQuery('SELECT * FROM projekte'),
            einstellungen: {}
        };

        // Load settings
        const settingsRows = await dbQuery('SELECT * FROM einstellungen');
        settingsRows.forEach(row => state.einstellungen[row.key] = row.value);

        // Load documents
        const docs = await dbQuery('SELECT * FROM dokumente');
        const posRows = await dbQuery('SELECT * FROM positionen');
        const verrechnungenRows = await dbQuery('SELECT * FROM rechnung_verrechnungen');

        docs.forEach(d => {
            d.isLocked = !!d.isLocked; // Convert 1/0 to true/false
            d.positionen = posRows.filter(p => p.dokumentId === d.id);
            d.verrechnungen = verrechnungenRows.filter(v => v.aktuelle_rechnung_id === d.id);
            if (d.type === 'rechnung') {
                state.rechnungen.push(d);
            } else if (d.type === 'angebot') {
                state.angebote.push(d);
            }
        });

        // Load aufmasse
        const aufmassRows = await dbQuery('SELECT * FROM aufmass');
        const aufmassPosRows = await dbQuery('SELECT * FROM aufmass_positionen');
        aufmassRows.forEach(a => {
            a.positionen = aufmassPosRows.filter(p => p.aufmass_id === a.id);
        });
        state.aufmasse = aufmassRows;

        return state;
    },

    // --- Aufmaß ---
    async getAufmassById(id) {
        const aufmass = db.prepare('SELECT * FROM aufmass WHERE id=?').get(id);
        if (aufmass) {
            aufmass.positionen = db.prepare('SELECT * FROM aufmass_positionen WHERE aufmass_id=? ORDER BY sortier_index ASC').all(id);
        }
        return aufmass || null;
    },

    async getAufmassByPositionId(positionId) {
        if (!positionId) return null;
        const posIdStr = String(positionId);
        const aufmass = db.prepare('SELECT * FROM aufmass WHERE position_id=?').get(posIdStr);
        if (aufmass) {
            aufmass.positionen = db.prepare('SELECT * FROM aufmass_positionen WHERE aufmass_id=? ORDER BY sortier_index ASC').all(aufmass.id);
        }
        return aufmass || null;
    },

    async saveAufmassForPosition(positionId, data) {
        if (!positionId) return null;
        const posIdStr = String(positionId);

        const saveTransaction = db.transaction((aufmassData) => {
            let existing = db.prepare('SELECT id FROM aufmass WHERE position_id=?').get(posIdStr);
            let aufmassId;

            if (existing) {
                aufmassId = existing.id;
                db.prepare('UPDATE aufmass SET titel=?, rechnung_id=?, projekt_id=?, bemerkung=?, einheit=? WHERE id=?')
                  .run(aufmassData.titel || ('Aufmaß Position ' + posIdStr), aufmassData.rechnung_id || null, aufmassData.projekt_id || null, aufmassData.bemerkung || '', aufmassData.einheit || 'm²', aufmassId);
                db.prepare('DELETE FROM aufmass_positionen WHERE aufmass_id=?').run(aufmassId);
            } else {
                const info = db.prepare('INSERT INTO aufmass (position_id, titel, rechnung_id, projekt_id, bemerkung, einheit) VALUES (?, ?, ?, ?, ?, ?)')
                  .run(posIdStr, aufmassData.titel || ('Aufmaß Position ' + posIdStr), aufmassData.rechnung_id || null, aufmassData.projekt_id || null, aufmassData.bemerkung || '', aufmassData.einheit || 'm²');
                aufmassId = info.lastInsertRowid;
            }

            if (aufmassData.positionen && Array.isArray(aufmassData.positionen)) {
                const insertPos = db.prepare('INSERT INTO aufmass_positionen (aufmass_id, raum, bezeichnung, formel, ergebnis, einheit, sortier_index) VALUES (?, ?, ?, ?, ?, ?, ?)');
                aufmassData.positionen.forEach((p, idx) => {
                    const label = p.raum || p.bezeichnung || '';
                    insertPos.run(aufmassId, label, label, p.formel || '', p.ergebnis || 0, p.einheit || 'm²', idx);
                });
            }

            return aufmassId;
        });

        return saveTransaction(data);
    },

    async getAufmasseByRechnungId(rechnungId) {
        const list = db.prepare('SELECT * FROM aufmass WHERE rechnung_id=?').all(rechnungId);
        list.forEach(a => {
            a.positionen = db.prepare('SELECT * FROM aufmass_positionen WHERE aufmass_id=? ORDER BY sortier_index ASC').all(a.id);
        });
        return list;
    },

    async getAufmasseByProjektId(projektId) {
        const list = db.prepare('SELECT * FROM aufmass WHERE projekt_id=?').all(projektId);
        list.forEach(a => {
            a.positionen = db.prepare('SELECT * FROM aufmass_positionen WHERE aufmass_id=? ORDER BY sortier_index ASC').all(a.id);
        });
        return list;
    },

    async saveAufmass(aufmass) {
        const saveTransaction = db.transaction((data) => {
            let aufmassId = data.id;
            if (aufmassId) {
                db.prepare('UPDATE aufmass SET titel=?, rechnung_id=?, projekt_id=?, bemerkung=? WHERE id=?')
                  .run(data.titel, data.rechnung_id || null, data.projekt_id || null, data.bemerkung || '', aufmassId);
                db.prepare('DELETE FROM aufmass_positionen WHERE aufmass_id=?').run(aufmassId);
            } else {
                const info = db.prepare('INSERT INTO aufmass (titel, rechnung_id, projekt_id, bemerkung) VALUES (?, ?, ?, ?)')
                  .run(data.titel, data.rechnung_id || null, data.projekt_id || null, data.bemerkung || '');
                aufmassId = info.lastInsertRowid;
            }

            if (data.positionen && Array.isArray(data.positionen)) {
                const insertPos = db.prepare('INSERT INTO aufmass_positionen (aufmass_id, raum, bezeichnung, formel, ergebnis, einheit, sortier_index) VALUES (?, ?, ?, ?, ?, ?, ?)');
                data.positionen.forEach((p, idx) => {
                    insertPos.run(aufmassId, p.raum || '', p.bezeichnung || '', p.formel || '', p.ergebnis || 0, p.einheit || 'm²', idx);
                });
            }

            return aufmassId;
        });

        return saveTransaction(aufmass);
    },

    async deleteAufmass(id) {
        const delTransaction = db.transaction((aufmassId) => {
            db.prepare('DELETE FROM aufmass_positionen WHERE aufmass_id=?').run(aufmassId);
            db.prepare('DELETE FROM aufmass WHERE id=?').run(aufmassId);
        });
        return delTransaction(id);
    },

    // --- Artikel ---
    async saveArtikel(artikel) {
        if (artikel.id) {
            await dbRun(
                'UPDATE artikel SET name=?, ean=?, beschreibung=?, ek=?, vk=?, mwst=?, bestand=?, lieferant=?, katalog=?, ist_bauleistung=?, kostenart=?, lohnanteil_prozent=? WHERE id=?',
                [artikel.name, artikel.ean, artikel.beschreibung, artikel.ek, artikel.vk, artikel.mwst, artikel.bestand, artikel.lieferant, artikel.katalog, artikel.ist_bauleistung || 0, artikel.kostenart || 'MATERIAL', artikel.lohnanteil_prozent || 0, artikel.id]
            );
            return artikel.id;
        } else {
            const res = await dbRun(
                'INSERT INTO artikel (name, ean, beschreibung, ek, vk, mwst, bestand, lieferant, katalog, ist_bauleistung, kostenart, lohnanteil_prozent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [artikel.name, artikel.ean, artikel.beschreibung, artikel.ek, artikel.vk, artikel.mwst, artikel.bestand, artikel.lieferant, artikel.katalog, artikel.ist_bauleistung || 0, artikel.kostenart || 'MATERIAL', artikel.lohnanteil_prozent || 0]
            );
            return res.id;
        }
    },
    async deleteArtikel(id) {
        return await dbRun('DELETE FROM artikel WHERE id=?', [id]);
    },

    // --- Kunden ---
    async saveKunde(kunde) {
        // § 48b: sec48b_valid_until ist fachlich die Gültigkeit der Freistellungsbescheinigung;
        // falls nicht explizit gesetzt, wird sie aus freistellung_gueltig_bis gespiegelt.
        const sec48bValidUntil = kunde.sec48b_valid_until !== undefined ? kunde.sec48b_valid_until : (kunde.freistellung_gueltig_bis || null);
        if (kunde.id) {
            await dbRun(
                'UPDATE kunden SET kundennummer=?, name=?, adresse=?, plz=?, ort=?, telefon=?, email=?, ustId=?, ist_bauleistender_13b=?, ust_1_tg_gueltig_bis=?, hat_freistellungsbescheinigung=?, freistellung_gueltig_bis=?, ist_umsatzsteuerfreie_vermietung=?, customer_type=?, leitweg_id=?, peppol_id=?, buyer_reference=?, tax_number=?, sec48b_status=?, sec48b_certificate_path=?, is_subcontractor=?, sec48b_valid_until=? WHERE id=?',
                [kunde.kundennummer, kunde.name, kunde.adresse, kunde.plz, kunde.ort, kunde.telefon, kunde.email, kunde.ustId, kunde.ist_bauleistender_13b || 0, kunde.ust_1_tg_gueltig_bis, kunde.hat_freistellungsbescheinigung || 0, kunde.freistellung_gueltig_bis, kunde.ist_umsatzsteuerfreie_vermietung || 0, kunde.customer_type || 'B2C', kunde.leitweg_id || null, kunde.peppol_id || null, kunde.buyer_reference || null, kunde.tax_number || null, kunde.sec48b_status || 'NONE', kunde.sec48b_certificate_path || null, kunde.is_subcontractor ? 1 : 0, sec48bValidUntil, kunde.id]
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
                'INSERT INTO kunden (kundennummer, name, adresse, plz, ort, telefon, email, ustId, ist_bauleistender_13b, ust_1_tg_gueltig_bis, hat_freistellungsbescheinigung, freistellung_gueltig_bis, ist_umsatzsteuerfreie_vermietung, customer_type, leitweg_id, peppol_id, buyer_reference, tax_number, sec48b_status, sec48b_certificate_path, is_subcontractor, sec48b_valid_until, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                [knr, kunde.name, kunde.adresse, kunde.plz, kunde.ort, kunde.telefon, kunde.email, kunde.ustId, kunde.ist_bauleistender_13b || 0, kunde.ust_1_tg_gueltig_bis, kunde.hat_freistellungsbescheinigung || 0, kunde.freistellung_gueltig_bis, kunde.ist_umsatzsteuerfreie_vermietung || 0, kunde.customer_type || 'B2C', kunde.leitweg_id || null, kunde.peppol_id || null, kunde.buyer_reference || null, kunde.tax_number || null, kunde.sec48b_status || 'NONE', kunde.sec48b_certificate_path || null, kunde.is_subcontractor ? 1 : 0, sec48bValidUntil]
            );
            return res.id;
        }
    },
    async deleteKunde(id) {
        return await dbRun('DELETE FROM kunden WHERE id=?', [id]);
    },

    // --- Kunden (Bulk Save) ---
    async bulkSaveKunden(kunden) {
        if (!kunden || !Array.isArray(kunden) || kunden.length === 0) return [];

        const bulkTransaction = db.transaction((kundenList) => {
            const updateStmt = db.prepare('UPDATE kunden SET kundennummer=?, name=?, adresse=?, plz=?, ort=?, telefon=?, email=?, ustId=?, ist_bauleistender_13b=?, ust_1_tg_gueltig_bis=?, hat_freistellungsbescheinigung=?, freistellung_gueltig_bis=?, ist_umsatzsteuerfreie_vermietung=?, customer_type=?, leitweg_id=?, peppol_id=?, buyer_reference=?, tax_number=?, sec48b_status=?, sec48b_certificate_path=?, is_subcontractor=?, sec48b_valid_until=? WHERE id=?');
            const insertStmt = db.prepare('INSERT INTO kunden (kundennummer, name, adresse, plz, ort, telefon, email, ustId, ist_bauleistender_13b, ust_1_tg_gueltig_bis, hat_freistellungsbescheinigung, freistellung_gueltig_bis, ist_umsatzsteuerfreie_vermietung, customer_type, leitweg_id, peppol_id, buyer_reference, tax_number, sec48b_status, sec48b_certificate_path, is_subcontractor, sec48b_valid_until, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');

            const ids = [];
            for (const k of kundenList) {
                const sec48bValidUntil = k.sec48b_valid_until !== undefined ? k.sec48b_valid_until : (k.freistellung_gueltig_bis || null);
                if (k.id) {
                    updateStmt.run(k.kundennummer, k.name, k.adresse, k.plz, k.ort, k.telefon, k.email, k.ustId, k.ist_bauleistender_13b || 0, k.ust_1_tg_gueltig_bis, k.hat_freistellungsbescheinigung || 0, k.freistellung_gueltig_bis, k.ist_umsatzsteuerfreie_vermietung || 0, k.customer_type || 'B2C', k.leitweg_id || null, k.peppol_id || null, k.buyer_reference || null, k.tax_number || null, k.sec48b_status || 'NONE', k.sec48b_certificate_path || null, k.is_subcontractor ? 1 : 0, sec48bValidUntil, k.id);
                    ids.push(k.id);
                } else {
                    let knr = k.kundennummer;
                    if (!knr) {
                        const row = db.prepare('SELECT MAX(id) as mx FROM kunden').get();
                        const nextId = (row && row.mx) ? row.mx + 1 : 1;
                        knr = `KD-${1000 + nextId}`;
                    }
                    const res = insertStmt.run(knr, k.name, k.adresse, k.plz, k.ort, k.telefon, k.email, k.ustId, k.ist_bauleistender_13b || 0, k.ust_1_tg_gueltig_bis, k.hat_freistellungsbescheinigung || 0, k.freistellung_gueltig_bis, k.ist_umsatzsteuerfreie_vermietung || 0, k.customer_type || 'B2C', k.leitweg_id || null, k.peppol_id || null, k.buyer_reference || null, k.tax_number || null, k.sec48b_status || 'NONE', k.sec48b_certificate_path || null, k.is_subcontractor ? 1 : 0, sec48bValidUntil);
                    ids.push(res.lastInsertRowid);
                }
            }
            return ids;
        });

        return bulkTransaction(kunden);
    },

    // --- Dokumente (Rechnungen/Angebote) ---
    async saveDocument(doc) {
        const requestedLockedInt = doc.isLocked ? 1 : 0;

        // Wrap the document and position saving in a transaction for data integrity
        const saveTransaction = db.transaction((d) => applyDocumentWrite(d, requestedLockedInt));

        return saveTransaction(doc);
    },


    // --- Dokumente (Bulk Save) ---
    async bulkSaveDocuments(docs) {
        if (!docs || !Array.isArray(docs) || docs.length === 0) return [];

        const bulkTransaction = db.transaction((docsList) => {
            const updateStmt = db.prepare('UPDATE dokumente SET type=?, nr=?, datum=?, faellig=?, kundeId=?, projektId=?, status=?, isLocked=?, netto=?, steuer=?, brutto=?, globalRabattAbzug=?, globalRabattType=?, globalRabattValue=?, anzahlung=?, mahnungLevel=?, mahnungDatum=?, mahnungGebuehr=?, eingabemodus=?, vortext=?, fusstext=?, leistungszeitraum_von=?, leistungszeitraum_bis=?, baustellen_adresse=?, vob_vereinbart=?, ist_privatkunde=?, unterliegt_bauabzugsteuer=?, bauabzugsteuer_betrag=?, ausweis_35a_erforderlich=?, summe_lohnkosten_brutto=?, rechnungsart=?, kumulierte_leistung_netto=?, sicherheitseinbehalt=?, unterliegt_13b=?, leitweg_id=?, buyer_reference=?, sha256_hash=? WHERE id=?');
            const insertDocStmt = db.prepare('INSERT INTO dokumente (type, nr, datum, faellig, kundeId, projektId, status, isLocked, netto, steuer, brutto, globalRabattAbzug, globalRabattType, globalRabattValue, anzahlung, eingabemodus, vortext, fusstext, leistungszeitraum_von, leistungszeitraum_bis, baustellen_adresse, vob_vereinbart, ist_privatkunde, unterliegt_bauabzugsteuer, bauabzugsteuer_betrag, ausweis_35a_erforderlich, summe_lohnkosten_brutto, rechnungsart, kumulierte_leistung_netto, sicherheitseinbehalt, unterliegt_13b, leitweg_id, buyer_reference, sha256_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            const deletePosStmt = db.prepare('DELETE FROM positionen WHERE dokumentId=?');
            const deleteVerrechnungStmt = db.prepare('DELETE FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?');
            const insertPosStmt = db.prepare('INSERT INTO positionen (dokumentId, artikelId, name, menge, einheit, preis, ek, mwst, rabatt, steuer_schluessel, is13b, cost_type, oz_code, is_tax_deductible_35a) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            const restoreStockStmt = db.prepare('UPDATE artikel SET bestand = bestand + ? WHERE id=?');
            const deductStockStmt = db.prepare('UPDATE artikel SET bestand = bestand - ? WHERE id=?');

            const docIds = [];

            for (const d of docsList) {
                let docId = d.id;
                let existing = null;
                let action = 'ERSTELLT';

                // GoBD: Inhalts-Hash konsistent berechnen und persistieren
                d.sha256_hash = calculateDocumentContentHash(d);

                if (docId) {
                    existing = getDocumentWithChildren(docId);
                    if (!existing) {
                        throw new Error(`Dokument mit ID ${docId} wurde nicht gefunden.`);
                    }

                    if (existing.isLocked) {
                        // GoBD-Änderungssperre: Entsperren NUR über entsperreBeleg()
                        if (!d.isLocked) {
                            throw new Error(`Beleg ${existing.nr} ist gesperrt (GoBD). Eine Freigabe ist nur über die explizite Funktion 'Beleg entsperren' mit Begründung möglich.`);
                        }
                        // GoBD-Änderungssperre: Nur Buchhaltungs-/Statusfelder änderbar
                        const oldContentHash = calculateDocumentContentHash(existing);
                        const newContentHash = calculateDocumentContentHash(d);
                        if (oldContentHash !== newContentHash) {
                            throw new Error(`Beleg ${existing.nr} ist gesperrt (GoBD-Änderungssperre): Inhaltsfelder dürfen nicht mehr geändert werden. Bitte erstellen Sie eine Stornorechnung/Korrekturrechnung.`);
                        }
                    }

                    updateStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, isLockedInt(d), d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.mahnungLevel || 0, d.mahnungDatum || null, d.mahnungGebuehr || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.sha256_hash || null, docId);

                    action = (calculateDocumentContentHash(existing) === calculateDocumentContentHash(d)) ? 'STATUS_GEÄNDERT' : 'GEÄNDERT';

                    if (d.type === 'rechnung') {
                        // Restore stock
                        const oldPositions = db.prepare('SELECT artikelId, menge FROM positionen WHERE dokumentId=?').all(docId);
                        if (oldPositions.length > 0) {
                            const restoreStockMap = new Map();
                            for (const p of oldPositions) {
                                if (p.artikelId) {
                                    restoreStockMap.set(p.artikelId, (restoreStockMap.get(p.artikelId) || 0) + p.menge);
                                }
                            }
                            for (const [artId, qty] of restoreStockMap.entries()) {
                                restoreStockStmt.run(qty, artId);
                            }
                        }
                    }

                    deletePosStmt.run(docId);
                    deleteVerrechnungStmt.run(docId);
                } else {
                    const res = insertDocStmt.run(d.type, d.nr, d.datum, d.faellig, d.kundeId, d.projektId, d.status, isLockedInt(d), d.netto, d.steuer, d.brutto, d.globalRabattAbzug || 0, d.globalRabattType || '%', d.globalRabattValue || 0, d.anzahlung || 0, d.eingabemodus || 'netto', d.vortext, d.fusstext, d.leistungszeitraum_von, d.leistungszeitraum_bis, d.baustellen_adresse, d.vob_vereinbart || 0, d.ist_privatkunde || 0, d.unterliegt_bauabzugsteuer || 0, d.bauabzugsteuer_betrag || 0, d.ausweis_35a_erforderlich || 0, d.summe_lohnkosten_brutto || 0, d.rechnungsart || 'REGULAER', d.kumulierte_leistung_netto || 0, d.sicherheitseinbehalt || 0, d.unterliegt_13b || 0, d.leitweg_id || null, d.buyer_reference || null, d.sha256_hash || null);
                    docId = res.lastInsertRowid;
                }

                if (d.positionen && d.positionen.length > 0) {
                    const stockDeductionMap = new Map();

                    for (const p of d.positionen) {
                        insertPosStmt.run(docId, p.artikelId || null, p.name || null, p.menge, p.einheit || 'Stk.', p.preis, p.ek || 0, p.mwst, p.rabatt || 0, p.steuer_schluessel || null, p.is13b ? 1 : 0, p.cost_type || 'MATERIAL', p.oz_code || null, p.is_tax_deductible_35a ? 1 : 0);

                        if (d.type === 'rechnung' && p.artikelId) {
                            stockDeductionMap.set(p.artikelId, (stockDeductionMap.get(p.artikelId) || 0) + p.menge);
                        }
                    }

                    if (stockDeductionMap.size > 0) {
                        for (const [artId, qty] of stockDeductionMap.entries()) {
                            deductStockStmt.run(qty, artId);
                        }
                    }
                }
                
                insertVerrechnungenGuarded(docId, d.verrechnungen);

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
                        isLocked: isLockedInt(d) === 1,
                        brutto: d.brutto || 0,
                        sha256_hash: d.sha256_hash
                    }
                });

                docIds.push(docId);
            }
            return docIds;
        });

        return bulkTransaction(docs);
    },

    async deleteDocument(id) {
        const delTransaction = db.transaction((docId) => {
            // SELECT fetches only strictly necessary columns.
            const doc = db.prepare('SELECT type, nr, status, isLocked FROM dokumente WHERE id=?').get(docId);
            if (!doc) return 0;

            // GoBD-Löschsperre: Gesperrte Belege dürfen nicht gelöscht werden
            if (doc.isLocked) {
                throw new Error(`Beleg ${doc.nr} ist gesperrt (GoBD-Löschsperre) und kann nicht gelöscht werden. Bitte verwenden Sie eine Stornorechnung.`);
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

    // --- GoBD: Expliziter Freigabe-Weg (isLocked true -> false), audit-pflichtig ---
    async entsperreBeleg(id, grund) {
        if (typeof id !== 'number') throw new Error('Ungültige Dokumenten-ID');
        if (!grund || typeof grund !== 'string' || !grund.trim()) {
            throw new Error('Entsperren ohne Begründung ist nicht erlaubt (GoBD-Auditpflicht).');
        }

        const tx = db.transaction((docId, begruendung) => {
            const doc = db.prepare('SELECT id, nr, status FROM dokumente WHERE id=?').get(docId);
            if (!doc) throw new Error(`Dokument mit ID ${docId} wurde nicht gefunden.`);

            const info = db.prepare('UPDATE dokumente SET isLocked=0 WHERE id=? AND isLocked=1').run(docId);
            if (info.changes === 0) {
                return { success: true, id: docId, alreadyUnlocked: true };
            }

            appendAuditLog({
                entityType: 'DOCUMENT',
                entityId: docId,
                action: 'ENTSPERRT',
                details: { nr: doc.nr, status: doc.status, grund: begruendung }
            });
            return { success: true, id: docId, alreadyUnlocked: false };
        });
        return tx(id, grund.trim());
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

    // --- Aufmaßcenter (REB 23.003 & DA11) ---
    async getAufmassBlaetter(projectId) {
        const blaetter = await dbQuery('SELECT * FROM aufmass_blaetter WHERE project_id = ? ORDER BY id ASC', [projectId]);
        for (const blatt of blaetter) {
            blatt.zeilen = await dbQuery('SELECT * FROM aufmass_zeilen WHERE blatt_id = ? ORDER BY zeilen_nr ASC', [blatt.id]);
        }
        return blaetter;
    },

    async saveAufmassBlatt(blattData, zeilen = []) {
        const tx = db.transaction((b, zList) => {
            let blattId = b.id;
            if (blattId) {
                db.prepare('UPDATE aufmass_blaetter SET blatt_nummer=?, titel=?, status=?, invoice_id=? WHERE id=?')
                  .run(b.blatt_nummer, b.titel, b.status || 'DRAFT', b.invoice_id || null, blattId);
                db.prepare('DELETE FROM aufmass_zeilen WHERE blatt_id=?').run(blattId);
            } else {
                const info = db.prepare('INSERT INTO aufmass_blaetter (project_id, invoice_id, blatt_nummer, titel, status) VALUES (?, ?, ?, ?, ?)')
                               .run(b.project_id, b.invoice_id || null, b.blatt_nummer, b.titel, b.status || 'DRAFT');
                blattId = info.lastInsertRowid;
            }

            const insertZeile = db.prepare(`
                INSERT INTO aufmass_zeilen (blatt_id, oz_code, zeilen_nr, bezeichnung, formel_reb, rechenansatz, ergebnis, einheit, vorzeichen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            let idx = 1;
            for (const z of zList) {
                insertZeile.run(
                    blattId,
                    z.oz_code || '01.01.0010',
                    z.zeilen_nr || idx++,
                    z.bezeichnung || '',
                    z.formel_reb || '91',
                    z.rechenansatz || '',
                    z.ergebnis !== undefined ? z.ergebnis : 0,
                    z.einheit || 'm²',
                    z.vorzeichen !== undefined ? z.vorzeichen : 1
                );
            }
            return blattId;
        });
        return tx(blattData, zeilen);
    },

    async deleteAufmassBlatt(blattId) {
        const tx = db.transaction((id) => {
            db.prepare('DELETE FROM aufmass_zeilen WHERE blatt_id=?').run(id);
            db.prepare('DELETE FROM aufmass_blaetter WHERE id=?').run(id);
        });
        return tx(blattId);
    },

    async mergeSchlussaufmass(projectId) {
        // Aggregiert alle Aufmaßzeilen aller freigegebenen/verifizierten Blätter
        const rows = await dbQuery(`
            SELECT z.oz_code, z.einheit, SUM(z.ergebnis * z.vorzeichen) as summe_menge
            FROM aufmass_zeilen z
            JOIN aufmass_blaetter b ON z.blatt_id = b.id
            WHERE b.project_id = ? AND b.status IN ('VERIFIED', 'FINALIZED', 'SUBMITTED', 'DRAFT')
            GROUP BY z.oz_code, z.einheit
        `, [projectId]);
        return rows;
    },

    // --- Nachtragsverwaltung (VOB/B) ---
    async getNachtraege(projectId) {
        const rows = await dbQuery('SELECT * FROM nachtraege WHERE project_id = ? ORDER BY id ASC', [projectId]);
        for (const n of rows) {
            n.positionen = await dbQuery('SELECT * FROM nachtrag_positionen WHERE nachtrag_id = ? ORDER BY id ASC', [n.id]);
        }
        return rows;
    },

    async saveNachtrag(nachtragData, positionen = []) {
        const tx = db.transaction((n, posList) => {
            let nId = n.id;
            let sumNetto = 0;
            for (const p of posList) {
                sumNetto += (p.menge || 0) * (p.einheitspreis || 0);
            }
            const sumBrutto = sumNetto * 1.19;

            if (nId) {
                db.prepare(`
                    UPDATE nachtraege 
                    SET nachtrag_nr=?, titel=?, beschreibung=?, rechtsgrundlage=?, summe_netto=?, summe_brutto=?, status=?, eingereicht_am=?, entschieden_am=?, begruendung=?
                    WHERE id=?
                `).run(
                    n.nachtrag_nr, n.titel, n.beschreibung || '', n.rechtsgrundlage || 'VOB_2_6',
                    sumNetto, sumBrutto, n.status || 'EINGEREICHT', n.eingereicht_am || null, n.entschieden_am || null, n.begruendung || '', nId
                );
                db.prepare('DELETE FROM nachtrag_positionen WHERE nachtrag_id=?').run(nId);
            } else {
                const info = db.prepare(`
                    INSERT INTO nachtraege (project_id, nachtrag_nr, titel, beschreibung, rechtsgrundlage, summe_netto, summe_brutto, status, eingereicht_am, entschieden_am, begruendung)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    n.project_id, n.nachtrag_nr, n.titel, n.beschreibung || '', n.rechtsgrundlage || 'VOB_2_6',
                    sumNetto, sumBrutto, n.status || 'EINGEREICHT', n.eingereicht_am || null, n.entschieden_am || null, n.begruendung || ''
                );
                nId = info.lastInsertRowid;
            }

            const insertPos = db.prepare(`
                INSERT INTO nachtrag_positionen (nachtrag_id, oz_code, kurztext, langtext, menge, einheit, einheitspreis, gesamtpreis, cost_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const p of posList) {
                const gp = (p.menge || 0) * (p.einheitspreis || 0);
                insertPos.run(
                    nId,
                    p.oz_code || '',
                    p.kurztext || '',
                    p.langtext || '',
                    p.menge || 0,
                    p.einheit || 'Stk.',
                    p.einheitspreis || 0,
                    gp,
                    p.cost_type || 'MATERIAL'
                );
            }
            return nId;
        });
        return tx(nachtragData, positionen);
    },

    async updateNachtragStatus(nachtragId, status) {
        const decidedDate = (status === 'GENEHMIGT' || status === 'ABGELEHNT') ? new Date().toISOString().split('T')[0] : null;
        await dbRun('UPDATE nachtraege SET status = ?, entschieden_am = COALESCE(?, entschieden_am) WHERE id = ?', [status, decidedDate, nachtragId]);
        return { success: true };
    },

    async deleteNachtrag(nachtragId) {
        const tx = db.transaction((id) => {
            db.prepare('DELETE FROM nachtrag_positionen WHERE nachtrag_id=?').run(id);
            db.prepare('DELETE FROM nachtraege WHERE id=?').run(id);
        });
        return tx(nachtragId);
    },

    // --- Bautagebuch ---
    async getBautagebuch(projectId) {
        return await dbQuery('SELECT * FROM bautagebuch WHERE project_id = ? ORDER BY datum DESC, bericht_nr DESC', [projectId]);
    },

    async saveBautagebuch(data) {
        if (data.id) {
            await dbRun(`
                UPDATE bautagebuch 
                SET bericht_nr=?, datum=?, wetter=?, temperatur_min=?, temperatur_max=?, personal_eigen_anzahl=?, personal_eigen_stunden=?,
                    personal_sub_json=?, geraete_json=?, tagesbericht=?, vorkommnisse_behinderungen=?, unterzeichnet_bauleiter=?, fotos_json=?
                WHERE id=?
            `, [
                data.bericht_nr || 1, data.datum, data.wetter || '', data.temperatur_min || null, data.temperatur_max || null,
                data.personal_eigen_anzahl || 0, data.personal_eigen_stunden || 0,
                typeof data.personal_sub_json === 'object' ? JSON.stringify(data.personal_sub_json) : (data.personal_sub_json || '[]'),
                typeof data.geraete_json === 'object' ? JSON.stringify(data.geraete_json) : (data.geraete_json || '[]'),
                data.tagesbericht, data.vorkommnisse_behinderungen || '', data.unterzeichnet_bauleiter || 0,
                typeof data.fotos_json === 'object' ? JSON.stringify(data.fotos_json) : (data.fotos_json || '[]'),
                data.id
            ]);
            return data.id;
        } else {
            const res = await dbRun(`
                INSERT INTO bautagebuch (project_id, bericht_nr, datum, wetter, temperatur_min, temperatur_max, personal_eigen_anzahl, personal_eigen_stunden, personal_sub_json, geraete_json, tagesbericht, vorkommnisse_behinderungen, unterzeichnet_bauleiter, fotos_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.project_id, data.bericht_nr || 1, data.datum, data.wetter || '', data.temperatur_min || null, data.temperatur_max || null,
                data.personal_eigen_anzahl || 0, data.personal_eigen_stunden || 0,
                typeof data.personal_sub_json === 'object' ? JSON.stringify(data.personal_sub_json) : (data.personal_sub_json || '[]'),
                typeof data.geraete_json === 'object' ? JSON.stringify(data.geraete_json) : (data.geraete_json || '[]'),
                data.tagesbericht, data.vorkommnisse_behinderungen || '', data.unterzeichnet_bauleiter || 0,
                typeof data.fotos_json === 'object' ? JSON.stringify(data.fotos_json) : (data.fotos_json || '[]')
            ]);
            return res.id;
        }
    },

    async deleteBautagebuch(id) {
        return await dbRun('DELETE FROM bautagebuch WHERE id=?', [id]);
    },

    // --- Abnahmeprotokolle (VOB/B § 12) ---
    async getAbnahmeprotokolle(projectId) {
        return await dbQuery('SELECT * FROM abnahmeprotokolle WHERE project_id = ? ORDER BY datum DESC', [projectId]);
    },

    async saveAbnahmeprotokoll(data) {
        if (data.id) {
            await dbRun(`
                UPDATE abnahmeprotokolle 
                SET datum=?, ort=?, auftraggeber_vertreter=?, auftragnehmer_vertreter=?, abnahme_status=?, gewaehrleistung_beginn=?, gewaehrleistung_ende=?, gewaehrleistung_jahre=?, sicherheitseinbehalt_prozent=?, maengel_json=?, unterschrift_ag_data=?, unterschrift_an_data=?, pdf_pfad=?
                WHERE id=?
            `, [
                data.datum, data.ort, data.auftraggeber_vertreter, data.auftragnehmer_vertreter, data.abnahme_status,
                data.gewaehrleistung_beginn, data.gewaehrleistung_ende, data.gewaehrleistung_jahre || 4, data.sicherheitseinbehalt_prozent || 5.0,
                typeof data.maengel_json === 'object' ? JSON.stringify(data.maengel_json) : (data.maengel_json || '[]'),
                data.unterschrift_ag_data || '', data.unterschrift_an_data || '', data.pdf_pfad || '', data.id
            ]);
            return data.id;
        } else {
            const res = await dbRun(`
                INSERT INTO abnahmeprotokolle (project_id, datum, ort, auftraggeber_vertreter, auftragnehmer_vertreter, abnahme_status, gewaehrleistung_beginn, gewaehrleistung_ende, gewaehrleistung_jahre, sicherheitseinbehalt_prozent, maengel_json, unterschrift_ag_data, unterschrift_an_data, pdf_pfad)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.project_id, data.datum, data.ort, data.auftraggeber_vertreter, data.auftragnehmer_vertreter, data.abnahme_status,
                data.gewaehrleistung_beginn, data.gewaehrleistung_ende, data.gewaehrleistung_jahre || 4, data.sicherheitseinbehalt_prozent || 5.0,
                typeof data.maengel_json === 'object' ? JSON.stringify(data.maengel_json) : (data.maengel_json || '[]'),
                data.unterschrift_ag_data || '', data.unterschrift_an_data || '', data.pdf_pfad || ''
            ]);
            return res.id;
        }
    },

    // --- Eingangsrechnungen & Nachkalkulation ---
    async getEingangsrechnungen(projectId = null) {
        if (projectId) {
            return await dbQuery(`
                SELECT e.*, k.name as lieferant_name, k.sec48b_status, k.sec48b_valid_until
                FROM eingangsrechnungen e
                LEFT JOIN kunden k ON e.lieferant_id = k.id
                WHERE e.project_id = ?
                ORDER BY e.rechnungs_datum DESC
            `, [projectId]);
        }
        return await dbQuery(`
            SELECT e.*, k.name as lieferant_name, k.sec48b_status, k.sec48b_valid_until, p.name as projekt_name
            FROM eingangsrechnungen e
            LEFT JOIN kunden k ON e.lieferant_id = k.id
            LEFT JOIN projekte p ON e.project_id = p.id
            ORDER BY e.rechnungs_datum DESC
        `);
    },

    async saveEingangsrechnung(data) {
        // § 48b EStG Check
        let bauabzug = 0;
        let sec48bChecked = 0;
        if (data.lieferant_id) {
            const lieferant = db.prepare('SELECT * FROM kunden WHERE id = ?').get(data.lieferant_id);
            if (lieferant && lieferant.is_subcontractor) {
                sec48bChecked = 1;
                const today = new Date().toISOString().split('T')[0];
                const isValid = lieferant.sec48b_status === 'VALID' && (!lieferant.sec48b_valid_until || lieferant.sec48b_valid_until >= today);
                if (!isValid && data.kostenart === 'SUBCONTRACTOR') {
                    // 15 % Bauabzugsteuer einbehalten
                    bauabzug = Math.round((data.betrag_brutto || (data.betrag_netto * 1.19)) * 0.15 * 100) / 100;
                }
            }
        }

        const ust = data.betrag_ust !== undefined ? data.betrag_ust : Math.round(data.betrag_netto * ((data.steuersatz || 19) / 100) * 100) / 100;
        const brutto = data.betrag_brutto !== undefined ? data.betrag_brutto : Math.round((data.betrag_netto + ust) * 100) / 100;

        if (data.id) {
            await dbRun(`
                UPDATE eingangsrechnungen 
                SET project_id=?, lieferant_id=?, rechnungs_nr=?, rechnungs_datum=?, faelligkeits_datum=?, betrag_netto=?, steuersatz=?, betrag_ust=?, betrag_brutto=?, kostenart=?, sec48b_geprueft=?, bauabzugsteuer_einbehalten=?, zahlungs_status=?, bezahlt_am=?, beleg_pfad=?
                WHERE id=?
            `, [
                data.project_id || null, data.lieferant_id || null, data.rechnungs_nr, data.rechnungs_datum, data.faelligkeits_datum,
                data.betrag_netto, data.steuersatz || 19.0, ust, brutto, data.kostenart || 'MATERIAL',
                sec48bChecked, bauabzug, data.zahlungs_status || 'OFFEN', data.bezahlt_am || null, data.beleg_pfad || '', data.id
            ]);
            return { id: data.id, bauabzugsteuer: bauabzug };
        } else {
            const res = await dbRun(`
                INSERT INTO eingangsrechnungen (project_id, lieferant_id, rechnungs_nr, rechnungs_datum, faelligkeits_datum, betrag_netto, steuersatz, betrag_ust, betrag_brutto, kostenart, sec48b_geprueft, bauabzugsteuer_einbehalten, zahlungs_status, bezahlt_am, beleg_pfad)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.project_id || null, data.lieferant_id || null, data.rechnungs_nr, data.rechnungs_datum, data.faelligkeits_datum,
                data.betrag_netto, data.steuersatz || 19.0, ust, brutto, data.kostenart || 'MATERIAL',
                sec48bChecked, bauabzug, data.zahlungs_status || 'OFFEN', data.bezahlt_am || null, data.beleg_pfad || ''
            ]);
            return { id: res.id, bauabzugsteuer: bauabzug };
        }
    },

    async deleteEingangsrechnung(id) {
        return await dbRun('DELETE FROM eingangsrechnungen WHERE id=?', [id]);
    },

    // --- Projekt Controlling / Soll-Ist-Analyse ---
    async getControllingStats(projectId) {
        const projekt = db.prepare('SELECT * FROM projekte WHERE id = ?').get(projectId);
        if (!projekt) return null;

        // 1. Soll-Kosten aus verknüpften Angeboten
        const angebote = db.prepare("SELECT * FROM dokumente WHERE projektId = ? AND type = 'angebot'").all(projectId);
        let sollNetto = 0;
        let sollLohn = 0;
        let sollMaterial = 0;
        let sollGeraet = 0;
        let sollSub = 0;

        for (const ang of angebote) {
            sollNetto += ang.netto || 0;
            const pos = db.prepare('SELECT * FROM positionen WHERE dokumentId = ?').all(ang.id);
            for (const p of pos) {
                const gp = (p.menge || 0) * (p.preis || 0);
                if (p.cost_type === 'LOHN') sollLohn += gp;
                else if (p.cost_type === 'MATERIAL') sollMaterial += gp;
                else if (p.cost_type === 'GERÄT') sollGeraet += gp;
                else sollSub += gp;
            }
        }

        // Falls keine differenzierten Angebotspositionen vorliegen, nutze Projektbudget
        if (sollNetto === 0 && projekt.budget > 0) {
            sollNetto = projekt.budget;
        }

        // 2. Genehmigte Nachträge (Erhöhung des Soll-Auftragsvolumens)
        const nachtraege = db.prepare("SELECT * FROM nachtraege WHERE project_id = ? AND status = 'GENEHMIGT'").all(projectId);
        let nachtragNetto = 0;
        for (const n of nachtraege) {
            nachtragNetto += n.summe_netto || 0;
        }

        // 3. Ist-Kosten aus Eingangsrechnungen
        const eingangsrechnungen = db.prepare('SELECT * FROM eingangsrechnungen WHERE project_id = ?').all(projectId);
        let istMaterial = 0;
        let istSub = 0;
        let istGeraet = 0;
        let istSonstiges = 0;
        let bauabzugsteuerGesamt = 0;

        for (const er of eingangsrechnungen) {
            const netto = er.betrag_netto || 0;
            if (er.kostenart === 'MATERIAL') istMaterial += netto;
            else if (er.kostenart === 'SUBCONTRACTOR') istSub += netto;
            else if (er.kostenart === 'EQUIPMENT') istGeraet += netto;
            else istSonstiges += netto;
            bauabzugsteuerGesamt += er.bauabzugsteuer_einbehalten || 0;
        }

        // 4. Ist-Lohnkosten aus Bautagebuch
        const tagebuch = db.prepare('SELECT SUM(personal_eigen_stunden) as gesamt_stunden FROM bautagebuch WHERE project_id = ?').get(projectId);
        const istLohnStunden = (tagebuch && tagebuch.gesamt_stunden) || 0;
        const stundensatzStd = 55.00; // Kalkulatorischer Standard-Verrechnungssatz
        const istLohn = istLohnStunden * stundensatzStd;

        const istGesamt = istMaterial + istSub + istGeraet + istSonstiges + istLohn;

        // 5. Bisher abgerechneter Umsatz (Ausgangsrechnungen)
        const rechnungen = db.prepare("SELECT * FROM dokumente WHERE projektId = ? AND type = 'rechnung'").all(projectId);
        let istUmsatzNetto = 0;
        for (const r of rechnungen) {
            istUmsatzNetto += r.netto || 0;
        }

        // 6. Kennzahlen
        const gesamtAuftragsvolumen = sollNetto + nachtragNetto;
        const deckungsbeitrag = istUmsatzNetto - istGesamt;
        const margeProzent = istUmsatzNetto > 0 ? Math.round((deckungsbeitrag / istUmsatzNetto) * 1000) / 10 : 0;
        const budgetAuslastungProzent = gesamtAuftragsvolumen > 0 ? Math.round((istGesamt / gesamtAuftragsvolumen) * 1000) / 10 : 0;

        return {
            projektId: projectId,
            projektName: projekt.name,
            gesamtAuftragsvolumen: Math.round(gesamtAuftragsvolumen * 100) / 100,
            sollNetto: Math.round(sollNetto * 100) / 100,
            nachtragNetto: Math.round(nachtragNetto * 100) / 100,
            sollKosten: {
                lohn: Math.round(sollLohn * 100) / 100,
                material: Math.round(sollMaterial * 100) / 100,
                geraet: Math.round(sollGeraet * 100) / 100,
                sub: Math.round(sollSub * 100) / 100
            },
            istKosten: {
                lohn: Math.round(istLohn * 100) / 100,
                lohnStunden: istLohnStunden,
                material: Math.round(istMaterial * 100) / 100,
                subcontractor: Math.round(istSub * 100) / 100,
                geraet: Math.round(istGeraet * 100) / 100,
                sonstiges: Math.round(istSonstiges * 100) / 100,
                gesamt: Math.round(istGesamt * 100) / 100,
                bauabzugsteuer: Math.round(bauabzugsteuerGesamt * 100) / 100
            },
            istUmsatzNetto: Math.round(istUmsatzNetto * 100) / 100,
            deckungsbeitrag: Math.round(deckungsbeitrag * 100) / 100,
            margeProzent,
            budgetAuslastungProzent
        };
    },

    // --- Projekte ---
    async saveProjekt(projekt) {
        if (projekt.id) {
            await dbRun(
                'UPDATE projekte SET name=?, kundeId=?, start=?, ende=?, budget=?, status=?, sicherheitseinbehalt_prozent=? WHERE id=?',
                [projekt.name, projekt.kundeId, projekt.start, projekt.ende, projekt.budget, projekt.status, projekt.sicherheitseinbehalt_prozent || 0, projekt.id]
            );
            return projekt.id;
        } else {
            const res = await dbRun(
                'INSERT INTO projekte (name, kundeId, start, ende, budget, status, sicherheitseinbehalt_prozent) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [projekt.name, projekt.kundeId, projekt.start, projekt.ende, projekt.budget, projekt.status, projekt.sicherheitseinbehalt_prozent || 0]
            );
            return res.id;
        }
    },

    // --- Einstellungen ---
    async saveEinstellung(key, value) {
        await dbRun('INSERT OR REPLACE INTO einstellungen (key, value) VALUES (?, ?)', [key, value]);
    },

    // --- Backup ---
    async backup(destinationPath) {
        return db.backup(destinationPath);
    },

    // --- Restore ---
    async restore(sourcePath) {
        // 1. Create an emergency backup of the CURRENT state before overwriting
        const emergencyPath = dbPath + '.emergency-backup-' + Date.now();
        fs.copyFileSync(dbPath, emergencyPath);
        console.log('Emergency backup created at:', emergencyPath);

        // 2. Close the active database connection
        db.close();

        // 3. Overwrite the database file with the selected backup
        fs.copyFileSync(sourcePath, dbPath);
        console.log('Database overwritten with backup from:', sourcePath);

        // 4. Relaunch the application to load the new database
        const { app } = require('electron');
        app.relaunch();
        app.exit(0);
    }
};

module.exports = {
    db,
    dbAPI,
    appendAuditLog: auditLogger.appendAuditLog,
    verifiziereAuditKette: auditLogger.verifiziereAuditKette,
    calculateDocumentContentHash
};
