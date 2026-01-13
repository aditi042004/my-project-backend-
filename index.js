require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const natural = require('natural');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 10000;

/* -------------------- Middleware -------------------- */
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://my-project-frontend-lyart.vercel.app'
  ]
}));
app.use(express.json());

app.get('/test', (req, res) => {
  res.json({ message: 'Backend running ✅' });
});

/* -------------------- Upload Config -------------------- */
const upload = multer({ storage: multer.memoryStorage() });
const stemmer = natural.PorterStemmer;

/* -------------------- GROQ CONFIG -------------------- */
const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing");
  process.exit(1);
}

/* =====================================================
   NLP TOOL
===================================================== */
app.post('/api/nlp', upload.single('csvfile'), (req, res) => {
  const { action } = req.body;
  const results = [];

  Readable.from(req.file.buffer.toString())
    .pipe(csv())
    .on('data', row => {
      const word = row.Word;
      const baseForm = row['Base Form'];
      const meaning = row.Meaning;
      if (!word) return;

      let processed = {};
      switch (action) {
        case 'Tokenization':
          processed = { tokens: word.split('') };
          break;
        case 'Lemmatization':
          processed = { lemma: baseForm };
          break;
        case 'Stemming':
          processed = { stem: stemmer.stem(word) };
          break;
        default:
          processed = { info: 'Processed' };
      }

      results.push({ word, meaning, processed });
    })
    .on('end', () => res.json(results));
});

/* =====================================================
   GAME DATA LOADER  ✅ (YOU MISSED THIS)
===================================================== */
app.post('/api/load-game-data', upload.single('csvfile'), (req, res) => {
  const data = [];

  Readable.from(req.file.buffer.toString())
    .pipe(csv())
    .on('data', row => {
      if (row.Word && row.Meaning) {
        data.push({
          word: row.Word,
          meaning: row.Meaning
        });
      }
    })
    .on('end', () => res.json(data));
});

/* =====================================================
   CHATBOT (GROQ)
===================================================== */
app.post('/api/chatbot', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.json({ reply: "Say something 🙂" });

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: [
            { role: 'system', content: 'You are SolveBot, a helpful NLP assistant.' },
            { role: 'user', content: message }
          ],
          temperature: 0.7,
          max_tokens: 300
        })
      }
    );

    const data = await response.json();
    res.json({ reply: data.choices[0].message.content });

  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "AI service error" });
  }
});

/* =====================================================
   TTS (MOCK – FREE & SAFE)
===================================================== */
app.post('/api/tts', (req, res) => {
  // frontend expects audioContent → return dummy silence
  res.json({
    audioContent: null
  });
});

/* -------------------- START SERVER -------------------- */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
