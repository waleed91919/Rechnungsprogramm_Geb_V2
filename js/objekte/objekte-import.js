(function() {
function exportObjekteCSV() {
    if (!state.objekte) return;
    const OC = window.ObjektController;
    const { rows } = buildObjekteRows('', 'alle');

    const escapeCsv = (val) => {
        const s = String(val == null ? '' : val);
        if (s.includes(';') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };

    const header = [
        'Ebene',
        'Objekt-Nr',
        'Name',
        'Pfad',
        'Strasse',
        'PLZ',
        'Ort',
        'Flaeche',
        'Einheit',
        'Raumtyp',
        'Bodenbelag',
        'Empfaenger_Name',
        'Empfaenger_Art',
        'Empfaenger_Herkunft',
        'Status'
    ];

    const csvLines = [header.join(';')];

    for (const { typ, knoten } of rows) {
        const empf = OC ? OC.resolveEmpfaenger(typ, knoten.id, state.objekte) : null;
        let empfName = '';
        let empfArt = '';
        let empfQuelle = '';
        if (empf && empf.kundeId) {
            const kunde = (state.kunden || []).find(k => k.id === empf.kundeId);
            empfName = kunde ? kunde.name : `#${empf.kundeId}`;
            empfArt = empf.art ? (OBJEKT_ART_LABEL[empf.art] || empf.art) : '';
            empfQuelle = empf.direkt ? 'DIREKT' : `GEERBT_VON_${empf.quelle}`;
        }

        const pfad = OC ? OC.buildPfad(typ, knoten.id, state.objekte) : knoten.name;
        const flaeche = typ === 'RAUM' ? (knoten.flaeche || 0) : (OC ? OC.summiereFlaechen(typ, knoten.id, state.objekte) : 0);

        const zeile = [
            OBJEKT_TYP_LABEL[typ] || typ,
            knoten.objekt_nr || knoten.raum_nr || '',
            knoten.name || '',
            pfad,
            knoten.strasse || '',
            knoten.plz || '',
            knoten.ort || '',
            String(flaeche).replace('.', ','),
            knoten.einheit || (typ === 'RAUM' ? 'm²' : ''),
            knoten.raumtyp || '',
            knoten.bodenbelag || '',
            empfName,
            empfArt,
            empfQuelle,
            knoten.aktiv !== 0 ? 'Aktiv' : 'Inaktiv'
        ];

        csvLines.push(zeile.map(escapeCsv).join(';'));
    }

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const datumStr = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `Objektstruktur_${datumStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Objektstruktur erfolgreich als CSV exportiert.', 'success');
}


window.exportObjekteCSV = exportObjekteCSV;
if (typeof module !== 'undefined' && module.exports) {
module.exports = { exportObjekteCSV };
}
})();
