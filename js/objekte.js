
if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    const tree = require('./objekte/objekte-tree.js');
    const form = require('./objekte/objekte-form.js');
    const detail = require('./objekte/objekte-detail.js');
    const imp = require('./objekte/objekte-import.js');
    module.exports = { ...tree, ...form, ...detail, ...imp };
}
