/**
 * reinigungslv_crud.test.js - F3: LV-Bereiche/Positionen/Putzplan-Einträge CRUD,
 * Löschschutz, Audit + Integration Übernahme in Abrechnungsplan mit Live-Preisen.
 * (Electron-as-Node-Wrapper-Muster, Vorbild dauerrechnung_crud.test.js)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'REINIGUNG_CRUD_INNER_RUN';

function canLoadBetterSqlite() {
    try {
        const DbCtor = require('better-sqlite3');
        const probe = new DbCtor(':memory:');
        probe.close();
        return true;
    } catch (_e) {
        return false;
    }
}

if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('Reinigungs-LV CRUD + Integration (DB-Ebene, via Electron-as-Node Runtime)', () => {
        const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
        assert.ok(fs.existsSync(electronBin), 'Electron-Binary muss als Node-Runtime verfügbar sein');

        const stdout = execFileSync(
            electronBin,
            [path.join(__filename), `--${RUN_INNER_MARKER}`],
            {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
                encoding: 'utf-8',
                maxBuffer: 64 * 1024 * 1024,
                timeout: 180000
            }
        );

        assert.match(stdout, /REINIGUNG_CRUD_DB_TESTS_PASSED/, 'Alle CRUD-/Integrations-Assertions müssen unter der App-Runtime bestehen');
    });
} else {
    process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `reinigung-crud-test-${Date.now()}-${process.pid}.sqlite`);
    const { db, dbAPI, verifiziereAuditKette } = require('../db.js');

    const kundeId = Number(db.prepare("INSERT INTO kunden (name) VALUES ('LV-Empfänger')").run().lastInsertRowid);
    const liegId = Number(db.prepare("INSERT INTO liegenschaften (name, empfaenger_kunde_id) VALUES ('Test-Liegenschaft', ?)").run(kundeId).lastInsertRowid);
    const gebId = Number(db.prepare("INSERT INTO gebaeude (liegenschaft_id, name) VALUES (?, 'Haus A')").run(liegId).lastInsertRowid);
    const etageId = Number(db.prepare("INSERT INTO etagen (gebaeude_id, name) VALUES (?, 'EG')").run(gebId).lastInsertRowid);
    const raum1Id = Number(db.prepare("INSERT INTO raeume (etage_id, name, flaeche, einheit) VALUES (?, 'Büro 1', 500, 'm²')").run(etageId).lastInsertRowid);
    const raum2Id = Number(db.prepare("INSERT INTO raeume (etage_id, name, flaeche, einheit) VALUES (?, 'Flur', 100, 'm²')").run(etageId).lastInsertRowid);

    function basisPosition(overrides = {}) {
        return {
            bereich_id: null,
            bezeichnung: 'Unterhaltsreinigung Großraumfläche',
            menge: 500,
            menge_einheit: 'm²',
            turnus_typ: 'X_PRO_WOCHE',
            turnus_wert: 5,
            zeitbedarf_min_je_einheit: 1.0,
            kalk_stundensatz: 15.0,
            zuschlaege_json: JSON.stringify({ nacht: 10 }),
            mwst: 19,
            ...overrides
        };
    }

    async function legeReferenzLvAn(name = 'Unterhaltsreinigung') {
        const bereichId = await dbAPI.saveLvBereich({
            objekt_typ: 'LIEGENSCHAFT',
            objekt_id: liegId,
            name,
            positionsnr_prefix: '01.'
        });
        return { bereichId, name };
    }

    test.after(() => {
        try { db.close(); } catch (_e) { /* ignore */ }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(process.env.RECHNUNGSPROGRAMM_DB_PATH + suffix, { force: true }); } catch (_e) { /* ignore */ }
        }
    });

    test('CRUD Bereich: anlegen, UNIQUE(objekt,name) mit deutscher Meldung, Audit-Kette valid', async () => {
        const id = await dbAPI.saveLvBereich({ objekt_typ: 'LIEGENSCHAFT', objekt_id: liegId, name: 'Glasreinigung' });
        assert.ok(id > 0);
        assert.equal(verifiziereAuditKette().valid, true);

        await assert.rejects(
            () => dbAPI.saveLvBereich({ objekt_typ: 'LIEGENSCHAFT', objekt_id: liegId, name: 'Glasreinigung' }),
            /Leistungsbereich mit diesem Namen existiert an diesem Objekt bereits/
        );
        await assert.rejects(() => dbAPI.saveLvBereich({ objekt_typ: 'LIEGENSCHAFT', objekt_id: liegId, name: '  ' }), /Bereichsnamen/);

        const zweitesObjekt = await dbAPI.saveLvBereich({ objekt_typ: 'GEBAEUDE', objekt_id: gebId, name: 'Glasreinigung' });
        assert.ok(zweitesObjekt > 0, 'Gleicher Name an anderem Objekt muss erlaubt sein');
    });

    test('CRUD Position: Referenzfall-Kalkulation, Validierungen, Einträge mit UNIQUE-Schutz', async () => {
        const { bereichId } = await legeReferenzLvAn();

        const res = await dbAPI.saveLvPosition(basisPosition({ bereich_id: bereichId }), []);
        assert.ok(res.id > 0);
        assert.equal(res.kalkulation.quelle, 'POSITION');
        assert.equal(res.kalkulation.nettoJahrInklZuschlaege, 33475.00);
        assert.equal(res.kalkulation.nettoMonat, 2789.58);

        await assert.rejects(() => dbAPI.saveLvPosition(basisPosition({ bereich_id: bereichId, bezeichnung: '' }), []), /Bezeichnung/);
        await assert.rejects(() => dbAPI.saveLvPosition(basisPosition({ bereich_id: bereichId, turnus_wert: 0 }), []), /Turnus-Wert/);
        await assert.rejects(
            () => dbAPI.saveLvPosition(basisPosition({ bereich_id: bereichId, zuschlaege_json: JSON.stringify({ nachtschicht: 10 }) }), []),
            /Unbekannter Zuschlagstyp/
        );
        await assert.rejects(
            () => dbAPI.saveLvPosition(basisPosition({ bereich_id: bereichId, zuschlaege_json: JSON.stringify({ nacht: 120 }) }), []),
            /zwischen 0 und 100/
        );
        await assert.rejects(() => dbAPI.saveLvPosition(basisPosition({ bereich_id: 999999 }), []), /Leistungsbereich wurde nicht gefunden/);

        const eintraegeRes = await dbAPI.saveLvPosition(basisPosition({ bereich_id: bereichId, bezeichnung: 'Flurreinigung' }), [
            { objekt_typ: 'RAUM', objekt_id: raum1Id, menge_override: null, turnus_typ: 'X_PRO_WOCHE', turnus_wert: 3 },
            { objekt_typ: 'RAUM', objekt_id: raum2Id, menge_override: 55, turnus_typ: 'X_PRO_WOCHE', turnus_wert: 5 }
        ]);
        assert.equal(eintraegeRes.kalkulation.quelle, 'EINTRAG');
        assert.equal(eintraegeRes.kalkulation.eintraege[0].menge, 500, 'Auto-Menge aus Raumfläche');
        assert.equal(eintraegeRes.kalkulation.eintraege[1].menge, 55, 'Override-Menge');

        await assert.rejects(
            () => dbAPI.saveLvPosition(basisPosition({ bereich_id: bereichId, bezeichnung: 'Duplikat' }), [
                { objekt_typ: 'RAUM', objekt_id: raum1Id, turnus_wert: 1 },
                { objekt_typ: 'RAUM', objekt_id: raum1Id, turnus_wert: 2 }
            ]),
            /Position ist diesem Objekt bereits zugeordnet/
        );
        await assert.rejects(
            () => dbAPI.saveLvPosition(basisPosition({ bereich_id: bereichId, bezeichnung: 'Falsches-Objekt' }), [
                { objekt_typ: 'SCHIFF', objekt_id: 1, turnus_wert: 1 }
            ]),
            /Ungültige Zuordnung/
        );

        const plan = await dbAPI.getPutzplan('LIEGENSCHAFT', liegId);
        assert.equal(plan.objektPfad.includes('Test-Liegenschaft'), true);
        assert.equal(plan.empfaenger.kundeId, kundeId);
        const bereiche = plan.bereiche.filter(b => b.id === bereichId || b.name === 'Unterhaltsreinigung');
        assert.equal(bereiche.length, 1);
        const posRows = bereiche[0].positionen;
        assert.equal(posRows.length, 2);
        assert.ok(posRows.every(p => p.kalkulation));
        assert.equal(plan.summen.positionenAnzahl >= 2, true);
        assert.equal(verifiziereAuditKette().valid, true);
    });

    test('FK: unbekannte bereich_id auf DB-Ebene wirft FOREIGN KEY', () => {
        assert.throws(
            () => db.prepare(`INSERT INTO lv_positionen (bereich_id, bezeichnung, turnus_wert) VALUES (999999, 'Geist', 1)`).run(),
            /FOREIGN KEY/i
        );
    });

    test('CASCADE: Bereich-Löschung entfernt Positionen und Putzplan-Einträge', async () => {
        const bereichId = await dbAPI.saveLvBereich({ objekt_typ: 'ETAGE', objekt_id: etageId, name: 'Sonderleistungen' });
        const posRes = await dbAPI.saveLvPosition(basisPosition({ bereich_id: bereichId, bezeichnung: 'Fenster' }), [
            { objekt_typ: 'RAUM', objekt_id: raum1Id, turnus_wert: 2 }
        ]);
        const eintragCount = db.prepare('SELECT COUNT(*) c FROM putzplan_eintraege WHERE position_id=?').get(posRes.id).c;
        assert.equal(eintragCount, 1);

        const del = await dbAPI.deleteLvBereich(bereichId);
        assert.equal(del.changes, 1);
        assert.equal(db.prepare('SELECT COUNT(*) c FROM lv_positionen WHERE bereich_id=?').get(bereichId).c, 0);
        assert.equal(db.prepare('SELECT COUNT(*) c FROM putzplan_eintraege WHERE position_id=?').get(posRes.id).c, 0);
        assert.equal(verifiziereAuditKette().valid, true);
    });

    test('deleteLvPosition mit Abrechnungsplan-Verlinkung blockiert, danach freigeben', async () => {
        const bereichId = await dbAPI.saveLvBereich({ objekt_typ: 'RAUM', objekt_id: raum1Id, name: 'Raumbereich' });
        const posRes = await dbAPI.saveLvPosition(basisPosition({ bereich_id: bereichId, bezeichnung: 'Verlinkte Leistung', menge: 100, turnus_wert: 1, zuschlaege_json: null }), []);

        const planId = Number(db.prepare(`
            INSERT INTO abrechnungsplaene (name, objekt_typ, objekt_id, empfaenger_kunde_id, rhythmus, start_datum, preis_modus, pauschale_netto)
            VALUES ('Blocker-Plan', 'LIEGENSCHAFT', ?, ?, 'MONATLICH', '2026-01-01', 'PAUSCHALE', 99)`).run(liegId, kundeId).lastInsertRowid);
        db.prepare('INSERT INTO abrechnungsplan_positionen (plan_id, name, lv_position_id) VALUES (?, ?, ?)').run(planId, 'X', posRes.id);

        await assert.rejects(
            () => dbAPI.deleteLvPosition(posRes.id),
            err => {
                assert.match(err.message, /verlinkt – bitte zuerst dort entfernen/);
                return true;
            }
        );

        db.prepare('DELETE FROM abrechnungsplan_positionen WHERE lv_position_id=?').run(posRes.id);
        const del = await dbAPI.deleteLvPosition(posRes.id);
        assert.equal(del.changes, 1);
    });

    test('Objekt-Löschschutz: Liegenschaft mit LV-Daten blockiert, ohne Daten löschbar', async () => {
        await assert.rejects(() => dbAPI.deleteLiegenschaft(liegId), /enthält Putzplan-\/LV-Daten und kann nicht gelöscht werden/);

        const freieLieg = Number(db.prepare("INSERT INTO liegenschaften (name) VALUES ('Freie Liegenschaft')").run().lastInsertRowid);
        const del = await dbAPI.deleteLiegenschaft(freieLieg);
        assert.equal(del.changes, 1);
        assert.equal(verifiziereAuditKette().valid, true);
    });

    test('Integration: Übernahme in Abrechnungsplan + Live-Preise über F2-Generierung', async () => {
        const profilOriginal = await dbAPI.getZuschlagsProfil();
        assert.equal(profilOriginal.standard_stundensatz, 15.0);

        const bereichName = 'Unterhaltsreinigung Integration';
        const { bereichId } = await legeReferenzLvAn(bereichName);
        const posA = await dbAPI.saveLvPosition(basisPosition({ bereich_id: bereichId, kalk_stundensatz: 0 }), []);
        const posB = await dbAPI.saveLvPosition(basisPosition({
            bereich_id: bereichId,
            bezeichnung: 'Glasreinigung Innen',
            menge: 100,
            turnus_wert: 2,
            zeitbedarf_min_je_einheit: 2,
            kalk_stundensatz: 18.4,
            zuschlaege_json: null
        }), []);

        const liegOhneEmpfaenger = Number(db.prepare("INSERT INTO liegenschaften (name) VALUES ('Ohne Empfänger')").run().lastInsertRowid);
        await assert.rejects(
            () => dbAPI.uebernehmeLvInAbrechnungsplan({ objekt_typ: 'LIEGENSCHAFT', objekt_id: liegOhneEmpfaenger }),
            /Kein Rechnungsempfänger ermittelbar/
        );

        const jetzt = new Date();
        const vorMonat = new Date(jetzt.getFullYear(), jetzt.getMonth() - 1, 1);
        const startDatum = `${vorMonat.getFullYear()}-${String(vorMonat.getMonth() + 1).padStart(2, '0')}-01`;
        const uebernahme = await dbAPI.uebernehmeLvInAbrechnungsplan({
            objekt_typ: 'LIEGENSCHAFT',
            objekt_id: liegId,
            start_datum: startDatum,
            nur_position_ids: [posA.id, posB.id]
        });

        assert.ok(uebernahme.planId > 0);
        assert.equal(uebernahme.anzahlPositionen, 2);
        const erwartetesMonatsNetto = Math.round((posA.kalkulation.nettoMonat + posB.kalkulation.nettoMonat) * 100) / 100;
        assert.equal(uebernahme.monatsNetto, erwartetesMonatsNetto);
        assert.ok(uebernahme.naechste_lauf_am);

        const plaene = await dbAPI.getAbrechnungsplaene({ objektTyp: 'LIEGENSCHAFT', objektId: liegId });
        const lvPlan = plaene.find(p => p.id === uebernahme.planId);
        assert.ok(lvPlan, 'Plan muss existieren');
        assert.equal(lvPlan.preis_modus, 'POSITIONEN');
        assert.equal(Number(lvPlan.preise_live), 1);
        assert.equal(lvPlan.positionen.length, 2);
        assert.ok(lvPlan.positionen.every(p => p.lv_position_id != null));
        const posARow = lvPlan.positionen.find(p => p.lv_position_id === posA.id);
        assert.equal(posARow.preis, posA.kalkulation.nettoMonat);

        assert.equal(verifiziereAuditKette().valid, true);

        const generierung1 = await dbAPI.generiereFaelligeRechnungen({ planIds: [lvPlan.id], nurEntwuerfe: false });
        assert.equal(generierung1.erstellt.length, 1, `Genau 1 Lauf erwartet, erhalten: ${JSON.stringify(generierung1)}`);
        const dokumentId1 = generierung1.erstellt[0].dokumentId;
        const posDok1 = db.prepare('SELECT name, menge, einheit, preis FROM positionen WHERE dokumentId=? ORDER BY id').all(dokumentId1);
        assert.equal(posDok1.length, 2);
        assert.equal(posDok1[0].menge, 1);
        assert.equal(posDok1[0].einheit, 'Monat');
        assert.ok(posDok1[0].name.startsWith('[' + bereichName + ']'));
        const preisA1 = posDok1.find(p => p.name.includes('Großraumfläche')).preis;
        assert.equal(preisA1, posA.kalkulation.nettoMonat);
        const hashVorher = db.prepare('SELECT sha256_hash FROM dokumente WHERE id=?').get(dokumentId1).sha256_hash;
        assert.ok(hashVorher);

        await dbAPI.saveZuschlagsProfil({ ...profilOriginal, standard_stundensatz: 16.0 });
        const profilNeu = await dbAPI.getZuschlagsProfil();
        assert.equal(profilNeu.standard_stundensatz, 16.0);

        const frischePreise = dbAPI._ladePlanPositionenFuerGenerierung(db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(lvPlan.id));
        const neuerPosAPreis = frischePreise.find(p => p.lv_position_id === posA.id).preis;
        assert.ok(neuerPosAPreis > posA.kalkulation.nettoMonat, `Live-Preis muss nach Satzerhöhung steigen (${neuerPosAPreis} vs ${posA.kalkulation.nettoMonat})`);

        const laufRow = db.prepare('SELECT * FROM dauerrechnung_laeufe WHERE plan_id=? AND status=\'ERSTELLT\'').get(lvPlan.id);
        db.prepare('DELETE FROM dauerrechnung_laeufe WHERE id=?').run(laufRow.id);
        db.prepare('DELETE FROM positionen WHERE dokumentId=?').run(dokumentId1);
        db.prepare('DELETE FROM rechnung_verrechnungen WHERE aktuelle_rechnung_id=?').run(dokumentId1);
        db.prepare('DELETE FROM dokumente WHERE id=?').run(dokumentId1);
        db.prepare('UPDATE abrechnungsplaene SET letzte_lauf_am=NULL WHERE id=?').run(lvPlan.id);

        const generierung2 = await dbAPI.generiereFaelligeRechnungen({ planIds: [lvPlan.id], nurEntwuerfe: false });
        assert.equal(generierung2.erstellt.length, 1);
        const dokumentId2 = generierung2.erstellt[0].dokumentId;
        const posDok2 = db.prepare('SELECT name, preis FROM positionen WHERE dokumentId=? ORDER BY id').all(dokumentId2);
        const preisA2 = posDok2.find(p => p.name.includes('Großraumfläche')).preis;

        const profilAktuell = leseProfilFuerTest();
        const einsaetze = 260;
        const stunden = 500 * 1.0 * einsaetze / 60;
        const nettoJahr = Math.round(stunden * 16.0 * 100) / 100;
        const zs = Math.round(stunden * 0.10 * 0.30 * 16.0 * 100) / 100;
        const erwarteterPreisA2 = Math.round((nettoJahr + zs) / 12 * 100) / 100;
        assert.equal(profilAktuell.standard_stundensatz, 16.0);
        assert.equal(preisA2, erwarteterPreisA2, `Belegpreis muss neuem Stundensatz folgen (${preisA2} vs ${erwarteterPreisA2})`);

        await dbAPI.saveZuschlagsProfil(profilOriginal);
        assert.equal(verifiziereAuditKette().valid, true);
    });

    function leseProfilFuerTest() {
        return JSON.parse(db.prepare("SELECT value FROM einstellungen WHERE key='reinigung_zuschlagsprofil'").get().value);
    }

    console.log('REINIGUNG_CRUD_DB_TESTS_PASSED');
}
