import express from "express";
import cors from "cors";
import {db, bucket} from "./firebaseAdmin.js";

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

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});