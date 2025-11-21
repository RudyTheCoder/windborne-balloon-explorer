import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve the static frontend from ./public
app.use(express.static(path.join(__dirname, "public")));

// CORS for safety (Render/Railway may be fine either way)
app.use(cors());

app.get("/api/hour/:h", async (req, res) => {
  const hour = req.params.h.padStart(2, "0");
  const url = `https://a.windbornesystems.com/treasure/${hour}.json`;

  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch upstream JSON." });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log("Server listening on port", port));
