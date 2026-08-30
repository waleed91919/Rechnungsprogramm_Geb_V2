/**
 * pwa/js/pwa-db.js - IndexedDB Client-Datenbank für Offline-First Betrieb des Baustellenbegleiters
 */

const DexieClass = (typeof Dexie !== 'undefined') ? Dexie : (typeof require !== 'undefined' ? require('./dexie.min.js') : null);

if (DexieClass) {
    const db = new DexieClass('WLinkMobileDB');

    db.version(1).stores({
        // Lokale Arbeitszeiterfassung
        local_zeiterfassung: 'uuid, mitarbeiter_id, projekt_id, liegenschaft_id, raum_id, taetigkeit_typ, zeit_von, is_synced, created_at',
        
        // Lokales Bautagebuch & Tagesberichte
        local_bautagebuch: 'uuid, projekt_id, datum, status, is_synced, created_at',
        
        // Formelle VOB/B Bedenken- & Behinderungsanzeigen
        local_vob_meldungen: 'uuid, projekt_id, typ, datum, status, is_synced',
        
        // Baustellen-Fotodokumentation & Mängel-Markups
        local_fotos: 'uuid, entitaet_typ, entitaet_uuid, sha256_hash, is_synced, created_at',
        
        // Outbox-Queue für Event-Sourcing (Push an Server)
        sync_outbox: 'uuid, entity_type, entity_uuid, mutation_type, lamport_timestamp, status, created_at',
        
        // Stammdaten-Cache (vom Desktop empfangen, mobil nur Lesezugriff)
        cache_projekte: 'id, name, status',
        cache_liegenschaften: 'id, objekt_nr, name, ort',
        cache_gebaeude: 'id, liegenschaft_id, name',
        cache_etagen: 'id, gebaeude_id, name',
        cache_raeume: 'id, etage_id, name, raum_nr',
        cache_mitarbeiter: 'id, personalnummer, vorname, nachname, lohngruppe_id, tarif_stundensatz, pin_hash',
        cache_lv_positionen: 'id, bereich_id, positionsnr, bezeichnung',
        
        // Verbindungs- & Pairing-Metadaten
        app_settings: 'key'
    });

    if (typeof window !== 'undefined') {
        window.mobileDb = db;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = db;
    }
}
