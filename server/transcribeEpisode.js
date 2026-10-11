// transcribes one episode with Deepgram and saves the result.
// the full transcript goes in Storage (no size limit); small summary goes in Firestore
import {FieldValue} from "firebase-admin/firestore";
import {db, bucket} from "./firebaseAdmin.js";
import { transcribeFromUrl } from "./deepgram.js";

export async function transcribeEpisode(episodeId, { force = false} = {}) {
    const episodeRef = db.collection("episodes").doc(episodeId);
    const transcriptRef = db.collection("transcripts").doc(episodeId);

    const snap = await episodeRef.get();
    if (!snap.exists) {
        const err = new Error(`No episode with ID ${episodeId}`);
        err.status = 404;
        throw err;
    }
    const episode = snap.data();

    // dont pay deepgram twice if already transcribed
    if (episode.status === "ready" && !force) {
        return { cached: true, episodeId, wordCount: episode.wordCount, durationSec: episode.durationSec };
    }
    // if someone already started it, dont start second copy.
    if (episode.status === "transcribing" && !force) {
        const err = new Error("This episode is already being transcribed.");
        err.status = 409;
        throw err;
    }

    await episodeRef.update({status: "transcribing"});

    try {
        // private link to file that works for 1 hour, so deepgram can fetch directly.
        const [signedUrl] = await bucket.file(episode.storagePath).getSignedUrl({
            version: "v4",
            action: "read",
            expires: Date.now() + 60 * 60 * 1000,
        });

        const result = await transcribeFromUrl(signedUrl);

        // save the full transcript as a file in Storage because there's no size limit.
        // keep only a SMALL summary in Firestore (1 MB limit per record.)
        const transcriptPath = `transcripts/${episodeId}.json`;
        await bucket.file(transcriptPath).save(
            JSON.stringify({text: result.text, words: result.words}),
            {contentType: "application/json"}
        );

        await transcriptRef.set({
            episodeId,
            transcriptPath,
            wordCount: result.words.length,
            durationSec: result.durationSec,
            createdAt: FieldValue.serverTimestamp(),
        });

        await episodeRef.update({
            status: "ready",
            durationSec: result.durationSec,
            wordCount: result.words.length,
            transcribedAt: FieldValue.serverTimestamp(),
            error: FieldValue.delete(),
        });
        return { cached: false, episodeId, wordCount: result.words.length, durationSec: result.durationSec};
    } catch (err) {
        // record failure so app can show it, then pass it along.
        await episodeRef.update({status: "error", error: err.message});
        throw err;
    }
}