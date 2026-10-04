// constants.js
(function() {
    const TAETIGKEITEN = {
            PRODUKTIV: 'PRODUKTIV',             // Gewerk / Position / Regie
            RUESTZEIT: 'RUESTZEIT',             // Lager / Vorbereitung / Laden
            WEGEZEIT_FAHRER: 'WEGEZEIT_FAHRER', // Lenkzeit (gilt voll als Arbeitszeit)
            WEGEZEIT_MITFAHRER: 'WEGEZEIT_MITFAHRER', // Tarifliche Wegezeitentschädigung
            SCHLECHTWEWETTER: 'SCHLECHTWEWETTER', // Saison-KUG (§ 101 SGB III)
            BEREITSCHAFT: 'BEREITSCHAFT',
            REINIGUNG: 'REINIGUNG'
        };;

    const STATUS = {
            ERFASST: 'ERFASST',
            GEPRUEFT: 'GEPRUEFT',
            FREIGEGEBEN: 'FREIGEGEBEN',
            ABGERECHNET: 'ABGERECHNET',
            STORNIERT: 'STORNIERT'
        };;

    const LOHNGRUPPEN = {
            LG1: { id: 'LG1', name: 'LG 1 - Innenreinigung / Helfer', satz: 15.00 },
            LG2: { id: 'LG2', name: 'LG 2 - Bauhelfer', satz: 16.50 },
            LG3: { id: 'LG3', name: 'LG 3 - Fachhelfer / Maschinist', satz: 18.20 },
            LG4: { id: 'LG4', name: 'LG 4 - Baufacharbeiter / Geselle', satz: 21.00 },
            LG5: { id: 'LG5', name: 'LG 5 - Spezialfacharbeiter / Vorarbeiter', satz: 24.50 },
            LG6: { id: 'LG6', name: 'LG 6 - Werkpolier / Meister / Glasreinigung', satz: 28.50 }
        };;

    const moduleExports = {
        TAETIGKEITEN,
        STATUS,
        LOHNGRUPPEN,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = moduleExports;
    }
    if (typeof window !== 'undefined') {
        window.ZeiterfassungConstants = moduleExports;
    }
})();
