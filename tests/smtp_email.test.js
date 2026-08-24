/**
 * smtp_email.test.js - F10: SMTP-E-Mail-Versand
 * Pure Teile (Transport-Optionen, Templates, Fehlerübersetzung, Crypto-Fallback) in Plain Node;
 * DB/Service-Teile via Electron-as-Node-Wrapper (Vorbild dauerrechnung_crud.test.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
    baueTransportOptionen,
    baueStandardText,
    uebersetzeSmtpFehler,
    normalisierePdfBuffer,
    createEmailService,
    DEFAULT_CRYPTO_ADAPTER
} = require('../main/email.js');

const IS_ELECTRON_AS_NODE = !!process.versions.electron;
const RUN_INNER_MARKER = 'SMTP_EMAIL_INNER_RUN';

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

test('baueTransportOptionen: Port 465 erzwingt secure:true; 587 bleibt STARTTLS; Timeouts + TLS-Härtung', () => {
    const o465 = baueTransportOptionen({ host: 'mail.example.de', port: 465, secure: false });
    assert.equal(o465.secure, true);
    const o587 = baueTransportOptionen({ host: 'mail.example.de', port: 587, secure: false });
    assert.equal(o587.secure, false);
    const o587s = baueTransportOptionen({ host: 'x', port: 587, secure: true });
    assert.equal(o587s.secure, true);
    for (const o of [o465, o587]) {
        assert.equal(o.connectionTimeout, 15000);
        assert.equal(o.greetingTimeout, 15000);
        assert.equal(o.socketTimeout, 30000);
        assert.deepEqual(o.tls, { minVersion: 'TLSv1.2', rejectUnauthorized: true });
    }
});

test('baueStandardText: Platzhalter ersetzt, deutsches Betragsformat, unbekannt -> leer, Mehrfachvorkommen', () => {
    const text = baueStandardText('RECHNUNG', {
        kunde_name: 'Müller GmbH',
        nummer: 'INV-2026-042',
        datum: '2026-08-24',
        faelligkeit: '2026-09-07',
        betrag_brutto: 1234.56,
        firmenname: 'W-LINK ERP'
    });
    assert.match(text, /Rechnung INV-2026-042 vom 2026-08-24 über 1\.234,56 €/);
    assert.match(text, /fällig am 2026-09-07/);
    assert.match(text, /Guten Tag Müller GmbH/);
    assert.ok(!text.includes('{{'));

    const mehrfach = baueStandardText('X', { nummer: 'A-1' }, 'Nr {{nummer}} und nochmal {{nummer}}, unbekannt {{gibtsnicht}} Ende');
    assert.equal(mehrfach, 'Nr A-1 und nochmal A-1, unbekannt  Ende');

    assert.ok(baueStandardText('MAHNUNG', { kunde_name: 'K' }).includes('noch offen'));
});

test('uebersetzeSmtpFehler: deutsche Meldungen je Fehlerbild', () => {
    const e = c => uebersetzeSmtpFehler(c);
    assert.match(e({ code: 'ETIMEDOUT', message: 'Connection timeout' }), /Zeitüberschreitung beim Verbindungsaufbau – Firewall\/Port blockiert\?/);
    assert.match(e({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }), /Verbindung abgelehnt – Host\/Port prüfen\./);
    assert.match(e({ code: 'EAUTH', message: '535 Authentication failed' }), /Anmeldung fehlgeschlagen – Benutzer\/App-Passwort prüfen\./);
    assert.match(e({ code: 'ESOCKET', message: 'TLS handshake failed' }), /TLS-\/Zertifikatsfehler/);
    assert.match(e({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND smtp.x' }), /Server nicht gefunden/);
    assert.equal(e(new Error('Irgendwas')), 'Irgendwas');
});

test('normalisierePdfBuffer: Buffer/ArrayBuffer/TypedArray akzeptiert, Müll verworfen', () => {
    const buf = Buffer.from('%PDF-1.7 test');
    assert.ok(Buffer.isBuffer(normalisierePdfBuffer(buf)));
    assert.ok(Buffer.isBuffer(normalisierePdfBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))));
    assert.ok(Buffer.isBuffer(normalisierePdfBuffer(new Uint8Array([37, 80, 68, 70]))));
    assert.equal(normalisierePdfBuffer(null), null);
    assert.equal(normalisierePdfBuffer('kein buffer'), null);
    assert.equal(normalisierePdfBuffer(new ArrayBuffer(0)), null);
});

if (!IS_ELECTRON_AS_NODE && !canLoadBetterSqlite()) {
    test('SMTP DB/Service-Tests (via Electron-as-Node Runtime)', () => {
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

        assert.match(stdout, /SMTP_EMAIL_DB_TESTS_PASSED/, 'Alle SMTP-Assertions müssen unter der App-Runtime bestehen');
    });
} else if (IS_ELECTRON_AS_NODE) {
    process.env.RECHNUNGSPROGRAMM_DB_PATH = path.join(os.tmpdir(), `smtp-email-test-${Date.now()}-${process.pid}.sqlite`);
    const { db } = require('../db.js');
    const crypto = require('crypto');

    function fakeCryptoAdapter() {
        return {
            isAvailable() { return true; },
            encrypt(plain) { return Buffer.from(`ENC(${plain})`, 'utf8').toString('base64'); },
            decrypt(b64) {
                const dekodiert = Buffer.from(String(b64), 'base64').toString('utf8');
                if (!dekodiert.startsWith('ENC(')) throw new Error('nicht entschlüsselbar');
                return dekodiert.slice(4, -1);
            }
        };
    }

    function fakeTransportFactory(log) {
        return (optionen) => ({
            optionen,
            async verify() {
                log.verifyAufrufe++;
                if (log.verifySollFailen) throw Object.assign(new Error(log.verifyFehlermeldung || 'boom'), log.verifyFehler || {});
                return true;
            },
            async sendMail(mailOptions) {
                log.gesendet.push(mailOptions);
                if (log.sendSollFailen) throw Object.assign(new Error(log.sendFehlermeldung || 'send boom'), log.sendFehler || {});
                return { messageId: `<test-${log.gesendet.length}@example.de>`, response: '250 OK queued' };
            }
        });
    }

    function baueService(overridesLog, depsExtra = {}) {
        const log = overridesLog;
        const service = createEmailService({
            db,
            appendAuditLog: (eintrag) => {
                log.audit.push(eintrag);
                db.prepare('INSERT INTO audit_logs (entity_type, entity_id, action, previous_hash, current_hash, details) VALUES (?, ?, ?, ?, ?, ?)')
                  .run(
                      eintrag.entityType,
                      eintrag.entityId,
                      eintrag.action,
                      null,
                      'hash-' + (log.audit.length),
                      JSON.stringify(eintrag.details || {})
                  );
            },
            ...depsExtra
        }, { transportFactory: fakeTransportFactory(log), cryptoAdapter: fakeCryptoAdapter() });
        return service;
    }

    let kundeId;
    let docId;
    let angebotId;
    const pdfBytes = Buffer.from('%PDF-1.7 Testanhang für SMTP-Versand');

    test.before(async () => {
        kundeId = Number(db.prepare("INSERT INTO kunden (name, email) VALUES ('Mailkunde GmbH', 'buchhaltung@mailkunde.de')").run().lastInsertRowid);
        docId = Number(db.prepare(`
            INSERT INTO dokumente (type, nr, datum, faellig, kundeId, status, netto, steuer, brutto)
            VALUES ('rechnung', 'INV-2026-042', '2026-08-24', '2026-09-07', ?, 'Ausstehend', 1000, 190, 1190)`).run(kundeId).lastInsertRowid);
        angebotId = Number(db.prepare(`
            INSERT INTO dokumente (type, nr, datum, faellig, kundeId, status, netto, steuer, brutto)
            VALUES ('angebot', 'AN-2026-007', '2026-08-24', null, ?, 'Ausstehend', 500, 95, 595)`).run(kundeId).lastInsertRowid);
    });

    test.after(() => {
        try { db.close(); } catch (_e) { /* ignore */ }
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(process.env.RECHNUNGSPROGRAMM_DB_PATH + suffix, { force: true }); } catch (_e) { /* ignore */ }
        }
    });

    test('Schema: email_versandhistorie + Indizes existieren; CHECKs greifen', () => {
        const tabellen = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
        assert.ok(tabellen.includes('email_versandhistorie'));
        const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
        for (const i of ['idx_email_historie_beleg', 'idx_email_historie_status']) {
            assert.ok(idx.includes(i), `Index ${i} muss existieren`);
        }
        assert.throws(
            () => db.prepare(`INSERT INTO email_versandhistorie (beleg_typ, beleg_id, empfaenger, betreff, status) VALUES ('FAX', 1, 'a@b.de', 'x', 'VERSANDT')`).run(),
            /CHECK/i
        );
        assert.throws(
            () => db.prepare(`INSERT INTO email_versandhistorie (beleg_typ, beleg_id, empfaenger, betreff, status) VALUES ('RECHNUNG', 1, 'a@b.de', 'x', 'UNBEKANNT')`).run(),
            /CHECK/i
        );
    });

    test('speichereKonto/ladeKonten: Secrets nie im Response, hat_passwort, exklusiver Standard, Validierung', async () => {
        const leererService = baueService({ audit: [], gesendet: [], verifyAufrufe: 0 });
        await leererService.speichereKonto({
            name: 'Postfach Haupt',
            host: 'smtp.mailkunde.de',
            port: 587,
            secure: false,
            user: 'mailer@mailkunde.de',
            passwort: 'Geheim123!',
            absender_name: 'W-LINK Buchhaltung',
            absender_email: 'rechnungen@mailkunde.de',
            ist_standard: true
        });
        await leererService.speichereKonto({
            name: 'Zweitkonto',
            host: 'smtp2.mailkunde.de',
            port: 465,
            secure: true,
            user: 'zweit@mailkunde.de',
            passwort: 'NochGeheimer!',
            absender_name: 'W-LINK',
            absender_email: 'info@mailkunde.de'
        });

        const konten = leererService.ladeKonten();
        assert.equal(konten.length, 2);
        const rohJson = db.prepare("SELECT value FROM einstellungen WHERE key='smtp_konten'").get().value;
        assert.ok(!rohJson.includes('Geheim123!'), 'Klartext-Passwort darf NIE persistiert werden');
        const rohKonten = JSON.parse(rohJson);
        const hauptRoh = rohKonten.find(k => k.name === 'Postfach Haupt');
        assert.ok(hauptRoh.passwort_enc && !hauptRoh.passwort_enc.startsWith('PLAINTEXT::'), 'Passwort muss verschlüsselt abgelegt sein');
        const fakeCryptoForRoundtrip = fakeCryptoAdapter();
        assert.equal(fakeCryptoForRoundtrip.decrypt(hauptRoh.passwort_enc), 'Geheim123!', 'Verschlüsselung muss intern entschlüsselbar sein');
        konten.forEach(k => {
            assert.equal(k.passwort, undefined);
            assert.equal(k.user, undefined);
            assert.equal(JSON.stringify(k).includes('Geheim'), false, 'Keine Secrets im Renderer-Payload');
        });
        assert.equal(konten.find(k => k.name === 'Postfach Haupt').hat_passwort, true);
        assert.equal(konten.find(k => k.name === 'Postfach Haupt').gespeichert_sicher, true);

        await assert.rejects(
            () => leererService.speichereKonto({ name: '', host: 'h', port: 587, absender_name: 'a', absender_email: 'b@c.de' }),
            /Ungültige Konto-Daten/
        );
        await assert.rejects(
            () => leererService.speichereKonto({ name: 'x', host: 'h', port: 99999, absender_name: 'a', absender_email: 'b@c.de' }),
            /Port/
        );
        await assert.rejects(
            () => leererService.speichereKonto({ name: 'x', host: 'h', port: 587, absender_name: 'a', absender_email: 'keine-mail' }),
            /Absender-E-Mail/
        );

        await leererService.speichereKonto({
            id: konten.find(k => k.name === 'Zweitkonto').id,
            name: 'Zweitkonto',
            host: 'smtp2.mailkunde.de',
            port: 465,
            user: 'zweit@mailkunde.de',
            absender_name: 'W-LINK',
            absender_email: 'info@mailkunde.de',
            ist_standard: true
        });
        const kontenNachStandardwechsel = leererService.ladeKonten();
        assert.equal(kontenNachStandardwechsel.filter(k => k.ist_standard).length, 1, 'Standard muss exklusiv sein');
        assert.equal(kontenNachStandardwechsel.find(k => k.name === 'Zweitkonto').ist_standard, true);
        assert.equal(kontenNachStandardwechsel.find(k => k.name === 'Zweitkonto').secure, true, 'Port 465 erzwingt secure');

        await leererService.speichereKonto({
            id: konten.find(k => k.name === 'Zweitkonto').id,
            name: 'Zweitkonto',
            host: 'smtp2.mailkunde.de',
            port: 465,
            user: '',
            absender_name: 'W-LINK',
            absender_email: 'info@mailkunde.de'
        });
        const zweitNachLeeremUser = leererService.ladeKonten().find(k => k.name === 'Zweitkonto');
        assert.equal(zweitNachLeeremUser.hat_passwort, true, 'Leerer Benutzername darf den gespeicherten Benutzernamen nicht löschen');

        assert.throws(() => leererService.loescheKonto('gibts-nicht'), /SMTP-Konto nicht gefunden/);
    });

    test('testeVerbindung: Fake-Success-Shape und übersetzter Fehler ohne Historie-Zeile', async () => {
        const log = { audit: [], gesendet: [], verifyAufrufe: 0 };
        const service = baueService(log);
        const ok = await service.testeVerbindung({
            name: 'T1', host: 'smtp.ok.de', port: 587, user: 'u', passwort: 'p',
            absender_name: 'A', absender_email: 'a@b.de'
        });
        assert.deepEqual(ok, { success: true, details: 'Verbindung erfolgreich hergestellt (DNS, TCP, TLS und Auth geprüft).' });
        assert.equal(log.verifyAufrufe, 1);
        assert.equal(log.gesendet.length, 0);

        log.verifySollFailen = true;
        log.verifyFehler = { code: 'ECONNREFUSED' };
        const fail = await service.testeVerbindung({
            name: 'T2', host: 'smtp.blocked.de', port: 465, user: 'u', passwort: 'p',
            absender_name: 'A', absender_email: 'a@b.de'
        });
        assert.equal(fail.success, false);
        assert.match(fail.fehlermeldung, /Verbindung abgelehnt – Host\/Port prüfen\./);
        assert.equal(db.prepare('SELECT COUNT(*) c FROM email_versandhistorie').get().c, 0, 'Testverbindung darf KEINE Historie schreiben');
    });

    test('sendeBeleg Erfolg: Anhang/from/Historie/Audit korrekt', async () => {
        const log = { audit: [], gesendet: [], verifyAufrufe: 0 };
        const service = baueService(log);
        const hauptKontoId = service.ladeKonten().find(k => k.name === 'Postfach Haupt').id;

        const res = await service.sendeBeleg({
            beleg_typ: 'RECHNUNG',
            beleg_id: docId,
            empfaenger: 'empfang@kunde.de',
            betreff: 'Rechnung INV-2026-042',
            text: 'Bitte finden Sie anbei unsere Rechnung.',
            konto_id: hauptKontoId
        }, pdfBytes);

        assert.equal(res.success, true);
        assert.ok(res.historieId > 0);
        assert.match(res.messageId, /@example\.de/);

        assert.equal(log.gesendet.length, 1);
        const mail = log.gesendet[0];
        assert.equal(mail.from, '"W-LINK Buchhaltung" <rechnungen@mailkunde.de>');
        assert.equal(mail.to, 'empfang@kunde.de');
        assert.equal(mail.subject, 'Rechnung INV-2026-042');
        assert.ok(mail.attachments && mail.attachments.length === 1);
        assert.equal(mail.attachments[0].filename, 'Rechnung_INV-2026-042.pdf');
        assert.equal(mail.attachments[0].contentType, 'application/pdf');
        assert.ok(Buffer.isBuffer(mail.attachments[0].content));
        assert.equal(mail.attachments[0].content.subarray(0, 5).toString('latin1'), '%PDF-');

        const historie = db.prepare('SELECT * FROM email_versandhistorie WHERE id=?').get(res.historieId);
        assert.equal(historie.status, 'VERSANDT');
        assert.equal(historie.message_id, res.messageId);
        assert.equal(historie.smtp_response, '250 OK queued');
        assert.equal(historie.pdf_sha256, crypto.createHash('sha256').update(pdfBytes).digest('hex'));
        assert.equal(historie.pdf_dateiname, 'Rechnung_INV-2026-042.pdf');
        assert.ok(historie.gesendet_am);
        assert.ok(!historie.nachricht_text.includes('{{'));

        const auditEmail = log.audit.find(a => a.action === 'EMAIL_VERSENDET');
        assert.ok(auditEmail, 'EMAIL_VERSENDET-Audit muss existieren');
        assert.equal(auditEmail.entityType, 'DOCUMENT');
        assert.equal(auditEmail.entityId, docId);
        assert.equal(auditEmail.details.empfaenger, 'empfang@kunde.de');
        assert.equal(auditEmail.details.konto, 'Postfach Haupt');
        assert.equal(verifiziereKette().valid, true);
    });

    function verifiziereKette() {
        const rows = db.prepare('SELECT id, entity_type, entity_id, action, previous_hash, current_hash FROM audit_logs ORDER BY id ASC').all();
        let vorherigerHash = null;
        for (const zeile of rows) {
            if (vorherigerHash !== null && zeile.previous_hash !== null && zeile.previous_hash !== vorherigerHash) {
                return { valid: false, grund: `Hashkette bricht bei Zeile ${zeile.id}` };
            }
            vorherigerHash = zeile.current_hash;
        }
        return { valid: true };
    }

    test('sendeBeleg Fehler: Historie FEHLGESCHLAGEN mit deutscher Meldung, Audit, kein Throw', async () => {
        const log = { audit: [], gesendet: [], verifyAufrufe: 0, sendSollFailen: true, sendFehler: { code: 'EAUTH' }, sendFehlermeldung: '535 Authentication failed' };
        const service = baueService(log);

        const hashVorher = db.prepare('SELECT sha256_hash FROM dokumente WHERE id=?').get(docId).sha256_hash;

        const res = await service.sendeBeleg({
            beleg_typ: 'RECHNUNG',
            beleg_id: docId,
            empfaenger: 'empfang@kunde.de',
            betreff: 'Erneuter Versuch'
        }, pdfBytes);

        assert.equal(res.success, false);
        assert.ok(res.historieId > 0);
        assert.match(res.fehlermeldung, /Anmeldung fehlgeschlagen – Benutzer\/App-Passwort prüfen\./);

        const historie = db.prepare('SELECT * FROM email_versandhistorie WHERE id=?').get(res.historieId);
        assert.equal(historie.status, 'FEHLGESCHLAGEN');
        assert.equal(historie.versuche, 1);
        assert.ok(historie.fehlermeldung);

        assert.ok(log.audit.some(a => a.action === 'EMAIL_FEHLGESCHLAGEN'));

        const hashDanach = db.prepare('SELECT sha256_hash FROM dokumente WHERE id=?').get(docId).sha256_hash;
        assert.equal(hashDanach, hashVorher, 'GoBD: Versand darf Beleg-Inhalts-Hash NIEMALS ändern');
        assert.equal(verifiziereKette().valid, true);
    });

    test('wiederhole: versuche+=1, Statuswechsel FEHLGESCHLAGEN -> VERSANDT in derselben Zeile', async () => {
        const log = { audit: [], gesendet: [], verifyAufrufe: 0 };
        const service = baueService(log);

        const fehlerZeile = db.prepare("SELECT id FROM email_versandhistorie WHERE status='FEHLGESCHLAGEN' ORDER BY id DESC LIMIT 1").get();
        assert.ok(fehlerZeile);

        const res = await service.wiederhole(fehlerZeile.id, pdfBytes);
        assert.equal(res.success, true);
        assert.equal(res.historieId, fehlerZeile.id, 'Wiederholen muss dieselbe Zeile aktualisieren');

        const aktualisiert = db.prepare('SELECT * FROM email_versandhistorie WHERE id=?').get(fehlerZeile.id);
        assert.equal(aktualisiert.status, 'VERSANDT');
        assert.equal(aktualisiert.versuche, 2);
        assert.equal(aktualisiert.fehlermeldung, null);
        assert.ok(aktualisiert.message_id);
        assert.equal(verifiziereKette().valid, true);

        await assert.rejects(() => service.wiederhole(99999999), /Versandhistorie nicht gefunden/);
    });

    test('GoBD: verifiziereAuditKette valid und Kette enthält EMAIL-Actions; sendeBeleg wirft vor Versand OHNE Historie', async () => {
        const actions = db.prepare("SELECT DISTINCT action FROM audit_logs WHERE action LIKE 'EMAIL%'").all().map(r => r.action);
        assert.ok(actions.includes('EMAIL_VERSENDET'));
        assert.ok(actions.includes('EMAIL_FEHLGESCHLAGEN'));

        const log = { audit: [], gesendet: [], verifyAufrufe: 0 };
        const service = baueService(log);
        await assert.rejects(
            () => service.sendeBeleg({ beleg_typ: 'RECHNUNG', beleg_id: 9999999, empfaenger: 'x@y.de', betreff: 'x' }, pdfBytes),
            /Beleg wurde nicht gefunden/
        );
        await assert.rejects(
            () => service.sendeBeleg({ beleg_typ: 'RECHNUNG', beleg_id: docId, empfaenger: 'keine-email', betreff: 'x' }, pdfBytes),
            /Ungültige Empfänger-E-Mail/
        );
        assert.equal(log.gesendet.length, 0);
        assert.equal(db.prepare("SELECT COUNT(*) c FROM email_versandhistorie WHERE beleg_id=9999999").get().c, 0, 'Validierungsfehler dürfen keine Historie erzeugen');
    });

    test('pdf_pfad-Zweig: Outbox-Kopie wird geschrieben und in Historie verlinkt (Temp-dir injiziert)', async () => {
        const outboxDir = path.join(os.tmpdir(), `smtp-outbox-test-${Date.now()}-${process.pid}`);
        const log = { audit: [], gesendet: [], verifyAufrufe: 0 };
        const service = createEmailService({
            db,
            outboxDir,
            getEinstellung: (key) => {
                if (key === 'email_pdf_kopie_speichern') return 'true';
                const row = db.prepare('SELECT value FROM einstellungen WHERE key=?').get(key);
                return row ? row.value : null;
            },
            appendAuditLog: (eintrag) => { log.audit.push(eintrag); },
            saveEinstellung: () => ({ success: true })
        }, { transportFactory: fakeTransportFactory(log), cryptoAdapter: fakeCryptoAdapter() });

        const res = await service.sendeBeleg({
            beleg_typ: 'ANGEBOT',
            beleg_id: angebotId,
            empfaenger: 'angebot@kunde.de',
            betreff: 'Angebot',
            pdf_dateiname: 'Angebot_Test.pdf'
        }, pdfBytes).catch(err => ({ success: false, fehlermeldung: err.message }));

        assert.equal(res.success, true, `Erwartet success, erhalten: ${res.fehlermeldung || ''}`);
        const historie = db.prepare('SELECT * FROM email_versandhistorie WHERE id=?').get(res.historieId);
        assert.ok(historie.pdf_pfad);
        assert.ok(fs.existsSync(historie.pdf_pfad));
        assert.equal(fs.readFileSync(historie.pdf_pfad).subarray(0, 5).toString('latin1'), '%PDF-');
        try { fs.rmSync(outboxDir, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
    });

    console.log('SMTP_EMAIL_DB_TESTS_PASSED');
}
