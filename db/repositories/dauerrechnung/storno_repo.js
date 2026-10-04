const DauerrechnungController = require('../../../controllers/DauerrechnungController');
const InvoiceController = require('../../../controllers/InvoiceController');

function createStornoRepo(deps) {
    const {
        db, dbQuery, dbRun, appendAuditLog, dbAPI,
        applyDocumentWrite, getDocumentWithChildren,
        baueObjektPfad, loeseObjektEmpfaengerAuf, ladeObjekteState,
        leseZuschlagsProfil, kalkuliereLvPosition, OBJEKT_EBENEN
    } = deps;

    return {
        async storniereLauf(laufId, grund) {
  if (!grund || typeof grund !== 'string' || !grund.trim()) {
    throw new Error('Storno ohne Begründung nicht erlaubt (GoBD).');
  }
  if (typeof laufId !== 'number') throw new Error('Ungültige Lauf-ID');
  const lauf = db.prepare('SELECT * FROM dauerrechnung_laeufe WHERE id=?').get(laufId);
  if (!lauf) throw new Error('Ungültige Lauf-ID');
  const doc = lauf.dokument_id ? getDocumentWithChildren(lauf.dokument_id) : null;
  const istEntwurf = !!(doc && !doc.isLocked && doc.status === 'Entwurf');
  let stornoDokumentId = null;
  if (doc && !istEntwurf) {
    const stornoData = InvoiceController.createStornoData(doc);
            const { storniereRechnung } = deps.dbAPI || this;
            const res = await (storniereRechnung || deps.dbAPI.storniereRechnung).call(this, stornoData.updatedOriginal, stornoData.stornoDoc);
    stornoDokumentId = res.stornoId;
  }
  const tx = db.transaction((laufZeile, begruendung) => {
    let dokumentGeloescht = false;
    if (istEntwurf && laufZeile.dokument_id) {
      const entwurfId = laufZeile.dokument_id;
      const weitereReferenzen = db.prepare("SELECT COUNT(*) c FROM dauerrechnung_laeufe WHERE dokument_id=? AND id != ? AND status='ERSTELLT'").get(entwurfId, laufZeile.id).c;
      db.prepare('UPDATE dauerrechnung_laeufe SET dokument_id=NULL WHERE id=?').run(laufZeile.id);
      if (weitereReferenzen === 0) {
        this._loescheEntwurfInnerhalbTx(entwurfId);
        dokumentGeloescht = true;
      }
    }
    db.prepare("UPDATE dauerrechnung_laeufe SET status='STORNIERT', storno_grund=? WHERE id=?").run(begruendung.trim(), laufZeile.id);
    appendAuditLog({
      entityType: 'ABRECHNUNGSPLAN',
      entityId: laufZeile.plan_id,
      action: 'LAUF_STORNIERT',
      details: {
        laufId: laufZeile.id,
        grund: begruendung.trim(),
        dokumentGeloescht,
        stornorechnungId: stornoDokumentId
      }
    });
    const plan = db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(laufZeile.plan_id);
    if (plan) {
      const heuteIso = new Date().toISOString().split('T')[0];
      db.prepare('UPDATE abrechnungsplaene SET naechste_lauf_am=? WHERE id=?').run(DauerrechnungController.berechneNaechstenTermin(plan, heuteIso), plan.id);
    }
    return {
      success: true,
      laufId: laufZeile.id,
      dokumentStorniert: dokumentGeloescht || !!stornoDokumentId,
      stornoDokumentId: stornoDokumentId || undefined
    };
  });
  return tx(lauf, grund);
},

        _loescheEntwurfInnerhalbTx(docId) {
  const doc = db.prepare('SELECT type, nr, status, isLocked FROM dokumente WHERE id=?').get(docId);
  if (!doc) return;
  if (doc.type === 'rechnung') {
    const positions = db.prepare('SELECT artikelId, menge FROM positionen WHERE dokumentId=?').all(docId);
    if (positions.length > 0) {
      const restoreStockMap = new Map();
      for (const p of positions) {
        if (p.artikelId) {
          restoreStockMap.set(p.artikelId, (restoreStockMap.get(p.artikelId) || 0) + p.menge);
        }
      }
      const restoreStockStmt = db.prepare('UPDATE artikel SET bestand = bestand + ? WHERE id=?');
      for (const [artId, qty] of restoreStockMap.entries()) {
        restoreStockStmt.run(qty, artId);
      }
    }
  }
  db.prepare('DELETE FROM positionen WHERE dokumentId=?').run(docId);
  db.prepare('DELETE FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?').run(docId);
  db.prepare('DELETE FROM dokumente WHERE id=?').run(docId);
  appendAuditLog({
    entityType: 'DOCUMENT',
    entityId: docId,
    action: 'GELÖSCHT',
    details: {
      nr: doc.nr,
      type: doc.type,
      status: doc.status,
      grund: 'Lauf-Storno (Entwurf)'
    }
  });
}
    };
}

module.exports = createStornoRepo;
