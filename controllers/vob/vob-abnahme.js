(function(exports) {
    const Dates = typeof require !== 'undefined' ? require('./vob-dates') : window.VobDates;

    /**
         * 4. Förmliche Abnahmeaufforderung nach § 12 Abs. 1 & Abs. 5 VOB/B sowie § 640 BGB.
         * Setzt 12-Werktage-Frist zur Durchführung und informiert über die Abnahmefiktionen:
         * - § 12 Abs. 5 Nr. 1 VOB/B: 12 Werktage nach schriftlicher Fertigstellungsmeldung
         * - § 12 Abs. 5 Nr. 2 VOB/B: 6 Werktage nach Beginn der Benutzung
         * - § 640 Abs. 2 Satz 1 BGB: Fiktion bei Nichtverweigerung unter Angabe mindestens eines Mangels
         * - § 640 Abs. 2 Satz 2 BGB: Zwingende gesetzliche Textform-Belehrung für Verbraucher (B2C)
         */
    function generateAbnahmeaufforderung({
      contractor = {},
      client = {},
      project = {},
      date = new Date(),
      completionDate = new Date(),
      proposedDates = [],
      additionalNotes = '',
      isConsumer = null
    }) {
      const formattedDate = Dates.formatDate(date);
      const formattedCompletion = Dates.formatDate(completionDate);
      const deadlineDate = Dates.addWorkingDays(date, 12);
      const formattedDeadline = Dates.formatDate(deadlineDate);
      const isConsumerClient = isConsumer !== null ? Boolean(isConsumer) : Boolean(client.ist_verbraucher || client.ist_privatkunde || client.customer_type === 'B2C' || client.typ === 'PRIVAT');
      const cName = contractor.name || contractor.firmenname || 'Auftragnehmer';
      const clName = client.name || client.firmenname || client.kunden_name || 'Auftraggeber';
      const pName = project.name || 'Bauvorhaben';
      const pNr = project.nummer || project.nr || '';
      const datesText = proposedDates.length > 0 ? proposedDates.map((pd, i) => `  Vorschlag ${i + 1}: ${pd}`).join('\n') : `  Innerhalb der 12-Werktage-Frist bis zum ${formattedDeadline} nach vorheriger Terminabstimmung.`;
      let consumerSectionText = '';
      if (isConsumerClient) {
        consumerSectionText = `
    GESETZLICHE BELEHRUNG FÜR VERBRAUCHER GEMÄSS § 640 ABS. 2 SATZ 2 BGB:
    Wir weisen Sie hiermit ausdrücklich in Textform darauf hin, dass das Werk als abgenommen gilt, wenn Sie die Abnahme nicht innerhalb der vorstehenden Frist (spätestens bis zum ${formattedDeadline}) unter Angabe mindestens eines Mangels verweigern oder die Erklärung der Abnahme grundlos unterlassen.
    Für die Wahrung der Frist ist der rechtzeitige Zugang der Mängelrüge in Textform bei uns vor Fristablauf maßgeblich.`;
      }
      const text = `FERTIGSTELLUNGSMITTEILUNG & AUFFORDERUNG ZUR FÖRMLICHEN ABNAHME GEMÄSS § 12 VOB/B
    
    Bauvorhaben: ${pName} ${pNr ? `(Projekt-Nr.: ${pNr})` : ''}
    Datum: ${formattedDate}
    
    An:
    ${clName}
    ${client.strasse || ''}
    ${client.plz || ''} ${client.ort || ''}
    
    Von:
    ${cName}
    ${contractor.strasse || ''}
    ${contractor.plz || ''} ${contractor.ort || ''}
    
    Sehr geehrte Damen und Herren,
    
    wir teilen Ihnen hiermit mit, dass unsere vertraglichen Leistungen für das Bauvorhaben ${pName} am ${formattedCompletion} fertiggestellt wurden.
    
    Gemäß § 12 Abs. 1 VOB/B fordern wir Sie hiermit auf, die förmliche Abnahme unserer Leistung binnen der gesetzlichen Frist von 12 Werktagen, somit spätestens bis zum:
    ${formattedDeadline}
    gemeinsam mit uns durchzuführen.
    
    Terminvorschläge für die gemeinsame Abnahmebegehung:
    ${datesText}
    
    WICHTIGE RECHTLICHE HINWEISE ZUR ABNAHMEFIKTION:
    1. Fiktive Abnahme nach schriftlicher Fertigstellungsmitteilung (§ 12 Abs. 5 Nr. 1 VOB/B):
    Wird keine Abnahme verlangt, so gilt die Leistung mit Ablauf von 12 Werktagen nach Zugang dieser schriftlichen Fertigstellungsmitteilung als abgenommen.
    2. Fiktive Abnahme nach Inbenutzungnahme (§ 12 Abs. 5 Nr. 2 VOB/B):
    Wird keine Abnahme verlangt und hat der Auftraggeber die Leistung oder einen Teil der Leistung in Benutzung genommen, so gilt die Abnahme nach Ablauf von 6 Werktagen nach Beginn der Benutzung als erfolgt.
    3. Fiktive Abnahme nach BGB (§ 640 Abs. 2 BGB):
    Verweigert der Besteller die Abnahme nicht innerhalb der gesetzten Frist unter Angabe mindestens eines Mangels (§ 640 Abs. 2 Satz 1 BGB), gilt das Werk ebenfalls kraft Gesetzes als abgenommen.
    ${consumerSectionText}
    4. Wirkungen der Abnahme:
    Mit der Abnahme geht die Gefahr des zufälligen Untergangs auf Sie über (§ 644 BGB, § 12 Abs. 6 VOB/B), die Beweislast für Mängel kehrt sich um, die Fälligkeit der Schlussrechnung tritt ein (§ 16 Abs. 3 VOB/B) und die Frist für Mängelansprüche (§ 13 Abs. 4 VOB/B) beginnt zu laufen. Zudem ist eine einbehaltene Vertragserfüllungsbürgschaft unverzüglich freizugeben.
    
    Bitte bestätigen Sie uns den Abnahmetermin kurzfristig schriftlich.
    
    ${additionalNotes ? `Hinweise:\n${additionalNotes}\n` : ''}
    Mit freundlichen Grüßen
    
    ${cName}
    (Rechtsverbindliche Unterschrift)`;
      const consumerHtmlBox = isConsumerClient ? `
        <div class="info-box" style="background: #eff6ff; border-left: 4px solid #2563eb; color: #1e3a8a; margin: 16px 0; padding: 12px 16px; border-radius: 0 4px 4px 0; font-size: 9pt;">
            <strong>Gesetzliche Belehrung für Verbraucher gemäß § 640 Abs. 2 Satz 2 BGB:</strong><br>
            Wir weisen Sie hiermit ausdrücklich in Textform darauf hin: Wenn Sie die Abnahme nicht innerhalb der gesetzten Frist bis zum <strong>${formattedDeadline}</strong> unter Angabe mindestens eines Mangels verweigern, gilt das Werk kraft Gesetzes als abgenommen. Zur Fristwahrung genügt der rechtzeitige Zugang der Mängelrüge in Textform vor Fristablauf.
        </div>` : '';
      const html = `<!DOCTYPE html>
    <html lang="de">
    <head>
    <meta charset="UTF-8">
    <title>Aufforderung zur förmlichen Abnahme gem. § 12 VOB/B</title>
    <style>
        @page { size: A4 portrait; margin: 20mm 20mm; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #1e293b; line-height: 1.45; margin: 0; padding: 0; background: #fff; }
        .letterhead { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 24px; }
        .sender-box { font-size: 8.5pt; color: #475569; }
        .recipient-box { margin-bottom: 24px; font-size: 10pt; line-height: 1.3; }
        .doc-meta { text-align: right; font-size: 9pt; color: #64748b; margin-bottom: 16px; }
        .doc-title { font-size: 13pt; font-weight: bold; color: #0f172a; margin-bottom: 4px; }
        .doc-subtitle { font-size: 9.5pt; font-weight: 600; color: #1e293b; margin-bottom: 16px; }
        .info-box { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px 16px; margin: 16px 0; font-size: 9pt; border-radius: 0 4px 4px 0; color: #14532d; }
        .warning-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; font-size: 9pt; border-radius: 0 4px 4px 0; color: #78350f; }
        .sign-area { margin-top: 35px; display: flex; justify-content: space-between; page-break-inside: avoid; }
        .sign-line { border-top: 1px solid #0f172a; width: 220px; padding-top: 4px; font-size: 8.5pt; color: #475569; }
    </style>
    </head>
    <body>
        <div class="letterhead">
            <div>
                <div style="font-size: 12pt; font-weight: bold; color: #0f172a;">${cName}</div>
                <div class="sender-box">${contractor.strasse || ''} · ${contractor.plz || ''} ${contractor.ort || ''}</div>
            </div>
            <div class="doc-meta">Datum: ${formattedDate}</div>
        </div>
    
        <div class="recipient-box">
            <strong>${clName}</strong><br>
            ${client.strasse || ''}<br>
            ${client.plz || ''} ${client.ort || ''}
        </div>
    
        <div class="doc-title">Fertigstellungsanzeige & Aufforderung zur förmlichen Abnahme</div>
        <div class="doc-subtitle">Gemäß § 12 Abs. 1 VOB/B · Bauvorhaben: ${pName}</div>
    
        <div class="info-box">
            Unsere vertraglichen Bauleistungen wurden zum <strong>${formattedCompletion}</strong> vollständig fertiggestellt.
        </div>
    
        <p>Gemäß § 12 Abs. 1 VOB/B fordern wir Sie hiermit auf, die gemeinsame förmliche Abnahme binnen <strong>12 Werktagen</strong>, somit spätestens bis zum <strong>${formattedDeadline}</strong>, durchzuführen.</p>
    
        <p><strong>Terminvorschlag für die Abnahme:</strong><br>
        ${datesText.replace(/\n/g, '<br>')}</p>
    ${consumerHtmlBox}
        <div class="warning-box">
            <strong>Rechtliche Wirkungen und Abnahmefiktion:</strong><br>
            • <strong>Schriftliche Fertigstellungsmeldung (§ 12 Abs. 5 Nr. 1 VOB/B):</strong> Wird keine förmliche Abnahme verlangt, gilt die Leistung mit Ablauf von 12 Werktagen nach Mitteilung als abgenommen.<br>
            • <strong>Inbenutzungnahme (§ 12 Abs. 5 Nr. 2 VOB/B):</strong> Nehmen Sie das Bauwerk in Benutzung, gilt die Leistung nach Ablauf von 6 Werktagen nach Beginn der Benutzung als abgenommen.<br>
            • <strong>BGB-Abnahmefiktion (§ 640 Abs. 2 BGB):</strong> Verweigern Sie die Abnahme nicht innerhalb der Frist unter Angabe mindestens eines Mangels (§ 640 Abs. 2 Satz 1 BGB), gilt das Werk kraft Gesetzes als abgenommen.<br>
            • Mit der Abnahme kehrt sich die Beweislast für Mängel um, die Verjährungsfrist für Mängelansprüche (§ 13 Abs. 4 VOB/B) beginnt zu laufen und etwaige Vertragserfüllungssicherheiten sind freizugeben.
        </div>
    
        <div class="sign-area">
            <div class="sign-line">Ort, Datum</div>
            <div class="sign-line">Rechtsverbindliche Unterschrift (${cName})</div>
        </div>
    </body>
    </html>`;
      return {
        type: 'ABNAHMEAUFFORDERUNG',
        legalBasis: isConsumerClient ? '§ 12 Abs. 1 & 5 VOB/B / § 640 Abs. 1 & 2 BGB' : '§ 12 Abs. 1 & 5 VOB/B / § 640 BGB',
        date: formattedDate,
        completionDate: formattedCompletion,
        deadlineDate: formattedDeadline,
        isConsumer: isConsumerClient,
        text,
        html
      };
    }

    exports.generateAbnahmeaufforderung = generateAbnahmeaufforderung;

})(typeof module !== 'undefined' && module.exports ? (module.exports = {}) : (window.VobAbnahme = {}));
