/**
 * views/ZeiterfassungView.js - Desktop-Center für Mitarbeiter, Arbeitszeitnachweis & VOB/B
 */

class ZeiterfassungView {
    constructor() {
        this.mitarbeiter = [];
        this.zeiteintraege = [];
        this.vobMeldungen = [];
        this.activeSubTab = 'zeiten'; // 'zeiten' | 'mitarbeiter' | 'monatsbericht' | 'vob'
    }

    async render() {
        return `
            <div class="view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div>
                    <h1 style="font-size: 24px; font-weight: bold; color: var(--text-color, #1e293b);">
                        ⏱️ Zeiterfassung & Mobiler Baustellenbegleiter
                    </h1>
                    <p style="color: #64748b; font-size: 13px; margin-top: 4px;">
                        BAG/ArbZG-konforme Zeiterfassung, BRTV-Wegezeiten, Mitarbeiter-Lohngruppen & VOB/B Meldungen
                    </p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-primary" onclick="ZeiterfassungView.openNewZeiteintragModal()">
                        + Zeit manuell buchen
                    </button>
                    <button class="btn btn-secondary" onclick="ZeiterfassungView.openNewVobModal()">
                        + VOB/B Meldung erfassen
                    </button>
                </div>
            </div>

            <!-- Sub-Tabs Navigation -->
            <div style="display: flex; gap: 8px; border-bottom: 1px solid #e2e8f0; margin-bottom: 20px;">
                <button class="subtab-btn ${this.activeSubTab === 'zeiten' ? 'active' : ''}" onclick="ZeiterfassungView.switchSubTab('zeiten')" style="padding: 10px 16px; border: none; background: none; font-weight: 600; cursor: pointer; border-bottom: 2px solid ${this.activeSubTab === 'zeiten' ? '#2563eb' : 'transparent'}; color: ${this.activeSubTab === 'zeiten' ? '#2563eb' : '#64748b'};">
                    📋 Zeiteinträge & Stempelungen
                </button>
                <button class="subtab-btn ${this.activeSubTab === 'mitarbeiter' ? 'active' : ''}" onclick="ZeiterfassungView.switchSubTab('mitarbeiter')" style="padding: 10px 16px; border: none; background: none; font-weight: 600; cursor: pointer; border-bottom: 2px solid ${this.activeSubTab === 'mitarbeiter' ? '#2563eb' : 'transparent'}; color: ${this.activeSubTab === 'mitarbeiter' ? '#2563eb' : '#64748b'};">
                    👷 Mitarbeiter & Lohngruppen
                </button>
                <button class="subtab-btn ${this.activeSubTab === 'monatsbericht' ? 'active' : ''}" onclick="ZeiterfassungView.switchSubTab('monatsbericht')" style="padding: 10px 16px; border: none; background: none; font-weight: 600; cursor: pointer; border-bottom: 2px solid ${this.activeSubTab === 'monatsbericht' ? '#2563eb' : 'transparent'}; color: ${this.activeSubTab === 'monatsbericht' ? '#2563eb' : '#64748b'};">
                    📊 Monatsauswertung (ArbZG & BRTV)
                </button>
                <button class="subtab-btn ${this.activeSubTab === 'vob' ? 'active' : ''}" onclick="ZeiterfassungView.switchSubTab('vob')" style="padding: 10px 16px; border: none; background: none; font-weight: 600; cursor: pointer; border-bottom: 2px solid ${this.activeSubTab === 'vob' ? '#2563eb' : 'transparent'}; color: ${this.activeSubTab === 'vob' ? '#2563eb' : '#64748b'};">
                    ⚖️ VOB/B Meldewesen (§ 4.3 / § 6.1)
                </button>
            </div>

            <!-- Content Area -->
            <div id="zeiterfassung-content">
                ${await this.renderSubTabContent()}
            </div>
        `;
    }

    async renderSubTabContent() {
        if (this.activeSubTab === 'mitarbeiter') {
            return await this.renderMitarbeiterTab();
        } else if (this.activeSubTab === 'monatsbericht') {
            return await this.renderMonatsberichtTab();
        } else if (this.activeSubTab === 'vob') {
            return await this.renderVobTab();
        }
        return await this.renderZeitenTab();
    }

    async renderZeitenTab() {
        const eintraege = await window.api.getZeiteintraege();
        let rows = '';

        if (!eintraege || eintraege.length === 0) {
            rows = `<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 24px;">Keine Zeiteinträge vorhanden.</td></tr>`;
        } else {
            eintraege.forEach(z => {
                const von = z.zeit_von ? new Date(z.zeit_von).toLocaleString('de-DE') : '-';
                const bis = z.zeit_bis ? new Date(z.zeit_bis).toLocaleString('de-DE') : '<span class="badge badge-warning">LÄUFT</span>';
                const dauerStd = z.dauer_min ? (z.dauer_min / 60).toFixed(2) + ' h' : '-';
                const maName = `${z.mitarbeiter_vorname || ''} ${z.mitarbeiter_nachname || ''} (${z.personalnummer || ''})`;

                rows += `
                    <tr>
                        <td><strong>${maName}</strong></td>
                        <td>${z.projekt_name || '<span style="color:#94a3b8;">Allgemein</span>'}</td>
                        <td><span class="badge" style="background:#e2e8f0; color:#334155;">${z.taetigkeit_typ}</span></td>
                        <td>${von}</td>
                        <td>${bis}</td>
                        <td><strong>${dauerStd}</strong> (Pause: ${z.pause_min || 0}m)</td>
                        <td>${z.wegezeit_eur ? parseFloat(z.wegezeit_eur).toFixed(2) + ' €' : '-'}</td>
                        <td>
                            <button class="btn-icon" onclick="ZeiterfassungView.deleteZeiteintrag('${z.uuid}')" title="Löschen">🗑️</button>
                        </td>
                    </tr>
                `;
            });
        }

        return `
            <div class="card" style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
                <table class="table" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569;">
                            <th style="padding: 12px;">Mitarbeiter</th>
                            <th style="padding: 12px;">Projekt</th>
                            <th style="padding: 12px;">Tätigkeit</th>
                            <th style="padding: 12px;">Von</th>
                            <th style="padding: 12px;">Bis</th>
                            <th style="padding: 12px;">Netto-Arbeitszeit</th>
                            <th style="padding: 12px;">Wegezeit</th>
                            <th style="padding: 12px;">Aktionen</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    async renderMitarbeiterTab() {
        const maList = await window.api.getMitarbeiter();
        let rows = '';

        maList.forEach(m => {
            rows += `
                <tr>
                    <td><strong>${m.personalnummer}</strong></td>
                    <td>${m.vorname} ${m.nachname}</td>
                    <td><span class="badge" style="background:#dbeafe; color:#1d4ed8;">${m.lohngruppe_id}</span></td>
                    <td><strong>${parseFloat(m.tarif_stundensatz).toFixed(2)} €/h</strong></td>
                    <td>${m.ist_kolonnenfuehrer ? '⭐ Ja (Polier/Meister)' : 'Nein'}</td>
                    <td>${m.telefon || '-'}</td>
                    <td><span class="badge" style="background:${m.aktiv ? '#dcfce7; color:#15803d;' : '#fee2e2; color:#b91c1c;'}">${m.aktiv ? 'Aktiv' : 'Inaktiv'}</span></td>
                    <td>
                        <button class="btn-icon" onclick="ZeiterfassungView.editMitarbeiter(${m.id})" title="Bearbeiten">✏️</button>
                        <button class="btn-icon" onclick="ZeiterfassungView.deleteMitarbeiter(${m.id})" title="Löschen">🗑️</button>
                    </td>
                </tr>
            `;
        });

        return `
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <h3>Mitarbeiterstamm & Tarifgruppen (BRTV / RTV)</h3>
                <button class="btn btn-primary" onclick="ZeiterfassungView.openNewMitarbeiterModal()">+ Mitarbeiter anlegen</button>
            </div>
            <div class="card" style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
                <table class="table" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569;">
                            <th style="padding: 12px;">Pers.-Nr.</th>
                            <th style="padding: 12px;">Name</th>
                            <th style="padding: 12px;">Lohngruppe</th>
                            <th style="padding: 12px;">Stundensatz</th>
                            <th style="padding: 12px;">Kolonnenführer</th>
                            <th style="padding: 12px;">Kontakt</th>
                            <th style="padding: 12px;">Status</th>
                            <th style="padding: 12px;">Aktionen</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    async renderMonatsberichtTab() {
        const now = new Date();
        const monat = now.getMonth() + 1;
        const jahr = now.getFullYear();

        const data = await window.api.getZeiterfassungMonatsauswertung(monat, jahr);
        let cards = '';

        if (data && data.auswertungen) {
            data.auswertungen.forEach(a => {
                const arbzg = a.arbzg || {};
                const hasIssues = arbzg.gesamtNichtKonform > 0;
                cards += `
                    <div class="card" style="background: white; border: 1px solid ${hasIssues ? '#f87171' : '#e2e8f0'}; border-radius: 8px; padding: 16px; margin-bottom: 14px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <h4 style="font-size: 16px; font-weight: bold; color: #0f172a;">${a.mitarbeiterName}</h4>
                            <span class="badge" style="background:${hasIssues ? '#fee2e2; color:#b91c1c;' : '#dcfce7; color:#15803d;'}">
                                ${hasIssues ? `⚠️ ${arbzg.gesamtNichtKonform} ArbZG-Verstöße` : '✅ 100% ArbZG-konform'}
                            </span>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; font-size: 13px;">
                            <div><strong>Arbeitstage:</strong> ${a.arbeitstage}</div>
                            <div><strong>Netto-Stunden:</strong> ${a.gesamtNettoStunden} h</div>
                            <div><strong>Tarif-Wegezeit:</strong> ${a.gesamtWegezeitEur.toFixed(2)} €</div>
                            <div><strong>Brutto-Lohnanspruch:</strong> ${a.bruttoVerdienstEur.toFixed(2)} €</div>
                        </div>
                    </div>
                `;
            });
        }

        return `
            <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
                <h3>Monatsnachweis & BAG-Wächter (${String(monat).padStart(2, '0')}/${jahr})</h3>
            </div>
            <div>${cards}</div>
        `;
    }

    async renderVobTab() {
        const meldungen = await window.api.getVobMeldungen();
        let rows = '';

        if (!meldungen || meldungen.length === 0) {
            rows = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 24px;">Keine VOB/B Meldungen vorhanden.</td></tr>`;
        } else {
            meldungen.forEach(m => {
                const isBedenken = m.typ === 'BEDENKEN_4_3';
                const typLabel = isBedenken ? 'Bedenken § 4.3' : 'Behinderung § 6.1';
                const badgeStyle = isBedenken ? 'background:#fef3c7; color:#b45309;' : 'background:#fee2e2; color:#b91c1c;';

                rows += `
                    <tr>
                        <td><strong>${m.datum}</strong></td>
                        <td><span class="badge" style="${badgeStyle}">${typLabel}</span></td>
                        <td><strong>${m.projekt_name || '-'}</strong></td>
                        <td>${m.betreff}</td>
                        <td>${m.auswirkung_bauzeit_tage ? m.auswirkung_bauzeit_tage + ' Tage' : '-'}</td>
                        <td><span class="badge" style="background:#e2e8f0; color:#334155;">${m.status}</span></td>
                        <td>
                            <button class="btn btn-secondary" onclick="ZeiterfassungView.viewVobPdf(${m.id})" style="padding: 4px 8px; font-size: 11px;">📄 PDF</button>
                            <button class="btn-icon" onclick="ZeiterfassungView.deleteVobMeldung(${m.id})" title="Löschen">🗑️</button>
                        </td>
                    </tr>
                `;
            });
        }

        return `
            <div class="card" style="background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
                <table class="table" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569;">
                            <th style="padding: 12px;">Datum</th>
                            <th style="padding: 12px;">Meldungstyp</th>
                            <th style="padding: 12px;">Projekt</th>
                            <th style="padding: 12px;">Betreff</th>
                            <th style="padding: 12px;">Bauzeitverzug</th>
                            <th style="padding: 12px;">Status</th>
                            <th style="padding: 12px;">Aktionen</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    // Static Event Handlers
    static switchSubTab(subTab) {
        if (window.currentViewInstance) {
            window.currentViewInstance.activeSubTab = subTab;
            const container = document.getElementById('view-container');
            if (container) {
                window.currentViewInstance.render().then(html => container.innerHTML = html);
            }
        }
    }

    static async deleteZeiteintrag(uuid) {
        if (confirm('Möchten Sie diesen Zeiteintrag wirklich löschen?')) {
            await window.api.deleteZeiteintrag(uuid);
            ZeiterfassungView.switchSubTab('zeiten');
        }
    }

    static async deleteVobMeldung(id) {
        if (confirm('Möchten Sie diese VOB/B Meldung löschen?')) {
            await window.api.deleteVobMeldung(id);
            ZeiterfassungView.switchSubTab('vob');
        }
    }

    static async viewVobPdf(id) {
        const res = await window.api.generateVobPdf(id);
        if (res && res.html) {
            const win = window.open('', '_blank');
            win.document.write(res.html);
            win.document.close();
        }
    }

    static openNewZeiteintragModal() {
        alert('Bitte erfassen Sie Arbeitszeiten mobil über die PWA oder über die Schnellerfassung.');
    }

    static openNewVobModal() {
        alert('Bitte erfassen Sie VOB/B Meldungen mobil über die PWA oder über das Projektmenü.');
    }

    static openNewMitarbeiterModal() {
        const vorname = prompt('Vorname des Mitarbeiters:');
        const nachname = prompt('Nachname des Mitarbeiters:');
        if (vorname && nachname) {
            window.api.saveMitarbeiter({
                vorname,
                nachname,
                lohngruppe_id: 'LG4',
                tarif_stundensatz: 21.00,
                aktiv: 1
            }).then(() => {
                ZeiterfassungView.switchSubTab('mitarbeiter');
            });
        }
    }

    static async deleteMitarbeiter(id) {
        if (confirm('Mitarbeiter wirklich löschen?')) {
            await window.api.deleteMitarbeiter(id);
            ZeiterfassungView.switchSubTab('mitarbeiter');
        }
    }
}

if (typeof window !== 'undefined') {
    window.ZeiterfassungView = ZeiterfassungView;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZeiterfassungView;
}
