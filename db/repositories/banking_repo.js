/**
 * Banking & SEPA Repository (Facade)
 * Delegates to modularized repositories in db/repositories/banking/
 */
const createAccountsRepo = require('./banking/accounts_repo');
const createTransactionsRepo = require('./banking/transactions_repo');
const createReconciliationRepo = require('./banking/reconciliation_repo');
const createSepaRepo = require('./banking/sepa_repo');

function createBankingRepo(deps) {
    const accounts = createAccountsRepo(deps);
    const transactions = createTransactionsRepo(deps);
    const reconciliation = createReconciliationRepo(deps);
    const sepa = createSepaRepo(deps);

    return {
        ...accounts,
        ...transactions,
        ...reconciliation,
        ...sepa
    };
}

module.exports = createBankingRepo;
