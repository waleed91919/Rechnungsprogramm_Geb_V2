/**
 * Aufmass Repository
 * Aufmaße, REB 23.003 / DA11 Blätter, Schlussaufmaß-Merge und GAEB X31
 */
const GaebX31Service = require('../../js/gaeb-x31');

function createAufmassRepo(deps) {
    const { db, dbQuery, dbRun, appendAuditLog } = deps;

    const repo = {
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

    /**
     * Normalisiert eine OZ für den LV-Match: DA11 liefert 9-stellig ohne Punkte
     * ("01020030"), LV/GAEB mit Punkten ("01.02.0030"). Ohne Normierung matcht
     * keine DA11-Zeile je einen LV-Preis (stille 0-€-Positionen).
     */
    normalizeOz(oz) {
        const s = (oz === undefined || oz === null) ? '' : String(oz);
        return s.toUpperCase().replace(/[^0-9A-Z]/g, '');
    },

    async mergeSchlussaufmass(projectId, options = {}) {
        const pId = Number(projectId);
        const includeDrafts = options && options.includeDrafts === true;

        const allowedStatuses = includeDrafts
            ? "('VERIFIED', 'FINALIZED', 'FREIGEGEBEN', 'SUBMITTED', 'DRAFT')"
            : "('VERIFIED', 'FINALIZED', 'FREIGEGEBEN')";
        const normalizeOz = (oz) => (((oz === undefined || oz === null) ? '' : String(oz)).toUpperCase().replace(/[^0-9A-Z]/g, ''));

        // 1. Aggregation der Aufmaßzeilen mit Blattreferenzen (ohne unfertige DRAFTs standardmäßig)
        const aufmassRows = await dbQuery(`
            SELECT 
                TRIM(z.oz_code) as oz_code,
                COALESCE(MAX(z.einheit), 'm²') as einheit,
                COALESCE(MAX(z.bezeichnung), '') as bezeichnung,
                SUM(z.ergebnis * COALESCE(z.vorzeichen, 1)) as summe_menge,
                GROUP_CONCAT(DISTINCT b.blatt_nummer) as blaetter_nrs,
                GROUP_CONCAT(DISTINCT b.id) as blaetter_ids,
                MIN(b.id) as primary_blatt_id
            FROM aufmass_zeilen z
            JOIN aufmass_blaetter b ON z.blatt_id = b.id
            WHERE b.project_id = ? AND b.status IN ${allowedStatuses}
            GROUP BY TRIM(z.oz_code)
            HAVING summe_menge IS NOT NULL
            ORDER BY z.oz_code ASC
        `, [pId]);

        // 2. Vertragspositionen zur Preisfindung laden: Belege DES Projekts plus
        // das Quell-Angebot (projekte.source_angebot_id — trägt i.d.R. noch kein
        // projektId, ist aber der Vertrag) plus dessen Auftragsbestätigungen.
        // type='auftrag' (AB) gehört dazu: Der Auftrag ist der Vertrag (VOB/B).
        let extraDocIds = [];
        try {
            const proj = db.prepare('SELECT source_angebot_id FROM projekte WHERE id=?').get(pId);
            const srcAngebotId = proj && proj.source_angebot_id ? Number(proj.source_angebot_id) : null;
            if (srcAngebotId) {
                extraDocIds.push(srcAngebotId);
                const abs = db.prepare(`SELECT id FROM dokumente WHERE type='auftrag' AND status!='Storniert' AND (projektId=? OR parent_angebot_id=?)`).all(pId, srcAngebotId);
                for (const r of abs) extraDocIds.push(r.id);
            } else {
                const abs = db.prepare(`SELECT id FROM dokumente WHERE type='auftrag' AND status!='Storniert' AND projektId=?`).all(pId);
                for (const r of abs) extraDocIds.push(r.id);
            }
        } catch (_e) { extraDocIds = []; }
        const extraPh = extraDocIds.length > 0 ? ` OR d.id IN (${extraDocIds.map(() => '?').join(',')})` : '';
        const contractPositions = await dbQuery(`
            SELECT
                pos.oz_code,
                pos.name,
                pos.preis as einheitspreis,
                pos.einheit,
                pos.mwst,
                pos.id as position_id
            FROM positionen pos
            JOIN dokumente d ON pos.dokumentId = d.id
            WHERE (d.projektId = ? ${extraPh}) AND d.type IN ('angebot', 'auftrag', 'rechnung') AND d.status NOT IN ('Storniert')
            ORDER BY d.id DESC
        `, [pId, ...extraDocIds]);

        // Preiskarte nach NORMALISIERTER OZ aufbauen (DA11 ohne Punkte matcht LV mit Punkten)
        const priceMap = new Map();
        for (const cp of contractPositions) {
            const cleanOz = normalizeOz(cp.oz_code);
            if (cleanOz && !priceMap.has(cleanOz)) {
                priceMap.set(cleanOz, cp);
            }
        }

        // 3. Aufmaßzeilen mit LV-Preisen anreichern
        const warnings = [];
        const rows = aufmassRows.map(row => {
            const matchedPos = priceMap.get(normalizeOz(row.oz_code));
            if (!matchedPos) {
                warnings.push({
                    oz_code: row.oz_code,
                    grund: 'UNBEKANNT',
                    message: `Aufmaßposition ${row.oz_code} hat keinen gültigen Vertragspreis (LV-Position fehlt oder Tippfehler in OZ).`
                });
            }
            // Bei Match die LV-OZ übernehmen (nachgelagerte OZ-Vergleiche bleiben stabil)
            const displayOz = (matchedPos && matchedPos.oz_code) ? matchedPos.oz_code : row.oz_code;
            return {
                oz_code: displayOz,
                oz_code_raw: row.oz_code,
                summe_menge: Math.round(row.summe_menge * 1000) / 1000,
                einheit: (matchedPos && matchedPos.einheit) || row.einheit,
                bezeichnung: (matchedPos && matchedPos.name) || row.bezeichnung || `Position ${row.oz_code}`,
                einheitspreis: matchedPos ? (parseFloat(matchedPos.einheitspreis) || 0) : 0,
                mwst: matchedPos ? (matchedPos.mwst !== undefined ? matchedPos.mwst : 19) : 19,
                blaetter_nrs: row.blaetter_nrs,
                blaetter_ids: row.blaetter_ids,
                blatt_id: row.primary_blatt_id,
                position_id: matchedPos ? matchedPos.position_id : null
            };
        });

        return { rows, warnings };
    },

// --- GAEB DA XML 3.3 Phase X31 ---
    exportGAEBX31(projectId, blattId = null) {
        const pId = Number(projectId);
        const project = db.prepare('SELECT * FROM projekte WHERE id = ?').get(pId) || { name: 'Projekt' };
        let blaetter = this.getAufmassBlaetter(pId);
        if (blattId) {
            blaetter = blaetter.filter(b => b.id === blattId);
        }
        const positions = db.prepare(`
            SELECT p.* FROM positionen p
            JOIN dokumente d ON p.dokumentId = d.id
            WHERE d.projektId = ?
        `).all(pId);

        const xmlString = GaebX31Service.generateX31Xml(project, blaetter, positions);
        appendAuditLog({
            entityType: 'PROJECT',
            entityId: pId,
            action: 'GAEB_X31_EXPORT',
            details: `GAEB X31 Aufmaß für Projekt #${pId} exportiert (${blaetter.length} Blätter)`
        });
        return xmlString;
    },

    importGAEBX31(projectId, xmlContent) {
        const pId = Number(projectId);
        const parsed = GaebX31Service.parseX31Xml(xmlContent);

        const tx = db.transaction(() => {
            // 1. Alle Ansätze nach ihrer ursprünglichen SheetNo gruppieren
            const sheetsMap = new Map();

            (parsed.items || []).forEach(item => {
                (item.ansatze || []).forEach(ansatz => {
                    const sheetNum = String(ansatz.sheetNo || '0001').trim();
                    if (!sheetsMap.has(sheetNum)) {
                        sheetsMap.set(sheetNum, []);
                    }
                    sheetsMap.get(sheetNum).push({
                        oz_code: item.oz_code,
                        einheit: item.einheit,
                        item_name: item.name,
                        ...ansatz
                    });
                });
            });

            // Fallback, wenn keine Zeilen enthalten waren
            if (sheetsMap.size === 0) {
                const emptyBlatt = db.prepare(`
                    INSERT INTO aufmass_blaetter (project_id, blatt_nummer, titel, status)
                    VALUES (?, 'X31-01', ?, 'DRAFT')
                `).run(pId, parsed.projectInfo.name || 'GAEB X31 Import');
                return {
                    success: true,
                    blattId: emptyBlatt.lastInsertRowid,
                    sheetsCreated: 1,
                    zeilenCreated: 0,
                    importedCount: 0,
                    itemsCount: (parsed.items || []).length
                };
            }

            let totalZeilenCount = 0;
            const insertZeileStmt = db.prepare(`
                INSERT INTO aufmass_zeilen (blatt_id, oz_code, zeilen_nr, bezeichnung, formel_reb, rechenansatz, ergebnis, einheit, vorzeichen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            let firstBlattId = null;
            // 2. Jedes Originalblatt als eigenes aufmass_blaetter anlegen
            for (const [sheetNum, zeilen] of sheetsMap.entries()) {
                const blattRes = db.prepare(`
                    INSERT INTO aufmass_blaetter (project_id, blatt_nummer, titel, status)
                    VALUES (?, ?, ?, 'DRAFT')
                `).run(pId, sheetNum, `${parsed.projectInfo.name || 'X31'} - Blatt ${sheetNum}`);

                const blattId = blattRes.lastInsertRowid;
                if (!firstBlattId) firstBlattId = blattId;

                zeilen.forEach((z, zIdx) => {
                    totalZeilenCount++;
                    insertZeileStmt.run(
                        blattId,
                        z.oz_code || '01.01.0010',
                        z.rowNo || (zIdx + 1),
                        z.bezeichnung || z.item_name || '',
                        z.formulaNo || '91',
                        z.rechenansatz || '',
                        z.resultQty || 0,
                        z.einheit || 'm²',
                        z.sign !== undefined ? z.sign : 1
                    );
                });
            }

            appendAuditLog({
                entityType: 'PROJECT',
                entityId: pId,
                action: 'GAEB_X31_IMPORTED',
                details: `GAEB X31 importiert: ${sheetsMap.size} Aufmaßblätter, ${totalZeilenCount} Zeilen aus ${(parsed.items || []).length} Positionen.`
            });

            return {
                success: true,
                blattId: firstBlattId,
                sheetsCreated: sheetsMap.size,
                zeilenCreated: totalZeilenCount,
                importedCount: totalZeilenCount,
                itemsCount: (parsed.items || []).length
            };
        });

        return tx();
    },

// --- DA11 (REB 23.003) Import: Gegenstück zum Export (kein Abtippen) ---
    importDA11(projectId, da11Content) {
        const pId = Number(projectId);
        if (!Number.isInteger(pId) || pId <= 0) throw new Error('Ungültige Projekt-ID für DA11-Import.');
        let DA11Service;
        try {
            DA11Service = require('../../js/da11');
        } catch (e) {
            throw new Error('DA11-Parser (js/da11.js) nicht verfügbar.');
        }
        const parsed = DA11Service.parseDA11(da11Content);
        if (!parsed || parsed.success !== true || !Array.isArray(parsed.blaetter) || parsed.blaetter.length === 0) {
            throw new Error('Keine Aufmaßzeilen (Satzart 11) in der DA11-Datei gefunden.');
        }

        const tx = db.transaction(() => {
            const insertBlatt = db.prepare(`
                INSERT INTO aufmass_blaetter (project_id, blatt_nummer, titel, status)
                VALUES (?, ?, ?, 'DRAFT')
            `);
            const hasProjPosCol = (() => {
                try {
                    return db.prepare('PRAGMA table_info(aufmass_zeilen)').all().some(c => c.name === 'projekt_position_id');
                } catch (_e) { return false; }
            })();
            const insertZeile = db.prepare(hasProjPosCol
                ? `INSERT INTO aufmass_zeilen (blatt_id, oz_code, zeilen_nr, bezeichnung, formel_reb, rechenansatz, ergebnis, einheit, vorzeichen, projekt_position_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                : `INSERT INTO aufmass_zeilen (blatt_id, oz_code, zeilen_nr, bezeichnung, formel_reb, rechenansatz, ergebnis, einheit, vorzeichen)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            const blattIds = [];
            let zeilenCreated = 0;
            for (const b of parsed.blaetter) {
                const blattRes = insertBlatt.run(pId, String(b.blatt_nummer || '000001'), b.titel || `DA11-Import Blatt ${b.blatt_nummer || ''}`.trim());
                const blattId = blattRes.lastInsertRowid;
                blattIds.push(blattId);
                (b.zeilen || []).forEach((z, zIdx) => {
                    const args = [
                        blattId,
                        z.oz_code || '01.01.0010',
                        z.zeilen_nr || (zIdx + 1),
                        z.bezeichnung || '',
                        z.formel_reb || '91',
                        z.rechenansatz || '',
                        parseFloat(z.ergebnis) || 0,
                        z.einheit || 'm²',
                        z.vorzeichen !== undefined ? z.vorzeichen : 1
                    ];
                    if (hasProjPosCol) args.push(null);
                    insertZeile.run(...args);
                    zeilenCreated++;
                });
            }

            appendAuditLog({
                entityType: 'PROJECT',
                entityId: pId,
                action: 'DA11_IMPORTED',
                details: `DA11 importiert: ${blattIds.length} Aufmaßblätter, ${zeilenCreated} Zeilen (Status DRAFT — vor Abrechnung freigeben).`
            });

            return {
                success: true,
                blattIds,
                sheetsCreated: blattIds.length,
                zeilenCreated,
                projektName: parsed.projektName || null
            };
        });

        return tx();
    },

    /**
     * Gibt ein Aufmaßblatt zur Abrechnung frei (DRAFT/SUBMITTED → VERIFIED).
     * Erst VERIFIED/FINALIZED-Blätter fließen in mergeSchlussaufmass ein (§ 14 VOB/B:
     * nur prüfbare, gemeinsam festgestellte Mengen).
     */
    verifyAufmassBlatt(blattId) {
        const id = Number(blattId);
        if (!Number.isInteger(id) || id <= 0) throw new Error('Ungültige Aufmaßblatt-ID.');
        const tx = db.transaction(() => {
            const blatt = db.prepare('SELECT * FROM aufmass_blaetter WHERE id=?').get(id);
            if (!blatt) throw new Error(`Aufmaßblatt #${id} nicht gefunden.`);
            if (blatt.status === 'VERIFIED' || blatt.status === 'FINALIZED' || blatt.status === 'FREIGEGEBEN') {
                return { success: true, already: true, status: blatt.status };
            }
            if (blatt.status !== 'DRAFT' && blatt.status !== 'SUBMITTED') {
                throw new Error(`Aufmaßblatt #${id} kann aus Status ${blatt.status} nicht freigegeben werden.`);
            }
            db.prepare('UPDATE aufmass_blaetter SET status=? WHERE id=?').run('VERIFIED', id);
            appendAuditLog({
                entityType: 'AUFMASS_BLATT',
                entityId: id,
                action: 'AUFMASS_BLATT_VERIFIED',
                details: `Aufmaßblatt ${blatt.blatt_nummer || id} freigegeben (VERIFIED) — fließt in Schlussaufmaß ein.`
            });
            return { success: true, already: false, status: 'VERIFIED' };
        });
        return tx();
    },

// --- Kumulative Abrechnung ---
    async getKumulativeAbrechnung(projectId) {
        const pId = Number(projectId);

        // Finde alle Rechnungen (insbesondere Abschlagsrechnungen), die zu dem Projekt gehören
        // (type='rechnung' AND status NOT IN ('Entwurf', 'Storniert'))
        const docs = await dbQuery(`
            SELECT d.id, d.nummer, d.status, d.created_at as datum, d.zahlbetrag,
                   COALESCE(SUM(pos.preis * pos.menge), 0) as netto,
                   COALESCE(SUM(pos.preis * pos.menge * (1 + pos.mwst / 100.0)), 0) as brutto,
                   (
                        SELECT COALESCE(SUM(zz.betrag), 0)
                        FROM zahlung_zuordnungen zz
                        WHERE zz.dokument_id = d.id
                    ) as bezahlt
            FROM dokumente d
            LEFT JOIN positionen pos ON pos.dokumentId = d.id
            WHERE d.projektId = ? AND d.type = 'rechnung' AND d.status NOT IN ('Entwurf', 'Storniert')
            GROUP BY d.id
            ORDER BY d.id ASC
        `, [pId]);

        let totalNetto = 0;
        let totalSoll = 0;
        let totalBezahlt = 0;

        const vorrechnungen = docs.map(d => {
            const n = parseFloat(d.netto) || 0;
            const b = parseFloat(d.brutto) || 0;
            // VOB/B § 17: fällig ist der Zahlbetrag (brutto abzgl. Einbehalt),
            // nicht das volle Brutto. Sonst wäre jede Abschlags-Restanzeige
            // um den Einbehalt zu hoch und OPOS matcht nie exakt.
            const zb = parseFloat(d.zahlbetrag);
            const soll = (Number.isFinite(zb) && zb > 0) ? zb : b;
            const bez = parseFloat(d.bezahlt) || 0;

            totalNetto += n;
            totalSoll += soll;
            totalBezahlt += bez;

            return {
                id: d.id,
                nummer: d.nummer,
                status: d.status,
                datum: d.datum,
                netto: n,
                brutto: b,
                zahlbetrag: soll,
                bezahlt: bez,
                rest: Math.max(0, Math.round((soll - bez) * 100) / 100)
            };
        });

        return {
            vorrechnungen,
            totalNetto,
            totalBrutto: totalSoll,
            totalBezahlt,
            totalRest: Math.max(0, Math.round((totalSoll - totalBezahlt) * 100) / 100)
        };
    }
    };

    return repo;
}

module.exports = createAufmassRepo;
