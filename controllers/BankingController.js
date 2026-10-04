// Fassade für BankingController
const StatementParser = typeof require !== 'undefined' ? require('./banking/statement-parser') : window.StatementParser;
const OposMatching = typeof require !== 'undefined' ? require('./banking/opos-matching') : window.OposMatching;
const InterestCalculator = typeof require !== 'undefined' ? require('./banking/interest-calculator') : window.InterestCalculator;
const BankingUtils = typeof require !== 'undefined' ? require('./banking/banking-utils') : window.BankingUtils;

const BankingController = {
    get BASE_INTEREST_RATES() { return InterestCalculator.BASE_INTEREST_RATES; },
    get CURRENT_BASE_RATE() { return InterestCalculator.CURRENT_BASE_RATE; },

    parseCamt053(...args) {
        return StatementParser.parseCamt053.apply(this, args);
    },

    parseMt940(...args) {
        return StatementParser.parseMt940.apply(this, args);
    },

    parseCsvStatement(...args) {
        return StatementParser.parseCsvStatement.apply(this, args);
    },

    _splitCsvLine(...args) {
        return StatementParser._splitCsvLine.apply(this, args);
    },

    _detectDelimiter(...args) {
        return StatementParser._detectDelimiter.apply(this, args);
    },

    _detectCsvProfile(...args) {
        return StatementParser._detectCsvProfile.apply(this, args);
    },

    detectEncodingProblem(...args) {
        return StatementParser.detectEncodingProblem.apply(this, args);
    },

    matchTransaction(...args) {
        return OposMatching.matchTransaction.apply(this, args);
    },

    matchTransactionsAgainstOpos(...args) {
        return OposMatching.matchTransactionsAgainstOpos.apply(this, args);
    },

    _matchesNumberVariant(...args) {
        return OposMatching._matchesNumberVariant.apply(this, args);
    },

    _isDateWithinDays(...args) {
        return OposMatching._isDateWithinDays.apply(this, args);
    },

    getBaseRateForDate(...args) {
        return InterestCalculator.getBaseRateForDate.apply(this, args);
    },

    calculateDefaultInterest(...args) {
        return InterestCalculator.calculateDefaultInterest.apply(this, args);
    },

    calculateLatePaymentFee(...args) {
        return InterestCalculator.calculateLatePaymentFee.apply(this, args);
    },

    calculateMahnungClaims(...args) {
        return InterestCalculator.calculateMahnungClaims.apply(this, args);
    },

    getVobPaymentTermDays(...args) {
        return InterestCalculator.getVobPaymentTermDays.apply(this, args);
    },

    calculateVobDueDate(...args) {
        return InterestCalculator.calculateVobDueDate.apply(this, args);
    },

    checkInvoiceDefaultStatus(...args) {
        return InterestCalculator.checkInvoiceDefaultStatus.apply(this, args);
    },

    calculateTransactionHash(...args) {
        return BankingUtils.calculateTransactionHash.apply(this, args);
    },

    validateIban(...args) {
        return BankingUtils.validateIban.apply(this, args);
    },

    _sha256(...args) {
        return BankingUtils._sha256.apply(this, args);
    },

    _sha256Js(...args) {
        return BankingUtils._sha256Js.apply(this, args);
    },

    _cleanText(...args) {
        return BankingUtils._cleanText.apply(this, args);
    },

    _cleanIban(...args) {
        return BankingUtils._cleanIban.apply(this, args);
    },

    _cleanBic(...args) {
        return BankingUtils._cleanBic.apply(this, args);
    },

    _parseGermanAmount(...args) {
        return BankingUtils._parseGermanAmount.apply(this, args);
    },

    _parseDate(...args) {
        return BankingUtils._parseDate.apply(this, args);
    },

};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BankingController;
}
if (typeof window !== 'undefined') {
    window.BankingController = BankingController;
}
