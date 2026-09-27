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

    async mergeSchlussaufmass(projectId, options = {}) {
        const pId = Number(projectId);
        const includeDrafts = options && options.includeDrafts === true;

        const allowedStatuses = includeDrafts 
            ? "('VERIFIED', 'FINALIZED', 'FREIGEGEBEN', 'SUBMITTED', 'DRAFT')"
            : "('VERIFIED', 'FINALIZED', 'FREIGEGEBEN')";

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

        // 2. Vertragspositionen (Angebote / Aufträge des Projekts) zur Preisfindung laden
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
            WHERE d.projektId = ? AND d.type IN ('angebot', 'rechnung') AND d.status NOT IN ('Storniert')
            ORDER BY d.id DESC
        `, [pId]);

        // Preiskarte nach OZ aufbauen
        const priceMap = new Map();
        for (const cp of contractPositions) {
            const cleanOz = (cp.oz_code || '').trim();
            if (cleanOz && !priceMap.has(cleanOz)) {
                priceMap.set(cleanOz, cp);
            }
        }

        // 3. Aufmaßzeilen mit LV-Preisen anreichern
        return aufmassRows.map(row => {
            const matchedPos = priceMap.get(row.oz_code);
            return {
                oz_code: row.oz_code,
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
    }
    };

    return repo;
}

module.exports = createAufmassRepo;
