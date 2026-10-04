(function() {

function initBankDropzone() {
  const dz = document.getElementById('banking-dropzone');
  if (!dz || dz.dataset.dropInit === '1') return;
  dz.dataset.dropInit = '1';
  dz.addEventListener('dragover', (e) => {e.preventDefault();dz.classList.add('border-primary', 'bg-primary/5');});
  dz.addEventListener('dragleave', () => dz.classList.remove('border-primary', 'bg-primary/5'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('border-primary', 'bg-primary/5');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleBankFileUpload(file);
  });
}

function liesseDateiMitEncodingFallback(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target.result || '');
      const mojibake = /\uFFFD|(Ã¤|Ã¶|Ã¼|Ã„|Ã–|Ãœ|ÃŸ)/.test(text);
      if (!mojibake) return resolve(text);
      const reader2 = new FileReader();
      reader2.onload = (ev) => resolve(String(ev.target.result || ''));
      reader2.onerror = reject;
      reader2.readAsText(file, 'windows-1252');
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function handleBankFileUpload(file) {
  if (!file) return;
  if (!bankingState.selectedKontoId) {
    if (typeof showToast === 'function') showToast('Bitte wählen Sie zuerst ein Bankkonto aus.', 'warning');
    return;
  }

  const konto = bankingState.konten.find((k) => k.id === bankingState.selectedKontoId);

  try {
    const content = await liesseDateiMitEncodingFallback(file);
    let transactions = [];
    let format = 'CSV_GENERIC';
    let closingBalance = null;
    let skippedPendingSumme = 0;
    let rvslSkippedSumme = 0;

    if (file.name.toLowerCase().endsWith('.xml') || content.trim().startsWith('<?xml') || content.includes('<Document')) {
      format = 'CAMT053';
      const parser = typeof BankingController !== 'undefined' ? BankingController : window.BankingController;
      const statements = parser.parseCamt053(content);
      if (statements.length > 0) {
        transactions = statements.flatMap((s) => s.transactions);
        closingBalance = statements[0].closingBalance;
        skippedPendingSumme = statements.reduce((sum, s) => sum + (s.skippedPending || 0), 0);
        rvslSkippedSumme = statements.reduce((sum, s) => sum + (s.rvslSkipped || 0), 0);
      }
    } else if (file.name.toLowerCase().endsWith('.sta') || file.name.toLowerCase().endsWith('.swi') || content.includes(':20:') && content.includes(':25:')) {
      format = 'MT940';
      const parser = typeof BankingController !== 'undefined' ? BankingController : window.BankingController;
      const statements = parser.parseMt940(content, konto ? konto.iban : '');
      if (statements.length > 0) {
        transactions = statements.flatMap((s) => s.transactions);
        closingBalance = statements[0].closingBalance;
      }
    } else {
      const parser = typeof BankingController !== 'undefined' ? BankingController : window.BankingController;
      transactions = parser.parseCsvStatement(content, 'AUTO', konto ? konto.iban : '');
      format = 'CSV';
    }

    if (transactions.length === 0) {
      if (typeof showToast === 'function') showToast('Keine buchbaren Zeilen in der Datei gefunden (ggf. nur vorgemerkte/stornierte Einträge).', 'warning');
      return;
    }

    const res = await window.api.importBankTransactions(bankingState.selectedKontoId, transactions, {
      filename: file.name,
      format,
      closingBalance
    });

    if (typeof showToast === 'function') {
      let msg = `Import abgeschlossen: ${res.inserted} neu importiert, ${res.duplicates} Duplikate übersprungen.`;
      if (skippedPendingSumme > 0 || rvslSkippedSumme > 0) {
        msg += `, ${skippedPendingSumme + rvslSkippedSumme} vorgemerkt/storniert übersprungen`;
      }
      showToast(msg, 'success');
    }

    await ladeTransaktionen();
    if (res.inserted > 0) {
      switchBankingTab('opos');
    }
  } catch (err) {
    console.error('Import-Fehler:', err);
    if (typeof showToast === 'function') showToast('Fehler beim Importieren: ' + err.message, 'error');
  }
}

    // Expose globally for HTML onclick and cross-file usage
    window.initBankDropzone = initBankDropzone;
    window.liesseDateiMitEncodingFallback = liesseDateiMitEncodingFallback;
    window.handleBankFileUpload = handleBankFileUpload;

})();
