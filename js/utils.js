// Format currency
const formatCurrency = (val) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);

// Number animation utility
function animateValue(obj, start, end, duration, isCurrency = false, isPercent = false) {
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = progress * (end - start) + start;
        
        if (isCurrency) {
            obj.innerText = formatCurrency(current);
        } else if (isPercent) {
            obj.innerText = current.toFixed(1).replace('.', ',') + '%';
        } else {
            obj.innerText = Math.floor(current);
        }
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Basic XSS Protection
function sanitize(str) {
    if (str === undefined || str === null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


// --- Datums- & Feiertagsberechnung (Deutsches System & Arbeitstage) ---

function formatDateISO(d) {
    if (!d) return '';
    if (typeof d === 'string') {
        const s = d.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const deMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (deMatch) {
            const day = deMatch[1].padStart(2, '0');
            const month = deMatch[2].padStart(2, '0');
            const year = deMatch[3];
            return `${year}-${month}-${day}`;
        }
        const parsed = new Date(s);
        if (!isNaN(parsed.getTime())) {
            const y = parsed.getFullYear();
            const m = String(parsed.getMonth() + 1).padStart(2, '0');
            const day = String(parsed.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
    }
    if (d instanceof Date && !isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    return '';
}

function formatDateDE(d) {
    const iso = formatDateISO(d);
    if (!iso) return '';
    const parts = iso.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function formatDateDEWithWeekday(d) {
    const iso = formatDateISO(d);
    if (!iso) return '';
    const parts = iso.split('-');
    const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    const wochentage = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    const wochentag = wochentage[dt.getDay()];
    return `${parts[2]}.${parts[1]}.${parts[0]} (${wochentag})`;
}

function parseDateDE(str) {
    return formatDateISO(str);
}

function getOstersonntag(year) {
    // Gauss algorithm for Easter Sunday
    const a = year % 19;
    const b = year % 4;
    const c = year % 7;
    const k = Math.floor(year / 100);
    const p = Math.floor((13 + 8 * k) / 25);
    const q = Math.floor(k / 4);
    const M = (15 - p + k - q) % 30;
    const N = (4 + k - q) % 7;
    const d = (19 * a + M) % 30;
    const e = (2 * b + 4 * c + 6 * d + N) % 7;

    let day = 22 + d + e;
    let month = 3;
    if (day > 31) {
        day = d + e - 9;
        month = 4;
        if (day === 26) day = 19;
        if (day === 25 && d === 28 && e === 6 && a > 10) day = 18;
    }
    return new Date(year, month - 1, day, 12, 0, 0);
}

function getGermanHolidaysMap(year) {
    if (typeof InvoiceController !== 'undefined' && InvoiceController.getGermanHolidaysMap) {
        return InvoiceController.getGermanHolidaysMap(year);
    }
    const y = parseInt(year, 10);
    const map = new Map();
    map.set(`${y}-01-01`, 'Neujahr');
    map.set(`${y}-05-01`, 'Tag der Arbeit');
    map.set(`${y}-10-03`, 'Tag der Deutschen Einheit');
    map.set(`${y}-12-25`, '1. Weihnachtsfeiertag');
    map.set(`${y}-12-26`, '2. Weihnachtsfeiertag');

    const ostern = getOstersonntag(y);
    const addOffset = (days) => {
        const dt = new Date(ostern);
        dt.setDate(dt.getDate() + days);
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${dt.getFullYear()}-${m}-${d}`;
    };

    map.set(addOffset(-2), 'Karfreitag');
    map.set(addOffset(1), 'Ostermontag');
    map.set(addOffset(39), 'Christi Himmelfahrt');
    map.set(addOffset(50), 'Pfingstmontag');
    return map;
}

function getGermanHolidays(year) {
    const holidays = [];
    const map = getGermanHolidaysMap(year);
    for (const iso of map.keys()) {
        const parts = iso.split('-');
        holidays.push(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0).getTime());
    }
    return holidays;
}

function isGermanPublicHoliday(d) {
    const iso = formatDateISO(d);
    if (!iso) return { isHoliday: false, name: null };
    const y = parseInt(iso.substring(0, 4), 10);
    const holidays = getGermanHolidaysMap(y);
    if (holidays.has(iso)) {
        return { isHoliday: true, name: holidays.get(iso) };
    }
    return { isHoliday: false, name: null };
}

function isArbeitstag(d) {
    const iso = formatDateISO(d);
    if (!iso) return false;
    const parts = iso.split('-');
    const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    const dayOfWeek = dt.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return false; // Sa / So
    return !isGermanPublicHoliday(iso).isHoliday;
}

function calculateDueDateWorkingDays(startDate, workingDays = 14) {
    const cleanStart = formatDateISO(startDate) || formatDateISO(new Date());
    const parts = cleanStart.split('-');
    let current = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    let needed = Math.max(0, parseInt(workingDays, 10) || 0);
    let added = 0;

    while (added < needed) {
        current.setDate(current.getDate() + 1);
        const dayOfWeek = current.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        const iso = formatDateISO(current);
        if (isGermanPublicHoliday(iso).isHoliday) continue;
        added++;
    }
    return formatDateISO(current);
}

function countWorkingDaysBetween(startDate, endDate) {
    const startIso = formatDateISO(startDate);
    const endIso = formatDateISO(endDate);
    if (!startIso || !endIso || startIso >= endIso) return 0;

    const startParts = startIso.split('-');
    const endParts = endIso.split('-');
    let current = new Date(parseInt(startParts[0], 10), parseInt(startParts[1], 10) - 1, parseInt(startParts[2], 10), 12, 0, 0);
    const target = new Date(parseInt(endParts[0], 10), parseInt(endParts[1], 10) - 1, parseInt(endParts[2], 10), 12, 0, 0);

    let workingDays = 0;
    while (current < target) {
        current.setDate(current.getDate() + 1);
        const dayOfWeek = current.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        const iso = formatDateISO(current);
        if (isGermanPublicHoliday(iso).isHoliday) continue;
        workingDays++;
    }
    return workingDays;
}

function calculateDeliveryDate() {
    const startInput = document.getElementById('rechnung-datum')?.value;
    const daysInput = parseInt(document.getElementById('rechnung-werktage')?.value, 10);
    const days = (!isNaN(daysInput) && daysInput >= 0) ? daysInput : (parseInt(state?.einstellungen?.zahlungsziel, 10) || 14);

    const resultStr = calculateDueDateWorkingDays(startInput || new Date(), days);
    const faelligEl = document.getElementById('rechnung-faellig');
    if (faelligEl) {
        faelligEl.value = resultStr;
    }
    if (typeof updateRechnungDatePreviews === 'function') {
        updateRechnungDatePreviews();
    }
}

// Toast notification to replace native window.alert that can cause focus locks
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgColor = type === 'error' ? 'bg-red-500' : (type === 'success' ? 'bg-green-500' : 'bg-slate-800');
    toast.className = `${bgColor} text-white px-4 py-3 rounded shadow-lg transform transition-all duration-300 translate-y-full opacity-0 max-w-md pointer-events-auto`;
    toast.innerText = message;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-full', 'opacity-0');
    });

    // Remove after timeout
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-full');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Safe async confirm() replacement using a custom HTML modal.
// This provides a modern UI and avoids focus issues with native OS dialogs.
async function safeConfirm(message, title = 'Bestätigung') {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        const titleEl = document.getElementById('custom-confirm-title');
        const messageEl = document.getElementById('custom-confirm-message');
        const btnOk = document.getElementById('custom-confirm-ok');
        const btnCancel = document.getElementById('custom-confirm-cancel');

        if (!modal || !btnOk || !btnCancel) {
            // Fallback if modal not in DOM
            resolve(confirm(message));
            return;
        }

        titleEl.innerText = title;
        messageEl.innerText = message;

        const handleOk = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            btnOk.removeEventListener('click', handleOk);
            btnCancel.removeEventListener('click', handleCancel);
        };

        btnOk.addEventListener('click', handleOk);
        btnCancel.addEventListener('click', handleCancel);

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // Auto-focus the OK button for accessibility
        btnOk.focus();
    });
}

// Safe async alert() replacement using Electron's native dialog via IPC.
async function safeAlert(message, title = 'Information') {
    if (window.api && window.api.alert) {
        await window.api.alert({ message, title });
    } else {
        alert(message);
    }
}

async function checkOverdueInvoices() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const toUpdate = [];

    for (const rech of state.rechnungen) {
        if (rech.status === 'Ausstehend') {
            const faelligDate = new Date(rech.faellig);
            if (faelligDate < today) {
                rech.status = 'Überfällig';
                toUpdate.push(rech);
            }
        }
    }

    if (toUpdate.length > 0) {
        try {
            // GoBD: Statuswechsel 'Überfällig' auch an gesperrten Belegen -
            // nur über den schmalen Status-Pfad statt komplettem saveDocument.
            for (const rech of toUpdate) {
                await window.api.updateDocumentStatus(rech.id, { status: 'Überfällig' });
                rech.status = 'Überfällig';
            }
            return true;
        } catch (e) {
            console.error('Failed to perform bulk update for overdue invoices:', e);
            return false;
        }
    }

    return false;
}

function isRechnungBezahltOderStorniert(rech, bezahlteNrsSet) {
    if (!rech) return false;
    if (rech.status === 'Bezahlt') return true;
    if (rech.status === 'Storniert') {
        return bezahlteNrsSet.has('STORNO - ' + rech.nr);
    }
    return false;
}

// Helper function to parse CSV line handling quoted fields
function parseCsvLine(text) {
    if (!text.trim()) return [];
    let re_value = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\s\S][^'\\]*)*)'|"([^"\\]*(?:""|[^"\\]*|(?:\\[\s\S]))*)"?|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
    let a = [];
    text.replace(re_value, function (m0, m1, m2, m3) {
        if (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"));
        else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"').replace(/""/g, '"'));
        else if (m3 !== undefined) a.push(m3.trim());
        return '';
    });
    // Handle empty last value
    if (/,\s*$/.test(text)) a.push('');
    return a;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatCurrency,
        sanitize,
        formatDateISO,
        formatDateDE,
        formatDateDEWithWeekday,
        parseDateDE,
        getOstersonntag,
        getGermanHolidaysMap,
        getGermanHolidays,
        isGermanPublicHoliday,
        isArbeitstag,
        calculateDueDateWorkingDays,
        countWorkingDaysBetween,
        calculateDeliveryDate,
        showToast,
        safeConfirm,
        safeAlert,
        isRechnungBezahltOderStorniert
    };
}
