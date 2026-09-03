/**
 * pwa/js/bluetooth-laser.js - Universeller Web Bluetooth BLE Treiber für Leica DISTO & Bosch GLM
 * Ermöglicht kabellose Messwert-Injektion ohne Tippen direkt auf der Baustelle.
 * Isomorph mit statischen Parsing-Methoden für automatisierte Tests.
 */

class BluetoothLaserEngine {
    constructor() {
        this.device = null;
        this.server = null;
        this.deviceType = null; // 'LEICA' | 'BOSCH'
        this.isConnected = false;
        this.onMeasurementCallback = null;
        this.onStatusChangeCallback = null;

        // GATT UUIDs
        this.UUIDS = {
            LEICA_SERVICE: '3ab10100-f831-4395-b29d-570977d5bf94',
            LEICA_DISTANCE_CHAR: '3ab10101-f831-4395-b29d-570977d5bf94',
            
            BOSCH_SERVICE_50C: '00005301-0000-0041-5253-534f4654-0000',
            BOSCH_CHAR_50C: '00004301-0000-0041-5253-534f4654-0000',
            
            BOSCH_SERVICE_120C: '02a6c0d0-0451-4000-b000-fb3210111989',
            BOSCH_CHAR_120C: '02a6c0d1-0451-4000-b000-fb3210111989'
        };
    }

    /**
     * Prüft, ob Web Bluetooth in der aktuellen Umgebung verfügbar ist.
     */
    static isSupported() {
        return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth);
    }

    /**
     * Parst ein Leica DISTO Datagramm (IEEE 754 Little-Endian Float32 in Metern).
     * @param {DataView|ArrayBuffer|Buffer|Uint8Array} input 
     * @returns {number|null} Distanz in Metern auf 3 Nachkommastellen gerundet oder null
     */
    static parseLeicaData(input) {
        if (!input) return null;
        let dataView;
        if (input instanceof DataView) {
            dataView = input;
        } else if (input.buffer && input.buffer instanceof ArrayBuffer) {
            dataView = new DataView(input.buffer, input.byteOffset || 0, input.byteLength);
        } else if (input instanceof ArrayBuffer) {
            dataView = new DataView(input);
        } else {
            return null;
        }

        if (dataView.byteLength < 4) return null;
        const distanceMeters = dataView.getFloat32(0, true);
        if (Number.isFinite(distanceMeters) && distanceMeters > 0) {
            return Math.round(distanceMeters * 1000) / 1000;
        }
        return null;
    }

    /**
     * Parst ein Bosch MT-Protocol Datagramm (4-Byte Little Endian RawInt * 0.05 mm / 1000 = Meter).
     * Distanzwert liegt ab Byte-Offset 2.
     * @param {DataView|ArrayBuffer|Buffer|Uint8Array} input 
     * @returns {number|null} Distanz in Metern auf 3 Nachkommastellen gerundet oder null
     */
    static parseBoschData(input) {
        if (!input) return null;
        let dataView;
        if (input instanceof DataView) {
            dataView = input;
        } else if (input.buffer && input.buffer instanceof ArrayBuffer) {
            dataView = new DataView(input.buffer, input.byteOffset || 0, input.byteLength);
        } else if (input instanceof ArrayBuffer) {
            dataView = new DataView(input);
        } else {
            return null;
        }

        if (dataView.byteLength < 6) return null;
        const rawInt = dataView.getUint32(2, true);
        const mm = rawInt * 0.05;
        const distanceMeters = mm / 1000;
        if (Number.isFinite(distanceMeters) && distanceMeters > 0 && distanceMeters < 300) {
            return Math.round(distanceMeters * 1000) / 1000;
        }
        return null;
    }

    /**
     * Startet den Geräte-Kopplungsdialog (muss durch User-Interaktion ausgelöst werden).
     */
    async connectLaser() {
        if (!BluetoothLaserEngine.isSupported()) {
            const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
            if (isIOS) {
                throw new Error('iOS Safari unterstützt Web Bluetooth nicht. Bitte verwenden Sie Android Chrome, Edge oder eine BLE-fähige Browser-App (wie Bluefy auf iOS), oder tragen Sie die Werte manuell ein.');
            }
            throw new Error('Web Bluetooth wird von diesem Browser nicht unterstützt. Bitte verwenden Sie Google Chrome oder Microsoft Edge.');
        }

        this._updateStatus('SCANNING', 'Suche nach Leica DISTO und Bosch GLM Lasern...');

        try {
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'DISTO' },
                    { namePrefix: 'Bosch' },
                    { namePrefix: 'GLM' },
                    { services: [this.UUIDS.LEICA_SERVICE] },
                    { services: [this.UUIDS.BOSCH_SERVICE_50C] },
                    { services: [this.UUIDS.BOSCH_SERVICE_120C] }
                ],
                optionalServices: [
                    this.UUIDS.LEICA_SERVICE,
                    this.UUIDS.BOSCH_SERVICE_50C,
                    this.UUIDS.BOSCH_SERVICE_120C
                ]
            });

            this.device.addEventListener('gattserverdisconnected', () => this._handleDisconnect());

            this._updateStatus('CONNECTING', `Verbinde mit ${this.device.name}...`);
            this.server = await this.device.gatt.connect();

            await this._discoverAndSubscribe();

            this.isConnected = true;
            this._updateStatus('CONNECTED', `Verbunden mit ${this.device.name}`);
            return { success: true, deviceName: this.device.name, type: this.deviceType };

        } catch (err) {
            if (err.name === 'NotFoundError') {
                this._updateStatus('DISCONNECTED', 'Geräteauswahl abgebrochen.');
                const cancelErr = new Error('Verbindung abgebrochen: Es wurde kein Laser-Gerät ausgewählt.');
                cancelErr.name = 'UserCancelledError';
                throw cancelErr;
            }
            this._updateStatus('ERROR', err.message);
            throw err;
        }
    }

    async _discoverAndSubscribe() {
        // 1. Prüfe auf Leica DISTO Service
        try {
            const leicaService = await this.server.getPrimaryService(this.UUIDS.LEICA_SERVICE);
            if (leicaService) {
                this.deviceType = 'LEICA';
                const distChar = await leicaService.getCharacteristic(this.UUIDS.LEICA_DISTANCE_CHAR);
                await distChar.startNotifications();
                distChar.addEventListener('characteristicvaluechanged', (event) => this._handleLeicaData(event));
                console.log('[BluetoothLaser] Leica DISTO Benachrichtigungen aktiv.');
                return;
            }
        } catch (_e) { /* Kein Leica, weiter zu Bosch */ }

        // 2. Prüfe auf Bosch GLM 50 C
        try {
            const boschService = await this.server.getPrimaryService(this.UUIDS.BOSCH_SERVICE_50C);
            if (boschService) {
                this.deviceType = 'BOSCH';
                const boschChar = await boschService.getCharacteristic(this.UUIDS.BOSCH_CHAR_50C);
                await boschChar.startNotifications();
                boschChar.addEventListener('characteristicvaluechanged', (event) => this._handleBoschData(event));

                // AutoSync Startbefehl
                const startCmd = new Uint8Array([0xc0, 0x55, 0x02, 0x01, 0x00, 0x1a]);
                try {
                    await boschChar.writeValue(startCmd);
                } catch (wErr) {
                    console.warn('[BluetoothLaser] Bosch GLM Init-Kommando nicht angenommen:', wErr.message);
                }
                console.log('[BluetoothLaser] Bosch GLM 50 C Benachrichtigungen aktiv.');
                return;
            }
        } catch (_e) { /* Kein GLM 50 C */ }

        // 3. Prüfe auf Bosch GLM 120 C
        try {
            const bosch120 = await this.server.getPrimaryService(this.UUIDS.BOSCH_SERVICE_120C);
            if (bosch120) {
                this.deviceType = 'BOSCH';
                const char120 = await bosch120.getCharacteristic(this.UUIDS.BOSCH_CHAR_120C);
                await char120.startNotifications();
                char120.addEventListener('characteristicvaluechanged', (event) => this._handleBoschData(event));
                console.log('[BluetoothLaser] Bosch GLM 120 C Benachrichtigungen aktiv.');
                return;
            }
        } catch (finalErr) {
            throw new Error('GATT-Dienst für Laser-Distanzmessung konnte nicht initialisiert werden.');
        }
    }

    _handleLeicaData(event) {
        const val = BluetoothLaserEngine.parseLeicaData(event.target.value);
        if (val !== null) {
            this._dispatchMeasurement(val, 'm');
        }
    }

    _handleBoschData(event) {
        const val = BluetoothLaserEngine.parseBoschData(event.target.value);
        if (val !== null) {
            this._dispatchMeasurement(val, 'm');
        }
    }

    _dispatchMeasurement(val, unit) {
        // Haptisches Feedback
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate([40]); } catch (_e) { }
        }

        if (this.onMeasurementCallback) {
            this.onMeasurementCallback({ distance: val, unit, timestamp: Date.now() });
        }

        this._injectIntoActiveInput(val);
    }

    /**
     * Schreibt den Messwert in das aktive Formularfeld und rückt den Fokus automatisch weiter.
     */
    _injectIntoActiveInput(val) {
        if (typeof document === 'undefined') return;

        const active = document.activeElement;
        let targetInput = active;

        // Falls kein Eingabefeld fokussiert ist, erstes leeres .laser-input Feld suchen
        if (!targetInput || targetInput.tagName !== 'INPUT') {
            const emptyInput = document.querySelector('.laser-input:not([disabled])[value=""], .laser-input:not([disabled])');
            if (emptyInput) targetInput = emptyInput;
        }

        if (targetInput && (targetInput.tagName === 'INPUT' || targetInput.classList.contains('laser-input'))) {
            targetInput.value = val.toFixed(3);
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            targetInput.dispatchEvent(new Event('change', { bubbles: true }));

            // Nächstes Laser-Eingabefeld fokussieren
            const allInputs = Array.from(document.querySelectorAll('.laser-input:not([disabled])'));
            const currentIndex = allInputs.indexOf(targetInput);
            if (currentIndex >= 0 && currentIndex < allInputs.length - 1) {
                allInputs[currentIndex + 1].focus();
                allInputs[currentIndex + 1].select?.();
            }
        }
    }

    _handleDisconnect() {
        this.isConnected = false;
        this.server = null;
        this._updateStatus('DISCONNECTED', 'Verbindung zum Laser getrennt.');
    }

    disconnect() {
        if (this.device && this.device.gatt && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this._handleDisconnect();
    }

    _updateStatus(status, message) {
        if (this.onStatusChangeCallback) {
            this.onStatusChangeCallback({ status, message, isConnected: this.isConnected });
        }
    }
}

if (typeof window !== 'undefined') {
    window.BluetoothLaserEngine = BluetoothLaserEngine;
    window.bluetoothLaserEngine = new BluetoothLaserEngine();
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BluetoothLaserEngine;
}
