/**********************************************************
 * SolveBot NLP Anuvaad - FULL BACKEND
 * Uses GROQ (FREE) instead of Gemini
 **********************************************************/

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const csv = require("csv-parser");
const { Readable } = require("stream");
const natural = require("natural");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 10000;

/* ===================== MIDDLEWARE ===================== */
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://my-project-frontend-lyart.vercel.app"
  ]
}));

app.use(express.json());

/* ===================== TEST ROUTE ===================== */
app.get("/test", (req, res) => {
  res.json({ message: "Backend running ✅" });
});

/* ===================== FILE UPLOAD ===================== */
const upload = multer({ storage: multer.memoryStorage() });
const stemmer = natural.PorterStemmer;

/* ======================================================
   GAME DATA ENDPOINT  (THIS FEEDS YOUR GAME)
====================================================== */
app.post("/api/load-game-data", upload.single("csvfile"), (req, res) => {
  if (!req.file) return res.status(400).json([]);

  const gameData = [];

  Readable.from(req.file.buffer.toString())
    .pipe(csv())
    .on("data", row => {
      if (row.Word && row.Meaning) {
        gameData.push({
          word: row.Word.trim(),
          meaning: row.Meaning.trim()
        });
      }
    })
    .on("end", () => res.json(gameData))
    .on("error", () => res.status(500).json([]));
});

/* ======================================================
   NLP TOOLKIT ENDPOINT
====================================================== */
app.post("/api/nlp", upload.single("csvfile"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const { action } = req.body;
  const results = [];

  Readable.from(req.file.buffer.toString())
    .pipe(csv())
    .on("data", row => {
      const word = row.Word;
      const baseForm = row["Base Form"] || word;
      const meaning = row.Meaning || "";

      let processed = {};

      switch (action) {
        case "Tokenization":
          processed = { tokens: word.split("") };
          break;
        case "Lemmatization":
          processed = { lemma: baseForm };
          break;
        case "Stemming":
          processed = { stem: stemmer.stem(word) };
          break;
        case "Stopword Removal":
          processed = { isStopword: natural.stopwords.includes(word.toLowerCase()) };
          break;
        case "Sentiment Analysis":
          const tokenizer = new natural.WordTokenizer();
          const analyzer = new natural.SentimentAnalyzer("English", stemmer, "afinn");
          const score = analyzer.getSentiment(tokenizer.tokenize(meaning));
          processed = {
            sentiment: score > 0 ? "Positive" : score < 0 ? "Negative" : "Neutral",
            score
          };
          break;
        default:
          processed = { error: "Unknown action" };
      }

      results.push({ original: word, processed });
    })
    .on("end", () => res.json(results));
});

/* ======================================================
   CHATBOT ENDPOINT (FREE – GROQ)
====================================================== */
app.post("/api/chatbot", async (req, res) => {
  try {
    const { message, language } = req.body;

    if (!message || message.trim() === "") {
      return res.json({ reply: "Please type something." });
    }

    const prompt =
      language === "hi"
        ? `Reply in simple Hindi:\n${message}`
        : message;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [
            {
              role: "system",
              content: "You are SolveBot, a helpful NLP assistant."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.6,
          max_tokens: 300
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("GROQ ERROR:", err);
      return res.json({ reply: "AI service error. Try again." });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    return res.json({
      reply: reply || "No response from AI."
    });

  } catch (err) {
    console.error("Chatbot error:", err);
    res.json({ reply: "AI service unavailable." });
  }
});

/* ===================== START SERVER ===================== */
app.listen(PORT, () => {
  console.log(`✅ SolveBot backend running on port ${PORT}`);
});
