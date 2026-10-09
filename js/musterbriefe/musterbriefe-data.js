const MUSTERBRIEFE_DATA = [
    {
        id: 1,
        titel: "Behinderungsanzeige",
        paragraph: "VOB/B §6 Abs.1",
        fristhinweis: "Unverzüglich",
        url: "https://www.bauprofessor.de/musterbrief/behinderung-bauausfuehrung/",
        vorlage_text: `Betreff: Behinderungsanzeige zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

hiermit zeigen wir gemäß § 6 Abs. 1 VOB/B an, dass wir in der ordnungsgemäßen Ausführung unserer Leistungen beim Projekt {projekt} behindert sind.

Die Behinderung besteht in:
[Bitte Grund ergänzen, z.B. fehlende Vorleistungen, fehlende Planungsunterlagen]

Wir bitten um schnellstmögliche Beseitigung der Behinderungsursachen.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 2,
        titel: "Fortsetzung nach Behinderung + Fristverlängerung / Schadenersatz",
        paragraph: "VOB/B §6 Abs.3, 4, 6",
        fristhinweis: "Nach Wegfall der Behinderung",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Anzeige der Fortsetzung der Arbeiten / Fristverlängerung zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

wir teilen Ihnen gemäß § 6 Abs. 3 VOB/B mit, dass die angezeigte Behinderung für unser Bauvorhaben {projekt} am [Datum einfügen] weggefallen ist. Wir haben die Arbeiten wieder aufgenommen.

Gemäß § 6 Abs. 4 VOB/B beanspruchen wir eine entsprechende Fristverlängerung um {frist}.

[Optional: Gemäß § 6 Abs. 6 VOB/B behalten wir uns die Geltendmachung von Schadenersatz vor.]

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 3,
        titel: "Behinderungsanzeige BGB (Witterung, ohne VOB-Automatik)",
        paragraph: "BGB",
        fristhinweis: "Nach Kenntnis",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Behinderungsanzeige zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

hiermit zeigen wir an, dass wir in der Ausführung unserer Leistungen beim Projekt {projekt} behindert sind.

Grund der Behinderung sind außergewöhnliche Witterungseinflüsse, namentlich [z.B. starker Frost, andauernder Starkregen], die eine Fortführung der Arbeiten derzeit unmöglich machen.

Wir werden die Arbeiten fortsetzen, sobald es die Witterung zulässt, und bitten um entsprechende Fristverlängerung.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 4,
        titel: "Bedenkenanzeige + Bedenken nach Prüfung Ausführungsunterlagen",
        paragraph: "VOB/B §4 Abs.3 / §3 Abs.3",
        fristhinweis: "Unverzüglich vor Ausführung",
        url: "https://www.bauprofessor.de/musterbrief/bedenkenanzeige/",
        vorlage_text: `Betreff: Bedenkenanzeige zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

gemäß § 4 Abs. 3 VOB/B (bzw. § 3 Abs. 3 VOB/B) melden wir hiermit Bedenken gegen die vorgesehene Art der Ausführung an.

Unsere Bedenken gründen sich auf folgende Umstände:
[Hier Bedenken genau beschreiben, z.B. ungeeigneter Untergrund, Mängel in den Ausführungsunterlagen]

Wir bitten um kurzfristige Prüfung und Weisung, um Bauverzögerungen zu vermeiden. Bis dahin können wir die betroffenen Arbeiten nicht beginnen/fortsetzen.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 5,
        titel: "Nachtragsankündigung + Nachtragsangebot",
        paragraph: "VOB/B §2 Abs.5 / Abs.6 / Abs.3 Nr.2/3",
        fristhinweis: "Vor Ausführung der geänderten/zusätzlichen Leistung",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Nachtragsankündigung und Nachtragsangebot zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

im Zuge der Bauausführung für das Projekt {projekt} hat sich gezeigt, dass zusätzliche bzw. geänderte Leistungen erforderlich sind.

Gemäß § 2 Abs. 5/6 VOB/B kündigen wir hiermit unseren Anspruch auf besondere Vergütung an und überreichen Ihnen nachstehend bzw. in der Anlage unser Nachtragsangebot in Höhe von {betrag}.

Wir bitten um Prüfung und schriftliche Beauftragung bis zum {frist}, damit wir die Arbeiten termingerecht ausführen können.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 6,
        titel: "BGB-Änderungsbegehren/Anordnung + 80 %-Abschlagshinweis",
        paragraph: "BGB §650b Abs.1/2 / §650c Abs.3",
        fristhinweis: "Vor Ausführung",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Angebot zum Änderungsbegehren / Anordnung für das Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

bezugnehmend auf Ihr Änderungsbegehren vom [Datum] überreichen wir Ihnen hiermit unser Angebot gemäß § 650b BGB über {betrag}.

Sollte innerhalb von 30 Tagen keine Einigung zustande kommen und Sie die Änderung in Textform anordnen, weisen wir gemäß § 650c Abs. 3 BGB darauf hin, dass wir berechtigt sind, 80 % des in unserem Angebot enthaltenen Betrages als Abschlagszahlung in Rechnung zu stellen.

Wir bitten um Beauftragung bis zum {frist}.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 7,
        titel: "Abhilfeaufforderung / Gefährdung termingerechte Ausführung",
        paragraph: "VOB/B §5 Abs.3",
        fristhinweis: "Unverzüglich",
        url: "https://www.bauprofessor.de/musterbrief/gefaehrdung-termingemaesse-bauausfuehrung/",
        vorlage_text: `Betreff: Abhilfeaufforderung / Gefährdung der Termine beim Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

gemäß § 5 Abs. 3 VOB/B zeigen wir an, dass die termingerechte Ausführung unserer Leistungen gefährdet ist.

Grund hierfür ist:
[Grund beschreiben, z.B. verzögerte Vorarbeiten]

Wir fordern Sie hiermit auf, die Ursache der Verzögerung bis zum {frist} abzustellen. Andernfalls behalten wir uns vor, eine Fristverlängerung sowie eventuelle Mehrkosten geltend zu machen.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 8,
        titel: "Abnahmeverlangen / Teilabnahme / Verweigerung wegen wesentlicher Mängel",
        paragraph: "VOB/B §12 Abs.1, 2, 3",
        fristhinweis: "12 Werktage (§12 Abs. 1 VOB/B)",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Abnahmeverlangen zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

unsere Leistungen für das Bauvorhaben {projekt} sind [teilweise] fertiggestellt.

Wir verlangen hiermit gemäß § 12 Abs. 1 [bzw. Abs. 2 für Teilabnahme] VOB/B die förmliche Abnahme unserer Leistungen.
Wir bitten um Durchführung der Abnahme bzw. Mitteilung eines Termins bis zum {frist} (binnen 12 Werktagen).

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 9,
        titel: "Mängelanzeige Bauausführung / Mängelanzeige Gewährleistung + Nachfrist",
        paragraph: "VOB/B §4 Abs.7 + §8 Abs.3 / §13 Abs.5",
        fristhinweis: "Fristsetzung erforderlich",
        url: "https://www.bauprofessor.de/musterbrief/maengelanzeige-waehrend-bauausfuehrung-mit-fristsetzung/",
        vorlage_text: `Betreff: Mängelanzeige zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) Herr/Frau [Nachunternehmer],

wir müssen Ihnen leider mitteilen, dass Ihre Leistungen beim Projekt {projekt} folgende Mängel aufweisen:
[Mängel genau beschreiben]

Wir fordern Sie hiermit gemäß § 4 Abs. 7 VOB/B [oder § 13 Abs. 5 VOB/B für Gewährleistung] auf, diese Mängel bis zum {frist} fachgerecht zu beseitigen.

Nach fruchtlosem Ablauf dieser Frist behalten wir uns vor, die Mängelbeseitigung auf Ihre Kosten durch einen Dritten ausführen zu lassen (Ersatzvornahme).

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 10,
        titel: "Gemeinsames Aufmaß + Aufmaß/Abnahme nach Kündigung",
        paragraph: "VOB/B §14 Abs.2 / §8 Abs.7",
        fristhinweis: "Terminvereinbarung",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Aufforderung zum gemeinsamen Aufmaß zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

gemäß § 14 Abs. 2 VOB/B [bzw. § 8 Abs. 7 nach Kündigung] laden wir Sie hiermit zu einem gemeinsamen Aufmaß unserer erbrachten Leistungen beim Projekt {projekt} ein.

Wir schlagen als Termin den {frist} vor. Bitte bestätigen Sie diesen Termin oder nennen Sie uns zeitnah einen Alternativtermin.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 11,
        titel: "Mahnung + Nachfrist Abschläge + Einstellung der Arbeiten",
        paragraph: "VOB/B §16 Abs.1/5",
        fristhinweis: "Angemessene Nachfrist",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Mahnung fällige Abschlagszahlung zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

unsere Abschlagsrechnung vom [Rechnungsdatum] über den Betrag von {betrag} ist seit dem [Fälligkeitsdatum] fällig und bisher nicht ausgeglichen worden.

Wir fordern Sie auf, den ausstehenden Betrag bis spätestens {frist} zu überweisen.

Gemäß § 16 Abs. 5 Nr. 4 VOB/B kündigen wir an, dass wir bei nicht fristgerechter Zahlung die Arbeiten bis zur Begleichung der offenen Forderung einstellen werden.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 12,
        titel: "Abschlag auf Schlussrechnung bei verzögerter Prüfung",
        paragraph: "VOB/B §16 Abs.3 Nr.1",
        fristhinweis: "30 Tage nach Zugang der Schlussrechnung",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Verlangen eines Abschlags auf die Schlussrechnung zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

unsere Schlussrechnung für das Projekt {projekt} ist Ihnen am [Datum Zugang] zugegangen. Die Prüffrist von 30 Tagen gemäß § 16 Abs. 3 Nr. 1 VOB/B ist abgelaufen, ohne dass die Prüfung abgeschlossen wurde.

Da unstreitig Leistungen erbracht wurden, fordern wir gemäß § 16 Abs. 3 Nr. 1 VOB/B eine Abschlagszahlung in Höhe von {betrag} auf den Schlussrechnungsbetrag.

Wir bitten um Überweisung bis zum {frist}.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 13,
        titel: "Schlusszahlungserklärung mit Ausschlusswirkung + Vorbehalt",
        paragraph: "VOB/B §16 Abs.3 Nr.2,3,5",
        fristhinweis: "28 Tage für Vorbehalt (§16 Abs.3 Nr.5)",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Erklärung zur Schlusszahlung zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

wir haben Ihre Schlusszahlung vom [Datum] für das Projekt {projekt} erhalten.

Sie haben uns auf die Ausschlusswirkung gemäß § 16 Abs. 3 Nr. 2 VOB/B hingewiesen.
Hiermit erklären wir gemäß § 16 Abs. 3 Nr. 5 VOB/B fristgerecht unseren Vorbehalt gegen die Schlusszahlung, da unsere Schlussrechnung ungerechtfertigt gekürzt wurde.

Der offene Restbetrag in Höhe von {betrag} wird weiterhin eingefordert.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 14,
        titel: "Abweisung Nachforderungen nach vorbehaltloser Annahme",
        paragraph: "VOB/B §16 Abs.3 Nr.2/4",
        fristhinweis: "Nach Eingang der Nachforderung",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Ihre Nachforderung zur Schlussrechnung zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) [Nachunternehmer],

wir weisen Ihre Nachforderung vom [Datum] in Höhe von {betrag} für das Projekt {projekt} zurück.

Sie haben unsere Schlusszahlung vorbehaltlos angenommen und wir haben Sie rechtzeitig auf die Ausschlusswirkung hingewiesen (§ 16 Abs. 3 Nr. 2 VOB/B). Ein fristgerechter Vorbehalt Ihrerseits ist nicht eingegangen.
Damit sind weitere Forderungen gemäß § 16 Abs. 3 Nr. 4 VOB/B ausgeschlossen.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 15,
        titel: "Kündigungsschreiben: frei / nach Fristablauf + Schriftform-Nachweis",
        paragraph: "VOB/B §8 Abs.1, 3",
        fristhinweis: "Sofort",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Kündigung des Bauvertrages zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

hiermit kündigen wir den Bauvertrag für das Projekt {projekt} vom [Vertragsdatum].

[Entweder: freie Kündigung gemäß § 8 Abs. 1 VOB/B]
[Oder: Kündigung aus wichtigem Grund gemäß § 8 Abs. 3 VOB/B, da die gesetzte Frist zur Vertragserfüllung am [Fristdatum] fruchtlos abgelaufen ist.]

Wir bitten um Terminabstimmung für das gemeinsame Aufmaß der bisher erbrachten Leistungen bis zum {frist}.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 16,
        titel: "BGB-Zustandsfeststellung + Fälligkeits-Anschreiben",
        paragraph: "BGB §650g Abs.1, 2, 4",
        fristhinweis: "Terminvereinbarung",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Aufforderung zur Zustandsfeststellung und Fälligkeit (§ 650g BGB) zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

da Sie die Abnahme unserer Leistungen für das Projekt {projekt} unter Angabe von Mängeln verweigert haben, fordern wir Sie gemäß § 650g Abs. 1 BGB zu einer gemeinsamen Zustandsfeststellung auf.

Als Termin schlagen wir den {frist} vor.

Zugleich überreichen wir Ihnen hiermit unsere prüffähige Schlussrechnung. Wir weisen darauf hin, dass unsere Vergütung gemäß § 650g Abs. 4 BGB fällig ist.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 17,
        titel: "Verbraucherbau: 90 %-Deckelerklärung, 5 %-Sicherheitseinbehalt",
        paragraph: "BGB §650m Abs.1/2",
        fristhinweis: "Zur Abschlagsrechnung",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Abschlagsrechnung und Sicherheitseinbehalt (§ 650m BGB) zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte(r) {kunde},

anbei erhalten Sie unsere Abschlagsrechnung über {betrag}.

Gemäß § 650m Abs. 1 BGB weisen wir darauf hin, dass die Summe der von Ihnen zu leistenden Abschlagszahlungen 90 % der vereinbarten Gesamtvergütung nicht übersteigen darf.

Zudem sind Sie gemäß § 650m Abs. 2 BGB berechtigt, bei der ersten Abschlagszahlung einen Betrag von 5 % der Gesamtvergütung als Sicherheit einzubehalten, sofern keine gleichwertige Sicherheit (z.B. Avalbürgschaft) unsererseits gestellt wurde.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    },
    {
        id: 18,
        titel: "EFB-Anlage: Anschreiben EFB 221/222/223 + Urkalkulations-Verweis",
        paragraph: "Vergaberecht",
        fristhinweis: "Gemäß Aufforderung Vergabestelle",
        url: "https://www.bauprofessor.de/musterbriefe/uebersicht/",
        vorlage_text: `Betreff: Vorlage der EFB-Formblätter zum Projekt {projekt}
Datum: {datum}
An: {kunde}

Sehr geehrte Damen und Herren,

in der Anlage überreichen wir Ihnen entsprechend Ihrer Aufforderung die ausgefüllten EFB-Formblätter (221, 222, 223) zur Preisermittlung für das Projekt {projekt}.

Die Formblätter wurden auf Basis unserer Urkalkulation erstellt. Die Einsichtnahme in die Urkalkulation kann bei Bedarf in unseren Geschäftsräumen erfolgen oder [falls gefordert] in einem verschlossenen Umschlag hinterlegt werden.

Mit freundlichen Grüßen,
[Ihr Name / Firma]

(Hinweis: Vorlage, keine Rechtsberatung)`
    }
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MUSTERBRIEFE_DATA };
}
