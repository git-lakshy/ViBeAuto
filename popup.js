document.addEventListener('DOMContentLoaded', () => {
    const geminiKeyInput = document.getElementById('geminiApiKey');
    const groqKeyInput = document.getElementById('groqApiKey');
    const modelChoiceInput = document.getElementById('modelChoice');
    const saveBtn = document.getElementById('saveKeyBtn');
    const toggleAutoBtn = document.getElementById('toggleAutoBtn');
    const saveStatus = document.getElementById('saveStatus');

    // Load saved data
    chrome.storage.local.get(['geminiApiKey', 'groqApiKey', 'modelChoice', 'autoEnabled'], (result) => {
        if (result.geminiApiKey) geminiKeyInput.value = result.geminiApiKey;
        if (result.groqApiKey) groqKeyInput.value = result.groqApiKey;
        if (result.modelChoice) modelChoiceInput.value = result.modelChoice;
        updateToggleBtn(result.autoEnabled);
    });

    // Save Settings
    saveBtn.addEventListener('click', () => {
        chrome.storage.local.set({ 
            geminiApiKey: geminiKeyInput.value,
            groqApiKey: groqKeyInput.value,
            modelChoice: modelChoiceInput.value
        }, () => {
            saveStatus.style.display = 'block';
            setTimeout(() => saveStatus.style.display = 'none', 2000);
        });
    });

    // Toggle automation
    toggleAutoBtn.addEventListener('click', () => {
        chrome.storage.local.get(['autoEnabled'], (result) => {
            const newState = !result.autoEnabled;
            chrome.storage.local.set({ autoEnabled: newState }, () => {
                updateToggleBtn(newState);
            });
        });
    });

    function updateToggleBtn(isEnabled) {
        if (isEnabled) {
            toggleAutoBtn.innerText = 'Automation: ON';
            toggleAutoBtn.style.backgroundColor = '#d4edda';
            toggleAutoBtn.style.color = '#155724';
        } else {
            toggleAutoBtn.innerText = 'Automation: OFF';
            toggleAutoBtn.style.backgroundColor = '#f8d7da';
            toggleAutoBtn.style.color = '#721c24';
        }
    }
});
