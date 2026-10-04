(function(exports) {
    const Dates = typeof require !== 'undefined' ? require('./vob-dates') : window.VobDates;

    function generateBehinderungsanzeige({
      contractor = {},
      client = {},
      project = {},
      date = new Date(),
      reason = '',
      affectedAreas = '',
      startDate = new Date(),
      expectedDurationDays = 0,
      isSevereWeather = false,
      additionalNotes = ''
    }) {
      const formattedDate = Dates.formatDate(date);
      const formattedStart = Dates.formatDate(startDate);
      const cName = contractor.name || contractor.firmenname || 'Auftragnehmer';
      const clName = client.name || client.firmenname || client.kunden_name || 'Auftraggeber';
      const pName = project.name || 'Bauvorhaben';
      const pNr = project.nummer || project.nr || '';
      const text = `BEHINDERUNGSANZEIGE GEMÄSS § 6 ABS. 1 VOB/B
    
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
    
    hiermit zeigen wir Ihnen gemäß § 6 Abs. 1 VOB/B an, dass wir in der ordnungsgemäßen Ausführung unserer vertraglichen Leistungen behindert sind.
    
    1. Behinderungsgrund / Ursache:
    ${reason || 'Die vereinbarten bauseitigen Vorleistungen sind noch nicht fertiggestellt bzw. die Baufreiheit ist nicht gewährleistet.'}
    ${isSevereWeather ? 'Hinweis: Die aufgetretenen Witterungsverhältnisse weichen erheblich vom langjährigen meteorologischen Mittel ab und machen eine fachgerechte Ausführung unmöglich.' : ''}
    
    2. Betroffene Baubereiche / Gewerke:
    ${affectedAreas || 'Gesamter Leistungsbereich gemäß Leistungsverzeichnis.'}
    
    3. Beginn und voraussichtliche Dauer der Behinderung:
    Beginn: ${formattedStart}
    Voraussichtliche Verzögerung: ${expectedDurationDays > 0 ? `${expectedDurationDays} Arbeitstage` : 'Dauer bis zur Beseitigung der Ursache derzeit noch nicht absehbar.'}
    
    Rechtliche Hinweise:
    Gemäß § 6 Abs. 2 VOB/B verlängern sich die Ausführungsfristen um die Dauer der Behinderung zuzüglich eines angemessenen Zuschlags für die Wiederaufnahme der Arbeiten.
    Wir weisen darauf hin, dass etwaige vertraglich vereinbarte Fertigstellungstermine sowie Vertragsstrafenregelungen (§ 11 VOB/B) für den Zeitraum der Behinderung außer Kraft gesetzt sind.
    Sollte die Behinderung durch Sie oder von Ihnen beauftragte Dritte zu vertreten sein, behalten wir uns die Geltendmachung von Schadensersatz (§ 6 Abs. 6 VOB/B) sowie Entschädigungsansprüchen (§ 642 BGB für Bereitstellungskosten, Baustellengemeinkosten und Personalstillstand) ausdrücklich vor.
    
    Wir fordern Sie höflich auf, die Behinderungsursache unverzüglich zu beseitigen und uns die Wiederherstellung der Baufreiheit schriftlich mitzuteilen.
    
    ${additionalNotes ? `Ergänzende Hinweise:\n${additionalNotes}\n` : ''}
    Mit freundlichen Grüßen
    
    ${cName}
    (Rechtsverbindliche Unterschrift)`;
      const html = `<!DOCTYPE html>
    <html lang="de">
    <head>
    <meta charset="UTF-8">
    <title>Behinderungsanzeige gem. § 6 Abs. 1 VOB/B</title>
    <style>
        @page { size: A4 portrait; margin: 20mm 20mm; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #1e293b; line-height: 1.45; margin: 0; padding: 0; background: #fff; }
        .letterhead { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 24px; }
        .sender-box { font-size: 8.5pt; color: #475569; }
        .recipient-box { margin-bottom: 24px; font-size: 10pt; line-height: 1.3; }
        .doc-meta { text-align: right; font-size: 9pt; color: #64748b; margin-bottom: 16px; }
        .doc-title { font-size: 13pt; font-weight: bold; color: #0f172a; margin-bottom: 6px; }
        .doc-subtitle { font-size: 10pt; font-weight: bold; color: #b91c1c; margin-bottom: 16px; }
        .content-box { margin-bottom: 14px; }
        .notice-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 10px 14px; margin: 16px 0; font-size: 9pt; border-radius: 0 4px 4px 0; }
        .sign-area { margin-top: 40px; display: flex; justify-content: space-between; page-break-inside: avoid; }
        .sign-line { border-top: 1px solid #0f172a; width: 220px; padding-top: 4px; font-size: 8.5pt; color: #475569; }
    </style>
    </head>
    <body>
        <div class="letterhead">
            <div>
                <div style="font-size: 12pt; font-weight: bold; color: #0f172a;">${cName}</div>
                <div class="sender-box">${contractor.strasse || ''} · ${contractor.plz || ''} ${contractor.ort || ''}</div>
            </div>
            <div class="doc-meta">
                Datum: ${formattedDate}
            </div>
        </div>
    
        <div class="recipient-box">
            <strong>${clName}</strong><br>
            ${client.strasse || ''}<br>
            ${client.plz || ''} ${client.ort || ''}
        </div>
    
        <div class="doc-title">Behinderungsanzeige gemäß § 6 Abs. 1 VOB/B</div>
        <div class="doc-subtitle">Bauvorhaben: ${pName} ${pNr ? `(Projekt-Nr.: ${pNr})` : ''}</div>
    
        <div class="content-box">
            <p>Sehr geehrte Damen und Herren,</p>
            <p>hiermit zeigen wir Ihnen gemäß <strong>§ 6 Abs. 1 VOB/B</strong> schriftlich und unverzüglich an, dass wir in der ordnungsgemäßen Ausführung unserer vertraglichen Bauleistungen behindert sind.</p>
            
            <p><strong>1. Ursache der Behinderung:</strong><br>
            ${reason || 'Die vereinbarten Vorleistungen bauseits bzw. durch Vorunternehmer sind nicht fertiggestellt, sodass keine Baufreiheit besteht.'}</p>
    
            <p><strong>2. Betroffene Bereiche / Gewerke:</strong><br>
            ${affectedAreas || 'Gesamter vertraglicher Leistungsbereich.'}</p>
    
            <p><strong>3. Beginn und voraussichtliche Dauer:</strong><br>
            Beginn der Behinderung: <strong>${formattedStart}</strong><br>
            Voraussichtliche Verzögerung: <strong>${expectedDurationDays > 0 ? `${expectedDurationDays} Arbeitstage` : 'Dauer bis zur Mängelbeseitigung vorerst unbestimmt.'}</strong></p>
        </div>
    
        <div class="notice-box">
            <strong>Rechtsfolgen nach VOB/B & BGB:</strong><br>
            • Die vertraglichen Ausführungsfristen verlängern sich gemäß § 6 Abs. 2 VOB/B um die Dauer der Behinderung zzgl. Wiederanlaufzeit.<br>
            • Etwaige Vertragsstrafenregelungen (§ 11 VOB/B) sind für diesen Zeitraum gehemmt.<br>
            • Schadensersatzansprüche nach § 6 Abs. 6 VOB/B sowie Entschädigungsansprüche nach § 642 BGB für Stillstandskosten und Vorhaltung behalten wir uns ausdrücklich vor.
        </div>
    
        <p>Wir fordern Sie höflich auf, für unverzügliche Beseitigung der Behinderungsursachen Sorge zu tragen und uns die Wiederherstellung der Baufreiheit schriftlich mitzuteilen.</p>
    
        <div class="sign-area">
            <div class="sign-line">Ort, Datum</div>
            <div class="sign-line">Rechtsverbindliche Unterschrift (${cName})</div>
        </div>
    </body>
    </html>`;
      return {
        type: 'BEHINDERUNGSANZEIGE',
        legalBasis: '§ 6 Abs. 1 VOB/B',
        date: formattedDate,
        startDate: formattedStart,
        expectedDurationDays,
        text,
        html
      };
    }
    
    /**
     * 2. Bedenkenanmeldung nach § 4 Abs. 3 VOB/B
     * Zur Enthaftung des Auftragnehmers von der Mängelhaftung (§ 13 Abs. 3 VOB/B).
     */

    exports.generateBehinderungsanzeige = generateBehinderungsanzeige;

})(typeof module !== 'undefined' && module.exports ? (module.exports = {}) : (window.VobBehinderung = {}));
