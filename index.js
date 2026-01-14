require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const csv = require("csv-parser");
const { Readable } = require("stream");
const natural = require("natural");

// ---- fetch FIX (node 16/18 compatible) ----
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 10000;

/* -------------------- Middleware -------------------- */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://my-project-frontend-lyart.vercel.app",
    ],
  })
);

app.use(express.json());

app.get("/test", (req, res) => {
  res.json({ message: "Backend running" });
});

/* -------------------- File Upload -------------------- */
const storage = multer.memoryStorage();
const upload = multer({ storage });
const stemmer = natural.PorterStemmer;

/* -------------------- ENV CHECK -------------------- */
if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing");
}

/* -------------------- NLP Endpoint -------------------- */
app.post("/api/nlp", upload.single("csvfile"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });

  const { action } = req.body;
  const results = [];

  Readable.from(req.file.buffer.toString())
    .pipe(csv())
    .on("data", (row) => {
      const word = row.Word || row.word;
      const baseForm = row["Base Form"] || row.baseForm;
      const meaning = row.Meaning || row.meaning;

      if (!word) return;

      let processed = {};

      switch (action) {
        case "Tokenization":
          processed = { tokens: word.split("") };
          break;

        case "Lemmatization":
          processed = { lemma: baseForm || word };
          break;

        case "Stemming":
          processed = { stem: stemmer.stem(word) };
          break;

        case "Stopword Removal":
          processed = {
            isStopword: natural.stopwords.includes(word.toLowerCase()),
          };
          break;

        case "Sentiment Analysis":
          if (!meaning) {
            processed = { sentiment: "N/A", score: 0 };
            break;
          }
          const tokenizer = new natural.WordTokenizer();
          const analyzer = new natural.SentimentAnalyzer(
            "English",
            stemmer,
            "afinn"
          );
          const score = analyzer.getSentiment(
            tokenizer.tokenize(meaning)
          );
          processed = {
            sentiment:
              score > 0 ? "Positive" : score < 0 ? "Negative" : "Neutral",
            score,
          };
          break;

        default:
          processed = { error: "Unknown action" };
      }

      results.push({ word, meaning, processed });
    })
    .on("end", () => res.json(results))
    .on("error", () =>
      res.status(500).json({ error: "CSV processing error" })
    );
});

/* -------------------- GAME DATA ENDPOINT -------------------- */
app.post("/api/load-game-data", upload.single("csvfile"), (req, res) => {
  if (!req.file) return res.json([]);

  const gameData = [];

  Readable.from(req.file.buffer.toString())
    .pipe(csv())
    .on("data", (row) => {
      const word = row.Word || row.word;
      const meaning = row.Meaning || row.meaning;
      if (word && meaning) {
        gameData.push({ word, meaning });
      }
    })
    .on("end", () => res.json(gameData))
    .on("error", () => res.json([]));
});

/* -------------------- CHATBOT (FINAL FIXED VERSION) -------------------- */
app.post("/api/chatbot", async (req, res) => {
  try {
    const { message, language } = req.body;

    if (!message || !message.trim()) {
      return res.json({ reply: "Please type something." });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.json({ reply: "Server AI key missing." });
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
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant", // ✅ FIXED
          messages: [
            { role: "system", content: "You are SolveBot, a helpful AI assistant." },
            { role: "user", content: prompt }
          ],
          temperature: 0.6,
          max_tokens: 300,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ GROQ ERROR:", data);
      return res.json({ reply: "AI service error. Try again." });
    }

    res.json({
      reply: data?.choices?.[0]?.message?.content || "No response from AI.",
    });

  } catch (err) {
    console.error("🔥 CHATBOT ERROR:", err);
    res.json({ reply: "AI service is temporarily unavailable." });
  }
});

/* -------------------- SERVER -------------------- */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
