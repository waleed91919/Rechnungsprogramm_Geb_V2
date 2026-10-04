const DauerrechnungController = require('../../../controllers/DauerrechnungController');
const InvoiceController = require('../../../controllers/InvoiceController');

function createPlanCrudRepo(deps) {
    const {
        db, dbQuery, dbRun, appendAuditLog, dbAPI,
        applyDocumentWrite, getDocumentWithChildren,
        baueObjektPfad, loeseObjektEmpfaengerAuf, ladeObjekteState,
        leseZuschlagsProfil, kalkuliereLvPosition, OBJEKT_EBENEN
    } = deps;

    return {
        getAbrechnungsplan(id) {
            return db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(id);
        },
        // --- Dauerrechnungen (F2) ---
async saveAbrechnungsplan(plan, positionen = []) {
  if (!plan || typeof plan !== 'object' || !plan.name || !String(plan.name).trim()) {
    throw new Error('Ungültige Plan-Daten: Name fehlt.');
  }
  if (!['LIEGENSCHAFT', 'GEBAEUDE', 'ETAGE', 'RAUM'].includes(plan.objekt_typ) || plan.objekt_id == null) {
    throw new Error('Ungültige Plan-Daten: Objekt fehlt oder ist ungültig.');
  }
  if (!['MONATLICH', 'QUARTALSWEISE', 'JAEHRLICH', 'WOCHEN_INTERVALL'].includes(plan.rhythmus)) {
    throw new Error('Ungültige Plan-Daten: Rhythmus fehlt oder ist ungültig.');
  }
  if (!plan.start_datum) {
    throw new Error('Ungültige Plan-Daten: Startdatum fehlt.');
  }
  if (plan.rhythmus === 'WOCHEN_INTERVALL' && !(parseInt(plan.intervall_wochen, 10) >= 1)) {
    throw new Error('Wochenintervall benötigt Intervall >= 1.');
  }
  if (plan.rhythmus === 'JAEHRLICH' && !(parseInt(plan.abrechnungsmonat, 10) >= 1 && parseInt(plan.abrechnungsmonat, 10) <= 12)) {
    throw new Error('Jährlicher Rhythmus benötigt Abrechnungsmonat.');
  }
  if (plan.preis_modus === 'POSITIONEN' && (!Array.isArray(positionen) || positionen.length === 0)) {
    throw new Error('POSITIONEN ohne Positionen: Bitte mindestens eine Position hinzufügen.');
  }
  if (plan.preis_modus !== 'POSITIONEN' && !((parseFloat(plan.pauschale_netto) || 0) > 0)) {
    throw new Error('PAUSCHALE ohne Betrag > 0.');
  }
  const heuteIso = new Date().toISOString().split('T')[0];
  const tx = db.transaction((p, posList) => {
    const empfaengerKundeId = Number(p.empfaenger_kunde_id);
    if (!empfaengerKundeId) {
      throw new Error('Kein Rechnungsempfänger ermittelbar – bitte Empfänger am Objekt setzen oder direkt wählen.');
    }
    let planId = p.id || null;
    const colNames = `name, objekt_typ, objekt_id, empfaenger_kunde_id, rhythmus, intervall_wochen, abrechnungstag, abrechnungsmonat, abrechnungs_modus, start_datum, ende_datum, preis_modus, preise_live, pauschale_netto, mwst_satz, zahlungsziel_tage, als_entwurf, aktiv, bemerkung, naechste_lauf_am`;
    const colPlaceholders = `?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`;
    const values = [p.name.trim(), p.objekt_typ, Number(p.objekt_id), empfaengerKundeId, p.rhythmus, p.rhythmus === 'WOCHEN_INTERVALL' ? parseInt(p.intervall_wochen, 10) : null, parseInt(p.abrechnungstag, 10) || 1, p.rhythmus === 'JAEHRLICH' ? parseInt(p.abrechnungsmonat, 10) : null, ['NACHTRAEGLICH', 'VORAUS'].includes(p.abrechnungs_modus) ? p.abrechnungs_modus : 'NACHTRAEGLICH', p.start_datum, p.ende_datum || null, p.preis_modus === 'POSITIONEN' ? 'POSITIONEN' : 'PAUSCHALE', p.preise_live === 1 || p.preise_live === true ? 1 : 0, parseFloat(p.pauschale_netto) || 0, [0, 7, 19].includes(parseInt(p.mwst_satz, 10)) ? parseInt(p.mwst_satz, 10) : 19, parseInt(p.zahlungsziel_tage, 10) >= 0 ? parseInt(p.zahlungsziel_tage, 10) : 14, p.als_entwurf === 0 || p.als_entwurf === false ? 0 : 1, p.aktiv === 0 ? 0 : 1, p.bemerkung || null, DauerrechnungController.berechneNaechstenTermin({
      ...p,
      letzte_lauf_am: p.letzte_lauf_am || null
    }, heuteIso)];
    try {
      if (planId) {
        const existing = db.prepare('SELECT letzte_lauf_am FROM abrechnungsplaene WHERE id=?').get(planId);
        if (!existing) throw new Error(`Abrechnungsplan #${planId} wurde nicht gefunden.`);
        values[values.length - 1] = DauerrechnungController.berechneNaechstenTermin({
          ...p,
          letzte_lauf_am: p.letzte_lauf_am != null ? p.letzte_lauf_am : existing.letzte_lauf_am
        }, heuteIso);
        db.prepare(`UPDATE abrechnungsplaene SET ${colNames.split(',').map(c => `${c.trim()}=?`).join(', ')} WHERE id=?`).run(...values, planId);
      } else {
        const res = db.prepare(`INSERT INTO abrechnungsplaene (${colNames}) VALUES (${colPlaceholders})`).run(...values);
        planId = res.lastInsertRowid;
      }
    } catch (e) {
      if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Plan mit diesem Namen existiert für dieses Objekt bereits.');
      }
      throw e;
    }
    db.prepare('DELETE FROM abrechnungsplan_positionen WHERE plan_id=?').run(planId);
    const insertPos = db.prepare('INSERT INTO abrechnungsplan_positionen (plan_id, artikelId, name, menge, einheit, preis, mwst, sortier_index, lv_position_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    (posList || []).forEach((pos, idx) => {
      insertPos.run(planId, pos.artikelId ? Number(pos.artikelId) : null, pos.name || null, parseFloat(pos.menge) || 0, pos.einheit || 'Stk.', parseFloat(pos.preis) || 0, parseInt(pos.mwst, 10) || 0, idx, pos.lv_position_id == null ? null : Number(pos.lv_position_id));
    });
    appendAuditLog({
      entityType: 'ABRECHNUNGSPLAN',
      entityId: planId,
      action: plan.id ? 'GEÄNDERT' : 'ERSTELLT',
      details: {
        name: p.name.trim(),
        objektTyp: p.objekt_typ,
        objektId: Number(p.objekt_id),
        rhythmus: p.rhythmus,
        preiseLive: p.preise_live === 1 || p.preise_live === true ? 1 : 0
      }
    });
    return planId;
  });
  const id = tx(plan, positionen);
  const gespeichert = db.prepare('SELECT naechste_lauf_am FROM abrechnungsplaene WHERE id=?').get(id);
  return {
    id,
    naechste_lauf_am: gespeichert ? gespeichert.naechste_lauf_am : null
  };
},

        async getAbrechnungsplaene(filter = {}) {
  let rows = await dbQuery('SELECT * FROM abrechnungsplaene ORDER BY name ASC');
  if (filter.objektTyp) rows = rows.filter(p => p.objekt_typ === filter.objektTyp);
  if (filter.objektId != null) rows = rows.filter(p => p.objekt_id === Number(filter.objektId));
  if (filter.aktiv !== undefined && filter.aktiv !== null && filter.aktiv !== '') {
    rows = rows.filter(p => p.aktiv === (Number(filter.aktiv) ? 1 : 0));
  }
  if (filter.nurFaellig) {
    const heuteIso = new Date().toISOString().split('T')[0];
    rows = rows.filter(p => p.aktiv === 1 && p.naechste_lauf_am && p.naechste_lauf_am <= heuteIso);
  }
  const posRows = await dbQuery('SELECT * FROM abrechnungsplan_positionen ORDER BY sortier_index ASC');
  for (const p of rows) {
    p.positionen = posRows.filter(pos => pos.plan_id === p.id);
    p.objektPfad = baueObjektPfad(p.objekt_typ, p.objekt_id);
    const kunde = db.prepare('SELECT id, name FROM kunden WHERE id=?').get(p.empfaenger_kunde_id);
    p.empfaengerName = kunde ? kunde.name : null;
  }
  return rows;
},

        async deleteAbrechnungsplan(id) {
  const tx = db.transaction(planId => {
    const plan = db.prepare('SELECT id, name FROM abrechnungsplaene WHERE id=?').get(planId);
    if (!plan) throw new Error('Ungültige Plan-ID');
    const laeufe = db.prepare('SELECT COUNT(*) AS c FROM dauerrechnung_laeufe WHERE plan_id=?').get(planId).c;
    if (laeufe > 0) {
      throw new Error('Plan hat Läufe und kann nicht gelöscht werden – bitte deaktivieren.');
    }
    db.prepare('DELETE FROM abrechnungsplan_positionen WHERE plan_id=?').run(planId);
    db.prepare('DELETE FROM abrechnungsplaene WHERE id=?').run(planId);
    return {
      changes: 1
    };
  });
  return tx(id);
},

        async updateAbrechnungsplanStatus(id, aktiv) {
  if (typeof id !== 'number') throw new Error('Ungültige Plan-ID');
  const tx = db.transaction((planId, neuerStatus) => {
    const plan = db.prepare('SELECT id, name, aktiv FROM abrechnungsplaene WHERE id=?').get(planId);
    if (!plan) throw new Error('Ungültige Plan-ID');
    db.prepare('UPDATE abrechnungsplaene SET aktiv=? WHERE id=?').run(neuerStatus ? 1 : 0, planId);
    appendAuditLog({
      entityType: 'ABRECHNUNGSPLAN',
      entityId: planId,
      action: neuerStatus ? 'AKTIVIERT' : 'DEAKTIVIERT',
      details: {
        name: plan.name
      }
    });
    return {
      success: true,
      id: planId
    };
  });
  return tx(id, !!aktiv);
},

        async getPlanLaeufe(planId) {
  if (typeof planId !== 'number') throw new Error('Ungültige Plan-ID');
  return await dbQuery(`
            SELECT l.*, d.nr AS dokumentNr, d.brutto AS dokumentBrutto, d.status AS dokumentStatus, d.isLocked AS dokumentLocked
            FROM dauerrechnung_laeufe l
            LEFT JOIN dokumente d ON d.id = l.dokument_id
            WHERE l.plan_id = ?
            ORDER BY l.rechnungs_datum DESC, l.id DESC
        `, [planId]);
},

        _ladePlanPositionen(planId) {
  return db.prepare('SELECT * FROM abrechnungsplan_positionen WHERE plan_id=? ORDER BY sortier_index ASC').all(planId);
},

        _ladePlanPositionenFuerGenerierung(plan) {
  const rows = this._ladePlanPositionen(plan.id);
  if (Number(plan.preise_live) !== 1) return rows;
  const artStmt = db.prepare('SELECT id, vk FROM artikel WHERE id=?');
  return rows.map(p => {
    if (p.lv_position_id != null) {
      const lvPos = db.prepare('SELECT * FROM lv_positionen WHERE id=?').get(p.lv_position_id);
      if (!lvPos) return p;
      const kalk = kalkuliereLvPosition(lvPos, leseZuschlagsProfil(), ladeObjekteState());
      return {
        ...p,
        preis: kalk.nettoMonat
      };
    }
    if (!p.artikelId) return p;
    const art = artStmt.get(p.artikelId);
    return art && art.vk != null ? {
      ...p,
      preis: art.vk
    } : p;
  });
},

        async uebernehmeLvInAbrechnungsplan(payload = {}) {
  const objektTyp = payload.objekt_typ;
  if (!OBJEKT_EBENEN[objektTyp]) throw new Error('Ungültiger Objekttyp');
  const oid = Number(payload.objekt_id);
  if (!Number.isInteger(oid)) throw new Error('Ungültige Objekt-ID');
  const empfaenger = loeseObjektEmpfaengerAuf(objektTyp, oid);
  if (!empfaenger || !empfaenger.kundeId) {
    throw new Error('Kein Rechnungsempfänger ermittelbar – bitte Empfänger am Objekt setzen oder direkt wählen.');
  }
  const putzplan = await this.getPutzplan(objektTyp, oid);
  const nurIds = Array.isArray(payload.nur_position_ids) && payload.nur_position_ids.length > 0 ? new Set(payload.nur_position_ids.map(Number)) : null;
  const planPositionen = [];
  for (const bereich of putzplan.bereiche) {
    if (bereich.aktiv === 0) continue;
    for (const pos of bereich.positionen) {
      if (nurIds && !nurIds.has(pos.id)) continue;
      planPositionen.push({
        name: `[${bereich.name}] ${pos.bezeichnung}`,
        menge: 1,
        einheit: 'Monat',
        preis: pos.kalkulation.nettoMonat,
        mwst: pos.mwst,
        lv_position_id: pos.id
      });
    }
  }
  if (planPositionen.length === 0) throw new Error('Kein LV-Inhalt zum Übernehmen vorhanden.');
  let planId = payload.plan_id ? Number(payload.plan_id) : null;
  let planName;
  if (planId) {
    const existing = db.prepare('SELECT id, name FROM abrechnungsplaene WHERE id=?').get(planId);
    if (!existing) throw new Error(`Abrechnungsplan #${planId} wurde nicht gefunden.`);
    planName = existing.name;
  } else {
    planName = `${putzplan.objektPfad} – Reinigungs-LV`;
  }
  const heuteIso = new Date().toISOString().split('T')[0];
  const rhythmus = ['MONATLICH', 'QUARTALSWEISE', 'JAEHRLICH'].includes(payload.rhythmus) ? payload.rhythmus : 'MONATLICH';
  const plan = {
    id: planId,
    name: planName,
    objekt_typ: objektTyp,
    objekt_id: oid,
    empfaenger_kunde_id: empfaenger.kundeId,
    rhythmus,
    abrechnungstag: parseInt(payload.abrechnungstag, 10) || 1,
    abrechnungs_modus: 'NACHTRAEGLICH',
    start_datum: payload.start_datum || heuteIso,
    preis_modus: 'POSITIONEN',
    preise_live: 1,
    pauschale_netto: 0,
    mwst_satz: parseInt(payload.mwst, 10) || 19,
    zahlungsziel_tage: payload.zahlungsziel_tage != null ? parseInt(payload.zahlungsziel_tage, 10) : 14,
    als_entwurf: 1,
    aktiv: 1
  };
  const res = await this.saveAbrechnungsplan(plan, planPositionen);
  const monatsNetto = Math.round(planPositionen.reduce((s, p) => s + (parseFloat(p.preis) || 0), 0) * 100) / 100;
  return {
    planId: res.id,
    anzahlPositionen: planPositionen.length,
    monatsNetto,
    naechste_lauf_am: res.naechste_lauf_am
  };
},

        async dauerrechnungenVorschau(stichdatum) {
  const stichdatumIso = stichdatum || new Date().toISOString().split('T')[0];
  const plaene = db.prepare('SELECT * FROM abrechnungsplaene WHERE aktiv=1 ORDER BY id ASC').all();
  const faellig = [];
  let gesamtNetto = 0;
  for (const plan of plaene) {
    const virtuellesPlan = {
      ...plan
    };
    for (let i = 0; i < 120; i++) {
      const termin = DauerrechnungController.berechneNaechstenTermin(virtuellesPlan, null);
      if (!termin || termin > stichdatumIso) break;
      const zeitraum = DauerrechnungController.berechneLeistungszeitraum(virtuellesPlan, termin);
      if (zeitraum.periodeVon <= zeitraum.periodeBis) {
        const bereitsErstellt = db.prepare("SELECT id FROM dauerrechnung_laeufe WHERE plan_id=? AND periode_von=? AND periode_bis=? AND status='ERSTELLT'").get(plan.id, zeitraum.periodeVon, zeitraum.periodeBis);
        if (!bereitsErstellt) {
          const positionenDb = plan.preis_modus === 'POSITIONEN' ? this._ladePlanPositionenFuerGenerierung(plan).map(p => ({
            artikelId: p.artikelId,
            name: p.name,
            menge: p.menge,
            einheit: p.einheit,
            preis: p.preis,
            mwst: p.mwst
          })) : [];
          const positionsListe = DauerrechnungController.berechnePositionsListe(plan, positionenDb);
          const nettoErwartet = Math.round(positionsListe.reduce((s, pos) => s + (parseFloat(pos.menge) || 0) * (parseFloat(pos.preis) || 0), 0) * 100) / 100;
          const kunde = db.prepare('SELECT id, name FROM kunden WHERE id=?').get(plan.empfaenger_kunde_id);
          faellig.push({
            planId: plan.id,
            planName: plan.name,
            objektPfad: baueObjektPfad(plan.objekt_typ, plan.objekt_id),
            empfaengerKundeId: plan.empfaenger_kunde_id,
            empfaengerName: kunde ? kunde.name : null,
            rechnungsDatum: termin,
            periodeVon: zeitraum.periodeVon,
            periodeBis: zeitraum.periodeBis,
            nettoErwartet,
            gruppeKundeId: plan.empfaenger_kunde_id
          });
          gesamtNetto += nettoErwartet;
        }
      }
      if (termin >= stichdatumIso) break;
      virtuellesPlan.letzte_lauf_am = termin;
    }
  }
  return {
    faellig,
    gesamtNetto: Math.round(gesamtNetto * 100) / 100
  };
}
    };
}

module.exports = createPlanCrudRepo;
