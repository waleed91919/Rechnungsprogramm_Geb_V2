const DauerrechnungController = require('../../../controllers/DauerrechnungController');
const InvoiceController = require('../../../controllers/InvoiceController');

function createSammelrechnungRepo(deps) {
    const {
        db, dbQuery, dbRun, appendAuditLog, dbAPI,
        applyDocumentWrite, getDocumentWithChildren,
        baueObjektPfad, loeseObjektEmpfaengerAuf, ladeObjekteState,
        leseZuschlagsProfil, kalkuliereLvPosition, OBJEKT_EBENEN
    } = deps;

    return {
        _erzeugeSammelrechnungTx(kundeId, eintraege) {
  if (!Array.isArray(eintraege) || eintraege.length < 2) {
    throw new Error('Sammelrechnung benötigt mindestens 2 Läufe.');
  }
  let minPeriode = null;
  let maxPeriode = null;
  let alleGesperrtMoeglich = true;
  let zahlungszielMax = 0;
  const positionsListen = [];
  const vorbereitete = [];
  for (const eintrag of eintraege) {
    let planId;
    let periodeVon;
    let periodeBis;
    let rechnungsDatum;
    let laufRow = null;
    if (eintrag.laufId != null) {
      laufRow = db.prepare('SELECT * FROM dauerrechnung_laeufe WHERE id=?').get(Number(eintrag.laufId));
      if (!laufRow) throw new Error(`Lauf #${eintrag.laufId} wurde nicht gefunden.`);
      if (laufRow.status !== 'ERSTELLT') throw new Error(`Lauf #${laufRow.id} ist nicht im Status ERSTELLT.`);
      if (laufRow.dokument_id) throw new Error(`Lauf #${laufRow.id} wurde bereits abgerechnet.`);
      planId = laufRow.plan_id;
      periodeVon = laufRow.periode_von;
      periodeBis = laufRow.periode_bis;
      rechnungsDatum = laufRow.rechnungs_datum;
    } else {
      planId = Number(eintrag.planId);
      periodeVon = eintrag.periodeVon || eintrag.periode_von;
      periodeBis = eintrag.periodeBis || eintrag.periode_bis;
      rechnungsDatum = eintrag.rechnungsDatum || eintrag.rechnungs_datum;
      laufRow = db.prepare("SELECT * FROM dauerrechnung_laeufe WHERE plan_id=? AND periode_von=? AND periode_bis=? AND status='ERSTELLT'").get(planId, periodeVon, periodeBis) || null;
      if (laufRow && laufRow.dokument_id) throw new Error(`Lauf #${laufRow.id} wurde bereits abgerechnet.`);
    }
    const plan = db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(planId);
    if (!plan) throw new Error(`Abrechnungsplan #${planId} wurde nicht gefunden.`);
    if (Number(plan.empfaenger_kunde_id) !== Number(kundeId)) {
      throw new Error('Alle Läufe müssen denselben Rechnungsempfänger haben.');
    }
    if (plan.als_entwurf !== 1) alleGesperrtMoeglich = false;
    zahlungszielMax = Math.max(zahlungszielMax, plan.zahlungsziel_tage || 14);
    const pfad = baueObjektPfad(plan.objekt_typ, plan.objekt_id);
    const positionenDb = plan.preis_modus === 'POSITIONEN' ? this._ladePlanPositionenFuerGenerierung(plan).map(p => ({
      artikelId: p.artikelId,
      name: p.name,
      menge: p.menge,
      einheit: p.einheit,
      preis: p.preis,
      mwst: p.mwst,
      ek: 0
    })) : [];
    for (const pos of DauerrechnungController.berechnePositionsListe(plan, positionenDb)) {
      positionsListen.push({
        ...pos,
        name: `[${pfad}] ${pos.name}`
      });
    }
    minPeriode = minPeriode === null || periodeVon < minPeriode ? periodeVon : minPeriode;
    maxPeriode = maxPeriode === null || periodeBis > maxPeriode ? periodeBis : maxPeriode;
    vorbereitete.push({
      laufRow,
      plan,
      periodeVon,
      periodeBis,
      rechnungsDatum
    });
  }
  const totals = InvoiceController.calculateTotals({
    positionen: positionsListen.map(pos => ({
      ...pos,
      rabatt: 0
    })),
    mode: 'netto',
    globalRabatt: {
      value: 0,
      type: '%'
    },
    anzahlung: 0
  });
  const heuteIso = new Date().toISOString().split('T')[0];
  const alsEntwurf = !alleGesperrtMoeglich;
  const faelligAm = DauerrechnungController.addTage(heuteIso, zahlungszielMax || 14);

        // Use facade method via this
        const { generateNaechsteRechnungsNr } = this;

  const doc = {
    id: null,
    type: 'rechnung',
    nr: generateNaechsteRechnungsNr(),
    datum: heuteIso,
    faellig: faelligAm,
    kundeId: Number(kundeId),
    projektId: null,
    objekt_typ: null,
    objekt_id: null,
    rechnungsart: 'SAMMELRECHNUNG',
    leistungszeitraum_von: minPeriode,
    leistungszeitraum_bis: maxPeriode,
    vortext: 'Sammelrechnung über mehrere Abrechnungspläne',
    status: alsEntwurf ? 'Entwurf' : 'Ausstehend',
    isLocked: !alsEntwurf,
    positionen: positionsListen,
    netto: totals.nettoNachRabatt,
    steuer: totals.totalTax,
    brutto: totals.bruttoNachRabatt,
    zahlbetrag: totals.zahlbetrag,
    eingabemodus: 'netto'
  };
  const sammelDokumentId = applyDocumentWrite(doc, doc.isLocked ? 1 : 0);
  for (const v of vorbereitete) {
    if (v.laufRow && v.laufRow.id) {
      db.prepare('UPDATE dauerrechnung_laeufe SET dokument_id=? WHERE id=?').run(sammelDokumentId, v.laufRow.id);
    } else {
      try {
        db.prepare(`INSERT INTO dauerrechnung_laeufe (plan_id, periode_von, periode_bis, rechnungs_datum, faellig_am, status, dokument_id)
                                VALUES (?, ?, ?, ?, ?, 'ERSTELLT', ?)`).run(v.plan.id, v.periodeVon, v.periodeBis, v.rechnungsDatum, faelligAm, sammelDokumentId);
      } catch (e) {
        if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error(`Zeitraum ${v.periodeVon} bis ${v.periodeBis} bereits abgerechnet.`);
        }
        throw e;
      }
    }
    appendAuditLog({
      entityType: 'ABRECHNUNGSPLAN',
      entityId: v.plan.id,
      action: 'LAUF_IN_SAMMELRECHNUNG',
      details: {
        periodeVon: v.periodeVon,
        periodeBis: v.periodeBis,
        sammelDokumentId,
        nr: doc.nr
      }
    });
    db.prepare('UPDATE abrechnungsplaene SET letzte_lauf_am=?, naechste_lauf_am=? WHERE id=?').run(v.rechnungsDatum, DauerrechnungController.berechneNaechstenTermin({
      ...v.plan,
      letzte_lauf_am: v.rechnungsDatum
    }, heuteIso), v.plan.id);
  }
  return {
    dokumentId: sammelDokumentId,
    nr: doc.nr,
    brutto: doc.brutto,
    kundeId: Number(kundeId),
    anzahlLaeufe: eintraege.length
  };
},

        erzeugeSammelrechnung(kundeId, laeufe) {
  const normalisiert = (laeufe || []).map(e => {
    if (!e || typeof e !== 'object') return e;
    if (e.laufId != null) return {
      laufId: e.laufId
    };
    if (e.planId != null || e.plan_id != null) {
      return {
        planId: e.planId != null ? e.planId : e.plan_id,
        periodeVon: e.periodeVon != null ? e.periodeVon : e.periode_von,
        periodeBis: e.periodeBis != null ? e.periodeBis : e.periode_bis,
        rechnungsDatum: e.rechnungsDatum != null ? e.rechnungsDatum : e.rechnungs_datum
      };
    }
    return e;
  });
  const tx = db.transaction((k, list) => this._erzeugeSammelrechnungTx(k, list));
  return tx(kundeId, normalisiert);
}
    };
}

module.exports = createSammelrechnungRepo;
