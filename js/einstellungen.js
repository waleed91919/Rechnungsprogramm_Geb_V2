// Settings Logic
function loadEinstellungenToForm() {
    document.getElementById('setting-firma').value = state.einstellungen.firmenname || '';
    document.getElementById('setting-adresse').value = state.einstellungen.adresse || '';
    document.getElementById('setting-bank').value = state.einstellungen.bankname || '';
    document.getElementById('setting-steuer').value = state.einstellungen.steuer || '';
    document.getElementById('setting-iban').value = state.einstellungen.iban || '';
    document.getElementById('setting-bic').value = state.einstellungen.bic || '';

    // Zahlungskonditionen
    document.getElementById('setting-zahlungsziel').value = state.einstellungen.zahlungsziel || '14';
    document.getElementById('setting-mahngebuehr-1').value = state.einstellungen.mahngebuehr1 || '0.00';
    document.getElementById('setting-mahngebuehr-2').value = state.einstellungen.mahngebuehr2 || '5.00';
    document.getElementById('setting-mahngebuehr-3').value = state.einstellungen.mahngebuehr3 || '10.00';

    // Allgemeine Einstellungen
    document.getElementById('setting-manuelle-nummern').checked = state.einstellungen.manuelleRechnungsnummer === 'true';
    if (document.getElementById('setting-rechnungsvorlage')) {
        document.getElementById('setting-rechnungsvorlage').value = state.einstellungen.rechnungsvorlage || 'klassisch';
    }
    if (document.getElementById('setting-eingabemodus')) {
        document.getElementById('setting-eingabemodus').value = state.einstellungen.eingabemodus || 'netto';
    }
    if (document.getElementById('setting-unternehmensart')) {
        document.getElementById('setting-unternehmensart').value = state.einstellungen.unternehmensart || 'handwerk';
    }

    // Auto-Backup Einstellungen
    if (document.getElementById('setting-backup-interval')) {
        document.getElementById('setting-backup-interval').value = state.einstellungen.backup_interval_hours || '4';
    }
    if (document.getElementById('setting-backup-auto-exit')) {
        document.getElementById('setting-backup-auto-exit').checked = state.einstellungen.backup_auto_on_exit !== 'false';
    }
    if (typeof loadBackupHistory === 'function') {
        loadBackupHistory();
    }

    if (document.getElementById('setting-email-text-rechnung')) {
        document.getElementById('setting-email-text-rechnung').value = state.einstellungen.email_text_rechnung || '';
        document.getElementById('setting-email-text-mahnung').value = state.einstellungen.email_text_mahnung || '';
        document.getElementById('setting-email-text-angebot').value = state.einstellungen.email_text_angebot || '';
        document.getElementById('setting-email-signatur').value = state.einstellungen.email_signatur || '';
        document.getElementById('setting-email-pdf-kopie').checked = state.einstellungen.email_pdf_kopie_speichern === 'true';
    }
    if (typeof renderSmtpKonten === 'function') {
        renderSmtpKonten();
    }

    const previewImg = document.getElementById('logo-preview-image');
    const btnRemove = document.getElementById('btn-remove-logo');
    if (state.einstellungen.logo) {
        previewImg.src = state.einstellungen.logo;
        previewImg.classList.remove('hidden');
        btnRemove.classList.remove('hidden');
    } else {
        previewImg.src = '';
        previewImg.classList.add('hidden');
        btnRemove.classList.add('hidden');
    }
}

async function saveEinstellungen() {
    state.einstellungen.firmenname = document.getElementById('setting-firma').value;
    state.einstellungen.adresse = document.getElementById('setting-adresse').value;
    state.einstellungen.bankname = document.getElementById('setting-bank').value;
    state.einstellungen.steuer = document.getElementById('setting-steuer').value;
    state.einstellungen.iban = document.getElementById('setting-iban').value;
    state.einstellungen.bic = document.getElementById('setting-bic').value;

    // Zahlungskonditionen
    state.einstellungen.zahlungsziel = document.getElementById('setting-zahlungsziel').value;
    state.einstellungen.mahngebuehr1 = document.getElementById('setting-mahngebuehr-1').value;
    state.einstellungen.mahngebuehr2 = document.getElementById('setting-mahngebuehr-2').value;
    state.einstellungen.mahngebuehr3 = document.getElementById('setting-mahngebuehr-3').value;

    // Allgemeine Einstellungen
    state.einstellungen.manuelleRechnungsnummer = document.getElementById('setting-manuelle-nummern').checked ? 'true' : 'false';
    if (document.getElementById('setting-rechnungsvorlage')) {
        state.einstellungen.rechnungsvorlage = document.getElementById('setting-rechnungsvorlage').value;
    }
    if (document.getElementById('setting-eingabemodus')) {
        state.einstellungen.eingabemodus = document.getElementById('setting-eingabemodus').value;
    }
    if (document.getElementById('setting-unternehmensart')) {
        state.einstellungen.unternehmensart = document.getElementById('setting-unternehmensart').value;
    }
    if (document.getElementById('setting-backup-interval')) {
        state.einstellungen.backup_interval_hours = document.getElementById('setting-backup-interval').value;
    }
    if (document.getElementById('setting-backup-auto-exit')) {
        state.einstellungen.backup_auto_on_exit = document.getElementById('setting-backup-auto-exit').checked ? 'true' : 'false';
    }
    if (document.getElementById('setting-email-text-rechnung')) {
        state.einstellungen.email_text_rechnung = document.getElementById('setting-email-text-rechnung').value;
        state.einstellungen.email_text_mahnung = document.getElementById('setting-email-text-mahnung').value;
        state.einstellungen.email_text_angebot = document.getElementById('setting-email-text-angebot').value;
        state.einstellungen.email_signatur = document.getElementById('setting-email-signatur').value;
        state.einstellungen.email_pdf_kopie_speichern = document.getElementById('setting-email-pdf-kopie').checked ? 'true' : 'false';
    }

    try {
        await window.api.saveEinstellung('firmenname', state.einstellungen.firmenname);
        await window.api.saveEinstellung('adresse', state.einstellungen.adresse);
        await window.api.saveEinstellung('bankname', state.einstellungen.bankname);
        await window.api.saveEinstellung('steuer', state.einstellungen.steuer);
        await window.api.saveEinstellung('iban', state.einstellungen.iban);
        await window.api.saveEinstellung('bic', state.einstellungen.bic);

        // Zahlungskonditionen speichern
        await window.api.saveEinstellung('zahlungsziel', state.einstellungen.zahlungsziel);
        await window.api.saveEinstellung('mahngebuehr1', state.einstellungen.mahngebuehr1);
        await window.api.saveEinstellung('mahngebuehr2', state.einstellungen.mahngebuehr2);
        await window.api.saveEinstellung('mahngebuehr3', state.einstellungen.mahngebuehr3);

        // Allgemeine Einstellungen speichern
        await window.api.saveEinstellung('manuelleRechnungsnummer', state.einstellungen.manuelleRechnungsnummer);
        if (state.einstellungen.rechnungsvorlage) {
            await window.api.saveEinstellung('rechnungsvorlage', state.einstellungen.rechnungsvorlage);
        }
        if (state.einstellungen.eingabemodus) {
            await window.api.saveEinstellung('eingabemodus', state.einstellungen.eingabemodus);
        }
        if (state.einstellungen.unternehmensart) {
            await window.api.saveEinstellung('unternehmensart', state.einstellungen.unternehmensart);
        }
        if (state.einstellungen.backup_interval_hours !== undefined) {
            await window.api.saveEinstellung('backup_interval_hours', state.einstellungen.backup_interval_hours);
        }
        if (state.einstellungen.backup_auto_on_exit !== undefined) {
            await window.api.saveEinstellung('backup_auto_on_exit', state.einstellungen.backup_auto_on_exit);
        }
        if (state.einstellungen.rechnungsvorlage) {
            await window.api.saveEinstellung('rechnungsvorlage', state.einstellungen.rechnungsvorlage);
        }
        if (state.einstellungen.eingabemodus) {
            await window.api.saveEinstellung('eingabemodus', state.einstellungen.eingabemodus);
        }
        if (state.einstellungen.unternehmensart) {
            await window.api.saveEinstellung('unternehmensart', state.einstellungen.unternehmensart);
        }
        if (document.getElementById('setting-email-text-rechnung')) {
            await window.api.saveEinstellung('email_text_rechnung', state.einstellungen.email_text_rechnung);
            await window.api.saveEinstellung('email_text_mahnung', state.einstellungen.email_text_mahnung);
            await window.api.saveEinstellung('email_text_angebot', state.einstellungen.email_text_angebot);
            await window.api.saveEinstellung('email_signatur', state.einstellungen.email_signatur);
            await window.api.saveEinstellung('email_pdf_kopie_speichern', state.einstellungen.email_pdf_kopie_speichern);
        }
        if (state.einstellungen.logo) {
            await window.api.saveEinstellung('logo', state.einstellungen.logo);
        } else {
            await window.api.saveEinstellung('logo', '');
        }

        if (typeof applyUnternehmensartVisibility === 'function') {
            applyUnternehmensartVisibility();
        }

        showToast('Einstellungen erfolgreich gespeichert!', 'success');
    } catch (e) {
        console.error('Error saving settings:', e);
        showToast('Fehler beim Speichern der Einstellungen.', 'error');
    }
}

function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const base64Str = e.target.result;
        state.einstellungen.logo = base64Str;

        const previewImg = document.getElementById('logo-preview-image');
        previewImg.src = base64Str;
        previewImg.classList.remove('hidden');
        document.getElementById('btn-remove-logo').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function removeLogo() {
    state.einstellungen.logo = '';
    document.getElementById('logo-upload').value = '';
    document.getElementById('logo-preview-image').classList.add('hidden');
    document.getElementById('btn-remove-logo').classList.add('hidden');
}

async function createDatabaseBackup() {
    try {
        if (window.api && window.api.createBackup) {
            const result = await window.api.createBackup('MANUAL', 'Manuelle Sicherung durch Benutzer');
            if (result && result.success) {
                showToast(`GoBD-Backup erfolgreich erstellt: ${result.fileName} (${(result.fileSize / 1024).toFixed(1)} KB)`, 'success');
                loadBackupHistory();
                return;
            }
        }
        // Fallback to dialog backup
        await exportManualBackup();
    } catch (e) {
        console.error('Backup error:', e);
        showToast('Fehler beim Erstellen des Backups: ' + e.message, 'error');
    }
}

async function exportManualBackup() {
    try {
        if (window.api && window.api.backupDatabase) {
            const result = await window.api.backupDatabase();
            if (result.success) {
                showToast(`Backup-Export erfolgreich: ${result.path}`, 'success');
                loadBackupHistory();
            } else if (!result.cancelled) {
                showToast('Fehler beim Exportieren des Backups.', 'error');
            }
        }
    } catch (e) {
        console.error('Export error:', e);
        showToast('Fehler beim Exportieren: ' + e.message, 'error');
    }
}

async function loadBackupHistory() {
    const tbody = document.getElementById('backup-history-body');
    const emptyEl = document.getElementById('backup-history-empty');
    if (!tbody) return;

    try {
        let history = [];
        if (window.api && window.api.getBackupHistory) {
            history = await window.api.getBackupHistory();
        }

        if (!history || history.length === 0) {
            tbody.innerHTML = '';
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }

        if (emptyEl) emptyEl.classList.add('hidden');
        tbody.innerHTML = '';

        history.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors';

            const d = new Date(item.erstellt_am);
            const dateStr = isNaN(d.getTime()) ? item.erstellt_am : d.toLocaleString('de-DE');

            const gfsBadge = item.gfs_generation === 'G' ? '<span class="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-bold text-[10px]">Großvater (Monat)</span>' :
                             item.gfs_generation === 'F' ? '<span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold text-[10px]">Vater (Woche)</span>' :
                             item.gfs_generation === 'S' ? '<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">Sohn (Tag)</span>' :
                             '<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium text-[10px]">Standard</span>';

            const triggerBadge = item.trigger_typ === 'AUTO_INTERVAL' ? '<span class="text-blue-600 font-semibold">Auto (Intervall)</span>' :
                                 item.trigger_typ === 'AUTO_SHUTDOWN' ? '<span class="text-amber-600 font-semibold">Auto (Beenden)</span>' :
                                 item.trigger_typ === 'RESTORE_ROLLBACK' ? '<span class="text-rose-600 font-semibold">Rollback-Sicherung</span>' :
                                 '<span class="text-slate-700 font-semibold">Manuell</span>';

            const sizeGz = item.file_size_bytes ? (item.file_size_bytes / 1024).toFixed(1) + ' KB' : '-';
            const sizeRaw = item.uncompressed_size_bytes ? (item.uncompressed_size_bytes / 1024).toFixed(1) + ' KB' : '-';
            const hashShort = item.sha256_hash ? item.sha256_hash.substring(0, 10) + '...' : '-';

            tr.innerHTML = `
                <td class="px-3 py-2 font-mono text-xs font-semibold text-slate-800">${item.dateiname || 'backup.sqlite.gz'}</td>
                <td class="px-3 py-2 text-slate-600 text-xs">${dateStr}</td>
                <td class="px-3 py-2 text-xs">${triggerBadge}</td>
                <td class="px-3 py-2 text-xs">${gfsBadge}</td>
                <td class="px-3 py-2 text-right font-mono text-xs">${sizeGz} <span class="text-slate-400">(${sizeRaw})</span></td>
                <td class="px-3 py-2 font-mono text-[11px] text-slate-500" title="${item.sha256_hash || ''}">${hashShort}</td>
                <td class="px-3 py-2 text-right space-x-1.5">
                    <button type="button" onclick="verifyBackupItem(${item.id})" class="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition-colors" title="Integrität und SHA-256 Checksumme prüfen">
                        Prüfen
                    </button>
                    <button type="button" onclick="restoreBackupItem(${item.id})" class="px-2.5 py-1 text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded shadow-xs transition-colors" title="Datenbank aus diesem Backup wiederherstellen">
                        Wiederherstellen
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Fehler beim Laden der Backup-Historie:', err);
    }
}

async function verifyBackupItem(backupId) {
    try {
        if (!window.api || !window.api.verifyBackup) return;
        const res = await window.api.verifyBackup(backupId);
        if (res.valid) {
            showToast(`✓ Integritätsprüfung erfolgreich! SHA-256 Hash stimmt überein (${(res.fileSize / 1024).toFixed(1)} KB).`, 'success');
        } else {
            showToast(`⚠ Integritätsprüfung fehlgeschlagen: ${res.reason || 'Ungültige Checksumme'}`, 'error');
        }
    } catch (e) {
        console.error('Verify error:', e);
        showToast('Fehler bei der Integritätsprüfung: ' + e.message, 'error');
    }
}

async function restoreBackupItem(backupId) {
    if (!confirm('Möchten Sie die Datenbank wirklich aus diesem Backup wiederherstellen? Vor dem Wiederherstellen wird automatisch ein Sicherheits-Snapshot erstellt.')) {
        return;
    }
    try {
        if (!window.api || !window.api.restoreBackup) return;
        const res = await window.api.restoreBackup(backupId, 'Wiederherstellung aus Backup-Historie');
        if (res.success) {
            showToast('✓ Datenbank erfolgreich wiederhergestellt! Das System wird aktualisiert...', 'success');
            setTimeout(() => {
                if (window.location && window.location.reload) window.location.reload();
            }, 1000);
        } else {
            showToast('Fehler bei der Wiederherstellung: ' + (res.error || 'Unbekannt'), 'error');
        }
    } catch (e) {
        console.error('Restore error:', e);
        showToast('Fehler bei der Wiederherstellung: ' + e.message, 'error');
    }
}

// Restore Logic
function openRestoreModal() {
    const modal = document.getElementById('restore-modal');
    const input = document.getElementById('restore-confirm-input');
    const btn = document.getElementById('restore-confirm-btn');
    if (modal && input && btn) {
        input.value = '';
        btn.disabled = true;
        modal.classList.remove('hidden');
        input.focus();
    }
}

function closeRestoreModal() {
    const modal = document.getElementById('restore-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function handleRestoreBackup() {
    const input = document.getElementById('restore-confirm-input');
    if (input.value !== 'BESTÄTIGEN') {
        showToast('Bitte geben Sie BESTÄTIGEN ein.', 'error');
        return;
    }

    try {
        closeRestoreModal();
        const result = await window.api.restoreDatabase();
        if (result.success) {
            // App will relaunch, but just in case show something
            showToast('Datenbank erfolgreich wiederhergestellt. System wird neu gestartet...', 'success');
        } else if (!result.cancelled) {
            showToast('Fehler bei der Wiederherstellung.', 'error');
        }
    } catch (e) {
        console.error('Restore error:', e);
        showToast('Fehler bei der Wiederherstellung.', 'error');
    }
}

// Global initialization for restore modal input
document.addEventListener('DOMContentLoaded', () => {
    const confirmInput = document.getElementById('restore-confirm-input');
    const confirmBtn = document.getElementById('restore-confirm-btn');
    if (confirmInput && confirmBtn) {
        confirmInput.addEventListener('input', (e) => {
            confirmBtn.disabled = e.target.value !== 'BESTÄTIGEN';
        });
    }
});

// // --- Hilfsfunktionen für DIN 5008 konforme Formatierung ---
function formatGermanDate(d) {
    if (!d) return '';
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

function formatIban(iban) {
    if (!iban) return '';
    return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

// PDF Generation
// Baut die vollständige Sichtseiten-HTML (alle Vorlagen) aus einem explizit übergebenen
// Dokumentobjekt. Bewusst von window.generatePdf entkoppelt, damit der ZUGFeRD-Export
// Sichtseite und CII-XML aus DEMSELBEN doc-Objekt erzeugen kann.
async function buildInvoiceDocumentHtml(rech, kunde, isAngebot = false) {
    const logoHtml = state.einstellungen.logo ? `<img src="${state.einstellungen.logo}" class="max-h-14 max-w-[220px] object-contain" alt="Firmenlogo">` : '';
    const datumStr = formatGermanDate(rech.datum);
    const faelligStr = formatGermanDate(rech.faellig);

    let leistungsdatumStr = datumStr;
    if (rech.leistungszeitraum_von && rech.leistungszeitraum_bis) {
        leistungsdatumStr = `${formatGermanDate(rech.leistungszeitraum_von)} – ${formatGermanDate(rech.leistungszeitraum_bis)}`;
    } else if (rech.leistungsdatum) {
        leistungsdatumStr = formatGermanDate(rech.leistungsdatum);
    }

    const kundenNr = (kunde && kunde.kundennummer) || (kunde && kunde.id ? `KD-${String(kunde.id).padStart(5, '0')}` : '-');

    let projektName = '';
    if (rech.projekt_name) {
        projektName = rech.projekt_name;
    } else if (rech.projekt_id && state.projekte) {
        const p = state.projekte.find(prj => prj.id == rech.projekt_id);
        if (p) projektName = p.name;
    }

    const empfaengerName = sanitize((kunde && kunde.name) || 'Sehr geehrte Damen und Herren');
    const empfaengerAdresse = sanitize((kunde && kunde.adresse) || '').replace(/[\r\n]+/g, '<br>');
    const empfaengerPlzOrt = `${sanitize((kunde && kunde.plz) || '')} ${sanitize((kunde && kunde.ort) || '')}`.trim();

    let itemsHtml = '';
    rech.positionen.forEach((pos, i) => {
        const artId = parseInt(pos.artikelId);
        const art = state.artikel.find(a => parseInt(a.id) === artId) || {};
        const rabatt = parseFloat(pos.rabatt) || 0;
        const gesamt = (pos.menge * pos.preis) * (1 - rabatt / 100);

        const isPos13b = (rech.unterliegt_13b && pos.is13b) || pos.is13b;
        const descText = pos.beschreibung || pos.text || art.beschreibung || '';

        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 text-xs avoid-break pdf-no-break';
        tr.style.pageBreakInside = 'avoid';
        tr.style.breakInside = 'avoid';

        const tdIdx = document.createElement('td');
        tdIdx.className = 'py-2 pl-2 text-center text-slate-400 font-mono text-[11px]';
        tdIdx.textContent = i + 1;
        tr.appendChild(tdIdx);

        const tdName = document.createElement('td');
        tdName.className = 'py-2 px-2';
        const nameDiv = document.createElement('div');
        nameDiv.className = 'font-semibold text-slate-900';
        nameDiv.textContent = pos.name || art.name || 'Position';
        tdName.appendChild(nameDiv);
        if (descText) {
            const descDiv = document.createElement('div');
            descDiv.className = 'text-[11px] text-slate-500 leading-snug mt-0.5 whitespace-pre-line';
            descDiv.textContent = descText;
            tdName.appendChild(descDiv);
        }
        tr.appendChild(tdName);

        const tdMenge = document.createElement('td');
        tdMenge.className = 'py-2 px-2 text-center tabular-nums text-slate-700';
        tdMenge.textContent = `${pos.menge} ${pos.einheit || 'Stk.'}`;
        tr.appendChild(tdMenge);

        const tdPreis = document.createElement('td');
        tdPreis.className = 'py-2 px-2 text-right tabular-nums text-slate-700';
        tdPreis.textContent = formatCurrency(pos.preis);
        tr.appendChild(tdPreis);

        const tdMwst = document.createElement('td');
        tdMwst.className = 'py-2 px-2 text-right tabular-nums text-slate-500';
        tdMwst.textContent = isPos13b ? '0%' : `${pos.mwst}%`;
        tr.appendChild(tdMwst);

        const tdRabatt = document.createElement('td');
        tdRabatt.className = 'py-2 px-2 text-right tabular-nums ' + (rabatt > 0 ? 'text-emerald-600 font-medium' : 'text-slate-300');
        tdRabatt.textContent = rabatt > 0 ? `-${rabatt}%` : '-';
        tr.appendChild(tdRabatt);

        const tdGesamt = document.createElement('td');
        tdGesamt.className = 'py-2 pr-2 text-right tabular-nums font-semibold text-slate-900';
        tdGesamt.textContent = formatCurrency(gesamt);
        tr.appendChild(tdGesamt);

        itemsHtml += tr.outerHTML;
    });

    let taxes = {
        '13b_netto': 0,
        'normal_netto': 0
    };
    let positionenNetto = 0;
    let positionenBrutto = 0;
    const mode = rech.eingabemodus || 'netto';
    const einzelpreisLabel = mode === 'netto' ? 'Einzelpreis (Netto)' : 'Einzelpreis (Brutto)';
    const gesamtLabel = mode === 'netto' ? 'Gesamt (Netto)' : 'Gesamt (Brutto)';

    rech.positionen.forEach(pos => {
        const rabatt = parseFloat(pos.rabatt) || 0;
        let rowNetto = 0;
        let rowBrutto = 0;
        let tax = 0;

        const isPos13b = rech.unterliegt_13b && pos.is13b;

        if (mode === 'netto') {
            rowNetto = (pos.menge * pos.preis) * (1 - rabatt / 100);
            tax = isPos13b ? 0 : (rowNetto * (pos.mwst / 100));
            rowBrutto = rowNetto + tax;
        } else {
            rowBrutto = (pos.menge * pos.preis) * (1 - rabatt / 100);
            if (isPos13b) {
                rowNetto = rowBrutto;
                tax = 0;
            } else {
                rowNetto = rowBrutto / (1 + pos.mwst / 100);
                tax = rowBrutto - rowNetto;
            }
        }

        positionenNetto += rowNetto;
        positionenBrutto += rowBrutto;
        
        if (isPos13b) {
            taxes['13b_netto'] += rowNetto;
        } else {
            taxes['normal_netto'] += rowNetto;
            if (pos.mwst > 0) {
                if (!taxes[pos.mwst]) taxes[pos.mwst] = 0;
                taxes[pos.mwst] += tax;
            }
        }
    });

    const globalRabattAbzug = parseFloat(rech.globalRabattAbzug) || 0;
    const baseForRabatt = mode === 'netto' ? positionenNetto : positionenBrutto;
    const rabattFaktor = baseForRabatt > 0 ? ((baseForRabatt - globalRabattAbzug) / baseForRabatt) : 1;

    const leistungsstandNetto = rech.kumulierte_leistung_netto || ((mode === 'netto' ? positionenNetto : positionenBrutto - Object.keys(taxes).filter(k => k !== '13b_netto' && k !== 'normal_netto').map(k => taxes[k]).reduce((a,b)=>a+b,0)) - globalRabattAbzug);
    
    const steuerpflichtigesNetto = rech.netto;
    const taxableRatio = leistungsstandNetto > 0 ? (steuerpflichtigesNetto / leistungsstandNetto) : (steuerpflichtigesNetto === 0 ? 0 : 1);

    let taxHtml = '';
    
    if (rech.unterliegt_13b && taxes['13b_netto'] > 0 && taxes['normal_netto'] > 0) {
        const netto13b = taxes['13b_netto'] * rabattFaktor * taxableRatio;
        const nettoNormal = taxes['normal_netto'] * rabattFaktor * taxableRatio;
        
        taxHtml += `
            <div class="flex justify-between text-xs text-slate-500 py-0.5">
                <span>Netto (regulär):</span>
                <span class="tabular-nums font-mono">${formatCurrency(nettoNormal)}</span>
            </div>
            <div class="flex justify-between text-xs text-slate-500 py-0.5">
                <span>Netto (§ 13b steuerfrei):</span>
                <span class="tabular-nums font-mono">${formatCurrency(netto13b)}</span>
            </div>
        `;
    }

    Object.keys(taxes).forEach(rate => {
        if (rate === '13b_netto' || rate === 'normal_netto') return;
        const baseTax = taxes[rate] * rabattFaktor;
        const taxVal = baseTax * taxableRatio;
        if (taxVal > 0.005) {
            const adjustedLabel = taxableRatio < 0.999 ? ' (angepasst)' : '';
            const taxLbl = mode === 'netto' ? `zzgl. ${rate}% MwSt${adjustedLabel}:` : `inkl. ${rate}% MwSt${adjustedLabel}:`;
            taxHtml += `
                <div class="flex justify-between text-xs text-slate-600 py-0.5">
                    <span>${taxLbl}</span>
                    <span class="tabular-nums font-mono">${formatCurrency(taxVal)}</span>
                </div>
            `;
        }
    });

    const hatKumulationOderSicherheit = (rech.sicherheitseinbehalt > 0) || (rech.verrechnungen && rech.verrechnungen.length > 0);
    let deductionsHtml = '';
    
    if (hatKumulationOderSicherheit) {
        deductionsHtml += `
            <div class="flex justify-between text-xs text-slate-700 font-medium py-0.5">
                <span>Leistungsstand (Netto):</span>
                <span class="tabular-nums font-mono">${formatCurrency(leistungsstandNetto)}</span>
            </div>
        `;

        if (rech.sicherheitseinbehalt > 0) {
            const sichPct = (rech.sicherheitseinbehalt_prozent !== undefined && rech.sicherheitseinbehalt_prozent !== null && rech.sicherheitseinbehalt_prozent !== 0)
                ? rech.sicherheitseinbehalt_prozent
                : (leistungsstandNetto > 0 ? (Math.round((rech.sicherheitseinbehalt / leistungsstandNetto) * 1000) / 10) : null);
            const sichLabel = `Abzug Sicherheitseinbehalt${sichPct ? ` (${sichPct}%)` : ''}:`;
            deductionsHtml += `
                <div class="flex justify-between text-xs text-amber-600 py-0.5">
                    <span>${sichLabel}</span>
                    <span class="tabular-nums font-mono">-${formatCurrency(rech.sicherheitseinbehalt)}</span>
                </div>
            `;
        }

        if (rech.verrechnungen && rech.verrechnungen.length > 0) {
            rech.verrechnungen.forEach(v => {
                const vRech = state.rechnungen.find(r => r.id === v.vorherige_rechnung_id);
                const infoStr = vRech ? `Abzug Rech. ${vRech.nr}:` : 'Abzug Abschlagsrech.:';
                deductionsHtml += `
                    <div class="flex justify-between text-xs text-indigo-600 py-0.5">
                        <span>${infoStr}</span>
                        <span class="tabular-nums font-mono">-${formatCurrency(v.abzugsbetrag_netto)}</span>
                    </div>
                `;
            });
        }
        
        deductionsHtml += `<div class="border-b border-slate-200 my-1"></div>`;
    }

    const zahlbetragNumerical = rech.zahlbetrag || rech.brutto;

    let totalsHtml = `
        ${rech.globalRabattAbzug > 0 ? `
            <div class="flex justify-between text-slate-500 py-0.5">
                <span>Zwischensumme:</span>
                <span class="tabular-nums font-mono">${formatCurrency(rech.netto + rech.globalRabattAbzug)}</span>
            </div>
            <div class="flex justify-between text-emerald-600 py-0.5 pb-1 border-b border-slate-200">
                <span>Gesamtrabatt:</span>
                <span class="tabular-nums font-mono">-${formatCurrency(rech.globalRabattAbzug)}</span>
            </div>
        ` : ''}

        ${deductionsHtml}

        <div class="flex justify-between font-medium text-slate-700 py-0.5">
            <span>${hatKumulationOderSicherheit ? 'Steuerpflichtig (Netto):' : 'Nettobetrag:'}</span>
            <span class="tabular-nums font-mono">${formatCurrency(rech.netto)}</span>
        </div>

        ${taxHtml}

        <div class="flex justify-between font-bold text-slate-900 pt-1 mt-1 border-t border-slate-200">
            <span>Gesamtbetrag (Brutto):</span>
            <span class="tabular-nums font-mono">${formatCurrency(rech.brutto)}</span>
        </div>

        ${rech.anzahlung > 0 ? `
            <div class="flex justify-between text-slate-600 pt-1">
                <span>Abzüglich Anzahlung:</span>
                <span class="tabular-nums font-mono text-emerald-700">-${formatCurrency(rech.anzahlung)}</span>
            </div>
        ` : ''}
    `;

    // --- Custom Texts & Legal Information ---
    let vortextHtml = rech.vortext ? `<div class="mb-3 whitespace-pre-wrap text-xs text-slate-700 leading-relaxed">${sanitize(rech.vortext)}</div>` : '';
    let fusstextHtml = rech.fusstext ? `<div class="mt-3 whitespace-pre-wrap text-xs text-slate-700 leading-relaxed">${sanitize(rech.fusstext)}</div>` : '';
    
    let legalTextsHtml = '<div class="space-y-1 text-[10px] text-slate-500 leading-relaxed">';
    
    if (rech.leistungszeitraum_von && rech.leistungszeitraum_bis) {
        legalTextsHtml += `<p><strong>Leistungszeitraum:</strong> ${formatGermanDate(rech.leistungszeitraum_von)} bis ${formatGermanDate(rech.leistungszeitraum_bis)}.</p>`;
    } else {
        legalTextsHtml += `<p class="italic">Das Liefer- und Leistungsdatum entspricht, sofern nicht anders angegeben, dem Rechnungsdatum.</p>`;
    }
    
    const isReverseCharge = rech.unterliegt_13b || (Object.keys(taxes).length === 0 && positionenNetto > 0 && kunde.ist_bauleistender_13b);
    if (isReverseCharge) {
        legalTextsHtml += `<p><strong>Steuerschuldnerschaft des Leistungsempfängers:</strong> Leistungen unterliegen gemäß § 13b UStG dem Reverse-Charge-Verfahren. Die Steuerschuldnerschaft geht auf den Leistungsempfänger über.</p>`;
    }
    
    if (rech.unterliegt_bauabzugsteuer) {
        if (kunde.hat_freistellungsbescheinigung) {
            legalTextsHtml += `<p>Eine gültige Freistellungsbescheinigung nach § 48b EStG liegt vor. Ein Einbehalt der Bauabzugsteuer durch den Leistungsempfänger ist nicht vorzunehmen.</p>`;
        } else {
            legalTextsHtml += `<p><strong>Bauabzugsteuer:</strong> Gemäß § 48 EStG unterliegt diese Rechnung der Bauabzugsteuer. Bitte behalten Sie 15% ein und führen Sie diesen an das Finanzamt ab.</p>`;
        }
    }
    
    if (rech.vob_vereinbart) {
        legalTextsHtml += `<p>Gemäß § 16 Abs. 1 VOB/B ist diese Zahlung innerhalb von 21 Tagen nach Zugang dieser prüfbaren Aufstellung fällig.</p>`;
    }
    
    if (rech.ist_privatkunde || rech.customer_type === 'B2C' || (kunde && kunde.customer_type === 'B2C')) {
        legalTextsHtml += `<p><strong>Hinweis gem. § 14b Abs. 1 Satz 5 UStG:</strong> Als Privatperson sind Sie gesetzlich verpflichtet, diese Rechnung sowie den zugehörigen Zahlungsbeleg für steuerliche Zwecke mindestens zwei Jahre lang aufzubewahren.</p>`;
    }
    
    if (rech.ausweis_35a_erforderlich && rech.summe_lohnkosten_brutto > 0) {
        const lohnNetto = rech.summe_lohnkosten_brutto / 1.19; 
        const lohnSteuer = rech.summe_lohnkosten_brutto - lohnNetto;
        legalTextsHtml += `<p><strong>Hinweis zur Steuerermäßigung nach § 35a EStG:</strong> In dem oben ausgewiesenen Rechnungsbetrag sind steuerbegünstigte Arbeits-, Fahrt- und Maschinenkosten in Höhe von ${formatCurrency(lohnNetto)} (netto) zzgl. ${formatCurrency(lohnSteuer)} Umsatzsteuer, somit insgesamt ${formatCurrency(rech.summe_lohnkosten_brutto)} (brutto) enthalten.</p>`;
    }
    
    legalTextsHtml += '</div>';

    // Generate GiroCode (EPC-QR) for Invoices
    let qrHtml = '';
    if (!isAngebot && state.einstellungen.iban && state.einstellungen.firmenname && zahlbetragNumerical > 0) {
        const bic = state.einstellungen.bic ? state.einstellungen.bic.trim() : '';
        const name = state.einstellungen.firmenname.substring(0, 70).trim();
        const iban = state.einstellungen.iban.replace(/\s+/g, '').trim();
        let amountStr = zahlbetragNumerical.toFixed(2);
        if (amountStr.endsWith('.00')) {
            amountStr = parseInt(zahlbetragNumerical, 10).toString();
        }

        const refStr = `Rechnung ${rech.nr}`.substring(0, 35).replace(/[^a-zA-Z0-9.\- ]/g, '');

        const epcLines = [
            "BCD", "002", "1", "SCT", bic, name, iban, `EUR${amountStr}`, "", "", refStr, ""
        ];
        const epcString = epcLines.join('\n');

        const qrDataUrl = await window.api.generateQrCode(epcString);
        if (qrDataUrl) {
            qrHtml = `
                <div class="flex items-center gap-3.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200/80 w-full">
                    <img src="${qrDataUrl}" class="w-28 h-28 rounded bg-white p-1 border border-slate-200 shrink-0" style="width: 28mm; height: 28mm;" alt="GiroCode">
                    <div class="text-xs text-slate-600 flex-1 leading-snug">
                        <p class="font-bold text-slate-800 mb-1 flex items-center gap-1.5 text-xs">
                            <span class="material-symbols-outlined text-[15px] text-primary">qr_code_scanner</span>
                            GiroCode / QR-Rechnung
                        </p>
                        <p class="text-[11px] text-slate-600 leading-snug mb-1">
                            Mit Banking-App scannen, um Betrag &amp; Überweisungsdaten automatisch und fehlerfrei zu übernehmen.
                        </p>
                        <p class="text-[10px] text-slate-400">
                            Empfänger, IBAN &amp; Rechnungsnummer werden direkt ausgefüllt.
                        </p>
                    </div>
                </div>
            `;
        }
    }

    const absenderInline = state.einstellungen.adresse ?
        (sanitize(state.einstellungen.firmenname) + " • " + sanitize(state.einstellungen.adresse).replace(/[\r\n]+/g, ' • ')) :
        sanitize(state.einstellungen.firmenname);

    const formattedIban = formatIban(state.einstellungen.iban);
    const vorlage = state.einstellungen.rechnungsvorlage || 'klassisch';
    
    let templateHtml = '';

    if (vorlage === 'modern') {
        templateHtml = `
            <div id="invoice-paper" class="invoice-paper max-w-4xl mx-auto bg-white text-slate-800 font-sans flex flex-col justify-between relative" style="min-height: calc(297mm - 24mm);">
                <div class="flex-1 flex flex-col">
                    <!-- Accent bar -->
                    <div class="h-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full mb-4"></div>

                    <!-- Briefkopf: Logo links, Firmendaten rechts -->
                    <div class="flex justify-between items-start pb-3 border-b border-slate-100 mb-5">
                        <div class="max-w-[45%]">
                            ${logoHtml ? logoHtml : `<h1 class="text-xl font-extrabold tracking-tight text-blue-600">${sanitize(state.einstellungen.firmenname)}</h1>`}
                        </div>
                        <div class="text-right text-xs text-slate-600 space-y-0.5 leading-tight">
                            <p class="font-bold text-slate-900 text-sm">${sanitize(state.einstellungen.firmenname)}</p>
                            ${state.einstellungen.adresse ? `<p>${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                        </div>
                    </div>

                    <!-- Anschriftenfeld & Infoblock (DIN 5008) -->
                    <div class="flex justify-between items-start mb-5 gap-6">
                        <!-- Anschrift Empfänger -->
                        <div class="w-1/2 pt-1">
                            <p class="text-[9px] text-blue-600 font-semibold tracking-wider uppercase border-b border-blue-100 pb-1 mb-2">${absenderInline}</p>
                            <div class="text-slate-800 leading-snug text-xs">
                                <p class="font-bold text-sm text-slate-900 mb-1">${empfaengerName}</p>
                                ${empfaengerAdresse ? `<p class="text-slate-700">${empfaengerAdresse}</p>` : ''}
                                ${empfaengerPlzOrt ? `<p class="text-slate-700 font-medium">${empfaengerPlzOrt}</p>` : ''}
                            </div>
                        </div>

                        <!-- Infoblock -->
                        <div class="w-64 bg-slate-50 p-3 rounded-xl border border-slate-200/80 border-l-4 border-l-blue-600 text-xs text-slate-600 space-y-1.5 shadow-sm">
                            <div class="flex justify-between border-b border-slate-200/60 pb-1">
                                <span class="text-slate-500 font-medium">${isAngebot ? 'Angebots-Nr.:' : 'Rechnungs-Nr.:'}</span>
                                <span class="font-bold text-blue-600 font-mono">${sanitize(rech.nr)}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-200/60 pb-1">
                                <span class="text-slate-500">Rechnungsdatum:</span>
                                <span class="font-medium text-slate-800">${datumStr}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-200/60 pb-1">
                                <span class="text-slate-500">Leistungsdatum:</span>
                                <span class="font-medium text-slate-800">${leistungsdatumStr}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-200/60 pb-1">
                                <span class="text-slate-500">Kundennummer:</span>
                                <span class="font-medium text-slate-800 font-mono">${kundenNr}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-200/60 pb-1">
                                <span class="text-slate-500">${isAngebot ? 'Gültig bis:' : 'Fällig am:'}</span>
                                <span class="font-bold text-slate-900">${faelligStr}</span>
                            </div>
                            ${kunde.ustId ? `
                            <div class="flex justify-between border-b border-slate-200/60 pb-1">
                                <span class="text-slate-500">Ihre USt-IdNr.:</span>
                                <span class="font-medium text-slate-800 font-mono">${sanitize(kunde.ustId)}</span>
                            </div>` : ''}
                            ${projektName ? `
                            <div class="flex justify-between pt-0.5">
                                <span class="text-slate-500">Projekt:</span>
                                <span class="font-medium text-slate-800 truncate max-w-[120px]" title="${sanitize(projektName)}">${sanitize(projektName)}</span>
                            </div>` : ''}
                        </div>
                    </div>

                    <!-- Titel & Betreffzeile -->
                    <div class="mb-3 flex items-center justify-between">
                        <div>
                            <h2 class="text-xl font-bold text-slate-900 tracking-tight">
                                ${isAngebot ? 'Angebot' : 'Rechnung'} <span class="text-blue-600 font-medium">#${sanitize(rech.nr)}</span>
                            </h2>
                            ${projektName ? `<p class="text-xs text-slate-600 mt-0.5 font-medium">Bauvorhaben / Projekt: ${sanitize(projektName)}</p>` : ''}
                        </div>
                        <span class="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            ${isAngebot ? 'Angebot' : 'Rechnung'}
                        </span>
                    </div>

                    ${vortextHtml ? `<div class="mb-3 text-xs text-slate-700 leading-relaxed">${vortextHtml}</div>` : ''}

                    <!-- Positionstabelle -->
                    <div class="overflow-hidden rounded-lg border border-slate-200 mb-4 shadow-sm">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                                    <th class="py-2.5 pl-2 text-center w-8">Pos.</th>
                                    <th class="py-2.5 px-2">Bezeichnung</th>
                                    <th class="py-2.5 px-2 text-center w-20">Menge</th>
                                    <th class="py-2.5 px-2 text-right w-24">${einzelpreisLabel}</th>
                                    <th class="py-2.5 px-2 text-right w-16">MwSt</th>
                                    <th class="py-2.5 px-2 text-right w-16">Rabatt</th>
                                    <th class="py-2.5 pr-2 text-right w-24">${gesamtLabel}</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 text-slate-700">
                                ${itemsHtml}
                            </tbody>
                        </table>
                    </div>

                    <!-- Flex Spacer: Füllt den Leerraum dynamisch aus und schiebt den Abschlussblock nach unten -->
                    <div class="flex-1 min-h-[16px]"></div>

                    <!-- Abschlussbereich: Zahlungsbedingungen, Hinweise & Summenblock -->
                    <div class="mt-auto">
                        <div class="flex justify-between items-start gap-6 mb-4 avoid-break pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">
                            <div class="flex-1 space-y-2.5">
                                <div class="text-xs text-slate-600 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100 leading-relaxed">
                                    <p class="font-semibold text-blue-900 mb-0.5">Zahlungsbedingungen:</p>
                                    <p>Bitte überweisen Sie den Betrag bis zum <strong class="text-slate-900">${faelligStr}</strong> auf das unten angegebene Bankkonto unter Angabe der Rechnungsnummer <strong class="text-slate-900 font-mono">${sanitize(rech.nr)}</strong>.</p>
                                </div>

                                ${legalTextsHtml}

                                ${qrHtml}
                            </div>

                            <!-- Rechts: Summenblock -->
                            <div class="w-72 flex-shrink-0 bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 shadow-sm text-xs">
                                ${totalsHtml}
                                <div class="mt-2.5 p-2.5 bg-blue-600 text-white rounded-lg flex justify-between items-baseline shadow-sm">
                                    <span class="font-bold text-xs uppercase tracking-wider text-blue-100">Zahlbetrag</span>
                                    <span class="font-black text-lg font-mono">${formatCurrency(zahlbetragNumerical)}</span>
                                </div>
                            </div>
                        </div>

                        ${fusstextHtml ? `<div class="mb-3 text-xs text-slate-700 leading-relaxed pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">${fusstextHtml}</div>` : ''}
                    </div>
                </div>

                <!-- Fußzeile -->
                <div class="pt-3 border-t border-slate-200 text-[10px] text-slate-500 grid grid-cols-3 gap-6 leading-snug pdf-footer avoid-break mt-auto" style="break-inside: avoid; page-break-inside: avoid;">
                    <div>
                        <p class="font-bold text-blue-700 uppercase tracking-wider text-[9px] mb-0.5">Unternehmen</p>
                        <p class="font-medium text-slate-800">${sanitize(state.einstellungen.firmenname)}</p>
                        ${state.einstellungen.adresse ? `<p class="text-slate-600 mt-0.5">${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                    </div>
                    <div>
                        <p class="font-bold text-blue-700 uppercase tracking-wider text-[9px] mb-0.5">Bankverbindung</p>
                        <p class="font-medium text-slate-800">${sanitize(state.einstellungen.bankname)}</p>
                        <p class="font-mono text-slate-700">IBAN: ${formattedIban}</p>
                        <p class="font-mono text-slate-700">BIC: ${sanitize(state.einstellungen.bic)}</p>
                    </div>
                    <div>
                        <p class="font-bold text-blue-700 uppercase tracking-wider text-[9px] mb-0.5">Rechtliches & Steuer</p>
                        <p>Steuernummer / USt-IdNr.:</p>
                        <p class="font-medium text-slate-800 font-mono">${sanitize(state.einstellungen.steuer)}</p>
                    </div>
                </div>
            </div>
        `;
    } else if (vorlage === 'minimalistisch') {
        templateHtml = `
            <div id="invoice-paper" class="invoice-paper max-w-4xl mx-auto bg-white text-black font-sans flex flex-col justify-between relative" style="min-height: calc(297mm - 24mm);">
                <div class="flex-1 flex flex-col">
                    <!-- Briefkopf: Minimalistisch -->
                    <div class="flex justify-between items-end pb-3 border-b-2 border-black mb-5">
                        <div>
                            ${logoHtml ? `<div class="grayscale opacity-90">${logoHtml}</div>` : `<h1 class="text-lg font-bold tracking-widest uppercase text-black">${sanitize(state.einstellungen.firmenname)}</h1>`}
                        </div>
                        <div class="text-right">
                            <h2 class="text-xl font-light tracking-widest text-black uppercase">${isAngebot ? 'Angebot' : 'Rechnung'}</h2>
                            <p class="text-xs font-mono font-bold">${sanitize(rech.nr)}</p>
                        </div>
                    </div>

                    <!-- Anschriftenfeld & Infoblock (DIN 5008) -->
                    <div class="flex justify-between items-start mb-5 gap-6">
                        <div class="w-1/2 pt-1">
                            <p class="text-[9px] text-gray-500 font-bold uppercase tracking-widest border-b border-gray-300 pb-1 mb-2">${absenderInline}</p>
                            <div class="text-black leading-snug text-xs">
                                <p class="font-bold text-sm mb-1">${empfaengerName}</p>
                                ${empfaengerAdresse ? `<p class="text-gray-800">${empfaengerAdresse}</p>` : ''}
                                ${empfaengerPlzOrt ? `<p class="text-gray-800 font-medium">${empfaengerPlzOrt}</p>` : ''}
                            </div>
                        </div>

                        <div class="w-60 border-l border-gray-300 pl-4 text-xs text-gray-700 space-y-1">
                            <div class="flex justify-between"><span class="text-gray-500">Datum:</span> <span class="font-medium">${datumStr}</span></div>
                            <div class="flex justify-between"><span class="text-gray-500">Leistungsdatum:</span> <span class="font-medium">${leistungsdatumStr}</span></div>
                            <div class="flex justify-between"><span class="text-gray-500">Kundennummer:</span> <span class="font-medium font-mono">${kundenNr}</span></div>
                            <div class="flex justify-between"><span class="text-gray-500">${isAngebot ? 'Gültig bis:' : 'Fällig am:'}</span> <span class="font-bold">${faelligStr}</span></div>
                            ${kunde.ustId ? `<div class="flex justify-between"><span class="text-gray-500">USt-IdNr.:</span> <span class="font-mono">${sanitize(kunde.ustId)}</span></div>` : ''}
                            ${projektName ? `<div class="flex justify-between"><span class="text-gray-500">Projekt:</span> <span class="font-medium truncate max-w-[110px]">${sanitize(projektName)}</span></div>` : ''}
                        </div>
                    </div>

                    <!-- Titel -->
                    <div class="mb-3">
                        <h2 class="text-base font-bold text-black uppercase tracking-wider">
                            ${isAngebot ? 'Angebot' : 'Rechnung'} ${sanitize(rech.nr)}
                        </h2>
                        ${projektName ? `<p class="text-xs text-gray-600 mt-0.5">Projekt: ${sanitize(projektName)}</p>` : ''}
                    </div>

                    ${vortextHtml ? `<div class="mb-3 text-xs text-gray-800 leading-relaxed">${vortextHtml}</div>` : ''}

                    <!-- Positionstabelle -->
                    <div class="mb-4">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="border-y border-black text-[10px] uppercase tracking-widest text-gray-600">
                                    <th class="py-2 pl-2 text-center w-8">Pos.</th>
                                    <th class="py-2 px-2">Bezeichnung</th>
                                    <th class="py-2 px-2 text-center w-20">Menge</th>
                                    <th class="py-2 px-2 text-right w-24">${einzelpreisLabel}</th>
                                    <th class="py-2 px-2 text-right w-16">MwSt</th>
                                    <th class="py-2 px-2 text-right w-16">Rabatt</th>
                                    <th class="py-2 pr-2 text-right w-24">${gesamtLabel}</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 text-black">
                                ${itemsHtml}
                            </tbody>
                        </table>
                    </div>

                    <!-- Flex Spacer: Füllt den Leerraum dynamisch aus und schiebt den Abschlussblock nach unten -->
                    <div class="flex-1 min-h-[16px]"></div>

                    <!-- Abschlussbereich: Zahlungsbedingungen, Hinweise & Summenblock -->
                    <div class="mt-auto">
                        <div class="flex justify-between items-start gap-6 mb-4 avoid-break pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">
                            <div class="flex-1 space-y-2.5">
                                <div class="text-xs text-gray-700 border-l-2 border-black pl-3 leading-relaxed">
                                    <p class="font-bold text-black mb-0.5">Zahlungsbedingungen:</p>
                                    <p>Zahlbar bis zum <strong>${faelligStr}</strong> ohne Abzug auf unten genanntes Konto unter Angabe der Rechnungs-Nr. <strong>${sanitize(rech.nr)}</strong>.</p>
                                </div>

                                ${legalTextsHtml}

                                ${qrHtml ? `<div class="grayscale opacity-90">${qrHtml}</div>` : ''}
                            </div>

                            <!-- Rechts: Summenblock -->
                            <div class="w-72 flex-shrink-0 text-xs">
                                ${totalsHtml}
                                <div class="mt-2.5 pt-2 border-t-2 border-black flex justify-between items-baseline font-bold text-base">
                                    <span>Zahlbetrag</span>
                                    <span class="font-mono text-lg">${formatCurrency(zahlbetragNumerical)}</span>
                                </div>
                            </div>
                        </div>

                        ${fusstextHtml ? `<div class="mb-3 text-xs text-gray-800 leading-relaxed pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">${fusstextHtml}</div>` : ''}
                    </div>
                </div>

                <!-- Fußzeile -->
                <div class="pt-3 border-t border-gray-300 text-[9px] text-gray-500 grid grid-cols-3 gap-6 uppercase tracking-wider leading-relaxed pdf-footer avoid-break mt-auto" style="break-inside: avoid; page-break-inside: avoid;">
                    <div>
                        <p class="text-black font-bold mb-0.5">Unternehmen</p>
                        <p>${sanitize(state.einstellungen.firmenname)}</p>
                        ${state.einstellungen.adresse ? `<p class="mt-0.5">${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                    </div>
                    <div>
                        <p class="text-black font-bold mb-0.5">Bankverbindung</p>
                        <p>${sanitize(state.einstellungen.bankname)}</p>
                        <p class="font-mono">IBAN: ${formattedIban}</p>
                        <p class="font-mono">BIC: ${sanitize(state.einstellungen.bic)}</p>
                    </div>
                    <div>
                        <p class="text-black font-bold mb-0.5">Rechtliches</p>
                        <p>Steuernummer / USt-IdNr:</p>
                        <p class="font-mono">${sanitize(state.einstellungen.steuer)}</p>
                    </div>
                </div>
            </div>
        `;
    } else {
        // Standard / Klassisch (DIN 5008 konform)
        templateHtml = `
            <div id="invoice-paper" class="invoice-paper max-w-4xl mx-auto bg-white text-slate-800 font-sans flex flex-col justify-between relative" style="min-height: calc(297mm - 24mm);">
                <div class="flex-1 flex flex-col">
                    <!-- Briefkopf DIN 5008: Logo links, Firmendaten rechts -->
                    <div class="flex justify-between items-start pb-3 border-b border-slate-200 mb-5">
                        <div class="max-w-[45%]">
                            ${logoHtml ? logoHtml : `<h1 class="text-xl font-black tracking-tight text-slate-900 uppercase">${sanitize(state.einstellungen.firmenname)}</h1>`}
                        </div>
                        <div class="text-right text-xs text-slate-600 space-y-0.5 leading-tight">
                            <p class="font-bold text-slate-800 text-sm">${sanitize(state.einstellungen.firmenname)}</p>
                            ${state.einstellungen.adresse ? `<p>${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                        </div>
                    </div>

                    <!-- Anschriftenfeld & Infoblock (DIN 5008) -->
                    <div class="flex justify-between items-start mb-5 gap-6">
                        <!-- Anschrift Empfänger -->
                        <div class="w-1/2 pt-1">
                            <p class="text-[9px] text-slate-400 font-medium tracking-wide border-b border-slate-200/80 pb-1 mb-2">${absenderInline}</p>
                            <div class="text-slate-800 leading-snug text-xs">
                                <p class="font-bold text-sm text-slate-900 mb-1">${empfaengerName}</p>
                                ${empfaengerAdresse ? `<p class="text-slate-700">${empfaengerAdresse}</p>` : ''}
                                ${empfaengerPlzOrt ? `<p class="text-slate-700 font-medium">${empfaengerPlzOrt}</p>` : ''}
                            </div>
                        </div>

                        <!-- Infoblock nach DIN 5008 -->
                        <div class="w-64 bg-slate-50/90 p-3 rounded-lg border border-slate-200/70 text-xs text-slate-600 space-y-1.5 shadow-sm">
                            <div class="flex justify-between border-b border-slate-200/50 pb-1">
                                <span class="text-slate-500 font-medium">${isAngebot ? 'Angebots-Nr.:' : 'Rechnungs-Nr.:'}</span>
                                <span class="font-bold text-slate-900 font-mono">${sanitize(rech.nr)}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-200/50 pb-1">
                                <span class="text-slate-500">Rechnungsdatum:</span>
                                <span class="font-medium text-slate-800">${datumStr}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-200/50 pb-1">
                                <span class="text-slate-500">Leistungsdatum:</span>
                                <span class="font-medium text-slate-800">${leistungsdatumStr}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-200/50 pb-1">
                                <span class="text-slate-500">Kundennummer:</span>
                                <span class="font-medium text-slate-800 font-mono">${kundenNr}</span>
                            </div>
                            <div class="flex justify-between border-b border-slate-200/50 pb-1">
                                <span class="text-slate-500">${isAngebot ? 'Gültig bis:' : 'Fällig am:'}</span>
                                <span class="font-bold text-slate-900">${faelligStr}</span>
                            </div>
                            ${kunde.ustId ? `
                            <div class="flex justify-between border-b border-slate-200/50 pb-1">
                                <span class="text-slate-500">Ihre USt-IdNr.:</span>
                                <span class="font-medium text-slate-800 font-mono">${sanitize(kunde.ustId)}</span>
                            </div>` : ''}
                            ${projektName ? `
                            <div class="flex justify-between pt-0.5">
                                <span class="text-slate-500">Projekt:</span>
                                <span class="font-medium text-slate-800 truncate max-w-[120px]" title="${sanitize(projektName)}">${sanitize(projektName)}</span>
                            </div>` : ''}
                        </div>
                    </div>

                    <!-- Titel & Betreffzeile -->
                    <div class="mb-3">
                        <h2 class="text-lg font-bold text-slate-900 tracking-tight">
                            ${isAngebot ? 'Angebot' : 'Rechnung'} <span class="text-slate-500 font-normal">#${sanitize(rech.nr)}</span>
                        </h2>
                        ${projektName ? `<p class="text-xs text-slate-600 mt-0.5 font-medium">Bauvorhaben / Projekt: ${sanitize(projektName)}</p>` : ''}
                    </div>

                    ${vortextHtml ? `<div class="mb-3 text-xs text-slate-700 leading-relaxed">${vortextHtml}</div>` : ''}

                    <!-- Positionstabelle -->
                    <div class="overflow-hidden mb-4">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="border-y border-slate-700 text-slate-700 font-semibold uppercase tracking-wider text-[10px] bg-slate-50/50">
                                    <th class="py-2 pl-2 text-center w-8">Pos.</th>
                                    <th class="py-2 px-2">Bezeichnung</th>
                                    <th class="py-2 px-2 text-center w-20">Menge</th>
                                    <th class="py-2 px-2 text-right w-24">${einzelpreisLabel}</th>
                                    <th class="py-2 px-2 text-right w-16">MwSt</th>
                                    <th class="py-2 px-2 text-right w-16">Rabatt</th>
                                    <th class="py-2 pr-2 text-right w-24">${gesamtLabel}</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 text-slate-700">
                                ${itemsHtml}
                            </tbody>
                        </table>
                    </div>

                    <!-- Flex Spacer: Füllt den Leerraum dynamisch aus und schiebt den Abschlussblock nach unten -->
                    <div class="flex-1 min-h-[16px]"></div>

                    <!-- Abschlussbereich: Zahlungsbedingungen, Hinweise & Summenblock -->
                    <div class="mt-auto">
                        <div class="flex justify-between items-start gap-6 mb-4 avoid-break pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">
                            <!-- Links: Zahlungsbedingungen, Gesetzliche Hinweise & GiroCode -->
                            <div class="flex-1 space-y-2.5">
                                <div class="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 leading-relaxed">
                                    <p class="font-semibold text-slate-800 mb-0.5">Zahlungsbedingungen:</p>
                                    <p>Bitte überweisen Sie den Betrag bis zum <strong class="text-slate-900">${faelligStr}</strong> auf das unten angegebene Bankkonto unter Angabe der Rechnungsnummer <strong class="text-slate-900 font-mono">${sanitize(rech.nr)}</strong>.</p>
                                </div>

                                ${legalTextsHtml}

                                ${qrHtml}
                            </div>

                            <!-- Rechts: Summenblock -->
                            <div class="w-72 flex-shrink-0 bg-slate-50/90 rounded-xl p-3 border border-slate-200/70 shadow-sm text-xs">
                                ${totalsHtml}
                                <div class="mt-2.5 pt-2 border-t-2 border-slate-800 flex justify-between items-baseline">
                                    <span class="font-bold text-xs text-slate-900 uppercase tracking-wider">Zahlbetrag</span>
                                    <span class="font-black text-lg text-slate-900 font-mono">${formatCurrency(zahlbetragNumerical)}</span>
                                </div>
                            </div>
                        </div>

                        ${fusstextHtml ? `<div class="mb-3 text-xs text-slate-700 leading-relaxed pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">${fusstextHtml}</div>` : ''}
                    </div>
                </div>

                <!-- Fußzeile (DIN 5008 3-Spalten) -->
                <div class="pt-3 border-t border-slate-200 text-[10px] text-slate-500 grid grid-cols-3 gap-6 leading-snug pdf-footer avoid-break mt-auto" style="break-inside: avoid; page-break-inside: avoid;">
                    <div>
                        <p class="font-bold text-slate-700 uppercase tracking-wider text-[9px] mb-0.5">Unternehmen</p>
                        <p class="font-medium text-slate-800">${sanitize(state.einstellungen.firmenname)}</p>
                        ${state.einstellungen.adresse ? `<p class="text-slate-600 mt-0.5">${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                    </div>
                    <div>
                        <p class="font-bold text-slate-700 uppercase tracking-wider text-[9px] mb-0.5">Bankverbindung</p>
                        <p class="font-medium text-slate-800">${sanitize(state.einstellungen.bankname)}</p>
                        <p class="font-mono text-slate-700">IBAN: ${formattedIban}</p>
                        <p class="font-mono text-slate-700">BIC: ${sanitize(state.einstellungen.bic)}</p>
                    </div>
                    <div>
                        <p class="font-bold text-slate-700 uppercase tracking-wider text-[9px] mb-0.5">Rechtliches & Steuer</p>
                        <p>Steuernummer / USt-IdNr.:</p>
                        <p class="font-medium text-slate-800 font-mono">${sanitize(state.einstellungen.steuer)}</p>
                    </div>
                </div>
            </div>
        `;
    }

    return templateHtml;
}

window.generatePdf = async function(id, isAngebot = false) {
    const idNum = parseInt(id);
    const rech = isAngebot ? state.angebote.find(r => parseInt(r.id) === idNum) : state.rechnungen.find(r => parseInt(r.id) === idNum);
    if (!rech) return;

    // GoBD Compliance Lock (Invoices only)
    if (!isAngebot && rech.status !== 'Entwurf' && !rech.isLocked) {
        if (!(await safeConfirm(`Durch das Generieren des PDFs wird die Rechnung ${rech.nr} finalisiert und für nachträgliche Änderungen gesperrt (GoBD-konform). Möchten Sie fortfahren?`))) {
            return;
        }
        rech.isLocked = true;
        // Save to database
        await window.api.saveDocument(rech);
        
        // Re-render dashboard behind modal
        if (document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('hidden')) {
            renderDashboard();
        } else if (document.getElementById('view-rechnungen') && !document.getElementById('view-rechnungen').classList.contains('hidden')) {
            renderRechnungen();
        }
    }

    const kundeId = parseInt(rech.kundeId);
    const kunde = state.kunden.find(k => parseInt(k.id) === kundeId) || {};
    const templateHtml = await buildInvoiceDocumentHtml(rech, kunde, isAngebot);
    const template = document.getElementById('print-template');
    template.innerHTML = templateHtml;

    const pdfFilename = `${isAngebot ? 'Angebot' : 'Rechnung'}_${rech.nr || 'Dokument'}.pdf`;
    setTimeout(() => {
        openPdfPreview(template.innerHTML, pdfFilename);
    }, 50);
};

// Rendert die Sichtseite für den ZUGFeRD-Export unsichtbar in #print-template
// (das @media print-CSS blendet alles andere aus) und gibt den vorherigen
// Inhalt zur Wiederherstellung zurück. Wirft bei Fehlern, bevor der Container
// verändert wird - der Export läuft dann mit der Platzhalter-Seite weiter.
window.renderInvoiceForZugferdExport = async function(rech, kunde) {
    const template = document.getElementById('print-template');
    if (!template) throw new Error('Druckvorlage (#print-template) nicht gefunden.');
    const previousHtml = template.innerHTML;
    const templateHtml = await buildInvoiceDocumentHtml(rech, kunde || {}, false);
    template.innerHTML = templateHtml;
    await new Promise(resolve => setTimeout(resolve, 150));
    return previousHtml;
};

window.restorePrintTemplateContent = function(previousHtml) {
    const template = document.getElementById('print-template');
    if (template && typeof previousHtml === 'string') {
        template.innerHTML = previousHtml;
    }
};

// Generate Mahnung (Dunning) PDF
window.generateMahnungPdf = async function(id) {
    try {
        const idNum = parseInt(id);
        const rech = state.rechnungen.find(r => parseInt(r.id) === idNum);
        
        if (!rech) {
            console.warn('Mahnung PDF: Rechnung nicht gefunden', id);
            showToast("Fehler: Rechnung wurde nicht im System gefunden.", "error");
            return;
        }

        if (rech.status !== 'Überfällig') {
            console.warn('Mahnung PDF: Status nicht Überfällig', id, rech.status);
            showToast("Mahnungen können nur für überfällige Rechnungen erstellt werden.", "warning");
            return;
        }

        // GoBD Compliance Check
        if (!rech.isLocked) {
            showToast("Fehler: Rechnung muss zuerst gedruckt werden (GoBD-Sperre), bevor eine Mahnung erstellt werden kann.", "error");
            return;
        }

        // Open custom modal instead of using prompt()
        const modal = document.getElementById('mahnung-modal');
        if (modal) {
            document.getElementById('mahnung-rechnung-id').value = id;
            document.getElementById('mahnung-level-select').value = "1";
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        } else {
            console.error('Mahnung modal not found in DOM');
            showToast("Systemfehler: Mahnungs-Dialog nicht gefunden.", "error");
        }
    } catch (error) {
        console.error('Error in generateMahnungPdf:', error);
        showToast("Ein unerwarteter Fehler ist beim Öffnen des Mahnungs-Dialogs aufgetreten.", "error");
    }
}

window.closeMahnungModal = function() {
    const modal = document.getElementById('mahnung-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

window.confirmMahnungLevel = async function() {
    try {
        const id = document.getElementById('mahnung-rechnung-id').value;
        const levelStr = document.getElementById('mahnung-level-select').value;
        closeMahnungModal();

        if (!levelStr) return;
        const level = parseInt(levelStr);
        if (![1, 2, 3].includes(level)) {
            showToast("Ungültige Mahnstufe ausgewählt (1, 2 oder 3 erlaubt).", "error");
            return;
        }

        const idNum = parseInt(id);
        const rech = state.rechnungen.find(r => parseInt(r.id) === idNum);
        if (!rech) return;

        const kundeId = parseInt(rech.kundeId);
        const kunde = state.kunden.find(k => parseInt(k.id) === kundeId) || {};
        const template = document.getElementById('print-template');
        if (!template) {
            console.error('Print template container not found');
            showToast("Systemfehler: Druckvorlage nicht gefunden.", "error");
            return;
        }
        
        // Fee based on level
        let MAHNGEBUHR = 0;
        if (level === 1) MAHNGEBUHR = parseFloat(state.einstellungen.mahngebuehr1) || 0;
        else if (level === 2) MAHNGEBUHR = parseFloat(state.einstellungen.mahngebuehr2) || 5.00;
        else if (level === 3) MAHNGEBUHR = parseFloat(state.einstellungen.mahngebuehr3) || 10.00;

        const logoHtml = state.einstellungen.logo ? `<img src="${state.einstellungen.logo}" class="h-16 object-contain">` : '';
        const datumStr = new Date().toLocaleDateString('de-DE'); // Today is the Mahnung date
        const origRechDatum = new Date(rech.datum).toLocaleDateString('de-DE');

        // Set a new due date for the Dunning letter
        const neuFaellig = new Date();
        neuFaellig.setDate(neuFaellig.getDate() + (level === 3 ? 7 : 14));
        const faelligStr = neuFaellig.toLocaleDateString('de-DE');

        const itemsHtml = generateMahnungItemsHtml(rech, MAHNGEBUHR);

        // Recalculate Totals
        const currentZahlbetrag = typeof rech.zahlbetrag === 'number' ? rech.zahlbetrag : (rech.brutto || 0);
        const newZahlbetrag = currentZahlbetrag + MAHNGEBUHR;

        // --- GIROCODE GENERATION (EPC-QR) for Mahnung ---
        let qrHtml = '';
        if (state.einstellungen.iban && state.einstellungen.firmenname && newZahlbetrag > 0) {
            const bic = state.einstellungen.bic ? state.einstellungen.bic.trim() : '';
            const name = state.einstellungen.firmenname.substring(0, 70).trim();
            const iban = state.einstellungen.iban.replace(/\s+/g, '').trim();
            
            let amountStr = newZahlbetrag.toFixed(2);
            if (amountStr.endsWith('.00')) {
                amountStr = parseInt(newZahlbetrag, 10).toString();
            }

            const refStr = `Mahnung zu ${rech.nr}`.substring(0, 35).replace(/[^a-zA-Z0-9.\- ]/g, '');

            const epcLines = [
                "BCD",
                "002",
                "1",
                "SCT",
                bic,
                name,
                iban,
                `EUR${amountStr}`,
                "",
                "",
                refStr,
                ""
            ];

            const epcString = epcLines.join('\n');
            const qrDataUrl = await window.api.generateQrCode(epcString);
            if (qrDataUrl) {
                qrHtml = `
                    <div class="flex items-center gap-3.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200/70 w-full">
                        <img src="${qrDataUrl}" class="w-28 h-28 rounded bg-white p-1 border border-slate-200 shrink-0" style="width: 28mm; height: 28mm;" alt="GiroCode">
                        <div class="text-xs text-slate-600 flex-1 leading-snug">
                            <p class="font-bold text-slate-800 mb-1 flex items-center gap-1.5 text-xs">
                                <span class="material-symbols-outlined text-[15px] text-primary">qr_code_scanner</span>
                                GiroCode / Überweisung
                            </p>
                            <p class="text-[11px] text-slate-600 leading-snug mb-1">
                                Mit Banking-App scannen &amp; ${formatCurrency(newZahlbetrag)} direkt überweisen.
                            </p>
                            <p class="text-[10px] text-slate-400">
                                Rechnungsnummer &amp; Mahnbetrag werden direkt übernommen.
                            </p>
                        </div>
                    </div>
                `;
            }
        }

        // Update state and save to DB
        rech.mahnungLevel = level;
        rech.mahnungDatum = new Date().toISOString().split('T')[0];
        rech.mahnungGebuehr = MAHNGEBUHR;

        if (window.api && typeof window.api.saveDocument === 'function') {
            await window.api.saveDocument(rech);
            console.log('Mahnung information saved for invoice:', id);
        }

        const absenderInline = state.einstellungen.adresse ?
            (sanitize(state.einstellungen.firmenname) + " • " + sanitize(state.einstellungen.adresse).replace(/[\r\n]+/g, ' • ')) :
            sanitize(state.einstellungen.firmenname);

        template.innerHTML = buildMahnungHtmlTemplate({
            logoHtml,
            datumStr,
            origRechDatum,
            absenderInline,
            kunde,
            itemsHtml,
            currentZahlbetrag,
            MAHNGEBUHR,
            newZahlbetrag,
            faelligStr,
            rech,
            level,
            qrHtml
        });

        setTimeout(() => {
            state.belegEmailKontext = {
                beleg_typ: 'MAHNUNG',
                beleg_id: idNum,
                mahnstufe: level,
                nr: rech.nr,
                kundeId: kundeId,
                brutto: newZahlbetrag,
                faelligkeitVorschlag: neuFaellig.toISOString().split('T')[0]
            };
            openPdfPreview(template.innerHTML);
        }, 50);
    } catch (error) {
        console.error('Error in confirmMahnungLevel:', error);
        showToast("Ein unerwarteter Fehler ist beim Erstellen der Mahnung aufgetreten.", "error");
    }
}

// HTML Generation Helpers for Mahnung PDF
function generateMahnungItemsHtml(rech, MAHNGEBUHR) {
    let itemsHtml = '';
    rech.positionen.forEach((pos, i) => {
        const artId = parseInt(pos.artikelId);
        const art = state.artikel.find(a => parseInt(a.id) === artId) || {};
        const rabatt = parseFloat(pos.rabatt) || 0;
        const gesamt = (pos.menge * pos.preis) * (1 - rabatt / 100);

        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 text-xs avoid-break pdf-no-break';
        tr.style.pageBreakInside = 'avoid';
        tr.style.breakInside = 'avoid';

        const tdIdx = document.createElement('td');
        tdIdx.className = 'py-2 pl-2 text-center text-slate-400 font-mono text-[11px]';
        tdIdx.textContent = i + 1;
        tr.appendChild(tdIdx);

        const tdName = document.createElement('td');
        tdName.className = 'py-2 px-2 font-medium text-slate-900';
        tdName.textContent = art.name || pos.name || 'Position';
        tr.appendChild(tdName);

        const tdMenge = document.createElement('td');
        tdMenge.className = 'py-2 px-2 text-center tabular-nums text-slate-700';
        tdMenge.textContent = `${pos.menge} ${pos.einheit || 'Stk.'}`;
        tr.appendChild(tdMenge);

        const tdPreis = document.createElement('td');
        tdPreis.className = 'py-2 px-2 text-right tabular-nums text-slate-700 font-mono';
        tdPreis.textContent = formatCurrency(pos.preis);
        tr.appendChild(tdPreis);

        const isPos13b = (rech.unterliegt_13b && pos.is13b) || pos.is13b;

        const tdMwst = document.createElement('td');
        tdMwst.className = 'py-2 px-2 text-right tabular-nums text-slate-500 font-mono';
        tdMwst.textContent = isPos13b ? '0%' : `${pos.mwst}%`;
        tr.appendChild(tdMwst);

        const tdRabatt = document.createElement('td');
        tdRabatt.className = 'py-2 px-2 text-right tabular-nums font-mono ' + (rabatt > 0 ? 'text-emerald-600 font-medium' : 'text-slate-300');
        tdRabatt.textContent = rabatt > 0 ? `-${rabatt}%` : '-';
        tr.appendChild(tdRabatt);

        const tdGesamt = document.createElement('td');
        tdGesamt.className = 'py-2 pr-2 text-right tabular-nums font-medium text-slate-900 font-mono';
        tdGesamt.textContent = formatCurrency(gesamt);
        tr.appendChild(tdGesamt);

        itemsHtml += tr.outerHTML;
    });

    // Add Mahngebühr as a line item
    if (MAHNGEBUHR > 0) {
        itemsHtml += `
            <tr class="border-b border-amber-200 text-xs bg-amber-50/60 font-semibold text-amber-900 avoid-break pdf-no-break" style="page-break-inside: avoid; break-inside: avoid;">
                <td class="py-2 pl-2 text-center text-amber-600 font-mono">*</td>
                <td class="py-2 px-2 text-amber-950">Mahngebühr / Verzugspauschale</td>
                <td class="py-2 px-2 text-center tabular-nums">1 Stk.</td>
                <td class="py-2 px-2 text-right tabular-nums font-mono">${formatCurrency(MAHNGEBUHR)}</td>
                <td class="py-2 px-2 text-right tabular-nums font-mono text-slate-500">0%</td>
                <td class="py-2 px-2 text-right tabular-nums font-mono text-slate-300">-</td>
                <td class="py-2 pr-2 text-right tabular-nums font-mono font-bold text-amber-900">${formatCurrency(MAHNGEBUHR)}</td>
            </tr>
        `;
    }
    return itemsHtml;
}

function buildMahnungHtmlTemplate(data) {
    const {
        logoHtml,
        datumStr,
        origRechDatum,
        absenderInline,
        kunde,
        itemsHtml,
        currentZahlbetrag,
        MAHNGEBUHR,
        newZahlbetrag,
        faelligStr,
        rech,
        level,
        qrHtml
    } = data;

    let origFaelligStr = "unbekannt";
    try {
        if (rech.faellig) {
            origFaelligStr = formatGermanDate(rech.faellig);
        } else {
            const tempDate = new Date(rech.datum);
            tempDate.setDate(tempDate.getDate() + 14);
            origFaelligStr = formatGermanDate(tempDate);
        }
    } catch (e) {
        console.warn("Konnte Fälligkeitsdatum nicht parsen", e);
    }

    let title = "1. Mahnung (Zahlungserinnerung)";
    let textHeader = "Zahlungserinnerung";
    let textBody = `bisher konnten wir leider keinen Zahlungseingang für die unten aufgeführte Rechnung verzeichnen. Sicherlich handelt es sich hierbei nur um ein Versehen. Der Betrag war ursprünglich zum <strong>${origFaelligStr}</strong> fällig.`;
    let colorClass = "amber";

    if (level === 2) {
        title = "2. Mahnung";
        textHeader = "Ausdrückliche Mahnung";
        textBody = `trotz unserer ersten Zahlungserinnerung konnten wir bisher keinen Zahlungseingang für die unten aufgeführte Rechnung feststellen. Der Rechnungsbetrag war am <strong>${origFaelligStr}</strong> fällig. Gemäß unseren Zahlungsbedingungen berechnen wir eine Mahngebühr in Höhe von <strong>${formatCurrency(MAHNGEBUHR)}</strong>.`;
        colorClass = "orange";
    } else if (level === 3) {
        title = "3. & letzte Mahnung";
        textHeader = "Letzte Mahnung vor Übergabe an Inkasso";
        textBody = `auf unsere bisherigen Zahlungserinnerungen und Mahnungen haben Sie leider nicht reagiert. Wir fordern Sie hiermit letztmalig auf, den offenen Gesamtbetrag einschließlich Mahngebühren unverzüglich zu begleichen. Sollte bis zum unten angegebenen Datum kein Zahlungseingang erfolgen, werden wir das gerichtliche Mahnverfahren bzw. ein Inkassobüro beauftragen. Hierdurch entstehen erhebliche Zusatzkosten.`;
        colorClass = "red";
    }

    const colorHex = colorClass === "amber" ? "#d97706" : (colorClass === "orange" ? "#ea580c" : "#dc2626");
    const mahnungsNr = `${rech.nr}-M${level}`;
    const formattedIban = formatIban(state.einstellungen.iban);

    const empfaengerName = sanitize((kunde && kunde.name) || 'Sehr geehrte Damen und Herren');
    const empfaengerAdresse = sanitize((kunde && kunde.adresse) || '').replace(/[\r\n]+/g, '<br>');
    const empfaengerPlzOrt = `${sanitize((kunde && kunde.plz) || '')} ${sanitize((kunde && kunde.ort) || '')}`.trim();
    const kundenNr = (kunde && kunde.kundennummer) || (kunde && kunde.id ? `KD-${String(kunde.id).padStart(5, '0')}` : '-');

    return `
        <div id="invoice-paper" class="invoice-paper max-w-4xl mx-auto bg-white text-slate-800 font-sans flex flex-col justify-between relative" style="min-height: calc(297mm - 24mm);">
            <div class="flex-1 flex flex-col">
                <!-- Briefkopf: Logo links, Firmendaten rechts -->
                <div class="flex justify-between items-start pb-3 border-b border-slate-200 mb-5">
                    <div class="max-w-[45%]">
                        ${logoHtml ? logoHtml : `<h1 class="text-xl font-bold tracking-tight text-slate-900">${sanitize(state.einstellungen.firmenname)}</h1>`}
                    </div>
                    <div class="text-right text-xs text-slate-600 space-y-0.5 leading-tight">
                        <p class="font-bold text-slate-900 text-sm">${sanitize(state.einstellungen.firmenname)}</p>
                        ${state.einstellungen.adresse ? `<p>${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                        ${state.einstellungen.telefon ? `<p><span class="text-slate-400">Tel:</span> ${sanitize(state.einstellungen.telefon)}</p>` : ''}
                        ${state.einstellungen.email ? `<p><span class="text-slate-400">E-Mail:</span> ${sanitize(state.einstellungen.email)}</p>` : ''}
                    </div>
                </div>

                <!-- Anschriftenfeld & Infoblock (DIN 5008) -->
                <div class="flex justify-between items-start mb-5 gap-6">
                    <!-- Anschrift Empfänger (85mm x 45mm Zone) -->
                    <div class="w-1/2 pt-1">
                        <p class="text-[9px] text-slate-400 font-semibold tracking-wider uppercase border-b border-slate-300 pb-1 mb-2 truncate" title="${absenderInline}">${absenderInline}</p>
                        <div class="text-slate-800 leading-snug text-xs">
                            <p class="font-bold text-sm text-slate-900 mb-1">${empfaengerName}</p>
                            ${empfaengerAdresse ? `<p class="text-slate-700">${empfaengerAdresse}</p>` : ''}
                            ${empfaengerPlzOrt ? `<p class="text-slate-700 font-medium">${empfaengerPlzOrt}</p>` : ''}
                            ${kunde && kunde.land && kunde.land !== 'Deutschland' ? `<p class="font-semibold uppercase text-[10px] text-slate-600 mt-0.5">${sanitize(kunde.land)}</p>` : ''}
                        </div>
                    </div>

                    <!-- Infoblock -->
                    <div class="w-64 bg-slate-50 rounded-lg p-3 border border-slate-200/80 text-xs space-y-1.5 flex-shrink-0">
                        <div class="flex justify-between border-b border-slate-200/60 pb-1">
                            <span class="text-slate-500">Mahn-Nr.:</span>
                            <span class="font-bold text-slate-900 font-mono">${mahnungsNr}</span>
                        </div>
                        <div class="flex justify-between border-b border-slate-200/60 pb-1">
                            <span class="text-slate-500">Mahndatum:</span>
                            <span class="font-medium text-slate-800">${datumStr}</span>
                        </div>
                        <div class="flex justify-between border-b border-slate-200/60 pb-1">
                            <span class="text-slate-500">Rechnungs-Nr.:</span>
                            <span class="font-bold text-slate-900 font-mono">${sanitize(rech.nr)}</span>
                        </div>
                        <div class="flex justify-between border-b border-slate-200/60 pb-1">
                            <span class="text-slate-500">Rechnungsdatum:</span>
                            <span class="font-medium text-slate-800">${origRechDatum}</span>
                        </div>
                        <div class="flex justify-between border-b border-slate-200/60 pb-1">
                            <span class="text-slate-500">Kundennummer:</span>
                            <span class="font-medium text-slate-800 font-mono">${kundenNr}</span>
                        </div>
                        <div class="flex justify-between pt-0.5">
                            <span class="text-slate-500 font-semibold">Neues Zahlungsziel:</span>
                            <span class="font-bold" style="color: ${colorHex}">${faelligStr}</span>
                        </div>
                    </div>
                </div>

                <!-- Titel & Betreffzeile -->
                <div class="mb-3">
                    <h2 class="text-lg font-bold tracking-tight" style="color: ${colorHex}">
                        ${title} <span class="text-slate-500 font-normal">zu Rechnung #${sanitize(rech.nr)}</span>
                    </h2>
                </div>

                <!-- Mahnschreiben Textblock -->
                <div class="mb-4 p-3 rounded-lg text-slate-800 text-xs leading-relaxed border-l-4 shadow-sm" style="background-color: ${colorHex}0c; border-color: ${colorHex}">
                    <p class="font-bold mb-1" style="color: ${colorHex}">${textHeader}</p>
                    <p>Sehr geehrte Damen und Herren,</p>
                    <p class="mt-1">${textBody}</p>
                    <p class="mt-1.5 font-medium">Bitte überweisen Sie den neuen Gesamtbetrag von <strong>${formatCurrency(newZahlbetrag)}</strong> bis spätestens zum <strong style="color: ${colorHex}">${faelligStr}</strong> auf das unten aufgeführte Bankkonto.</p>
                </div>

                <!-- Positionstabelle -->
                <div class="overflow-hidden mb-4">
                    <table class="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr class="border-y border-slate-700 text-slate-700 font-semibold uppercase tracking-wider text-[10px] bg-slate-50/50">
                                <th class="py-2 pl-2 text-center w-8">Pos.</th>
                                <th class="py-2 px-2">Bezeichnung</th>
                                <th class="py-2 px-2 text-center w-20">Menge</th>
                                <th class="py-2 px-2 text-right w-24">Einzelpreis</th>
                                <th class="py-2 px-2 text-right w-16">MwSt</th>
                                <th class="py-2 px-2 text-right w-16">Rabatt</th>
                                <th class="py-2 pr-2 text-right w-24">Gesamt</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 text-slate-700">
                            ${itemsHtml}
                        </tbody>
                    </table>
                </div>

                <!-- Flex Spacer: Füllt den Leerraum dynamisch aus und schiebt den Abschlussblock nach unten -->
                <div class="flex-1 min-h-[16px]"></div>

                <!-- Abschlussbereich: Zahlungsbedingungen, Hinweise & Summenblock -->
                <div class="mt-auto">
                    <div class="flex justify-between items-start gap-6 mb-4 avoid-break pdf-no-break" style="break-inside: avoid; page-break-inside: avoid;">
                        <div class="flex-1">
                            ${qrHtml}
                        </div>

                        <div class="w-72 flex-shrink-0 bg-slate-50/90 rounded-xl p-3 border border-slate-200/70 shadow-sm text-xs space-y-1.5">
                            <div class="flex justify-between text-slate-600">
                                <span>Offener Rechnungsbetrag:</span>
                                <span class="tabular-nums font-mono">${formatCurrency(currentZahlbetrag)}</span>
                            </div>
                            ${MAHNGEBUHR > 0 ? `
                            <div class="flex justify-between" style="color: ${colorHex}">
                                <span>+ Mahngebühr:</span>
                                <span class="tabular-nums font-mono font-medium">${formatCurrency(MAHNGEBUHR)}</span>
                            </div>` : ''}
                            <div class="mt-2 pt-2 border-t-2 border-slate-800 flex justify-between items-baseline">
                                <span class="font-bold text-xs uppercase tracking-wider text-slate-900">Zu zahlender Betrag</span>
                                <span class="font-black text-lg font-mono" style="color: ${colorHex}">${formatCurrency(newZahlbetrag)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Fußzeile (DIN 5008 3-Spalten) -->
            <div class="pt-3 border-t border-slate-200 text-[10px] text-slate-500 grid grid-cols-3 gap-6 leading-snug pdf-footer avoid-break mt-auto" style="break-inside: avoid; page-break-inside: avoid;">
                <div>
                    <p class="font-bold text-slate-700 uppercase tracking-wider text-[9px] mb-0.5">Unternehmen</p>
                    <p class="font-medium text-slate-800">${sanitize(state.einstellungen.firmenname)}</p>
                    ${state.einstellungen.adresse ? `<p class="text-slate-600 mt-0.5">${sanitize(state.einstellungen.adresse).replace(/\n/g, '<br>')}</p>` : ''}
                </div>
                <div>
                    <p class="font-bold text-slate-700 uppercase tracking-wider text-[9px] mb-0.5">Bankverbindung</p>
                    <p class="font-medium text-slate-800">${sanitize(state.einstellungen.bankname)}</p>
                    <p class="font-mono text-slate-700">IBAN: ${formattedIban}</p>
                    <p class="font-mono text-slate-700">BIC: ${sanitize(state.einstellungen.bic)}</p>
                </div>
                <div>
                    <p class="font-bold text-slate-700 uppercase tracking-wider text-[9px] mb-0.5">Rechtliches & Steuer</p>
                    <p>Steuernummer / USt-IdNr.:</p>
                    <p class="font-medium text-slate-800 font-mono">${sanitize(state.einstellungen.steuer)}</p>
                </div>
            </div>
        </div>
    `;
}

// --- PDF Preview Logic ---
// --- PDF Preview & Export Logic ---
function openPdfPreview(htmlContent, filename = 'Rechnung.pdf') {
    if (window.invoiceView && typeof window.invoiceView.openPdfPreview === 'function') {
        window.invoiceView.openPdfPreview(htmlContent, filename);
    } else {
        const previewContainer = document.getElementById('pdf-preview-container');
        const modal = document.getElementById('pdf-preview-modal');
        if (previewContainer && modal) {
            previewContainer.innerHTML = htmlContent;
            previewContainer.dataset.filename = filename;
            modal.style.display = '';
            modal.style.zIndex = '';
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }
}
window.openPdfPreview = openPdfPreview;

function closePdfPreview() {
    if (window.invoiceView && typeof window.invoiceView.closePdfPreview === 'function') {
        window.invoiceView.closePdfPreview();
    } else {
        const modal = document.getElementById('pdf-preview-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.style.display = 'none';
            modal.style.zIndex = '-10';
        }
    }
}
window.closePdfPreview = closePdfPreview;

async function executePrint(mode = 'print') {
    const printBtn = document.getElementById('pdf-preview-print-btn');
    const saveBtn = document.getElementById('pdf-preview-save-btn');
    const closeBtn = document.getElementById('pdf-preview-close-btn');

    const setButtonsState = (isBusy) => {
        [printBtn, saveBtn, closeBtn].forEach(btn => {
            if (!btn) return;
            btn.disabled = isBusy;
            if (isBusy) {
                btn.classList.add('opacity-50', 'pointer-events-none');
            } else {
                btn.classList.remove('opacity-50', 'pointer-events-none');
            }
        });
    };

    const closePdfModal = () => {
        if (window.invoiceView && typeof window.invoiceView.closePdfPreview === 'function') {
            window.invoiceView.closePdfPreview();
        } else if (typeof window.closePdfPreview === 'function') {
            window.closePdfPreview();
        }
    };

    try {
        setButtonsState(true);

        const printTemplate = document.getElementById('print-template');
        const previewContainer = document.getElementById('pdf-preview-container');

        if (!previewContainer) {
            console.warn('pdf-preview-container not found');
            return;
        }

        const invoiceElement = document.getElementById('invoice-paper') || previewContainer.querySelector('#invoice-paper') || previewContainer.firstElementChild || previewContainer;
        const filename = previewContainer.dataset.filename || 'Rechnung.pdf';

        // Synchronisiere #print-template für Nativ-Electron printToPDF und Browserdruck
        if (printTemplate) {
            printTemplate.innerHTML = invoiceElement.outerHTML || previewContainer.innerHTML;
        }
        await new Promise(resolve => setTimeout(resolve, 60));

        if (mode === 'save') {
            if (window.api && typeof window.api.savePdf === 'function') {
                // 100% Nativ Electron - Absolut Freeze-sicher (Bypass html2pdf & html2canvas)
                const result = await window.api.savePdf(null, filename);
                if (result && result.success) {
                    showToast('PDF erfolgreich gespeichert', 'success');
                    closePdfModal();
                } else if (result && !result.cancelled) {
                    showToast('Fehler beim Speichern der PDF', 'error');
                }
            } else {
                // Fallback nur für normale Webbrowser (ohne Electron window.api)
                if (typeof html2pdf !== 'undefined') {
                    const opt = {
                        margin: [12, 15, 12, 15],
                        filename: filename,
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2, useCORS: true, allowTaint: true, windowWidth: 1024, logging: false },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                        pagebreak: { mode: ['css', 'legacy'], avoid: ['.avoid-break', '.pdf-no-break', '.pdf-footer'] }
                    };
                    showToast('PDF-Export wird vorbereitet...', 'info');
                    await html2pdf().set(opt).from(invoiceElement.cloneNode(true)).save();
                    showToast('PDF erfolgreich gespeichert', 'success');
                    closePdfModal();
                } else {
                    showToast('PDF-Export im Browser nicht möglich.', 'error');
                }
            }
        } else {
            // Druck-Modus
            if (window.api && typeof window.api.printDocument === 'function') {
                const printRes = await window.api.printDocument();
                if (printRes && printRes.success) {
                    showToast('Druckauftrag gesendet', 'success');
                    closePdfModal();
                }
            } else {
                window.print();
                closePdfModal();
            }
        }
    } catch (globalErr) {
        console.error('executePrint unhandled error:', globalErr);
        showToast('Druckvorgang konnte nicht ausgeführt werden.', 'error');
    } finally {
        // 1. Verwaiste html2pdf-Container killen
        document.querySelectorAll('.html2pdf__container, iframe.html2canvas-container').forEach(el => {
            el.remove();
        });

        // 2. Pointer-Events korrekt zurücksetzen
        document.body.style.pointerEvents = '';
        const modal = document.getElementById('pdf-preview-modal');
        if (modal) modal.style.pointerEvents = '';

        // 3. Lade-Overlays abschalten
        ['loading-overlay', 'spinner', 'global-loading'].forEach(id => {
            const spinner = document.getElementById(id);
            if (spinner) {
                spinner.classList.add('hidden');
                spinner.style.display = 'none';
            }
        });

        // 4. Frische Referenzen holen und hart entsperren
        const pBtn = document.getElementById('pdf-preview-print-btn');
        const sBtn = document.getElementById('pdf-preview-save-btn');
        const cBtn = document.getElementById('pdf-preview-close-btn');
        [pBtn, sBtn, cBtn].forEach(btn => {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'pointer-events-none');
            }
        });

        // 5. Events sicher neu binden
        if (window.invoiceView && typeof window.invoiceView.bindPdfModalControls === 'function') {
            window.invoiceView.bindPdfModalControls();
        }

        // 6. Fokus zurückholen
        if (typeof window.focus === 'function') window.focus();

        if (window.api && typeof window.api.focusWindow === 'function') {
            try {
                window.api.focusWindow();
            } catch (e) {
                // Focus API Fallback ignoriert
            }
        }
    }
}
window.executePrint = executePrint;

// --- E-Mail-Versand (F10): SMTP-Kontenverwaltung ---
async function renderSmtpKonten() {
    const liste = document.getElementById('smtp-konten-liste');
    const leer = document.getElementById('smtp-konten-leer');
    if (!liste) return;
    liste.innerHTML = '';
    let konten = [];
    try {
        konten = await window.api.getSmtpKonten();
    } catch (e) {
        console.warn('SMTP-Konten konnten nicht geladen werden:', e);
    }
    leer.classList.toggle('hidden', konten.length > 0);

    konten.forEach(konto => {
        const zeile = document.createElement('div');
        zeile.className = 'flex flex-wrap items-center justify-between gap-3 border border-slate-200 rounded-md px-4 py-3 bg-white';
        const sicherheitsBadge = konto.gespeichert_sicher
            ? '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-800 border border-green-200">verschlüsselt</span>'
            : '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700 border border-red-200">unsicher gespeichert</span>';
        const verbindungsBadge = konto.port === 465 || konto.secure ? 'SSL/TLS' : 'STARTTLS';
        zeile.innerHTML = `
            <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-sm text-slate-800">${sanitize(konto.name)}</span>
                    ${konto.ist_standard ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/10 text-primary border border-primary/30">Standard</span>' : ''}
                    ${konto.hat_passwort ? '<span class="text-green-600 material-symbols-outlined text-[16px]" title="Passwort gespeichert">check_circle</span>' : '<span class="text-amber-500 material-symbols-outlined text-[16px]" title="Kein Passwort gespeichert">warning</span>'}
                    ${sicherheitsBadge}
                </div>
                <div class="text-xs text-slate-500 mt-0.5 font-mono">${sanitize(konto.host)}:${Number(konto.port)} · ${verbindungsBadge} · Absender: ${sanitize(konto.absender_email)}</div>
            </div>`;
        const aktionen = document.createElement('div');
        aktionen.className = 'flex items-center gap-1 shrink-0';
        const mkBtn = (icon, title, cls, handler) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.title = title;
            b.className = cls;
            b.onclick = handler;
            const s = document.createElement('span');
            s.className = 'material-symbols-outlined text-[18px]';
            s.textContent = icon;
            b.appendChild(s);
            return b;
        };
        if (!konto.ist_standard) {
            aktionen.appendChild(mkBtn('star', 'Als Standard setzen', 'text-slate-400 hover:text-amber-500 p-1 transition-colors', () => setzeStandardKonto(konto.id)));
        }
        aktionen.appendChild(mkBtn('edit', 'Bearbeiten', 'text-slate-400 hover:text-primary p-1 transition-colors', () => openSmtpKontoModal(konto)));
        aktionen.appendChild(mkBtn('delete', 'Löschen', 'text-slate-400 hover:text-red-500 p-1 transition-colors', () => deleteSmtpKontoMitConfirm(konto)));
        zeile.appendChild(aktionen);
        liste.appendChild(zeile);
    });
}

async function setzeStandardKonto(id) {
    try {
        const konten = await window.api.getSmtpKonten();
        const ziel = konten.find(k => k.id === id);
        if (!ziel) throw new Error('SMTP-Konto nicht gefunden.');
        await window.api.saveSmtpKonto({
            id: ziel.id,
            name: ziel.name,
            host: ziel.host,
            port: Number(ziel.port),
            secure: !!ziel.secure,
            user: '',
            absender_name: ziel.absender_name,
            absender_email: ziel.absender_email,
            ist_standard: true,
            passwort_leer_lassen: true
        });
        showToast('Standardkonto aktualisiert.', 'success');
        await renderSmtpKonten();
    } catch (e) {
        showToast(e.message || 'Konnte Standardkonto nicht setzen.', 'error');
    }
}

function onSmtpPortChange() {
    const port = parseInt(document.getElementById('smtp-modal-port').value, 10);
    document.getElementById('smtp-modal-secure-on').checked = port === 465;
    document.getElementById('smtp-modal-secure-off').checked = port !== 465;
}

async function openSmtpKontoModal(konto = null) {
    document.getElementById('smtp-konto-modal-title').innerText = konto ? 'SMTP-Konto bearbeiten' : 'SMTP-Konto anlegen';
    document.getElementById('smtp-modal-id').value = konto ? konto.id : '';
    document.getElementById('smtp-modal-name').value = konto ? konto.name : '';
    document.getElementById('smtp-modal-host').value = konto ? konto.host : '';
    document.getElementById('smtp-modal-port').value = String(konto ? Number(konto.port) : 587);
    onSmtpPortChange();
    if (konto) {
        document.getElementById('smtp-modal-secure-on').checked = !!konto.secure && Number(konto.port) !== 465;
        document.getElementById('smtp-modal-secure-off').checked = !(!!konto.secure && Number(konto.port) !== 465);
    }
    document.getElementById('smtp-modal-user').value = '';
    document.getElementById('smtp-modal-user').placeholder = konto ? '(unverändert – gespeichert)' : '';
    document.getElementById('smtp-modal-passwort').value = '';
    document.getElementById('smtp-modal-absender-name').value = konto ? konto.absender_name : '';
    document.getElementById('smtp-modal-absender-email').value = konto ? konto.absender_email : '';
    document.getElementById('smtp-modal-standard').checked = konto ? !!konto.ist_standard : false;
    document.getElementById('smtp-modal-klartext').checked = false;
    document.getElementById('smtp-modal-test-ergebnis').classList.add('hidden');

    document.getElementById('smtp-modal-klartext-wrap').classList.add('hidden');
    document.getElementById('smtp-modal-klartext').checked = false;

    const m = document.getElementById('smtp-konto-modal');
    m.classList.remove('hidden');
    m.classList.add('flex');
    document.getElementById('smtp-modal-name').focus();
}

function closeSmtpKontoModal() {
    const m = document.getElementById('smtp-konto-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

function leseSmtpFormular() {
    return {
        id: document.getElementById('smtp-modal-id').value || undefined,
        name: document.getElementById('smtp-modal-name').value.trim(),
        host: document.getElementById('smtp-modal-host').value.trim(),
        port: parseInt(document.getElementById('smtp-modal-port').value, 10),
        secure: document.getElementById('smtp-modal-secure-on').checked,
        user: document.getElementById('smtp-modal-user').value.trim(),
        passwort: document.getElementById('smtp-modal-passwort').value,
        absender_name: document.getElementById('smtp-modal-absender-name').value.trim(),
        absender_email: document.getElementById('smtp-modal-absender-email').value.trim(),
        ist_standard: document.getElementById('smtp-modal-standard').checked,
        klartext_erlaubt: document.getElementById('smtp-modal-klartext').checked
    };
}

async function testSmtpConnectionFromModal() {
    const ergebnisEl = document.getElementById('smtp-modal-test-ergebnis');
    ergebnisEl.classList.remove('hidden', 'bg-green-50', 'text-green-800', 'border-green-300', 'bg-red-50', 'text-red-800', 'border-red-300');
    const btn = document.getElementById('smtp-modal-test-btn') || ergebnisEl.closest('.max-h-\\[90vh\\]').querySelector('button[onclick="testSmtpConnectionFromModal()"]');
    btn.disabled = true;
    try {
        const res = await window.api.testSmtpConnection(leseSmtpFormular());
        if (res.success) {
            ergebnisEl.textContent = `Verbindung erfolgreich – Server meldet: ${res.details}`;
            ergebnisEl.classList.add('bg-green-50', 'text-green-800', 'border', 'border-green-300');
        } else {
            ergebnisEl.textContent = `Fehler: ${res.fehlermeldung}`;
            ergebnisEl.classList.add('bg-red-50', 'text-red-800', 'border', 'border-red-300');
        }
    } catch (e) {
        ergebnisEl.textContent = `Fehler: ${e.message || e}`;
        ergebnisEl.classList.add('bg-red-50', 'text-red-800', 'border', 'border-red-300');
    } finally {
        btn.disabled = false;
    }
}

async function saveSmtpKontoFromModal() {
    try {
        const res = await window.api.saveSmtpKonto(leseSmtpFormular());
        showToast(res && res.success ? 'SMTP-Konto gespeichert.' : 'Unbekannte Antwort beim Speichern.', res && res.success ? 'success' : 'error');
        closeSmtpKontoModal();
        await renderSmtpKonten();
    } catch (e) {
        if (e && /Sichere Speicherung/.test(e.message || '')) {
            document.getElementById('smtp-modal-klartext-wrap').classList.remove('hidden');
            document.getElementById('smtp-modal-klartext-wrap').classList.add('flex');
            showToast('Betriebssystem-Schlüsselspeicher nicht verfügbar. Bitte Option unten wählen.', 'error');
        } else {
            showToast(e.message || 'Speichern fehlgeschlagen.', 'error');
        }
    }
}

async function deleteSmtpKontoMitConfirm(konto) {
    const ok = await safeConfirm(`SMTP-Konto "${konto.name}" wirklich löschen?`, 'Konto löschen');
    if (!ok) return;
    try {
        await window.api.deleteSmtpKonto(konto.id);
        showToast('SMTP-Konto gelöscht.', 'success');
        await renderSmtpKonten();
    } catch (e) {
        showToast(e.message || 'Löschen fehlgeschlagen.', 'error');
    }
}
