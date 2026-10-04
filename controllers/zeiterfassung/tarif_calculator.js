// tarif_calculator.js
(function() {
    function calculateBRTVWegezeit(distanzKm, taeglicheHeimfahrt = true, abwesenheitStunden = 8.5) {
            const km = Math.max(0, parseFloat(distanzKm) || 0);
    
            if (taeglicheHeimfahrt) {
                // Voraussetzung: > 8 Stunden berufsbedingte Abwesenheit
                if (abwesenheitStunden <= 8.0) {
                    return { entschädigungEur: 0.0, steuerfrei: true, bemerkung: 'Abwesenheit <= 8h: Kein tariflicher Anspruch' };
                }
                if (km <= 50) {
                    return { entschädigungEur: 7.00, steuerfrei: true, kategorie: 'BRTV § 7 Ziff. 3.2 (0-50 km)' };
                } else if (km <= 75) {
                    return { entschädigungEur: 8.00, steuerfrei: true, kategorie: 'BRTV § 7 Ziff. 3.2 (51-75 km)' };
                } else {
                    return { entschädigungEur: 9.00, steuerfrei: true, kategorie: 'BRTV § 7 Ziff. 3.2 (> 75 km)' };
                }
            } else {
                // Fernbaustellen / Übernachtung (Entschädigung pro An-/Abreisefahrt, steuerpflichtig)
                if (km < 75) {
                    return { entschädigungEur: 0.0, steuerfrei: false, bemerkung: 'Entfernung < 75 km für Fernbaustelle' };
                } else if (km <= 200) {
                    return { entschädigungEur: 9.00, steuerfrei: false, kategorie: 'BRTV § 7 Ziff. 4.2 (75-200 km)' };
                } else if (km <= 300) {
                    return { entschädigungEur: 18.00, steuerfrei: false, kategorie: 'BRTV § 7 Ziff. 4.2 (201-300 km)' };
                } else if (km <= 400) {
                    return { entschädigungEur: 27.00, steuerfrei: false, kategorie: 'BRTV § 7 Ziff. 4.2 (301-400 km)' };
                } else {
                    return { entschädigungEur: 39.00, steuerfrei: false, kategorie: 'BRTV § 7 Ziff. 4.2 (> 400 km)' };
                }
            }
        }

    function calculateMonatsuebersicht(zeiteintraege = [], mitarbeiter = {}) {
            let gesamtBruttoMin = 0;
            let gesamtNettoMin = 0;
            let gesamtPauseMin = 0;
            let gesamtWegezeitEur = 0;
            let verstoesseCount = 0;
            const tagMap = new Map();
    
            for (const ze of zeiteintraege) {
                const start = ze.zeit_von;
                const ende = ze.zeit_bis;
                const pause = ze.pause_min || 0;
    
                if (start && ende) {
                    const calc = this.calculateWorkTime(start, ende, pause);
                    if (calc.valid) {
                        gesamtBruttoMin += calc.bruttoMin;
                        gesamtNettoMin += calc.nettoMin;
                        gesamtPauseMin += calc.effektivePauseMin;
                        if (calc.hasVerstoss) verstoesseCount++;
                    }
                } else if (ze.dauer_min) {
                    gesamtNettoMin += ze.dauer_min;
                }
    
                gesamtWegezeitEur += (parseFloat(ze.wegezeit_eur) || 0);
    
                // Tagesgruppierung
                if (start) {
                    const tagStr = start.split('T')[0];
                    if (!tagMap.has(tagStr)) {
                        tagMap.set(tagStr, []);
                    }
                    tagMap.get(tagStr).push(ze);
                }
            }
    
            const gesamtNettoStunden = Math.round((gesamtNettoMin / 60) * 100) / 100;
            const stundensatz = parseFloat(mitarbeiter.tarif_stundensatz) || 15.00;
            const bruttoVerdienstEur = Math.round((gesamtNettoStunden * stundensatz + gesamtWegezeitEur) * 100) / 100;
    
            return {
                mitarbeiterId: mitarbeiter.id,
                mitarbeiterName: `${mitarbeiter.vorname || ''} ${mitarbeiter.nachname || ''}`.trim() || 'Mitarbeiter',
                anzahlEintraege: zeiteintraege.length,
                arbeitstage: tagMap.size,
                gesamtBruttoStunden: Math.round((gesamtBruttoMin / 60) * 100) / 100,
                gesamtNettoStunden,
                gesamtPauseMin,
                gesamtWegezeitEur: Math.round(gesamtWegezeitEur * 100) / 100,
                tarifStundensatz: stundensatz,
                bruttoVerdienstEur,
                verstoesseCount
            };
        }

    const moduleExports = {
        calculateBRTVWegezeit,
        calculateMonatsuebersicht,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = moduleExports;
    }
    if (typeof window !== 'undefined') {
        window.TarifCalculator = moduleExports;
    }
})();
