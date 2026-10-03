/**
 * schema.js - Database Schema Definition, Migrations & Default Seeding
 * (Facade for backwards compatibility)
 */
const {
    createSchema,
    runMigrations,
    seedDefaultData,
    ensureUniqueConstraints,
    ensureGoBDSchemaAndTriggers,
    dedupeDuplicateDocumentNumbers,
    dedupeDuplicateVerrechnungen,
    dedupeDuplicateRetentions,
    initGaebSchema,
    runGaebMigrations
} = require('./db/schema/index');

module.exports = {
    createSchema,
    runMigrations,
    seedDefaultData,
    ensureUniqueConstraints,
    ensureGoBDSchemaAndTriggers,
    dedupeDuplicateDocumentNumbers,
    dedupeDuplicateVerrechnungen,
    dedupeDuplicateRetentions,
    initGaebSchema,
    runGaebMigrations
};
