import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Allow browser requests
app.use(cors());

// Serve the static frontend from ./public
app.use(express.static(path.join(__dirname, "public")));

// Proxy one hour of treasure data, e.g. /api/hour/00, /api/hour/01, ...
app.get("/api/hour/:h", async (req, res) => {
  const hour = req.params.h.padStart(2, "0");
  const upstreamUrl = `https://a.windbornesystems.com/treasure/${hour}.json`;

  try {
    const response = await fetch(upstreamUrl);
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Upstream returned ${response.status}` });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Proxy error", err);
    res.status(500).json({ error: "Proxy server error" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
