# W2 — README: Rebase-Pflicht, Konflikt-Regeln, Ticket-Übersicht

> Steuerdatei für Welle 2 (Jules). Read-only im Produktcode: KEINE Produktänderung, KEINE Commits, KEINE prod-DB. Jules schreibt nur Produktcode gemäß Einzeltickets; diese `w2/`-Dateien sind reine Prompts.

## Base & Rebase-Pflicht (alle Tickets)
- Base: `bau-p0p1-base@194cd83` + J0 gemergt + rebased, Datum 2026-10-08.
- Pflicht VOR Arbeitsbeginn in JEDEM Ticket:
  ```powershell
  git fetch origin
  git rebase origin/bau-p0p1-base
  ```
- Wer nach Rebase Konflikte sieht, bricht NICHT ab, sondern folgt der Konflikt-Regel unten + meldet im PR-Body (konfliktierende Datei + gewählte Seite + Begründung).
- TEST-BAU-01 Fixture (alle Tickets als Referenz, NICHT ändern): Angebot 2500/475/2975, N1 300/57/357, L1/F1 1300/247/1547, L2 2800/532/3332, F2 1500/285/1785, Teilzahlung 1500 → Rest 47, Schluss 0.

## Ticket-Übersicht
| Ticket | Datei | Branch | Fokus |
|---|---|---|---|
| J1 | `J1-schluss-sperre.md` | `jules/j1-schluss-sperre` | Doppel-Schluss-UNIQUE + Voll-Verrechnung |
| J2 | `J2-bezahlt-link.md` | `jules/j2-bezahlt-link` | markAsPaid ↔ Matching + Restprüfung |
| J9 | `J9-gaeb-generator.md` | `jules/j9-gaeb-generator` | X83→Draft→Positionen-Button |
| J10 | `J10-aufmass.md` | `jules/j10-aufmass` | OZ-Warnung + Kumulationssicht |
| J11 | `J11-mahnung-fristen.md` | `jules/j11-mahnung-fristen` | Versandnachweis + VOB-Fristen |

## Konflikt-Regel (bindend)
1. `rechnung_verrechnungen` gehört NUR J1: `db/schema/documents_schema.js:61-69`, `db/schema/index.js:1474-1476` (UNIQUE), `db/repositories/document_repo.js:16,238,384,403,510`. J2/J9/J10/J11: dort NUR lesen, NIE ändern. Bei Rebase-Konflikt gewinnt J1-Seite; andere Tickets rebased danach neu.
2. `js/dashboard/dashboard-actions.js` entkoppeln: J2 besitzt Z.66-94 (`action==='paid'`), J11 besitzt Z.95-112 (`action==='dunning'`). Jeder fasst NUR seinen Block an. Gemeinsame Helper nur additiv + abwärtskompatibel; kein Refactor des fremden Blocks.
3. GAEB-Schema (`gaeb_*`) gehört J9, Aufmaß (`aufmass_*`, `aufmass_repo.js:167-232`) gehört J10, Mahn-Felder/SMTP (`settings-mahnung.js`, `email_versandhistorie`, `main/email.js`) gehören J11. Cross-Ticket-Änderungen daran sind verboten.
4. `js/projects/project-calculations.js:29-37` ist Lese-Referenz für J1/J10 — ändern nur mit Begründung im PR + Hinweis an andere Tickets.
5. Bei unauflösbarem Konflikt: PR als Draft + im Body Datei:Zeilen + beide Varianten dokumentieren, KEIN Force-Push auf fremde Branches.

## Globale PR-Anforderungen
- Ein PR pro Ticket, Titel `[Jx] …`, Body mit Base-SHA + TEST-BAU-01-Nachweis + Quellen (URL + 2026-10-08).
- `npm test` grün, Scope/Out-of-scope aus Ticket eingehalten, kein Push auf `main`.
