let loopInterval = null;
let isProcessingQuiz = false;

// Initialize
chrome.storage.local.get(['autoEnabled'], (result) => {
    if (result.autoEnabled) {
        startAutomation();
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.autoEnabled) {
        if (changes.autoEnabled.newValue) {
            startAutomation();
        } else {
            stopAutomation();
        }
    }
});

function startAutomation() {
    if (loopInterval) return;
    console.log("ViBe Auto: Starting automation polling loop...");
    loopInterval = setInterval(checkPageState, 1500); 
}

function stopAutomation() {
    if (loopInterval) {
        clearInterval(loopInterval);
        loopInterval = null;
    }
    console.log("ViBe Auto: Automation stopped.");
}

function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden' && window.getComputedStyle(el).opacity !== '0';
}

function simulateClickEvents(el) {
    if (!el) return;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evType => {
        el.dispatchEvent(new MouseEvent(evType, { bubbles: true, cancelable: true, view: window, buttons: 1 }));
    });
}

async function checkPageState() {
    if (isProcessingQuiz) return;
    
    const optionsEls = Array.from(document.querySelectorAll('button[role="radio"], input[type="radio"]')).filter(isVisible);
    const clickableEls = Array.from(document.querySelectorAll('button, a')).filter(isVisible);
    const getText = (el) => (el.innerText || el.textContent || "").trim().toLowerCase();
    

    const validSubmitBtns = clickableEls.filter(el => {
         const txt = getText(el);
         return (txt.includes('submit') || txt.includes('check') || txt.includes('finish')) && !txt.includes('flag');
    });
    const submitQuizBtn = validSubmitBtns[0];
    const nextQuestionBtn = clickableEls.find(el => getText(el) === 'next');
    const clearNextLessonBtn = clickableEls.find(el => {
        const txt = getText(el);
        return (txt.includes('next lesson') || txt.includes('continue')) && txt.length < 35;
    });

    const mainContainer = document.querySelector('main') || document.body;
    const pageText = (mainContainer.innerText || mainContainer.textContent).toLowerCase();
    const fullBodyText = (document.body.innerText || document.body.textContent).toLowerCase();

    // SCENARIO -1: Error Modals & Popups
    if (fullBodyText.includes('failed to stop video') || fullBodyText.includes('unable to save progress')) {
        const errorContinueBtn = clickableEls.find(el => getText(el) === 'continue');
        if (errorContinueBtn && !errorContinueBtn.dataset.vibePendingClick) {
            errorContinueBtn.dataset.vibePendingClick = "true";
            console.log("ViBe Auto: Detected 'Failed to stop video' error popup. Clicking Continue...");
            setTimeout(() => simulateClickEvents(errorContinueBtn), 1000);
        }
        return;
    }

    // SCENARIO 0: Quiz Completed
    if (pageText.includes('quiz completed') || pageText.includes('passed!') || pageText.includes('you scored')) {
        if (clearNextLessonBtn && !clearNextLessonBtn.dataset.vibePendingClick) {
            clearNextLessonBtn.dataset.vibePendingClick = "true";
            console.log("ViBe Auto: Quiz completed explicitly detected. Clicking Next Lesson...");
            setTimeout(() => simulateClickEvents(clearNextLessonBtn), 1000);
        }
        return;
    }

    // SCENARIO A: Quiz on screen
    if (optionsEls.length > 0) {
        const isAnswered = optionsEls.some(el => el.getAttribute('aria-checked') === 'true' || el.checked || el.dataset.state === 'checked');
        if (isAnswered) {
             const actionBtn = submitQuizBtn || nextQuestionBtn || clearNextLessonBtn;
             if (actionBtn && !actionBtn.dataset.vibePendingClick) {
                 actionBtn.dataset.vibePendingClick = "true";
                 console.log(`ViBe Auto: Clicking associated quiz action button: ${getText(actionBtn)}`);
                 setTimeout(() => simulateClickEvents(actionBtn), 500);
             }
             return; 
        }

        const questionText = mainContainer.innerText || mainContainer.textContent;

        const attemptMatch = questionText.match(/Attempt\s+(\d+)\s+of\s+(\d+)/i);
        if (attemptMatch) {
            const currentAttempt = parseInt(attemptMatch[1], 10);
            const maxAttempts = parseInt(attemptMatch[2], 10);
            

            if (currentAttempt >= Math.max(1, Math.floor(maxAttempts / 2)) && window.vibeWarnedAttempt !== currentAttempt) {
                window.vibeWarnedAttempt = currentAttempt;
                const pauseAuto = window.confirm(`ViBe Auto Warning: You are on Attempt ${currentAttempt} of ${maxAttempts}!\nSince AI can make mistakes, do you want to pause automation and manually answer this?\n\nClick OK to PAUSE automation, or Cancel to let AI risk it.`);
                
                if (pauseAuto) {
                    chrome.storage.local.set({ autoEnabled: false });
                    return;
                }
            }
        }
        
        isProcessingQuiz = true;
        

        const optionsTextList = optionsEls.map(el => {
            let text = (el.innerText || el.textContent).trim();
            if (!text && el.parentElement) {
                text = (el.parentElement.innerText || el.parentElement.textContent).trim();
            }
            return text;
        });
        

        const genericNextBtn = clickableEls.find(el => {
             const txt = getText(el);
             return txt.includes('next') && !txt.includes('lesson');
        });
        const actionBtn = submitQuizBtn || nextQuestionBtn || genericNextBtn;
        

        const pageTitle = document.title ? document.title.trim() : "";
        const headerEl = document.querySelector('header');
        const headerText = headerEl ? (headerEl.innerText || headerEl.textContent).trim() : "";
        const enrichedPayload = `[COURSE CONTEXT]\nPage Title: ${pageTitle}\nHeader Section: ${headerText}\n\n[QUIZ CONTENT]\n${questionText}`;
        
        await solveQuiz(enrichedPayload, optionsTextList, optionsEls, actionBtn);
        
        setTimeout(() => { isProcessingQuiz = false; }, 3000);
        return;
    }

    // SCENARIO B: No Quiz
    const videoEl = document.querySelector('video');
    const isVideoPlaying = videoEl && !videoEl.paused && !videoEl.ended;

    if (!isVideoPlaying) {
       if (clearNextLessonBtn && optionsEls.length === 0) {
            if (!clearNextLessonBtn.dataset.vibePendingClick) {
                clearNextLessonBtn.dataset.vibePendingClick = "true";
                console.log("ViBe Auto: Target 'Next Lesson' located natively in tag:", clearNextLessonBtn.tagName, ". Proceeding in 1s...");
                setTimeout(() => {
                    simulateClickEvents(clearNextLessonBtn);
                    clearNextLessonBtn.dataset.vibePendingClick = "";
                }, 1000);
            }
       }
    }
}

async function solveQuiz(enrichedPayload, optionsTextList, optionEls, submitButton) {
    console.log("ViBe Auto: Sending Quiz Payload to AI...");
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: "solveQuiz",
            questionData: {
                question: enrichedPayload,
                options: optionsTextList
            }
        }, (response) => {
            if (!response || response.error) {
                console.error("ViBe Auto API Error:", response ? response.error : "No response from background script.");
                resolve();
                return;
            }

            const aiAnswer = response.answer;
            const modelUsed = response.modelUsed || "Gemini";
            console.log(`ViBe Auto: Matched Answer from ${modelUsed}:`, aiAnswer);

            let bestOption = null;
            let bestMatchLen = -1;
            
            // Substring Match
            for (let i = 0; i < optionsTextList.length; i++) {
                const optStr = optionsTextList[i].toLowerCase().trim();
                const aiStr = aiAnswer.toLowerCase().trim();
                
                if (aiStr.includes(optStr) || optStr.includes(aiStr)) {
                    if (optStr.length > bestMatchLen) {
                        bestMatchLen = optStr.length;
                        bestOption = optionEls[i];
                    }
                }
            }
            
            // Fuzzy Match Fallback
            if (!bestOption) {
                for (let i = 0; i < optionsTextList.length; i++) {
                    const cleanAi = aiAnswer.replace(/[^\w\s]/g, "").replace(/\s+/g, " ").toLowerCase().trim();
                    const cleanOpt = optionsTextList[i].replace(/[^\w\s]/g, "").replace(/\s+/g, " ").toLowerCase().trim();
                    if (cleanAi === cleanOpt || cleanOpt.includes(cleanAi) || cleanAi.includes(cleanOpt)) {
                        bestOption = optionEls[i];
                        break;
                    }
                }
            }

            if (bestOption) {
                console.log("ViBe Auto: Selecting option");
                simulateClickEvents(bestOption);
                
                setTimeout(() => {
                    if (submitButton) {
                        console.log("ViBe Auto: Clicking Submit/Next");
                        simulateClickEvents(submitButton);
                    } else {
                        const fallbackBtn = document.querySelector('button.bg-primary');
                        if (fallbackBtn && isVisible(fallbackBtn)) simulateClickEvents(fallbackBtn);
                    }
                    resolve();
                }, 1500); 
            } else {
                console.log(`ViBe Auto: Could not match AI prediction explicitly. ${modelUsed} gave:`, aiAnswer);
                resolve();
            }
        });
    });
}
