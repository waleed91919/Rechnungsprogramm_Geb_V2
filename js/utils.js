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


// --- Feiertagsberechnung (Holiday Engine) ---
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
    return new Date(year, month - 1, day);
}

function getGermanHolidays(year) {
    const holidays = [];
    // Fixed
    holidays.push(new Date(year, 0, 1).getTime()); // Neujahr
    holidays.push(new Date(year, 4, 1).getTime()); // Tag der Arbeit
    holidays.push(new Date(year, 9, 3).getTime()); // Tag der Deutschen Einheit
    holidays.push(new Date(year, 11, 25).getTime()); // 1. Weihnachtsfeiertag
    holidays.push(new Date(year, 11, 26).getTime()); // 2. Weihnachtsfeiertag

    // Dynamic (Easter based)
    const ostern = getOstersonntag(year);

    const karfreitag = new Date(ostern);
    karfreitag.setDate(ostern.getDate() - 2);
    holidays.push(karfreitag.getTime());

    const ostermontag = new Date(ostern);
    ostermontag.setDate(ostern.getDate() + 1);
    holidays.push(ostermontag.getTime());

    const himmelfahrt = new Date(ostern);
    himmelfahrt.setDate(ostern.getDate() + 39);
    holidays.push(himmelfahrt.getTime());

    const pfingstmontag = new Date(ostern);
    pfingstmontag.setDate(ostern.getDate() + 50);
    holidays.push(pfingstmontag.getTime());

    return holidays;
}

function calculateDeliveryDate() {
    const startInput = document.getElementById('rechnung-datum').value;
    const daysInput = parseInt(document.getElementById('rechnung-werktage').value) || 0;

    if (!startInput || daysInput <= 0) return;

    let current = new Date(startInput);
    let addedDays = 0;

    let currentYear = current.getFullYear();
    let holidays = getGermanHolidays(currentYear);

    while (addedDays < daysInput) {
        current.setDate(current.getDate() + 1);

        if (current.getFullYear() !== currentYear) {
            currentYear = current.getFullYear();
            holidays = getGermanHolidays(currentYear);
        }

        // Check if weekend (0=Sun, 6=Sat)
        const dayOfWeek = current.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        // Check if holiday
        const currentMidnight = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
        if (holidays.includes(currentMidnight)) continue;

        addedDays++;
    }

    const resultStr = current.toISOString().split('T')[0];
    document.getElementById('rechnung-faellig').value = resultStr;
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
        getOstersonntag,
        getGermanHolidays,
        calculateDeliveryDate,
        showToast,
        safeConfirm,
        safeAlert,
        isRechnungBezahltOderStorniert
    };
}
