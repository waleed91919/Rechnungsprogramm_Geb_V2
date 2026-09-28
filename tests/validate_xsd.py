"""
validate_xsd.py - Strikte und ehrliche XSD-Validierung für GAEB X83 Testfixtures

Prüft alle GAEB X83 Dateien ohne Namespace-Ersetzungen oder Text-Hacks:
1. XML-Wohlgeformtheit (Well-Formedness)
2. Strukturelle Basiskonformität (GAEB-Wurzel, Namespace, Version 3.3, DP 83)
3. Strikte Schemavalidierung gegen GAEB_DA_XML_83_3.3_2021-05.xsd

Trennt explizit:
- EXPECTED_VALID: Schema-konforme Referenzdateien (Muss 100% bestehen, sonst Exit != 0)
- PROJECT_INTERNAL_MODELS: Interne Edge-Case-Testmodelle für Parser-Grenzfälle
  (weisen bekannte Abweichungen vom DA83-Schema auf, z.B. DA_XML_3.3 Namespace)
"""

import os
import sys
from lxml import etree

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures', 'gaeb_x83')
SCHEMA_DIR = os.path.join(os.path.dirname(__file__), 'schemas', 'gaeb_da_xml_3.3')
XSD_83_PATH = os.path.join(SCHEMA_DIR, 'GAEB_DA_XML_83_3.3_2021-05.xsd')

EXPECTED_VALID = [
    'valid_schema_reference.x83'
]

PROJECT_INTERNAL_MODELS = [
    '01_standard_hierarchie.x83',
    '02_positionstypen_wahl_bedarf.x83',
    '03_bieterangaben_vorbemerkungen_ep.x83',
    '04_reales_muster_hochbau.x83',
    '05_muster_angelehnt_an_gaeb_bvbs.x83'
]

def check_file(fname, schema):
    fpath = os.path.join(FIXTURES_DIR, fname)
    if not os.path.exists(fpath):
        return {
            'file': fname,
            'exists': False,
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

    # 2. Strukturelle Basiskonformität
    structural_ok = False
    structural_notes = []
    if well_formed and doc is not None:
        root_tag = etree.QName(doc).localname
        ns = doc.nsmap.get(None, '')
        version = doc.xpath('//*[local-name()="GAEBInfo"]/*[local-name()="Version"]')
        dp = doc.xpath('//*[local-name()="Award"]/*[local-name()="DP"]')

        if root_tag == 'GAEB':
            structural_notes.append("Wurzel <GAEB> OK")
        else:
            structural_notes.append(f"Wurzel '{root_tag}' != GAEB")

        if 'http://www.gaeb.de/GAEB_DA_XML/' in ns:
            structural_notes.append(f"Namespace OK ({ns})")
        else:
            structural_notes.append(f"Namespace abweichend ({ns})")

        has_v33 = bool(version and version[0].text and version[0].text.strip() == '3.3')
        if has_v33:
            structural_notes.append("Version 3.3 OK")
        else:
            v_val = version[0].text.strip() if (version and version[0].text) else 'fehlt'
            structural_notes.append(f"Version != 3.3 ({v_val})")

        has_dp83 = bool(dp and dp[0].text and dp[0].text.strip() == '83')
        if has_dp83:
            structural_notes.append("DP 83 OK")
        else:
            dp_val = dp[0].text.strip() if (dp and dp[0].text) else 'fehlt'
            structural_notes.append(f"DP != 83 ({dp_val})")

        structural_ok = (root_tag == 'GAEB' and 'http://www.gaeb.de/GAEB_DA_XML/' in ns and has_v33 and has_dp83)

    # 3. Strikte XSD-Validierung (OHNE jeglichen Text- oder Namespace-Hack!)
    xsd_valid = False
    xsd_errors = []
    if well_formed and doc is not None:
        xsd_valid = schema.validate(doc)
        if not xsd_valid:
            for err in schema.error_log:
                xsd_errors.append(f"Zeile {err.line}: {err.message}")

    return {
        'file': fname,
        'exists': True,
        'well_formed': well_formed,
        'wf_error': wf_error,
        'structural_ok': structural_ok,
        'structural_notes': structural_notes,
        'xsd_valid': xsd_valid,
        'xsd_errors': xsd_errors
    }

def print_table(group_name, results):
    print(f"\n--- {group_name} ---")
    print(f"{'Dateiname':<42} | {'Wohlgeformt':<11} | {'Struktur 3.3':<12} | {'Strikte XSD':<22}")
    print("-" * 95)
    for r in results:
        wf_str = "JA (OK)" if r['well_formed'] else "NEIN (Fehler)"
        st_str = "JA (OK)" if r['structural_ok'] else "NEIN (Abweichung)"
        if r['xsd_valid']:
            xsd_str = "BESTANDEN (OK)"
        else:
            err_count = len(r['xsd_errors'])
            xsd_str = f"FEHLGESCHLAGEN ({err_count})"
        print(f"{r['file']:<42} | {wf_str:<11} | {st_str:<12} | {xsd_str:<22}")

def main():
    print("=" * 95)
    print("GAEB X83 Validierungsbericht: Strikte Schema-Prüfung gegen GAEB_DA_XML_83_3.3_2021-05.xsd")
    print("=" * 95)

    if not os.path.exists(XSD_83_PATH):
        print(f"KRITISCHER FEHLER: XSD-Schema nicht gefunden: {XSD_83_PATH}")
        sys.exit(1)

    try:
        schema = etree.XMLSchema(file=XSD_83_PATH)
        print(f"Offizielles Schema geladen: {os.path.basename(XSD_83_PATH)}")
        print("Modus: Unveränderte Prüfung im Originalzustand (keine Namespace-Ersetzungen)\n")
    except Exception as e:
        print(f"KRITISCHER FEHLER beim Laden des XSD-Schemas: {e}")
        sys.exit(1)

    # Gruppe 1 prüfen
    valid_results = [check_file(f, schema) for f in EXPECTED_VALID]
    print_table("1. EXPECTED_VALID (Schema-konforme Referenzen - müssen zwingend bestehen)", valid_results)

    # Gruppe 2 prüfen
    internal_results = [check_file(f, schema) for f in PROJECT_INTERNAL_MODELS]
    print_table("2. PROJECT_INTERNAL_MODELS (Interne Edge-Case-Testmodelle für Parser-Härtung)", internal_results)

    print("\n" + "=" * 95)
    print("Detailprotokoll der Prüfergebnisse:")
    print("=" * 95)

    print("\n[GRUPPE 1: EXPECTED_VALID]")
    has_expected_valid_failure = False
    for r in valid_results:
        print(f"\nDatei: {r['file']}")
        print(f"  - XML-Wohlgeformtheit: {'OK' if r['well_formed'] else r['wf_error']}")
        print(f"  - Strukturelle Prüfung: {', '.join(r['structural_notes'])}")
        if r['xsd_valid']:
            print("  - Strikte XSD-Validierung: BESTANDEN (0 Schema-Fehler)")
        else:
            has_expected_valid_failure = True
            print(f"  - Strikte XSD-Validierung: FEHLGESCHLAGEN ({len(r['xsd_errors'])} Schema-Fehler):")
            for err in r['xsd_errors'][:10]:
                print(f"      * {err}")
            if len(r['xsd_errors']) > 10:
                print(f"      ... und {len(r['xsd_errors']) - 10} weitere Fehler")

    print("\n[GRUPPE 2: PROJECT_INTERNAL_MODELS]")
    for r in internal_results:
        print(f"\nDatei: {r['file']}")
        print(f"  - XML-Wohlgeformtheit: {'OK' if r['well_formed'] else r['wf_error']}")
        print(f"  - Strukturelle Prüfung: {', '.join(r['structural_notes'])}")
        if r['xsd_valid']:
            print("  - Strikte XSD-Validierung: BESTANDEN")
        else:
            print(f"  - Strikte XSD-Validierung: FEHLGESCHLAGEN ({len(r['xsd_errors'])} Abweichungen vom DA83-Schema):")
            for err in r['xsd_errors'][:4]:
                print(f"      * {err}")
            if len(r['xsd_errors']) > 4:
                print(f"      ... und {len(r['xsd_errors']) - 4} weitere Abweichungen (z. B. generischer Namespace DA_XML_3.3)")

    print("\n" + "=" * 95)
    print("Zusammenfassung:")
    if has_expected_valid_failure:
        print("ERGEBNIS: FEHLER - Mindestens eine Datei aus EXPECTED_VALID hat die XSD-Validierung nicht bestanden!")
        sys.exit(1)
    else:
        print("ERGEBNIS: ERFOLG - Alle Dateien in EXPECTED_VALID sind 100% schema-konform.")
        print("Die Abweichungen in PROJECT_INTERNAL_MODELS sind dokumentierte Edge-Cases für den funktionalen Parser.")
        sys.exit(0)

if __name__ == '__main__':
    main()
