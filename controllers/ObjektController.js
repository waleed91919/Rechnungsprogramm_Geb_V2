/**
 * ObjektController.js - Reine Geschäftslogik für die Objektverwaltung (F1).
 * Node + Browser-fähig (module.exports UND window.ObjektController).
 */
const OBJEKT_HIERARCHIE = {
    LIEGENSCHAFT: { elternFeld: null, kinderFeld: 'gebaeude', elternTyp: null },
    GEBAEUDE: { elternFeld: 'liegenschaft_id', elternTyp: 'LIEGENSCHAFT', kinderFeld: 'etagen' },
    ETAGE: { elternFeld: 'gebaeude_id', elternTyp: 'GEBAEUDE', kinderFeld: 'raeume' },
    RAUM: { elternFeld: 'etage_id', elternTyp: 'ETAGE', kinderFeld: null }
};

class ObjektController {
    static listeFuer(typ, objekteState) {
        if (!objekteState) return [];
        const key = { LIEGENSCHAFT: 'liegenschaften', GEBAEUDE: 'gebaeude', ETAGE: 'etagen', RAUM: 'raeume' }[typ];
        return objekteState[key] || [];
    }

    static findeKnoten(typ, id, objekteState) {
        return this.listeFuer(typ, objekteState).find(k => k.id === Number(id)) || null;
    }

    /**
     * Validiert einen Objektknoten vor dem Speichern.
     */
    static validateKnoten(ebene, data = {}) {
        if (!OBJEKT_HIERARCHIE[ebene]) return { valid: false, message: 'Ungültige Objekt-Ebene.' };
        if (!data.name || !String(data.name).trim()) {
            return { valid: false, message: 'Bitte einen Namen eingeben.' };
        }
        if (ebene !== 'LIEGENSCHAFT') {
            const elternFeld = OBJEKT_HIERARCHIE[ebene].elternFeld;
            if (!data[elternFeld]) {
                return { valid: false, message: 'Bitte ein übergeordnetes Objekt auswählen.' };
            }
        }
        if (ebene === 'RAUM' && data.flaeche !== undefined && data.flaeche !== '' && data.flaeche !== null) {
            const flaeche = parseFloat(data.flaeche);
            if (isNaN(flaeche) || flaeche < 0) {
                return { valid: false, message: 'Ungültige Fläche: Der Wert darf nicht negativ sein.' };
            }
        }
        if (data.empfaenger_art && !data.empfaenger_kunde_id) {
            return { valid: false, message: 'Empfänger-Art kann nur zusammen mit einem Empfänger-Kunden gesetzt werden.' };
        }
        if (data.empfaenger_art && !['EIGENTUEMER', 'MIETER', 'HAUSVERWALTUNG'].includes(data.empfaenger_art)) {
            return { valid: false, message: 'Ungültige Empfänger-Art.' };
        }
        return { valid: true };
    }

    /**
     * Steigt vom Knoten nach oben bis zum ersten gesetzten Empfänger.
     */
    static resolveEmpfaenger(objektTyp, objektId, objekteState) {
        let curTyp = objektTyp;
        let curId = Number(objektId);
        while (curTyp && curId != null && OBJEKT_HIERARCHIE[curTyp]) {
            const knoten = this.findeKnoten(curTyp, curId, objekteState);
            if (!knoten) return null;
            if (knoten.empfaenger_kunde_id) {
                return {
                    kundeId: knoten.empfaenger_kunde_id,
                    art: knoten.empfaenger_art || null,
                    quelle: curTyp,
                    direkt: curTyp === objektTyp
                };
            }
            const cfg = OBJEKT_HIERARCHIE[curTyp];
            if (!cfg.elternTyp) break;
            curId = knoten[cfg.elternFeld];
            curTyp = cfg.elternTyp;
        }
        return null;
    }

    /**
     * Baut den Brotkrumen-Pfad 'Liegenschaft › Gebäude › Etage › Raum'.
     */
    static buildPfad(objektTyp, objektId, objekteState) {
        const teile = [];
        let curTyp = objektTyp;
        let curId = Number(objektId);
        while (curTyp && curId != null && OBJEKT_HIERARCHIE[curTyp]) {
            const knoten = this.findeKnoten(curTyp, curId, objekteState);
            if (!knoten) break;
            teile.unshift(knoten.objekt_nr || knoten.name);
            const cfg = OBJEKT_HIERARCHIE[curTyp];
            if (!cfg.elternTyp) break;
            curId = knoten[cfg.elternFeld];
            curTyp = cfg.elternTyp;
        }
        return teile.join(' › ');
    }

    /**
     * Liefert den Knoten selbst und alle Nachkommen als [{objektTyp, objektId}].
     */
    static getDescendantIds(objektTyp, objektId, objekteState) {
        const ergebnis = [{ objektTyp, objektId: Number(objektId) }];
        const cfg = OBJEKT_HIERARCHIE[objektTyp];
        if (!cfg || !cfg.kinderFeld) return ergebnis;

        const kindListen = {
            gebaeude: () => this.listeFuer('GEBAEUDE', objekteState).filter(g => g.liegenschaft_id === Number(objektId)).map(g => ({ typ: 'GEBAEUDE', id: g.id })),
            etagen: () => this.listeFuer('ETAGE', objekteState).filter(e => e.gebaeude_id === Number(objektId)).map(e => ({ typ: 'ETAGE', id: e.id })),
            raeume: () => this.listeFuer('RAUM', objekteState).filter(r => r.etage_id === Number(objektId)).map(r => ({ typ: 'RAUM', id: r.id }))
        };
        for (const kind of kindListen[cfg.kinderFeld]()) {
            ergebnis.push(...this.getDescendantIds(kind.typ, kind.id, objekteState));
        }
        return ergebnis;
    }

    /**
     * Summiert alle m²-Flächen des Knotens inkl. Nachkommen (Stk. wird ignoriert).
     */
    static summiereFlaechen(objektTyp, objektId, objekteState) {
        const ids = this.getDescendantIds(objektTyp, objektId, objekteState);
        let summe = 0;
        for (const k of ids) {
            if (k.objektTyp !== 'RAUM') continue;
            const raum = this.findeKnoten('RAUM', k.objektId, objekteState);
            if (!raum || raum.einheit !== 'm²') continue;
            summe += parseFloat(raum.flaeche) || 0;
        }
        return Math.round(summe * 100) / 100;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ObjektController;
}
if (typeof window !== 'undefined') {
    window.ObjektController = ObjektController;
}
