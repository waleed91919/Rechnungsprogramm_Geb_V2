/**
 * controllers/IDSConnectController.js - Isomorpher Rechenkern & Parser für IDS Connect 2.5 & Open Masterdata
 * Standardkonforme Schnittstelle für Großhandels-Webshops (GC Gruppe, Richter+Frenzel, Sonepar, Rexel, Würth u.v.m.)
 */

class IDSConnectController {
    /**
     * Erstellt die vollständige Start-URL inklusive aller IDS 2.5 Parameter für den Webshop-Absprung.
     * @param {Object} konto - Großhandelskonto-Konfiguration aus ids_connect_konten
     * @param {Object} options - { action, hookUrl, sessionId, orderReference, itemNumber, csrfToken }
     * @returns {string} Vollständige HTTPS-URL mit Parametern
     */
    static buildLaunchUrl(konto, options = {}) {
        if (!konto || !konto.shop_url) {
            throw new Error('Ungültiges Großhandelskonto: Keine Shop-URL konfiguriert.');
        }

        const baseUrl = konto.shop_url.trim();
        const url = new URL(baseUrl);
        const params = url.searchParams;

        // IDS 2.5 Standard-Parameter (ITEK / BVBS / ZVSHK)
        params.set('ids_version', '2.5');
        params.set('ids_action', options.action || 'call');
        params.set('hookurl', options.hookUrl || 'http://127.0.0.1:49152/ids/callback');
        params.set('session_id', options.sessionId || `IDS-${Date.now()}`);

        if (konto.kundennummer) {
            params.set('customer_number', String(konto.kundennummer).trim());
        }
        if (options.orderReference) {
            params.set('order_reference', String(options.orderReference).trim());
        }
        if (options.itemNumber && (options.action === 'catalog_item' || options.action === 'deep_link')) {
            params.set('item_number', String(options.itemNumber).trim());
        }
        if (konto.api_key) {
            params.set('auth_token', String(konto.api_key).trim());
        }
        if (konto.benutzername) {
            params.set('user', String(konto.benutzername).trim());
        }
        if (options.csrfToken) {
            params.set('csrf_token', String(options.csrfToken).trim());
        }

        return url.toString();
    }

    /**
     * Parst eine IDS Connect 2.5 XML-Warenkorbdatei und extrahiert standardisierte Positionen.
     * @param {string} xmlString - Der rohe XML-String des Shopping-Carts
     * @returns {Object} { header, items, totalNetAmount, itemCount }
     */
    static parseShoppingCartXml(xmlString) {
        if (!xmlString || typeof xmlString !== 'string' || xmlString.trim().length === 0) {
            throw new Error('Ungültiger oder leerer Shopping-Cart XML-Inhalt.');
        }

        const header = {
            supplierId: this._extractTag(xmlString, 'supplier_id') || 'GROSSHANDEL',
            customerNumber: this._extractTag(xmlString, 'customer_number') || '',
            cartId: this._extractTag(xmlString, 'cart_id') || `CART-${Date.now()}`,
            cartDate: this._extractTag(xmlString, 'cart_date') || new Date().toISOString(),
            currency: this._extractTag(xmlString, 'currency') || 'EUR',
            totalNetAmount: parseFloat(this._extractTag(xmlString, 'total_net_amount')) || 0,
            orderReference: this._extractTag(xmlString, 'order_reference') || ''
        };

        const items = [];
        const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
        let itemMatch;

        while ((itemMatch = itemRegex.exec(xmlString)) !== null) {
            const itemXml = itemMatch[1];
            
            const quantity = parseFloat(this._extractTag(itemXml, 'quantity')) || 1.0;
            const priceBasis = parseFloat(this._extractTag(itemXml, 'price_basis')) || 1.0;
            const grossPriceRaw = parseFloat(this._extractTag(itemXml, 'gross_price')) || 0.0;
            const netPriceRaw = parseFloat(this._extractTag(itemXml, 'net_price')) || 0.0;
            
            // Berechnung der Einzelpreise je Mengeneinheit unter Berücksichtigung der Preisbasis (1, 10, 100, 1000)
            const divisor = priceBasis > 0 ? priceBasis : 1.0;
            const grossPrice = Math.round((grossPriceRaw / divisor) * 10000) / 10000;
            const netPrice = Math.round((netPriceRaw / divisor) * 10000) / 10000;
            const posNetTotal = Math.round((quantity * netPrice) * 100) / 100;

            // Extraktion von verknüpften Dokumenten (Sicherheitsdatenblätter, Montageanleitungen, CAD)
            const documents = [];
            const docRegex = /<document\b[^>]*\btype="([^"]*)"[^>]*\btitle="([^"]*)"[^>]*>([\s\S]*?)<\/document>/gi;
            let docMatch;
            while ((docMatch = docRegex.exec(itemXml)) !== null) {
                documents.push({
                    type: docMatch[1] || 'DOC',
                    title: docMatch[2] || 'Dokument',
                    url: docMatch[3].trim()
                });
            }

            // Fallback für Dokumente ohne explizite Attribute oder mit abweichender Attributreihenfolge
            if (documents.length === 0) {
                const altDocRegex = /<document\b([^>]*)>([\s\S]*?)<\/document>/gi;
                let altMatch;
                while ((altMatch = altDocRegex.exec(itemXml)) !== null) {
                    const attrs = altMatch[1];
                    const docUrl = altMatch[2].trim();
                    const typeMatch = attrs.match(/type="([^"]*)"/i);
                    const titleMatch = attrs.match(/title="([^"]*)"/i);
                    documents.push({
                        type: typeMatch ? typeMatch[1] : 'DOC',
                        title: titleMatch ? titleMatch[1] : 'Dokument',
                        url: docUrl
                    });
                }
            }

            items.push({
                supplierItemNumber: this._extractTag(itemXml, 'supplier_item_number') || '',
                manufacturerItemNumber: this._extractTag(itemXml, 'manufacturer_item_number') || '',
                ean: this._extractTag(itemXml, 'ean') || this._extractTag(itemXml, 'gtin') || '',
                shortDescription: this._extractTag(itemXml, 'short_description') || 'Unbekannter Großhandelsartikel',
                longDescription: this._extractTag(itemXml, 'long_description') || '',
                quantity,
                quantityUnit: this._extractTag(itemXml, 'quantity_unit') || 'Stk',
                priceBasis: divisor,
                grossPriceRaw,
                netPriceRaw,
                grossPrice,
                netPrice,
                posNetTotal,
                discountGroup: this._extractTag(itemXml, 'discount_group') || '',
                taxRate: parseFloat(this._extractTag(itemXml, 'tax_rate')) || 19.0,
                deliveryTimeDays: parseInt(this._extractTag(itemXml, 'delivery_time_days'), 10) || 1,
                availabilityStatus: this._extractTag(itemXml, 'availability_status') || 'IN_STOCK',
                imageUrl: this._extractTag(itemXml, 'image_url') || null,
                documents
            });
        }

        const calculatedNetTotal = items.reduce((sum, it) => sum + it.posNetTotal, 0);

        return {
            header,
            items,
            totalNetAmount: header.totalNetAmount > 0 ? header.totalNetAmount : Math.round(calculatedNetTotal * 100) / 100,
            itemCount: items.length
        };
    }

    /**
     * Erzeugt eine IDS 2.5 konforme Shopping-Cart Export-XML für die Übergabe an den Webshop.
     * @param {Array} positionen - Liste der ERP-Positionen
     * @param {Object} options - { customerNumber, orderReference, supplierId }
     * @returns {string} XML-String
     */
    static generateCartExportXml(positionen = [], options = {}) {
        const dateStr = new Date().toISOString();
        let itemsXml = '';

        positionen.forEach((pos, idx) => {
            const menge = parseFloat(pos.menge || pos.quantity) || 1.0;
            const ek = parseFloat(pos.ek || pos.netPrice || pos.preis) || 0.0;
            const gross = parseFloat(pos.vk || pos.grossPrice || pos.preis) || ek;
            const tax = parseFloat(pos.mwst || pos.taxRate || 19.0) || 19.0;
            const ean = pos.ean || '';
            const artNr = pos.artikel_nr || pos.artikelNr || pos.supplierItemNumber || '';
            const name = pos.name || pos.shortDescription || `Position ${idx + 1}`;

            itemsXml += `
    <item id="${idx + 1}">
      <supplier_item_number>${this._escapeXml(artNr)}</supplier_item_number>
      <ean>${this._escapeXml(ean)}</ean>
      <short_description>${this._escapeXml(name)}</short_description>
      <quantity>${menge.toFixed(3)}</quantity>
      <quantity_unit>${this._escapeXml(pos.einheit || pos.quantityUnit || 'Stk')}</quantity_unit>
      <price_basis>1</price_basis>
      <gross_price>${gross.toFixed(2)}</gross_price>
      <net_price>${ek.toFixed(2)}</net_price>
      <tax_rate>${tax.toFixed(2)}</tax_rate>
    </item>`;
        });

        return `<?xml version="1.0" encoding="UTF-8"?>
<shopping_cart version="2.5" xmlns="http://www.itek.de/idsconnect/2.5">
  <header>
    <supplier_id>${this._escapeXml(options.supplierId || 'WLINK_ERP')}</supplier_id>
    <customer_number>${this._escapeXml(options.customerNumber || '')}</customer_number>
    <cart_id>EXP-${Date.now()}</cart_id>
    <cart_date>${dateStr}</cart_date>
    <currency>EUR</currency>
    <order_reference>${this._escapeXml(options.orderReference || '')}</order_reference>
  </header>
  <items>${itemsXml}
  </items>
</shopping_cart>`;
    }

    /**
     * Parst eine Open Masterdata JSON-Antwort (modernes REST-Format).
     * @param {Object} jsonResponse - Open Masterdata REST API JSON Payload
     * @returns {Array<Object>} Standardisierte Artikelliste
     */
    static parseOpenMasterdataResponse(jsonResponse) {
        if (!jsonResponse) return [];

        const articles = Array.isArray(jsonResponse)
            ? jsonResponse
            : (Array.isArray(jsonResponse.articles) ? jsonResponse.articles : (Array.isArray(jsonResponse.items) ? jsonResponse.items : []));

        return articles.map(art => {
            const netPrice = parseFloat(art.priceNet || art.ek || art.net_price || art.price) || 0.0;
            const grossPrice = parseFloat(art.priceGross || art.vk || art.gross_price) || (netPrice * 1.3);
            const deliveryDays = parseInt(art.deliveryDays || art.delivery_time_days || art.leadTime, 10) || 1;

            let imageUrl = null;
            if (art.images && art.images.length > 0) {
                imageUrl = typeof art.images[0] === 'string' ? art.images[0] : (art.images[0].url || art.images[0].href || null);
            } else if (art.imageUrl || art.image_url) {
                imageUrl = art.imageUrl || art.image_url;
            }

            const rawAttachments = art.attachments || art.documents || [];
            const documents = rawAttachments.map(att => ({
                type: att.type || att.category || 'DOC',
                title: att.title || att.name || 'Dokument',
                url: att.url || att.href || ''
            })).filter(d => !!d.url);

            return {
                supplierItemNumber: String(art.articleId || art.itemNumber || art.supplierItemNumber || art.id || ''),
                manufacturerItemNumber: String(art.manufacturerArticleId || art.manufacturerItemNumber || ''),
                ean: String(art.gtin || art.ean || ''),
                shortDescription: String(art.description1 || art.name || art.shortDescription || 'Großhandelsartikel'),
                longDescription: String(art.description2 || art.longDescription || art.description || ''),
                quantity: parseFloat(art.quantity || art.packQuantity) || 1.0,
                quantityUnit: String(art.unit || art.quantityUnit || 'Stk'),
                grossPrice,
                netPrice,
                posNetTotal: Math.round(netPrice * 100) / 100,
                availabilityStatus: art.stockStatus || (art.inStock ? 'IN_STOCK' : 'AVAILABLE'),
                deliveryTimeDays: deliveryDays,
                imageUrl,
                documents
            };
        });
    }

    /**
     * Berechnet Verkaufspreis, Rohgewinn und Marge aus Handwerker-EK (HEK) und Aufschlag.
     * @param {number} netEk - Handwerker-Einkaufspreis (Netto-EK)
     * @param {number} standardAufschlagProzent - Kalkulationsaufschlag (z.B. 25.0 %)
     * @param {number} mwstProzent - Steuersatz (z.B. 19.0 %)
     */
    static calculateCalculatedPrices(netEk, standardAufschlagProzent = 25.0, mwstProzent = 19.0) {
        const ek = Math.max(0, parseFloat(netEk) || 0);
        const aufschlag = parseFloat(standardAufschlagProzent) || 0;
        const mwst = parseFloat(mwstProzent) || 19.0;

        const vkNetto = Math.round(ek * (1 + aufschlag / 100) * 100) / 100;
        const vkBrutto = Math.round(vkNetto * (1 + mwst / 100) * 100) / 100;
        const margeEur = Math.round((vkNetto - ek) * 100) / 100;
        const aufschlagEffektiv = ek > 0 ? Math.round(((vkNetto - ek) / ek) * 10000) / 100 : 0;

        return {
            netEk: ek,
            vkNetto,
            vkBrutto,
            margeEur,
            aufschlagProzent: aufschlagEffektiv
        };
    }

    static _extractTag(xml, tagName) {
        if (!xml || typeof xml !== 'string') return null;
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
        const match = regex.exec(xml);
        return match ? match[1].trim() : null;
    }

    static _escapeXml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = IDSConnectController;
} else {
    window.IDSConnectController = IDSConnectController;
}
