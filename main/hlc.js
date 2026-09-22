/**
 * main/hlc.js - Hybrid Logical Clock (HLC) nach Kulkarni et al.
 * Ermöglicht kausale und deterministische Zeitordnung für verteilte Offline-Systeme.
 */

class HybridLogicalClock {
    constructor(nodeId) {
        this.nodeId = nodeId || 'srv-main';
        this.lastPhysical = 0;
        this.counter = 0;
    }

    /**
     * Erzeugt einen neuen HLC-Zeitstempel für ein lokales Ereignis.
     */
    now() {
        const physicalNow = Date.now();
        if (physicalNow > this.lastPhysical) {
            this.lastPhysical = physicalNow;
            this.counter = 0;
        } else {
            this.counter++;
        }
        return this.format();
    }

    /**
     * Aktualisiert die Uhr beim Empfang einer externen Nachricht / Mutation.
     */
    receive(remoteTimestampStr) {
        const parsed = HybridLogicalClock.parse(remoteTimestampStr);
        const physicalNow = Date.now();
        const maxPhysical = Math.max(physicalNow, this.lastPhysical, parsed.physical);

        if (maxPhysical === this.lastPhysical && maxPhysical === parsed.physical) {
            this.counter = Math.max(this.counter, parsed.counter) + 1;
        } else if (maxPhysical === this.lastPhysical) {
            this.counter++;
        } else if (maxPhysical === parsed.physical) {
            this.counter = parsed.counter + 1;
        } else {
            this.counter = 0;
        }
        this.lastPhysical = maxPhysical;
        return this.format();
    }

    format() {
        const iso = new Date(this.lastPhysical).toISOString();
        const cnt = this.counter.toString(16).padStart(4, '0');
        return `${iso}-${cnt}-${this.nodeId}`;
    }

    static parse(str) {
        if (!str || typeof str !== 'string') return { physical: 0, counter: 0, nodeId: 'unknown' };
        const parts = str.split('-');
        if (parts.length < 4) return { physical: 0, counter: 0, nodeId: 'unknown' };
        // ISO Date hat das Format: YYYY-MM-DDTHH:mm:ss.sssZ
        // parts[0] = YYYY, parts[1] = MM, parts[2] = DDTHH:mm:ss.sssZ
        // parts[3] = 0000 (hex counter)
        // parts.slice(4).join('-') = nodeId
        const iso = parts.slice(0, 3).join('-');
        const counter = parseInt(parts[3] || '0', 16);
        const nodeId = parts.slice(4).join('-') || 'unknown';
        return { physical: Date.parse(iso) || 0, counter, nodeId };
    }

    static compare(aStr, bStr) {
        const a = HybridLogicalClock.parse(aStr);
        const b = HybridLogicalClock.parse(bStr);
        if (a.physical !== b.physical) return a.physical - b.physical;
        if (a.counter !== b.counter) return a.counter - b.counter;
        return a.nodeId.localeCompare(b.nodeId);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = HybridLogicalClock;
}
if (typeof window !== 'undefined') {
    window.HybridLogicalClock = HybridLogicalClock;
}
