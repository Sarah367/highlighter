import express from "express";
import cors from "cors";
import { db, bucket } from "./firebaseAdmin.js";
import { transcribeEpisode } from "./transcribeEpisode.js";
import { searchTranscripts } from "./searchTranscripts.js";
import { PRESETS, createContest, listContests, getContest, getPublicContest } from "./contests.js";
import { startFunding, finishFunding } from "./contestFunding.js";
import { checkCanEnter, createEntry } from "./entries.js";
import { screenEntry, listEntries } from "./screenEntry.js";
import { decideEntry } from "./entries.js";

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

// the presets, so the app's form always matches the server's.
app.get("/api/contest-presets", (req, res) => {
    res.json(PRESETS);
});

// checks contest and saves it as a draft.
app.post("/api/contests", async (req,res) => {
    try {
        const contest = await createContest(req.body);
        res.status(201).json(contest);
    } catch(err) {
        if (!err.status) console.error(err);
        res.status(err.status || 500).json({error: err.message, details: err.details});
    }
});

// lists every contest, newest first.
app.get("/api/contests", async(req,res) => {
    try {
        res.json(await listContests());
    } catch(err) {
        console.error(err);
        res.status(500).json({error: err.message});
    }
});

// gets one contest
app.get("/api/contests/:id", async (req, res) => {
    try {
        const contest = await getContest(req.params.id);
        if (!contest) return res.status(404).json({error: "No contest with that ID."});
        res.json(contest);
    } catch (err) {
        console.error(err);
        res.status(500).json({error: err.message});
    }
});

function sendError(res, err) {
    if (!err.status || err.status >= 500) console.error(err.paypal ?? err);
    res.status(err.status || 500).json({error: err.message});
}

// funding; create the PayPal order for a contest's prize pool
app.post("/api/contests/:id/order", async (req,res) => {
    try {
        res.json(await startFunding(req.params.id));

    } catch (err) {
        sendError(res, err);
    }
});

// after the creator approves in PayPal, capture the payment and open the contest.
app.post("/api/contests/:id/capture", async(req,res) => {
    try {
        res.json(await finishFunding(req.params.id, req.body.orderId));
    } catch (err) {
        sendError(res, err);
    }
});

// a contest as fans see it. drafts stay hidden until their prize pool is funded.
app.get("/api/public/contests/:id", async (req,res) => {
    try {
        const contest = await getPublicContest(req.params.id);
        if (!contest) return res.status(404).json({error: "This contest doesn't exist or isn't open yet."});
        res.json(contest);
    } catch (err) {
        sendError(res, err);
    }
});

// entries, step 1: before uploading, check that this fan can still enter.
app.post("/api/contests/:id/entries/check", async (req, res) => {
    try {
        res.json(await checkCanEnter(req.params.id, req.body.paypalEmail));
    } catch (err) {
        sendError(res,err);
    }
});

// entries, step 2: after uploading, check every rule, and save the entry.
app.post("/api/contests/:id/entries", async (req, res) => {
    try {
        const entry = await createEntry(req.params.id, req.body);
        res.status(201).json(entry);
        // start screening in the background, fan gets confirmation quickly while server transcribes and checks
        // the entry on its own time.
        screenEntry(entry.id).catch((err) => console.error(`Screening ${entry.id} failed: `, err.message));
        
    } catch (err) {
        sendError(res, err);
    }
});
// screening, run for one entry or redo with force
app.post("/api/entries/:id/screen", async (req,res) => {
    try {
        res.json(await screenEntry(req.params.id, {force: req.query.force === "true"}));

    } catch (err) {
        sendError(res,err);
    }
});

// creator's list of contest's entries, with the screening results
app.get("/api/contests/:id/entries", async(req, res) => {
    try {
        res.json(await listEntries(req.params.id));
    } catch (err) {
        sendError(res,err);
    }
});
// creator's decision on entry
app.post("/api/entries/:id/decision", async (req,res) => {
    try {
        res.json(await decideEntry(req.params.id, req.body.decision ?? null));
    } catch (err) {
        sendError(res,err);
    }
});

// 

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});