import express from "express";
import cors from "cors";
import {db, bucket} from "./firebaseAdmin.js";
import { transcribeEpisode } from "./transcribeEpisode.js";
import {searchTranscripts} from "./searchTranscripts.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "http://localhost:5173"}));
app.use(express.json());

app.get("/api/health", (req,res) => {
    res.json({ok: true, message: "Highlighter server is running."});
});

// Lists every episode, newest first, and checks that each one's video file exists within Storage.
// Proves that server can read both Firestore and Storage.

app.get("/api/episodes", async (req,res) => {
    try {
        const snapshot = await db.collection("episodes").orderBy("createdAt", "desc").get();

        const episodes = await Promise.all(
            snapshot.docs.map(async (doc) => {
                const data = doc.data();
                const [fileExists] = await bucket.file(data.storagePath).exists();
                return { id: doc.id, title: data.title, status: data.status, storagePath: data.storagePath, fileExists};
            })
        );
        res.json(episodes);
    } catch (err) {
        console.error(err);
        res.status(500).json({error: err.message});
    }
});
// transcribes episode (or returns saved result if already done transcribing).
// adds ?force=true to redo transcription if stuck.
app.post("/api/episodes/:id/transcribe", async(req,res) => {
    try {
        const result = await transcribeEpisode(req.params.id, { force: req.query.force === "true" });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(err.status || 500).json({error: err.message});
    }
});

// returns a saved transcript with every word and its timestamps.
app.get("/api/episodes/:id/transcript", async (req, res) => {
    try {
        const doc = await db.collection("transcripts").doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).json({error: "No transcript yet. Transcribe the episode first."});

        }

        const { transcriptPath, durationSec } = doc.data();
        const [contents] = await bucket.file(transcriptPath).download();
        const {text, words} = JSON.parse(contents.toString("utf8"));
        res.json({episodeId: doc.id, text, words, durationSec});

    } catch (err) {
        console.error(err);
        res.status(500).json({error: err.message});
    }
});

// finds every moment a word/phrase is said
app.get("/api/search", async (req,res) => {
    try {
        const q = (req.query.q || "").trim();
        if (!q) return res.status(400).json({error: "Add something to search for, like ?q=literally"});

        const episodeIds = req.query.episodes ? req.query.episodes.split(",") : null;
        const results = await searchTranscripts(q, episodeIds);
        res.json({ query: q, count: results.length, results});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: err.message});
    }
})

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});