// arbzg_calculator.js
(function() {
    function calculateWorkTime(start, ende, manuellePauseMin = 0) {
            const dStart = new Date(start);
            const dEnde = new Date(ende);
    
            if (isNaN(dStart.getTime()) || isNaN(dEnde.getTime()) || dEnde <= dStart) {
                return { valid: false, error: 'Ungültiges Start- oder Enddatum' };
            }
    
            const bruttoMin = Math.round((dEnde - dStart) / (1000 * 60));
            const bruttoStunden = Math.round((bruttoMin / 60) * 100) / 100;
            const pauseMin = Math.max(0, parseInt(manuellePauseMin, 10) || 0);
    
            // Gesetzliche Mindestpausen nach § 4 ArbZG:
            // > 6 bis 9 Stunden: mind. 30 Minuten
            // > 9 Stunden: mind. 45 Minuten
            let gesetzlichePflichtPauseMin = 0;
            if (bruttoStunden > 9.0) {
                gesetzlichePflichtPauseMin = 45;
            } else if (bruttoStunden > 6.0) {
                gesetzlichePflichtPauseMin = 30;
            }
    
            // Effektive Pause ist das Maximum aus erfasster Pause und gesetzlicher Pflichtpause
            const effektivePauseMin = Math.max(pauseMin, gesetzlichePflichtPauseMin);
            const nettoMin = Math.max(0, bruttoMin - effektivePauseMin);
            const nettoStunden = Math.round((nettoMin / 60) * 100) / 100;
    
            // Verstöße gegen Arbeitszeitgesetz ermitteln
            const verstoesse = [];
            if (nettoStunden > 10.0) {
                verstoesse.push('Überschreitung der absoluten Höchstarbeitszeit von 10 Stunden (§ 3 ArbZG).');
            }
            if (bruttoStunden > 6.0 && pauseMin < 30) {
                verstoesse.push('Unzureichende Ruhepause: Bei mehr als 6 Stunden Arbeit sind mindestens 30 Minuten Pause vorgeschrieben (§ 4 ArbZG).');
            }
            if (bruttoStunden > 9.0 && pauseMin < 45) {
                verstoesse.push('Unzureichende Ruhepause: Bei mehr als 9 Stunden Arbeit sind mindestens 45 Minuten Pause vorgeschrieben (§ 4 ArbZG).');
            }
    
            return {
                valid: true,
                bruttoMin,
                bruttoStunden,
                gesetzlichePflichtPauseMin,
                manuellePauseMin: pauseMin,
                effektivePauseMin,
                nettoMin,
                nettoStunden,
                hasVerstoss: verstoesse.length > 0,
                verstoesse
            };
        }

    function checkRuhezeit(vorherigesEnde, neuesterStart) {
            if (!vorherigesEnde || !neuesterStart) return { valid: true };
            const dVorher = new Date(vorherigesEnde);
            const dNeu = new Date(neuesterStart);
            if (isNaN(dVorher.getTime()) || isNaN(dNeu.getTime())) return { valid: true };
    
            const diffStunden = (dNeu - dVorher) / (1000 * 60 * 60);
    
            if (diffStunden < 11.0) {
                return {
                    valid: false,
                    ruhezeitStunden: Math.round(diffStunden * 100) / 100,
                    warnung: `Verstoß gegen § 5 ArbZG: Die ununterbrochene Ruhezeit beträgt nur ${diffStunden.toFixed(1)} h (gesetzlich gefordert: mind. 11 h).`
                };
            }
            return { valid: true, ruhezeitStunden: Math.round(diffStunden * 100) / 100 };
        }

    function pruefeArbzgKonformitaet(zeiteintraege = []) {
            const sorted = [...zeiteintraege].filter(z => z.zeit_von && z.zeit_bis)
                .sort((a, b) => new Date(a.zeit_von) - new Date(b.zeit_von));
    
            const resultate = [];
            let vorherigesEnde = null;
    
            for (const eintrag of sorted) {
                const timeCalc = this.calculateWorkTime(eintrag.zeit_von, eintrag.zeit_bis, eintrag.pause_min);
                let ruhezeitCheck = { valid: true };
    
                if (vorherigesEnde) {
                    ruhezeitCheck = this.checkRuhezeit(vorherigesEnde, eintrag.zeit_von);
                }
    
                const istKonform = timeCalc.valid && !timeCalc.hasVerstoss && ruhezeitCheck.valid;
                const fehler = [...(timeCalc.verstoesse || [])];
                if (!ruhezeitCheck.valid && ruhezeitCheck.warnung) {
                    fehler.push(ruhezeitCheck.warnung);
                }
    
                resultate.push({
                    uuid: eintrag.uuid,
                    mitarbeiterId: eintrag.mitarbeiter_id,
                    zeitVon: eintrag.zeit_von,
                    zeitBis: eintrag.zeit_bis,
                    nettoStunden: timeCalc.nettoStunden || 0,
                    istKonform,
                    fehler
                });
    
                vorherigesEnde = eintrag.zeit_bis;
            }
    
            return {
                gesamtGeprueft: resultate.length,
                gesamtKonform: resultate.filter(r => r.istKonform).length,
                gesamtNichtKonform: resultate.filter(r => !r.istKonform).length,
                details: resultate
            };
        }

    const moduleExports = {
        calculateWorkTime,
        checkRuhezeit,
        pruefeArbzgKonformitaet,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = moduleExports;
    }
    if (typeof window !== 'undefined') {
        window.ArbzgCalculator = moduleExports;
    }
})();
