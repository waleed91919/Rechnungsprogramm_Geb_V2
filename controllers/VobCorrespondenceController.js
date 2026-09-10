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

class VobCorrespondenceController {
    /**
     * Formatiert einen Betrag in deutsches Währungsformat (z.B. "12.345,67 €").
     */
    static formatCurrency(amount) {
        return (parseFloat(amount) || 0).toLocaleString('de-DE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + ' €';
    }

    /**
     * Formatiert ein Datum in deutsches Standardformat (DD.MM.YYYY).
     */
    static formatDate(d) {
        if (!d) return '';
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
            const parts = d.substring(0, 10).split('-');
            return `${parts[2]}.${parts[1]}.${parts[0]}`;
        }
        const dateObj = d instanceof Date ? d : new Date(d);
        if (isNaN(dateObj.getTime())) return String(d);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        return `${day}.${month}.${year}`;
    }

    /**
     * Addiert Kalendertage zu einem Datum und gibt das ISO-Datum (YYYY-MM-DD) zurück.
     */
    static addCalendarDays(startDate, days) {
        const d = startDate ? new Date(startDate) : new Date();
        const res = new Date(d.getTime() + (parseInt(days, 10) || 0) * 86400000);
        return res.toISOString().split('T')[0];
    }

    /**
     * Addiert Werktage (Mo–Sa, ohne Sonn- und Feiertage) nach VOB/B.
     */
    static addWorkingDays(startDate, days) {
        const d = startDate ? new Date(startDate) : new Date();
        let current = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
        let needed = Math.max(1, parseInt(days, 10) || 1);
        let added = 0;

        const isFeiertag = (dateObj) => {
            const y = dateObj.getFullYear();
            const m = dateObj.getMonth();
            const day = dateObj.getDate();
            if (m === 0 && day === 1) return true; // Neujahr
            if (m === 4 && day === 1) return true; // 1. Mai
            if (m === 9 && day === 3) return true; // 3. Okt
            if (m === 11 && (day === 25 || day === 26)) return true; // Weihnachten
            const a = y % 19, b = Math.floor(y / 100), c = y % 100;
            const dG = Math.floor(b / 4), eG = b % 4, fG = Math.floor((b + 8) / 25);
            const gG = Math.floor((b - fG + 1) / 3), hG = (19 * a + b - dG - gG + 15) % 30;
            const iG = Math.floor(c / 4), kG = c % 4, lG = (32 + 2 * eG + 2 * iG - hG - kG) % 7;
            const mG = Math.floor((a + 11 * hG + 22 * lG) / 451);
            const ostersonntag = new Date(y, Math.floor((hG + lG - 7 * mG + 114) / 31) - 1, ((hG + lG - 7 * mG + 114) % 31) + 1, 12, 0, 0);
            const diffDays = Math.round((new Date(y, m, day, 12, 0, 0) - ostersonntag) / 86400000);
            return diffDays === -2 || diffDays === 1 || diffDays === 39 || diffDays === 50;
        };

        while (added < needed) {
            current.setDate(current.getDate() + 1);
            if (current.getDay() === 0) continue; // Sonntag
            if (isFeiertag(current)) continue;
            added++;
        }

        const yyyy = current.getFullYear();
        const mm = String(current.getMonth() + 1).padStart(2, '0');
        const dd = String(current.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    /**
     * 1. Behinderungsanzeige nach § 6 Abs. 1 VOB/B
     * Zur Fristverlängerung, Abwehr von Vertragsstrafen (§ 11 VOB/B) und Sicherung von Ansprüchen nach § 6 Abs. 6 VOB/B bzw. § 642 BGB.
     */
    static generateBehinderungsanzeige({
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
        const formattedDate = this.formatDate(date);
        const formattedStart = this.formatDate(startDate);
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
    static generateBedenkenanmeldung({
        contractor = {},
        client = {},
        project = {},
        date = new Date(),
        concernType = 'VORLEISTUNG', // 'VORLEISTUNG' | 'AUSFUEHRUNG' | 'STOFFE' | 'BAUGRUND'
        description = '',
        relevantStandards = '',
        risks = '',
        proposedSolution = '',
        decisionDeadlineDays = 5,
        additionalNotes = ''
    }) {
        const formattedDate = this.formatDate(date);
        const deadlineDate = this.addWorkingDays(date, decisionDeadlineDays);
        const formattedDeadline = this.formatDate(deadlineDate);
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
    static calculateBauhandwerkersicherung({
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
        const securityAmount = Math.round((netClaim * 1.10) * 100) / 100;
        const deadlineDate = this.addCalendarDays(requestDate, deadlineDays);

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
    static generateBauhandwerkersicherungSchreiben({
        contractor = {},
        client = {},
        project = {},
        date = new Date(),
        calculation = {},
        customBankDetails = ''
    }) {
        const formattedDate = this.formatDate(date);
        const formattedDeadline = this.formatDate(calculation.deadlineDate || this.addCalendarDays(date, 10));
        const cName = contractor.name || contractor.firmenname || 'Auftragnehmer';
        const clName = client.name || client.firmenname || client.kunden_name || 'Auftraggeber';
        const pName = project.name || 'Bauvorhaben';
        const pNr = project.nummer || project.nr || '';

        const calc = calculation.securityAmount !== undefined
            ? calculation
            : this.calculateBauhandwerkersicherung({
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
- Ursprüngliche Vertragssumme: ${this.formatCurrency(calc.contractSum)}
- Beauftragte Nachträge: ${this.formatCurrency(calc.approvedNachtraege)}
- Bisher geleistete Zahlungen: -${this.formatCurrency(calc.paymentsReceived)}
= Offene Vergütung (Restwerklohn): ${this.formatCurrency(calc.netClaim)}
+ Gesetzlicher Zuschlag von 10 % für Nebenforderungen (§ 650f Abs. 1 Satz 2 BGB):
= ZU LEISTENDE SICHERHEITSSUMME: ${this.formatCurrency(calc.securityAmount)}

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
        <tr><td>Vereinbarte Auftragssumme (netto/brutto):</td><td style="text-align:right; font-family:monospace;">${this.formatCurrency(calc.contractSum)}</td></tr>
        <tr><td>Beauftragte Nachträge:</td><td style="text-align:right; font-family:monospace;">+ ${this.formatCurrency(calc.approvedNachtraege)}</td></tr>
        <tr><td>Geleistete Zahlungen:</td><td style="text-align:right; font-family:monospace;">- ${this.formatCurrency(calc.paymentsReceived)}</td></tr>
        <tr style="font-weight:600;"><td>Verbleibende offene Vergütung:</td><td style="text-align:right; font-family:monospace;">= ${this.formatCurrency(calc.netClaim)}</td></tr>
        <tr><td>Gesetzlicher Zuschlag 10 % (§ 650f Abs. 1 Satz 2 BGB):</td><td style="text-align:right; font-family:monospace;">+ 10,00 %</td></tr>
        <tr class="highlight"><td>Anzufordernder Bürgschaftsbetrag:</td><td style="text-align:right; font-family:monospace;">${this.formatCurrency(calc.securityAmount)}</td></tr>
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
     * 4. Förmliche Abnahmeaufforderung nach § 12 Abs. 1 & Abs. 5 VOB/B
     * Mit 12-Werktage-Frist zur Durchführung und Hinweis auf Abnahmefiktion nach 6 Werktagen Benutzung bzw. § 640 BGB.
     */
    static generateAbnahmeaufforderung({
        contractor = {},
        client = {},
        project = {},
        date = new Date(),
        completionDate = new Date(),
        proposedDates = [],
        additionalNotes = ''
    }) {
        const formattedDate = this.formatDate(date);
        const formattedCompletion = this.formatDate(completionDate);
        const deadlineDate = this.addWorkingDays(date, 12);
        const formattedDeadline = this.formatDate(deadlineDate);

        const cName = contractor.name || contractor.firmenname || 'Auftragnehmer';
        const clName = client.name || client.firmenname || client.kunden_name || 'Auftraggeber';
        const pName = project.name || 'Bauvorhaben';
        const pNr = project.nummer || project.nr || '';

        const datesText = proposedDates.length > 0
            ? proposedDates.map((pd, i) => `  Vorschlag ${i + 1}: ${pd}`).join('\n')
            : `  Innerhalb der 12-Werktage-Frist bis zum ${formattedDeadline} nach vorheriger Terminabstimmung.`;

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
1. Fiktive Abnahme nach Inbenutzungnahme (§ 12 Abs. 5 Nr. 1 VOB/B):
Wird keine Abnahme verlangt und hat der Auftraggeber die Leistung oder einen Teil der Leistung in Benutzung genommen, so gilt die Abnahme nach Ablauf von 6 Werktagen nach Beginn der Benutzung als erfolgt.
2. Fiktive Abnahme nach BGB (§ 640 Abs. 2 BGB):
Verweigert der Besteller die Abnahme nicht innerhalb der gesetzten Frist unter Angabe mindestens eines Mangels, gilt das Werk ebenfalls kraft Gesetzes als abgenommen.
3. Wirkungen der Abnahme:
Mit der Abnahme geht die Gefahr des zufälligen Untergangs auf Sie über (§ 644 BGB, § 12 Abs. 6 VOB/B), die Beweislast für Mängel kehrt sich um, die Fälligkeit der Schlussrechnung tritt ein (§ 16 Abs. 3 VOB/B) und die Frist für Mängelansprüche (§ 13 Abs. 4 VOB/B) beginnt zu laufen. Zudem ist eine einbehaltene Vertragserfüllungsbürgschaft unverzüglich freizugeben.

Bitte bestätigen Sie uns den Abnahmetermin kurzfristig schriftlich.

${additionalNotes ? `Hinweise:\n${additionalNotes}\n` : ''}
Mit freundlichen Grüßen

${cName}
(Rechtsverbindliche Unterschrift)`;

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

    <div class="warning-box">
        <strong>Rechtliche Wirkungen und Abnahmefiktion:</strong><br>
        • <strong>Inbenutzungnahme (§ 12 Abs. 5 Nr. 1 VOB/B):</strong> Nehmen Sie das Bauwerk in Benutzung, gilt die Leistung nach Ablauf von 6 Werktagen als abgenommen.<br>
        • <strong>BGB-Abnahmefiktion (§ 640 Abs. 2 BGB):</strong> Benennen Sie innerhalb der Frist keine wesentlichen Mängel, gilt die Abnahme kraft Gesetzes als erfolgt.<br>
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
            legalBasis: '§ 12 Abs. 1 & 5 VOB/B / § 640 BGB',
            date: formattedDate,
            completionDate: formattedCompletion,
            deadlineDate: formattedDeadline,
            text,
            html
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = VobCorrespondenceController;
}
if (typeof window !== 'undefined') {
    window.VobCorrespondenceController = VobCorrespondenceController;
}
