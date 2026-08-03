/**
 * Notifications & Help Logic
 */

// --- Help Modal Logic ---
function openHelpModal() {
    document.getElementById('help-modal').classList.remove('hidden');
    document.getElementById('help-modal').classList.add('flex');
}

function closeHelpModal() {
    document.getElementById('help-modal').classList.add('hidden');
    document.getElementById('help-modal').classList.remove('flex');
}

// --- Notification Logic ---
function toggleNotifications() {
    const dropdown = document.getElementById('notification-dropdown');
    dropdown.classList.toggle('hidden');
    
    if (!dropdown.classList.contains('hidden')) {
        renderNotifications();
        
        // Close when clicking outside
        const closeOnClickOutside = (e) => {
            if (!dropdown.contains(e.target) && !document.getElementById('btn-notifications').contains(e.target)) {
                dropdown.classList.add('hidden');
                document.removeEventListener('click', closeOnClickOutside);
            }
        };
        setTimeout(() => document.addEventListener('click', closeOnClickOutside), 10);
    }
}

function renderNotifications() {
    const list = document.getElementById('notif-list');
    const badge = document.getElementById('notif-count-badge');
    const dot = document.getElementById('notif-dot');
    
    let notifications = [];
    
    // 1. Check Overdue Invoices
    const overdueInvoices = state.rechnungen.filter(r => r.status === 'Überfällig');
    if (overdueInvoices.length > 0) {
        notifications.push({
            type: 'overdue',
            title: 'Überfällige Rechnungen',
            message: `Achtung: ${overdueInvoices.length} Rechnungen sind überfällig!`,
            icon: 'warning',
            color: 'text-red-500',
            bgColor: 'bg-red-50',
            action: () => {
                switchView('rechnungen');
                filterRechnungen('Überfällig');
            }
        });
    }
    
    // 2. Check Low Stock
    const lowStockArticles = state.artikel.filter(a => (a.bestand || 0) < 5);
    lowStockArticles.forEach(art => {
        notifications.push({
            type: 'stock',
            title: 'Niedriger Lagerbestand',
            message: `Artikel '${art.name}' fast ausverkauft (Nur noch ${art.bestand || 0} auf Lager).`,
            icon: 'inventory_2',
            color: 'text-amber-500',
            bgColor: 'bg-amber-50',
            action: () => {
                switchView('artikel');
                // Optional: set search filter
                const searchInput = document.getElementById('search-artikel');
                if (searchInput) {
                    searchInput.value = art.name;
                    renderArtikel();
                }
            }
        });
    });
    
    // Update Badge & Dot
    badge.textContent = notifications.length;
    if (notifications.length > 0) {
        dot.classList.remove('hidden');
    } else {
        dot.classList.add('hidden');
    }
    
    // Render List
    if (notifications.length === 0) {
        list.innerHTML = `
            <div class="p-8 text-center text-slate-400">
                <span class="material-symbols-outlined text-4xl mb-2 opacity-20">notifications_off</span>
                <p class="text-xs">Keine neuen Benachrichtigungen</p>
            </div>
        `;
        return;
    }
    
    list.innerHTML = notifications.map((n, idx) => `
        <div onclick="executeNotifAction(${idx})" class="p-4 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors flex gap-3">
            <div class="w-10 h-10 rounded-full ${n.bgColor} ${n.color} flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[20px]">${n.icon}</span>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-slate-800">${n.title}</p>
                <p class="text-[11px] text-slate-500 leading-snug mt-0.5">${n.message}</p>
            </div>
        </div>
    `).join('');
    
    // Store actions temporarily for execution
    window._notifActions = notifications.map(n => n.action);
}

function executeNotifAction(idx) {
    if (window._notifActions && window._notifActions[idx]) {
        window._notifActions[idx]();
        document.getElementById('notification-dropdown').classList.add('hidden');
    }
}

// Initialize notification check on startup and periodically
function initNotificationCheck() {
    renderNotifications();
    setInterval(renderNotifications, 60000); // Check every minute
}

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
    // Ctrl + N = Neue Rechnung
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        openRechnungModal();
    }
    
    // Ctrl + P = Drucken (if PDF preview is open, or global print)
    if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        const pdfModal = document.getElementById('pdf-preview-modal');
        if (pdfModal && !pdfModal.classList.contains('hidden')) {
            executePrint('print');
        } else {
            // Default behavior or open print for current view if applicable
            console.log('Global print shortcut triggered');
        }
    }
});

// Add to window for global access
window.toggleNotifications = toggleNotifications;
window.openHelpModal = openHelpModal;
window.closeHelpModal = closeHelpModal;
window.executeNotifAction = executeNotifAction;
window.initNotificationCheck = initNotificationCheck;
