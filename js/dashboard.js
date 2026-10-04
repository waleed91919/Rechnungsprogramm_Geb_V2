// js/dashboard.js - Facade module for backward compatibility

if (typeof module !== 'undefined' && module.exports) {
    const kpi = typeof require !== 'undefined' ? require('./dashboard/dashboard-kpi') : window;
    const charts = typeof require !== 'undefined' ? require('./dashboard/dashboard-charts') : window;
    const table = typeof require !== 'undefined' ? require('./dashboard/dashboard-table') : window;
    const actions = typeof require !== 'undefined' ? require('./dashboard/dashboard-actions') : window;

    module.exports = {
        ...kpi,
        ...charts,
        ...table,
        ...actions
    };
}
