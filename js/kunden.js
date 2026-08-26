// Kunden Rendering
function renderKunden(filterQuery = '') {
    const tbody = document.getElementById('kunden-table-body');
    tbody.innerHTML = '';

    let filtered = state.kunden;
    if (filterQuery) {
        filtered = state.kunden.filter(a => a.name.toLowerCase().includes(filterQuery.toLowerCase()) || a.adresse.toLowerCase().includes(filterQuery.toLowerCase()));
    }

    filtered.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-blue-50/50 transition-colors group border-b border-slate-200 last:border-0';

        const tdNr = document.createElement('td');
        tdNr.className = 'px-4 py-3 align-middle text-slate-500 text-xs font-mono';
        tdNr.textContent = item.kundennummer || '-';
        tr.appendChild(tdNr);

        const tdName = document.createElement('td');
        tdName.className = 'px-4 py-3 font-medium text-slate-800';
        tdName.textContent = item.name;
        tr.appendChild(tdName);

        const tdAddr = document.createElement('td');
        tdAddr.className = 'px-4 py-3 text-slate-600';
        tdAddr.textContent = item.adresse;
        tr.appendChild(tdAddr);

        const tdPlz = document.createElement('td');
        tdPlz.className = 'px-4 py-3 text-slate-600';
        tdPlz.textContent = `${item.plz} ${item.ort || ''}`;
        tr.appendChild(tdPlz);

        const tdTel = document.createElement('td');
        tdTel.className = 'px-4 py-3 text-slate-600';
        tdTel.textContent = item.telefon;
        tr.appendChild(tdTel);

        const tdActions = document.createElement('td');
        tdActions.className = 'px-4 py-3 text-right';

        const btnEdit = document.createElement('button');
        btnEdit.onclick = () => openKundeModal(item.id);
        btnEdit.className = 'text-slate-400 hover:text-primary p-1 mx-1 transition-colors';
        btnEdit.title = 'Bearbeiten';
        const spanEdit = document.createElement('span');
        spanEdit.className = 'material-symbols-outlined text-[18px]';
        spanEdit.textContent = 'edit';
        btnEdit.appendChild(spanEdit);
        tdActions.appendChild(btnEdit);

        const btnDel = document.createElement('button');
        btnDel.onclick = () => deleteKunde(item.id);
        btnDel.className = 'text-slate-400 hover:text-red-500 p-1 mx-1 transition-colors';
        btnDel.title = 'Löschen';
        const spanDel = document.createElement('span');
        spanDel.className = 'material-symbols-outlined text-[18px]';
        spanDel.textContent = 'delete';
        btnDel.appendChild(spanDel);
        tdActions.appendChild(btnDel);

        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });

    // Update KPIs
    let newKundenCount = 0;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    filtered.forEach(k => {
        if (k.createdAt) {
            // SQLite CURRENT_TIMESTAMP is 'YYYY-MM-DD HH:MM:SS' in UTC
            // But JS new Date() handles it reasonably or we can do basic parsing
            const createdDate = new Date(k.createdAt + 'Z'); // Z forces UTC interpretation if it's raw
            if (createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear) {
                newKundenCount++;
            }
        }
    });

    document.getElementById('kpi-total-kunden').innerText = filtered.length;
    const newKundenEl = document.getElementById('kpi-neue-kunden');
    if (newKundenEl) newKundenEl.innerText = newKundenCount;
}

// Search Kunden
document.getElementById('search-kunden')?.addEventListener('input', (e) => {
    renderKunden(e.target.value);
});

// Kunden CRUD functions
function toggleKundeTypeFields() {
    const typeSelect = document.getElementById('kunde-customer-type');
    const b2gFields = document.getElementById('kunde-b2g-fields');
    if (!typeSelect || !b2gFields) return;
    if (typeSelect.value === 'B2G') {
        b2gFields.classList.remove('hidden');
    } else {
        b2gFields.classList.add('hidden');
    }
}

function openKundeModal(id = null) {
    document.getElementById('kunde-modal').classList.remove('hidden');
    if (id) {
        const item = state.kunden.find(a => a.id === id);
        document.getElementById('kunde-modal-title').innerText = 'Kunde bearbeiten';
        document.getElementById('kunde-id').value = item.id;
        document.getElementById('kunde-kundennummer').value = item.kundennummer || '';
        document.getElementById('kunde-name').value = item.name;
        document.getElementById('kunde-adresse').value = item.adresse;
        document.getElementById('kunde-plz').value = item.plz;
        document.getElementById('kunde-ort').value = item.ort || '';
        document.getElementById('kunde-telefon').value = item.telefon;
        document.getElementById('kunde-email').value = item.email || '';
        document.getElementById('kunde-ustid').value = item.ustId || '';
        document.getElementById('kunde-customer-type').value = item.customer_type || 'B2C';
        document.getElementById('kunde-leitweg-id').value = item.leitweg_id || '';
        document.getElementById('kunde-buyer-reference').value = item.buyer_reference || '';
        document.getElementById('kunde-peppol-id').value = item.peppol_id || '';
        document.getElementById('kunde-ist-bauleistender-13b').checked = !!item.ist_bauleistender_13b;
        document.getElementById('kunde-ust-1-tg-gueltig-bis').value = item.ust_1_tg_gueltig_bis || '';
        document.getElementById('kunde-hat-freistellungsbescheinigung').checked = !!item.hat_freistellungsbescheinigung;
        document.getElementById('kunde-freistellung-gueltig-bis').value = item.freistellung_gueltig_bis || '';
        document.getElementById('kunde-ist-subunternehmer').checked = !!item.is_subcontractor;
        document.getElementById('kunde-ist-umsatzsteuerfreie-vermietung').checked = !!item.ist_umsatzsteuerfreie_vermietung;
        document.getElementById('kunde-iban').value = item.iban || '';
        document.getElementById('kunde-bic').value = item.bic || '';
        document.getElementById('kunde-bank-name').value = item.bank_name || '';
        document.getElementById('kunde-kontoinhaber').value = item.kontoinhaber || '';
    } else {
        document.getElementById('kunde-modal-title').innerText = 'Neuer Kunde';
        document.getElementById('kunde-form').reset();
        document.getElementById('kunde-id').value = '';
        document.getElementById('kunde-kundennummer').value = '';
        document.getElementById('kunde-customer-type').value = 'B2C';
        document.getElementById('kunde-leitweg-id').value = '';
        document.getElementById('kunde-buyer-reference').value = '';
        document.getElementById('kunde-peppol-id').value = '';
        document.getElementById('kunde-ist-bauleistender-13b').checked = false;
        document.getElementById('kunde-ust-1-tg-gueltig-bis').value = '';
        document.getElementById('kunde-hat-freistellungsbescheinigung').checked = false;
        document.getElementById('kunde-freistellung-gueltig-bis').value = '';
        document.getElementById('kunde-ist-subunternehmer').checked = false;
        document.getElementById('kunde-ist-umsatzsteuerfreie-vermietung').checked = false;
        document.getElementById('kunde-iban').value = '';
        document.getElementById('kunde-bic').value = '';
        document.getElementById('kunde-bank-name').value = '';
        document.getElementById('kunde-kontoinhaber').value = '';

        const qpContainer = document.getElementById('quick-paste-container');
        if (qpContainer) qpContainer.classList.add('hidden');
        const qpTextarea = document.getElementById('kunde-quick-paste');
        if (qpTextarea) qpTextarea.value = '';
    }

    toggleKundeTypeFields();

    const doFocus = async () => {
        try {
            if (window.api && window.api.focusWindow) {
                await window.api.focusWindow();
            }
        } catch (e) { /* ignore */ }
        requestAnimationFrame(() => {
            const nameInput = document.getElementById('kunde-name');
            if (nameInput) {
                nameInput.focus();
                nameInput.select();
            }
        });
    };

    doFocus();
    setTimeout(doFocus, 200);
    setTimeout(doFocus, 500);
}
function closeKundeModal() {
    document.getElementById('kunde-modal').classList.add('hidden');
}

async function saveKunde() {
    const id = document.getElementById('kunde-id').value;
    const kundennummer = document.getElementById('kunde-kundennummer').value;
    const name = document.getElementById('kunde-name').value;
    const adresse = document.getElementById('kunde-adresse').value;
    const plz = document.getElementById('kunde-plz').value;
    const ort = document.getElementById('kunde-ort').value;
    const telefon = document.getElementById('kunde-telefon').value;
    const email = document.getElementById('kunde-email').value;
    const ustId = document.getElementById('kunde-ustid').value;
    const customer_type = document.getElementById('kunde-customer-type').value;
    const leitweg_id = document.getElementById('kunde-leitweg-id').value;
    const buyer_reference = document.getElementById('kunde-buyer-reference').value;
    const peppol_id = document.getElementById('kunde-peppol-id').value;
    const ist_bauleistender_13b = document.getElementById('kunde-ist-bauleistender-13b').checked ? 1 : 0;
    const ust_1_tg_gueltig_bis = document.getElementById('kunde-ust-1-tg-gueltig-bis').value;
    const hat_freistellungsbescheinigung = document.getElementById('kunde-hat-freistellungsbescheinigung').checked ? 1 : 0;
    const freistellung_gueltig_bis = document.getElementById('kunde-freistellung-gueltig-bis').value;
    const is_subcontractor = document.getElementById('kunde-ist-subunternehmer').checked ? 1 : 0;
    const ist_umsatzsteuerfreie_vermietung = document.getElementById('kunde-ist-umsatzsteuerfreie-vermietung').checked ? 1 : 0;
    const iban = document.getElementById('kunde-iban').value.trim();
    const bic = document.getElementById('kunde-bic').value.trim();
    const bank_name = document.getElementById('kunde-bank-name').value.trim();
    const kontoinhaber = document.getElementById('kunde-kontoinhaber').value.trim();

    if (!name || !adresse || !plz || !ort) {
        showToast('Bitte füllen Sie alle erforderlichen Felder aus.', 'error');
        return;
    }

    const bestand = id ? (state.kunden || []).find(k => k.id === parseInt(id)) : null;

    const kundeData = { kundennummer, name, adresse, plz, ort, telefon, email, ustId, customer_type, leitweg_id, buyer_reference, peppol_id, ist_bauleistender_13b, ust_1_tg_gueltig_bis, hat_freistellungsbescheinigung, freistellung_gueltig_bis, is_subcontractor, sec48b_valid_until: freistellung_gueltig_bis || null, ist_umsatzsteuerfreie_vermietung, iban, bic, bank_name, kontoinhaber };

    if (id) {
        kundeData.id = parseInt(id);
        if (!iban && bestand) kundeData.iban = bestand.iban || '';
        if (!bic && bestand) kundeData.bic = bestand.bic || '';
        if (!bank_name && bestand) kundeData.bank_name = bestand.bank_name || '';
        if (!kontoinhaber && bestand) kundeData.kontoinhaber = bestand.kontoinhaber || '';
    }

    try {
        const savedId = await window.api.saveKunde(kundeData);

        // Fetch new state to get the DB-generated Kundennummer
        const newState = await window.api.getFullState();
        state.kunden = newState.kunden;

        closeKundeModal();
        renderKunden();
    } catch (e) {
        console.error('Kunde save error:', e);
        showToast('Fehler beim Speichern!', 'error');
    }
}

async function deleteKunde(id) {
    if (await safeConfirm('Möchten Sie diesen Kunden wirklich löschen?')) {
        try {
            await window.api.deleteKunde(id);
            const index = state.kunden.findIndex(a => a.id === id);
            if (index !== -1) {
                state.kunden.splice(index, 1);
            }
            renderKunden();
        } catch (e) {
            console.error('Delete Kunde error:', e);
            showToast('Fehler beim Löschen!', 'error');
        }
    }
}

// Export Kunden to CSV
function exportKundenCsv() {
    if (!state.kunden || state.kunden.length === 0) {
        showToast('Keine Kunden zum Exportieren vorhanden.', 'error');
        return;
    }

    // Define CSV headers
    const headers = ['Kundennummer', 'Name', 'Adresse', 'PLZ', 'Ort', 'Telefon', 'Email', 'USt-IdNr'];

    // Convert data to CSV rows
    const rows = state.kunden.map(k => {
        const name = `"${(k.name || '').replace(/"/g, '""')}"`;
        const adresse = `"${(k.adresse || '').replace(/"/g, '""')}"`;
        const ort = `"${(k.ort || '').replace(/"/g, '""')}"`;
        return `${k.kundennummer || ''},${name},${adresse},${k.plz || ''},${ort},${k.telefon || ''},${k.email || ''},${k.ustId || ''}`;
    });

    const csvContent = "data:text/csv;charset=utf-8,"
        + headers.join(',') + "\n"
        + rows.join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "kunden_export.csv");
    document.body.appendChild(link); 

    link.click();
    document.body.removeChild(link);
}

// Import Kunden from CSV
function importKundenCsv(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        const content = e.target.result;
        const lines = content.split(/\r\n|\n/);

        if (lines.length <= 1) {
            showToast('Die CSV-Datei scheint leer zu sein oder hat das falsche Format.', 'error');
            event.target.value = '';
            return;
        }

        const kundenToSave = [];
        let failedCount = 0;

        // Start reading from line 1 (skip header line 0)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const row = parseCsvLine(line);

            // Expected columns: Kundennummer, Name, Adresse, PLZ, Ort, Telefon, Email, USt-IdNr
            if (row.length >= 2) {
                const knr = row[0].trim();
                const name = row[1].trim();
                const adresse = row[2] ? row[2].trim() : '';
                const plz = row[3] ? row[3].trim() : '';
                const ort = row[4] ? row[4].trim() : '';
                const telefon = row[5] ? row[5].trim() : '';
                const email = row[6] ? row[6].trim() : '';
                const ustId = row[7] ? row[7].trim() : '';

                if (name) {
                    const kundeData = { 
                        kundennummer: knr || null,
                        name, 
                        adresse, 
                        plz, 
                        ort, 
                        telefon, 
                        email, 
                        ustId 
                    };

                    // Check if an item with the same name or customer number already exists for update
                    const existingKunde = state.kunden.find(k => (knr && k.kundennummer === knr) || k.name === name);
                    if (existingKunde) {
                        kundeData.id = existingKunde.id;
                    }
                    
                    kundenToSave.push(kundeData);
                } else {
                    failedCount++;
                }
            } else {
                failedCount++;
            }
        }

        if (kundenToSave.length > 0) {
            try {
                await window.api.bulkSaveKunden(kundenToSave);
                
                // Refresh state
                const newState = await window.api.getFullState();
                state.kunden = newState.kunden;
                
                const importedCount = kundenToSave.filter(k => !k.id).length;
                const updatedCount = kundenToSave.filter(k => k.id).length;

                const msg = `Import abgeschlossen:\n${importedCount} neu hinzugefügt\n${updatedCount} aktualisiert\n${failedCount} fehlgeschlagen`;
                showToast(msg, failedCount > 0 ? 'warning' : 'success');
                
                renderKunden();
            } catch (err) {
                console.error('Bulk save kunden error:', err);
                showToast('Fehler beim Speichern der importierten Kunden.', 'error');
            }
        } else {
            showToast('Keine gültigen Kunden zum Importieren gefunden.', 'error');
        }
        
        event.target.value = ''; // Reset input
    };

    reader.onerror = function () {
        showToast('Fehler beim Lesen der Datei.', 'error');
        event.target.value = '';
    };

    reader.readAsText(file);
}

// Toggle Quick Paste Section
function toggleQuickPaste() {
    const container = document.getElementById('quick-paste-container');
    const textarea = document.getElementById('kunde-quick-paste');
    container.classList.toggle('hidden');
    if (!container.classList.contains('hidden')) {
        textarea.value = '';
        textarea.focus();
    }
}

// Process Multiline Paste Text
function processQuickPaste(text) {
    if (!text.trim()) return;

    const lines = text.split(/\r\n|\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    // Mapping based on user requirement:
    // Line 1: Name
    // Line 2: Adresse
    // Line 3: PLZ Ort (Split by space)
    // Line 4: Telefon
    // Line 5: Email
    // Line 6: Ust-IdNr

    if (lines[0]) document.getElementById('kunde-name').value = lines[0];
    if (lines[1]) document.getElementById('kunde-adresse').value = lines[1];
    
    if (lines[2]) {
        // Match 5 digits for PLZ and the rest for Ort
        const plzOrtMatch = lines[2].match(/^(\d{5})\s+(.+)$/);
        if (plzOrtMatch) {
            document.getElementById('kunde-plz').value = plzOrtMatch[1];
            document.getElementById('kunde-ort').value = plzOrtMatch[2];
        } else {
            // If it's all digits (even fewer than 5), put it in PLZ
            if (/^\d+$/.test(lines[2])) {
                document.getElementById('kunde-plz').value = lines[2];
                document.getElementById('kunde-ort').value = '';
            } else {
                // Fallback: split by first space if available
                const firstSpaceIndex = lines[2].indexOf(' ');
                if (firstSpaceIndex !== -1) {
                    document.getElementById('kunde-plz').value = lines[2].substring(0, firstSpaceIndex);
                    document.getElementById('kunde-ort').value = lines[2].substring(firstSpaceIndex + 1);
                } else {
                    // If it's not pure digits and has no space, assume it's the Ort
                    document.getElementById('kunde-ort').value = lines[2];
                    document.getElementById('kunde-plz').value = '';
                }
            }
        }
    }

    if (lines[3]) document.getElementById('kunde-telefon').value = lines[3];
    if (lines[4]) document.getElementById('kunde-email').value = lines[4];
    if (lines[5]) document.getElementById('kunde-ustid').value = lines[5];
}
