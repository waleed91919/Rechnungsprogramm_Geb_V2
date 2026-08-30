/**
 * main/maengel-pdf-builder.js - Generiert druckfertige HTML/PDF-Dokumente für Mängelrügen,
 * Nachfristsetzungen und Mängelprotokolle mit Fotodokumentation.
 */

const fs = require('fs');
const path = require('path');
const MaengelController = require('../controllers/MaengelController');

class MaengelPdfBuilder {
    /**
     * Erstellt das HTML für eine Mängelrüge (Stufe 1) oder Nachfristsetzung (Stufe 2).
     */
    static buildMahnschreibenHtml(mangel, partner, stufe = 1, optionen = {}, companyInfo = {}) {
        return MaengelController.generateMahnschreibenHtml(mangel, partner, stufe, optionen, companyInfo);
    }

    /**
     * Erstellt einen vollständigen Mängelbericht / Fotoprotokoll für Bauleiter und Bauherren.
     */
    static buildMangelProtokollHtml(mangel, fotos = [], historie = [], companyInfo = {}) {
        const datumStr = new Date().toLocaleDateString('de-DE');
        const fristStr = mangel.nachbesserungsfrist ? new Date(mangel.nachbesserungsfrist).toLocaleDateString('de-DE') : 'Keine Frist';
        const druckzuschlag = MaengelController.calculateDruckzuschlag(mangel.geschaetzte_beseitigungskosten_eur, mangel.druckzuschlag_faktor);

        let fotosHtml = '';
        if (fotos.length > 0) {
            fotosHtml = fotos.map((f, idx) => `
                <div style="border:1px solid #cbd5e1; border-radius:6px; padding:10px; background:#f8fafc; page-break-inside:avoid; margin-bottom:12px;">
                    <div style="font-weight:bold; font-size:9pt; margin-bottom:6px; color:#334155;">
                        Foto #${idx + 1} (${f.typ === 'VOR_NACHBESSERUNG' ? 'Vor Nachbesserung' : 'Nach Nachbesserung'}) - ${f.aufnahme_datum ? new Date(f.aufnahme_datum).toLocaleDateString('de-DE') : ''}
                    </div>
                    ${f.thumbnail_base64 ? `<img src="${f.thumbnail_base64}" style="max-width:100%; max-height:220px; border-radius:4px; object-fit:contain;" />` : `<div style="font-style:italic; font-size:8pt; color:#64748b;">Pfad: ${f.dateipfad}</div>`}
                    ${f.kommentar ? `<div style="font-size:8.5pt; color:#475569; margin-top:4px;">${f.kommentar}</div>` : ''}
                </div>
            `).join('');
        } else {
            fotosHtml = `<div style="font-style:italic; color:#64748b; font-size:9pt;">Keine Fotobeweise hinterlegt.</div>`;
        }

        let historieHtml = '';
        if (historie.length > 0) {
            historieHtml = `
                <table style="width:100%; border-collapse:collapse; font-size:8.5pt; margin-top:8px;">
                    <thead>
                        <tr style="background:#0f172a; color:#fff; text-align:left;">
                            <th style="padding:4px 6px;">Datum / Uhrzeit</th>
                            <th style="padding:4px 6px;">Von</th>
                            <th style="padding:4px 6px;">Statusänderung</th>
                            <th style="padding:4px 6px;">Kommentar</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historie.map(h => `
                            <tr style="border-bottom:1px solid #e2e8f0;">
                                <td style="padding:4px 6px;">${new Date(h.geaendert_am).toLocaleString('de-DE')}</td>
                                <td style="padding:4px 6px;">${h.geaendert_von || 'System'}</td>
                                <td style="padding:4px 6px; font-weight:600;">${h.alter_status ? `${h.alter_status} &rarr; ` : ''}${h.neuer_status}</td>
                                <td style="padding:4px 6px;">${h.kommentar || ''}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Mängelprotokoll - ${mangel.mangel_nr || 'Mangel'}</title>
<style>
    @page { size: A4 portrait; margin: 15mm 15mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #1e293b; line-height: 1.4; margin: 0; padding: 0; background: #fff; }
    .header-box { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
    .title { font-size: 14pt; font-weight: bold; color: #0f172a; margin: 0; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 9pt; }
    .meta-table td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
    .section-title { font-size: 11pt; font-weight: bold; color: #0f172a; border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; margin: 16px 0 8px 0; }
</style>
</head>
<body>
    <div class="header-box">
        <div>
            <h1 class="title">Mängelprotokoll & Baustellenbefund</h1>
            <div style="font-size:9pt; color:#64748b;">Projekt: ${mangel.projekt_name || 'Projekt'} | Nr: ${mangel.mangel_nr || 'M-001'}</div>
        </div>
        <div style="text-align:right; font-size:8.5pt; color:#475569;">
            Erstellt am: ${datumStr}<br>
            Erfasser: ${mangel.erfasst_von || 'Bauleiter'}
        </div>
    </div>

    <table class="meta-table">
        <tr>
            <td style="width:25%;"><strong>Mangel-Titel:</strong></td>
            <td><strong>${mangel.titel || 'Mangel'}</strong></td>
            <td style="width:20%;"><strong>Status:</strong></td>
            <td><span style="font-weight:bold; color:#0f172a;">${mangel.status}</span></td>
        </tr>
        <tr>
            <td><strong>Gewerk / Bauteil:</strong></td>
            <td>${mangel.gewerk || '-'} / ${mangel.bauteil || '-'}</td>
            <td><strong>Schweregrad:</strong></td>
            <td>${mangel.schweregrad || 'MITTEL'}</td>
        </tr>
        <tr>
            <td><strong>Verortung:</strong></td>
            <td>${mangel.ort_beschreibung || '-'}</td>
            <td><strong>Nachbesserungsfrist:</strong></td>
            <td><strong>${fristStr}</strong></td>
        </tr>
        <tr>
            <td><strong>Verursacher / Nachunternehmer:</strong></td>
            <td>${mangel.subunternehmer_name || mangel.verursacher_typ || 'Subunternehmer'}</td>
            <td><strong>Einbehalt gem. § 641 (3):</strong></td>
            <td>${druckzuschlag.einbehaltBetrag.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € (${Math.round(druckzuschlag.faktor * 100)}%)</td>
        </tr>
    </table>

    <div class="section-title">Mängelbeschreibung & Sachverhalt</div>
    <div style="background:#fff; border:1px solid #cbd5e1; border-radius:4px; padding:10px; margin-bottom:14px; font-size:9.5pt; white-space:pre-line;">
        ${mangel.beschreibung || 'Keine nähere Beschreibung angegeben.'}
    </div>

    <div class="section-title">Fotodokumentation</div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
        ${fotosHtml}
    </div>

    <div class="section-title">Verlauf & Historie</div>
    ${historieHtml}
</body>
</html>`;
    }
}

module.exports = MaengelPdfBuilder;
