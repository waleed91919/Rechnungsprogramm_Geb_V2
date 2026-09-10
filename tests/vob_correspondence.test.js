const { describe, it } = require('node:test');
const assert = require('node:assert');
const VobCorrespondenceController = require('../controllers/VobCorrespondenceController');

describe('VOB/B & BGB Schriftverkehr-Generator (VobCorrespondenceController)', () => {
    const contractor = {
        name: 'Bauunternehmen Müller GmbH',
        strasse: 'Bauweg 1',
        plz: '10115',
        ort: 'Berlin'
    };

    const client = {
        name: 'Immobilien Invest AG',
        strasse: 'Hauptstr. 50',
        plz: '10117',
        ort: 'Berlin'
    };

    const project = {
        name: 'Wohnanlage Spreeblick',
        nummer: 'PRJ-2026-042'
    };

    it('1. Behinderungsanzeige (§ 6 Abs. 1 VOB/B) generiert rechtssicheren Text & HTML', () => {
        const res = VobCorrespondenceController.generateBehinderungsanzeige({
            contractor,
            client,
            project,
            date: '2026-09-01',
            startDate: '2026-09-01',
            reason: 'Vorleistung Estrich noch feucht; keine Baufreiheit für Bodenbelagsarbeiten.',
            affectedAreas: 'Haus A, 1. bis 3. OG',
            expectedDurationDays: 14
        });

        assert.strictEqual(res.type, 'BEHINDERUNGSANZEIGE');
        assert.strictEqual(res.legalBasis, '§ 6 Abs. 1 VOB/B');
        assert.ok(res.text.includes('§ 6 Abs. 1 VOB/B'));
        assert.ok(res.text.includes('§ 6 Abs. 2 VOB/B'));
        assert.ok(res.text.includes('§ 642 BGB'));
        assert.ok(res.text.includes('§ 11 VOB/B'));
        assert.ok(res.text.includes('14 Arbeitstage'));
        assert.ok(res.html.includes('Wohnanlage Spreeblick'));
    });

    it('2. Bedenkenanmeldung (§ 4 Abs. 3 VOB/B) enthält Enthaftungshinweis nach § 13 Abs. 3 VOB/B', () => {
        const res = VobCorrespondenceController.generateBedenkenanmeldung({
            contractor,
            client,
            project,
            date: '2026-09-02',
            concernType: 'VORLEISTUNG',
            description: 'Der bauseitige Untergrund weist Unebenheiten von mehr als 8 mm auf 2 m Messlänge auf.',
            relevantStandards: 'DIN 18202 Tabelle 3 Zeile 3 (Ebenheitstoleranzen)',
            risks: 'Hohlstellen und Bruchgefahr der großformatigen Fliesen',
            proposedSolution: 'Bauseitiger Ausgleich durch mineralische Spachtelmasse',
            decisionDeadlineDays: 5
        });

        assert.strictEqual(res.type, 'BEDENKENANMELDUNG');
        assert.ok(res.text.includes('§ 4 Abs. 3 VOB/B'));
        assert.ok(res.text.includes('§ 13 Abs. 3 VOB/B'));
        assert.ok(res.text.includes('DIN 18202'));
        assert.ok(res.deadlineDate);
        assert.ok(res.html.includes('Haftungsfreistellung nach § 13 Abs. 3 VOB/B'));
    });

    it('3. Bauhandwerkersicherung (§ 650f BGB): 110%-Bürgschaftsrechner & Musterschreiben', () => {
        // Vertrag 100.000 € + Nachträge 25.000 € - Zahlung 45.000 € = Restwerklohn 80.000 €
        // 80.000 * 1.10 = 88.000 €
        const calc = VobCorrespondenceController.calculateBauhandwerkersicherung({
            contractSum: 100000.00,
            approvedNachtraege: 25000.00,
            paymentsReceived: 45000.00,
            isConsumerSingleFamilyHome: false,
            deadlineDays: 10
        });

        assert.strictEqual(calc.netClaim, 80000.00);
        assert.strictEqual(calc.securityAmount, 88000.00, 'Sicherheitsanspruch muss 110% betragen');
        assert.strictEqual(calc.isClaimValid, true);
        assert.strictEqual(calc.isConsumerException, false);

        // Verbraucher-Ausnahme bei Einfamilienhaus-Neubau
        const calcVerbraucher = VobCorrespondenceController.calculateBauhandwerkersicherung({
            contractSum: 100000.00,
            paymentsReceived: 0,
            isConsumerSingleFamilyHome: true
        });
        assert.strictEqual(calcVerbraucher.isConsumerException, true);
        assert.strictEqual(calcVerbraucher.isClaimValid, false);

        // Musterschreiben generieren
        const brief = VobCorrespondenceController.generateBauhandwerkersicherungSchreiben({
            contractor,
            client,
            project,
            date: '2026-09-05',
            calculation: calc
        });

        assert.strictEqual(brief.type, 'BAUHANDWERKERSICHERUNG');
        assert.ok(brief.text.includes('88.000,00 €'));
        assert.ok(brief.text.includes('§ 650f Abs. 5 Satz 1 BGB'));
        assert.ok(brief.text.includes('Baustopp'));
        assert.ok(brief.text.includes('§ 648 BGB'));
    });

    it('4. Förmliche Abnahmeaufforderung (§ 12 VOB/B) setzt 12-Werktage-Frist und nennt Abnahmefiktion', () => {
        const res = VobCorrespondenceController.generateAbnahmeaufforderung({
            contractor,
            client,
            project,
            date: '2026-09-08',
            completionDate: '2026-09-07',
            proposedDates: ['15.09.2026 um 10:00 Uhr', '17.09.2026 um 14:00 Uhr']
        });

        assert.strictEqual(res.type, 'ABNAHMEAUFFORDERUNG');
        assert.ok(res.text.includes('§ 12 Abs. 1 VOB/B'));
        assert.ok(res.text.includes('12 Werktagen'));
        assert.ok(res.text.includes('§ 12 Abs. 5 Nr. 1 VOB/B'));
        assert.ok(res.text.includes('6 Werktagen'));
        assert.ok(res.text.includes('§ 640 Abs. 2 BGB'));
        assert.ok(res.html.includes('15.09.2026 um 10:00 Uhr'));
    });
});
