(function(global) {
global.calcSplitZeileFormula = calcSplitZeileFormula;
global.recalcSplitDetailTotal = recalcSplitDetailTotal;
global.calcAufmassZeileFormula = calcAufmassZeileFormula;
global.openFormelassistentModal = openFormelassistentModal;
global.closeFormelassistentModal = closeFormelassistentModal;
global.onFormelVorlageChange = onFormelVorlageChange;
global.onCustomFormulaInput = onCustomFormulaInput;
global.parseAndBuildParameterInputs = parseAndBuildParameterInputs;
global.recalcFormelassistentLive = recalcFormelassistentLive;
global.applyFormelassistentResult = applyFormelassistentResult;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calcSplitZeileFormula,
        recalcSplitDetailTotal,
        calcAufmassZeileFormula,
        openFormelassistentModal,
        closeFormelassistentModal,
        onFormelVorlageChange,
        onCustomFormulaInput,
        parseAndBuildParameterInputs,
        recalcFormelassistentLive,
        applyFormelassistentResult
    };
}
})(typeof window !== 'undefined' ? window : this);
