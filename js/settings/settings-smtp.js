(function() {
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


    if (typeof window !== 'undefined') window.renderSmtpKonten = renderSmtpKonten;
    if (typeof window !== 'undefined') window.setzeStandardKonto = setzeStandardKonto;
    if (typeof window !== 'undefined') window.onSmtpPortChange = onSmtpPortChange;
    if (typeof window !== 'undefined') window.openSmtpKontoModal = openSmtpKontoModal;
    if (typeof window !== 'undefined') window.closeSmtpKontoModal = closeSmtpKontoModal;
    if (typeof window !== 'undefined') window.leseSmtpFormular = leseSmtpFormular;
    if (typeof window !== 'undefined') window.testSmtpConnectionFromModal = testSmtpConnectionFromModal;
    if (typeof window !== 'undefined') window.saveSmtpKontoFromModal = saveSmtpKontoFromModal;
    if (typeof window !== 'undefined') window.deleteSmtpKontoMitConfirm = deleteSmtpKontoMitConfirm;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { renderSmtpKonten, setzeStandardKonto, onSmtpPortChange, openSmtpKontoModal, closeSmtpKontoModal, leseSmtpFormular, testSmtpConnectionFromModal, saveSmtpKontoFromModal, deleteSmtpKontoMitConfirm };
    }
})();
