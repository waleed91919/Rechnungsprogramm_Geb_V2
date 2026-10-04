// geofence_utils.js
(function() {
    function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
            const R = 6371e3; // Erdradius in Metern
            const rad = Math.PI / 180;
            const phi1 = lat1 * rad;
            const phi2 = lat2 * rad;
            const deltaPhi = (lat2 - lat1) * rad;
            const deltaLambda = (lon2 - lon1) * rad;
    
            const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                      Math.cos(phi1) * Math.cos(phi2) *
                      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
            return R * c;
        }

    function validatePunchEvent(eventData, targetLocation = null) {
            if (!eventData || !eventData.mitarbeiter_id) return { valid: false, error: 'Mitarbeiter-ID fehlt.' };
            if (!eventData.zeitstempel && !eventData.zeit_von) return { valid: false, error: 'Zeitstempel fehlt.' };
    
            let geofenceOk = true;
            let distanzMeter = null;
    
            const lat = eventData.geo_lat != null ? parseFloat(eventData.geo_lat) : null;
            const lng = eventData.geo_lng != null ? parseFloat(eventData.geo_lng) : null;
    
            if (targetLocation && targetLocation.lat != null && targetLocation.lng != null && lat != null && lng != null) {
                distanzMeter = this.calculateHaversineDistance(
                    targetLocation.lat, targetLocation.lng,
                    lat, lng
                );
                // Toleranzbereich: 250 Meter um das Bauobjekt
                if (distanzMeter > 250) {
                    geofenceOk = false;
                }
            }
    
            return {
                valid: true,
                geofenceOk,
                distanzMeter: distanzMeter !== null ? Math.round(distanzMeter) : null,
                qrValid: Boolean(eventData.qr_code_scanned)
            };
        }

    const moduleExports = {
        calculateHaversineDistance,
        validatePunchEvent,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = moduleExports;
    }
    if (typeof window !== 'undefined') {
        window.GeofenceUtils = moduleExports;
    }
})();
