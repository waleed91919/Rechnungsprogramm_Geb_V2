// State
const state = {
    view: 'dashboard',
    artikel: [],
    kunden: [],
    rechnungen: [],
    angebote: [],
    projekte: [],
    objekte: {
        liegenschaften: [],
        gebaeude: [],
        etagen: [],
        raeume: []
    },
    einstellungen: {
        firmenname: 'W-LINK ERP',
        adresse: 'Musterstraße 1\n12345 Musterstadt',
        logo: '',
        bankname: 'Volksbank Musterstadt',
        steuer: 'DE999888777',
        iban: 'DE12 3456 7890 1234 5678 90',
        bic: 'GENODEF1MUS',
        zahlungsziel: '14',
        mahngebuehr1: '0.00',
        mahngebuehr2: '5.00',
        mahngebuehr3: '10.00',
        eingabemodus: 'netto',
        unternehmensart: 'handwerk'
    },
    // The nextId values will now be handled by DB AutoIncrement mostly, 
    // but we can preserve the placeholders if UI needs them directly based on local state lengths.
    currentRechnungPositionen: [],
    isAngebotMode: false
};
