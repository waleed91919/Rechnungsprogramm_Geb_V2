# TEST-BAU-01 Demo-Proof Protokoll

## Logs
[INFO] Start TEST-BAU-01 Demo-Proof
[INFO] Temp DB: /tmp/test-bau-01-1791541950939-206403.sqlite
[PASS] Setup Database initialized
[INFO] Step 2: Data Creation (Angebot, AB)
[PASS] Angebot V2 erstellt (ID: 1, Netto 2500 / Brutto 2975)
[PASS] Auftragsbestätigung (AB) erstellt (ID: 2)
[INFO] Step 3: Aufmaß and Abschlagsrechnungen
[PASS] L1 (Abschlag 1) erstellt (ID: 3, Netto 1300 / Brutto 1547)
[PASS] Nachtrag N1 erstellt und genehmigt (ID: 4, Netto 300)
[PASS] L2 (Abschlag 2) erstellt (ID: 5, Netto 2800)
[INFO] Step 4: Schlussrechnung and Negative Test
[PASS] Schlussrechnung erstellt (ID: 6, Netto 0)
[PASS] Negativ-Probe (2. Schlussrechnung) erfolgreich abgewiesen: Für dieses Projekt existiert bereits die Schlussrechnung SR-2026. Es ist genau eine Schlussrechnung pro Projekt zulässig.
[INFO] Step 5: Teilzahlung, Mahnung, DATEV Export
[PASS] Teilzahlung auf L1 angewendet. Brutto: 1547, Bezahlt: 1500, Offen: 47, Status: Teilweise bezahlt
[PASS] Mahnung-Stufe auf L1 gesetzt (mahnungLevel = 1)
[PASS] DATEV Export erfolgreich (String beginnt mit EXTF, Länge: 527)

## Status
PASS
