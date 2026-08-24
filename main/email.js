const crypto = require('crypto');

function baueTransportOptionen(konto) {
    const port = parseInt(konto.port, 10) || 587;
    return {
        host: konto.host,
        port,
        secure: port === 465 ? true : !!konto.secure,
        auth: { user: konto.user, pass: konto.pass },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
        tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
    };
}

const DEFAULT_TRANSPORT_FACTORY = (smtpOptionen) => {
    const nodemailer = require('nodemailer');
    return nodemailer.createTransport(smtpOptionen);
};

const DEFAULT_CRYPTO_ADAPTER = {
    _safeStorage() {
        try {
            const electron = require('electron');
            if (!electron || typeof electron !== 'object' || !electron.safeStorage) return null;
            return electron.safeStorage;
        } catch (_e) {
            return null;
        }
    },
    _appBereit() {
        try {
            const electron = require('electron');
            return !!(electron && typeof electron === 'object' && electron.app && electron.app.isReady && electron.app.isReady());
        } catch (_e) {
            return false;
        }
    },
    isAvailable() {
        const ss = this._safeStorage();
        if (!ss) return false;
        if (!this._appBereit()) return false;
        try { return !!ss.isEncryptionAvailable(); } catch (_e) { return false; }
    },
    encrypt(plain) {
        return this._safeStorage().encryptString(String(plain)).toString('base64');
    },
    decrypt(b64) {
        return this._safeStorage().decryptString(Buffer.from(String(b64), 'base64')).toString('utf8');
    }
};

const STANDARD_TEXTE = {
    RECHNUNG: 'Guten Tag {{kunde_name}},\n\nanbei erhalten Sie die Rechnung {{nummer}} vom {{datum}} über {{betrag_brutto}}.\nDie Zahlung wird fällig am {{faelligkeit}}.\n\nMit freundlichen Grüßen\n{{firmenname}}',
    MAHNUNG: 'Guten Tag {{kunde_name}},\n\ntrotz Fälligkeit ist die Rechnung {{nummer}} über {{betrag_brutto}} (fällig am {{faelligkeit}}) noch offen.\nWir bitten um Begleichung bzw. Rückmeldung.\n\nMit freundlichen Grüßen\n{{firmenname}}',
    ANGEBOT: 'Guten Tag {{kunde_name}},\n\nanbei erhalten Sie unser Angebot {{nummer}} vom {{datum}} über {{betrag_brutto}}.\nFür Rückfragen stehen wir gerne zur Verfügung.\n\nMit freundlichen Grüßen\n{{firmenname}}'
};

function formatiereBetragDe(wert) {
    const n = Number(wert) || 0;
    return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function baueStandardText(typ, kontext, template) {
    const basis = template || STANDARD_TEXTE[typ] || '';
    const ctx = kontext || {};
    return basis
        .replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (voll, schluessel) => {
            if (!(schluessel in ctx)) return '';
            const wert = ctx[schluessel];
            if (schluessel === 'betrag_brutto') return typeof wert === 'number' ? formatiereBetragDe(wert) : String(wert == null ? '' : wert);
            return wert == null ? '' : String(wert);
        });
}

function uebersetzeSmtpFehler(err) {
    const code = (err && err.code) || '';
    const msg = (err && err.message) || String(err || '');
    if (code === 'ETIMEDOUT' || /timeout/i.test(msg)) return 'Zeitüberschreitung beim Verbindungsaufbau – Firewall/Port blockiert?';
    if (code === 'ECONNREFUSED') return 'Verbindung abgelehnt – Host/Port prüfen.';
    if (code === 'EAUTH' || /535/.test(msg) || /Invalid login|authentication/i.test(msg)) return 'Anmeldung fehlgeschlagen – Benutzer/App-Passwort prüfen.';
    if (code === 'ESOCKET' || /TLS|SSL|certificate/i.test(msg)) return 'TLS-/Zertifikatsfehler – Verbindungssicherheit und Port-Einstellung prüfen.';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /getaddrinfo|ENOTFOUND/i.test(msg)) return 'Server nicht gefunden – Hostnamen prüfen.';
    return msg;
}

function normalisierePdfBuffer(value) {
    if (!value) return null;
    try {
        let buf;
        if (Buffer.isBuffer(value)) buf = value;
        else if (value instanceof ArrayBuffer) buf = Buffer.from(value);
        else if (ArrayBuffer.isView(value)) buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        else return null;
        if (buf.length > 0) return buf;
    } catch (_e) {
        return null;
    }
    return null;
}

function istGueltigeEmail(adresse) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(adresse || '').trim());
}

function createEmailService(deps, overrides = {}) {
    const db = deps.db;
    const appendAuditLog = deps.appendAuditLog;
    const transportFactory = overrides.transportFactory || DEFAULT_TRANSPORT_FACTORY;
    const cryptoAdapter = overrides.cryptoAdapter || DEFAULT_CRYPTO_ADAPTER;

    function leseEinstellung(key) {
        if (typeof deps.getEinstellung === 'function') return deps.getEinstellung(key);
        const row = db.prepare('SELECT value FROM einstellungen WHERE key=?').get(key);
        return row ? row.value : null;
    }

    function speichereEinstellung(key, value) {
        if (typeof deps.saveEinstellung === 'function') return deps.saveEinstellung(key, value);
        db.prepare('INSERT OR REPLACE INTO einstellungen (key, value) VALUES (?, ?)').run(key, value);
        return { success: true };
    }

    function ladeRohKonten() {
        const roh = leseEinstellung('smtp_konten');
        if (!roh) return [];
        try {
            const parsed = JSON.parse(roh);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_e) {
            return [];
        }
    }

    function speichereRohKonten(konten) {
        speichereEinstellung('smtp_konten', JSON.stringify(konten));
    }

    function ladeKonten() {
        return ladeRohKonten().map(k => ({
            id: k.id,
            name: k.name,
            host: k.host,
            port: k.port,
            secure: !!k.secure,
            absender_name: k.absender_name,
            absender_email: k.absender_email,
            ist_standard: !!k.ist_standard,
            hat_passwort: !!(k.user && k.passwort_enc),
            gespeichert_sicher: !String(k.passwort_enc || '').startsWith('PLAINTEXT::')
        }));
    }

    function validiereKontoPayload(p) {
        if (!p || typeof p !== 'object') throw new Error('Ungültige Konto-Daten');
        if (!p.name || !String(p.name).trim()) throw new Error('Ungültige Konto-Daten: Name fehlt.');
        if (!p.host || !String(p.host).trim()) throw new Error('Ungültige Konto-Daten: Host fehlt.');
        const port = parseInt(p.port, 10);
        if (!(port >= 1 && port <= 65535)) throw new Error('Ungültige Konto-Daten: Port muss zwischen 1 und 65535 liegen.');
        if (!p.absender_name || !String(p.absender_name).trim()) throw new Error('Ungültige Konto-Daten: Absender-Name fehlt.');
        if (!istGueltigeEmail(p.absender_email)) throw new Error('Ungültige Konto-Daten: Absender-E-Mail ungültig.');
    }

    function verschluesslePasswort(passwort, klartextErlaubt) {
        if (cryptoAdapter.isAvailable()) {
            return cryptoAdapter.encrypt(passwort);
        }
        if (klartextErlaubt === true) {
            return 'PLAINTEXT::' + passwort;
        }
        throw new Error('Sichere Speicherung (Betriebssystem-Schlüsselspeicher) nicht verfügbar.');
    }

    function entschluesslePasswort(record) {
        const enc = String(record.passwort_enc || '');
        if (enc.startsWith('PLAINTEXT::')) return enc.slice('PLAINTEXT::'.length);
        if (!enc) return '';
        try {
            return cryptoAdapter.decrypt(enc);
        } catch (_e) {
            return '';
        }
    }

    function baueInternesKonto(record, passwortOverride) {
        return {
            id: record.id,
            name: record.name,
            host: record.host,
            port: parseInt(record.port, 10) || 587,
            secure: !!record.secure,
            user: record.user || '',
            pass: passwortOverride != null ? passwortOverride : entschluesslePasswort(record),
            absender_name: record.absender_name,
            absender_email: record.absender_email,
            ist_standard: !!record.ist_standard
        };
    }

    async function testeVerbindung(kontoPayload) {
        try {
            validiereKontoPayload(kontoPayload);
            const konten = ladeRohKonten();
            let record = null;
            if (kontoPayload.id) {
                record = konten.find(k => k.id === kontoPayload.id) || null;
                if (!record) throw new Error('SMTP-Konto nicht gefunden.');
            }
            const internes = baueInternesKonto(record || kontoPayload, kontoPayload.passwort || undefined);
            if (record && !kontoPayload.passwort) internes.pass = entschluesslePasswort(record);
            const transporter = transportFactory(baueTransportOptionen(internes));
            await transporter.verify();
            return { success: true, details: 'Verbindung erfolgreich hergestellt (DNS, TCP, TLS und Auth geprüft).' };
        } catch (err) {
            return { success: false, fehlermeldung: uebersetzeSmtpFehler(err) };
        }
    }

    async function speichereKonto(payload) {
        validiereKontoPayload(payload);
        const konten = ladeRohKonten();
        let id = payload.id || crypto.randomUUID();
        let record = konten.find(k => k.id === id) || null;

        const neuerEintrag = {
            id,
            name: String(payload.name).trim(),
            host: String(payload.host).trim(),
            port: parseInt(payload.port, 10),
            secure: payload.port === 465 ? true : !!payload.secure,
            user: payload.user != null && String(payload.user).trim() !== '' ? String(payload.user).trim() : (record ? record.user : ''),
            passwort_enc: record ? record.passwort_enc : '',
            absender_name: String(payload.absender_name).trim(),
            absender_email: String(payload.absender_email).trim(),
            ist_standard: record ? !!record.ist_standard : false
        };

        if (payload.passwort && String(payload.passwort).length > 0) {
            neuerEintrag.passwort_enc = verschluesslePasswort(payload.passwort, payload.klartext_erlaubt === true);
        }

        if (record) {
            Object.assign(record, neuerEintrag);
        } else {
            konten.push(neuerEintrag);
        }

        if (payload.ist_standard === true) {
            konten.forEach(k => { k.ist_standard = k.id === id; });
        } else if (!record && !konten.some(k => k.ist_standard) && konten.length > 0) {
            konten[0].ist_standard = true;
        }

        speichereRohKonten(konten);
        return { success: true, id };
    }

    function loescheKonto(id) {
        const konten = ladeRohKonten();
        const index = konten.findIndex(k => k.id === id);
        if (index < 0) throw new Error('SMTP-Konto nicht gefunden.');
        konten.splice(index, 1);
        speichereRohKonten(konten);
        return { success: true };
    }

    function loeseKontoAuf(kontoId) {
        const konten = ladeRohKonten();
        if (kontoId) {
            const gefunden = konten.find(k => k.id === kontoId);
            if (!gefunden) throw new Error('SMTP-Konto nicht gefunden.');
            return gefunden;
        }
        return konten.find(k => k.ist_standard) || (konten.length === 1 ? konten[0] : null);
    }

    function holeBeleg(belegTyp, belegId) {
        const doc = db.prepare('SELECT id, type, nr, datum, faellig, brutto, netto, kundeId, mahnungLevel, mahnungGebuehr FROM dokumente WHERE id=?').get(Number(belegId));
        if (!doc) throw new Error('Beleg wurde nicht gefunden.');
        const typErwartet = { RECHNUNG: 'rechnung', ANGEBOT: 'angebot', MAHNUNG: 'rechnung' }[belegTyp];
        if (typErwartet && doc.type !== typErwartet) {
            throw new Error(`Beleg #${belegId} ist keine passende Vorlage für ${belegTyp}.`);
        }
        return doc;
    }

    function baueMailkontext(belegTyp, doc) {
        const kunde = doc.kundeId ? db.prepare('SELECT name, email FROM kunden WHERE id=?').get(doc.kundeId) : null;
        const einstellungenRows = {};
        ['firmenname', 'email_text_rechnung', 'email_text_mahnung', 'email_text_angebot', 'email_signatur'].forEach(key => {
            einstellungenRows[key] = leseEinstellung(key);
        });
        return {
            kundeName: kunde ? kunde.name : '',
            kundeEmail: kunde ? kunde.email : '',
            nummer: doc.nr || '',
            datum: doc.datum || '',
            faelligkeit: doc.faellig || '',
            betragBrutto: doc.brutto || 0,
            firmenname: einstellungenRows.firmenname || '',
            signatur: einstellungenRows.email_signatur || '',
            templates: {
                RECHNUNG: einstellungenRows.email_text_rechnung,
                MAHNUNG: einstellungenRows.email_text_mahnung,
                ANGEBOT: einstellungenRows.email_text_angebot
            },
            belegTyp,
            doc
        };
    }

    function baueTextUndBetreff(payload, kontext) {
        const templateKey = payload.beleg_typ;
        const text = (payload.text && payload.text.trim()) || baueStandardText(templateKey, {
            kunde_name: kontext.kundeName,
            nummer: kontext.nummer,
            datum: kontext.datum,
            faelligkeit: kontext.faelligkeit,
            betrag_brutto: kontext.betragBrutto,
            firmenname: kontext.firmenname
        }, kontext.templates[templateKey]);

        const volltext = kontext.signatur && !text.includes(kontext.signatur) ? `${text}\n\n${kontext.signatur}` : text;

        let betreff = payload.betreff;
        if (!betreff || !String(betreff).trim()) {
            if (templateKey === 'MAHNUNG') betreff = `Mahnung zu Rechnung ${kontext.nummer}`;
            else if (templateKey === 'ANGEBOT') betreff = `Angebot ${kontext.nummer} – ${kontext.firmenname}`;
            else betreff = `Rechnung ${kontext.nummer} – ${kontext.firmenname}`;
        }
        return { text: volltext, betreff: String(betreff).trim() };
    }

    function leiteDateinamenAb(belegTyp, doc) {
        const label = belegTyp === 'ANGEBOT' ? 'Angebot' : (belegTyp === 'MAHNUNG' ? 'Mahnung' : 'Rechnung');
        return `${label}_${doc.nr}.pdf`.replace(/[\\/:*?"<>|]/g, '_');
    }

    function schreibeHistorie(zeile) {
        const res = db.prepare(`
            INSERT INTO email_versandhistorie
                (beleg_typ, beleg_id, mahnstufe, empfaenger, cc, bcc, betreff, nachricht_text, status, versuche, fehlermeldung, message_id, smtp_response, smtp_konto_name, pdf_dateiname, pdf_sha256, pdf_pfad, gesendet_am)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            zeile.beleg_typ, zeile.beleg_id, zeile.mahnstufe || null, zeile.empfaenger,
            zeile.cc || null, zeile.bcc || null, zeile.betreff, zeile.nachricht_text || null,
            zeile.status, zeile.versuche || 1, zeile.fehlermeldung || null, zeile.message_id || null,
            zeile.smtp_response || null, zeile.smtp_konto_name || null, zeile.pdf_dateiname || null,
            zeile.pdf_sha256 || null, zeile.pdf_pfad || null, zeile.gesendet_am || null
        );
        return Number(res.lastInsertRowid);
    }

    function aktualisiereHistorie(historieId, zeile) {
        db.prepare(`
            UPDATE email_versandhistorie SET status=?, versuche=?, fehlermeldung=?, message_id=?, smtp_response=?, smtp_konto_name=?, pdf_dateiname=?, pdf_sha256=?, pdf_pfad=?, gesendet_am=?
            WHERE id=?
        `).run(
            zeile.status, zeile.versuche, zeile.fehlermeldung || null, zeile.message_id || null,
            zeile.smtp_response || null, zeile.smtp_konto_name || null, zeile.pdf_dateiname || null,
            zeile.pdf_sha256 || null, zeile.pdf_pfad || null, zeile.gesendet_am || null, historieId
        );
    }

    function schreibeEmailAudit(action, belegTyp, doc, extra) {
        appendAuditLog({
            entityType: 'DOCUMENT',
            entityId: doc.id,
            action,
            details: {
                beleg_typ: belegTyp,
                nr: doc.nr,
                empfaenger: extra.empfaenger,
                konto: extra.kontoName,
                messageId: extra.messageId || null,
                pdfSha256: extra.pdfSha256 || null,
                mahnstufe: extra.mahnstufe || null
            }
        });
    }

    async function fuehreVersandDurch({ belegTyp, belegId, mahnstufe, empfaenger, cc, bcc, betreff, text, kontoRecord, pdfBuffer, dateiname }) {
        const fs = require('fs');
        const path = require('path');
        const jetztIso = () => new Date().toISOString();

        const doc = holeBeleg(belegTyp, belegId);
        const kontext = baueMailkontext(belegTyp, doc);
        const { text: volltext, betreff: finalerBetreff } = baueTextUndBetreff({ text, betreff }, kontext);

        const basisZeile = {
            beleg_typ: belegTyp,
            beleg_id: Number(belegId),
            mahnstufe: mahnstufe || null,
            empfaenger: String(empfaenger).trim(),
            cc: cc || null,
            bcc: bcc || null,
            betreff: finalerBetreff,
            nachricht_text: volltext,
            smtp_konto_name: kontoRecord.name,
            pdf_dateiname: dateiname
        };

        const buffer = normalisierePdfBuffer(pdfBuffer);
        if (!buffer) {
            const fehlermeldung = 'Kein PDF erzeugbar.';
            const historieId = schreibeHistorie({
                ...basisZeile,
                status: 'FEHLGESCHLAGEN',
                versuche: 1,
                fehlermeldung,
                gesendet_am: jetztIso()
            });
            schreibeEmailAudit('EMAIL_FEHLGESCHLAGEN', belegTyp, doc, {
                empfaenger: basisZeile.empfaenger, kontoName: kontoRecord.name, fehlermeldung, mahnstufe
            });
            return { success: false, fehlermeldung, historieId };
        }

        const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

        let kopiePfad = null;
        if (leseEinstellung('email_pdf_kopie_speichern') === 'true' && deps.outboxDir) {
            try {
                const fsModul = fs;
                if (!fsModul.existsSync(deps.outboxDir)) fsModul.mkdirSync(deps.outboxDir, { recursive: true });
                kopiePfad = path.join(deps.outboxDir, dateiname);
                fsModul.writeFileSync(kopiePfad, buffer);
            } catch (_e) {
                kopiePfad = null;
            }
        }

        const transporter = transportFactory(baueTransportOptionen(kontoRecord));
        try {
            await transporter.verify();
            const info = await transporter.sendMail({
                from: `"${kontoRecord.absender_name}" <${kontoRecord.absender_email}>`,
                to: String(empfaenger).trim(),
                cc: cc || undefined,
                bcc: bcc || undefined,
                subject: finalerBetreff,
                text: volltext,
                attachments: [{
                    filename: dateiname,
                    content: buffer,
                    contentType: 'application/pdf'
                }]
            });

            const historieId = schreibeHistorie({
                ...basisZeile,
                status: 'VERSANDT',
                versuche: 1,
                message_id: info && info.messageId ? info.messageId : null,
                smtp_response: info && info.response ? info.response : null,
                pdf_sha256: sha256,
                pdf_pfad: kopiePfad,
                gesendet_am: jetztIso()
            });
            schreibeEmailAudit('EMAIL_VERSENDET', belegTyp, doc, {
                empfaenger: basisZeile.empfaenger,
                kontoName: kontoRecord.name,
                messageId: info && info.messageId,
                pdfSha256: sha256,
                mahnstufe
            });
            return { success: true, historieId, messageId: info && info.messageId ? info.messageId : null };
        } catch (err) {
            const fehlermeldung = uebersetzeSmtpFehler(err);
            const historieId = schreibeHistorie({
                ...basisZeile,
                status: 'FEHLGESCHLAGEN',
                versuche: 1,
                fehlermeldung,
                pdf_sha256: sha256,
                pdf_pfad: kopiePfad,
                gesendet_am: jetztIso()
            });
            schreibeEmailAudit('EMAIL_FEHLGESCHLAGEN', belegTyp, doc, {
                empfaenger: basisZeile.empfaenger, kontoName: kontoRecord.name, fehlermeldung, mahnstufe
            });
            return { success: false, fehlermeldung, historieId };
        }
    }

    async function sendeBeleg(payload, pdfBuffer) {
        if (!payload || typeof payload !== 'object') throw new Error('Ungültige Versand-Daten');
        if (!['RECHNUNG', 'ANGEBOT', 'MAHNUNG'].includes(payload.beleg_typ)) throw new Error('Ungültiger Beleg-Typ');
        if (!Number.isInteger(Number(payload.beleg_id))) throw new Error('Ungültige Beleg-ID');
        if (!istGueltigeEmail(payload.empfaenger)) throw new Error('Ungültige Empfänger-E-Mail.');

        holeBeleg(payload.beleg_typ, payload.beleg_id);

        const kontoRecord = loeseKontoAuf(payload.konto_id);
        if (!kontoRecord) throw new Error('Bitte zuerst ein SMTP-Konto in den Einstellungen anlegen.');

        const dateiname = payload.pdf_dateiname || leiteDateinamenAb(payload.beleg_typ, holeBeleg(payload.beleg_typ, payload.beleg_id));

        return fuehreVersandDurch({
            belegTyp: payload.beleg_typ,
            belegId: payload.beleg_id,
            mahnstufe: payload.mahnstufe || null,
            empfaenger: payload.empfaenger,
            cc: payload.cc,
            bcc: payload.bcc,
            betreff: payload.betreff,
            text: payload.text,
            kontoRecord,
            pdfBuffer,
            dateiname
        });
    }

    async function wiederhole(historieId, pdfBuffer) {
        const zeile = db.prepare('SELECT * FROM email_versandhistorie WHERE id=?').get(Number(historieId));
        if (!zeile) throw new Error('Versandhistorie nicht gefunden.');

        const kontoRecord = ladeRohKonten().find(k => k.name === zeile.smtp_konto_name)
            || ladeRohKonten().find(k => k.ist_standard)
            || ladeRohKonten()[0];
        if (!kontoRecord) throw new Error('Bitte zuerst ein SMTP-Konto in den Einstellungen anlegen.');

        let buffer = normalisierePdfBuffer(pdfBuffer);
        if (!buffer && zeile.pdf_pfad) {
            try {
                const fs = require('fs');
                if (fs.existsSync(zeile.pdf_pfad)) buffer = fs.readFileSync(zeile.pdf_pfad);
            } catch (_e) {
                buffer = null;
            }
        }

        const jetztIso = new Date().toISOString();
        const bufferNormalisiert = normalisierePdfBuffer(buffer);
        const sha256 = bufferNormalisiert ? crypto.createHash('sha256').update(bufferNormalisiert).digest('hex') : null;

        const basisUpdate = {
            status: zeile.status,
            versuche: (zeile.versuche || 1) + 1,
            fehlermeldung: zeile.fehlermeldung,
            message_id: zeile.message_id,
            smtp_response: zeile.smtp_response,
            smtp_konto_name: kontoRecord.name,
            pdf_dateiname: zeile.pdf_dateiname,
            pdf_sha256: sha256 || zeile.pdf_sha256,
            pdf_pfad: zeile.pdf_pfad,
            gesendet_am: jetztIso
        };

        const doc = holeBeleg(zeile.beleg_typ, zeile.beleg_id);

        if (!bufferNormalisiert) {
            basisUpdate.status = 'FEHLGESCHLAGEN';
            basisUpdate.fehlermeldung = 'Kein PDF verfügbar – bitte den Versand aus der Belegansicht erneut starten.';
            aktualisiereHistorie(zeile.id, basisUpdate);
            schreibeEmailAudit('EMAIL_FEHLGESCHLAGEN', zeile.beleg_typ, doc, {
                empfaenger: zeile.empfaenger, kontoName: kontoRecord.name, fehlermeldung: basisUpdate.fehlermeldung, mahnstufe: zeile.mahnstufe
            });
            return { success: false, fehlermeldung: basisUpdate.fehlermeldung, historieId: zeile.id };
        }

        const transporter = transportFactory(baueTransportOptionen(kontoRecord));
        try {
            await transporter.verify();
            const info = await transporter.sendMail({
                from: `"${kontoRecord.absender_name}" <${kontoRecord.absender_email}>`,
                to: zeile.empfaenger,
                cc: zeile.cc || undefined,
                bcc: zeile.bcc || undefined,
                subject: zeile.betreff,
                text: zeile.nachricht_text || undefined,
                attachments: [{
                    filename: zeile.pdf_dateiname || `${zeile.beleg_typ}_${doc.nr}.pdf`,
                    content: bufferNormalisiert,
                    contentType: 'application/pdf'
                }]
            });

            basisUpdate.status = 'VERSANDT';
            basisUpdate.fehlermeldung = null;
            basisUpdate.message_id = info && info.messageId ? info.messageId : null;
            basisUpdate.smtp_response = info && info.response ? info.response : null;
            aktualisiereHistorie(zeile.id, basisUpdate);

            schreibeEmailAudit('EMAIL_VERSENDET', zeile.beleg_typ, doc, {
                empfaenger: zeile.empfaenger,
                kontoName: kontoRecord.name,
                messageId: basisUpdate.message_id,
                pdfSha256: basisUpdate.pdf_sha256,
                mahnstufe: zeile.mahnstufe
            });
            return { success: true, historieId: zeile.id, messageId: basisUpdate.message_id };
        } catch (err) {
            const fehlermeldung = uebersetzeSmtpFehler(err);
            basisUpdate.status = 'FEHLGESCHLAGEN';
            basisUpdate.fehlermeldung = fehlermeldung;
            aktualisiereHistorie(zeile.id, basisUpdate);
            schreibeEmailAudit('EMAIL_FEHLGESCHLAGEN', zeile.beleg_typ, doc, {
                empfaenger: zeile.empfaenger, kontoName: kontoRecord.name, fehlermeldung, mahnstufe: zeile.mahnstufe
            });
            return { success: false, fehlermeldung, historieId: zeile.id };
        }
    }

    function getVersandhistorie(belegTyp, belegId) {
        const bedingungen = [];
        const params = [];
        if (belegTyp) { bedingungen.push('beleg_typ = ?'); params.push(belegTyp); }
        if (belegId != null && belegId !== '') { bedingungen.push('beleg_id = ?'); params.push(Number(belegId)); }
        const whereSql = bedingungen.length > 0 ? `WHERE ${bedingungen.join(' AND ')}` : '';
        return db.prepare(`SELECT * FROM email_versandhistorie ${whereSql} ORDER BY COALESCE(gesendet_am, erstellt_am) DESC, id DESC LIMIT 200`).all(...params);
    }

    return {
        ladeKonten,
        speichereKonto,
        loescheKonto,
        testeVerbindung,
        sendeBeleg,
        wiederhole,
        getVersandhistorie,
        baueStandardText,
        uebersetzeSmtpFehler
    };
}

module.exports = {
    createEmailService,
    DEFAULT_TRANSPORT_FACTORY,
    DEFAULT_CRYPTO_ADAPTER,
    baueTransportOptionen,
    baueStandardText,
    uebersetzeSmtpFehler,
    normalisierePdfBuffer
};
