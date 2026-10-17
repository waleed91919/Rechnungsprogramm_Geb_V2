# J0 — data_integrity 2-Fixes (P0-Blocker, zuerst mergen)

> Copy-Paste-Prompt für Jules. Snapshot: Repo `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`, Base-Branch `bau-p0p1-base@194cd83` (lokal aus `main@194cd83` erstellt, Stand 2026-10-08). Arbeite NUR auf diesem Base-Stand. Keine prod-DB (`database.sqlite` nie anfassen), nur `:memory:` / `mkdtemp` / `RECHNUNGSPROGRAMM_DB_PATH`-Tmp.

**Titel:** J0 data_integrity-2-Fixes: sec48b-Crash + Soft-Delete-Filter
**Branch-Name:** `jules/j0-data-integrity`
**Base:** `bau-p0p1-base@194cd83`
**Ziel:** `tests/data_integrity.test.js` vollständig grün (38/38), ohne andere Module zu ändern. Blockt J1–J4, J6.

## Scope-Dateien (darf anfassen)
- `db.js` — `getEingangsrechnungen()` (sec48b-Join, Bug-A-Crash) + `saveEingangsrechnung()` (15-%-Einbehalt, Bug B `sec48b_geprueft`) + `getFullState()` (Soft-Delete-Filter)
- `tests/data_integrity.test.js:441-454` (Bug B f1: Sub ohne Freistellung → 1785) + `tests/data_integrity.test.js:576-591` (P0-9 Soft-Delete j-Test) — nur lesen als Spezifikation, minimal reparieren falls Test selbst fehlerhaft dokumentiert ist (bevorzugt Produktfix, kein Test-Weichspülen)
- `schema.js` — nur falls `sec48b_*`-/`is_deleted`-Spalten/Constraints fehlen (kleinstmögliche Migration, deterministisch)

Belege aus S2_MODULGAP: `models/InvoiceModel.js:56-66`, `db/repositories/banking/reconciliation_repo.js:51`, Top-15-Punkt „data_integrity-Fails schließen" (S3_ROADMAP §1.1).

## Out-of-scope (verboten)
- Kein UI (`main.js`, `preload.js`, `js/navigation.js`, `js/dashboard/*`), keine E-Rechnung (`js/einvoice/*`), keine Schluss-/Bezahlt-Logik (J1/J2), kein GAEB/Aufmaß/Mahnung, keine neuen Tabellen, keine `database.sqlite`, keine Dependency-Änderungen, keine Versionserhöhung.

## Schritte (nummeriert)
1. `git checkout bau-p0p1-base && git checkout -b jules/j0-data-integrity`. Verifiziere `git rev-parse HEAD` = `194cd83`-Basis.
2. Reproduziere: `node --test tests/data_integrity.test.js` (fällt automatisch auf `ELECTRON_RUN_AS_NODE=1`-Re-Exec zurück, siehe Testkopf Zeile 44-61). Notiere die 2 Fails (sec48b-Crash + Soft-Delete).
3. Fix A — sec48b-Crash: `getEingangsrechnungen()` muss auf frischer DB ohne Fehler laufen und `sec48b_valid_until` aus dem Lieferanten-Join liefern (Test Zeile 424-437). Ursache ist fehlender/fehlerhafter LEFT JOIN bzw. fehlende Spalte — repariere Join + Null-Fallback, kein `SELECT *`-Hoffen.
4. Fix B — 15-%-Einbehalt: `saveEingangsrechnung()` für `lieferant_id=2` (Sub, kein Freistellungsnachweis) muss `bauabzugsteuer=1785` (15 % von 11900 brutto) schreiben und `sec48b_geprueft=1`, `bauabzugsteuer_einbehalten=1785` persistieren (Zeile 441-455). `lieferant_id=3` (kein Sub) → 0, `lieferant_id=4` (VALID bis 2099) → 0. Nur diese Funktion ändern.
5. Fix C — Soft-Delete: `getFullState()` muss `artikel WHERE is_deleted=1` und `kunden WHERE is_deleted=1` ausschließen (Zeile 575-591), aktive weiterhin liefern. Filter in SQL (`WHERE COALESCE(is_deleted,0)=0`), nicht in JS nachfiltern.
6. Re-Run exakt: `node --test tests/data_integrity.test.js`. Ziel 38/38 + Marker `DATA_INTEGRITY_DB_TESTS_PASSED` in stdout.
7. Regression klein: `node --test tests/bau_erp.test.js tests/controlling_soll_ist.test.js`. Keine neuen Failures.
8. TEST-BAU-01-Smoke (read-only, Tmp-DB): Eingangsrechnung 10000 netto / 19 % an Sub ohne Freistellung → Einbehalt 1785 prüfen (stützt N1/L1-USt-Logik, kein Buchen in prod-DB).

## Exakte Testbefehle
```
node --test tests/data_integrity.test.js
node --test tests/bau_erp.test.js tests/controlling_soll_ist.test.js
```

## TEST-BAU-01-Akzeptanz
- Angebot 2500/475/2975, N1 300/57/357, L1/F1 1300/247/1547, L2 2800/532/3332, F2 1500/285/1785, Teilzahlung 1500 → Rest 47, Schluss 0 — durch J0 nicht verändert, aber USt-/Einbehalt-Rechenweg (1785-Fall) belegt die 15-%-Logik für Sub-Nachweise.
- Pflicht: `data_integrity` 38/38 via `ELECTRON_RUN_AS_NODE`, keine prod-DB berührt (`RECHNUNGSPROGRAMM_DB_PATH` zeigt auf Tmp).

## Quellen (alle Zugriff 2026-10-08)
| # | URL | Aussage |
|---|---|---|
| 1 | https://www.bauprofessor.de/abschlagszahlung-vob | §16 VOB/B: prüfbare Aufstellung, 21-Tage-Fälligkeit — Maßstab Einbehalt-Nachweis |
| 2 | https://www.bauprofessor.de/kumulative-abschlagsrechnungen/ | kumulativ F_t = L_t − ΣF_i, Abzug vereinnahmter Zahlungen bis Schluss |
| 3 | https://www.bauprofessor.de/schlussrechnung/ | Schluss = Gesamtleistung minus Vorgänger, USt auf Gesamtleistung |
| 4 | https://github.com/itplr-kosit/validator-configuration-xrechnung | KoSIT-XRechnung-Schematron-Referenz (Vorgängerbeleg E-Nachweis) |
| 5 | https://zugferd.randomstar.org/de/docs/mustang/ | Mustang/VeraPDF-3-Schichten-Referenz (Container/Schema/Geschäftsregeln) |

## PR-Anforderung
- Kleiner Diff (nur `db.js` + ggf. `schema.js`), Test-Output (`38 passed`) in PR-Beschreibung, offene Punkte auflisten (z. B. weitere sec48b-Randfälle), kein Merge ohne J0-Rebase-Basis. Ein PR pro Branch.

## Summary (max. 15 Zeilen)
- Fix A: sec48b-Join ohne Crash, `sec48b_valid_until` im Join.
- Fix B: 15 % auf brutto (1785) nur ohne Freistellung, Flag gesetzt.
- Fix C: Soft-Delete in SQL gefiltert.
- Tests: 38/38 via ELECTRON_RUN_AS_NODE + 2 Regressionsdateien.
- Kein UI-/Schema-Ausbau, prod-DB unberührt.
- Danach J0 zuerst mergen, dann Welle-1-Rest rebasen.
