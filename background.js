// A simple queue to ensure we do not hit the Gemini 5-requests-per-minute API Limit limit.
// We force a minimum 13-second wait between API calls locally.
let lastApiCallTime = 0;
const MIN_DELAY_MS = 13000;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "solveQuiz") {
        handleQuizSolvingWithQueue(request.questionData).then(sendResponse);
        return true; // Keep message channel open for async response
    }
});

async function handleQuizSolvingWithQueue(questionData) {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCallTime;
    
    if (timeSinceLastCall < MIN_DELAY_MS) {
        const waitTime = MIN_DELAY_MS - timeSinceLastCall;
        console.log(`ViBe Auto Background: Rate limiting API call to respect Gemini free tier limits. Queuing request for ${Math.round(waitTime/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastApiCallTime = Date.now(); 
    return await handleQuizSolving(questionData);
}

async function handleQuizSolving(questionData) {
    try {
        const { geminiApiKey, groqApiKey, modelChoice } = await chrome.storage.local.get(['geminiApiKey', 'groqApiKey', 'modelChoice']);
        const chosenModel = modelChoice || 'gemini';

        if (chosenModel === 'gemini' && !geminiApiKey) {
            return { error: "No Gemini API Key found" };
        }
        if (chosenModel === 'groq' && !groqApiKey) {
            return { error: "No Groq API Key found" };
        }

        const prompt = `You are an expert tutor solving a multiple choice quiz. 
        
[COURSE CONTEXT]
${questionData.question}

[OPTIONS]
${questionData.options.map((opt, i) => `- ${opt}`).join('\n')}

Instruction: Use the provided [COURSE CONTEXT] to understand what specific topic, framework, or technology this question belongs to. Then, evaluate the [QUIZ CONTENT] to find the specific question being asked. Reply ONLY with the exact text of the correct option. Do NOT write anything else. Do not include option prefixes or any other explanations. Your answer must strictly match the text of one of the provided options.`;

        let answer = null;

        if (chosenModel === 'groq') {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${groqApiKey}`
                },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1
                })
            });

            const data = await response.json();
            if (data.error) {
                return { error: data.error.message };
            }
            answer = data?.choices?.[0]?.message?.content;
        } else {
            // Using the requested Gemini 3.1 Flash Lite Preview model
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1 }
                })
            });

            const data = await response.json();
            
            if (data.error) {
               return { error: data.error.message }; 
            }

            answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        }

        if (!answer) {
            return { error: `No answer found. Full data received for model ${chosenModel} was empty.` };
        }
        return { answer: answer.trim(), modelUsed: chosenModel === 'groq' ? 'Groq' : 'Gemini' };

    } catch (err) {
        return { error: err.message };
    }
}
