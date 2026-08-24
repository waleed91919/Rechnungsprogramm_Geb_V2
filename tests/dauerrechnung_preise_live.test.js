/**
 * dauerrechnung_preise_live.test.js - PO-Entscheid "Hybrid" (Plan §8.3):
 * preise_live=0 (Standard): Preis-Snapshot aus Plan-Position wird eingefroren.
 * preise_live=1: Positionen mit Artikellink nutzen den aktuellen artikel.vk
 * bei Generierung/Vorschau/Sammelrechnung.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'DAUERRECHNUNG_PREISE_LIVE_INNER_RUN';

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
    test('Dauerrechnungen Preise Live/Snapshot (DB-Ebene, via Electron-as-Node Runtime)', () => {
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

        assert.match(stdout, /DAUERRECHNUNG_PREISE_LIVE_DB_TESTS_PASSED/, 'Alle Preise-Live-Assertions müssen unter der App-Runtime bestehen');
    });
} else {
    process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `dauer-preise-live-test-${Date.now()}-${process.pid}.sqlite`);
    const { db, dbAPI } = require('../db.js');

    const eigentuemerId = Number(db.prepare("INSERT INTO kunden (name) VALUES ('Preise Eigentümer')").run().lastInsertRowid);
    const artikelId = Number(db.prepare("INSERT INTO artikel (name, vk, mwst) VALUES ('Unterhalt', 10, 19)").run().lastInsertRowid);

    function basisplan(overrides = {}) {
        return {
            name: 'Preise Plan',
            objekt_typ: 'LIEGENSCHAFT',
            objekt_id: null,
            empfaenger_kunde_id: eigentuemerId,
            rhythmus: 'MONATLICH',
            intervall_wochen: null,
            abrechnungstag: 1,
            abrechnungsmonat: null,
            abrechnungs_modus: 'NACHTRAEGLICH',
            start_datum: '2025-11-01',
            ende_datum: null,
            preis_modus: 'POSITIONEN',
            preise_live: 0,
            pauschale_netto: 0,
            mwst_satz: 19,
            zahlungsziel_tage: 14,
            als_entwurf: 1,
            aktiv: 1,
            ...overrides
        };
    }

    async function legePositionsplan(name, preiseLive, preis) {
        const res = await dbAPI.saveAbrechnungsplan(
            basisplan({ name, objekt_id: eigentuemerId, preise_live: preiseLive }),
            [{ artikelId, name: 'Unterhalt', menge: 1, einheit: 'Stk.', preis, mwst: 19 }]
        );
        return Number(res.id);
    }

    function ladePlan(planId) {
        return db.prepare('SELECT * FROM abrechnungsplaene WHERE id=?').get(planId);
    }

    function ladeDokumentPreise(dokumentId) {
        return db.prepare('SELECT preis FROM positionen WHERE dokumentId=? ORDER BY id ASC').all(dokumentId).map(p => p.preis);
    }

    test.after(() => {
        try { db.close(); } catch (_e) { /* ignore */ }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(process.env.RECHNUNGSPROGRAMM_DB_PATH + suffix, { force: true }); } catch (_e) { /* ignore */ }
        }
    });

    test('Snapshot (Standard): artikel.vk-Änderung nach Plananlage wirkt NICHT auf Generierung', async () => {
        const planId = await legePositionsplan('Snapshot Plan', 0, 10);
        db.prepare('UPDATE artikel SET vk=? WHERE id=?').run(12, artikelId);

        const gen = dbAPI.erzeugeRechnungAusLauf(ladePlan(planId), {
            rechnungsDatum: '2026-01-01', periodeVon: '2025-11-01', periodeBis: '2025-11-30'
        });
        assert.equal(ladeDokumentPreise(gen.dokumentId)[0], 10);
    });

    test('preise_live=1: Generierung nutzt aktuellen artikel.vk', async () => {
        const planId = await legePositionsplan('Live Plan', 1, 10);
        db.prepare('UPDATE artikel SET vk=? WHERE id=?').run(14, artikelId);

        const gen = dbAPI.erzeugeRechnungAusLauf(ladePlan(planId), {
            rechnungsDatum: '2026-01-01', periodeVon: '2025-12-01', periodeBis: '2025-12-31'
        });
        assert.equal(ladeDokumentPreise(gen.dokumentId)[0], 14);
    });

    test('preise_live=1: Vorschau (nettoErwartet) nutzt aktuellen artikel.vk', async () => {
        const planId = await legePositionsplan('Live Vorschau Plan', 1, 10);
        db.prepare('UPDATE artikel SET vk=? WHERE id=?').run(16, artikelId);

        const vorschau = await dbAPI.dauerrechnungenVorschau('2026-01-31');
        const eintrag = vorschau.faellig.find(f => f.planId === planId);
        assert.ok(eintrag, 'Live-Plan muss in Vorschau fällig sein');
        assert.equal(eintrag.nettoErwartet, 16);
    });

    test('preise_live=0: Vorschau bleibt beim Snapshot', async () => {
        const planId = await legePositionsplan('Snapshot Vorschau Plan', 0, 8);
        db.prepare('UPDATE artikel SET vk=? WHERE id=?').run(99, artikelId);

        const vorschau = await dbAPI.dauerrechnungenVorschau('2026-01-31');
        const eintrag = vorschau.faellig.find(f => f.planId === planId);
        assert.ok(eintrag, 'Snapshot-Plan muss in Vorschau fällig sein');
        assert.equal(eintrag.nettoErwartet, 8);
    });

    test('Sammelrechnung mischt korrekt: Live-Plan aktueller vk, Snapshot-Plan eingefroren', async () => {
        const liveId = await legePositionsplan('Sammel Live Plan', 1, 10);
        const snapId = await legePositionsplan('Sammel Snapshot Plan', 0, 20);
        db.prepare('UPDATE artikel SET vk=? WHERE id=?').run(30, artikelId);

        const res = dbAPI.erzeugeSammelrechnung(eigentuemerId, [
            { planId: liveId, periodeVon: '2026-01-01', periodeBis: '2026-01-31', rechnungsDatum: '2026-02-01' },
            { planId: snapId, periodeVon: '2026-01-01', periodeBis: '2026-01-31', rechnungsDatum: '2026-02-01' }
        ]);
        const preise = ladeDokumentPreise(res.dokumentId);
        assert.deepEqual(preise.sort((a, b) => a - b), [20, 30]);
    });

    test('PAUSCHALE: Flag speichert sauber, Pauschalenpreis unabhängig von Artikel', async () => {
        const res = await dbAPI.saveAbrechnungsplan(basisplan({
            name: 'Pauschale Live-Flag Plan',
            objekt_id: eigentuemerId,
            preis_modus: 'PAUSCHALE',
            preise_live: 1,
            pauschale_netto: 55
        }), []);
        const plan = ladePlan(Number(res.id));
        assert.equal(Number(plan.preise_live), 1);
        assert.equal(parseFloat(plan.pauschale_netto), 55);

        const gen = dbAPI.erzeugeRechnungAusLauf(plan, {
            rechnungsDatum: '2026-01-01', periodeVon: '2026-01-01', periodeBis: '2026-01-31'
        });
        assert.equal(ladeDokumentPreise(gen.dokumentId)[0], 55);
    });

    console.log('DAUERRECHNUNG_PREISE_LIVE_DB_TESTS_PASSED');
}
