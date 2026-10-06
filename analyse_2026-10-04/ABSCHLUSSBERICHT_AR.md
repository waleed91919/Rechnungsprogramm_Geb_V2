# تقرير W-Link النهائي — الوضع الفعلي الحالي (IST-Zustand mit Beweisen)

> **Snapshot والقواعد الملزمة — تم الالتزام بها بالكامل**
> - المسار: `C:\Users\walee\Desktop\server\Rechnungsprogramm_Geb_V2`
> - الفرع المطلوب: `main` — الـ SHA المطلوب: `d940bd6c321f56dd33a440ee9a24a3ab9550bd6b` — التاريخ: `2026-10-04`
> - ما تم رصده فعلياً عند البدء: `git branch --show-current` = `main`، `git rev-parse HEAD` = `d940bd6c...`، `git status` = نظيف ما عدا ملف غير متتبع واحد `plans/testen_das_app.txt`، لا تغييرات على `main`، لا Commits/Pushes.
> - **ملاحظة انحراف الـ Snapshot بين Subagents (موثقة بشفافية):** أثناء العمل المتوازي رصد Subagent A فرع `test-projekte-modularisierung` مع SHA `3c29a55`، ورصد Subagent E HEAD `359799e (Merge PR #25)`. السبب: فروع/دمج جديدة ظهرت أثناء التحليل. كل الاستنتاجات أدناه تمت إعادة مطابقتها على كود `main/d940bd6` (ملفات `main.js`, `preload.js`, `schema.js`, `db/schema/*`, `controllers/*`, `js/*`, `views/*`, `tests/*`)، وأي رقم جدول (`76 Tabellen`, `115 Indizes`, `12 Trigger`, `104 FKs`) مأخوذ فقط من تشغيل معزول على `:memory:`-DB وليس من تقارير قديمة.
> - النظام: `Windows 10 Pro 10.0.19045`، `Node v25.1.0` (npm محظور بـ ExecutionPolicy — تم استخدام `node` مباشرة)، `Electron ^32.3.3`، قاعدة البيانات `better-sqlite3 ^12.6.2`، يوجد كود مصدري + بناء مفكك `dist/win-unpacked` (لا يوجد إثبات تثبيت `W-Link-Setup.exe` في هذا الفحص).
> - القاعدة: **تحليل فقط، لا تعديل** على Produktcode / Datenbankschema / Abhängigkeiten. الاختبارات فقط على Testdatenbanken معزولة ومجلدات مؤقتة. لا بيانات عملاء حقيقية، لا إيميلات، لا Bankzugänge. لم تُمس `database.sqlite` الإنتاجية. ملفات `README` والخطط والتقارير السابقة اعتُبرت **تلميحات فقط** وتم التحقق من كل ادعاء في الكود القابل للتنفيذ.
>
> **إثبات استخدام Subagents حقيقية (متوازية):** تم إطلاق 6 مهام متوازية عبر `Task`-Subagents من النوع `general` (للالتزام بـ read-only ومنع أي تنفيذ تلقائي):
> - A `ses_ef9bc4d75ffeZE1IiSeyzYUxE4` — Funktionen & UI
> - B `ses_ef9bc4d36ffeKbLMhxNvuDhHAO` — Dokumentenfluss & Bauabrechnung
> - C `ses_ef9bc4ceeffeVfX9gZ1lYaQH5F` — Datenmodell & Controlling
> - D `ses_ef9bc4ca9ffe65nyM6Nb5i6f3v` — Einzelplatz/Mehrbenutzer/Sicherheit
> - E `ses_ef9bc4c6fffeMqiheZgVSfzQcf` — Tests/Laufzeit
> - F `ses_ef9bc4c22ffe6clnztvXojSTaO` — Export/Compliance
> التناقضات بينها حُسمت بالكود (وليس بالأغلبية).

**مقياس الحالة الموحد (Status):** `A` = نُفّذ فعلياً وثُبّت في هذا الفحص فقط للحالات المفحوصة | `B` = تنفيذ موجود لكن التشغيل غير مكتمل | `C` = جزئي/رابط ناقص | `D` = Platzhalter/محاكاة/مخطط فقط | `E` = غير موجود/غير واضح. لم يُمنح `A` لأي تحليل ساكن — فقط لتشغيلات Subagent E المعزولة.

---

## A. ما هو W-Link اليوم فعلياً؟ (Was ist W-Link heute tatsächlich؟)

W-Link اليوم هو **تطبيق Electron لسطح مكتب واحد (Einzelplatz-Desktop-App)** مع قاعدة `SQLite` محلية (`userData/database.sqlite`، `WAL`، `foreign_keys=ON` — `db.js:31-34`)، يغطي جوهر **Kunden → Angebot (مع Freeze/Versand/Versionierung/Annahme) → Projekt (= Auftrag، لا يوجد مستند Auftrag مستقل) → Aufmaß (بنظامين متوازيين) → Abschlagsrechnung (kumulativ) → Schlussrechnung → Zahlung/Mahnung → DATEV/Steuerbericht → Backup**.

نقاط القوة المثبتة بالكود:
- دورة العرض محكمة: `freezeAngebot` مع `freeze_snapshot_json` وحماية من الرجوع (`controllers/AngebotController.js:199-263` + `db/repositories/document_repo.js:90-204`)، نسخ `V1→V2` مع `parent_angebot_id` (`:274-345`)، قبول `ANGENOMMEN` (`:355-368`)، إنشاء مشروع مع `source_angebot_*` ومنع التكرار (`createProjektFromAngebot:380-459` + `controlling_bautagebuch_repo.js:401-433`).
- الفوترة التراكمية والحجوزات حقيقية: `CumulativeBillingController.calculateCumulativeInvoice:19-106` (`F_t = L_t − ΣF_i`)، `InvoiceController.calcRetention:135-176`، جدول `rechnung_verrechnungen` مع حارس منع التكرار (`document_repo.js:381-411`)، جداول `invoice_cumulative_states` + `security_retentions` (`documents_schema.js:71-102`)، فصل الدفعات عبر `zahlung_zuordnungen` (`banking_schema.js:46-59`).
- GAEB من المصدر إلى التسعير مفصول بشكل نموذجي: `gaeb_imports (raw_bytes/raw_xml/file_hash)` + `gaeb_tender_drafts (UNIQUE(import_id,version))` + `gaeb_tender_item_prices` + Triggers تمنع ربط غير `angebot` (`gaeb_schema.js:9-204,275-361` + `gaeb_repository.js:51-382` + `gaeb_tender_repo.js:114-326`).
- E-Rechnung وDATEV وGAEB مولّدة فعلياً (ملفات)، لكن **تقنية فقط وليست حكماً قانونياً**: `XRechnung 3.0` (`js/einvoice.js:6`)، `ZUGFeRD 2.5.2 / Factur-X 1.09.2` عبر fork `@cantoo/pdf-lib` (`main/zugferd-builder.js:76-124` + `node_modules/@cantoo/pdf-lib/.../pdfa/*`)، `DATEV EXTF 700 v13` (`js/datev.js:2-65`)، `GAEB X83/X84 3.2/3.3` عبر `libxmljs2` + XSDs محلية (`tests/schemas/`)، `DA11 REB 23.003` كنص 80-خانة (`js/da11.js:92-180`).
- الأمان والنسخ الاحتياطي للجهاز الواحد صلب: `contextIsolation+sandbox` (`main.js:15-32`)، `audit_logs` مع سلسلة Hash ومشغّلات منع التعديل (`main/audit.js:98-183` + `db/schema/index.js:1547-1586`)، `BackupService` ذري مع `SHA-256 + verify + PRE_RESTORE` (`main/backup.js:46-406`) ومثبت باختبار معزول (`tests/backup.test.js` — 3/3 ناجحة).

حدوده الحاسمة (ليست عيوباً صغيرة):
1. **لا يوجد Mehrbenutzerbetrieb ولا Rollen.** لا جدول `benutzer/users`، لا `login`، لا صلاحيات، `audit_logs` بلا عمود `user/device` (`core_schema.js:6-15`)، `wrapHandler` بلا فحص دور (`main/ipc/ipc-util.js:3-10`)، وقناة `preload.js:233 invoke(channel,...)` العامة تُفرغ فكرة الـ Whitelist. وثيقة البنية نفسها تقول SQLite محلية لا تصلح لتزامن مكتبي (`Architektur/architektur_analyse.md:32`).
2. **PWA-Sync = التقاط ميداني لمكتب واحد، ليس نظاماً متعدد المستخدمين.** التزامن يغطي `ZEITERFASSUNG/BAUTAGEBUCH/VOB/AUFMASS_ZEILE/Mängel/Fotos` مع Pairing وIdempotenz وحجر النزاعات (`main/sync-server.js:602-757` + `pwa/js/sync-worker.js`)، لكن لا مزامنة مثبتة لـ `dokumente/kunden/artikel/projekte` النقدية.
3. **فجوات تدفق البناء:** `Auftragsbestätigung` مجرد خيار في قائمة منسدلة تُحفظ كـ `rechnung|angebot` (`project-document-flow.js:132-133` — لا رقم/حفظ/PDF مستقل)؛ `Kunden-Lieferschein` غير موجود (فقط `lieferscheine_digital` للمورّدين — `construction_schema.js:207-220`)؛ الانتقال `GAEB-Entwurf → Angebot` مجرد رابط (`linkImportToAngebot:628-662`) بلا مولّد مراكز؛ `Nachtrag GENEHMIGT → projekt_positionen` غير موجود (يبقى في جدول جانبي)؛ نظاما `Aufmaß` (قديم `position_id TEXT` بلا FK مقابل جديد `aufmass_blaetter/zeilen` بمطابقة `oz_code` نصية) غير موحّدين.
4. **أزرار مضللة/معطلة:** قائمة `Neue Rechnung` لا تفعل شيئاً (`main.js:68 click:()=>{}`)؛ زر فك القفل مرفوض دائماً من الـ Preload (`preload.js:18`) رغم وجود معالج حقيقي (`ipc-core.js:74`)؛ `Als bezahlt markieren` يغيّر الحالة فقط دون قيد دفع/بنك (`editor-save.js:380-400` + `dashboard.js:695`)؛ رسائل `Bulk-Mahnung versendet` بلا استدعاء `smtp:sendBeleg` مثبت؛ `Artikel` مخفي كـ `experimentell` رغم أنه جوهر العرض (`navigation.js:179`).

الخلاصة لجمهورنا (شركات بناء ألمانية متوسطة، **ليس** Großunternehmen؛ الدخول عبر موظف مكتب واحد؛ Reinigung/FM ليست هدف توسع حالياً): **صالح كـ Einzelplatz للعروض والفوترة الإنشائية مع حذر، صالح جزئياً كمكتب+التقاط ميداني، غير صالح كنظام متعدد المستخدمين/الأدوار لشركة متوسطة.**

---

## B. مصفوفة الوظائف الكاملة (Funktionsmatrix)

> الأعمدة المطلوبة: الوحدة | التنفيذ الموجود | UI erreichbar | Persistenz | الارتباط | Tests | فحص فعلي | الفجوة | الأهمية للجمهور | الدليل | Status

| Modul / Funktion | Vorhandene Implementierung | UI erreichbar | Persistenz | Verbindung | Tests | Tatsächlich ausgeführte Prüfung (E) | Offene Lücke | Relevanz Zielgruppe | Beleg Datei:Symbol:Zeilen | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Kunden CRUD + CSV + Quick-Paste | `saveKunde/deleteKunde/bulkSaveKunden`, B2G-Leitweg-Pflicht | ja (`openKundeModal`, `code.html:745`) | ja | `dokumente.kundeId` | — | Code-Analyse فقط | لا | hoch (Stammdaten) | `js/kunden.js:106-405`, `preload.js:10-12` | B |
| Artikel CRUD + CSV + DATANORM | `saveArtikel/deleteArtikel`, `DatanormView.startImport` streaming | **nein (experimentell hidden)** | ja | `positionen.artikelId` | `artikel_ui` (jsdom) | Code-Analyse | Artikel versteckt = Einstiegshürde | hoch | `js/artikel.js:112-468`, `views/DatanormView.js:138-226`, `js/navigation.js:179` | C |
| Angebot Entwurf→VERSENDET (Freeze) | `freezeAngebot` + Snapshot + `validateAngebot` | ja | ja | `dokumente`+`positionen` | `angebot_lifecycle`, `angebot_ui_workflow` | Code-Analyse | — | hoch | `AngebotController.js:199-263,476-562`, `editor-save.js:188-293` | B |
| Angebot Version V1→V2 / Annahme | `createVersion`, `acceptAngebot` | ja | ja | `parent_angebot_id` | `angebot_lifecycle` | Code-Analyse | — | hoch | `AngebotController.js:274-368`, `editor-save.js:573-640` | B |
| Angebot→Projekt (=Auftrag) | `createProjektFromAngebot` mit `source_angebot_*` + Dedup | ja (nur via Code/Modal) | ja | `projekte.source_angebot_id→dokumente` FK | `project_calculations` | Code-Analyse | kein eigenes Auftrag-Dokument | hoch | `AngebotController.js:380-459`, `projects_schema.js:6-57` | B/C |
| Angebot→Rechnung (convert) | يفتح modal وينسخ فقط، لا يحفظ | ja | nein | — | `save_rechnung_flow` | Code-Analyse | خطوة يدوية | hoch | `editor-save.js:404-431` | B |
| Rechnung speichern/validieren/löschen | `saveDocument` + `validateSaveDocument` (Nr-Pflicht, Duplikat) | ja | ja | `dokumente/positionen` | `invoice_controller/model`, `save_rechnung_flow` | Code-Analyse | — | hoch | `editor-save.js:1-173`, `InvoiceController.js:321` | B |
| Storno (GoBD) `STORNO-nr` | `createStornoData` + atomare Transaktion | ja | ja | `storno_zu_nr`, Original locked | `data_integrity`, `gobd_protection` | Code-Analyse | لا Gutschrift ohne Storno | hoch | `InvoiceController.js:627-669`, `document_repo.js:569-602` | B |
| Entsperren (unlockDocument) | Preload-Stub يرفض دائماً، handler حقيقي ميت | ja (زر مضلل) | nein | — | — | Code-Analyse | زر يعطي خطأ دائماً | mittel | `preload.js:18` vs `ipc-core.js:74-79` vs `dashboard.js:380-389` | C |
| Als bezahlt (einzeln/bulk) | `updateDocumentStatus Bezahlt` فقط | ja | ja (Status فقط) | **لا** Bankbuchung | — | Code-Analyse | بلا Zahlungsbeleg | hoch | `editor-save.js:380-400`, `dashboard.js:665-703` | C |
| Mahnung (einzeln/bulk) | Level/Datum/Gebühr + Druckvorschau، bulk-Toast بلا SMTP مثبت | ja | ja (Level) | `saveDocument` | — | Code-Analyse | لا Versandnachweis، تتطلب `isLocked` غير موثق | hoch | `einstellungen.js:1449-1642`, `dashboard.js:716-725` | C |
| E-Mail-Versand + Historie | `smtp:sendBeleg` حقيقي + Konten CRUD + Test + Wiederholen | ja (modal) | ja (`email_versandhistorie`) | `einstellungen.smtp_konten` | `smtp_email` (Mock-Transport!) | E: 5/5 pass (Mock) | SMTP-Realversand unbewiesen | mittel | `editor-export.js:255-532`, `main/email.js:21-606` | B |
| ZUGFeRD-Export | `embedFacturX` + Fallback-Platzhalter | ja | ja (Datei) | `einvoice.buildCII` | `zugferd` Z1-Z19 | E: 32/32 pure pass | Sichtseite-Platzhalter، PDF/A-3 nur Container+B | hoch (E-Pflicht) | `editor-export.js:1-56`, `ipc-system.js:267-329`, `zugferd-builder.js:76-168` | C |
| XRechnung-XML | `generateXRechnungXML/buildCII`، B2G بدون `buyerRef` يرمي | ja | ja (Datei) | `computeTotals` | `zugferd` Z5-Z7 | E: مذكور أعلاه | يتطلب Leitweg-Stammdaten | hoch | `einvoice.js:456-529,715-764` | B |
| DATEV EXTF 700 | 31-Felder-Header، Blob-Download، لا Versand | ja (`exportDATEV`) | nein (Download) | `datev.js` Filter Entwürfe | `datev_export` T-DAT-1..7 | E: 58/58 (مع SEPA/GAEB/DA11) | gemischt يحتاج `steuer_7/19`، `Festschreibung=0` | hoch (StB) | `js/datev.js:10-274` | B |
| Steuerbericht/UStVA-Ansicht | حساب + Druck/CSV من bezahlt+storniert | ja (Berichte) | nein | — | — | Code-Analyse | لا Elster-Versand | mittel | `js/berichte.js:1-130,369-614` | B |
| Banking Konten/Mandate/SEPA | CRUD + IBAN/Gläubiger-Validierung، `createSepaRun`, XML-Export | ja | ja | `bank_*`, `sepa_*` | `sepa_pain008`, `sepa_lauf_lifecycle`, `banking_parser` | E: 58/58 pass | — | mittel | `js/banking.js:569-1000`, `preload.js:110-128` | B |
| Bank-Import + OPOS-Matching | Import + Vorschläge + `applyPaymentMatching` + `unmatch` mit Grund | ja | ja | `zahlung_zuordnungen` | `opos_matching` | Code-Analyse | يتطلب سحب يدوي بعد `bezahlt`-Status | hoch (Forderungen) | `js/banking.js:220-422` | B |
| Aufmaß (2 Welten) + DA11/X31 | `saveAufmassBlatt/mergeSchlussaufmass`, Formel-Rechner | ja (Projekt-Tabs) | ja | `projekt_id` FK، لكن `position_id TEXT`/ `oz_code`-Match | `aufmass_*` (37+24 Falls) | Code-Analyse | Dualität، لا einheitliche Positions-FK | hoch | `project-aufmass.js:338-873`, `measurement_schema.js:6-57` | C |
| Aufmaß-Übergabe → Rechnung | `UPDATE_EXISTING`/`CREATE_NEW` + Reload-Check | ja (Modal) | ja | `aufmass_blatt_id/menge/quelle` | `uebergaben_persistenz*` | Code-Analyse | `AUFTRAG`-Wahl تُحفظ كـ rechnung (Bug) | hoch | `project-document-flow.js:28-160` | C |
| Kumulierte Abrechnung + Einbehalt | `F_t=L_t−ΣF_i`، `calcRetention`، `rechnung_verrechnungen`-Guard، Escrow-18-Tage | ja (Rechnungstyp) | ja | `kumulierte_leistung_netto`, `security_retentions` | `cumulative_retention_chain`, `retention_vob_rules` | Code-Analyse | لا Pflicht-Check „Schluss muss alle Abschläge verrechnen“ | hoch | `CumulativeBillingController.js:19-176`, `InvoiceController.js:24-176` | B |
| Nachtrag (VOB) | CRUD + Status ENTWURF→GENEHMIGT/ABGELEHNT | ja | ja | `nachtraege/project_id` | `nachtrag_vob` | Code-Analyse | — | hoch | `NachtragController.js:14-126`, `project-nachtrag.js:172-215` | B |
| Nachtrag→Rechnung (idempotent `N:id:POS:id`) | `extractApprovedPositionsForInvoice` + Lock-Check | ja | ja | `is_supplement/nachtrag_id` | `nachtrag_vob` | Code-Analyse | — | hoch | `NachtragController.js:100-126`, `project-document-flow.js:162-290` | B |
| Nachtrag→projekt_positionen | **غير موجود** | — | nein | — | — | Code-Analyse (negativ gesucht) | LV-Stamm لا يتحدث | hoch | `projects_schema.js:32-57` (لا FK) | D |
| GAEB X83-Import (gespeichert) | atomar + Hash-Dedup + Verknüpfungsschutz | ja (Tender-Modal) | ja (`gaeb_imports` BLOB+XML) | `gaeb_*` | `gaeb_x83_*`, `gaeb_validation` | E: ضمن 58 + Schema | — | hoch (Ausschreibung) | `gaeb_repository.js:51-382`, `gaeb_schema.js:9-132` | B |
| GAEB Bepreisungsentwurf/Versionen | `saveTenderDraft` transaktional، `UNIQUE(import,version)`، Klon ohne `angebot_id` | ja | ja | `gaeb_tender_drafts/prices/bireq` | `gaeb_tender_pricing` (27) | Code-Analyse | — | hoch | `gaeb_tender_repo.js:114-542` | B |
| GAEB X84-Export/Validierung | Mapper+Validator+Serializer + IPC-Dialog | ja | ja (Datei `.x84`) | `3.2/3.3` NS | `gaeb_x84_export` (lxml) | Code-Analyse (nicht selbst validiert) | — | hoch | `gaeb_x84_mapper.js:342-439`, `ipc-gaeb.js:169-232` | B |
| GAEB-Entwurf→Angebot | فقط `linkImportToAngebot` مرجعي | nein | nein | `gaeb_import_angebote` Link | — | Code-Analyse (negativ) | لا `createAngebotFromDraft` | hoch | `gaeb_repository.js:628-662` | D |
| X31/DA11 | X31-Roundtrip، DA11-80-Zeichen/Transliteration | ja (Projekt-Buttons) | ja (Datei) | — | `gaeb-x31`, `da11_export` | E: 58/58 pass | X31 ohne XSD + NS-Abweichung؛ DA11 ohne offizielles XSD | mittel | `gaeb-x31.js:16-212`, `da11.js:21-208` | B/C |
| EFB 221/223 + Zuschlagskalkulation | Profil-Save + PDF، Stamm-/Projektprofile | **nein (kein Nav, nur Projekt-Kontext)** | ja | `efb_profile` | `efb`, `efb222_calculation` | E: 32/32 (EFB-Anteil) | Erreichbarkeit E | mittel | `EFBView.js:32-620`, `KalkulationView.js:340-347` | C |
| Bautagebuch/Abnahme/VOB-Schreiben | CRUD + Signatur-Canvas + reine Text/PDF-Generatoren | ja (Tabs) | ja | `bautagebuch` | `bautagebuch_controller`, `vob_correspondence` | Code-Analyse | VOB ohne Versand | mittel | `project-bautagebuch.js:11-219`, `VobCorrespondenceController.js:12-588` | B |
| Controlling (Soll/Ist/Umsatz/OPOS) | `getControllingStats` + `calculateProjektUmsatz` (MAX/Schluss-Logik) | ja | nein (Abfrage) | `angebot+positionen`, `eingangsrechnungen`, `zeiterfassung` | `controlling_soll_ist`, `project_calculations` | E: 12/12 pure pass | `cost_type`-Mismatch، `projekt_positionen`-EKT ignoriert، keine Prognose | hoch | `controlling_bautagebuch_repo.js:278-363`, `project-calculations.js:2-47` | C |
| Zeiterfassung/Mitarbeiter/MiLoG | MA/Zeit/VOB CRUD + Monatsauswertung، 2-Jahre-Sperr-Trigger | **nein (experimentell)** | ja | `zeiterfassung.*_id` | `zeiterfassung_milog`, `phase3_*` | Code-Analyse | Desktop-Schnellerfassung per `alert` abgewiesen | mittel | `ZeiterfassungView.js:283-323`, `workforce_schema.js:23-54` | C |
| Objekte (Liegenschaft→Raum) + Historie | Baum-CRUD + CSV-Download | **nein (experimentell)** | ja | `liegenschaften/gebaeude/etagen/raeume` | `objekt_*` (3 Dateien) | Code-Analyse | kein Ausbauziel (trotzdem erfasst) | niedrig | `js/objekte.js:32-608` | B |
| Dauerrechnung (Pläne/Läufe/Storno) | Plan-CRUD + echte Erzeugung + AutoRun + Storno mit Begründung | **nein (experimentell)** | ja | `dauerrechnung_laeufe` | `dauerrechnung_*` (4) | Code-Analyse | versteckt trotz Kern-Nähe | mittel | `js/dauerrechnungen.js:181-778` | B |
| Putzplan/Reinigungs-LV | Bereich/Position CRUD + Übernahme in Abrechnungsplan | **nein (experimentell)** | ja | `lv_bereiche/positionen` | `reinigungslv_*` (3) | Code-Analyse | kein Ausbauziel | niedrig | `js/putzplan.js:100+` | B |
| Mängel (Fristen/Protokoll/Ersatzvornahme) | CRUD + PDF-Artefakte + Auftragserzeugung | **nein (experimentell)** | ja | `maengel*` | `phase2_*` (Teil) | Code-Analyse | — | mittel | `MaengelView.js:374-400` | B |
| Sync/PWA (Server/Pairing/Konflikte) | Start/Stop/Config، QR، `resolveConflict`، Foto-Hash | **nein (experimentell)** | ja | nur Baustellen-Entitäten | `sync_*` (4) + `phase3` | Code-Analyse (E läuft nicht ohne Netz) | kein `dokumente/kunden`-Sync، `alert`-Fallbacks | mittel (mobil) | `SyncView.js:40-222`, `sync-server.js:44-757` | C |
| Großhandel/IDS + SOKA + Nachunternehmer-Compliance | Shop-Start extern، Warenkorb→Dokument، Beitragsberechnung+Meldung | **nein (experimentell)** | ja | `ids_*`, `soka_*` | `phase4_*` | Code-Analyse | Konzern-Features für Einstieg überfrachtend | niedrig | `GrosshandelView.js:262-573`, `SokaBauView.js:39-544` | B |
| Einstellungen/Backup/GoBD-Audit | Key-Value-Persistenz، echte Backups+Verify+Restore، Hashkette | ja | ja | `einstellungen`, `backup_history`, `audit_logs` | `backup`, `gobd_protection`, `erechnung_belegfixierung` | E: backup 3/3 + schema 1/1 + legacy 1/1 pass | Repo-`backups/` leer، Offsite unbewiesen | hoch | `einstellungen.js:75-407`, `backup.js:46-406`, `audit.js:98-183` | B |
| Sicherheit (IPC/SQL/Secrets) | `sandbox/contextIsolation` gut، SQL parametrisiert، aber `invoke`-Bypass + Klartext-Secrets möglich | — | ja | — | `security_shell`, `sync_*_security` | Code-Analyse | `preload.invoke` generisch، `PLAINTEXT::`-Fallback، `passwort_enc` unklar | hoch | `main.js:15-61`, `preload.js:3-243`, `email.js:25-176` | C |

---

## C. مقارنة Baufaktura Basis (Vergleich — was bedeutet es؟ ماذا يقدم W-Link؟ نفس الوظيفة أم شبيه؟ ما الدليل الناقص؟)

| Funktion (Vergleich) | Was bedeutet sie dort؟ | Was bietet W-Link tatsächlich؟ | Dieselbe أم Ähnlich؟ | Welcher Nachweis fehlt؟ |
|---|---|---|---|---|
| Kunden- und Auftragsverwaltung | Stammdaten + Aufträge mit Status | Kunden-CRUD كامل + `Projekte` كبديل `Auftrag` (`BEAUFTRAGT`)، بلا مستند Auftrag مستقل | **Ähnlich (kein Auftrag-Dok)** | Auftrag mit Nummer/PDF — Status E (`AngebotController.js:380-459`) |
| Artikelverwaltung | Material-/Leistungsstamm | CRUD+CSV+DATANORM موجود لكن مخفي `experimentell` | **Dieselbe technisch، aber versteckt** | Sichtbarkeit + Lauf-Nachweis (`artikel.js`, `navigation.js:179`) |
| Ausschreibung | LV/Ausschreibung vergeben | GAEB X83-Import + Tender-Draft-Versionierung + X84-Export ممتازة، لكن بلا P94 وبلا AVA-Portal | **Teilweise dieselbe (GAEB-Kern ja)** | P94-Export (E)، X31-XSD (C)، Portal-Anbindung |
| Angebot | Angebot mit Version/Druck | Entwurf→Freeze→Version→Annahme→Projekt، Snapshot غير قابل للتعديل | **Dieselbe (sogar stärker)** | لا شيء حرج — B (`AngebotController.js`) |
| Lieferschein | Kunden-Lieferschein mit Nummer | فقط Lieferanten-Erfassung (`lieferscheine_digital`) + Foto/Hash | **Nicht dieselbe** | Kunden-Lieferschein E — fehlt komplett |
| Auftragsbestätigung | Eigenes Dok mit Nummer | خيار `AUFTRAG` يُحفظ كـ `rechnung/angebot` | **Nur ähnlich (Etikett)** | Echte AB — E (`project-document-flow.js:132-133`) |
| Rechnung | Rechnung mit Nummer/Steuer/Druck | CRUD + Validierung + GoBD-Sperre + Storno-Transaktion | **Dieselbe** | لا — B |
| Abschlagsrechnung | Kumulativ mit Vorgänger-Abzug | `F_t=L_t−ΣF_i` + `rechnung_verrechnungen` + Retention/Escrow | **Dieselbe (stark)** | Pflicht-Check „alle Abschläge verrechnet“ |
| Schlussrechnung | Mit Bezug auf Vorgänger | `SCHLUSSRECHNUNG`-Typ + Verrechnung، لكن اختيار `MAX()` عند التعدد | **Ähnlich (Bezug implizit)** | Eindeutigkeits-Constraint gegen Doppel-Schluss |
| Storno | Storno mit Bezug | `STORNO-nr` سالبة + قفل الأصل، ذري | **Dieselbe** | لا (`createStornoData:627-669`) |
| Gutschrift | Kaufm. Minderung ohne Voll-Storno | لا مولّد — كل شيء عبر Voll-Storno السلبي؛ `GUTSCHRIFT` فقط فرع تصفية | **Nicht dieselbe** | Generator für Nachlass-Gutschrift — D |
| Zahlungsüberwachung + Mahnwesen | OPOS + Fristen + Mahnstufen + Versand | OPOS-Matching + `mahnungLevel/Datum/Gebühr` + Vorschau، لكن `bezahlt`=حالة فقط وbulk-Versand غير مثبت | **Ähnlich (Druck ja، Forderungsmanagement schwach)** | Zahlungsbuchung + Versandnachweis |
| Brieftexte | Vorlagen für Anschreiben | E-Mail-Texte + VOB-Generatoren كنصوص، لا مركز `Brieftexte` مثبت | **Ähnlich** | Zentrale Brieftext-Verwaltung — E |
| Rundschreiben | Serienbrief an viele | **Nicht gefunden** | **Fehlt** | E — komplett |
| Datensicherung | Backup/Restore | ذري + gzip + SHA + GFS + Verify + PRE_RESTORE، مثبت معزولاً 3/3 | **Dieselbe (sogar stark)** | Produktiv-Rotation/Offsite/Restore-Probe |
| Umsatzübersichten | Erlöse pro Zeitraum/Kunde | `calculateProjektUmsatz` + Steuerbericht، لكن `MAX()`-Logik وليست Controlling | **Ähnlich (kein Controlling)** | Abgrenzung Umsatz vs. Ergebnis/Prognose |
| Minibuchhaltung | Einfache E/A-Rechnung | `eingangsrechnungen` + Bank-Import + DATEV، بلا GuV/Kontenrahmen-Vollständigkeit | **Ähnlich (Eingangs-Seite ja)** | GuV/Konten/Anlagen — E |
| XRechnung | XML nach EN 16931/KoSIT | `XRechnung 3.0` مولّدة، `BT-10`-Gate صارم | **Dieselbe technisch** | KoSIT-Schematron-Lauf + B2G-Stammdaten-Disziplin |
| ZUGFeRD | Hybrid PDF/A-3+XML | حاوية `Alternative` + `pdfaid:part=3` عبر Fork، Fallback صفحة بديلة | **Dieselbe als Container، C als echtes PDF/A-3** | VeraPDF/Mustang-Lauf reproduzieren (`doc/zugferd-validation.md`) |

**الخلاصة:** لا يجوز الادعاء بتغطية القائمة لمجرد تشابه الأسماء. النقاط الحرجة للبناء المتوسط (`Lieferschein-Kunde`, `Auftragsbestätigung`, `Gutschrift ohne Storno`, `Rundschreiben`, `Brieftexte`-Zentrale) إما غائبة أو اسمية.

---

## D. نتائج سيناريو المشروع التجريبي (13 خطوة — بيانات وهمية فقط)

> لم يُنفَّذ السيناريو كاملاً في واجهة حية (Electron-UI لم تُشغَّل — Subagent E وثّق أن `test_electron_runner` يحتاج إشرافاً). أدناه ما هو مثبت بالكود/الاختبار المعزول مقابل ما ينقطع عنده الدليل. المبالغ المتوقعة حُسبت يدوياً (مستقلة عن `calculateTotals`): مثال: عرض 3 بنود (10×100 + 5×200 + 1×500 = 2500 netto، +19% = 2975 brutto)؛ دفعة 1500؛ ثانية 1000؛ الباقي 475 — الصيغة `Due = Grand − Prepaid − Einbehalt − Verrechnungen` (`einvoice.js:290-294`).

| Schritt | Ergebnis | Beleg / Grenze des Nachweises |
|---|---|---|
| 1. Testkunde + Bauprojekt + Angebot speichern | **Code-seitig B** — `saveKunde` + `saveAngebotEntwurf` + `saveProjekt` موجودة ومترابطة | `kunden.js:185`, `editor-save.js:188`, `AngebotController.js:380` — kein UI-Lauf |
| 2. Angebot erneut öffnen/ändern | **B** — Entwurf قابل للتعديل، `VERSENDET` مقفل (Freeze-Guard) | `document_repo.js:90-204` — Sperrverhalten nur gelesen |
| 3. Angenommene Version dem Projekt zuordnen | **B** — `accept→createProjektFromAngebot` مع Dedup | `:355-459` — Doppelanlage-Throw gelesen |
| 4. Auftragsbestätigung | **E — endet hier als echtes Dok** — تُحفظ كـ rechnung/angebot | `project-document-flow.js:132-133` Bug — kein AB-Nachweis |
| 5. Erstes Aufmaß | **B/C** — Blätter/Zeilen + `mergeSchlussaufmass` (ohne Drafts افتراضياً) | `aufmass_repo.js:167-233` — Dualität unbewiesen im Lauf |
| 6. Nachtrag + Übernahme | **B Rechnung / D Stamm** — `extractApprovedPositionsForInvoice` idempotent، لكن لا إدخال في `projekt_positionen` | `NachtragController.js:100-126` + `document-flow.js:162-290` |
| 7. Arbeitszeit + Projektkosten | **B Erfassung / C Controlling** — `saveZeiteintrag/saveEingangsrechnung` موجودة، التجميع `cost_type`-Split ناقص | `zeiterfassung_repo.js`, `controlling_bautagebuch_repo.js:278-312` |
| 8. Erste Abschlagsrechnung | **B** — `calculateCumulativeInvoice` + `insertVerrechnungenGuarded` | `CumulativeBillingController.js:19-106` — Rechenweg gelesen |
| 9. Teilzahlung | **C** — `zahlung_zuordnungen`/`applyPaymentMatching` موجودة، لكن `markAsPaid` حالة فقط | `banking.js:311-409` vs `editor-save.js:380` — Bruch |
| 10. Zweites Aufmaß + 2. Abschlag | **B** — `SUM(ergebnis×vorzeichen) GROUP BY oz_code` + Folge-Verrechnung | `aufmass_repo.js:193-232` — OZ-Textmatch، لا FK |
| 11. Schlussrechnung | **B mit Vorbehalt** — Typ + Verrechnung موجودة، لا منع مزدوج إلزامي | `rechnungsart`, `invoice_cumulative_states` — Doppel-Schluss möglich |
| 12. PDF/XML exportieren+vergleichen | **B Datei / C Abgleich** — XML+PDF تُولَّد، لكن لا Betragsabgleich Sichtseite↔XML، ZUGFeRD-Fallback بديل | `zugferd.test.js Z4/Z11/Z12` (Attachment-Roundtrip فقط) |
| 13. Backup + isoliert restore | **A (einziger A im Szenario)** — 3/3 معزولاً ناجحة (Snapshot/Hash/Verify/Restore) | `electron backup.test.js: BACKUP_TESTS_PASSED` — aber Temp-DB، لا Kunden-Recovery |

**أين ينتهي الدليل؟** عند الخطوة 4 (AB)، وعند 6-جزئياً (LV-Stamm)، وعند 9 (Zahlungsbeleg)، وعند 12 (Sichtseiten-Abgleich + VeraPDF). لا تجربة واجهة مخترعة — كل ما فوق تحليل كود + تشغيلات E المعزولة.

---

## E. تقرير الاختبارات (Testbericht — الأوامر الدقيقة)

**المخزون:** `72× *.test.js` في `tests/` (+3 helpers غير منفذة بـ `npm test`: `test_electron_helper/runner`, `test_pdf_flow.js` + `fixtures/`, `schemas/`, `validate_xsd.py`). `grep it/test(` = **684 Treffer**، `describe` = 40. التصنيف: 42 pure-Unit (بلا `better-sqlite3`)، 30 DB-Integration، 27 بنمط `ELECTRON_RUN_AS_NODE`، UI/E2E حقيقي فقط `test_electron_runner.js (964 Zeilen)`، بناء `dist/win-unpacked` موجود لكن `verify_packaged*` ليست `.test.js`، Offline بلا اختبار مخصص، Migration فقط `legacy_migration_replay` صناعية، Backup فقط `backup.test.js` مؤقت.

**ما نُفّذ فعلياً (Subagent E — Windows 10، System-Node v25.1.0/MODULE_VERSION 141 مقابل Electron 32.3.3):**

| Befehl (exakt) | Umgebung | Ergebnis |
|---|---|---|
| `node --test tests/project_calculations.test.js tests/arbeitstage_datum.test.js` (+2 DB-Dateien) | System-Node | pure **12 pass**؛ ملفا DB فشلا `ERR_DLOPEN_FAILED` (ABI 128≠141 — مشكلة بيئة لا منتج) — **A** للجزء النقي |
| `node --test tests/zugferd.test.js tests/efb222_calculation.test.js tests/editor-calculation.test.js tests/b2b_default_interest.test.js` | System-Node | **32/32 pass** (Z1-Z19 + EFB + Brutto) — **A** |
| `node --test tests/banking_parser.test.js tests/sepa_pain008.test.js tests/gaeb_validation.test.js tests/gaeb-x31.test.js tests/da11_export.test.js tests/datev_export.test.js` | System-Node (SEPA-DB spawn Electron ذاتياً) | **58/58 pass** — **A** |
| `node --test tests/smtp_email.test.js` | System-Node + inner Electron | **5/5 pass** لكن بـ `fakeTransportFactory (250 OK)` — **A مع قيد Mock** |
| `ELECTRON_RUN_AS_NODE=1 electron.exe tests/verify_schema_identity.test.js` | Electron-as-Node `:memory:` | **1/1 pass** — `76 Tables, 115 Indexes, 12 Triggers` — **A** |
| `ELECTRON_RUN_AS_NODE=1 electron.exe tests/legacy_migration_replay.test.js` | Electron `:memory:` | **1/1 pass** — **A** |
| `ELECTRON_RUN_AS_NODE=1 electron.exe tests/backup.test.js` | Electron `mkdtemp` | **3/3 pass** (`BACKUP_TESTS_PASSED`) — **A** |
| `ELECTRON_RUN_AS_NODE=1 electron.exe tests/data_integrity.test.js` | Electron Temp-DB | **34/38 pass، 4 fail** (`Subunternehmer-15%-Einbehalt f1` + `Soft-Delete-Filter j` — `data_integrity.test.js:591`) — **A negativ (عيوب حقيقية)** |
| `tests/test_electron_runner.js`, `verify_packaged_draft_view.js`, `verify_real_package_compliance.js`, Voll-`npm test` (72) | — | **nicht ausgeführt (E)** — تحتاج نافذة مرئية/تثبيت/وقت طويل |

**Mocks المصرح بها:** SMTP مزيف، `generateQrCode→mockQr` + `saveDocument→{success:true}` (jsdom)، ZUGFeRD-Fallback بدل الصفحة الحقيقية (Z12)، jsdom بدل Chromium، Sync-Harness محلي بدل شبكة، `safeAlert`-جواسيس. **أي Mock لا يثبت التصدير/الإرسال/المزامنة الحقيقية.**

**الأدلة:** `package.json:6-13` (`test: node --test tests/*.test.js`)، `.github/workflows/tests.yml:13-27` (ubuntu/Node20 + `npm rebuild better-sqlite3`)، `test_electron_helper.js:1-17`، العزل المؤقت (`data_integrity.test.js:33-39`، `backup.test.js:56-57` — صفر إشارة لـ `database.sqlite` في `tests/`).

---

## F. قائمة الأولويات (Fehler / Lücken / nur bei Bedarf)

**1. Fehler die verlässlichen Einsatz verhindern (قبل أي تسليم):**
- `data_integrity` — 4 فشل حقيقي: `Subunternehmer-Einbehalt (f1)` + `Soft-Delete-Filter (j)` (`:591`) — يجب الإصلاح والتحقق، لا تُسلَّم معها فواتير مقاولين.
- زر `Entsperren` الميت + قائمة `Neue Rechnung` الميتة (`preload.js:18`، `main.js:68`) — إما إزالة/تعطيل صريح أو إصلاح، لا يُترك زر يكذب.
- `AUFTRAG`-Bug (`project-document-flow.js:132-133`) — الاختيار يولّد نوعاً خاطئاً؛ إصلاح أو إخفاء الخيار حتى يوجد AB حقيقي.
- قناة `preload.invoke` العامة (`preload.js:233`) — تُبطل أي صلاحيات مستقبلية؛ تقييدها بقائمة سماح قبل أي ادعاء أدوار.
- `System-Node vs. better-sqlite3 ABI` — توثيق بيئة التشغيل (CI يستخدم Node20+rebuild) حتى لا يُقرأ الفشل كعيب منتج.

**2. Wichtige Lücken im bestehenden Ablauf (للدفعة التالية قبل التوسع):**
- `Kunden-Lieferschein` + `Auftragsbestätigung` كمستندين حقيقيين (رقم/حفظ/PDF) — حاسمان لـ VOB.
- مولّد `GAEB-Entwurf → Angebot-Positionen` (حالياً رابط فقط) + توحيد `Aufmaß`-العالمين + إدخال `Nachtrag GENEHMIGT → projekt_positionen`.
- `Gutschrift (Minderung) ohne Voll-Storno` + منع `Doppel-Schlussrechnung` + ربط `markAsPaid ↔ zahlung_zuordnungen` (حالة مقابل قيد).
- إظهار `Artikel` في النواة (إخراجه من `EXPERIMENTAL_VIEWS`) + شرح قاعدة `Mahnung verlangt isLocked` في الواجهة + `B2G-Leitweg`-فحص مبكر.
- إعادة تشغيل `VeraPDF/Mustang + KoSIT-Schematron` وتوثيق النتائج (لا تكفي مزاعم `doc/zugferd-validation.md`) + توضيح `DATEV`-الخلط (`steuer_7/19`) + `Festschreibung=0` للاستشاري.

**3. Nur bei konkretem Kundenbedarf (لا تُبنَى استباقياً):**
- `Rundschreiben`, `Brieftexte`-Zentrale, `Minibuchhaltung` (GuV/Anlagen), `P94/X89`-Export, `X31`-XSD رسمي, `GDPdU`-Export, `Lohn/LODِAS`, `Kostenstellen`, `AVA`-Portal, `IDS-Großhandel`-التوسع, `SOKA`-التفصيل, `Putzplan`-التوسع (خارج هدف البناء).

---

## G. مقترح النطاق المرئي (sichtbarer Produktumfang)

**In der Hauptnavigation behalten (Kern Bau-Mittelstand):** `Dashboard`, `Rechnungen`, `Angebote`, `Kunden`, `Projekte` (+ تفاصيلها), `Artikel` (يُنقل من تجريبي إلى نواة)، `Banking` (مع OPOS)، `Berichte/Steuerbericht`، `Einstellungen/Backup`.
**Als optionale Werkzeuge (Opt-in via `experimental_module`):** `Dauerrechnungen` (قريبة من النواة لكن ليست للجميع)، `Zeiterfassung`, `Mängel`, `GAEB-Tender`, `EFB/Kalkulation`, `Bautagebuch/Abnahme` (تُعرض داخل `Projekt`-Tabs بدل nav مستقل عند الإمكان)، `Sync/PWA` (فقط عند طلب ميداني).
**Vorläufig ausblenden (kein Ausbauziel الآن):** `Objekte/Liegenschaften`, `Putzplan/Reinigungs-LV`, `Großhandel/IDS`, `SOKA-Bau` (تُبقى مثبتة بالكود لكن مخفية) — مع إبقاء `DATANORM` داخل `Artikel` لا كمدخل مستقل.
**Nicht entfernen (Abhängigkeiten):** لا تحذف `positionen.cost_type`, `rechnung_verrechnungen`, `security_retentions`, `gaeb_*`-الجداول, `audit_logs`+Triggers, `backup_history`, `zahlung_zuordnungen`, `nachtrag_*`, `aufmass_*` (كلتاهما حتى التوحيد)، `email_versandhistorie` — إزالتها تكسر الفوترة/التراكم/GAEB/GoBD/Banking.

---

## H. تقييمات الاستخدام الثلاثة (Einsatzbewertungen — jeweils mit Belegen/Einschränkungen/Prüfungen)

**1. Einzelplatz für Angebote + Bauabrechnung — BEDINGT GEEIGNET (نعم مع إصلاحات).**
- الدليل: SQLite محلية + WAL + FK (`db.js`)، Freeze/Version/Annahme/Projekt (`AngebotController.js`)، تراكمي + حجوزات (`CumulativeBillingController.js`)، Storno ذري، DATEV/XRechnung/ZUGFeRD/GAEB ملفات، Backup مثبت 3/3.
- القيود: أخطاء `data_integrity` الأربعة، أزرار ميتة/مضللة، AB/LS-Kunde/Gutschrift غائبة، `bezahlt`=حالة، B2G يتطلب انضباط بيانات.
- الفحوص المتبقية: إصلاح وإعادة `data_integrity`، تشغيل `test_electron_runner` بإشراف، تثبيت `W-Link-Setup.exe` والتحقق من `userData/backups`، طباعة PDF حقيقية ومقارنة بنود/XML يدوياً.

**2. Büro + mobile Baustellenerfassung — ENG BEGRENZT GEEIGNET (نعم للنطاق الضيق فقط).**
- الدليل: Sync `Zeit/Bautagebuch/VOB/Aufmaß/Mängel/Fotos` مع Pairing/Idempotenz/Quarantäne + TLS-Loopback (`sync-server.js`, `sync-worker.js`, `phase3/sync_*`-Tests).
- القيود: لا مزامنة نقدية، لا دمج حقول، `Last-Writer-Wins`/حجر فقط، `alert`-Fallbacks، PWA-DB/Bundle لم تُفحص بعمق، انقطاع/تكرار تحت حمل WLAN غير مُختبر ميدانياً.
- الفحوص: مصفوفة `entity_type` الكاملة، اختبار قطع/إعادة ميداني، توفير شهادات TLS للـ LAN، تجربة QR-Pairing في حاوية موقع.

**3. Mehrbenutzer-System für mittelständische Baufirma — NICHT GEEIGNET (لا).**
- الدليل السلبي: لا حسابات/أدوار/جلسات، لا DB شبكية/أقفال، تدقيق بلا فاعل، `invoke` عام، البنية توثق فردية الاستخدام.
- القيود: `WAL+busy_timeout` ليست تزامناً؛ مشاركة ملف عبر شبكة = خطر قفل/تلف؛ لا `4-Augen`، `geaendertVon/deleted_by` نص حر.
- الفحوص قبل إعادة النظر: تصميم قفل/دمج لـ `dokumente/positionen/kunden`، `Single-Instance-Lock` + حظر مشاركة شبكية، تدقيق بالفاعل + مصادقة، إزالة `invoke` العام، اختبار حمل متزامن حقيقي. **حتى ذلك الحين: جهاز واحد = مستخدم واحد.**

---

## خاتمة ملزمة: Was wir wissen / Was noch unbewiesen ist / Welche Entscheidung erst nach diesem Bericht

**Was wir wissen (مثبت بالكود أو بتشغيل معزول):**
- النواة `Angebot→Projekt→Aufmaß→Abschlag→Schluss→Storno→DATEV` موجودة ومترابطة حسابياً (B)، والـ Backup/Audit فردي الجهاز مثبت (A للـ Backup المعزول).
- `76 App-Tabellen / 0 Views / 115 Indizes / 12 Trigger / 104 FKs` من `:memory:`-DB (A)، و`684 Tests` في `72 Datei` مع `12+32+58+5+1+1+3` نجاحات معزولة و`4` فشل حقيقي.
- `XRechnung 3.0`, `ZUGFeRD`-الحاوية, `DATEV EXTF700`, `GAEB 3.2/3.3`, `DA11` تُولَّد كملفات (B تقنياً)، و`PWA-Sync` الميداني ضيق النطاق موجود (B)، وMultiuser/Rollen غائبة (E).

**Was noch unbewiesen ist (لا يُدَّعى):**
- سلوك الواجهة الحية، PDF مطبوع حقيقي مقابل XML، `VeraPDF`/`KoSIT` خارجي، إرسال SMTP حقيقي، مزامنة شبكية حقيقية، ترحيل قاعدة قديمة حقيقية، استعادة كارثية عند عميل، تثبيت `Setup.exe` وتشغيل `backups`-الدوران، أي `A`-حكم خارج التشغيلات المعزولة المذكورة.

**Welche Entscheidung erst nach diesem Bericht getroffen werden sollte:**
- لا توسيع نطاق ولا تسعير قبل: إصلاح عيوب `data_integrity` والأزرار الميتة، وتثبيت `Artikel` في النواة وإخفاء `Reinigung/FM/IDS/SOKA`، والتشغيل الإشرافي لـ `test_electron_runner` + `verify_packaged*`، وإعادة `VeraPDF/KoSIT` موثقة.
- لا بيع `Mehrbenutzer/Rollen` ولا `PWA-Sync كدليل تعدد مستخدمين` — القرار: **Einzelplatz أولاً**، والميداني كخيار، والمتعدد بعد إعادة تصميم.
- لا حذف لجداول التبعية أعلاه، ولا ترحيل لـ `database.sqlite` الإنتاجية، ولا وعود `rechtssicher/GoBD-konform/zertifiziert/2028-sicher` — التقني منفصل عن القانوني (استشاري ضرائب/قانوني + مصادر رسمية مؤرخة).

*أُنتج في مجلد تحليل منفصل `analyse_2026-10-04/` دون المساس بملفات المنتج ودون أي Commit — وفق القواعد الملزمة.*
