"""
validate_xsd.py - Versionierte und strikte XSD-Validierung für GAEB X83 Testdateien

Prüft alle GAEB X83 Dateien ohne Namespace-Ersetzungen oder Text-Hacks:
1. XML-Wohlgeformtheit (Well-Formedness)
2. Strukturelle Basiskonformität (GAEB-Wurzel, Namespace, deklarierte Version, DP 83)
3. Strikte Schemavalidierung gegen das offizielle Schema der jeweiligen GAEB-Version:
   - GAEB DA XML 3.3 -> GAEB_DA_XML_83_3.3_2021-05.xsd
   - GAEB DA XML 3.2 -> GAEB_DA_XML_83_3.2_2013-10.xsd

Strikte Klassifizierung:
- EXPECTED_VALID:
  1. valid_schema_reference.x83 (GAEB 3.3, projektinterne Minimalreferenz)
  2. independent_pygaeb_da32.x83 (GAEB 3.2, unabhängige pyGAEB Open-Source-Datei)
  BEIDE DATEIEN MÜSSEN ZU 100% BESTEHEN (0 Fehler), sonst bricht das Skript mit sys.exit(1) ab!
- PROJECT_INTERNAL_MODELS:
  Interne Edge-Case-Testmodelle (01-05) zur Verifikation der Parser-Resilienz mit dokumentierten
  Abweichungen (z. B. DA_XML_3.3 Namespace statt Phasen-Namespace DA83/3.3).

Zusätzlich:
- Selbsttest (--self-test), der absichtlich korrumpierte Dateien prüft und sicherstellt,
  dass die Engine Schemafehler hart erkennt und nicht stillschweigend grünes Licht gibt.
"""

import os
import sys
from lxml import etree

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures', 'gaeb_x83')
SCHEMA_33_DIR = os.path.join(os.path.dirname(__file__), 'schemas', 'gaeb_da_xml_3.3')
SCHEMA_32_DIR = os.path.join(os.path.dirname(__file__), 'schemas', 'gaeb_da_xml_3.2')

XSD_33_PATH = os.path.join(SCHEMA_33_DIR, 'GAEB_DA_XML_83_3.3_2021-05.xsd')
XSD_32_PATH = os.path.join(SCHEMA_32_DIR, 'GAEB_DA_XML_83_3.2_2013-10.xsd')
XSD_84_33_PATH = os.path.join(SCHEMA_33_DIR, 'GAEB_DA_XML_84_3.3_2021-05.xsd')
XSD_84_32_PATH = os.path.join(SCHEMA_32_DIR, 'GAEB_DA_XML_84_3.2_2013-10.xsd')

EXPECTED_VALID = [
    {
        'file': 'valid_schema_reference.x83',
        'source': 'Projektintern konstruierte Minimal-Referenz (KEIN BVBS-Muster)',
        'target_version': '3.3',
        'schema_file': 'GAEB_DA_XML_83_3.3_2021-05.xsd',
        'schema_path': XSD_33_PATH
    },
    {
        'file': 'independent_pygaeb_da32.x83',
        'source': 'Unabhängiges Open-Source-Projekt pyGAEB (MIT License, 100% Byte-identisch)',
        'target_version': '3.2',
        'schema_file': 'GAEB_DA_XML_83_3.2_2013-10.xsd',
        'schema_path': XSD_32_PATH
    }
]

PROJECT_INTERNAL_MODELS = [
    {
        'file': '01_standard_hierarchie.x83',
        'source': 'Projektinternes Modell (3 Hierarchie-Ebenen)',
        'target_version': '3.3',
        'schema_file': 'GAEB_DA_XML_83_3.3_2021-05.xsd',
        'schema_path': XSD_33_PATH,
        'doc_deviation': 'Verwendet DA_XML_3.3 Namespace statt Phasen-Namespace DA83/3.3'
    },
    {
        'file': '02_positionstypen_wahl_bedarf.x83',
        'source': 'Projektinternes Modell (Wahl- und Bedarfspositionen)',
        'target_version': '3.3',
        'schema_file': 'GAEB_DA_XML_83_3.3_2021-05.xsd',
        'schema_path': XSD_33_PATH,
        'doc_deviation': 'Verwendet DA_XML_3.3 Namespace statt Phasen-Namespace DA83/3.3'
    },
    {
        'file': '03_bieterangaben_vorbemerkungen_ep.x83',
        'source': 'Projektinternes Modell (BiReq, Vorbemerkungen, UPComponents)',
        'target_version': '3.3',
        'schema_file': 'GAEB_DA_XML_83_3.3_2021-05.xsd',
        'schema_path': XSD_33_PATH,
        'doc_deviation': 'Verwendet DA_XML_3.3 Namespace statt Phasen-Namespace DA83/3.3'
    },
    {
        'file': '04_reales_muster_hochbau.x83',
        'source': 'Projektinternes Modell (Hochbau-Leistungen)',
        'target_version': '3.3',
        'schema_file': 'GAEB_DA_XML_83_3.3_2021-05.xsd',
        'schema_path': XSD_33_PATH,
        'doc_deviation': 'Verwendet DA_XML_3.3 Namespace statt Phasen-Namespace DA83/3.3'
    },
    {
        'file': '05_muster_angelehnt_an_gaeb_bvbs.x83',
        'source': 'Projektinternes Modell (ZTVE-Spezifikationen; KEINE BVBS-Datei!)',
        'target_version': '3.3',
        'schema_file': 'GAEB_DA_XML_83_3.3_2021-05.xsd',
        'schema_path': XSD_33_PATH,
        'doc_deviation': 'Verwendet DA_XML_3.3 Namespace statt Phasen-Namespace DA83/3.3'
    }
]

def load_schemas():
    if not os.path.exists(XSD_33_PATH):
        print(f"KRITISCHER FEHLER: GAEB 3.3 Schema nicht gefunden: {XSD_33_PATH}")
        sys.exit(1)
    if not os.path.exists(XSD_32_PATH):
        print(f"KRITISCHER FEHLER: GAEB 3.2 Schema nicht gefunden: {XSD_32_PATH}")
        sys.exit(1)

    try:
        schema_33 = etree.XMLSchema(file=XSD_33_PATH)
    except Exception as e:
        print(f"KRITISCHER FEHLER beim Laden des GAEB 3.3 Schemas: {e}")
        sys.exit(1)

    try:
        schema_32 = etree.XMLSchema(file=XSD_32_PATH)
    except Exception as e:
        print(f"KRITISCHER FEHLER beim Laden des GAEB 3.2 Schemas: {e}")
        sys.exit(1)

    return schema_33, schema_32

def check_file(item, schemas):
    fname = item['file']
    fpath = os.path.join(FIXTURES_DIR, fname)
    target_v = item.get('target_version', '3.3')
    schema = schemas['3.2'] if target_v == '3.2' else schemas['3.3']
    schema_name = item.get('schema_file', os.path.basename(item.get('schema_path', '')))

    if not os.path.exists(fpath):
        return {
            'file': fname,
            'source': item.get('source', ''),
            'exists': False,
            'declared_version': 'unbekannt',
            'tested_schema': schema_name,
            'well_formed': False,
            'wf_error': 'Datei nicht gefunden',
            'structural_ok': False,
            'structural_notes': ['Datei fehlt'],
            'xsd_valid': False,
            'xsd_errors': ['Datei existiert nicht']
        }

    with open(fpath, 'rb') as f:
        raw_bytes = f.read()

    # 1. XML-Wohlgeformtheit
    well_formed = False
    wf_error = None
    doc = None
    try:
        doc = etree.fromstring(raw_bytes)
        well_formed = True
    except Exception as e:
        wf_error = str(e)

    # 2. Strukturelle Basiskonformität & deklarierte GAEB-Version
    structural_ok = False
    structural_notes = []
    declared_v = 'fehlt'
    if well_formed and doc is not None:
        root_tag = etree.QName(doc).localname
        ns = doc.nsmap.get(None, '')
        version_nodes = doc.xpath('//*[local-name()="GAEBInfo"]/*[local-name()="Version"]')
        dp_nodes = doc.xpath('//*[local-name()="Award"]/*[local-name()="DP"]')

        if root_tag == 'GAEB':
            structural_notes.append("Wurzel <GAEB> OK")
        else:
            structural_notes.append(f"Wurzel '{root_tag}' != GAEB")

        if 'http://www.gaeb.de/GAEB_DA_XML/' in ns:
            structural_notes.append(f"Namespace OK ({ns})")
        else:
            structural_notes.append(f"Namespace abweichend ({ns})")

        if version_nodes and version_nodes[0].text:
            declared_v = version_nodes[0].text.strip()
            if declared_v == target_v:
                structural_notes.append(f"Version {declared_v} OK")
            else:
                structural_notes.append(f"Version {declared_v} != {target_v}")
        else:
            structural_notes.append("Version fehlt")

        has_dp83 = bool(dp_nodes and dp_nodes[0].text and dp_nodes[0].text.strip() == '83')
        if has_dp83:
            structural_notes.append("DP 83 OK")
        else:
            dp_val = dp_nodes[0].text.strip() if (dp_nodes and dp_nodes[0].text) else 'fehlt'
            structural_notes.append(f"DP != 83 ({dp_val})")

        structural_ok = (root_tag == 'GAEB' and 'http://www.gaeb.de/GAEB_DA_XML/' in ns and declared_v == target_v and has_dp83)

    # 3. Strikte XSD-Validierung gegen das vorgesehene Schema (OHNE Manipulation!)
    xsd_valid = False
    xsd_errors = []
    if well_formed and doc is not None:
        xsd_valid = schema.validate(doc)
        if not xsd_valid:
            for err in schema.error_log:
                xsd_errors.append(f"Zeile {err.line}: {err.message}")

    return {
        'file': fname,
        'source': item.get('source', ''),
        'exists': True,
        'declared_version': declared_v,
        'tested_schema': schema_name,
        'well_formed': well_formed,
        'wf_error': wf_error,
        'structural_ok': structural_ok,
        'structural_notes': structural_notes,
        'xsd_valid': xsd_valid,
        'xsd_errors': xsd_errors,
        'doc_deviation': item.get('doc_deviation')
    }

def print_table(group_name, results):
    print(f"\n--- {group_name} ---")
    print(f"{'Dateiname':<34} | {'GAEB-V':<7} | {'Prüfschema':<32} | {'XML':<8} | {'XSD-Status':<18}")
    print("-" * 110)
    for r in results:
        wf_str = "OK" if r['well_formed'] else "FEHLER"
        if r['xsd_valid']:
            xsd_str = "BESTANDEN (0)"
        else:
            err_count = len(r['xsd_errors'])
            xsd_str = f"FEHLGESCHLAGEN ({err_count})"
        print(f"{r['file']:<34} | {r['declared_version']:<7} | {r['tested_schema']:<32} | {wf_str:<8} | {xsd_str:<18}")

def run_self_test(schemas):
    print("\n" + "=" * 95)
    print("XSD-Validierungs-Selbsttest: Verifikation der Fehlererkennung bei korrumpierten Dateien")
    print("=" * 95)

    # Test 1: Korrumpierung von valid_schema_reference.x83 gegen GAEB 3.3 Schema (Entfernen des Pflichtfelds <DP>)
    ref_33_path = os.path.join(FIXTURES_DIR, 'valid_schema_reference.x83')
    if not os.path.exists(ref_33_path):
        print(f"SELBSTTEST-FEHLER: Referenzdatei nicht gefunden: {ref_33_path}")
        return False

    doc_33 = etree.parse(ref_33_path)
    schema_33 = schemas['3.3']
    if not schema_33.validate(doc_33):
        print("SELBSTTEST-FEHLER: Unkorrumpierte Referenzdatei 3.3 besteht die Validierung nicht!")
        return False

    dp_node_33 = doc_33.getroot().xpath('//*[local-name()="DP"]')
    if not dp_node_33:
        print("SELBSTTEST-FEHLER: <DP> Element in valid_schema_reference.x83 nicht gefunden!")
        return False
    dp_node_33[0].getparent().remove(dp_node_33[0])

    if schema_33.validate(doc_33):
        print("KRITISCHER FEHLER IM SELBSTTEST: Fehlendes Pflichtfeld <DP> in 3.3 wurde NICHT erkannt!")
        return False
    err_33 = schema_33.error_log[0].message if schema_33.error_log else "Kein Text"
    print(f"[OK] Selbsttest 1 (GAEB 3.3 - Pflichtfeld <DP> entfernt): Hart abgefangen.")
    print(f"  Erkannte Schemaabweichung: {err_33}")

    # Test 2: Korrumpierung von independent_pygaeb_da32.x83 gegen GAEB 3.2 Schema (Entfernen des Pflichtfelds <DP>)
    ref_32_path = os.path.join(FIXTURES_DIR, 'independent_pygaeb_da32.x83')
    if not os.path.exists(ref_32_path):
        print(f"SELBSTTEST-FEHLER: pyGAEB-Datei nicht gefunden: {ref_32_path}")
        return False

    doc_32 = etree.parse(ref_32_path)
    schema_32 = schemas['3.2']
    if not schema_32.validate(doc_32):
        print("SELBSTTEST-FEHLER: Unkorrumpierte pyGAEB 3.2 Datei besteht die Validierung nicht!")
        return False

    dp_node_32 = doc_32.getroot().xpath('//*[local-name()="DP"]')
    if not dp_node_32:
        print("SELBSTTEST-FEHLER: <DP> Element in independent_pygaeb_da32.x83 nicht gefunden!")
        return False
    dp_node_32[0].getparent().remove(dp_node_32[0])

    if schema_32.validate(doc_32):
        print("KRITISCHER FEHLER IM SELBSTTEST: Fehlendes Pflichtfeld <DP> in 3.2 wurde NICHT erkannt!")
        return False
    err_32 = schema_32.error_log[0].message if schema_32.error_log else "Kein Text"
    print(f"[OK] Selbsttest 2 (GAEB 3.2 - Pflichtfeld <DP> entfernt): Hart abgefangen.")
    print(f"  Erkannte Schemaabweichung: {err_32}")

    print("Selbsttest: BESTANDEN (Validierungs-Engine gibt bei Fehlern niemals stillschweigend grünes Licht)\n")
    return True

def validate_x84_file(fpath, target_version=None):
    if not os.path.exists(fpath):
        return {
            'file': fpath,
            'exists': False,
            'declared_version': 'unbekannt',
            'tested_schema': 'unbekannt',
            'well_formed': False,
            'wf_error': f"Datei nicht gefunden: {fpath}",
            'structural_ok': False,
            'structural_notes': ['Datei fehlt'],
            'xsd_valid': False,
            'xsd_errors': ['Datei existiert nicht']
        }

    with open(fpath, 'rb') as f:
        raw_bytes = f.read()

    # 1. XML-Wohlgeformtheit
    well_formed = False
    wf_error = None
    doc = None
    try:
        doc = etree.fromstring(raw_bytes)
        well_formed = True
    except Exception as e:
        wf_error = str(e)

    # 2. Strukturelle Basiskonformität & deklarierte GAEB-Version
    structural_ok = False
    structural_notes = []
    declared_v = 'fehlt'
    schema_name = 'unbekannt'
    xsd_valid = False
    xsd_errors = []

    if well_formed and doc is not None:
        root_tag = etree.QName(doc).localname
        ns = doc.nsmap.get(None, '')
        version_nodes = doc.xpath('//*[local-name()="GAEBInfo"]/*[local-name()="Version"]')
        dp_nodes = doc.xpath('//*[local-name()="Award"]/*[local-name()="DP"]')

        if root_tag == 'GAEB':
            structural_notes.append("Wurzel <GAEB> OK")
        else:
            structural_notes.append(f"Wurzel '{root_tag}' != GAEB")

        if version_nodes and version_nodes[0].text:
            declared_v = version_nodes[0].text.strip()
        else:
            structural_notes.append("Version fehlt in GAEBInfo")

        v_to_use = target_version or declared_v
        if v_to_use not in ('3.2', '3.3'):
            structural_notes.append(f"Nicht unterstützte Version: {v_to_use}")
        else:
            expected_ns = f"http://www.gaeb.de/GAEB_DA_XML/DA84/{v_to_use}"
            if ns == expected_ns:
                structural_notes.append(f"Namespace OK ({ns})")
            else:
                structural_notes.append(f"Namespace abweichend: {ns} (Erwartet: {expected_ns})")

            has_dp84 = bool(dp_nodes and dp_nodes[0].text and dp_nodes[0].text.strip() in ('84', '84Z'))
            if has_dp84:
                structural_notes.append(f"DP {dp_nodes[0].text.strip()} OK")
            else:
                dp_val = dp_nodes[0].text.strip() if (dp_nodes and dp_nodes[0].text) else 'fehlt'
                structural_notes.append(f"DP != 84 ({dp_val})")

            structural_ok = (root_tag == 'GAEB' and ns == expected_ns and declared_v == v_to_use and has_dp84)

            schema_path = XSD_84_32_PATH if v_to_use == '3.2' else XSD_84_33_PATH
            schema_name = os.path.basename(schema_path)

            if not os.path.exists(schema_path):
                xsd_errors.append(f"X84 Schema nicht gefunden: {schema_path}")
            else:
                try:
                    schema = etree.XMLSchema(file=schema_path)
                    xsd_valid = schema.validate(doc)
                    if not xsd_valid:
                        for err in schema.error_log:
                            xsd_errors.append(f"Zeile {err.line}: {err.message}")
                except Exception as e:
                    xsd_errors.append(f"Schemafehler beim Laden/Validieren: {e}")

    return {
        'file': fpath,
        'exists': True,
        'declared_version': declared_v,
        'tested_schema': schema_name,
        'well_formed': well_formed,
        'wf_error': wf_error,
        'structural_ok': structural_ok,
        'structural_notes': structural_notes,
        'xsd_valid': xsd_valid,
        'xsd_errors': xsd_errors
    }

def main():
    if '--x84' in sys.argv:
        x84_idx = sys.argv.index('--x84')
        if x84_idx + 1 >= len(sys.argv):
            print("FEHLER: Pfad zur X84-Datei nach --x84 erforderlich.")
            sys.exit(1)
        x84_path = sys.argv[x84_idx + 1]
        target_v = None
        if '--version' in sys.argv:
            v_idx = sys.argv.index('--version')
            if v_idx + 1 < len(sys.argv):
                target_v = sys.argv[v_idx + 1]

        res = validate_x84_file(x84_path, target_v)
        print("=" * 110)
        print(f"GAEB X84 Validierungsprüfung: {x84_path}")
        print("=" * 110)
        print(f"  - Datei existiert:      {'Ja' if res['exists'] else 'Nein'}")
        print(f"  - Deklarierte Version:  {res['declared_version']}")
        print(f"  - Geprüftes Schema:     {res['tested_schema']}")
        print(f"  - XML-Status:           {'Wohlgeformt (OK)' if res['well_formed'] else res['wf_error']}")
        print(f"  - Strukturelle Prüfung: {', '.join(res['structural_notes'])}")
        if res['xsd_valid'] and res['structural_ok']:
            print("  - XSD-Validierungsstatus: BESTANDEN (0 Schema-Fehler)")
            print("=" * 110)
            print("ERGEBNIS: ERFOLG - Die X84 Datei ist zu 100% schemakonform.")
            sys.exit(0)
        else:
            print(f"  - XSD-Validierungsstatus: FEHLGESCHLAGEN ({len(res['xsd_errors'])} Schema-Fehler):")
            for err in res['xsd_errors']:
                print(f"      * {err}")
            print("=" * 110)
            print("ERGEBNIS: FEHLER - Die X84 Datei ist nicht schemakonform!")
            sys.exit(1)

    self_test_only = '--self-test' in sys.argv

    schema_33, schema_32 = load_schemas()
    schemas = {'3.3': schema_33, '3.2': schema_32}

    if self_test_only:
        ok = run_self_test(schemas)
        sys.exit(0 if ok else 1)

    print("=" * 110)
    print("GAEB X83 Validierungsbericht: Versionierte Schema-Prüfung (GAEB 3.2 und GAEB 3.3)")
    print("=" * 110)
    print(f"Geladene offizielle Schemata:")
    print(f"  - GAEB DA XML 3.3 (2021-05): {os.path.basename(XSD_33_PATH)}")
    print(f"  - GAEB DA XML 3.2 (2013-10): {os.path.basename(XSD_32_PATH)}")
    print(f"Modus: Unveränderte Prüfung im Originalzustand (strikte Prüfung ohne Text- oder Namespace-Hacks)\n")

    # 1. EXPECTED_VALID prüfen
    valid_results = [check_file(item, schemas) for item in EXPECTED_VALID]
    print_table("1. EXPECTED_VALID (Schema-konforme Referenzen - müssen zwingend 100% bestehen)", valid_results)

    # 2. PROJECT_INTERNAL_MODELS prüfen
    internal_results = [check_file(item, schemas) for item in PROJECT_INTERNAL_MODELS]
    print_table("2. PROJECT_INTERNAL_MODELS (Interne Edge-Case-Testmodelle für Parser-Härtung)", internal_results)

    # Detailprotokoll
    print("\n" + "=" * 110)
    print("Detailprotokoll der Prüfergebnisse:")
    print("=" * 110)

    print("\n[GRUPPE 1: EXPECTED_VALID]")
    has_expected_valid_failure = False
    for r in valid_results:
        print(f"\nDatei: {r['file']}")
        print(f"  - Quelle:               {r['source']}")
        print(f"  - Deklarierte Version:  {r['declared_version']}")
        print(f"  - Geprüftes Schema:     {r['tested_schema']}")
        print(f"  - XML-Status:           {'Wohlgeformt (OK)' if r['well_formed'] else r['wf_error']}")
        print(f"  - Strukturelle Prüfung: {', '.join(r['structural_notes'])}")
        if r['xsd_valid']:
            print("  - XSD-Validierungsstatus: BESTANDEN (0 Schema-Fehler)")
        else:
            has_expected_valid_failure = True
            print(f"  - XSD-Validierungsstatus: FEHLGESCHLAGEN ({len(r['xsd_errors'])} Schema-Fehler):")
            for err in r['xsd_errors'][:10]:
                print(f"      * {err}")
            if len(r['xsd_errors']) > 10:
                print(f"      ... und {len(r['xsd_errors']) - 10} weitere Fehler")

    print("\n[GRUPPE 2: PROJECT_INTERNAL_MODELS]")
    for r in internal_results:
        print(f"\nDatei: {r['file']}")
        print(f"  - Quelle:               {r['source']}")
        print(f"  - Deklarierte Version:  {r['declared_version']}")
        print(f"  - Geprüftes Schema:     {r['tested_schema']}")
        print(f"  - XML-Status:           {'Wohlgeformt (OK)' if r['well_formed'] else r['wf_error']}")
        print(f"  - Dokumentierte Abweichung: {r.get('doc_deviation', 'Keine')}")
        if r['xsd_valid']:
            print("  - XSD-Validierungsstatus: BESTANDEN")
        else:
            print(f"  - XSD-Validierungsstatus: FEHLGESCHLAGEN ({len(r['xsd_errors'])} Abweichungen vom DA83-Schema - erwartet):")
            for err in r['xsd_errors'][:3]:
                print(f"      * {err}")
            if len(r['xsd_errors']) > 3:
                print(f"      ... und {len(r['xsd_errors']) - 3} weitere Abweichungen")

    # Selbsttest ausführen
    self_test_ok = run_self_test(schemas)

    print("=" * 110)
    print("Zusammenfassendes Gesamtergebnis:")
    print("=" * 110)
    if has_expected_valid_failure:
        print("ERGEBNIS: FEHLER - Mindestens eine Datei aus EXPECTED_VALID hat die XSD-Validierung nicht bestanden!")
        sys.exit(1)
    elif not self_test_ok:
        print("ERGEBNIS: FEHLER - Der XSD-Validierungs-Selbsttest ist fehlgeschlagen!")
        sys.exit(1)
    else:
        print("ERGEBNIS: ERFOLG - Alle Dateien in EXPECTED_VALID bestehen zu 100% ihre jeweilige offizielle XSD-Validierung!")
        print("  - valid_schema_reference.x83: 100% konform zu GAEB DA XML 83 3.3 (Ausgabe 2021-05)")
        print("  - independent_pygaeb_da32.x83: 100% konform zu GAEB DA XML 83 3.2 (Ausgabe 2013-10)")
        print("  - Selbsttest: Verifiziert, dass fehlerhafte Dateien hart zurückgewiesen werden.")
        print("  - PROJECT_INTERNAL_MODELS: Dokumentierte Edge-Cases für Parser-Resilienz.")
        sys.exit(0)

if __name__ == '__main__':
    main()
