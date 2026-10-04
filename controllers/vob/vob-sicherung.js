(function(exports) {
    const Dates = typeof require !== 'undefined' ? require('./vob-dates') : window.VobDates;

    /**
         * 3. Bauhandwerkersicherung (§ 650f BGB) - Bürgschaftsrechner
         * Formel: S_650f = (Vertragssumme + Nachträge - geleistete Zahlungen) * 1,10
         */
    function calculateBauhandwerkersicherung({
      contractSum = 0,
      approvedNachtraege = 0,
      paymentsReceived = 0,
      isConsumerSingleFamilyHome = false,
      deadlineDays = 10,
      requestDate = new Date()
    }) {
      const cSum = Math.round((parseFloat(contractSum) || 0) * 100) / 100;
      const nSum = Math.round((parseFloat(approvedNachtraege) || 0) * 100) / 100;
      const pSum = Math.round((parseFloat(paymentsReceived) || 0) * 100) / 100;
      const netClaim = Math.max(0, Math.round((cSum + nSum - pSum) * 100) / 100);
      // Gesetzlicher Zuschlag von 10% für Nebenforderungen (§ 650f Abs. 1 Satz 2 BGB)
      const securityAmount = Math.round(netClaim * 1.10 * 100) / 100;
      const deadlineDate = Dates.addCalendarDays(requestDate, deadlineDays);
      return {
        contractSum: cSum,
        approvedNachtraege: nSum,
        paymentsReceived: pSum,
        netClaim,
        securityMultiplier: 1.10,
        securityAmount,
        deadlineDays,
        deadlineDate,
        isConsumerException: Boolean(isConsumerSingleFamilyHome),
        isClaimValid: !isConsumerSingleFamilyHome && securityAmount > 0
      };
    }
    
    /**
     * 3b. Anschreiben: Anforderung einer Bauhandwerkersicherheit nach § 650f BGB
     * Mit 110%-Bürgschaftsbetrag, 7-10 Tage Frist, Leistungsverweigerungsrecht (Baustopp) und Kündigungsandrohung.
     */

    /**
         * 3b. Anschreiben: Anforderung einer Bauhandwerkersicherheit nach § 650f BGB
         * Mit 110%-Bürgschaftsbetrag, 7-10 Tage Frist, Leistungsverweigerungsrecht (Baustopp) und Kündigungsandrohung.
         */
    function generateBauhandwerkersicherungSchreiben({
      contractor = {},
      client = {},
      project = {},
      date = new Date(),
      calculation = {},
      customBankDetails = ''
    }) {
      const formattedDate = Dates.formatDate(date);
      const formattedDeadline = Dates.formatDate(calculation.deadlineDate || Dates.addCalendarDays(date, 10));
      const cName = contractor.name || contractor.firmenname || 'Auftragnehmer';
      const clName = client.name || client.firmenname || client.kunden_name || 'Auftraggeber';
      const pName = project.name || 'Bauvorhaben';
      const pNr = project.nummer || project.nr || '';
      const calc = calculation.securityAmount !== undefined ? calculation : calculateBauhandwerkersicherung({
        contractSum: project.auftragssumme || 0,
        approvedNachtraege: project.nachtraegeSum || 0,
        paymentsReceived: project.zahlungenSum || 0,
        requestDate: date
      });
      const text = `VERLANGEN EINER SICHERHEITSLEISTUNG GEMÄSS § 650f BGB
    (Bauhandwerkersicherung für den noch nicht gezahlten Vergütungsanspruch)
    
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
    
    gemäß § 650f Abs. 1 BGB kann der Unternehmer eines Bauvertrags vom Besteller für die auch in Zusatzaufträgen vereinbarte und noch nicht gezahlte Vergütung einschließlich dazugehöriger Nebenforderungen Sicherheit verlangen.
    
    1. Ermittlung des Sicherungsbetrags (§ 650f Abs. 1 BGB):
    - Ursprüngliche Vertragssumme: ${Dates.formatCurrency(calc.contractSum)}
    - Beauftragte Nachträge: ${Dates.formatCurrency(calc.approvedNachtraege)}
    - Bisher geleistete Zahlungen: -${Dates.formatCurrency(calc.paymentsReceived)}
    = Offene Vergütung (Restwerklohn): ${Dates.formatCurrency(calc.netClaim)}
    + Gesetzlicher Zuschlag von 10 % für Nebenforderungen (§ 650f Abs. 1 Satz 2 BGB):
    = ZU LEISTENDE SICHERHEITSSUMME: ${Dates.formatCurrency(calc.securityAmount)}
    
    2. Art der Sicherheitsleistung:
    Die Sicherheit ist durch eine unbefristete, selbstschuldnerische und unwiderrufliche Bürgschaft eines in der Europäischen Union zugelassenen Kreditinstituts oder Kreditversicherers unter Verzicht auf die Einrede der Vorausklage (§ 771 BGB) beizubringen (§ 650f Abs. 2 i.V.m. § 232 BGB).
    
    3. Fristsetzung & Rechtsfolgen:
    Wir setzen Ihnen hiermit zur Übergabe der Bürgschaftsurkunde eine Frist bis zum:
    ${formattedDeadline} (Zugang bei uns maßgeblich).
    
    WICHTIGE RECHTLICHE HINWEISE BEI FRISTABLAUF:
    1. Leistungsverweigerungsrecht (§ 650f Abs. 5 Satz 1 BGB):
    Wird die Sicherheit nicht bis zum Ablauf der Frist geleistet, sind wir gesetzlich berechtigt, die Arbeiten an dem Bauvorhaben mit sofortiger Wirkung einzustellen (Baustopp). Die daraus entstehenden Stillstands- und Vorhaltekosten fallen Ihnen zur Last.
    2. Außerordentliches Kündigungsrecht (§ 650f Abs. 5 Satz 2 i.V.m. § 648 BGB):
    Nach fruchtlosem Fristablauf können wir den Bauvertrag fristlos kündigen. In diesem Fall steht uns die vereinbarte Vergütung für die gesamte Bauleistung abzüglich ersparter Aufwendungen gesetzlich in voller Höhe zu.
    
    ${customBankDetails ? `Bürgschaftsmuster / Angaben:\n${customBankDetails}\n` : ''}
    Mit freundlichen Grüßen
    
    ${cName}
    (Rechtsverbindliche Unterschrift)`;
      const html = `<!DOCTYPE html>
    <html lang="de">
    <head>
    <meta charset="UTF-8">
    <title>Bauhandwerkersicherung gem. § 650f BGB</title>
    <style>
        @page { size: A4 portrait; margin: 20mm 20mm; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #1e293b; line-height: 1.45; margin: 0; padding: 0; background: #fff; }
        .letterhead { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 24px; }
        .sender-box { font-size: 8.5pt; color: #475569; }
        .recipient-box { margin-bottom: 24px; font-size: 10pt; line-height: 1.3; }
        .doc-meta { text-align: right; font-size: 9pt; color: #64748b; margin-bottom: 16px; }
        .doc-title { font-size: 13pt; font-weight: bold; color: #0f172a; margin-bottom: 4px; }
        .doc-subtitle { font-size: 9.5pt; font-weight: 600; color: #1e293b; margin-bottom: 16px; }
        .calc-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 9.5pt; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; }
        .calc-table td { padding: 6px 12px; border-bottom: 1px solid #e2e8f0; }
        .calc-table tr.highlight { background: #eff6ff; font-weight: bold; color: #1e3a8a; font-size: 11pt; border-top: 2px solid #3b82f6; }
        .warning-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 18px 0; font-size: 9pt; border-radius: 0 4px 4px 0; color: #991b1b; }
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
    
        <div class="doc-title">Verlangen einer Sicherheitsleistung gemäß § 650f BGB</div>
        <div class="doc-subtitle">Bauvorhaben: ${pName} ${pNr ? `(Projekt-Nr.: ${pNr})` : ''}</div>
    
        <p>Sehr geehrte Damen und Herren,</p>
        <p>gemäß <strong>§ 650f Abs. 1 BGB</strong> (Bauhandwerkersicherung) verlangen wir für die vereinbarte und noch nicht gezahlte Vergütung einschließlich Nebenforderungen die Stellung einer Sicherheit.</p>
    
        <table class="calc-table">
            <tr><td>Vereinbarte Auftragssumme (netto/brutto):</td><td style="text-align:right; font-family:monospace;">${Dates.formatCurrency(calc.contractSum)}</td></tr>
            <tr><td>Beauftragte Nachträge:</td><td style="text-align:right; font-family:monospace;">+ ${Dates.formatCurrency(calc.approvedNachtraege)}</td></tr>
            <tr><td>Geleistete Zahlungen:</td><td style="text-align:right; font-family:monospace;">- ${Dates.formatCurrency(calc.paymentsReceived)}</td></tr>
            <tr style="font-weight:600;"><td>Verbleibende offene Vergütung:</td><td style="text-align:right; font-family:monospace;">= ${Dates.formatCurrency(calc.netClaim)}</td></tr>
            <tr><td>Gesetzlicher Zuschlag 10 % (§ 650f Abs. 1 Satz 2 BGB):</td><td style="text-align:right; font-family:monospace;">+ 10,00 %</td></tr>
            <tr class="highlight"><td>Anzufordernder Bürgschaftsbetrag:</td><td style="text-align:right; font-family:monospace;">${Dates.formatCurrency(calc.securityAmount)}</td></tr>
        </table>
    
        <p>Die Sicherheit ist in Form einer selbstschuldnerischen, unbefristeten Bankbürgschaft eines in der EU zugelassenen Kreditinstituts beizubringen. Wir setzen Ihnen hierfür eine Frist bis zum <strong>${formattedDeadline}</strong>.</p>
    
        <div class="warning-box">
            <strong>Rechtsfolgen bei fruchtlosem Fristablauf (§ 650f Abs. 5 BGB):</strong><br>
            1. <strong>Arbeitseinstellung (Baustopp):</strong> Nach Fristablauf stellen wir die Arbeiten sofort ein (§ 650f Abs. 5 Satz 1 BGB). Stillstandskosten werden gesondert liquidiert.<br>
            2. <strong>Kündigung nach § 648 BGB:</strong> Nach fruchtlosem Fristablauf steht uns das Kündigungsrecht mit Anspruch auf die volle Vergütung abzüglich ersparter Aufwendungen zu.
        </div>
    
        <div class="sign-area">
            <div class="sign-line">Ort, Datum</div>
            <div class="sign-line">Rechtsverbindliche Unterschrift (${cName})</div>
        </div>
    </body>
    </html>`;
      return {
        type: 'BAUHANDWERKERSICHERUNG',
        legalBasis: '§ 650f BGB',
        date: formattedDate,
        deadlineDate: formattedDeadline,
        calculation: calc,
        text,
        html
      };
    }
    
    /**
     * 4. Förmliche Abnahmeaufforderung nach § 12 Abs. 1 & Abs. 5 VOB/B sowie § 640 BGB.
     * Setzt 12-Werktage-Frist zur Durchführung und informiert über die Abnahmefiktionen:
     * - § 12 Abs. 5 Nr. 1 VOB/B: 12 Werktage nach schriftlicher Fertigstellungsmeldung
     * - § 12 Abs. 5 Nr. 2 VOB/B: 6 Werktage nach Beginn der Benutzung
     * - § 640 Abs. 2 Satz 1 BGB: Fiktion bei Nichtverweigerung unter Angabe mindestens eines Mangels
     * - § 640 Abs. 2 Satz 2 BGB: Zwingende gesetzliche Textform-Belehrung für Verbraucher (B2C)
     */

    exports.calculateBauhandwerkersicherung = calculateBauhandwerkersicherung;
    exports.generateBauhandwerkersicherungSchreiben = generateBauhandwerkersicherungSchreiben;

})(typeof module !== 'undefined' && module.exports ? (module.exports = {}) : (window.VobSicherung = {}));
