require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const natural = require('natural');


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
  res.json({ message: 'Backend running' });
});

/* -------------------- File Upload -------------------- */
const storage = multer.memoryStorage();
const upload = multer({ storage });
const stemmer = natural.PorterStemmer;

/* -------------------- Gemini Config -------------------- */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing");
  process.exit(1);
}

// const GEMINI_API_URL =
//   `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
// const GEMINI_API_URL =
//   `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;

const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

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
          processed = { tokens: word.split('') };
          break;

        case 'Lemmatization':
          processed = { lemma: baseForm };
          break;

        case 'Stemming':
          processed = { stem: stemmer.stem(word) };
          break;

        case 'Stopword Removal':
          processed = {
            isStopword: natural.stopwords.includes(word.toLowerCase())
          };
          break;

        case 'Sentiment Analysis':
          if (!meaning) {
            processed = { sentiment: 'N/A', score: 0 };
            break;
          }
          const tokenizer = new natural.WordTokenizer();
          const analyzer = new natural.SentimentAnalyzer(
            "English",
            stemmer,
            "afinn"
          );
          const score = analyzer.getSentiment(tokenizer.tokenize(meaning));
          processed = {
            sentiment: score > 0 ? 'Positive' : score < 0 ? 'Negative' : 'Neutral',
            score
          };
          break;

        default:
          processed = { error: 'Unknown action' };
      }

      results.push({ word, processed });
    })
    .on('end', () => res.json(results))
    .on('error', () => res.status(500).json({ error: 'CSV error' }));
});

/* -------------------- Chatbot Endpoint -------------------- */
app.post('/api/chatbot', async (req, res) => {
  try {
    const { message } = req.body;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: message }]
        }
      ]
    };

    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    console.log("GEMINI RESPONSE:", JSON.stringify(data, null, 2));

    if (data.candidates?.length) {
      return res.json({
        reply: data.candidates[0].content.parts[0].text
      });
    }

    return res.json({
      reply: "⚠️ Gemini did not return text. Try rephrasing."
    });

  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({ reply: "Backend error" });
  }
});

/* -------------------- Server -------------------- */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
