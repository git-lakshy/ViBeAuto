// Inject Camera Virtualization Patch
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    const vcamScript = document.createElement('script');
    vcamScript.id = 'vibe-vcam-patch';
    vcamScript.src = chrome.runtime.getURL('camera_patch.js');
    vcamScript.dataset.defaultUrl = chrome.runtime.getURL('default.jpg');
    vcamScript.onload = () => vcamScript.remove();
    (document.head || document.documentElement).appendChild(vcamScript);
}

let loopInterval = null;
let isProcessingQuiz = false;
let forcedVideoSpeed = 1.0;
let rateLimitCounter = 0;

// Initialize and Start Feature Enforcement
chrome.storage.local.get(['autoEnabled', 'vcamEnabled', 'vcamSource', 'vidSpeed', 'speedEnabled'], (res) => {
    forcedVideoSpeed = parseFloat(res.vidSpeed || 11);
    
    // Constant enforcement loop
    setInterval(() => {
        chrome.storage.local.get(['speedEnabled', 'autoEnabled'], (s) => {
            if (s.speedEnabled || s.autoEnabled) enforceVideoFeatures(s.speedEnabled);
        });
    }, 200);

    // Manual Pause Detection: If user clicks the video, mark it
    document.addEventListener('click', (e) => {
        if (e.target.tagName === 'VIDEO') {
            e.target.dataset.vibeManualPause = e.target.paused ? "" : "true";
        }
    }, true);

    if (window.location.hostname === 'vibe.vicharanashala.ai') {
        if (res.vcamEnabled) updateVCam(true, res.vcamSource);
        if (res.autoEnabled) startAutomation();
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.autoEnabled) changes.autoEnabled.newValue ? startAutomation() : stopAutomation();
        if (changes.vcamEnabled || changes.vcamSource) {
            chrome.storage.local.get(['vcamEnabled', 'vcamSource'], (res) => updateVCam(res.vcamEnabled, res.vcamSource));
        }
        if (changes.vidSpeed) forcedVideoSpeed = parseFloat(changes.vidSpeed.newValue || 11);
    }
});

function updateVCam(enabled, source) {
    window.dispatchEvent(new CustomEvent('vibe-update-vcam', { detail: { enabled: !!enabled, source: source || null } }));
}

function startAutomation() {
    if (!loopInterval) loopInterval = setInterval(checkPageState, 1500); 
}

function stopAutomation() {
    if (loopInterval) { clearInterval(loopInterval); loopInterval = null; }
}

const isVisible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).opacity !== '0';
};

const simulateClick = (el) => {
    if (!el) return;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => {
        el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, buttons: 1 }));
    });
};

async function checkPageState() {
    if (isProcessingQuiz) return;
    
    const options = Array.from(document.querySelectorAll('button[role="radio"], input[type="radio"]')).filter(isVisible);
    const clickable = Array.from(document.querySelectorAll('button, a')).filter(isVisible);
    const getText = (el) => (el.innerText || el.textContent || "").trim().toLowerCase();
    
    // Broad Detection: Click any navigation/action button found
    const actionBtn = clickable.find(el => {
        const t = getText(el);
        return (t.includes('continue') || t.includes('accept') || t.includes('next') || 
                t.includes('submit') || t.includes('check') || t.includes('finish')) && 
               !t.includes('flag') && t.length < 40;
    });

    const bodyText = (document.body.innerText || document.body.textContent).toLowerCase();

    // SCENARIO -1: Error/Popup Bypass
    if (bodyText.includes('failed to stop video') || bodyText.includes('unable to save progress')) {
        const errBtn = clickable.find(el => getText(el).includes('continue'));
        if (errBtn && !errBtn.dataset.vibePending) {
            errBtn.dataset.vibePending = "true";
            setTimeout(() => simulateClick(errBtn), 1000);
        }
        return;
    }

    // SCENARIO 0: Quiz Success / Progress
    if (bodyText.includes('quiz completed') || bodyText.includes('passed!') || 
        bodyText.includes('you scored') || bodyText.includes('declaration')) {
        if (actionBtn && !actionBtn.dataset.vibePending) {
            actionBtn.dataset.vibePending = "true";
            setTimeout(() => simulateClick(actionBtn), 1000);
        }
        return;
    }

    // SCENARIO A: Active Quiz
    if (options.length > 0) {
        const isAnswered = options.some(el => el.getAttribute('aria-checked') === 'true' || el.checked || el.dataset.state === 'checked');
        if (isAnswered) {
             if (actionBtn && !actionBtn.dataset.vibePending) {
                 actionBtn.dataset.vibePending = "true";
                 setTimeout(() => simulateClick(actionBtn), 500);
             }
             return; 
        }

        isProcessingQuiz = true;
        const main = document.querySelector('main') || document.body;
        const optsText = options.map(el => (el.innerText || el.textContent || el.parentElement.innerText).trim());
        
        const payload = `[COURSE CONTEXT]\nTitle: ${document.title}\n\n[QUIZ CONTENT]\n${main.innerText}`;
        const result = await solveQuiz(payload, optsText, options, actionBtn);

        if (result.rateLimit) {
            rateLimitCounter++;
            if (rateLimitCounter > 20) {
                window.alert("⚠️ ViBe Auto: Rate limit hit 20 times. Stopping automation.");
                chrome.storage.local.set({ autoEnabled: false });
                rateLimitCounter = 0;
            } else {
                window.alert("ViBe Auto: Rate limit hit! Attempt " + rateLimitCounter + "/20. Retrying in 5 seconds...");
                setTimeout(() => { isProcessingQuiz = false; }, 5000);
            }
        } else {
            rateLimitCounter = 0;
            setTimeout(() => { isProcessingQuiz = false; }, 300);
        }
        return;
    }

    // SCENARIO B: Video Progress / Generic Jump
    const video = document.querySelector('video');
    const noQuiz = options.length === 0;
    if (noQuiz && actionBtn && (!video || video.paused || video.ended)) {
        if (!actionBtn.dataset.vibePending) {
            actionBtn.dataset.vibePending = "true";
            setTimeout(() => { simulateClick(actionBtn); actionBtn.dataset.vibePending = ""; }, 1000);
        }
    }
}

function enforceVideoFeatures(applySpeed) {
    const speed = parseFloat(forcedVideoSpeed) || 11;
    document.querySelectorAll('video').forEach(v => {
        if (applySpeed && Math.abs(v.playbackRate - speed) > 0.01) {
            v.playbackRate = speed;
            v.defaultPlaybackRate = speed; 
        }
        if (v.paused && !v.ended && v.readyState >= 2 && !v.dataset.vibeAutoplayed) {
            v.dataset.vibeAutoplayed = "true";
            v.play().catch(e => {
                if (e.name === "NotAllowedError" || e.name === "NotSupportedError") { 
                    v.muted = true; 
                    v.play().catch(() => {}); 
                }
            });
        }
    });
}

async function solveQuiz(payload, optionsText, optionEls, submitButton) {
    return new Promise((res) => {
        chrome.runtime.sendMessage({ action: "solveQuiz", questionData: { question: payload, options: optionsText } }, (resp) => {
            if (!resp || resp.error) {
                res({ success: false, rateLimit: (resp && resp.error === "RATE_LIMIT_HIT") }); 
                return;
            }
            const aiAns = resp.answer.toLowerCase();
            let matched = optionEls.find((el, i) => {
                const opt = optionsText[i].toLowerCase();
                return aiAns.includes(opt) || opt.includes(aiAns);
            });
            if (matched) {
                simulateClick(matched);
                setTimeout(() => { if (submitButton) simulateClick(submitButton); res({ success: true, rateLimit: false }); }, 1500); 
            } else { res({ success: false, rateLimit: false }); }
        });
    });
}
