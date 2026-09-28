"""
validate_xsd.py

Automatisierte Validierungsprüfung für alle GAEB X83 Testfixtures:
1. XML-Wohlgeformtheit (Well-Formedness)
2. Strukturelle Basiskonformität (GAEB 3.3 Wurzel, DP 83, Version 3.3)
3. Strikte Schemavalidierung gegen die offizielle GAEB DA XML 3.3 XSD (GAEB_DA_XML_83_3.3_2021-05.xsd)
"""

import os
import sys
from lxml import etree

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures', 'gaeb_x83')
SCHEMA_DIR = os.path.join(os.path.dirname(__file__), 'schemas', 'gaeb_da_xml_3.3')
XSD_83_PATH = os.path.join(SCHEMA_DIR, 'GAEB_DA_XML_83_3.3_2021-05.xsd')

def main():
    print("=" * 80)
    print("GAEB X83 Validierungsbericht: Wohlgeformtheit vs. Struktur vs. XSD Schema")
    print("=" * 80)

    if not os.path.exists(XSD_83_PATH):
        print(f"FEHLER: XSD-Datei nicht gefunden unter {XSD_83_PATH}")
        sys.exit(1)

    schema = etree.XMLSchema(file=XSD_83_PATH)
    print(f"Offizielles Schema erfolgreich geladen: {os.path.basename(XSD_83_PATH)}\n")

    fixtures = sorted([f for f in os.listdir(FIXTURES_DIR) if f.endswith('.x83')])

    results = []

    for fname in fixtures:
        fpath = os.path.join(FIXTURES_DIR, fname)
        with open(fpath, 'rb') as f:
            raw_bytes = f.read()

        # 1. XML-Wohlgeformtheit
        well_formed = False
        wf_error = None
        try:
            doc = etree.fromstring(raw_bytes)
            well_formed = True
        except Exception as e:
            wf_error = str(e)

        # 2. Strukturelle Basiskonformität
        structural_ok = False
        structural_notes = []
        if well_formed:
            root_tag = etree.QName(doc).localname
            ns = doc.nsmap.get(None, '')
            version = doc.xpath('//*[local-name()="GAEBInfo"]/*[local-name()="Version"]')
            dp = doc.xpath('//*[local-name()="Award"]/*[local-name()="DP"]')
            
            if root_tag == 'GAEB':
                structural_notes.append("Wurzel <GAEB> OK")
            else:
                structural_notes.append(f"Wurzel {root_tag} != GAEB")
                
            if 'http://www.gaeb.de/GAEB_DA_XML/' in ns:
                structural_notes.append(f"Namespace {ns} OK")
            else:
                structural_notes.append(f"Namespace {ns} abweichend")

            if version and version[0].text and version[0].text.strip() == '3.3':
                structural_notes.append("Version 3.3 OK")
            else:
                structural_notes.append("Version != 3.3")

            if dp and dp[0].text and dp[0].text.strip() == '83':
                structural_notes.append("DP 83 OK")
            else:
                structural_notes.append("DP != 83")

            structural_ok = (root_tag == 'GAEB' and 'http://www.gaeb.de/GAEB_DA_XML/' in ns and 
                             bool(version and version[0].text.strip() == '3.3') and
                             bool(dp and dp[0].text.strip() == '83'))

        # 3. Strikte XSD-Validierung
        xsd_valid = False
        xsd_errors = []
        da83_errors = []
        if well_formed:
            xsd_valid = schema.validate(doc)
            if not xsd_valid:
                for err in schema.error_log[:3]:
                    xsd_errors.append(f"Zeile {err.line}: {err.message}")

            # Sekundäre Analyse: Prüfung mit phasenbezogenem DA83-Namespace
            raw_text = raw_bytes.decode('utf-8', errors='replace')
            text_da83 = raw_text.replace('http://www.gaeb.de/GAEB_DA_XML/DA_XML_3.3', 'http://www.gaeb.de/GAEB_DA_XML/DA83/3.3')
            try:
                doc_da83 = etree.fromstring(text_da83.encode('utf-8'))
                if not schema.validate(doc_da83):
                    for err in schema.error_log[:5]:
                        da83_errors.append(f"Zeile {err.line}: {err.message}")
            except Exception as e:
                da83_errors.append(f"XML-Fehler bei DA83: {e}")

        results.append({
            'file': fname,
            'well_formed': well_formed,
            'wf_error': wf_error,
            'structural_ok': structural_ok,
            'structural_notes': structural_notes,
            'xsd_valid': xsd_valid,
            'xsd_errors': xsd_errors,
            'da83_errors': da83_errors
        })

    # Ausgabe der Tabelle
    print(f"{'Dateiname':<45} | {'Wohlgeformt':<11} | {'Struktur 3.3':<12} | {'Strikte XSD':<11}")
    print("-" * 86)
    for r in results:
        wf_str = "JA (OK)" if r['well_formed'] else "NEIN"
        st_str = "JA (OK)" if r['structural_ok'] else "NEIN"
        xsd_str = "JA (OK)" if r['xsd_valid'] else "NEIN (Abweichung)"
        print(f"{r['file']:<45} | {wf_str:<11} | {st_str:<12} | {xsd_str:<11}")

    print("\n" + "=" * 80)
    print("Detailanalyse der XSD-Abweichungen (ohne manuelle Verfälschung der Testdaten):")
    print("=" * 80)
    for r in results:
        print(f"\nDatei: {r['file']}")
        print(f"  - XML-Wohlgeformtheit: {'OK' if r['well_formed'] else r['wf_error']}")
        print(f"  - Strukturelle Prüfung: {', '.join(r['structural_notes'])}")
        print(f"  - Strikte XSD-Prüfung (Original-Namespace): {'Bestanden' if r['xsd_valid'] else 'Abweichungen festgestellt'}")
        if r['xsd_errors']:
            print("    Original XSD-Befund:")
            for err in r['xsd_errors']:
                print(f"      * {err}")
        if r['da83_errors']:
            print("    DA83-Namespace Facetten-/Strukturbefunde (Detailuntersuchung):")
            for err in r['da83_errors']:
                print(f"      * {err}")

if __name__ == '__main__':
    main()
