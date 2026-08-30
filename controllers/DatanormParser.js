/**
 * controllers/DatanormParser.js - High-Performance Streaming Parser für DATANORM 4.0 & 5.0
 * Konform nach DIN/DATANORM Standard 4.0 & 5.0.
 * Unterstützt Satzarten V, A, B, C, P, R, S, T, Z, G.
 * Vollständige CP850 DOS-Dekodierung & Preisbasis-Division (preisEinheit).
 * Isomorph aufgebaut für Node.js (Stream/File) und Electron/Browser (String/Array).
 */

class DatanormParser {
    /**
     * Erstellt die 256-Zeichen Lookup-Tabelle für DOS Code Page 850 (Western European).
     */
    static getCp850Table() {
        if (DatanormParser._cp850Table) return DatanormParser._cp850Table;
        const map = {
            0x80: 'Ç', 0x81: 'ü', 0x82: 'é', 0x83: 'â', 0x84: 'ä', 0x85: 'à', 0x86: 'å', 0x87: 'ç',
            0x88: 'ê', 0x89: 'ë', 0x8a: 'è', 0x8b: 'ï', 0x8c: 'î', 0x8d: 'ì', 0x8e: 'Ä', 0x8f: 'Å',
            0x90: 'É', 0x91: 'æ', 0x92: 'Æ', 0x93: 'ô', 0x94: 'ö', 0x95: 'ò', 0x96: 'û', 0x97: 'ù',
            0x98: 'ÿ', 0x99: 'Ö', 0x9a: 'Ü', 0x9b: 'ø', 0x9c: '£', 0x9d: 'Ø', 0x9e: '×', 0x9f: 'ƒ',
            0xa0: 'á', 0xa1: 'í', 0xa2: 'ó', 0xa3: 'ú', 0xa4: 'ñ', 0xa5: 'Ñ', 0xa6: 'ª', 0xa7: 'º',
            0xa8: '¿', 0xa9: '®', 0xaa: '¬', 0xab: '½', 0xac: '¼', 0xad: '¡', 0xae: '«', 0xaf: '»',
            0xb0: '░', 0xb1: '▒', 0xb2: '▓', 0xb3: '│', 0xb4: '┤', 0xb5: 'Á', 0xb6: 'Â', 0xb7: 'À',
            0xb8: '©', 0xb9: '╣', 0xba: '║', 0xbb: '╗', 0xbc: '╝', 0xbd: '¢', 0xbe: '¥', 0xbf: '┐',
            0xc0: '└', 0xc1: '┴', 0xc2: '┬', 0xc3: '├', 0xc4: '─', 0xc5: '┼', 0xc6: 'ã', 0xc7: 'Ã',
            0xc8: '╚', 0xc9: '╔', 0xca: '╩', 0xcb: '╦', 0xcc: '╠', 0xcd: '═', 0xce: '╬', 0xcf: '¤',
            0xd0: 'ð', 0xd1: 'Ð', 0xd2: 'Ê', 0xd3: 'Ë', 0xd4: 'È', 0xd5: 'ı', 0xd6: 'Í', 0xd7: 'Î',
            0xd8: 'Ï', 0xd9: '┘', 0xda: '┌', 0xdb: '█', 0xdc: '▄', 0xdd: '¦', 0xde: 'Ì', 0xdf: '▀',
            0xe0: 'Ó', 0xe1: 'ß', 0xe2: 'Ô', 0xe3: 'Ò', 0xe4: 'õ', 0xe5: 'Õ', 0xe6: 'µ', 0xe7: 'þ',
            0xe8: 'Þ', 0xe9: 'Ú', 0xea: 'Û', 0xeb: 'Ù', 0xec: 'ý', 0xed: 'Ý', 0xee: '¯', 0xef: '´',
            0xf0: '­', 0xf1: '±', 0xf2: '‗', 0xf3: '¾', 0xf4: '¶', 0xf5: '§', 0xf6: '÷', 0xf7: '¸',
            0xf8: '°', 0xf9: '¨', 0xfa: '·', 0xfb: '¹', 0xfc: '³', 0xfd: '²', 0xfe: '■', 0xff: ' '
        };
        DatanormParser._cp850Table = map;
        return map;
    }

    /**
     * Dekodiert DOS-CP850-Strings oder Buffers sauber in UTF-8 Strings.
     */
    static decodeCp850(input) {
        if (!input) return '';
        const map = DatanormParser.getCp850Table();
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
            let res = '';
            for (let i = 0; i < input.length; i++) {
                const byte = input[i];
                if (byte < 0x80) {
                    res += String.fromCharCode(byte);
                } else {
                    res += map[byte] !== undefined ? map[byte] : String.fromCharCode(byte);
                }
            }
            return res;
        }
        if (typeof input !== 'string') {
            input = String(input);
        }
        if (/[äöüÄÖÜß]/.test(input)) {
            return input;
        }
        return input.replace(/[\x80-\xFF]/g, ch => {
            const code = ch.charCodeAt(0);
            return map[code] !== undefined ? map[code] : ch;
        });
    }

    /**
     * Parst DATANORM-Preisangaben (Ganzzahl in Cents wie '8500' -> 85.00, oder Kommazahl wie '85,00' -> 85.00).
     */
    static parsePrice(val) {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return val;
        const s = String(val).trim();
        if (s.includes(',') || s.includes('.')) {
            return parseFloat(s.replace(',', '.')) || 0;
        }
        const num = parseInt(s, 10);
        return isNaN(num) ? 0 : num / 100;
    }

    /**
     * Parst eine einzelne DATANORM-Zeile.
     * @param {string} line - Rohe Textzeile
     * @returns {Object|null}
     */
    static parseLine(line) {
        if (!line || typeof line !== 'string' || line.trim().length === 0) return null;
        const cleaned = DatanormParser.decodeCp850(line.trim());
        const fields = cleaned.split(';').map(f => f.trim());
        const satzart = fields[0] ? fields[0].toUpperCase() : '';

        switch (satzart) {
            case 'V': // Vorlaufsatz / Header (D4: V;12345;01;Katalog;EUR;Datum / D5: V;N;Datum;Lieferant;Katalog;EUR;5)
                const isD4V = fields.length <= 7 && !fields[1]?.includes('.') && fields[1]?.length <= 6;
                const katalogName = isD4V ? (fields[3] || fields[4] || 'DATANORM Katalog') : (fields[8] || fields[7] || fields[4] || 'DATANORM Katalog');
                const lieferantName = isD4V ? (fields[3] || fields[1] || 'Lieferant') : (fields[4] || fields[3] || 'Lieferant');
                return {
                    type: 'VORLAUF',
                    verarbeitungsKz: isD4V ? 'N' : (fields[1] || 'N'),
                    datum: isD4V ? (fields[5] || '') : (fields[2] || ''),
                    lieferantNr: isD4V ? (fields[1] || '') : (fields[3] || ''),
                    lieferantName,
                    waehrung: isD4V ? (fields[4] || 'EUR') : (fields[5] || 'EUR'),
                    version: isD4V ? '4' : (fields[6] || '5'),
                    katalogName
                };

            case 'A': // Artikelhauptsatz
                // In DATANORM 4: fields[8] = ME (z.B. 'm', 'Stk'), fields[9] = PE (z.B. 1000), fields[10] = Preis
                // In DATANORM 5: fields[8] = PE (z.B. 1000), fields[9] = ME (z.B. 'm'), fields[10] = Preis
                let mengeneinheit = 'Stk.';
                let preisEinheit = 1;
                if (isNaN(parseInt(fields[8], 10))) {
                    mengeneinheit = fields[8] || 'Stk.';
                    preisEinheit = Math.max(1, parseInt(fields[9], 10) || 1);
                } else {
                    preisEinheit = Math.max(1, parseInt(fields[8], 10) || 1);
                    mengeneinheit = fields[9] || 'Stk.';
                }
                const preisA = DatanormParser.parsePrice(fields[10]);
                return {
                    type: 'ARTIKEL_HAUPT',
                    verarbeitungsKz: fields[1] || 'N',
                    artikelNr: fields[2] || '',
                    textKz: fields[3] || '1',
                    matchcode: fields[4] || '',
                    kurztext1: fields[5] || '',
                    kurztext2: fields[6] || '',
                    preisKz: fields[7] || '1', // 1 = Brutto (Listenpreis vor Rabatt), 2 = Netto
                    preisEinheit,
                    mengeneinheit,
                    preis: preisA,
                    preisProMe: Math.round((preisA / preisEinheit) * 10000) / 10000,
                    rabattGruppe: fields[11] || '',
                    hauptwarenGruppe: fields[12] || '',
                    warenGruppe: fields[13] || '',
                    langtextSchluessel: fields[14] || ''
                };

            case 'B': // Artikelnebensatz
                return {
                    type: 'ARTIKEL_NEBEN',
                    verarbeitungsKz: fields[1] || 'A',
                    artikelNr: fields[2] || '',
                    ean: fields[3] || '',
                    herstellerNr: fields[4] || '',
                    bestellNr: fields[5] || '',
                    kupferZahl: parseFloat((fields[6] || '0').replace(',', '.')) || 0,
                    katalogNummer: fields[7] || '',
                    abmessung: fields[8] || '',
                    langtext: fields.slice(3).filter(Boolean).join(' ')
                };

            case 'C': // Leistungssatz / Stücklistensatz
                return {
                    type: 'LEISTUNG_SATZ',
                    verarbeitungsKz: fields[1] || 'N',
                    leistungsNr: fields[2] || '',
                    positionsNr: fields[3] || '',
                    unterArtikelNr: fields[4] || '',
                    menge: parseFloat((fields[5] || '1').replace(',', '.')) || 1,
                    mengeneinheit: fields[6] || 'Stk.'
                };

            case 'P': // Preissatz
                const peP = Math.max(1, parseInt(fields[4], 10) || 1);
                const preisP = DatanormParser.parsePrice(fields[3]);
                return {
                    type: 'PREIS_SATZ',
                    artikelNr: fields[1] || '',
                    preisArt: fields[2] || '2', // 2 = Neuer Listenpreis / Netto
                    preis: preisP,
                    preisEinheit: peP,
                    preisProMe: Math.round((preisP / peP) * 10000) / 10000,
                    rabattGruppe: fields[5] || ''
                };

            case 'R': // Rabattgruppensatz (D4: R;Gruppe;Bez;Proz / D5: R;Kz;Gruppe;Bez;Proz1;Proz2)
                const isD4R = fields.length <= 5 && !['A', 'N', 'C', 'L'].includes(fields[1]);
                return {
                    type: 'RABATT_SATZ',
                    verarbeitungsKz: isD4R ? 'N' : (fields[1] || 'N'),
                    rabattGruppe: isD4R ? (fields[1] || '') : (fields[2] || ''),
                    bezeichnung: isD4R ? (fields[2] || '') : (fields[3] || ''),
                    rabattProzent1: parseFloat((isD4R ? fields[3] : fields[4] || '0').replace(',', '.')) || 0,
                    rabatt_prozent: parseFloat((isD4R ? fields[3] : fields[4] || '0').replace(',', '.')) || 0,
                    rabattProzent2: parseFloat((isD4R ? '0' : fields[5] || '0').replace(',', '.')) || 0,
                    zuschlagProzent: parseFloat((isD4R ? '0' : fields[6] || '0').replace(',', '.')) || 0
                };

            case 'S': // Warengruppensatz
            case 'G': // Warengruppensatz in DATANORM 4 oft als G oder S
                const isD4S = fields.length <= 4 && !['A', 'N', 'C', 'L'].includes(fields[1]);
                return {
                    type: 'WARENGRUPPE_SATZ',
                    verarbeitungsKz: isD4S ? 'N' : (fields[1] || 'N'),
                    hauptwarenGruppe: isD4S ? (fields[1] || '') : (fields[2] || ''),
                    warenGruppe: isD4S ? (fields[1] || '') : (fields[3] || ''),
                    bezeichnung: isD4S ? (fields[2] || fields[1] || '') : (fields[4] || fields[3] || '')
                };

            case 'T': // Langtextsatz
                return {
                    type: 'LANGTEXT_SATZ',
                    verarbeitungsKz: fields[1] || 'N',
                    langtextSchluessel: fields[2] || '',
                    zeilenNr: parseInt(fields[3], 10) || 1,
                    text: fields.slice(4).join(' ')
                };

            case 'Z': // Staffelpreise & Rohstoffzuschläge
                return {
                    type: 'STAFFEL_SATZ',
                    verarbeitungsKz: fields[1] || 'N',
                    artikelNr: fields[2] || '',
                    staffelMenge: parseFloat((fields[3] || '0').replace(',', '.')) || 0,
                    staffelPreis: parseFloat((fields[4] || '0').replace(',', '.')) || 0,
                    staffelRabatt: parseFloat((fields[5] || '0').replace(',', '.')) || 0,
                    rohstoffBasis: parseFloat((fields[6] || '0').replace(',', '.')) || 0,
                    delNotiz: fields[7] || ''
                };

            default:
                return { type: 'UNBEKANNT', satzart, raw: cleaned };
        }
    }

    /**
     * Parst einen gesamten DATANORM-Textinhalt im Speicher (z. B. für Web/Tests).
     * @param {string} textContent
     * @param {Object} options
     */
    static parseDatanormText(textContent, options = {}) {
        if (!textContent) return { records: [], articles: [], artikel: [], rabattgruppen: [], warengruppen: [], header: null, vorlauf: null };
        const lines = textContent.split(/\r?\n/);
        const records = [];
        const articles = [];
        const articlesMap = {};
        const rabattgruppen = [];
        const warengruppen = [];
        let header = null;

        const standardAufschlagPct = parseFloat(options.aufschlagProzent) || 25.0;
        const rabattMatrix = options.rabattMatrix || {};

        for (const line of lines) {
            const parsed = DatanormParser.parseLine(line);
            if (!parsed) continue;
            records.push(parsed);

            if (parsed.type === 'VORLAUF' && !header) {
                header = parsed;
            } else if (parsed.type === 'RABATT_SATZ') {
                rabattgruppen.push(parsed);
                if (rabattMatrix[parsed.rabattGruppe] === undefined) {
                    rabattMatrix[parsed.rabattGruppe] = parsed.rabattProzent1 || 0;
                }
            } else if (parsed.type === 'WARENGRUPPE_SATZ') {
                warengruppen.push(parsed);
            } else if (parsed.type === 'ARTIKEL_HAUPT') {
                const rabattPct = rabattMatrix[parsed.rabattGruppe] !== undefined
                    ? parseFloat(rabattMatrix[parsed.rabattGruppe])
                    : 0;

                // Preisbasis-Division: Einzelpreis je Stück
                const preisBasis = parsed.preisProMe;
                let ek = preisBasis;
                if (parsed.preisKz === '1' && rabattPct > 0) {
                    ek = Math.round((preisBasis * (1 - rabattPct / 100)) * 10000) / 10000;
                }
                const vk = Math.round((ek * (1 + standardAufschlagPct / 100)) * 100) / 100;
                const name = `${parsed.kurztext1} ${parsed.kurztext2}`.trim() || `Artikel ${parsed.artikelNr}`;

                const artObj = {
                    artikel_nr: parsed.artikelNr,
                    artikelNr: parsed.artikelNr,
                    name,
                    kurztext1: parsed.kurztext1,
                    kurztext2: parsed.kurztext2,
                    langtext: '',
                    matchcode: parsed.matchcode,
                    mengeneinheit: parsed.mengeneinheit,
                    preisEinheit: parsed.preisEinheit,
                    katalogPreis: parsed.preis,
                    preisKz: parsed.preisKz,
                    rabattGruppe: parsed.rabattGruppe,
                    rabattPct,
                    ek: Math.round(ek * 100) / 100,
                    ek_preis: Math.round(ek * 100) / 100,
                    vk,
                    vk_preis: vk,
                    hauptwarenGruppe: parsed.hauptwarenGruppe,
                    warenGruppe: parsed.warenGruppe,
                    langtextSchluessel: parsed.langtextSchluessel
                };
                articles.push(artObj);
                articlesMap[parsed.artikelNr] = artObj;
            } else if (parsed.type === 'ARTIKEL_NEBEN') {
                if (articlesMap[parsed.artikelNr]) {
                    articlesMap[parsed.artikelNr].langtext = parsed.langtext || '';
                    articlesMap[parsed.artikelNr].ean = parsed.ean || '';
                }
            } else if (parsed.type === 'PREIS_SATZ') {
                if (articlesMap[parsed.artikelNr]) {
                    const pe = parsed.preisEinheit || 1;
                    const pProMe = parsed.preisProMe || (parsed.preis / pe);
                    articlesMap[parsed.artikelNr].ek = Math.round(pProMe * 100) / 100;
                    articlesMap[parsed.artikelNr].ek_preis = Math.round(pProMe * 100) / 100;
                    articlesMap[parsed.artikelNr].vk = Math.round((pProMe * (1 + standardAufschlagPct / 100)) * 100) / 100;
                    articlesMap[parsed.artikelNr].vk_preis = articlesMap[parsed.artikelNr].vk;
                }
            }
        }

        return {
            header,
            vorlauf: header,
            records,
            articles,
            artikel: articles,
            rabattgruppen,
            warengruppen
        };
    }

    /**
     * Führt einen speichereffizienten Streaming-Import einer DATANORM-Datei in SQLite durch.
     */
    static async importDatanormFileStream(filePath, db, options = {}, progressCallback = null) {
        const fs = require('fs');
        const readline = require('readline');
        const crypto = require('crypto');

        if (!fs.existsSync(filePath)) {
            throw new Error(`DATANORM-Datei nicht gefunden: ${filePath}`);
        }

        const startTime = Date.now();
        const fileBuffer = fs.readFileSync(filePath);
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        const fileStream = fs.createReadStream(filePath, { encoding: 'latin1' });
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        const lieferantName = options.lieferant || 'Großhandel';
        const katalogName = options.katalogName || 'DATANORM Katalog';
        const standardAufschlagPct = parseFloat(options.aufschlagProzent) || 25.0;
        const rabattMatrix = options.rabattMatrix ? { ...options.rabattMatrix } : {};

        let countTotal = 0;
        let countInserted = 0;
        let countUpdated = 0;
        const BATCH_SIZE = 1000;
        let batch = [];
        let detectedHeader = null;

        // Katalog-Eintrag in datanorm_kataloge vorbereiten
        let katalogId = null;
        if (db) {
            const katRes = db.prepare(`
                INSERT INTO datanorm_kataloge (
                    lieferant_name, katalog_name, version, anzahl_artikel, dateipfade_json, sha256_hash, status
                ) VALUES (?, ?, '5', 0, ?, ?, 'AKTIV')
            `).run(lieferantName, katalogName, JSON.stringify([filePath]), fileHash);
            katalogId = katRes.lastInsertRowid;
        }

        // Prepared Statements für High-Performance SQLite Inserts
        const stmtInsertArtikel = db ? db.prepare(`
            INSERT INTO artikel (
                name, ean, beschreibung, ek, vk, mwst, bestand, lieferant, katalog,
                ist_bauleistung, kostenart, datanorm_nr, warengruppe_id, rabattgruppe_id
            ) VALUES (
                @name, @ean, @beschreibung, @ek, @vk, 19, 0, @lieferant, @katalog,
                0, 'MATERIAL', @datanorm_nr, @warengruppe_id, @rabattgruppe_id
            )
        `) : null;

        const stmtUpdateArtikel = db ? db.prepare(`
            UPDATE artikel SET
                name = @name,
                beschreibung = @beschreibung,
                ek = @ek,
                vk = @vk,
                katalog = @katalog,
                warengruppe_id = @warengruppe_id,
                rabattgruppe_id = @rabattgruppe_id
            WHERE datanorm_nr = @datanorm_nr AND lieferant = @lieferant
        `) : null;

        const stmtFindExisting = db ? db.prepare(`
            SELECT id FROM artikel WHERE datanorm_nr = ? AND lieferant = ? LIMIT 1
        `) : null;

        const stmtInsertWrg = db ? db.prepare(`
            INSERT OR REPLACE INTO datanorm_warengruppen (katalog_id, hauptwarengruppe, warengruppe, bezeichnung, aufschlag_prozent)
            VALUES (?, ?, ?, ?, ?)
        `) : null;

        const stmtInsertRab = db ? db.prepare(`
            INSERT OR REPLACE INTO datanorm_rabattgruppen (katalog_id, rabattgruppe, bezeichnung, rabatt_prozent1, rabatt_prozent2, zuschlag_prozent)
            VALUES (?, ?, ?, ?, ?, ?)
        `) : null;

        const processBatchTx = db ? db.transaction((items) => {
            for (const item of items) {
                const existing = stmtFindExisting.get(item.datanorm_nr, item.lieferant);
                if (existing) {
                    stmtUpdateArtikel.run(item);
                    countUpdated++;
                } else {
                    stmtInsertArtikel.run(item);
                    countInserted++;
                }
            }
        }) : null;

        for await (const line of rl) {
            countTotal++;
            const parsed = DatanormParser.parseLine(line);
            if (!parsed) continue;

            if (parsed.type === 'VORLAUF' && !detectedHeader) {
                detectedHeader = parsed;
            } else if (parsed.type === 'RABATT_SATZ') {
                if (stmtInsertRab && katalogId) {
                    stmtInsertRab.run(
                        katalogId,
                        parsed.rabattGruppe,
                        parsed.bezeichnung || '',
                        parsed.rabattProzent1 || 0,
                        parsed.rabattProzent2 || 0,
                        parsed.zuschlagProzent || 0
                    );
                }
                if (rabattMatrix[parsed.rabattGruppe] === undefined) {
                    rabattMatrix[parsed.rabattGruppe] = parsed.rabattProzent1 || 0;
                }
            } else if (parsed.type === 'WARENGRUPPE_SATZ') {
                if (stmtInsertWrg && katalogId) {
                    stmtInsertWrg.run(
                        katalogId,
                        parsed.hauptwarenGruppe,
                        parsed.warenGruppe,
                        parsed.bezeichnung || '',
                        standardAufschlagPct
                    );
                }
            } else if (parsed.type === 'ARTIKEL_HAUPT') {
                const rabattPct = rabattMatrix[parsed.rabattGruppe] !== undefined
                    ? parseFloat(rabattMatrix[parsed.rabattGruppe])
                    : 0;

                // Preisbasis-Division für Stück-Einkaufspreis
                const preisBasis = parsed.preisProMe;
                let ek = preisBasis;
                if (parsed.preisKz === '1' && rabattPct > 0) {
                    ek = Math.round((preisBasis * (1 - rabattPct / 100)) * 10000) / 10000;
                }
                const vk = Math.round((ek * (1 + standardAufschlagPct / 100)) * 100) / 100;
                const name = `${parsed.kurztext1} ${parsed.kurztext2}`.trim() || `Artikel ${parsed.artikelNr}`;

                batch.push({
                    name,
                    ean: '',
                    beschreibung: `Matchcode: ${parsed.matchcode} | ME: ${parsed.mengeneinheit} | PE: ${parsed.preisEinheit}`,
                    ek: Math.round(ek * 100) / 100,
                    vk,
                    lieferant: lieferantName,
                    katalog: katalogName,
                    datanorm_nr: parsed.artikelNr,
                    warengruppe_id: parsed.warenGruppe || parsed.hauptwarenGruppe || null,
                    rabattgruppe_id: parsed.rabattGruppe || null
                });

                if (batch.length >= BATCH_SIZE) {
                    if (processBatchTx) processBatchTx(batch);
                    batch = [];
                    if (progressCallback) {
                        progressCallback({ countTotal, countInserted, countUpdated, lastArticle: parsed.artikelNr });
                    }
                }
            }
        }

        // Rest-Batch persistieren
        if (batch.length > 0) {
            if (processBatchTx) processBatchTx(batch);
            batch = [];
        }

        // Katalog-Statistik aktualisieren
        if (db && katalogId) {
            db.prepare('UPDATE datanorm_kataloge SET anzahl_artikel = ? WHERE id = ?').run(countInserted + countUpdated, katalogId);
        }

        const durationMs = Date.now() - startTime;

        return {
            success: true,
            katalogId,
            header: detectedHeader,
            countTotal,
            countInserted,
            countUpdated,
            durationMs
        };
    }

    /**
     * Importiert mehrere DATANORM-Dateien (z. B. WRG, RAB, 001) in sinnvoller Reihenfolge.
     */
    static async importDatanormFiles(filePaths = [], db, options = {}, progressCallback = null) {
        // Sortiere: WRG & RAB zuerst, dann Stammdaten (*.001 - *.999), dann Preise (*.P / DATPREIS)
        const sortedPaths = [...filePaths].sort((a, b) => {
            const getPriority = (p) => {
                const upper = p.toUpperCase();
                if (upper.includes('.WRG')) return 1;
                if (upper.includes('.RAB')) return 2;
                if (upper.includes('DATANORM.001') || upper.includes('.001')) return 3;
                if (upper.includes('DATPREIS')) return 5;
                return 4;
            };
            return getPriority(a) - getPriority(b);
        });

        let totalInserted = 0;
        let totalUpdated = 0;
        let totalLines = 0;
        const results = [];

        for (const fp of sortedPaths) {
            const res = await DatanormParser.importDatanormFileStream(fp, db, options, progressCallback);
            totalInserted += res.countInserted;
            totalUpdated += res.countUpdated;
            totalLines += res.countTotal;
            results.push(res);
        }

        return {
            success: true,
            filesCount: sortedPaths.length,
            totalLines,
            totalInserted,
            totalUpdated,
            details: results
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatanormParser;
}
if (typeof window !== 'undefined') {
    window.DatanormParser = DatanormParser;
}
