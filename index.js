require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const csv = require("csv-parser");
const { Readable } = require("stream");
const natural = require("natural");
const Groq = require("groq-sdk");

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
  res.json({ message: "Backend running successfully" });
});

/* -------------------- File Upload -------------------- */
const storage = multer.memoryStorage();
const upload = multer({ storage });
const stemmer = natural.PorterStemmer;

/* -------------------- GROQ CONFIG -------------------- */
if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing");
  process.exit(1);
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/* -------------------- NLP Endpoint -------------------- */
app.post("/api/nlp", upload.single("csvfile"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });

  const { action } = req.body;
  const results = [];

  Readable.from(req.file.buffer.toString())
    .pipe(csv())
    .on("data", (row) => {
      const word = row.Word;
      const baseForm = row["Base Form"];
      const meaning = row.Meaning;
      if (!word || !baseForm) return;

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
          const score = analyzer.getSentiment(tokenizer.tokenize(meaning));
          processed = {
            sentiment:
              score > 0 ? "Positive" : score < 0 ? "Negative" : "Neutral",
            score,
          };
          break;

        default:
          processed = { error: "Unknown action" };
      }

      results.push({ word, processed });
    })
    .on("end", () => res.json(results))
    .on("error", () => res.status(500).json({ error: "CSV error" }));
});

/* -------------------- CHATBOT (GROQ) -------------------- */
app.post("/api/chatbot", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.json({ reply: "Please type something." });
    }

    const completion = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [
        {
          role: "system",
          content: "You are SolveBot, a friendly AI assistant.",
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const reply =
      completion.choices?.[0]?.message?.content ||
      "No response from AI.";

    res.json({ reply });
  } catch (err) {
    console.error("Groq chatbot error:", err);
    res.status(500).json({ reply: "AI service error. Try again." });
  }
});

/* -------------------- Server -------------------- */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
