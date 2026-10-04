(function(exports) {
    const Dates = typeof require !== 'undefined' ? require('./vob-dates') : window.VobDates;

    /**
         * 2. Bedenkenanmeldung nach § 4 Abs. 3 VOB/B
         * Zur Enthaftung des Auftragnehmers von der Mängelhaftung (§ 13 Abs. 3 VOB/B).
         */
    function generateBedenkenanmeldung({
      contractor = {},
      client = {},
      project = {},
      date = new Date(),
      concernType = 'VORLEISTUNG',
      // 'VORLEISTUNG' | 'AUSFUEHRUNG' | 'STOFFE' | 'BAUGRUND'
      description = '',
      relevantStandards = '',
      risks = '',
      proposedSolution = '',
      decisionDeadlineDays = 5,
      additionalNotes = ''
    }) {
      const formattedDate = Dates.formatDate(date);
      const deadlineDate = Dates.addWorkingDays(date, decisionDeadlineDays);
      const formattedDeadline = Dates.formatDate(deadlineDate);
      const cName = contractor.name || contractor.firmenname || 'Auftragnehmer';
      const clName = client.name || client.firmenname || client.kunden_name || 'Auftraggeber';
      const pName = project.name || 'Bauvorhaben';
      const pNr = project.nummer || project.nr || '';
      const typeLabels = {
        'VORLEISTUNG': 'Mangelhafte oder ungeeignete Vorleistungen anderer Unternehmer',
        'AUSFUEHRUNG': 'Bedenken gegen die vorgesehene Art der Ausführung / Planung',
        'STOFFE': 'Bedenken gegen die Güte der vom Auftraggeber gelieferten Stoffe / Bauteile',
        'BAUGRUND': 'Bedenken gegen die Beschaffenheit des Baugrunds / Bestands'
      };
      const selectedType = typeLabels[concernType] || concernType;
      const text = `BEDENKENANMELDUNG GEMÄSS § 4 ABS. 3 VOB/B
    (Haftungsbefreiung gemäß § 13 Abs. 3 VOB/B)
    
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
    
    in Erfüllung unserer vertraglichen Prüfungs- und Hinweispflicht melden wir hiermit gemäß § 4 Abs. 3 VOB/B ausdrücklich schriftlich Bedenken an.
    
    Gegenstand der Bedenken:
    ${selectedType}
    
    1. Sachverhalt / Feststellung:
    ${description || 'Bei der Prüfung der baulichen Gegebenheiten vor Ausführung wurden Unregelmäßigkeiten festgestellt, die eine fachgerechte Leistungsausführung beeinträchtigen.'}
    
    2. Einschlägige Regelwerke / DIN-Normen:
    ${relevantStandards || 'Anerkannte Regeln der Technik, VOB Teil C sowie maßgebliche DIN-Fachnormen.'}
    
    3. Drohende Schäden / Risiken bei Beibehaltung der Planung/Vorleistung:
    ${risks || 'Gefahr von Rissbildungen, Folgeschäden durch Feuchtigkeitseintritt, Verlust von Gewährleistungseigenschaften oder Standsicherheitseinschränkungen.'}
    
    4. Fachlicher Lösungsvorschlag des Auftragnehmers:
    ${proposedSolution || 'Durchführung notwendiger Vorarbeiten bzw. Anpassung der Ausführungsplanung gemäß den allgemein anerkannten Regeln der Technik.'}
    
    Rechtlicher Hinweis nach § 13 Abs. 3 VOB/B:
    Ist ein Mangel auf die Leistungsbeschreibung, auf Anordnungen des Auftraggebers, auf von ihm gelieferte Stoffe oder Bauteile oder auf die Vorleistung eines anderen Unternehmers zurückzuführen, ist der Auftragnehmer von der Gewährleistung und Haftung für diesen Mangel frei, wenn er die Bedenken gemäß § 4 Abs. 3 VOB/B rechtzeitig schriftlich mitgeteilt hat.
    
    Wir bitten Sie um schriftliche Weisung bis spätestens zum: ${formattedDeadline} (${decisionDeadlineDays} Werktage).
    Bis zum Eingang Ihrer Weisung müssen die betroffenen Arbeiten zur Schadensvermeidung ruhen.
    
    ${additionalNotes ? `Ergänzende Bemerkungen:\n${additionalNotes}\n` : ''}
    Mit freundlichen Grüßen
    
    ${cName}
    (Rechtsverbindliche Unterschrift)`;
      const html = `<!DOCTYPE html>
    <html lang="de">
    <head>
    <meta charset="UTF-8">
    <title>Bedenkenanmeldung gem. § 4 Abs. 3 VOB/B</title>
    <style>
        @page { size: A4 portrait; margin: 20mm 20mm; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #1e293b; line-height: 1.45; margin: 0; padding: 0; background: #fff; }
        .letterhead { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 24px; }
        .sender-box { font-size: 8.5pt; color: #475569; }
        .recipient-box { margin-bottom: 24px; font-size: 10pt; line-height: 1.3; }
        .doc-meta { text-align: right; font-size: 9pt; color: #64748b; margin-bottom: 16px; }
        .doc-title { font-size: 13pt; font-weight: bold; color: #0f172a; margin-bottom: 4px; }
        .doc-subtitle { font-size: 9.5pt; font-weight: 600; color: #b45309; margin-bottom: 16px; }
        .concern-badge { background: #fffbeb; border: 1px solid #fde68a; padding: 6px 12px; border-radius: 4px; font-weight: bold; color: #92400e; margin-bottom: 14px; }
        .content-box { margin-bottom: 14px; }
        .warning-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 10px 14px; margin: 16px 0; font-size: 9pt; border-radius: 0 4px 4px 0; }
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
    
        <div class="doc-title">Bedenkenanmeldung gemäß § 4 Abs. 3 VOB/B</div>
        <div class="doc-subtitle">Haftungsfreistellung nach § 13 Abs. 3 VOB/B · Bauvorhaben: ${pName}</div>
    
        <div class="concern-badge">Kategorie: ${selectedType}</div>
    
        <div class="content-box">
            <p>Sehr geehrte Damen und Herren,</p>
            <p>in Erfüllung unserer gesetzlichen und vertraglichen Prüfungs- und Mitteilungspflicht teilen wir Ihnen hiermit unverzüglich schriftlich unsere begründeten Bedenken mit:</p>
            
            <p><strong>1. Festgestellter Sachverhalt:</strong><br>${description || 'Vorhandene bauliche Voraussetzungen weichen von den technischen Anforderungen ab.'}</p>
            <p><strong>2. Maßgebliche Regelwerke:</strong><br>${relevantStandards || 'Anerkannte Regeln der Bautechnik, DIN-Normen der VOB/C.'}</p>
            <p><strong>3. Drohende Schäden / Risiken:</strong><br>${risks || 'Gefahr von Folgemängeln, Rissen oder Undichtigkeiten bei unveränderter Fortführung.'}</p>
            <p><strong>4. Fachlicher Lösungsvorschlag:</strong><br>${proposedSolution || 'Bauseitige Mängelbeseitigung vor Beginn unserer Arbeiten.'}</p>
        </div>
    
        <div class="warning-box">
            <strong>Rechtlicher Hinweis (§ 13 Abs. 3 VOB/B):</strong><br>
            Mit Zugang dieser schriftlichen Bedenkenanmeldung ist der Auftragnehmer von der Mängelhaftung und Gewährleistung für Schäden freigestellt, die aus der beanstandeten Ausführung oder Vorleistung resultieren.<br><br>
            Wir erbitten Ihre schriftliche Anordnung / Weisung bis spätestens <strong>${formattedDeadline}</strong>.
        </div>
    
        <div class="sign-area">
            <div class="sign-line">Ort, Datum</div>
            <div class="sign-line">Rechtsverbindliche Unterschrift (${cName})</div>
        </div>
    </body>
    </html>`;
      return {
        type: 'BEDENKENANMELDUNG',
        legalBasis: '§ 4 Abs. 3 VOB/B / § 13 Abs. 3 VOB/B',
        date: formattedDate,
        deadlineDate: formattedDeadline,
        concernType,
        text,
        html
      };
    }
    
    /**
     * 3. Bauhandwerkersicherung (§ 650f BGB) - Bürgschaftsrechner
     * Formel: S_650f = (Vertragssumme + Nachträge - geleistete Zahlungen) * 1,10
     */

    exports.generateBedenkenanmeldung = generateBedenkenanmeldung;

})(typeof module !== 'undefined' && module.exports ? (module.exports = {}) : (window.VobBedenken = {}));
