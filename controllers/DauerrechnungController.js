/**
 * DauerrechnungController.js - Reiner Rhythmus-Rechenkern für Abrechnungspläne (F2).
 * Node + Browser-fähig (module.exports UND window.DauerrechnungController).
 * Alle Datumsangaben sind ISO-Strings 'YYYY-MM-DD'; Berechnung über UTC,
 * damit keine Zeitzonen-Drift entsteht.
 */
class DauerrechnungController {
    static iso(date) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    static parse(isoDate) {
        const [y, m, d] = String(isoDate).split('-').map(Number);
        return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    }

    static addTage(isoDate, tage) {
        const d = this.parse(isoDate);
        d.setUTCDate(d.getUTCDate() + tage);
        return this.iso(d);
    }

    static addMonate(y, m, monate) {
        const gesamt = y * 12 + (m - 1) + monate;
        return { jahr: Math.floor(gesamt / 12), monat: (gesamt % 12) + 1 };
    }

    static tageImMonat(jahr, monat) {
        return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
    }

    /**
     * Klemmt einen Tag auf den Monatsende (31. -> 28./29./30.).
     */
    static clampTag(jahr, monat, tag) {
        return `${jahr}-${String(monat).padStart(2, '0')}-${String(Math.min(tag, this.tageImMonat(jahr, monat))).padStart(2, '0')}`;
    }

    static maxIso(a, b) {
        if (!a) return b || null;
        if (!b) return a;
        return a > b ? a : b;
    }

    /**
     * Nächster Termintag STRICTLY AFTER max(abIsoDate, plan.letzte_lauf_am),
     * frühestens ab plan.start_datum, höchstens plan.ende_datum.
     */
    static berechneNaechstenTermin(plan, abIsoDate) {
        if (!plan || !plan.start_datum || !plan.rhythmus) return null;
        const ref = this.maxIso(abIsoDate, plan.letzte_lauf_am) || '';
        const start = plan.start_datum;
        const ende = plan.ende_datum || null;

        const ok = kandidat => kandidat !== null && kandidat > ref && (!ende || kandidat <= ende);

        if (plan.rhythmus === 'MONATLICH' || plan.rhythmus === 'QUARTALSWEISE') {
            const schritt = plan.rhythmus === 'MONATLICH' ? 1 : 3;
            const tag = plan.abrechnungstag || 1;
            const anker = this.parse(start);
            let { jahr, monat } = { jahr: anker.getUTCFullYear(), monat: anker.getUTCMonth() + 1 };
            let kandidat = this.clampTag(jahr, monat, tag);
            if (kandidat < start) {
                ({ jahr, monat } = this.addMonate(jahr, monat, schritt));
                kandidat = this.clampTag(jahr, monat, tag);
            }
            for (let i = 0; i < 2400 && kandidat <= ref; i++) {
                ({ jahr, monat } = this.addMonate(jahr, monat, schritt));
                kandidat = this.clampTag(jahr, monat, tag);
            }
            return ok(kandidat) ? kandidat : null;
        }

        if (plan.rhythmus === 'JAEHRLICH') {
            const monat = plan.abrechnungsmonat || 1;
            const tag = plan.abrechnungstag || 1;
            let jahr = this.parse(start).getUTCFullYear();
            let kandidat = this.clampTag(jahr, monat, tag);
            if (kandidat < start) {
                jahr++;
                kandidat = this.clampTag(jahr, monat, tag);
            }
            for (let i = 0; i < 200 && kandidat <= ref; i++) {
                jahr++;
                kandidat = this.clampTag(jahr, monat, tag);
            }
            return ok(kandidat) ? kandidat : null;
        }

        if (plan.rhythmus === 'WOCHEN_INTERVALL') {
            const wochen = Math.max(1, parseInt(plan.intervall_wochen, 10) || 1);
            const schrittTage = 7 * wochen;
            let kandidat = start;
            for (let i = 0; i < 36500 && kandidat <= ref; i++) {
                kandidat = this.addTage(kandidat, schrittTage);
            }
            return ok(kandidat) ? kandidat : null;
        }

        return null;
    }

    /**
     * Alle Termine im Zeitfenster [vonIso, bisIso] (inklusive Grenzen).
     */
    static berechneLaufTermine(plan, vonIso, bisIso) {
        const termine = [];
        let cursor = this.maxIso(vonIso, plan.start_datum);
        while (cursor && cursor <= bisIso) {
            const termin = this.berechneNaechstenTermin(plan, this.addTage(cursor, -1));
            if (!termin || termin > bisIso) break;
            termine.push({ rechnungsDatum: termin });
            cursor = this.addTage(termin, 1);
        }
        return termine.map(t => {
            const zeitraum = this.berechneLeistungszeitraum(plan, t.rechnungsDatum);
            return { ...t, periodeVon: zeitraum.periodeVon, periodeBis: zeitraum.periodeBis };
        });
    }

    /**
     * Leistungszeitraum zu einem Rechnungsdatum:
     * NACHTRAEGLICH = vorheriges Fenster, VORAUS = ab dem Termin laufendes Fenster.
     * Fenster-Grenzen werden gegen start_datum/ende_datum geklemmt.
     */
    static berechneLeistungszeitraum(plan, rechnungsDatumIso) {
        const termin = this.parse(rechnungsDatumIso);
        const jahr = termin.getUTCFullYear();
        const monat = termin.getUTCMonth() + 1;

        let von = null;
        let bis = null;

        if (plan.abrechnungs_modus === 'VORAUS') {
            switch (plan.rhythmus) {
                case 'MONATLICH': {
                    const n = this.addMonate(jahr, monat, 1);
                    von = rechnungsDatumIso;
                    bis = this.addTage(this.clampTag(n.jahr, n.monat, 1), -1);
                    break;
                }
                case 'QUARTALSWEISE': {
                    const quartalsStartMonat = Math.floor((monat - 1) / 3) * 3 + 1;
                    const n = this.addMonate(jahr, quartalsStartMonat, 3);
                    von = rechnungsDatumIso;
                    bis = this.addTage(`${n.jahr}-${String(n.monat).padStart(2, '0')}-01`, -1);
                    break;
                }
                case 'JAEHRLICH': {
                    von = rechnungsDatumIso;
                    bis = this.addTage(`${jahr + 1}-01-01`, -1);
                    break;
                }
                case 'WOCHEN_INTERVALL': {
                    const wochen = Math.max(1, parseInt(plan.intervall_wochen, 10) || 1);
                    von = rechnungsDatumIso;
                    bis = this.addTage(rechnungsDatumIso, 7 * wochen - 1);
                    break;
                }
            }
        } else {
            switch (plan.rhythmus) {
                case 'MONATLICH': {
                    const v = this.addMonate(jahr, monat, -1);
                    von = `${v.jahr}-${String(v.monat).padStart(2, '0')}-01`;
                    bis = this.addTage(`${jahr}-${String(monat).padStart(2, '0')}-01`, -1);
                    break;
                }
                case 'QUARTALSWEISE': {
                    const quartalsStartMonat = Math.floor((monat - 1) / 3) * 3 + 1;
                    const v = this.addMonate(jahr, quartalsStartMonat, -3);
                    von = `${v.jahr}-${String(v.monat).padStart(2, '0')}-01`;
                    bis = this.addTage(`${jahr}-${String(quartalsStartMonat).padStart(2, '0')}-01`, -1);
                    break;
                }
                case 'JAEHRLICH': {
                    von = `${jahr - 1}-01-01`;
                    bis = `${jahr - 1}-12-31`;
                    break;
                }
                case 'WOCHEN_INTERVALL': {
                    const wochen = Math.max(1, parseInt(plan.intervall_wochen, 10) || 1);
                    bis = this.addTage(rechnungsDatumIso, -1);
                    von = this.addTage(bis, -(7 * wochen - 1));
                    break;
                }
            }
        }

        if (!von || !bis) return { periodeVon: rechnungsDatumIso, periodeBis: rechnungsDatumIso };

        if (plan.start_datum && von < plan.start_datum) von = plan.start_datum;
        if (plan.ende_datum && bis > plan.ende_datum) bis = plan.ende_datum;
        return { periodeVon: von, periodeBis: bis };
    }

    /**
     * Normalisierte Positionsliste eines Plans.
     */
    static berechnePositionsListe(plan, positionen = []) {
        if (plan.preis_modus === 'POSITIONEN') {
            return [...(positionen || [])]
                .sort((a, b) => (a.sortier_index || 0) - (b.sortier_index || 0))
                .map(p => ({
                    artikelId: p.artikelId || null,
                    name: p.name || '',
                    menge: parseFloat(p.menge) || 0,
                    einheit: p.einheit || 'Stk.',
                    preis: parseFloat(p.preis) || 0,
                    mwst: parseInt(p.mwst, 10) || 0
                }));
        }
        return [{
            artikelId: null,
            name: plan.name,
            menge: 1,
            einheit: 'pauschal',
            preis: parseFloat(plan.pauschale_netto) || 0,
            mwst: parseInt(plan.mwst_satz, 10) || 0
        }];
    }

    /**
     * Gruppiert fällige Läufe je Empfänger-Kunde für Sammelrechnungen.
     */
    static gruppiereFuerSammelrechnung(faelligListe) {
        const gruppen = new Map();
        for (const eintrag of faelligListe || []) {
            const kundeId = eintrag.empfaengerKundeId || eintrag.empfaenger_kunde_id;
            if (!gruppen.has(kundeId)) gruppen.set(kundeId, []);
            gruppen.get(kundeId).push(eintrag);
        }
        return gruppen;
    }

    /**
     * Lesbarer Rhythmus-Text für die UI.
     */
    static rhythmusLabel(plan) {
        const tag = plan.abrechnungstag || 1;
        switch (plan.rhythmus) {
            case 'MONATLICH':
                return `monatlich zum ${tag}.`;
            case 'QUARTALSWEISE':
                return `alle 3 Monate zum ${tag}.`;
            case 'JAEHRLICH': {
                const monatsNamen = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
                const m = plan.abrechnungsmonat || 1;
                return `jährlich am ${tag}. ${monatsNamen[m - 1]}`;
            }
            case 'WOCHEN_INTERVALL':
                return `alle ${Math.max(1, parseInt(plan.intervall_wochen, 10) || 1)} Wochen`;
            default:
                return plan.rhythmus || '-';
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DauerrechnungController;
}
if (typeof window !== 'undefined') {
    window.DauerrechnungController = DauerrechnungController;
}
