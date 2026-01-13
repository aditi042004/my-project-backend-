require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const natural = require('natural');
const fetch = require('node-fetch'); // ✅ ONLY ONCE

const app = express();
const PORT = process.env.PORT || 5000;

/* -------------------- Middleware -------------------- */
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://my-project-frontend-lyart.vercel.app'
  ]
}));

app.use(express.json()); // ✅ MUST BE BEFORE ROUTES

app.get('/test', (req, res) => {
  res.json({ message: 'Backend running' });
});

/* -------------------- Multer & NLP Setup -------------------- */
const storage = multer.memoryStorage();
const upload = multer({ storage });
const stemmer = natural.PorterStemmer;

/* -------------------- Gemini Config -------------------- */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing");
  process.exit(1);
}

const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

/* -------------------- NLP Endpoint -------------------- */
app.post('/api/nlp', upload.single('csvfile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const { action } = req.body;
  const results = [];

  Readable.from(req.file.buffer.toString())
    .pipe(csv())
    .on('data', row => {
      const word = row.Word;
      const baseForm = row['Base Form'];
      const meaning = row.Meaning;

      if (!word || !baseForm) return;

      let processed = {};

      switch (action) {
        case 'Tokenization':
          processed = { "Character Tokens": word.split('') };
          break;

        case 'Lemmatization':
          processed = { Lemma: baseForm };
          break;

        case 'Stemming':
          processed = { Stem: stemmer.stem(word) };
          break;

        case 'Stopword Removal':
          const isStopword = natural.stopwords.includes(word.toLowerCase());
          processed = {
            "Is Stopword": isStopword,
            "Explanation": isStopword
              ? `'${word}' is a common stopword.`
              : `'${word}' is not a stopword.`
          };
          break;

        case 'Morphological Analysis':
          let affix = 'None';
          if (word.endsWith('ing')) affix = '-ing (Gerund)';
          else if (word.endsWith('ed')) affix = '-ed (Past)';
          else if (word.endsWith('s') && word.length > baseForm.length) affix = '-s (Plural)';
          processed = { Stem: baseForm, Affix: affix };
          break;

        case 'Sentiment Analysis':
          if (!meaning) {
            processed = { Sentiment: 'N/A', Score: 0 };
            break;
          }
          const tokenizer = new natural.WordTokenizer();
          const analyzer = new natural.SentimentAnalyzer("English", stemmer, "afinn");
          const score = analyzer.getSentiment(tokenizer.tokenize(meaning));
          processed = {
            Sentiment: score > 0 ? 'Positive' : score < 0 ? 'Negative' : 'Neutral',
            Score: score.toFixed(4)
          };
          break;

        default:
          processed = { Error: "Action not recognized." };
      }

      results.push({ original: word, processed });
    })
    .on('end', () => res.json(results))
    .on('error', () => res.status(500).json({ error: 'CSV processing failed.' }));
});

/* -------------------- Game Data Endpoint -------------------- */
app.post('/api/load-game-data', upload.single('csvfile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const gameData = [];

  Readable.from(req.file.buffer.toString())
    .pipe(csv())
    .on('data', row => {
      if (row.Word && row['Base Form'] && row.Meaning) {
        gameData.push({
          word: row.Word,
          baseForm: row['Base Form'],
          meaning: row.Meaning
        });
      }
    })
    .on('end', () => res.json(gameData))
    .on('error', () => res.status(500).json({ error: 'Game CSV failed.' }));
});

/* -------------------- Chatbot Endpoint -------------------- */
app.post('/api/chatbot', async (req, res) => {
  const { message, language } = req.body;

  let systemInstruction = "You are SolveBot, a helpful study assistant.";
  let userQuery = message;
  let isDefinition = false;
  let wordToPronounce = "";

  const wordCount = message.trim().split(/\s+/).length;
  const targetLanguage = language === 'hi' ? 'Hindi' : 'English';

  if (wordCount <= 3) {
    systemInstruction += " Give meaning and an example sentence.";
    userQuery = `What is the meaning of "${message}" in ${targetLanguage}?`;
    isDefinition = true;
    wordToPronounce = message;
  }

  try {
    const payload = {
      contents: [{ parts: [{ text: userQuery }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] }
    };

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini";

    res.json({ reply, isDefinition, word: wordToPronounce });

  } catch (err) {
    console.error("Chatbot Error:", err);
    res.status(500).json({ reply: "Gemini failed." });
  }
});

/* -------------------- Server -------------------- */
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
