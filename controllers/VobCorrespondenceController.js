/**
 * controllers/VobCorrespondenceController.js - Generator für rechtssicheren Schriftverkehr nach VOB/B & BGB
 * Implementiert die baurechtlichen Vorlagen und Formeln aus bauprofessor.de:
 * 1. Behinderungsanzeige (§ 6 Abs. 1 VOB/B)
 * 2. Bedenkenanmeldung (§ 4 Abs. 3 VOB/B)
 * 3. Bauhandwerkersicherung (§ 650f BGB) mit 110%-Bürgschaftsrechner & Baustopp-Androhung
 * 4. Förmliche Abnahmeaufforderung (§ 12 VOB/B) mit 12-Werktage-Frist & Abnahmefiktion
 * 
 * Isomorph aufgebaut für Node.js und Browser/Electron Renderer.
 */

const Dates = typeof require !== 'undefined' ? require('./vob/vob-dates') : window.VobDates;
const Behinderung = typeof require !== 'undefined' ? require('./vob/vob-behinderung') : window.VobBehinderung;
const Bedenken = typeof require !== 'undefined' ? require('./vob/vob-bedenken') : window.VobBedenken;
const Sicherung = typeof require !== 'undefined' ? require('./vob/vob-sicherung') : window.VobSicherung;
const Abnahme = typeof require !== 'undefined' ? require('./vob/vob-abnahme') : window.VobAbnahme;

class VobCorrespondenceController {
    static formatCurrency(amount) {
        return Dates.formatCurrency.apply(this, arguments);
    }

    static formatDate(d) {
        return Dates.formatDate.apply(this, arguments);
    }

    static addCalendarDays(startDate, days) {
        return Dates.addCalendarDays.apply(this, arguments);
    }

    static addWorkingDays(startDate, days) {
        return Dates.addWorkingDays.apply(this, arguments);
    }

    static generateBehinderungsanzeige(options) {
        return Behinderung.generateBehinderungsanzeige.apply(this, arguments);
    }

    static generateBedenkenanmeldung(options) {
        return Bedenken.generateBedenkenanmeldung.apply(this, arguments);
    }

    static calculateBauhandwerkersicherung(options) {
        return Sicherung.calculateBauhandwerkersicherung.apply(this, arguments);
    }

    static generateBauhandwerkersicherungSchreiben(options) {
        return Sicherung.generateBauhandwerkersicherungSchreiben.apply(this, arguments);
    }

    static generateAbnahmeaufforderung(options) {
        return Abnahme.generateAbnahmeaufforderung.apply(this, arguments);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = VobCorrespondenceController;
}
if (typeof window !== 'undefined') {
    window.VobCorrespondenceController = VobCorrespondenceController;
}
