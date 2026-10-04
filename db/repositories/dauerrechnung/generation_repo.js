const DauerrechnungController = require('../../../controllers/DauerrechnungController');
const InvoiceController = require('../../../controllers/InvoiceController');

function createGenerationRepo(deps) {
    const {
        db, dbQuery, dbRun, appendAuditLog, dbAPI,
        applyDocumentWrite, getDocumentWithChildren,
        baueObjektPfad, loeseObjektEmpfaengerAuf, ladeObjekteState,
        leseZuschlagsProfil, kalkuliereLvPosition, OBJEKT_EBENEN
    } = deps;

    // --- Dauerrechnungen F2: Nummernkreis (Spiegel js/editor.js extractLaufendeNummer + INV-Vergabe) ---
function extractLaufendeNummerMain(nr) {
  const groups = String(nr || '').match(/\d+/g);
  return groups && groups.length > 0 ? parseInt(groups[groups.length - 1], 10) || 0 : 0;
}

    function generateNaechsteRechnungsNr() {
  const jahr = new Date().getFullYear();
  const rows = db.prepare("SELECT nr FROM dokumente WHERE type='rechnung'").all();
  const maxNr = rows.reduce((max, r) => Math.max(max, extractLaufendeNummerMain(r.nr)), 0);
  return `INV-${jahr}-${String(maxNr + 1).padStart(3, '0')}`;
}

    return {
        extractLaufendeNummerMain,
        generateNaechsteRechnungsNr,
        _erzeugeRechnungAusLaufTx(planRow, lauf) {
  const plan = {
    ...planRow
  };
  const positionenDb = plan.preis_modus === 'POSITIONEN' ? this._ladePlanPositionenFuerGenerierung(plan).map(p => ({
    artikelId: p.artikelId,
    name: p.name,
    menge: p.menge,
    einheit: p.einheit,
    preis: p.preis,
    mwst: p.mwst,
    ek: 0
  })) : [];
  const positionsListe = DauerrechnungController.berechnePositionsListe(plan, positionenDb);
  const totals = InvoiceController.calculateTotals({
    positionen: positionsListe.map(pos => ({
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
  const faelligAm = DauerrechnungController.addTage(lauf.rechnungsDatum, plan.zahlungsziel_tage || 14);
  const alsEntwurf = plan.als_entwurf === 1;
  const doc = {
    id: null,
    type: 'rechnung',
    nr: generateNaechsteRechnungsNr(),
    datum: lauf.rechnungsDatum,
    faellig: faelligAm,
    kundeId: plan.empfaenger_kunde_id,
    projektId: null,
    objekt_typ: plan.objekt_typ,
    objekt_id: plan.objekt_id,
    rechnungsart: 'REGULAER',
    leistungszeitraum_von: lauf.periodeVon,
    leistungszeitraum_bis: lauf.periodeBis,
    vortext: `Dauerrechnung laut Abrechnungsplan "${plan.name}"`,
    status: alsEntwurf ? 'Entwurf' : 'Ausstehend',
    isLocked: !alsEntwurf,
    positionen: positionsListe,
    netto: totals.nettoNachRabatt,
    steuer: totals.totalTax,
    brutto: totals.bruttoNachRabatt,
    zahlbetrag: totals.zahlbetrag,
    eingabemodus: 'netto'
  };
  const dokumentId = applyDocumentWrite(doc, doc.isLocked ? 1 : 0);
  try {
    db.prepare(`INSERT INTO dauerrechnung_laeufe (plan_id, periode_von, periode_bis, rechnungs_datum, faellig_am, status, dokument_id)
                        VALUES (?, ?, ?, ?, ?, 'ERSTELLT', ?)`).run(plan.id, lauf.periodeVon, lauf.periodeBis, lauf.rechnungsDatum, faelligAm, dokumentId);
  } catch (e) {
    if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error(`Zeitraum ${lauf.periodeVon} bis ${lauf.periodeBis} bereits abgerechnet.`);
    }
    throw e;
  }
  const heuteIso = new Date().toISOString().split('T')[0];
  db.prepare('UPDATE abrechnungsplaene SET letzte_lauf_am=?, naechste_lauf_am=? WHERE id=?').run(lauf.rechnungsDatum, DauerrechnungController.berechneNaechstenTermin({
    ...plan,
    letzte_lauf_am: lauf.rechnungsDatum
  }, heuteIso), plan.id);
  appendAuditLog({
    entityType: 'ABRECHNUNGSPLAN',
    entityId: plan.id,
    action: 'LAUF_ERSTELLT',
    details: {
      laufId: null,
      dokumentId,
      nr: doc.nr,
      periodeVon: lauf.periodeVon,
      periodeBis: lauf.periodeBis,
      brutto: doc.brutto
    }
  });
  return {
    dokumentId,
    nr: doc.nr,
    brutto: doc.brutto,
    laufId: db.prepare('SELECT id FROM dauerrechnung_laeufe WHERE plan_id=? AND periode_von=? AND periode_bis=? AND status=\'ERSTELLT\'').get(plan.id, lauf.periodeVon, lauf.periodeBis).id
  };
},

        erzeugeRechnungAusLauf(plan, lauf) {
  const tx = db.transaction((p, l) => this._erzeugeRechnungAusLaufTx(p, l));
  return tx(plan, lauf);
},

        async generiereFaelligeRechnungen(optionen = {}) {
  const stichdatumIso = optionen.stichdatum || new Date().toISOString().split('T')[0];
  const vorschau = await this.dauerrechnungenVorschau(stichdatumIso);
  const kandidaten = vorschau.faellig.filter(eintrag => (!optionen.planIds || optionen.planIds.includes(eintrag.planId)) && (optionen.nurEntwuerfe ? (db.prepare('SELECT als_entwurf FROM abrechnungsplaene WHERE id=?').get(eintrag.planId) || {}).als_entwurf === 1 : true));
  const erstellt = [];
  const sammelrechnungen = [];
  const uebersprungen = [];
  const verarbeitet = new Set();
  const schluessel = eintrag => `${eintrag.planId}:${eintrag.rechnungsDatum}:${eintrag.periodeVon}:${eintrag.periodeBis}`;
  if (optionen.sammelProKunde) {
    const gruppen = DauerrechnungController.gruppiereFuerSammelrechnung(kandidaten);
    for (const [kundeId, liste] of gruppen.entries()) {
      if (liste.length < 2) continue;
      try {
        const res = this.erzeugeSammelrechnung(kundeId, liste);
        sammelrechnungen.push(res);
        liste.forEach(eintrag => {
          verarbeitet.add(schluessel(eintrag));
          erstellt.push({
            planId: eintrag.planId,
            dokumentId: res.dokumentId,
            nr: res.nr,
            brutto: Math.round(res.brutto / liste.length * 100) / 100
          });
        });
      } catch (e) {
        liste.forEach(eintrag => uebersprungen.push({
          planId: eintrag.planId,
          grund: e.message
        }));
      }
    }
  }
  for (const eintrag of kandidaten) {
    if (verarbeitet.has(schluessel(eintrag))) continue;
    try {
      const plan = db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(eintrag.planId);
      if (!plan) throw new Error('Plan nicht gefunden');
      if (plan.aktiv !== 1) throw new Error('Plan ist deaktiviert');
      const existierend = db.prepare("SELECT id FROM dauerrechnung_laeufe WHERE plan_id=? AND periode_von=? AND periode_bis=? AND status='ERSTELLT'").get(eintrag.planId, eintrag.periodeVon, eintrag.periodeBis);
      if (existierend) throw new Error(`Zeitraum ${eintrag.periodeVon} bis ${eintrag.periodeBis} bereits abgerechnet.`);
      const res = this.erzeugeRechnungAusLauf(plan, {
        rechnungsDatum: eintrag.rechnungsDatum,
        periodeVon: eintrag.periodeVon,
        periodeBis: eintrag.periodeBis
      });
      erstellt.push({
        planId: eintrag.planId,
        laufId: res.laufId,
        dokumentId: res.dokumentId,
        nr: res.nr,
        brutto: res.brutto
      });
    } catch (e) {
      if (!uebersprungen.some(u => u.planId === eintrag.planId)) {
        uebersprungen.push({
          planId: eintrag.planId,
          grund: e.message
        });
      }
    }
  }
  return {
    erstellt,
    sammelrechnungen,
    uebersprungen
  };
},

        async autoRunDauerrechnungen() {
  try {
    const heuteIso = new Date().toISOString().split('T')[0];
    const lastRun = db.prepare("SELECT value FROM einstellungen WHERE key='dauerrechnungen_last_auto_run'").get();
    if (lastRun && lastRun.value === heuteIso) {
      return {
        ausgefuehrt: false,
        erstellteAnzahl: 0,
        grund: 'Auto-Lauf wurde heute bereits durchgeführt.'
      };
    }
    const autoEinstellung = db.prepare("SELECT value FROM einstellungen WHERE key='dauerrechnungen_auto_erstellen'").get();
    if (autoEinstellung && autoEinstellung.value === 'false') {
      db.prepare("INSERT OR REPLACE INTO einstellungen (key, value) VALUES ('dauerrechnungen_last_auto_run', ?)").run(heuteIso);
      return {
        ausgefuehrt: false,
        erstellteAnzahl: 0,
        grund: 'Auto-Erstellung ist deaktiviert.'
      };
    }
    const ergebnis = await this.generiereFaelligeRechnungen({
      nurEntwuerfe: true,
      sammelProKunde: false
    });
    db.prepare("INSERT OR REPLACE INTO einstellungen (key, value) VALUES ('dauerrechnungen_last_auto_run', ?)").run(heuteIso);
    return {
      ausgefuehrt: true,
      erstellteAnzahl: ergebnis.erstellt.length
    };
  } catch (e) {
    console.error('Auto-Run Dauerrechnungen:', e.message);
    return {
      ausgefuehrt: false,
      erstellteAnzahl: 0,
      grund: e.message
    };
  }
}
    };
}

module.exports = createGenerationRepo;
