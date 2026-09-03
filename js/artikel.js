// Render Artikel Table
function renderArtikel(filterQuery = '') {
    const tbody = document.getElementById('artikel-table-body');
    tbody.innerHTML = '';

    let filtered = state.artikel;
    if (filterQuery) {
        filtered = state.artikel.filter(a => a.name.toLowerCase().includes(filterQuery.toLowerCase()));
    }

    let totalValue = 0;

    filtered.forEach(item => {
        totalValue += (item.ek || 0) * (item.bestand || 0);
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-blue-50/50 transition-colors group border-b border-slate-200 last:border-0';

        // Image cell
        const tdImg = document.createElement('td');
        tdImg.className = 'px-4 py-3 text-center';
        if (item.bilder && item.bilder.length > 0) {
            const img = document.createElement('img');
            img.src = item.bilder[0];
            img.className = 'w-8 h-8 rounded object-cover mx-auto ring-1 ring-slate-200';
            tdImg.appendChild(img);
        } else {
            const div = document.createElement('div');
            div.className = 'w-8 h-8 rounded bg-slate-100 text-slate-400 flex items-center justify-center mx-auto border border-slate-200';
            const span = document.createElement('span');
            span.className = 'material-symbols-outlined text-[16px]';
            span.textContent = 'image';
            div.appendChild(span);
            tdImg.appendChild(div);
        }
        tr.appendChild(tdImg);

        const tdId = document.createElement('td');
        tdId.className = 'px-4 py-3 align-middle text-slate-500 text-xs font-mono';
        tdId.textContent = `#${item.id}`;
        tr.appendChild(tdId);

        const tdName = document.createElement('td');
        tdName.className = 'px-4 py-3 font-medium text-slate-800';
        tdName.textContent = item.name;
        tr.appendChild(tdName);

        const tdKat = document.createElement('td');
        tdKat.className = 'px-4 py-3 text-slate-600 text-xs font-medium';
        tdKat.textContent = item.katalog || '-';
        tr.appendChild(tdKat);

        const tdBestand = document.createElement('td');
        tdBestand.className = 'px-4 py-3 text-right font-mono ' + (item.bestand < 5 ? 'text-amber-500 font-bold' : 'text-slate-600');
        tdBestand.textContent = `${item.bestand !== undefined ? item.bestand : 0} Stk.`;
        tr.appendChild(tdBestand);

        const tdVk = document.createElement('td');
        tdVk.className = 'px-4 py-3 text-right font-medium text-slate-800';
        tdVk.textContent = formatCurrency(item.vk);
        tr.appendChild(tdVk);

        const tdActions = document.createElement('td');
        tdActions.className = 'px-4 py-3 text-right';

        const btnEdit = document.createElement('button');
        btnEdit.onclick = () => openArtikelModal(item.id);
        btnEdit.className = 'text-slate-400 hover:text-primary p-1 mx-1 transition-colors';
        btnEdit.title = 'Bearbeiten';
        const spanEdit = document.createElement('span');
        spanEdit.className = 'material-symbols-outlined text-[18px]';
        spanEdit.textContent = 'edit';
        btnEdit.appendChild(spanEdit);
        tdActions.appendChild(btnEdit);

        const btnDel = document.createElement('button');
        btnDel.onclick = () => deleteArtikel(item.id);
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
    const lowStockCount = filtered.filter(a => a.bestand < 5).length;
    document.getElementById('kpi-total-items').innerText = filtered.length;
    document.getElementById('kpi-total-value').innerText = formatCurrency(totalValue);
    const lowStockEl = document.getElementById('kpi-low-stock');
    if (lowStockEl) lowStockEl.innerText = lowStockCount;
}

// Search
document.getElementById('search-artikel')?.addEventListener('input', (e) => {
    renderArtikel(e.target.value);
});

// CRUD functions
let currentArtikelBilder = [];

function renderArtikelBilderPreview() {
    const container = document.getElementById('artikel-bilder-container');
    const uploadBtn = document.getElementById('artikel-bilder-upload-btn');
    if (container) container.innerHTML = '';

    currentArtikelBilder.forEach((bildSrc, index) => {
        const div = document.createElement('div');
        div.className = 'w-full aspect-square rounded overflow-hidden relative group ring-1 ring-slate-200';

        const img = document.createElement('img');
        img.src = bildSrc;
        img.className = 'w-full h-full object-cover';
        div.appendChild(img);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.onclick = (e) => removeArtikelBild(index, e);
        btn.className = 'absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity';

        const span = document.createElement('span');
        span.className = 'material-symbols-outlined text-[12px] block';
        span.textContent = 'close';
        btn.appendChild(span);

        div.appendChild(btn);
        container.appendChild(div);
    });

    if (currentArtikelBilder.length >= 4) {
        if (uploadBtn) uploadBtn.classList.add('hidden');
    } else {
        if (uploadBtn) uploadBtn.classList.remove('hidden');
    }
}

function removeArtikelBild(index, event) {
    if (event) event.stopPropagation();
    currentArtikelBilder.splice(index, 1);
    renderArtikelBilderPreview();
}

function handleArtikelBildUpload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    // Remaining slots
    const slotsAvailable = 4 - currentArtikelBilder.length;
    const filesToProcess = files.slice(0, slotsAvailable);

    filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onload = function (e) {
            currentArtikelBilder.push(e.target.result);
            renderArtikelBilderPreview();
        };
        reader.readAsDataURL(file);
    });

    // Clear input
    event.target.value = '';
}

function openArtikelModal(id = null) {
    document.getElementById('artikel-modal').classList.remove('hidden');

    if (id) {
        const item = state.artikel.find(a => a.id === id);
        currentArtikelBilder = item.bilder ? [...item.bilder] : [];

        document.getElementById('modal-title').innerText = 'Artikel bearbeiten';
        document.getElementById('artikel-id').value = item.id;
        document.getElementById('artikel-name').value = item.name;
        document.getElementById('artikel-ean').value = item.ean || '';
        
        const ekField = document.getElementById('artikel-ek');
        const vkField = document.getElementById('artikel-vk');
        ekField.value = item.ek;
        vkField.value = item.vk;
        ekField.disabled = false;
        vkField.disabled = false;
        
        document.getElementById('artikel-mwst').value = item.mwst;
        document.getElementById('artikel-katalog').value = item.katalog || '';
        document.getElementById('artikel-lieferant').value = item.lieferant || '';
        document.getElementById('artikel-bestand').value = item.bestand !== undefined ? item.bestand : 0;
        document.getElementById('artikel-beschreibung').value = item.beschreibung || '';
        document.getElementById('artikel-ist-bauleistung').checked = !!item.ist_bauleistung;
        document.getElementById('artikel-kostenart').value = item.kostenart || 'MATERIAL';
        document.getElementById('artikel-lohnanteil').value = item.lohnanteil_prozent || 0;

        renderArtikelBilderPreview();
    } else {
        currentArtikelBilder = [];
        document.getElementById('modal-title').innerText = 'Neuer Artikel';
        document.getElementById('artikel-form').reset();
        document.getElementById('artikel-id').value = '';
        // defaults
        document.getElementById('artikel-bestand').value = 0;
        document.getElementById('artikel-ist-bauleistung').checked = false;
        document.getElementById('artikel-kostenart').value = 'MATERIAL';
        document.getElementById('artikel-lohnanteil').value = 0;

        renderArtikelBilderPreview();
    }

    // Robust focus: first ensure webContents has OS-level focus, then focus the input
    const doFocus = async () => {
        try {
            if (window.api && window.api.focusWindow) {
                await window.api.focusWindow();
            }
        } catch (e) { /* ignore */ }
        requestAnimationFrame(() => {
            const nameInput = document.getElementById('artikel-name');
            if (nameInput) {
                nameInput.focus();
                nameInput.select();
            }
        });
    };
    setTimeout(doFocus, 200);
    setTimeout(doFocus, 450);
}

function closeArtikelModal() {
    document.getElementById('artikel-modal').classList.add('hidden');
}

async function saveArtikel() {
    const id = document.getElementById('artikel-id').value;
    const name = document.getElementById('artikel-name').value;
    const ean = document.getElementById('artikel-ean').value;
    const beschreibung = document.getElementById('artikel-beschreibung').value;
    const ek = parseFloat(document.getElementById('artikel-ek').value);
    const vk = parseFloat(document.getElementById('artikel-vk').value);
    const mwst = parseInt(document.getElementById('artikel-mwst').value);
    const katalog = document.getElementById('artikel-katalog').value;
    const lieferant = document.getElementById('artikel-lieferant').value;
    const bestand = parseInt(document.getElementById('artikel-bestand').value) || 0;
    const ist_bauleistung = document.getElementById('artikel-ist-bauleistung').checked ? 1 : 0;
    const kostenart = document.getElementById('artikel-kostenart').value;
    const lohnanteil_prozent = parseFloat(document.getElementById('artikel-lohnanteil').value) || 0;
    const bilder = [...currentArtikelBilder];

    if (!name || isNaN(ek) || isNaN(vk) || isNaN(bestand)) {
        showToast('Bitte füllen Sie alle erforderlichen Felder korrekt aus.', 'error');
        return;
    }

    if (ek < 0 || vk < 0) {
        showToast('Einkaufs- und Verkaufspreis dürfen nicht negativ sein.', 'error');
        return;
    }

    const artikelData = { name, ean, beschreibung, ek, vk, mwst, katalog, lieferant, bestand, bilder, ist_bauleistung, kostenart, lohnanteil_prozent };

    if (id) {
        artikelData.id = parseInt(id);
    }

    try {
        await window.api.saveArtikel(artikelData);

        // Refresh state
        const newState = await window.api.getFullState();
        state.artikel = newState.artikel;

        closeArtikelModal();
        renderArtikel();
        showToast('Artikel erfolgreich gespeichert.', 'success');
    } catch (e) {
        console.error('Error saving artikel:', e);
        showToast('Fehler beim Speichern des Artikels.', 'error');
    }
}

async function deleteArtikel(id) {
    if (await safeConfirm('Möchten Sie diesen Artikel wirklich löschen?')) {
        try {
            await window.api.deleteArtikel(id);
            const index = state.artikel.findIndex(a => a.id === id);
            if (index !== -1) {
                state.artikel.splice(index, 1);
            }
            renderArtikel();
            showToast('Artikel gelöscht.', 'success');
        } catch (e) {
            console.error('Error deleting artikel:', e);
            showToast('Fehler beim Löschen des Artikels.', 'error');
        }
    }
}

// Export Artikel to CSV
function exportArtikelCsv() {
    if (!state.artikel || state.artikel.length === 0) {
        showToast('Keine Artikel zum Exportieren vorhanden.', 'error');
        return;
    }

    // Define CSV headers
    const headers = ['ID', 'Artikelname', 'EK-Preis', 'VK-Preis', 'MwSt'];

    // Convert data to CSV rows
    const rows = state.artikel.map(a => {
        // Escape quotes in strings
        const name = `"${a.name.replace(/"/g, '""')}"`;
        // Format numbers for CSV (optional: using local format but standard dot works better for parsers, 
        // here we use string literal to avoid issues)
        return `${a.id},${name},${a.ek},${a.vk},${a.mwst}`;
    });

    const csvContent = "data:text/csv;charset=utf-8,"
        + headers.join(',') + "\n"
        + rows.join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "artikel_export.csv");
    document.body.appendChild(link); // Required for FF

    link.click();
    document.body.removeChild(link);
}

// Import Artikel from CSV
function importArtikelCsv(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const content = e.target.result;
        const lines = content.split(/\r\n|\n/);

        if (lines.length <= 1) {
            showToast('Die CSV-Datei scheint leer zu sein oder hat das falsche Format.', 'error');
            event.target.value = ''; // Reset input
            return;
        }

        let importedCount = 0;
        let updatedCount = 0; // Assuming this variable is intended to be used based on the diff
        let failedCount = 0;  // Assuming this variable is intended to be used based on the diff

        // Start reading from line 1 (skip header line 0)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Simple CSV parser handling quotes
            const row = parseCsvLine(line);

            // Expected columns: ID, Artikelname, EK-Preis, VK-Preis, MwSt
            if (row.length >= 5) {
                const name = row[1].trim();
                let ek = parseFloat(row[2].replace(',', '.'));
                let vk = parseFloat(row[3].replace(',', '.'));
                let mwst = parseInt(row[4]);

                // Basic validation
                if (name && !isNaN(ek) && !isNaN(vk)) {
                    if (isNaN(mwst)) mwst = 19; // Default if parsing fails

                    // Check if an item with the same name already exists (simplified update logic)
                    const existingItemIndex = state.artikel.findIndex(a => a.name === name);
                    if (existingItemIndex !== -1) {
                        // Update existing item
                        state.artikel[existingItemIndex] = {
                            ...state.artikel[existingItemIndex], // Keep existing properties
                            name: name,
                            ek: ek,
                            vk: vk,
                            mwst: mwst
                        };
                        updatedCount++;
                    } else {
                        // Add new item
                        state.artikel.push({
                            id: state.nextArtikelId++,
                            name: name,
                            ek: ek,
                            vk: vk,
                            mwst: mwst
                        });
                        importedCount++;
                    }
                } else {
                    failedCount++;
                }
            } else {
                failedCount++;
            }
        }

        const msg = `Import abgeschlossen:\n${importedCount} erfolgreich hinzugefügt\n${updatedCount} aktualisiert\n${failedCount} fehlgeschlagen`;
        showToast(msg, failedCount > 0 ? 'error' : 'success');

        renderArtikel();
        event.target.value = ''; // Reset input so same file can be selected again
    };

    reader.onerror = function () {
        showToast('Fehler beim Lesen der Datei.', 'error');
        event.target.value = '';
    };

    reader.readAsText(file);
}

