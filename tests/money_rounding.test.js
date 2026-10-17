/**
 * money_rounding.test.js - SSoT-Verifikation (EN 16931, js/money.js).
 * Alle Rechner müssen bitidentisch zu Money runden.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Money = require('../js/money');
const InvoiceController = require('../controllers/InvoiceController');
const AngebotController = require('../controllers/AngebotController');
const CumulativeBillingController = require('../controllers/CumulativeBillingController');

describe('Money SSoT (EN 16931)', () => {
    it('rundet Binär-Grenzfälle kaufmännisch (EPSILON)', () => {
        assert.equal(Money.round2(2.675), 2.68);
        assert.equal(Money.round2(1.005), 1.01);
        assert.equal(Money.round2(0.615), 0.62);
    });

    it('nicht-finite Werte -> 0', () => {
        assert.equal(Money.round2(undefined), 0);
        assert.equal(Money.round2(null), 0);
        assert.equal(Money.round2('abc'), 0);
    });

    it('percent/taxFor je Bucket', () => {
        assert.equal(Money.percent(1000, 5), 50);
        assert.equal(Money.percent(1000, 10), 100);
        assert.equal(Money.taxFor(100, 19), 19);
        assert.equal(Money.taxFor(100, 19, true), 0);
        assert.equal(Money.taxFor(100, 0), 0);
    });

    it('toDatev fixt den toFixed-Binärfehler', () => {
        assert.equal(Money.toDatev(2.675), '2,68');
        assert.equal(Money.toDatev(-1190), '1190,00');
        assert.equal(Money.toDatev(50), '50,00');
    });

    it('InvoiceController/AngebotController delegieren bitidentisch', () => {
        for (const v of [2.675, 1.005, 10.225, 100.455, 0.615, 19.99]) {
            assert.equal(InvoiceController.round2(v), Money.round2(v), `Invoice ${v}`);
            assert.equal(AngebotController.round2(v), Money.round2(v), `Angebot ${v}`);
        }
    });

    it('EInvoiceViewer delegiert bitidentisch (XML-Pfad)', () => {
        const V = require('../js/einvoice/einvoice-viewer');
        for (const v of [2.675, 1.005, 10.225, 100.455]) {
            assert.equal(V.round2(v), Money.round2(v), `Viewer ${v}`);
        }
    });

    it('CumulativeBilling: VOB-Kennzahlen konsistent (WARRANTY 5%)', () => {
        const r = CumulativeBillingController.calculateCumulativeInvoice({
            totalPerformanceNet: 1000,
            previousInvoices: [],
            securityRetentionRate: 5,
            vatRate: 19,
            retentionMode: 'WARRANTY'
        });
        assert.equal(r.totalRetentionTarget, 50);
        assert.equal(r.securityRetentionAmount, 50);
        assert.equal(r.currentPeriodNet, 1000);
        assert.equal(r.currentPeriodVat, 190);
        assert.equal(r.currentPeriodGross, 1190);
        assert.equal(r.netPayableAmount, 1140);
    });

    it('CumulativeBilling: intern gerundet == ausgegeben (kein 0,01-Drift)', () => {
        const r = CumulativeBillingController.calculateCumulativeInvoice({
            totalPerformanceNet: 1000.005,
            previousInvoices: [{ netto: 333.335, sicherheitseinbehalt: 16.665 }],
            securityRetentionRate: 5,
            vatRate: 19,
            retentionMode: 'WARRANTY'
        });
        // Rückgabe ist immer auf 2 NK gerundet
        for (const k of ['totalPerformanceNet', 'totalPreviousBilledNet', 'currentPeriodNet',
            'currentPeriodGross', 'totalRetentionTarget', 'previousRetentionTotal',
            'securityRetentionAmount', 'netPayableAmount']) {
            assert.equal(r[k], Money.round2(r[k]), `${k} nicht centgenau`);
        }
        // Brutto = Netto + MwSt (auf gerundeten Werten)
        assert.equal(r.currentPeriodGross, Money.round2(r.currentPeriodNet + r.currentPeriodVat));
    });

    it('project-calculations nutzt SSoT', () => {
        const { calculateProjektUmsatz } = require('../js/projects/project-calculations');
        assert.equal(calculateProjektUmsatz([]), 0);
        assert.equal(calculateProjektUmsatz([{ netto: 100.455, status: 'Offen' }]), 100.46);
        assert.equal(
            calculateProjektUmsatz([{ netto: '10.005', status: 'Offen' }, { netto: '20.005', status: 'Offen' }]),
            30.01
        );
    });
});
