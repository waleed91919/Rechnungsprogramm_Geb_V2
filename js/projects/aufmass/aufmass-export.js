/**
 * aufmass-export.js — DA11/X31 Im- & Export + GAEB-Upload (Renderer).
 *
 * Alle Funktionen laufen über typisierte window.api-Kanäle (preload → main/ipc),
 * nie direkt auf DB/SQL. Nach jedem Import: Reload-Read der Blätterliste,
 * damit der Strang (Aufmaß → Abschlag/Schluss) ohne Abtippen weiterläuft.
 */
(function(global) {
'use strict';

function __pId() {
    return (typeof window !== 'undefined' && window.currentViewProjektId) || null;
}

function __toast(msg, type) {
    try {
        if (typeof showToast === 'function') showToast(msg, type || 'info');
        else if (type === 'error') console.error(msg);
        else console.log(msg);
    } catch (_e) { /* Toast optional */ }
}

function __refreshBlaetter() {
    try {
        if (typeof loadProjektAufmassBlaetter === 'function') loadProjektAufmassBlaetter();
    } catch (_e) { /* Liste optional */ }
}

async function exportProjektDA11() {
    const pId = __pId();
    if (!pId) { __toast('Kein Projekt gewählt.', 'error'); return; }
    if (!window.api || !window.api.exportDA11) { __toast('DA11-Export ist nicht verfügbar.', 'error'); return; }
    try {
        const res = await window.api.exportDA11(pId);
        if (res && res.success) __toast(`DA11 exportiert: ${res.filePath || ''}`, 'success');
        else if (!(res && res.cancelled)) __toast('DA11-Export abgebrochen.', 'warning');
    } catch (e) {
        console.error('DA11-Export fehlgeschlagen:', e);
        __toast('DA11-Export fehlgeschlagen: ' + (e.message || e), 'error');
    }
}

async function exportProjektGAEBX31() {
    const pId = __pId();
    if (!pId) { __toast('Kein Projekt gewählt.', 'error'); return; }
    if (!window.api || !window.api.exportGAEBX31) { __toast('X31-Export ist nicht verfügbar.', 'error'); return; }
    try {
        const res = await window.api.exportGAEBX31(pId);
        if (res && res.success) __toast(`X31 exportiert: ${res.filePath || ''}`, 'success');
        else if (!(res && res.cancelled)) __toast('X31-Export abgebrochen.', 'warning');
    } catch (e) {
        console.error('X31-Export fehlgeschlagen:', e);
        __toast('X31-Export fehlgeschlagen: ' + (e.message || e), 'error');
    }
}

async function importProjektGAEBX31() {
    const pId = __pId();
    if (!pId) { __toast('Kein Projekt gewählt.', 'error'); return; }
    if (!window.api || !window.api.importGAEBX31) { __toast('X31-Import ist nicht verfügbar.', 'error'); return; }
    try {
        const res = await window.api.importGAEBX31(pId);
        if (res && res.success) {
            __toast(`${res.sheetsCreated || 0} Blätter, ${res.zeilenCreated || 0} Zeilen importiert (DRAFT — vor Abrechnung freigeben).`, 'success');
            __refreshBlaetter();
        } else if (!(res && res.cancelled)) {
            __toast('X31-Import: keine Daten übernommen.', 'warning');
        }
    } catch (e) {
        console.error('X31-Import fehlgeschlagen:', e);
        __toast('X31-Import fehlgeschlagen: ' + (e.message || e), 'error');
    }
}

/**
 * DA11-Import (REB 23.003): Datei wählen → Blätter+Zeilen als DRAFT anlegen.
 * OZ-Match gegen LV läuft normalisiert (mit/ohne Punkte), Freigabe der Blätter
 * danach per verifyAufmassBlatt — erst dann fließt das Aufmaß in Abschlag/Schluss.
 */
async function importProjektDA11() {
    const pId = __pId();
    if (!pId) { __toast('Kein Projekt gewählt.', 'error'); return; }
    if (!window.api || !window.api.importDA11) { __toast('DA11-Import ist nicht verfügbar.', 'error'); return; }
    try {
        const res = await window.api.importDA11(pId);
        if (res && res.success) {
            __toast(`DA11 importiert: ${res.sheetsCreated || 0} Blätter, ${res.zeilenCreated || 0} Zeilen (DRAFT — vor Abrechnung freigeben).`, 'success');
            __refreshBlaetter();
        } else if (!(res && res.cancelled)) {
            __toast('DA11-Import: keine Daten übernommen.', 'warning');
        }
    } catch (e) {
        console.error('DA11-Import fehlgeschlagen:', e);
        __toast('DA11-Import fehlgeschlagen: ' + (e.message || e), 'error');
    }
}

/**
 * GAEB-X83-Dropzone (Projekt-Tab): Datei einlesen → im Renderer parsen
 * (GAEBEngine.parseGAEBXML) → atomar speichern → Bepreisungs-Modal öffnen.
 * Kein Abtippen von LV-Positionen: Der Strang beginnt hier.
 */
async function handleGAEBFileUpload(event) {
    try {
        const input = (event && event.target) || document.getElementById('gaeb-file-input');
        const file = input && input.files && input.files[0];
        if (!file) return;
        if (!window.api || !window.api.saveGaebImport) {
            __toast('GAEB-Import ist nicht verfügbar.', 'error');
            return;
        }
        const parseFn = (typeof GAEBEngine !== 'undefined' && GAEBEngine.parseGAEBXML)
            ? GAEBEngine.parseGAEBXML.bind(GAEBEngine)
            : (global.GAEBEngine && global.GAEBEngine.parseGAEBXML
                ? global.GAEBEngine.parseGAEBXML.bind(global.GAEBEngine) : null);
        if (!parseFn) {
            __toast('GAEB-Parser nicht geladen. Bitte Import über das GAEB-Modul starten.', 'error');
            return;
        }
        const text = await file.text();
        let parsed;
        try {
            parsed = parseFn(text);
        } catch (parseErr) {
            __toast('GAEB-Datei ungültig: ' + (parseErr.message || parseErr), 'error');
            return;
        }
        const res = await window.api.saveGaebImport(parsed, { fileName: file.name, rawXml: text.slice(0, 2000000) });
        const importId = (res && (res.importId || res.id)) || null;
        __toast(`GAEB-Ausschreibung importiert (${(parsed.items || []).length} Positionen).`, 'success');
        if (input) input.value = '';
        try {
            if (typeof openGaebTenderModal === 'function' && importId) openGaebTenderModal(importId);
            else if (typeof openGaebTenderModal === 'function') openGaebTenderModal();
        } catch (_e) { /* Modal optional */ }
    } catch (e) {
        console.error('GAEB-Upload fehlgeschlagen:', e);
        __toast('GAEB-Upload fehlgeschlagen: ' + (e.message || e), 'error');
    }
}

/**
 * Rendert GAEB-Positionen eines Imports in die Split-View-Tabelle
 * (Fallback, wenn die Detail-Ansicht direkt angesteuert wird).
 */
async function renderGAEBPositionsTable(importId, items) {
    try {
        const tbody = document.getElementById('split-positions-body');
        if (!tbody) return;
        let rows = Array.isArray(items) ? items : null;
        if (!rows && importId && window.api && window.api.loadGaebImport) {
            const imp = await window.api.loadGaebImport(importId);
            rows = (imp && (imp.items || imp.positionen)) || [];
        }
        if (!rows) return;
        const esc = (s) => String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        tbody.innerHTML = rows.map((it) => `
            <tr>
                <td class="px-3 py-2 font-mono">${esc(it.path_oz || it.oz_code || '')}</td>
                <td class="px-3 py-2">${esc(it.short_text || it.name || it.kurztext || '')}</td>
                <td class="px-3 py-2 text-right">${esc(it.menge !== undefined ? it.menge : '')}</td>
                <td class="px-3 py-2 text-right text-slate-400">—</td>
            </tr>`).join('');
        const empty = document.getElementById('split-positions-empty');
        if (empty) empty.style.display = rows.length > 0 ? 'none' : '';
        const count = document.getElementById('split-pos-count');
        if (count) count.textContent = `${rows.length} Pos.`;
    } catch (e) {
        console.error('GAEB-Tabelle konnte nicht gerendert werden:', e);
    }
}

global.handleGAEBFileUpload = handleGAEBFileUpload;
global.renderGAEBPositionsTable = renderGAEBPositionsTable;
global.exportProjektDA11 = exportProjektDA11;
global.exportProjektGAEBX31 = exportProjektGAEBX31;
global.importProjektGAEBX31 = importProjektGAEBX31;
global.importProjektDA11 = importProjektDA11;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handleGAEBFileUpload,
        renderGAEBPositionsTable,
        exportProjektDA11,
        exportProjektGAEBX31,
        importProjektGAEBX31,
        importProjektDA11
    };
}
})(typeof window !== 'undefined' ? window : this);
