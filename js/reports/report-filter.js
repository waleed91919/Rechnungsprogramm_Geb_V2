// Modul: report-filter.js
// extracted from js/berichte.js

(function() {
    function initBerichte() {
        renderBerichte();
        
        // Close dropdown when clicking outside
        window.addEventListener('click', function(e) {
            const dropdown = document.getElementById('report-filter-dropdown');
            const trigger = dropdown ? dropdown.previousElementSibling : null;
            if (dropdown && !dropdown.contains(e.target) && !trigger.contains(e.target)) {
                dropdown.classList.add('hidden');
                const arrow = document.getElementById('report-filter-arrow');
                if (arrow) arrow.style.transform = 'rotate(0deg)';
            }
        });
    }

    /**
     * Custom Dropdown Logic
     */
    function toggleReportFilterDropdown() {
        const dropdown = document.getElementById('report-filter-dropdown');
        const arrow = document.getElementById('report-filter-arrow');
        if (!dropdown) return;
        
        const isHidden = dropdown.classList.toggle('hidden');
        if (arrow) {
            arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    }

    function selectReportFilter(val, label) {
        const hiddenSelect = document.getElementById('report-time-filter');
        const labelEl = document.getElementById('report-time-filter-label');
        const dropdown = document.getElementById('report-filter-dropdown');
        const arrow = document.getElementById('report-filter-arrow');
        
        if (hiddenSelect) {
            hiddenSelect.value = val;
            // Manually trigger the onchange logic
            handleReportTimeFilterChange();
        }
        
        if (labelEl) labelEl.innerText = label;
        if (dropdown) dropdown.classList.add('hidden');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
        
        // Update active state in dropdown UI
        if (dropdown) {
            const buttons = dropdown.querySelectorAll('button');
            buttons.forEach(btn => {
                if (btn.innerText === label) {
                    btn.classList.add('font-semibold', 'bg-blue-50/30');
                } else {
                    btn.classList.remove('font-semibold', 'bg-blue-50/30');
                }
            });
        }
    }

    function handleReportTimeFilterChange() {
        const val = document.getElementById('report-time-filter').value;
        const customDiv = document.getElementById('report-custom-dates');
        if (val === 'custom') {
            customDiv.classList.remove('hidden');
        } else {
            customDiv.classList.add('hidden');
            renderBerichte();
        }
    }

    function getFilteredRechnungen() {
        if (!state.rechnungen) return [];
    
        const bezahlte = getBezahlteUndStornierteRechnungen(state.rechnungen);
    
        const filterSelect = document.getElementById('report-time-filter');
        if (!filterSelect) return bezahlte;
    
        const val = filterSelect.value;
        const today = new Date();
    
        return bezahlte.filter(r => {
            const d = new Date(r.datum);
            switch (val) {
                case 'this_month':
                    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
                case 'last_month':
                    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
                case 'this_quarter':
                    const q = Math.floor(today.getMonth() / 3);
                    const rq = Math.floor(d.getMonth() / 3);
                    return q === rq && d.getFullYear() === today.getFullYear();
                case 'this_year':
                    return d.getFullYear() === today.getFullYear();
                case 'last_year':
                    return d.getFullYear() === today.getFullYear() - 1;
                case 'custom':
                    const from = document.getElementById('report-date-from').value;
                    const to = document.getElementById('report-date-to').value;
                    if (from && d < new Date(from)) return false;
                    if (to) {
                        const toDate = new Date(to);
                        toDate.setHours(23, 59, 59);
                        if (d > toDate) return false;
                    }
                    return true;
                case 'all_time':
                default:
                    return true;
            }
        });
    }

    function getReportPeriodText() {
        const filterSelect = document.getElementById("report-time-filter");
        if (!filterSelect) return "";
        return filterSelect.options[filterSelect.selectedIndex].text;
    }

    // Exports
    window.initBerichte = initBerichte;
    window.toggleReportFilterDropdown = toggleReportFilterDropdown;
    window.selectReportFilter = selectReportFilter;
    window.handleReportTimeFilterChange = handleReportTimeFilterChange;
    window.getFilteredRechnungen = getFilteredRechnungen;
    window.getReportPeriodText = getReportPeriodText;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports.initBerichte = initBerichte;
        module.exports.toggleReportFilterDropdown = toggleReportFilterDropdown;
        module.exports.selectReportFilter = selectReportFilter;
        module.exports.handleReportTimeFilterChange = handleReportTimeFilterChange;
        module.exports.getFilteredRechnungen = getFilteredRechnungen;
        module.exports.getReportPeriodText = getReportPeriodText;
    }
})();
