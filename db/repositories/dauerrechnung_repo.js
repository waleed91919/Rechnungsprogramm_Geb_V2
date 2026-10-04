/**
 * Dauerrechnung Repository
 * Abrechnungspläne, periodische Rechnungsläufe, Sammelrechnungen (F2)
 */

const createPlanCrudRepo = require('./dauerrechnung/plan_crud_repo');
const createGenerationRepo = require('./dauerrechnung/generation_repo');
const createSammelrechnungRepo = require('./dauerrechnung/sammelrechnung_repo');
const createStornoRepo = require('./dauerrechnung/storno_repo');

function createDauerrechnungRepo(deps) {
    const repo = {};

    const planCrudRepo = createPlanCrudRepo(deps);
    const generationRepo = createGenerationRepo(deps);
    const sammelrechnungRepo = createSammelrechnungRepo(deps);
    const stornoRepo = createStornoRepo(deps);

    // Merge methods simply to allow outer mixins to bind `this`
    Object.assign(repo, planCrudRepo, generationRepo, sammelrechnungRepo, stornoRepo);

    // Explicitly add requested aliases for the issue
    if (repo.erzeugeRechnungAusLauf) {
        repo.erstelleDauerrechnungLauf = repo.erzeugeRechnungAusLauf;
    }
    if (repo.erzeugeSammelrechnung) {
        repo.erstelleSammelrechnungLauf = repo.erzeugeSammelrechnung;
    }
    if (repo.storniereLauf) {
        repo.storniereDauerrechnungLauf = repo.storniereLauf;
    }

    return repo;
}

module.exports = createDauerrechnungRepo;
