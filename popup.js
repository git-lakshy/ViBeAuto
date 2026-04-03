document.addEventListener('DOMContentLoaded', () => {
    const getEl = (id) => document.getElementById(id);
    const geminiKeyInput = getEl('geminiApiKey');
    const groqKeyInput = getEl('groqApiKey');
    const modelChoiceInput = getEl('modelChoice');
    const saveKeyBtn = getEl('saveKeyBtn');
    const toggleAutoBtn = getEl('toggleAutoBtn');
    const toggleVCamBtn = getEl('toggleVCamBtn');
    const vcamFileSection = getEl('vcamGallerySection');
    const vcamFileInput = getEl('vcamFileInput');
    const vcamFileNameDisplay = getEl('vcamFileName');
    const deleteVcamBtn = getEl('deleteVcamBtn');
    const vidSpeedInput = getEl('vidSpeed');
    const toggleSpeedBtn = getEl('toggleSpeedBtn');
    const saveStatus = getEl('saveStatus');

    // State Management Utilities
    const updateBtn = (btn, text, isEnabled, showEl) => {
        btn.innerText = text + (isEnabled ? ': ON' : ': OFF');
        btn.style.backgroundColor = isEnabled ? '#d4edda' : '#eee';
        btn.style.color = isEnabled ? '#155724' : '#333';
        if (showEl) showEl.style.display = isEnabled ? 'block' : 'none';
    };

    const updateSpeedBtn = (isEnabled) => {
        toggleSpeedBtn.innerText = isEnabled ? 'ON' : 'OFF';
        toggleSpeedBtn.style.backgroundColor = isEnabled ? '#d4edda' : '#eee';
        toggleSpeedBtn.style.color = isEnabled ? '#155724' : '#333';
    };

    // Load saved data
    chrome.storage.local.get(['geminiApiKey', 'groqApiKey', 'modelChoice', 'autoEnabled', 'vcamEnabled', 'vcamFileName', 'vidSpeed', 'speedEnabled'], (res) => {
        if (res.geminiApiKey) geminiKeyInput.value = res.geminiApiKey;
        if (res.groqApiKey) groqKeyInput.value = res.groqApiKey;
        if (res.modelChoice) modelChoiceInput.value = res.modelChoice;
        if (res.vcamFileName) {
            vcamFileNameDisplay.innerText = res.vcamFileName;
            deleteVcamBtn.style.display = 'inline-block';
        }
        
        vidSpeedInput.value = res.vidSpeed || 11;
        if (res.vidSpeed === undefined) chrome.storage.local.set({ vidSpeed: 11 });

        updateBtn(toggleAutoBtn, 'Automation', res.autoEnabled);
        updateBtn(toggleVCamBtn, 'VCam', res.vcamEnabled, vcamFileSection);
        updateSpeedBtn(res.speedEnabled);
    });

    // Event Listeners
    saveKeyBtn.addEventListener('click', () => {
        chrome.storage.local.set({ 
            geminiApiKey: geminiKeyInput.value.trim(), 
            groqApiKey: groqKeyInput.value.trim(), 
            modelChoice: modelChoiceInput.value 
        }, () => {
            saveStatus.style.display = 'block';
            setTimeout(() => saveStatus.style.display = 'none', 2000);
        });
    });

    toggleAutoBtn.addEventListener('click', () => {
        chrome.storage.local.get(['autoEnabled'], (res) => {
            const next = !res.autoEnabled;
            chrome.storage.local.set({ autoEnabled: next });
            updateBtn(toggleAutoBtn, 'Automation', next);
        });
    });

    toggleSpeedBtn.addEventListener('click', () => {
        chrome.storage.local.get(['speedEnabled'], (res) => {
            const next = !res.speedEnabled;
            chrome.storage.local.set({ speedEnabled: next });
            updateSpeedBtn(next);
        });
    });

    vidSpeedInput.addEventListener('change', () => {
        chrome.storage.local.set({ vidSpeed: vidSpeedInput.value });
    });

    toggleVCamBtn.addEventListener('click', () => {
        chrome.storage.local.get(['vcamEnabled'], (res) => {
            const next = !res.vcamEnabled;
            chrome.storage.local.set({ vcamEnabled: next });
            updateBtn(toggleVCamBtn, 'VCam', next, vcamFileSection);
        });
    });

    deleteVcamBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.storage.local.set({ vcamSource: null, vcamFileName: null }, () => {
            vcamFileNameDisplay.innerText = 'No video selected';
            deleteVcamBtn.style.display = 'none';
        });
    });

    vcamFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('video/')) {
                alert("Please select a video file. images are not supported for custom upload.");
                return;
            }
            vcamFileNameDisplay.innerText = file.name;
            deleteVcamBtn.style.display = 'inline-block';
            const reader = new FileReader();
            reader.onload = (ev) => chrome.storage.local.set({ vcamSource: ev.target.result, vcamFileName: file.name });
            reader.readAsDataURL(file);
        }
    });
});
