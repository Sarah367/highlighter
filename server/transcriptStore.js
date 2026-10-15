// memory cache to keep transcripts in memory after the first read 
// so searches don't download the same files over and over again from Storage.

import {db, bucket} from "./firebaseAdmin.js";

const cache = new Map(); // episodeId --> { text, words }

export async function getTranscript(episodeId) {
    // if transcript is already in memory (in map) just return it immediately; no need to bother any further.
    if (cache.has(episodeId)) return cache.get(episodeId);

    const doc = await db.collection("transcripts").doc(episodeId).get();
    if (!doc.exists) return null; // returns null for episodes that aren't transcribed yet.

    const [contents] = await bucket.file(doc.data().transcriptPath).download();
    const transcript = JSON.parse(contents.toString("utf8"));
    cache.set(episodeId, transcript); // store in cache for future fetching.
    return transcript;
}

// is called when an episode is re-transcribed, so old copy is not used.
export function forgetTranscript(episodeId) {
    cache.delete(episodeId);
}
