/**
 * controllers/SubcontractorComplianceController.js - GU-Enthaftung nach § 14 AEntG & § 48b EStG
 * Überwachung von SOKA-BAU Unbedenklichkeitsbescheinigungen (UB), BG-BAU Nachweisen und Bürgschaften.
 * Automatische Auszahlungssperre bei fehlenden oder abgelaufenen Nachweisen.
 */

class SubcontractorComplianceController {
    /**
     * Prüft die vollständige Compliance eines Nachunternehmers vor Auszahlung / Rechnungsfreigabe.
     * @param {Object} sub - Subunternehmer-Datensatz aus Tabelle kunden
     * @param {Array<Object>} nachweise - Zugehörige Nachweise aus subcontractor_compliance_nachweise
     * @param {Date|string} pruefDatum - Stichtag der Prüfung
     */
    static verifySubcontractorCompliance(sub, nachweise = [], pruefDatum = new Date()) {
        if (!sub || (!sub.is_subcontractor && !sub.ist_subunternehmer)) {
            return {
                subcontractorId: sub ? sub.id : null,
                name: sub ? sub.name : '',
                isCompliant: true,
                status: 'NOT_APPLICABLE',
                canPay: true,
                paymentLockReason: null,
                warnings: []
            };
        }

        const todayStr = typeof pruefDatum === 'string' ? pruefDatum.slice(0, 10) : new Date(pruefDatum).toISOString().slice(0, 10);
        const today = new Date(todayStr);
        const warnings = [];
        let canPay = true;

        // 1. Prüfung § 48b EStG Freistellungsbescheinigung (Finanzamt)
        const sec48bUntil = sub.sec48b_valid_until || sub.freistellung_gueltig_bis;
        if (!sec48bUntil) {
            warnings.push({
                type: 'SEC48B_MISSING',
                level: 'CRITICAL',
                message: 'Keine § 48b Freistellungsbescheinigung hinterlegt! 15 % Bauabzugsteuer müssen zwingend einbehalten werden.'
            });
        } else if (sec48bUntil < todayStr) {
            warnings.push({
                type: 'SEC48B_EXPIRED',
                level: 'CRITICAL',
                message: `§ 48b Freistellungsbescheinigung ist seit ${sec48bUntil} abgelaufen! 15 % Bauabzugsteuer einbehalten.`
            });
        }

        // 2. Prüfung SOKA-BAU Unbedenklichkeitsbescheinigung (UB) nach § 14 AEntG
        const sokaNachweise = nachweise.filter(n => n.nachweis_typ === 'SOKA_BAU_UB');
        const activeSoka = sokaNachweise.find(n => n.status === 'ACTIVE' || !n.status);

        if (!activeSoka || !activeSoka.gueltig_bis) {
            canPay = false;
            warnings.push({
                type: 'SOKA_UB_MISSING',
                level: 'LOCK_PAYMENT',
                message: 'SOKA-BAU Unbedenklichkeitsbescheinigung fehlt! Generalunternehmer-Haftung nach § 14 AEntG greift. Auszahlung gesperrt.'
            });
        } else if (activeSoka.gueltig_bis < todayStr) {
            canPay = false;
            warnings.push({
                type: 'SOKA_UB_EXPIRED',
                level: 'LOCK_PAYMENT',
                message: `SOKA-BAU Unbedenklichkeitsbescheinigung ist seit ${activeSoka.gueltig_bis} abgelaufen! Auszahlung blockiert.`
            });
        } else {
            const expDate = new Date(activeSoka.gueltig_bis);
            const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
            if (daysLeft <= 30) {
                warnings.push({
                    type: 'SOKA_UB_EXPIRING_SOON',
                    level: 'WARNING',
                    daysLeft,
                    gueltigBis: activeSoka.gueltig_bis,
                    message: `SOKA-BAU Unbedenklichkeitsbescheinigung läuft in ${daysLeft} Tagen (am ${activeSoka.gueltig_bis}) ab.`
                });
            }
        }

        // 3. Prüfung BG BAU Nachweis
        const bgBauNachweis = nachweise.find(n => n.nachweis_typ === 'BG_BAU_UB');
        if (bgBauNachweis && bgBauNachweis.gueltig_bis && bgBauNachweis.gueltig_bis < todayStr) {
            warnings.push({
                type: 'BG_BAU_EXPIRED',
                level: 'WARNING',
                message: `BG-BAU Mitgliedsbescheinigung ist seit ${bgBauNachweis.gueltig_bis} abgelaufen.`
            });
        }

        const lockWarning = warnings.find(w => w.level === 'LOCK_PAYMENT');
        const paymentLockReason = lockWarning ? lockWarning.message : null;

        return {
            subcontractorId: sub.id,
            name: sub.name,
            isCompliant: warnings.every(w => w.level !== 'CRITICAL' && w.level !== 'LOCK_PAYMENT'),
            canPay,
            paymentLockReason,
            warnings
        };
    }

    /**
     * Führt ein Gesamt-Audit für alle Nachunternehmer durch.
     */
    static auditAllSubcontractors(subcontractors = [], allNachweise = [], pruefDatum = new Date()) {
        const results = subcontractors.map(sub => {
            const subNachweise = allNachweise.filter(n => n.kunde_id === sub.id);
            return this.verifySubcontractorCompliance(sub, subNachweise, pruefDatum);
        });

        const totalCount = results.length;
        const lockedCount = results.filter(r => !r.canPay).length;
        const compliantCount = results.filter(r => r.isCompliant).length;
        const warningCount = results.filter(r => r.warnings.some(w => w.level === 'WARNING')).length;

        return {
            totalCount,
            compliantCount,
            lockedCount,
            warningCount,
            results
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubcontractorComplianceController;
} else {
    window.SubcontractorComplianceController = SubcontractorComplianceController;
}
