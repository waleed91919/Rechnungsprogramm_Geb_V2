const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const codeHtml = fs.readFileSync(path.join(__dirname, '../code.html'), 'utf8');
const dom = new JSDOM(codeHtml);
const document = dom.window.document;

// Find all elements that look like modals / overlays:
// Typically either id contains 'modal', or class contains 'fixed inset-0', or overlay.
// But we want TOP-LEVEL modal containers (not child elements inside a modal).

const allElements = document.querySelectorAll('*');
const modalRoots = [];

allElements.forEach(el => {
    const id = el.id || '';
    const cls = el.className || '';
    const isModalCandidate = (
        (typeof cls === 'string' && cls.includes('fixed') && cls.includes('inset-0')) ||
        id.endsWith('-modal') ||
        id.includes('modal-overlay') ||
        id === 'artikel-modal' ||
        id === 'kunde-modal' ||
        id === 'objekt-modal' ||
        id === 'email-modal' ||
        id === 'plan-modal' ||
        id === 'generierung-modal' ||
        id === 'sammel-modal' ||
        id === 'storno-lauf-modal' ||
        id === 'rechnung-modal' ||
        id === 'projekt-modal' ||
        id === 'pdf-preview-modal' ||
        id === 'steuerbericht-modal' ||
        id === 'restore-modal' ||
        id === 'extend-deadline-modal' ||
        id === 'mahnung-modal' ||
        id === 'help-modal' ||
        id === 'custom-confirm-modal' ||
        id === 'aufmass-modal'
    );

    if (isModalCandidate) {
        // Check if its parent or ancestor is already a modal candidate
        let parent = el.parentElement;
        let isChildOfModal = false;
        while (parent) {
            const pId = parent.id || '';
            const pCls = parent.className || '';
            if ((typeof pCls === 'string' && pCls.includes('fixed') && pCls.includes('inset-0')) ||
                pId.endsWith('-modal') || pId.includes('modal-overlay')) {
                isChildOfModal = true;
                break;
            }
            parent = parent.parentElement;
        }

        if (!isChildOfModal) {
            modalRoots.push(el);
        }
    }
});

console.log(`Found ${modalRoots.length} top-level modal candidates:\n`);

modalRoots.forEach((el, index) => {
    const id = el.id || '(no id)';
    const cls = (el.className || '').trim();
    // Count child elements and approximate HTML size
    const html = el.outerHTML;
    const lines = html.split('\n').length;
    console.log(`${index + 1}. [${id}] - ${lines} lines, ${html.length} chars, class: "${cls.substring(0, 60)}"`);
});
