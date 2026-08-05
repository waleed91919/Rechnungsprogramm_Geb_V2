# MVC-Refactoring Plan & Architektur-Dokumentation (W-Link ERP)

**Erstellt am:** 2026-08-05  
**Ziel:** Schrittweise Transformation der monolithischen Frontend-/Backend-Logik des Rechnungs-Moduls in ein klares MVC-Pattern (Model-View-Controller).

---

## 1. Übersicht & Zielsetzung

Um Spaghetti-Code zu vermeiden, Datenkapselung zu gewährleisten und das System für zukünftige Module (wie z. B. das Aufmaß-Modul) vorzubereiten, wird der bestehende Code aus `js/editor.js`, `db.js` und `code.html` in drei strikt getrennte Schichten unterteilt:

1. **Model (`models/`)**: Reiner Datenzugriff & SQLite-CRUD-Operationen via IPC/Database Driver. Keine UI-Manipulationen, keine Berechnungslogik.
2. **Controller (`controllers/`)**: Komplette Geschäftslogik (z. B. § 13b UStG, VOB/B, Sicherheitseinbehalte, Verrechnungen, Rabatte). Nimmt Eingaben der View entgegen, verarbeitet Daten und gibt Resultate an die View zurück.
3. **View (`views/`)**: Reine Präsentationsschicht (DOM-Manipulationen, Event-Listener, Rendering). Führt **keine** mathematischen/geschäftlichen Berechnungen durch.

---

## 2. Vorgeschlagene Ordner- und Dateistruktur

```
Rechnungsprogramm_Geb-main/
├── Architektur/
│   ├── arc_plan.txt
│   ├── architektur_analyse.md
│   └── mvc_refactoring_plan.md      <-- Dieses Dokument (Status & Dokumentation)
├── models/
│   ├── BaseModel.js                 <-- Generischer SQLite DB-Handler / IPC Interface
│   ├── InvoiceModel.js              <-- Rechnungs-Datenbankzugriffe (CRUD, Positionen, Entwürfe)
│   ├── ProjectModel.js              <-- Projekt- & Sicherheitseinbehalts-Daten
│   └── CustomerModel.js             <-- Kundendaten
├── controllers/
│   ├── InvoiceController.js         <-- Geschäftslogik: Steuerberechnung, Rabatte, VOB/B, § 13b
│   └── ProjectController.js
├── views/
│   ├── InvoiceView.js               <-- DOM-Rendering für Rechnungseditor, Summen-Anzeige
│   └── components/                  <-- Wiederverwendbare UI-Komponenten
├── js/                              <-- Legacy JS-Dateien (werden schrittweise migriert)
│   ├── editor.js                    <-- Wird schrittweise ausgedünnt
│   └── db.js
├── main.js
├── preload.js
└── code.html
```

---

## 3. Exemplarisches Refactoring der Kernfunktion: `calculateRechnungTotals`

Die bisherige Monolith-Funktion `calculateRechnungTotals()` in `js/editor.js` vermischte DOM-Abfragen (`document.getElementById`), Geschäftslogik (§ 13b UStG, Rabatte, Sicherheitseinbehalt) und DOM-Updates (`taxContainer.appendChild`).

### 3.1 Model (`models/InvoiceModel.js`)
*Aufgabe: Bereitstellen & Speichern von Rechnungs- und Projekt-Rohdaten aus der SQLite-Datenbank / State.*

```javascript
// models/InvoiceModel.js
export class InvoiceModel {
    constructor(dbInterface) {
        this.db = dbInterface;
    }

    /**
     * Lädt die Rechnungsdaten und verknüpfte Projektdaten.
     */
    async getInvoiceContext(invoiceId, projectId) {
        // SQLite Datenbank-Abfrage via IPC
        const invoiceData = invoiceId ? await this.db.getInvoiceById(invoiceId) : null;
        const projectData = projectId ? await this.db.getProjectById(projectId) : null;
        return { invoiceData, projectData };
    }

    /**
     * Speichert aktualisierte Rechnungs-Summen in der Datenbank.
     */
    async saveInvoiceTotals(invoiceId, totals) {
        return await this.db.updateInvoiceTotals(invoiceId, totals);
    }
}
```

---

### 3.2 Controller (`controllers/InvoiceController.js`)
*Aufgabe: Reine mathematische & fachliche Geschäftslogik. Völlig unabhängig vom DOM.*

```javascript
// controllers/InvoiceController.js
export class InvoiceController {
    /**
     * Berechnet alle Netto-, Brutto- und Steuersummen einer Rechnung unter Berücksichtigung von:
     * - Eingabemodus (Netto vs. Brutto)
     * - § 13b UStG (Abschaltung der MwSt pro Position oder Global)
     * - Proportionaler globaler Rabatt (% oder absolut)
     * - Sicherheitseinbehalt (z.B. VOB/B %)
     * - Bisherige Verrechnungen / Abschlagszahlungen
     */
    static calculateTotals({
        positionen = [],
        mode = 'netto',
        isGlobal13b = false,
        globalRabatt = { value: 0, type: '%' },
        sicherheitseinbehaltProzent = 0,
        verrechnungen = []
    }) {
        let positionenNetto = 0;
        let positionenBrutto = 0;
        let totals13bNetto = 0;
        let totalsNormalNetto = 0;
        const taxes = {};

        // 1. Positionen durchlaufen und Zwischensummen ermitteln
        const processedPositions = positionen.map(pos => {
            const rabatt = parseFloat(pos.rabatt) || 0;
            const mwstRate = parseFloat(pos.mwst) || 0;
            const pos13b = isGlobal13b && Boolean(pos.is13b);
            let rowNetto = 0;
            let rowBrutto = 0;
            let tax = 0;

            if (mode === 'netto') {
                rowNetto = (pos.menge * pos.preis) * (1 - rabatt / 100);
                tax = pos13b ? 0 : (rowNetto * (mwstRate / 100));
                rowBrutto = rowNetto + tax;
            } else {
                rowBrutto = (pos.menge * pos.preis) * (1 - rabatt / 100);
                if (pos13b) {
                    rowNetto = rowBrutto;
                    tax = 0;
                } else {
                    rowNetto = rowBrutto / (1 + mwstRate / 100);
                    tax = rowBrutto - rowNetto;
                }
            }

            positionenNetto += rowNetto;
            positionenBrutto += rowBrutto;

            if (pos13b) {
                totals13bNetto += rowNetto;
            } else {
                totalsNormalNetto += rowNetto;
                if (mwstRate > 0) {
                    taxes[mwstRate] = (taxes[mwstRate] || 0) + tax;
                }
            }

            return { ...pos, rowNetto, rowBrutto, tax, pos13b };
        });

        // 2. Globalen Rabatt berechnen
        const baseForGlobalRabatt = mode === 'netto' ? positionenNetto : positionenBrutto;
        let abzug = 0;
        if (globalRabatt.value > 0) {
            abzug = globalRabatt.type === '%' 
                ? baseForGlobalRabatt * (globalRabatt.value / 100) 
                : globalRabatt.value;
        }

        // 3. Verrechnungen aufsummieren
        const verrechnungenSummeNetto = verrechnungen.reduce((sum, v) => sum + (parseFloat(v.abzugsbetrag_netto) || 0), 0);

        // 4. Netto nach Rabatt & Abzüge
        let nettoNachRabatt = 0;
        let bruttoNachRabatt = 0;
        let sicherheitseinbehaltNetto = 0;
        let taxBreakdown = [];
        let totalTax = 0;

        if (mode === 'netto') {
            nettoNachRabatt = Math.max(0, positionenNetto - abzug);
            const rabattFaktor = positionenNetto > 0 ? (nettoNachRabatt / positionenNetto) : 1;

            if (sicherheitseinbehaltProzent > 0) {
                sicherheitseinbehaltNetto = nettoNachRabatt * (sicherheitseinbehaltProzent / 100);
            }

            let steuerpflichtigesNetto = Math.max(0, nettoNachRabatt - sicherheitseinbehaltNetto - verrechnungenSummeNetto);
            const taxableRatio = nettoNachRabatt > 0 ? (steuerpflichtigesNetto / nettoNachRabatt) : 0;

            Object.keys(taxes).forEach(rate => {
                const baseTax = taxes[rate] * rabattFaktor;
                const adjustedTax = baseTax * taxableRatio;
                totalTax += adjustedTax;
                taxBreakdown.push({
                    rate: parseFloat(rate),
                    amount: adjustedTax,
                    isReduced: taxableRatio < 1
                });
            });

            bruttoNachRabatt = steuerpflichtigesNetto + totalTax;
        } else {
            // Mode Brutto
            bruttoNachRabatt = Math.max(0, positionenBrutto - abzug);
            const rabattFaktor = positionenBrutto > 0 ? (bruttoNachRabatt / positionenBrutto) : 1;
            let totalTaxBase = 0;
            Object.keys(taxes).forEach(rate => {
                const adjustedTax = taxes[rate] * rabattFaktor;
                totalTaxBase += adjustedTax;
                taxBreakdown.push({ rate: parseFloat(rate), amount: adjustedTax, isReduced: false });
            });
            nettoNachRabatt = bruttoNachRabatt - totalTaxBase;
            totalTax = totalTaxBase;
        }

        return {
            zwischensumme: mode === 'netto' ? positionenNetto : positionenBrutto,
            positionenNetto,
            positionenBrutto,
            nettoNachRabatt,
            bruttoNachRabatt,
            totals13bNetto,
            totalsNormalNetto,
            sicherheitseinbehaltNetto,
            sicherheitseinbehaltProzent,
            verrechnungenSummeNetto,
            taxBreakdown,
            totalTax,
            processedPositions
        };
    }
}
```

---

### 3.3 View (`views/InvoiceView.js`)
*Aufgabe: Liest Benutzereingaben aus dem DOM, ruft den Controller auf und rendern die berechneten Ergebnisse im DOM.*

```javascript
// views/InvoiceView.js
import { InvoiceController } from '../controllers/InvoiceController.js';

export class InvoiceView {
    constructor(formatCurrencyUtil) {
        this.formatCurrency = formatCurrencyUtil;
    }

    /**
     * Liest aktuelle UI-Formulardaten aus dem DOM.
     */
    readFormData(currentPositions, currentVerrechnungen, currentProjekt) {
        const modeEl = document.getElementById('rechnung-eingabemodus');
        const is13bEl = document.getElementById('rechnung-13b-ustg');
        const rabattValEl = document.getElementById('rechnung-global-rabatt');
        const rabattTypeEl = document.getElementById('rechnung-global-rabatt-type');

        return {
            positionen: currentPositions || [],
            verrechnungen: currentVerrechnungen || [],
            mode: modeEl ? modeEl.value : 'netto',
            isGlobal13b: is13bEl ? is13bEl.checked : false,
            globalRabatt: {
                value: parseFloat(rabattValEl?.value) || 0,
                type: rabattTypeEl?.value || '%'
            },
            sicherheitseinbehaltProzent: currentProjekt?.sicherheitseinbehalt_prozent || 0
        };
    }

    /**
     * Übermittelt die vom Controller berechneten Werte an die UI.
     */
    renderTotals(calculated) {
        // 1. Zwischensumme
        const zwischensummeEl = document.getElementById('rechnung-zwischensumme');
        if (zwischensummeEl) {
            zwischensummeEl.innerText = this.formatCurrency(calculated.zwischensumme);
        }

        // 2. Steuern-Container rendern
        const taxContainer = document.getElementById('rechnung-steuern-container');
        if (taxContainer) {
            taxContainer.innerHTML = '';
            if (calculated.taxBreakdown.length === 0 || calculated.totalTax === 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'text-right text-xs text-slate-400 italic';
                emptyDiv.textContent = 'Keine Steuern berechnet';
                taxContainer.appendChild(emptyDiv);
            } else {
                calculated.taxBreakdown.forEach(taxItem => {
                    const div = document.createElement('div');
                    div.className = 'flex justify-between items-center text-slate-500';
                    div.innerHTML = `
                        <span>zzgl. ${taxItem.rate}% MwSt.${taxItem.isReduced ? ' (auf gemindertes Netto)' : ''}</span>
                        <span class="font-mono">${this.formatCurrency(taxItem.amount)}</span>
                    `;
                    taxContainer.appendChild(div);
                });
            }
        }

        // 3. Sicherheitseinbehalt Row
        const sichRow = document.getElementById('rechnung-sicherheitseinbehalt-row');
        if (sichRow) {
            if (calculated.sicherheitseinbehaltNetto > 0) {
                sichRow.classList.remove('hidden');
                document.getElementById('rechnung-sicherheitseinbehalt-label').innerText = 
                    `Sicherheitseinbehalt Netto (${calculated.sicherheitseinbehaltProzent}%)`;
                document.getElementById('rechnung-sicherheitseinbehalt-wert').innerText = 
                    '-' + this.formatCurrency(calculated.sicherheitseinbehaltNetto);
            } else {
                sichRow.classList.add('hidden');
            }
        }

        // 4. Verrechnungen Row
        const verrRow = document.getElementById('rechnung-verrechnungen-row');
        if (verrRow) {
            if (calculated.verrechnungenSummeNetto > 0) {
                verrRow.classList.remove('hidden');
                const verrWert = document.getElementById('rechnung-verrechnungen-wert');
                if (verrWert) verrWert.innerText = '-' + this.formatCurrency(calculated.verrechnungenSummeNetto);
            } else {
                verrRow.classList.add('hidden');
            }
        }
    }

    /**
     * Reagiert auf Eingabe-Events (Eingabemodus, Rabatte, etc.) und stößt Neuberechnung an.
     */
    onInputChanged(currentPositions, currentVerrechnungen, currentProjekt, stateUpdateCallback) {
        const formData = this.readFormData(currentPositions, currentVerrechnungen, currentProjekt);
        const calculated = InvoiceController.calculateTotals(formData);
        
        // UI rendern
        this.renderTotals(calculated);

        // State zurückschreiben wenn nötig
        if (stateUpdateCallback) {
            stateUpdateCallback(calculated);
        }
    }
}
```

---

## 4. Schrittweiser Migrationsplan (Status)

1. **Phase 1 (ABGESCHLOSSEN):**
   - Physische Erstellung der MVC-Klassen: [`models/InvoiceModel.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb-main/models/InvoiceModel.js), [`controllers/InvoiceController.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb-main/controllers/InvoiceController.js), [`views/InvoiceView.js`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb-main/views/InvoiceView.js).
   - Einbindung der Skripte in [`code.html`](file:///C:/Users/walee/Desktop/server/Rechnungsprogramm_Geb-main/code.html).
   - Entkopplung der Live-Berechnungen (`calculateRechnungTotals`) und Weiterleitung der Logik an den `InvoiceController` & `InvoiceView`.
   - Alte monolithische Logik in `js/editor.js` wurde durch saubere MVC-Delegation ersetzt.

2. **Phase 2 (ABGESCHLOSSEN):**
   - Auslagerung der Rechnungs-Stornierungslogik (Gutschrifterstellung) & Statusänderungen in den `InvoiceController`.
   - Entkopplung der Formular- & UI-Rendering-Interaktionen in der `InvoiceView`.

3. **Phase 3 (ABGESCHLOSSEN):**
   - Vollständiges Kapseln aller SQLite-Datenbankzugriffe (Speichern, Löschen, Storno, Als-Bezahlt-Markieren, State-Synchronisation) im `InvoiceModel`.

