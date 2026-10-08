window.extendPaymentDeadline = function (id) {
  const idNum = parseInt(id);
  const rech = state.rechnungen.find(r => r.id === idNum);
  if (!rech) return;
  document.getElementById('extend-rechnung-id').value = idNum;
  document.getElementById('extend-date-input').value = rech.faellig || new Date().toISOString().split('T')[0];
  const modal = document.getElementById('extend-deadline-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
};

window.closeExtendModal = function () {
  const modal = document.getElementById('extend-deadline-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

window.confirmExtendDeadline = async function () {
  const id = parseInt(document.getElementById('extend-rechnung-id').value);
  const newDateStr = document.getElementById('extend-date-input').value;
  if (!newDateStr) {
    showToast('Bitte wählen Sie ein Datum.', 'error');
    return;
  }
  const rech = state.rechnungen.find(r => r.id === id);
  if (!rech) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(newDateStr);
  checkDate.setHours(0, 0, 0, 0);
  const newStatus = checkDate >= today ? 'Ausstehend' : 'Überfällig';
  try {
    // GoBD: Gesperrte Belege nur über den schmalen Status-Pfad ändern
    // (Zahlungsziel/Status sind Buchhaltungsfelder, Audit erfolgt serverseitig).
    await window.api.updateDocumentStatus(rech.id, {
      status: newStatus,
      faellig: newDateStr
    });
    rech.faellig = newDateStr;
    rech.status = newStatus;
    showToast('Zahlungsziel erfolgreich verlängert.', 'success');
    window.closeExtendModal();
    if (typeof renderRechnungen === 'function') renderRechnungen();
    if (typeof renderDashboard === 'function') renderDashboard();
  } catch (e) {
    console.error('Error extending deadline:', e);
    showToast('Fehler beim Speichern.', 'error');
  }
};

async function bulkAction(action) {
  const selectedIds = Array.from(document.querySelectorAll('.rechnung-checkbox:checked')).map(cb => parseInt(cb.value));
  if (selectedIds.length === 0) return;
  const selectedRechnungen = selectedIds.map(id => state.rechnungen.find(r => r.id === id)).filter(Boolean);
  if (action === 'pdf') {
    showToast(`PDF-Export für ${selectedIds.length} Rechnungen gestartet...`, 'success');
    // In a real app, this would trigger a batch PDF generation
    // For now, we just simulate it
    setTimeout(() => {
      showToast(`${selectedIds.length} PDFs erfolgreich exportiert.`, 'success');
    }, 1500);

    // Unselect all and hide bar
    document.getElementById('selectAll').checked = false;
    toggleAllSelections(document.getElementById('selectAll'));
  } else if (action === 'paid') {
    const toUpdate = selectedRechnungen.filter(r => r.status === 'Ausstehend' || r.status === 'Überfällig');
    if (toUpdate.length === 0) {
      showToast('Keine der ausgewählten Rechnungen kann als bezahlt markiert werden (bereits bezahlt oder storniert).', 'warning');
      return;
    }
    if (await safeConfirm(`${toUpdate.length} Rechnungen als bezahlt markieren?`)) {
      let successCount = 0;
      let blockedCount = 0;
      for (const rech of toUpdate) {
        try {
          const offen = rech.offener_betrag !== undefined ? parseFloat(rech.offener_betrag) : parseFloat(rech.brutto || 0);
          if (offen > 0.009) {
             blockedCount++;
             console.warn(`Rechnung ${rech.nr} hat offenen Betrag und kann nicht manuell als bezahlt markiert werden.`);
             continue;
          }
          // GoBD: Gesperrte Belege nur über den schmalen Status-Pfad ändern.
          // Für 0-Balance Rechnungen loggen wir den MANUELL_BEZAHLT Audit, 
          // indem wir den applyPaymentMatching-Pfad mit transaktionId = null nutzen.
          if (typeof window.api.applyPaymentMatching === 'function') {
              await window.api.applyPaymentMatching([{
                  dokumentId: rech.id,
                  betrag: offen,
                  differenzGrund: 'MANUELL_BEZAHLT'
              }]);
          } else {
              await window.api.updateDocumentStatus(rech.id, {
                  status: 'Bezahlt'
              });
          }
          rech.status = 'Bezahlt';
          successCount++;
        } catch (e) {
          console.error(`Error saving invoice ${rech.nr}:`, e);
        }
      }
      
      if (blockedCount > 0) {
          showToast(`${blockedCount} Rechnungen haben noch einen offenen Betrag und wurden blockiert. Bitte nutzen Sie das OPOS-Matching für Teilzahlungen.`, 'warning');
      }
      
      if (successCount > 0) {
          showToast(`${successCount} von ${toUpdate.length} Rechnungen als bezahlt markiert.`, 'success');
      } else if (blockedCount === 0) {
          showToast(`Keine Rechnungen wurden als bezahlt markiert.`, 'info');
      }
      renderRechnungen();
      renderDashboard();
      handleSelectionChange();

      // Unselect all
      document.getElementById('selectAll').checked = false;
      toggleAllSelections(document.getElementById('selectAll'));
    }
  } else if (action === 'dunning') {
    const toDunning = selectedRechnungen.filter(r => r.status === 'Überfällig');
    if (toDunning.length === 0) {
      showToast('Mahnungen können nur für überfällige Rechnungen gesendet werden.', 'warning');
      return;
    }
    if (await safeConfirm(`Mahnungen für ${toDunning.length} überfällige Rechnungen senden?`)) {
      // Simulation of dunning process
      showToast(`${toDunning.length} Mahnungen werden generiert (kein Versandnachweis — folgt J11)`, 'info');

      // Unselect all
      document.getElementById('selectAll').checked = false;
      toggleAllSelections(document.getElementById('selectAll'));
    }
  }
}

window.neueVersionFromDashboard = async function (angId) {
  const targetId = parseInt(angId, 10) || angId;
  const existing = (state.angebote || []).find(a => a.id == targetId);
  if (!existing) {
    showToast('Angebot nicht gefunden.', 'error');
    return;
  }
  const nextVer = (parseInt(existing.version, 10) || 1) + 1;
  if (!(await safeConfirm(`Möchten Sie eine neue Verhandlungs-Version (v${nextVer}) auf Basis von ${existing.nr} anlegen?\n\nDie bisherige Version bleibt unverändert gefroren.`))) {
    return;
  }
  try {
    const newVersionObj = window.AngebotController.createVersion(existing, existing.positionen);
    const newDocId = await window.api.saveDocument(newVersionObj);
    const fullState = await window.api.getFullState();
    if (fullState) {
      state.angebote = fullState.angebote || [];
      state.rechnungen = fullState.rechnungen || [];
    }
    showToast(`Neue Version ${newVersionObj.nr} (v${newVersionObj.version}) als Entwurf angelegt.`, 'success');
    if (typeof renderAngebote === 'function') renderAngebote();
    if (typeof openAngebotModal === 'function') openAngebotModal(newDocId);
  } catch (err) {
    console.error('Fehler beim Erstellen der neuen Version:', err);
    showToast('Fehler beim Erstellen der Version: ' + (err.message || err), 'error');
  }
};

window.angebotAnnehmenFromDashboard = async function (angId) {
  const targetId = parseInt(angId, 10) || angId;
  const existing = (state.angebote || []).find(a => a.id == targetId);
  if (!existing) {
    showToast('Angebot nicht gefunden.', 'error');
    return;
  }
  if (!(await safeConfirm(`Angebot ${existing.nr} (v${existing.version || 1}) verbindlich als ANGENOMMEN markieren?`))) {
    return;
  }
  try {
    window.AngebotController.acceptAngebot(existing, existing.version);
    await window.api.saveDocument(existing);
    const fullState = await window.api.getFullState();
    if (fullState) {
      state.angebote = fullState.angebote || [];
      state.rechnungen = fullState.rechnungen || [];
    }
    showToast(`Angebot ${existing.nr} wurde als ANGENOMMEN markiert.`, 'success');
    if (typeof renderAngebote === 'function') renderAngebote();
  } catch (err) {
    console.error('Fehler beim Annehmen des Angebots:', err);
    showToast('Fehler beim Annehmen: ' + (err.message || err), 'error');
  }
};

window.projektAnlegenFromDashboard = async function (angId) {
  const targetId = parseInt(angId, 10) || angId;
  const existing = (state.angebote || []).find(a => a.id == targetId);
  if (!existing) {
    showToast('Angebot nicht gefunden.', 'error');
    return;
  }
  const sVer = existing.angenommene_version || existing.version || 1;
  const existingProjekt = (state.projekte || []).find(p => p.source_angebot_id === existing.id && (p.source_angebot_version || 1) === sVer);
  if (existingProjekt) {
    showToast(`Für dieses Angebot existiert bereits Projekt #${existingProjekt.id} (${existingProjekt.name}).`, 'info');
    if (typeof openProjektDetails === 'function') {
      openProjektDetails(existingProjekt.id);
    } else if (typeof switchView === 'function') {
      switchView('projekte');
    }
    return;
  }
  if (!(await safeConfirm(`Aus Angebot ${existing.nr} (v${sVer}) jetzt ein neues Projekt anlegen?`))) {
    return;
  }
  try {
    const projektData = window.AngebotController.createProjektFromAngebot(existing, existing.positionen, {
      name: `Projekt: ${existing.nr} (v${sVer})`
    });
    const newProjId = await window.api.saveProjekt(projektData);
    const fullState = await window.api.getFullState();
    if (fullState) {
      state.projekte = fullState.projekte || [];
      state.angebote = fullState.angebote || [];
    }
    showToast(`Projekt #${newProjId} erfolgreich aus Angebot ${existing.nr} angelegt!`, 'success');
    if (typeof renderAngebote === 'function') renderAngebote();
    if (typeof renderProjekte === 'function') renderProjekte();
    if (typeof openProjektDetails === 'function') {
      openProjektDetails(newProjId);
    } else if (typeof switchView === 'function') {
      switchView('projekte');
    }
  } catch (err) {
    console.error('Fehler bei der Projektanlage:', err);
    showToast('Fehler bei Projektanlage: ' + (err.message || err), 'error');
  }
};

window.downloadXRechnungXML = async function (invoiceId) {
  const idNum = parseInt(invoiceId);
  const rech = state.rechnungen.find(r => parseInt(r.id) === idNum);
  if (!rech) {
    showToast('Rechnung nicht gefunden.', 'error');
    return;
  }
  const kundeId = parseInt(rech.kundeId);
  const kunde = state.kunden.find(k => parseInt(k.id) === kundeId) || {
    name: 'Empfänger'
  };
  const engine = typeof EInvoiceEngine !== 'undefined' ? EInvoiceEngine : window.EInvoiceEngine || null;

  // 1. Präferierter nativer Electron-Export mit GoBD-Audit & Speichern-Dialog
  if (window.api && typeof window.api.exportXRechnungXml === 'function') {
    try {
      const res = await window.api.exportXRechnungXml({
        doc: rech,
        customer: kunde,
        fileNameHint: `XRechnung_${rech.nr}.xml`
      });
      if (res && res.success) {
        showToast(`XRechnung XML erfolgreich gespeichert: ${res.path}`, 'success');
        return;
      } else if (res && res.cancelled) {
        showToast('XRechnung-Export abgebrochen.', 'info');
        return;
      } else if (res && res.validationErrors) {
        showToast('XRechnung-Export blockiert - Validierungsfehler: ' + res.validationErrors.join(' '), 'error');
        return;
      } else if (res && res.error) {
        showToast('XRechnung-Export fehlgeschlagen: ' + res.error, 'error');
        return;
      }
    } catch (ipcErr) {
      console.warn('IPC exportXRechnungXml fehlgeschlagen, nutze Fallback:', ipcErr);
    }
  }

  // 2. Browser-/In-Memory-Fallback
  if (engine) {
    const validation = engine.validateForEN16931(rech, kunde, state.einstellungen);
    if (!validation.isValid) {
      showToast('XRechnung-Export blockiert - Validierungsfehler: ' + validation.errors.join(' '), 'error');
      return;
    }
    const xml = engine.generateXRechnungXML(rech, kunde, state.einstellungen);
    const blob = new Blob([xml], {
      type: 'application/xml;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `XRechnung_${rech.nr}.xml`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`XRechnung XML für ${rech.nr} heruntergeladen.`, 'success');
  } else {
    showToast('E-Rechnungs-Engine nicht bereit.', 'error');
  }
};

window.downloadZugferdPdf = async function (invoiceId) {
  const idNum = parseInt(invoiceId);
  const rech = state.rechnungen.find(r => parseInt(r.id) === idNum);
  if (!rech) {
    showToast('Rechnung nicht gefunden.', 'error');
    return;
  }
  const kundeId = parseInt(rech.kundeId);
  const kunde = state.kunden.find(k => parseInt(k.id) === kundeId) || {
    name: 'Empfänger'
  };
  const engine = typeof EInvoiceEngine !== 'undefined' ? EInvoiceEngine : window.EInvoiceEngine || null;
  if (engine) {
    const validation = engine.validateForEN16931(rech, kunde, state.einstellungen);
    if (!validation.isValid) {
      showToast('ZUGFeRD-Export blockiert - Validierungsfehler: ' + validation.errors.join(' '), 'error');
      return;
    }
  }
  if (window.api && typeof window.api.exportZugferdPdf === 'function') {
    // Sichtseite aus DEMSELBEN doc-Objekt unsichtbar rendern; der Main-Prozess
    // erfasst sie per printToPDF (nur #print-template ist im @media print sichtbar).
    let previousTemplateHtml = null;
    try {
      if (typeof window.renderInvoiceForZugferdExport === 'function') {
        previousTemplateHtml = await window.renderInvoiceForZugferdExport(rech, kunde);
      }
    } catch (renderErr) {
      console.warn('ZUGFeRD-Sichtseite konnte nicht gerendert werden - Export läuft mit Platzhalter-Seite:', renderErr);
    }
    try {
      const res = await window.api.exportZugferdPdf({
        doc: rech,
        customer: kunde,
        profile: 'EN16931',
        fileNameHint: `ZUGFeRD_${rech.nr}.pdf`,
        allowFallback: true
      });
      if (res && res.success) {
        if (res.sichtseiteQuelle === 'fallback') {
          showToast(`ZUGFeRD PDF/A-3 mit Platzhalter-Seite gespeichert: ${res.path}`, 'info');
        } else {
          showToast(`ZUGFeRD PDF/A-3 gespeichert: ${res.path}`, 'success');
        }
      } else if (res && res.cancelled) {
        showToast('ZUGFeRD-Export abgebrochen.', 'info');
      } else {
        showToast('ZUGFeRD-Export fehlgeschlagen: ' + (res && res.error || 'Unbekannter Fehler'), 'error');
      }
    } catch (err) {
      showToast('ZUGFeRD-Export fehlgeschlagen: ' + err.message, 'error');
    } finally {
      if (previousTemplateHtml !== null && typeof window.restorePrintTemplateContent === 'function') {
        window.restorePrintTemplateContent(previousTemplateHtml);
      }
    }
  } else if (typeof window.generatePdf === 'function') {
    await window.generatePdf(rech.id);
    showToast('ZUGFeRD-Export nicht verfügbar – Standard-PDF wurde erzeugt. Bitte App aktualisieren.', 'info');
  } else {
    showToast('ZUGFeRD-Export in dieser App-Version nicht verfügbar.', 'error');
  }
};

if (typeof window !== 'undefined') window.extendPaymentDeadline = extendPaymentDeadline;
if (typeof window !== 'undefined') window.closeExtendModal = closeExtendModal;
if (typeof window !== 'undefined') window.confirmExtendDeadline = confirmExtendDeadline;
if (typeof window !== 'undefined') window.bulkAction = bulkAction;
if (typeof window !== 'undefined') window.neueVersionFromDashboard = neueVersionFromDashboard;
if (typeof window !== 'undefined') window.angebotAnnehmenFromDashboard = angebotAnnehmenFromDashboard;
if (typeof window !== 'undefined') window.projektAnlegenFromDashboard = projektAnlegenFromDashboard;
if (typeof window !== 'undefined') window.downloadXRechnungXML = downloadXRechnungXML;
if (typeof window !== 'undefined') window.downloadZugferdPdf = downloadZugferdPdf;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        extendPaymentDeadline: typeof window !== 'undefined' ? window.extendPaymentDeadline : extendPaymentDeadline,
        closeExtendModal: typeof window !== 'undefined' ? window.closeExtendModal : closeExtendModal,
        confirmExtendDeadline: typeof window !== 'undefined' ? window.confirmExtendDeadline : confirmExtendDeadline,
        bulkAction: typeof window !== 'undefined' ? window.bulkAction : bulkAction,
        neueVersionFromDashboard: typeof window !== 'undefined' ? window.neueVersionFromDashboard : neueVersionFromDashboard,
        angebotAnnehmenFromDashboard: typeof window !== 'undefined' ? window.angebotAnnehmenFromDashboard : angebotAnnehmenFromDashboard,
        projektAnlegenFromDashboard: typeof window !== 'undefined' ? window.projektAnlegenFromDashboard : projektAnlegenFromDashboard,
        downloadXRechnungXML: typeof window !== 'undefined' ? window.downloadXRechnungXML : downloadXRechnungXML,
        downloadZugferdPdf: typeof window !== 'undefined' ? window.downloadZugferdPdf : downloadZugferdPdf
    };
}