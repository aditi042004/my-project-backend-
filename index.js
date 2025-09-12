// const express = require('express');
// const cors = require('cors');
// const multer = require('multer');
// const csv = require('csv-parser');
// const { Readable } = require('stream');
// const natural = require('natural');
// const fetch = require('node-fetch');
// const { youtube } = require('youtube-sr');

// const app = express();
// const PORT = 5000;

// // --- Middleware ---
// app.use(cors());
// app.use(express.json());

// const storage = multer.memoryStorage();
// const upload = multer({ storage: storage });
// const stemmer = natural.PorterStemmer;

// // --- Gemini API Configuration ---
// const GEMINI_API_KEY = "AIzaSyBrf1bqYieVBq4jsyGyoJcRmYspH3aWT_c"; 
// const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
// const TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`;

// // --- Sanity Check ---
// if (!GEMINI_API_KEY || GEMINI_API_KEY === "") {
//     console.error("FATAL ERROR: Gemini API Key is missing.");
//     process.exit(1);
// }

// // --- API Endpoints ---

// // NLP Processing Endpoint
// app.post('/api/nlp', upload.single('csvfile'), (req, res) => {
//     if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
//     const { action } = req.body;
//     const results = [];
//     const readableStream = Readable.from(req.file.buffer.toString());
//     readableStream.pipe(csv()).on('data', (row) => {
//         const word = row.Word; 
//         const baseForm = row['Base Form'];
//         const meaning = row.Meaning;
//         if (!word || !baseForm) return;
//         let processed;
//         switch (action) {
//             case 'Tokenization': processed = { "Character Tokens": word.split('') }; break;
//             case 'Lemmatization': processed = { Lemma: baseForm }; break;
//             case 'Stemming': processed = { Stem: stemmer.stem(word) }; break;
//             case 'Stopword Removal': const isStopword = natural.stopwords.includes(word.toLowerCase()); processed = { "Is Stopword": isStopword, "Explanation": isStopword ? `'${word}' is a common word...` : `'${word}' is not a common stopword.` }; break;
//             case 'Morphological Analysis': let analysis = { Stem: baseForm }; let affix = 'None'; if (word.endsWith('ing')) affix = '-ing (Gerund/Participle)'; else if (word.endsWith('ed')) affix = '-ed (Past Tense)'; else if (word.endsWith('s') && word.length > baseForm.length) affix = '-s (Plural/3rd Person)'; analysis.Affix = affix; processed = analysis; break;
//             case 'Sentiment Analysis':
//                 if (meaning) {
//                     const tokenizer = new natural.WordTokenizer();
//                     const sentimentAnalyzer = new natural.SentimentAnalyzer("English", stemmer, "afinn");
//                     const meaningTokens = tokenizer.tokenize(meaning);
//                     const sentimentScore = sentimentAnalyzer.getSentiment(meaningTokens);
//                     let sentiment = 'Neutral';
//                     if (sentimentScore > 0.1) sentiment = 'Positive';
//                     if (sentimentScore < -0.1) sentiment = 'Negative';
//                     processed = { Sentiment: sentiment, Score: sentimentScore.toFixed(4) };
//                 } else {
//                     processed = { Sentiment: 'N/A', Score: 0, Note: 'No meaning provided.' };
//                 }
//                 break;
//             default: processed = { "Error": "Action not recognized." };
//         }
//         results.push({ original: word, processed });
//     }).on('end', () => res.json(results)).on('error', (err) => res.status(500).json({ error: 'Failed to process CSV.' }));
// });

// // Game Data Endpoint (THIS WAS THE MISSING PART)
// app.post('/api/load-game-data', upload.single('csvfile'), (req, res) => {
//     if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
//     const gameData = [];
//     const readableStream = Readable.from(req.file.buffer.toString());
//     readableStream.pipe(csv()).on('data', (row) => {
//         if (row.Word && row['Base Form'] && row.Meaning) {
//             gameData.push({ word: row.Word, baseForm: row['Base Form'], meaning: row.Meaning });
//         }
//     }).on('end', () => res.json(gameData)).on('error', (err) => res.status(500).json({ error: 'Failed to process CSV for game.' }));
// });

// // Chatbot Endpoint
// app.post('/api/chatbot', async (req, res) => {
//     const { message, language } = req.body;
//     let systemInstruction = "You are a helpful language assistant. Your name is 'SolveBot'.";
//     let userQuery = "";
//     let isDefinition = false;
//     let wordToPronounce = "";
//     let isSummary = false;

//     const targetLanguage = language === 'hi' ? 'Hindi' : 'English';
//     const wordCount = message.trim().split(/\s+/).length;

//     if (wordCount <= 3) { // Definition
//         systemInstruction += " You provide concise definitions for words. First give the definition, then an example sentence.";
//         userQuery = `What is the meaning of the word "${message}" in ${targetLanguage}?`;
//         isDefinition = true;
//         wordToPronounce = message.trim();
//     } else if (wordCount > 3 && wordCount < 50) { // Translation
//         systemInstruction += ` You translate paragraphs between English and Hindi. Detect the source language of the user's text and translate it to the other language (${targetLanguage}).`;
//         userQuery = `Translate the following text: "${message}"`;
//     } else { // Summary and Video Search
//         systemInstruction = "You are an expert academic summarizer. First, summarize the following text into a few key bullet points. After the summary, on a new line, write 'YT-SEARCH:' followed by a single, concise YouTube search query (max 5 words) that is highly relevant to the main topic of the text.";
//         userQuery = message;
//         isSummary = true;
//     }

//     const payload = { contents: [{ parts: [{ text: userQuery }] }], systemInstruction: { parts: [{ text: systemInstruction }] }, };

//     try {
//         const geminiRes = await fetch(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), });
//         if (!geminiRes.ok) throw new Error(`Gemini API error: ${geminiRes.statusText}`);
//         const data = await geminiRes.json();
//         let reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't process that.";
        
//         let videos = [];
//         if (isSummary && reply.includes('YT-SEARCH:')) {
//             const parts = reply.split('YT-SEARCH:');
//             reply = parts[0].trim();
//             const searchQuery = parts[1].trim();
//             if (searchQuery) {
//                 const searchResults = await youtube.search(searchQuery, { limit: 3, type: 'video' });
//                 videos = searchResults.map(v => ({
//                     title: v.title,
//                     url: v.url,
//                     thumbnail: v.thumbnail.url,
//                     duration: v.durationFormatted,
//                 }));
//             }
//         }
        
//         res.json({ reply, isDefinition, word: wordToPronounce, isSummary, videos });

//     } catch (error) {
//         console.error("Chatbot API Error:", error);
//         res.status(500).json({ reply: "Sorry, something went wrong on my end." });
//     }
// });

// // Text-to-Speech Endpoint
// app.post('/api/tts', async (req, res) => { 
//     const { text } = req.body; 
//     if (!text) return res.status(400).json({ error: 'No text provided for speech.' }); 
//     const payload = { contents: [{ parts: [{ text: `Pronounce the word: ${text}` }] }], generationConfig: { responseModalities: ["AUDIO"] }, }; 
//     try { 
//         const ttsRes = await fetch(TTS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), }); 
//         if (!ttsRes.ok) throw new Error(`TTS API error: ${ttsRes.statusText}`); 
//         const data = await ttsRes.json(); 
//         const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data; 
//         if (audioData) { res.json({ audioContent: audioData }); } 
//         else { res.status(500).json({ error: "Could not generate audio." }); } 
//     } catch (error) { 
//         console.error("TTS API Error:", error); 
//         res.status(500).json({ error: "Failed to generate audio." }); 
//     } 
// });

// app.listen(PORT, () => console.log(`✅ Server is running on http://localhost:${PORT}`));

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const natural = require('natural');
const fetch = require('node-fetch');
const { youtube } = require('youtube-sr');

const app = express();
const PORT = 5000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const stemmer = natural.PorterStemmer;

// --- Gemini API Configuration ---
const GEMINI_API_KEY = "AIzaSyBrf1bqYieVBq4jsyGyoJcRmYspH3aWT_c"; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
const TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`;

// --- Sanity Check ---
if (!GEMINI_API_KEY || GEMINI_API_KEY === "") {
    console.error("FATAL ERROR: Gemini API Key is missing.");
    process.exit(1);
}

// --- API Endpoints are below ---

// NLP Processing Endpoint (Your existing code)
app.post('/api/nlp', upload.single('csvfile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { action } = req.body;
    const results = [];
    const readableStream = Readable.from(req.file.buffer.toString());
    readableStream.pipe(csv()).on('data', (row) => {
        const word = row.Word; 
        const baseForm = row['Base Form'];
        const meaning = row.Meaning;
        if (!word || !baseForm) return;
        let processed;
        switch (action) {
            case 'Tokenization': processed = { "Character Tokens": word.split('') }; break;
            case 'Lemmatization': processed = { Lemma: baseForm }; break;
            case 'Stemming': processed = { Stem: stemmer.stem(word) }; break;
            case 'Stopword Removal': const isStopword = natural.stopwords.includes(word.toLowerCase()); processed = { "Is Stopword": isStopword, "Explanation": isStopword ? `'${word}' is a common word...` : `'${word}' is not a common stopword.` }; break;
            case 'Morphological Analysis': let analysis = { Stem: baseForm }; let affix = 'None'; if (word.endsWith('ing')) affix = '-ing (Gerund/Participle)'; else if (word.endsWith('ed')) affix = '-ed (Past Tense)'; else if (word.endsWith('s') && word.length > baseForm.length) affix = '-s (Plural/3rd Person)'; analysis.Affix = affix; processed = analysis; break;
            case 'Sentiment Analysis':
                if (meaning) {
                    const tokenizer = new natural.WordTokenizer();
                    const sentimentAnalyzer = new natural.SentimentAnalyzer("English", stemmer, "afinn");
                    const meaningTokens = tokenizer.tokenize(meaning);
                    const sentimentScore = sentimentAnalyzer.getSentiment(meaningTokens);
                    let sentiment = 'Neutral';
                    if (sentimentScore > 0.1) sentiment = 'Positive';
                    if (sentimentScore < -0.1) sentiment = 'Negative';
                    processed = { Sentiment: sentiment, Score: sentimentScore.toFixed(4) };
                } else {
                    processed = { Sentiment: 'N/A', Score: 0, Note: 'No meaning provided.' };
                }
                break;
            default: processed = { "Error": "Action not recognized." };
        }
        results.push({ original: word, processed });
    }).on('end', () => res.json(results)).on('error', (err) => res.status(500).json({ error: 'Failed to process CSV.' }));
});

// Game Data Endpoint (Your existing code)
app.post('/api/load-game-data', upload.single('csvfile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const gameData = [];
    const readableStream = Readable.from(req.file.buffer.toString());
    readableStream.pipe(csv()).on('data', (row) => {
        if (row.Word && row['Base Form'] && row.Meaning) {
            gameData.push({ word: row.Word, baseForm: row['Base Form'], meaning: row.Meaning });
        }
    }).on('end', () => res.json(gameData)).on('error', (err) => res.status(500).json({ error: 'Failed to process CSV for game.' }));
});

// Chatbot Endpoint (UPDATED with Study Guide features)
app.post('/api/chatbot', async (req, res) => {
    const { message, language } = req.body;
    let systemInstruction = "You are a helpful language assistant. Your name is 'SolveBot'.";
    let userQuery = "";
    let isDefinition = false;
    let wordToPronounce = "";
    let videos = [];
    
    const targetLanguage = language === 'hi' ? 'Hindi' : 'English';
    const lowerCaseMessage = message.toLowerCase();

    // --- Intent Detection ---
    const videoKeywords = ['video for', 'videos for', 'suggest video', 'find video', 'youtube video', 'video on', 'videos on', 'song'];
    const pointsAndQuestionsKeywords = ['important points and questions', 'summarize and give question', 'key points and questions'];
    const pointsOnlyKeywords = ['important point', 'key point', 'main point'];
    const questionsOnlyKeywords = ['give me question', 'generate questions', 'ask questions'];
    
    let detectedVideoKeyword = videoKeywords.find(k => lowerCaseMessage.includes(k));
    let detectedPointsAndQuestionsKeyword = pointsAndQuestionsKeywords.find(k => lowerCaseMessage.includes(k));
    let detectedPointsOnlyKeyword = pointsOnlyKeywords.find(k => lowerCaseMessage.includes(k) && !detectedPointsAndQuestionsKeyword);
    let detectedQuestionsOnlyKeyword = questionsOnlyKeywords.find(k => lowerCaseMessage.includes(k) && !detectedPointsAndQuestionsKeyword);

    if (detectedVideoKeyword) {
        // This part remains the same
        try {
            const topic = message.replace(new RegExp(detectedVideoKeyword, 'i'), '').trim();
            if (!topic) return res.json({ reply: "Please specify a topic for the video search." });
            const searchQuery = detectedVideoKeyword === 'song' ? `${topic} official music video` : `tutorial for ${topic}`;
            const searchResults = await youtube.search(searchQuery, { limit: 3, type: 'video' });
            videos = searchResults.map(v => ({ title: v.title, url: v.url, thumbnail: v.thumbnail.url, duration: v.durationFormatted }));
            const reply = `Here are some videos I found for "${topic}":`;
            return res.json({ reply, videos });
        } catch (error) {
             console.error("YouTube Search Error:", error);
             return res.status(500).json({ reply: "Sorry, I had trouble searching for videos." });
        }
    } else if (detectedPointsAndQuestionsKeyword) {
        systemInstruction = "You are an expert study assistant. First, analyze the provided text and extract the most important points, presenting them as a clear, concise bulleted list under the heading 'Key Points:'. After the bullet points, generate a list of 5 to 10 relevant and important questions that could be asked based on the text, under the heading 'Study Questions:'.";
        userQuery = message.replace(new RegExp(detectedPointsAndQuestionsKeyword, 'i'), '').trim();
    } else if (detectedPointsOnlyKeyword) {
        systemInstruction = "You are an expert study assistant. Analyze the provided text and extract the most important points, presenting them as a clear, concise bulleted list under the heading 'Key Points:'.";
        userQuery = message.replace(new RegExp(detectedPointsOnlyKeyword, 'i'), '').trim();
    } else if (detectedQuestionsOnlyKeyword) {
        systemInstruction = "You are an expert study assistant. Analyze the provided text and generate a list of 5 to 10 relevant and important questions that could be asked based on the text, under the heading 'Study Questions:'.";
        userQuery = message.replace(new RegExp(detectedQuestionsOnlyKeyword, 'i'), '').trim();
    } else if (message.trim().split(/\s+/).length <= 3) {
        systemInstruction += " You provide concise definitions for words. First give the definition, then an example sentence.";
        userQuery = `What is the meaning of the word "${message}" in ${targetLanguage}?`;
        isDefinition = true;
        wordToPronounce = message.trim();
    } else { // Default to translation for mid-length text
        systemInstruction += ` You translate paragraphs between English and Hindi. Detect the source language of the user's text and translate it to the other language (${targetLanguage}).`;
        userQuery = `Translate the following text: "${message}"`;
    }

    const payload = { contents: [{ parts: [{ text: userQuery }] }], systemInstruction: { parts: [{ text: systemInstruction }] }, };

    try {
        const geminiRes = await fetch(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), });
        if (!geminiRes.ok) throw new Error(`Gemini API error: ${geminiRes.statusText}`);
        const data = await geminiRes.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't process that.";
        res.json({ reply, isDefinition, word: wordToPronounce, videos });
    } catch (error) {
        console.error("Chatbot API Error:", error);
        res.status(500).json({ reply: "Sorry, something went wrong on my end." });
    }
});

// Text-to-Speech Endpoint (Your existing code)
app.post('/api/tts', async (req, res) => { 
    const { text } = req.body; 
    if (!text) return res.status(400).json({ error: 'No text provided for speech.' }); 
    const payload = { contents: [{ parts: [{ text: `Pronounce the word: ${text}` }] }], generationConfig: { responseModalities: ["AUDIO"] }, }; 
    try { 
        const ttsRes = await fetch(TTS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), }); 
        if (!ttsRes.ok) throw new Error(`TTS API error: ${ttsRes.statusText}`); 
        const data = await ttsRes.json(); 
        const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data; 
        if (audioData) { res.json({ audioContent: audioData }); } 
        else { res.status(500).json({ error: "Could not generate audio." }); } 
    } catch (error) { 
        console.error("TTS API Error:", error); 
        res.status(500).json({ error: "Failed to generate audio." }); 
    } 
});

app.listen(PORT, () => console.log(`✅ Server is running on http://localhost:${PORT}`));

