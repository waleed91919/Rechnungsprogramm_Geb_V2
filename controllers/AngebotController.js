/**
 * controllers/AngebotController.js - Geschäftsschicht für das modulare Baugewerbe-Angebotswesen
 *
 * Beinhaltet:
 * - Summenberechnung mit getrennter Behandlung von NORMAL, ALTERNATIV, BEDARF & PAUSCHALE
 * - Unveränderlicher Freeze-Snapshot bei Versand (Status 'VERSENDET')
 * - Revisionssichere Versionierung (v1 -> v2) ohne Mutation des Originals
 * - Angebotsannahme ('ANGENOMMEN') mit Protokollierung der angenommenen Version
 * - Projektübergabe mit stabiler Positionsreferenz (sourceOfferPositionId) und eigenen IDs
 * - Baurechtlicher Risikocheck (fehlende Preise, 0,00 € Bestätigung, BGB § 650m Hinweis, Bindefrist)
 */

class AngebotController {
    /**
     * Einheitliche Normalisierung des Flags in_endsumme_enthalten.
     * Erkennt strikt 1, '1', true als 1 und 0, '0', false als 0.
     * Bei undefined/null greift der Standard nach Positionstyp (NORMAL & PAUSCHALE = 1, sonst 0).
     */
    static normalizeInEndsumme(val, positionstyp = 'NORMAL') {
        if (val !== undefined && val !== null) {
            return (val === 1 || val === '1' || val === true) ? 1 : 0;
        }
        const pType = (positionstyp || 'NORMAL').toUpperCase().trim();
        return (pType === 'NORMAL' || pType === 'PAUSCHALE') ? 1 : 0;
    }

    /**
     * Rundet monetäre Werte kaufmännisch auf 2 Dezimalstellen (Cent).
     */
    static round2(value) {
        return Math.round((parseFloat(value || 0) + Number.EPSILON) * 100) / 100;
    }

    /**
     * Berechnet Summen eines Angebots getrennt nach Positionstypen (NORMAL, ALTERNATIV, BEDARF, PAUSCHALE).
     * Berücksichtigt in_endsumme_enthalten für die finale Netto-, Steuer- und Bruttoberechnung.
     *
     * @param {Array} positionen - Array von Positionsobjekten
     * @param {Object} options - Optionale Parameter (defaultMwst, globalRabatt)
     * @returns {Object} Summenstruktur inkl. getrennter Summen nach Positionstyp und MwSt-Aufschlüsselung
     */
    static calculateTotals(positionen = [], options = {}) {
        const defaultMwst = options.defaultMwst !== undefined ? parseFloat(options.defaultMwst) : 19.0;

        const totalsByType = {
            NORMAL: { netto: 0, steuer: 0, brutto: 0, count: 0 },
            ALTERNATIV: { netto: 0, steuer: 0, brutto: 0, count: 0 },
            BEDARF: { netto: 0, steuer: 0, brutto: 0, count: 0 },
            PAUSCHALE: { netto: 0, steuer: 0, brutto: 0, count: 0 }
        };

        const taxBases = {};
        let endsummeNetto = 0;
        const endsummePositionen = [];

        for (const pos of positionen) {
            const menge = parseFloat(pos.menge) || 0;
            const preis = parseFloat(pos.preis) || 0;
            const rabatt = parseFloat(pos.rabatt) || 0;
            const mwstRate = pos.mwst !== undefined && pos.mwst !== null ? parseFloat(pos.mwst) : defaultMwst;

            const posNetto = this.round2(menge * preis * (1 - rabatt / 100));
            const posMwst = this.round2(posNetto * (mwstRate / 100));
            const posBrutto = this.round2(posNetto + posMwst);

            let pType = (pos.positionstyp || 'NORMAL').toUpperCase().trim();
            if (!totalsByType[pType]) {
                pType = 'NORMAL';
            }

            totalsByType[pType].netto = this.round2(totalsByType[pType].netto + posNetto);
            totalsByType[pType].steuer = this.round2(totalsByType[pType].steuer + posMwst);
            totalsByType[pType].brutto = this.round2(totalsByType[pType].brutto + posBrutto);
            totalsByType[pType].count += 1;

            // In Endsumme enthalten:
            // Standard: NORMAL und PAUSCHALE = enthalten (1). ALTERNATIV und BEDARF = nicht enthalten (0).
            const inEndsumme = this.normalizeInEndsumme(pos.in_endsumme_enthalten, pType) === 1;

            if (inEndsumme) {
                endsummeNetto = this.round2(endsummeNetto + posNetto);
                taxBases[mwstRate] = (taxBases[mwstRate] || 0) + posNetto;
                endsummePositionen.push(pos);
            }
        }

        // Steuern nach Sätzen für Endsumme berechnen
        const taxBreakdown = {};
        let endsummeSteuer = 0;

        for (const [rateStr, base] of Object.entries(taxBases)) {
            const rate = parseFloat(rateStr);
            const roundedBase = this.round2(base);
            const taxAmount = this.round2(roundedBase * (rate / 100));
            taxBreakdown[rateStr] = {
                rate,
                base: roundedBase,
                tax: taxAmount,
                brutto: this.round2(roundedBase + taxAmount)
            };
            endsummeSteuer = this.round2(endsummeSteuer + taxAmount);
        }

        const endsummeBrutto = this.round2(endsummeNetto + endsummeSteuer);

        return {
            netto: endsummeNetto,
            steuer: endsummeSteuer,
            brutto: endsummeBrutto,
            totalsByType,
            taxBreakdown,
            positionenCount: positionen.length,
            inEndsummeCount: endsummePositionen.length
        };
    }

    /**
     * Erstellt einen unveränderlichen JSON-Snapshot eines Angebots und setzt den Status auf 'VERSENDET'.
     *
     * @param {Object} angebot - Das Angebotsobjekt
     * @param {Array} positionen - Optional: Liste von Positionen (Standard: angebot.positionen)
     * @param {Object} options - Optionale Parameter
     * @returns {Object} Das aktualisierte Angebot mit freeze_snapshot_json und angebot_status = 'VERSENDET'
     */
    static freezeAngebot(angebot, positionen, options = {}) {
        if (!angebot) throw new Error('freezeAngebot: Kein Angebot übergeben.');

        const posList = positionen || angebot.positionen || [];
        const totals = this.calculateTotals(posList, options);

        const snapshot = {
            frozen_at: new Date().toISOString(),
            angebot_id: angebot.id || null,
            angebot_nr: angebot.nr || null,
            version: angebot.version || 1,
            parent_angebot_id: angebot.parent_angebot_id || null,
            auftraggeber_typ: angebot.auftraggeber_typ || 'PRIVAT',
            vergabe_verfahren: angebot.vergabe_verfahren || 'DIREKT',
            vertragsgrundlage: angebot.vertragsgrundlage || 'BGB_WERKVERTRAG',
            kundeId: angebot.kundeId || null,
            projektId: angebot.projektId || null,
            datum: angebot.datum || null,
            faellig: angebot.faellig || null,
            vortext: angebot.vortext || '',
            fusstext: angebot.fusstext || '',
            totals,
            positionen: posList.map((p, idx) => ({
                id: p.id !== undefined ? p.id : null,
                positionIndex: idx,
                artikelId: p.artikelId || null,
                titel: p.titel || null,
                name: p.name || '',
                menge: parseFloat(p.menge) || 0,
                einheit: p.einheit || 'Stk.',
                preis: parseFloat(p.preis) || 0,
                ek: parseFloat(p.ek) || 0,
                mwst: p.mwst !== undefined && p.mwst !== null ? parseFloat(p.mwst) : 19,
                rabatt: parseFloat(p.rabatt) || 0,
                positionstyp: (p.positionstyp || 'NORMAL').toUpperCase().trim(),
                in_endsumme_enthalten: this.normalizeInEndsumme(p.in_endsumme_enthalten, p.positionstyp),
                bieterangabe_wert: p.bieterangabe_wert || null,
                oz_code: p.oz_code || null,
                cost_type: p.cost_type || 'MATERIAL'
            })),
            konditionen: {
                skonto_tage: angebot.skonto_tage || 0,
                skonto_prozent: angebot.skonto_prozent || 0,
                sicherheitseinbehalt_prozent: angebot.sicherheitseinbehalt_prozent || 0
            }
        };

        const frozenSnapshotJson = JSON.stringify(snapshot);

        angebot.angebot_status = 'VERSENDET';
        angebot.status = 'VERSENDET';
        angebot.freeze_snapshot_json = frozenSnapshotJson;
        angebot.netto = totals.netto;
        angebot.steuer = totals.steuer;
        angebot.brutto = totals.brutto;
        if (!angebot.positionen && posList.length > 0) {
            angebot.positionen = posList;
        }

        return angebot;
    }

    /**
     * Erzeugt eine neue Version (v2, v3, ...) aus einem bestehenden Angebot.
     * Das Original bleibt unangetastet; die neue Version startet als veränderbarer 'ENTWURF'.
     *
     * @param {Object} originalAngebot - Das Basisangebot
     * @param {Array} originalPositionen - Optional: Positionen des Originals
     * @param {Object} options - Optionale Parameter (z.B. explizite Belegnummer options.nr)
     * @returns {Object} Neues Angebotsobjekt mit version = original.version + 1 und geklonten Positionen
     */
    static createVersion(originalAngebot, originalPositionen, options = {}) {
        if (!originalAngebot) throw new Error('createVersion: Kein Original-Angebot übergeben.');

        let positionsToClone = originalPositionen || originalAngebot.positionen;
        if ((!positionsToClone || positionsToClone.length === 0) && originalAngebot.freeze_snapshot_json) {
            try {
                const parsed = JSON.parse(originalAngebot.freeze_snapshot_json);
                positionsToClone = parsed.positionen || [];
            } catch (_e) {
                positionsToClone = [];
            }
        }
        positionsToClone = positionsToClone || [];

        const currentVersion = parseInt(originalAngebot.version, 10) || 1;
        const newVersion = currentVersion + 1;

        // Belegnummer mit Versionssuffix
        const baseNr = originalAngebot.nr ? String(originalAngebot.nr).trim() : 'ANG-001';
        let newNr = options.nr;
        if (!newNr) {
            if (/[-_.]?[vV]\d+$/.test(baseNr)) {
                newNr = baseNr.replace(/[-_.]?[vV]\d+$/, `-V${newVersion}`);
            } else {
                newNr = `${baseNr}-V${newVersion}`;
            }
        }

        const clonedPositionen = positionsToClone.map(p => ({
            artikelId: p.artikelId || null,
            titel: p.titel || null,
            name: p.name || '',
            menge: parseFloat(p.menge) || 0,
            einheit: p.einheit || 'Stk.',
            preis: parseFloat(p.preis) || 0,
            ek: parseFloat(p.ek) || 0,
            mwst: p.mwst !== undefined && p.mwst !== null ? parseFloat(p.mwst) : 19,
            rabatt: parseFloat(p.rabatt) || 0,
            positionstyp: (p.positionstyp || 'NORMAL').toUpperCase().trim(),
            in_endsumme_enthalten: this.normalizeInEndsumme(p.in_endsumme_enthalten, p.positionstyp),
            bieterangabe_wert: p.bieterangabe_wert || null,
            oz_code: p.oz_code || null,
            cost_type: p.cost_type || 'MATERIAL'
        }));

        const totals = this.calculateTotals(clonedPositionen, options);

        const newAngebot = {
            ...originalAngebot,
            id: undefined, // Eigene neue Zeile in der Datenbank
            nr: newNr,
            type: 'angebot',
            version: newVersion,
            parent_angebot_id: originalAngebot.id || null,
            angebot_status: 'ENTWURF',
            status: 'Entwurf',
            freeze_snapshot_json: null, // Neuer Entwurf ist noch nicht versendet/eingefroren
            angenommen_am: null,
            angenommene_version: null,
            isLocked: 0,
            netto: totals.netto,
            steuer: totals.steuer,
            brutto: totals.brutto,
            positionen: clonedPositionen
        };

        return newAngebot;
    }

    /**
     * Markiert ein Angebot als angenommen.
     *
     * @param {Object} angebot - Das angenommene Angebot
     * @param {number} acceptedVersion - Die angenommene Versionsnummer (Standard: angebot.version)
     * @param {Object} options - Optionale Parameter (z.B. angenommen_am)
     * @returns {Object} Das aktualisierte Angebot
     */
    static acceptAngebot(angebot, acceptedVersion, options = {}) {
        if (!angebot) throw new Error('acceptAngebot: Kein Angebot übergeben.');

        const ver = acceptedVersion !== undefined && acceptedVersion !== null
            ? parseInt(acceptedVersion, 10)
            : (parseInt(angebot.version, 10) || 1);

        angebot.angebot_status = 'ANGENOMMEN';
        angebot.status = 'ANGENOMMEN';
        angebot.angenommene_version = ver;
        angebot.angenommen_am = (options && options.angenommen_am) || new Date().toISOString();

        return angebot;
    }

    /**
     * Erstellt aus einem angenommenen Angebot eine Projekt-Datenstruktur mit stabiler Positionsreferenz.
     * Jede Projektposition erhält eine eigene, unabhängige ID; die ursprüngliche Angebotspositions-ID
     * wird als sourceOfferPositionId referenziert.
     *
     * @param {Object} angebot - Das angenommene Angebot
     * @param {Array} positionen - Positionen (Standard: angebot.positionen oder aus Freeze-Snapshot)
     * @param {Object} options - Optionale Parameter (name, start, ende, idGenerator, includeAll)
     * @returns {Object} Projekt-Datenstruktur
     */
    static createProjektFromAngebot(angebot, positionen, options = {}) {
        if (!angebot) throw new Error('createProjektFromAngebot: Kein Angebot übergeben.');

        let srcPositions = positionen || angebot.positionen;
        if ((!srcPositions || srcPositions.length === 0) && angebot.freeze_snapshot_json) {
            try {
                const parsed = JSON.parse(angebot.freeze_snapshot_json);
                srcPositions = parsed.positionen || [];
            } catch (_e) {
                srcPositions = [];
            }
        }
        srcPositions = srcPositions || [];

        // Standardmäßig werden alle in der Endsumme enthaltenen Positionen ins Projekt übernommen
        // Wenn options.includeAll gesetzt ist, werden alle Positionen übernommen.
        const filteredPositions = options.includeAll
            ? srcPositions
            : srcPositions.filter(p => this.normalizeInEndsumme(p.in_endsumme_enthalten, p.positionstyp) === 1);

        const version = angebot.angenommene_version || angebot.version || 1;

        const idGenerator = options.idGenerator || ((p, idx) => `proj_pos_${Date.now()}_${idx + 1}_${Math.random().toString(36).substring(2, 7)}`);

        const projectPositions = filteredPositions.map((pos, idx) => {
            const posId = pos.id !== undefined && pos.id !== null ? pos.id : (idx + 1);
            return {
                id: idGenerator(pos, idx),
                sourceOfferPositionId: posId,
                source_angebot_pos_id: posId,
                source_angebot_id: angebot.id || null,
                source_angebot_version: version,
                artikelId: pos.artikelId || null,
                titel: pos.titel || null,
                name: pos.name || '',
                menge: parseFloat(pos.menge) || 0,
                einheit: pos.einheit || 'Stk.',
                preis: parseFloat(pos.preis) || 0,
                ek: parseFloat(pos.ek) || 0,
                mwst: pos.mwst !== undefined && pos.mwst !== null ? parseFloat(pos.mwst) : 19,
                rabatt: parseFloat(pos.rabatt) || 0,
                positionstyp: (pos.positionstyp || 'NORMAL').toUpperCase().trim(),
                in_endsumme_enthalten: this.normalizeInEndsumme(pos.in_endsumme_enthalten, pos.positionstyp),
                oz_code: pos.oz_code || null,
                cost_type: pos.cost_type || 'MATERIAL',
                zeitansatz_h: parseFloat(pos.zeitansatz_h) || 0.0,
                lohn_ep: parseFloat(pos.lohn_ep) || 0.0,
                stoff_ep: parseFloat(pos.stoff_ep) || 0.0,
                geraet_ep: parseFloat(pos.geraet_ep) || 0.0,
                sonst_ep: parseFloat(pos.sonst_ep) || 0.0,
                ekt_stoff_je_me: parseFloat(pos.ekt_stoff_je_me) || 0.0,
                ekt_geraet_je_me: parseFloat(pos.ekt_geraet_je_me) || 0.0,
                ekt_sonst_je_me: parseFloat(pos.ekt_sonst_je_me) || 0.0,
                ekt_nu_je_me: parseFloat(pos.ekt_nu_je_me) || 0.0
            };
        });

        const totals = this.calculateTotals(projectPositions, options);

        const projekt = {
            name: options.name || `Projekt: ${angebot.nr || 'Angebot'} (v${version})`,
            kundeId: angebot.kundeId || null,
            source_angebot_id: angebot.id || null,
            source_angebot_version: version,
            auftraggeber_typ: angebot.auftraggeber_typ || 'PRIVAT',
            vertragsgrundlage: angebot.vertragsgrundlage || 'BGB_WERKVERTRAG',
            status: options.status || 'BEAUFTRAGT',
            budget: totals.netto,
            start: options.start || null,
            ende: options.ende || null,
            positionen: projectPositions,
            created_at: new Date().toISOString()
        };

        return projekt;
    }

    /**
     * Prüft ein Angebot auf Vollständigkeit und baurechtliche/kalkulatorische Risiken.
     * (Hinweis: Keine Rechtsberatung!)
     *
     * Risikoprüfungen:
     * - Fehlender / unvollständiger Preis: Blocker (FEHLENDER_PREIS).
     * - 0,00 € Preis: Erfordert explizite Bestätigung (PREIS_NULL_BESTAETIGUNG), kein Pauschalverbot.
     * - BGB § 650m Hinweis bei vertragsgrundlage === 'BGB_VERBRAUCHERBAU' (90% Grenze & 5% Sicherheitsleistung).
     * - Gültigkeitsdatum/Bindefrist vorhanden und plausibel.
     *
     * @param {Object} angebot - Das zu prüfende Angebot
     * @param {Array} positionen - Optional: Liste von Positionen
     * @param {Object} options - Optionale Parameter (z.B. confirmedZeroPrices)
     * @returns {Object} Validierungsergebnis { valid, errors, warnings, hinweise, requiresZeroPriceConfirmation }
     */
    static validateAngebot(angebot = {}, positionen, options = {}) {
        const errors = [];
        const warnings = [];
        const hinweise = [];

        const posList = positionen || angebot.positionen || [];

        if (!posList || posList.length === 0) {
            errors.push({
                code: 'KEINE_POSITIONEN',
                message: 'Das Angebot enthält keine Positionen.'
            });
        }

        const allowZeroPrice = Boolean(options.confirmedZeroPrices || options.allowZeroPrice);

        posList.forEach((pos, idx) => {
            const posLabel = pos.name || pos.titel || `Position #${idx + 1}`;

            // 1. Fehlender / leerer Einheitspreis
            const isPriceMissing = pos.preis === undefined ||
                pos.preis === null ||
                String(pos.preis).trim() === '' ||
                isNaN(parseFloat(pos.preis));

            if (isPriceMissing) {
                errors.push({
                    code: 'FEHLENDER_PREIS',
                    message: `${posLabel} hat keinen gültigen Einheitspreis.`,
                    positionIndex: idx,
                    positionId: pos.id || null
                });
            } else if (parseFloat(pos.preis) === 0) {
                // 2. 0,00 € Preis erfordert Bestätigung, ist aber kein genereller Fehler
                const isConfirmed = Boolean(pos.preis_null_bestaetigt || allowZeroPrice);
                if (!isConfirmed) {
                    warnings.push({
                        code: 'PREIS_NULL_BESTAETIGUNG',
                        message: `${posLabel} hat einen Einheitspreis von 0,00 €. Bitte bestätigen Sie, ob diese Leistung unentgeltlich angeboten wird.`,
                        positionIndex: idx,
                        positionId: pos.id || null,
                        requiresConfirmation: true
                    });
                }
            }
        });

        // 3. BGB § 650m Hinweis (Verbraucherbauvertrag)
        // Hinweis: Nach BGH VII ZR 94/22 begründet ein einzelnes Gewerk nicht automatisch einen Verbraucherbauvertrag.
        if (angebot.vertragsgrundlage === 'BGB_VERBRAUCHERBAU') {
            hinweise.push({
                code: 'BGB_650M_HINWEIS',
                message: 'Hinweis zu BGB § 650m (Verbraucherbauvertrag): Abschlagszahlungen dürfen maximal 90 % der Gesamtvergütung betragen. Bei der ersten Abschlagszahlung ist dem Verbraucher eine Sicherheit von 5 % für die rechtzeitige Herstellung ohne wesentliche Mängel zu leisten (BGH VII ZR 94/22 beachten: gilt nur bei echtem Verbraucherbauvertrag gem. § 650i BGB, nicht bei Einzelgewerken).',
                severity: 'INFO'
            });
        }

        // 4. Bindefrist / Gültigkeitsdatum
        const bindefrist = angebot.faellig || angebot.bindefrist_datum || angebot.gueltig_bis;
        if (!bindefrist || String(bindefrist).trim() === '') {
            warnings.push({
                code: 'BINDEFRIST_FEHLT',
                message: 'Es ist keine Bindefrist bzw. kein Gültigkeitsdatum für das Angebot hinterlegt.'
            });
        } else {
            const bDate = new Date(bindefrist);
            const aDate = new Date(angebot.datum || Date.now());
            if (!isNaN(bDate.getTime()) && !isNaN(aDate.getTime())) {
                const bTime = new Date(bDate.getFullYear(), bDate.getMonth(), bDate.getDate()).getTime();
                const aTime = new Date(aDate.getFullYear(), aDate.getMonth(), aDate.getDate()).getTime();
                if (bTime < aTime) {
                    warnings.push({
                        code: 'BINDEFRIST_UNPLAUSIBEL',
                        message: 'Das Gültigkeitsdatum bzw. die Bindefrist liegt vor dem Angebotsdatum.'
                    });
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            hinweise,
            requiresZeroPriceConfirmation: warnings.some(w => w.code === 'PREIS_NULL_BESTAETIGUNG')
        };
    }
}

if (typeof window !== 'undefined') {
    window.AngebotController = AngebotController;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AngebotController;
}

