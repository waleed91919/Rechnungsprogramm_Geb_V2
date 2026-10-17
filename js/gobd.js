/**
 * gobd.js - GoBD Unveränderbarkeit, SHA-256 Hash-Kettung & Audit Trail Engine
 * Stand: 24.09.2026 - Vereinheitlicht mit main/audit.js (calculateDocumentContentHash).
 * Status-Änderungen ('BEZAHLT', 'Überfällig', etc.) invalidieren den steuerlichen Inhalts-Hash nicht (K1-8).
 */
// IPC- & Repository-Disziplin: KEIN top-level require('crypto') / require('../main/...')
// im Renderer (sandbox:true, kein Node). Hash-Berechnung läuft:
//  - Renderer: via window.api (IPC 'audit:verify' / GoBD-Services) oder WebCrypto/sha256-Fallback unten,
//  - Main/Node: lazy require('crypto') + main/audit.js NUR wenn require verfügbar (nicht im Renderer).
let _nodeCrypto = null;
let auditModule = null;
function _tryNodeRequire(name) {
    try {
        if (typeof require === 'function' && typeof window === 'undefined') return require(name);
        if (typeof require === 'function' && typeof process !== 'undefined' && process.type !== 'renderer') {
            // Main/Node-Kontext (Tests, Main-Prozess) — Renderer (sandbox) fällt hier nie hinein,
            // da dort require undefiniert ist.
            return require(name);
        }
    } catch (_e) { /* Renderer-Fallback unten */ }
    return null;
}
if (typeof window === 'undefined' || (typeof process !== 'undefined' && process.type !== 'renderer')) {
    _nodeCrypto = _tryNodeRequire('crypto');
    auditModule = _tryNodeRequire('../main/audit.js');
}
function sha256HexUtf8(str) {
    if (_nodeCrypto && typeof _nodeCrypto.createHash === 'function') {
        return _nodeCrypto.createHash('sha256').update(str, 'utf8').digest('hex');
    }
    // Renderer-Fallback ohne Node: synchroner, dependency-freier SHA-256 (kompakt, GoBD-Hinweis:
    // für revisionssichere Verkettung im Main via window.api/audit:verify bzw. Repository prüfen).
    return _sha256Sync(str);
}
// Kompakte synchrone SHA-256-Implementierung (public domain Stil, ASCII/UTF-8 via encodeURIComponent).
function _sha256Sync(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    const maxWord = Math.pow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = unescape(encodeURIComponent(ascii)).length * 8;
    let hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const str = unescape(encodeURIComponent(ascii));
    const strLen = str.length;
    const wordCount = (((strLen + 8) >> 6) + 1) * 16;
    for (let i = 0; i < wordCount; i++) words[i] = 0;
    for (let i = 0; i < strLen; i++) words[i >> 2] |= str.charCodeAt(i) << ((3 - (i % 4)) * 8);
    words[strLen >> 2] |= 0x80 << ((3 - (strLen % 4)) * 8);
    words[wordCount - 1] = asciiBitLength;
    for (let j = 0; j < wordCount; j += 16) {
        const w = words.slice(j, j + 16);
        for (let i = 16; i < 32; i++) {
            const s0 = rr(w[i-15],7)^rr(w[i-15],18)^(w[i-15]>>>3);
            const s1 = rr(w[i-2],17)^rr(w[i-2],19)^(w[i-2]>>>10);
            w[i] = (w[i-16]+s0+w[i-7]+s1)|0;
        }
        let [a,b,c,d,e,f,g,h] = hash;
        for (let i = 0; i < 32; i++) {
            const S1 = rr(e,6)^rr(e,11)^rr(e,25);
            const ch = (e&f)^((~e)&g);
            const t1 = (h+S1+ch+k[i]+w[i])|0;
            const S0 = rr(a,2)^rr(a,13)^rr(a,22);
            const maj = (a&b)^(a&c)^(b&c);
            const t2 = (S0+maj)|0;
            h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
        }
        hash = hash.map((v,i2)=> (v+[a,b,c,d,e,f,g,h][i2])|0);
    }
    for (let i = 0; i < 8; i++) for (let j = 3; j >= 0; j--) result += ((hash[i] >> (j*8)) & 255).toString(16).padStart(2,'0');
    return result;
}

function normText(v) {
    return (v === null || v === undefined) ? '' : String(v);
}
function normNum(v) {
    const n = parseFloat(v);
    return (isNaN(n) ? 0 : n).toFixed(2);
}
function normBool(v) {
    return v ? 1 : 0;
}

function calculateContentHash(doc) {
    if (auditModule && typeof auditModule.calculateDocumentContentHash === 'function') {
        return auditModule.calculateDocumentContentHash(doc);
    }
    if (!doc || typeof doc !== 'object') {
        return sha256HexUtf8('');
    }
    const content = {
        nr: normText(doc.nr),
        type: normText(doc.type),
        datum: normText(doc.datum),
        kundeId: doc.kundeId || null,
        projektId: doc.projektId || null,
        netto: normNum(doc.netto),
        steuer: normNum(doc.steuer),
        brutto: normNum(doc.brutto),
        globalRabattAbzug: normNum(doc.globalRabattAbzug),
        globalRabattType: normText(doc.globalRabattType || '%'),
        globalRabattValue: normNum(doc.globalRabattValue),
        anzahlung: normNum(doc.anzahlung),
        eingabemodus: normText(doc.eingabemodus || 'netto'),
        vortext: normText(doc.vortext),
        fusstext: normText(doc.fusstext),
        leistungszeitraum_von: normText(doc.leistungszeitraum_von),
        leistungszeitraum_bis: normText(doc.leistungszeitraum_bis),
        baustellen_adresse: normText(doc.baustellen_adresse),
        vob_vereinbart: normBool(doc.vob_vereinbart),
        ist_privatkunde: normBool(doc.ist_privatkunde),
        unterliegt_bauabzugsteuer: normBool(doc.unterliegt_bauabzugsteuer),
        bauabzugsteuer_betrag: normNum(doc.bauabzugsteuer_betrag),
        ausweis_35a_erforderlich: normBool(doc.ausweis_35a_erforderlich),
        summe_lohnkosten_brutto: normNum(doc.summe_lohnkosten_brutto),
        rechnungsart: normText(doc.rechnungsart || 'REGULAER'),
        kumulierte_leistung_netto: normNum(doc.kumulierte_leistung_netto),
        sicherheitseinbehalt: normNum(doc.sicherheitseinbehalt),
        unterliegt_13b: normBool(doc.unterliegt_13b),
        skonto_tage: normNum(doc.skonto_tage),
        skonto_prozent: normNum(doc.skonto_prozent),
        sepa_mandat_id: doc.sepa_mandat_id || null,
        leitweg_id: normText(doc.leitweg_id),
        buyer_reference: normText(doc.buyer_reference),
        objekt_typ: normText(doc.objekt_typ),
        objekt_id: doc.objekt_id || null,
        positionen: (doc.positionen || []).map(p => ({
            name: normText(p.name),
            artikelId: p.artikelId || null,
            menge: normNum(p.menge),
            einheit: normText(p.einheit || 'Stk.'),
            preis: normNum(p.preis),
            ek: normNum(p.ek),
            mwst: p.mwst === undefined ? null : parseFloat(p.mwst) || 0,
            rabatt: normNum(p.rabatt),
            cost_type: normText(p.cost_type || 'MATERIAL')
        })),
        verrechnungen: (doc.verrechnungen || []).map(v => ({
            vorherige_rechnung_id: v.vorherige_rechnung_id || null,
            abzugsbetrag_netto: normNum(v.abzugsbetrag_netto)
        }))
    };
    return sha256HexUtf8(JSON.stringify(content));
}

class GoBDAuditEngine {
    /**
     * Liefert den einheitlichen kanonischen Inhalts-Hash nach main/audit.js.
     * Status- und Mahnungsänderungen ('BEZAHLT') invalidieren diesen Hash nicht.
     */
    static calculateDocumentContentHash(doc) {
        return calculateContentHash(doc);
    }

    /**
     * Erzeugt einen kryptografischen SHA-256 Hash eines Dokuments (mit optionaler Verkettung zu previousHash).
     */
    static calculateDocumentHash(doc, previousHash = '') {
        const contentHash = calculateContentHash(doc);
        if (!previousHash) return contentHash;
        return sha256HexUtf8(contentHash + ':' + previousHash);
    }

    /**
     * Prüft die Unveränderbarkeit eines Dokuments (GoBD Immutability Guard).
     * @param {Object} existingDoc - Das in der DB gespeicherte Dokument.
     * @returns {Object} { canEdit: boolean, reason: string|null }
     */
    static validateImmutability(existingDoc) {
        if (existingDoc && (existingDoc.isLocked || existingDoc.status === 'POSTED' || existingDoc.status === 'Festgeschrieben' || existingDoc.status === 'Bezahlt')) {
            return {
                canEdit: false,
                reason: `Das Dokument ${existingDoc.nr} ist nach GoBD festgeschrieben/gesperrt und darf nicht direkt bearbeitet werden. Bitte erstellen Sie eine Stornorechnung / Korrekturrechnung.`
            };
        }

        return { canEdit: true, reason: null };
    }

    /**
     * Erstellt einen Audit-Log-Eintrag für die Datenbank.
     */
    static createAuditEntry({ entityType = 'DOCUMENT', entityId, action, doc, previousHash = '' }) {
        const currentHash = this.calculateDocumentHash(doc, previousHash);
        return {
            entity_type: entityType,
            entity_id: entityId,
            action, // e.g. 'CREATED', 'POSTED', 'CANCELLED'
            previous_hash: previousHash,
            current_hash: currentHash,
            details: JSON.stringify({ status: doc.status, nr: doc.nr, brutto: doc.brutto })
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GoBDAuditEngine;
} else {
    window.GoBDAuditEngine = GoBDAuditEngine;
}
