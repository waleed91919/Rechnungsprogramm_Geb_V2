(function() {
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



    if (typeof window !== 'undefined') window.createDatabaseBackup = createDatabaseBackup;
    if (typeof window !== 'undefined') window.exportManualBackup = exportManualBackup;
    if (typeof window !== 'undefined') window.loadBackupHistory = loadBackupHistory;
    if (typeof window !== 'undefined') window.verifyBackupItem = verifyBackupItem;
    if (typeof window !== 'undefined') window.restoreBackupItem = restoreBackupItem;
    if (typeof window !== 'undefined') window.openRestoreModal = openRestoreModal;
    if (typeof window !== 'undefined') window.closeRestoreModal = closeRestoreModal;
    if (typeof window !== 'undefined') window.handleRestoreBackup = handleRestoreBackup;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createDatabaseBackup, exportManualBackup, loadBackupHistory, verifyBackupItem, restoreBackupItem, openRestoreModal, closeRestoreModal, handleRestoreBackup };
    }
})();
