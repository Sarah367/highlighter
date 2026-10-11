import {db, bucket} from "../firebaseAdmin.js";
import {transcribeFromUrl} from "../deepgram.js";

const episodeId = process.argv[2];
if (!episodeId) {
    console.error("Add an episode ID. Find one at http://localhost:3001/api/episodes");
    process.exit(1);
}

async function main() {
    // look up the episode record in Firestore.
    const doc = await db.collection("episodes").doc(episodeId).get();
    if (!doc.exists) throw new Error(`No episode with ID ${episodeId}`);
    const episode = doc.data();
    console.log(`Episode: ${episode.title} (${episode.storagePath})`);

    // private link to the video that works for 1 hour, so Deepgram cna fetch the file directly from Storage.
    const [signedUrl] = await bucket.file(episode.storagePath).getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 60 * 60 * 1000,
    });

    // send link to Deepgram and wait for the transcript...
    console.log("Sending to Deepgram... (can take a few seconds to a minute)");
    const started = Date.now();
    const result = await transcribeFromUrl(signedUrl);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    console.log(`Done in ${seconds}s. Audio length: ${result.durationSec?.toFixed(1)}s, ${result.words.length} words.\n`);
    console.log("First 30 words with timestamps: ");
    for (const w of result.words.slice(0,30)) {
        console.log(`  ${w.start.toFixed(2)}s - ${w.end.toFixed(2)}s  ${w.word}`);
    }
    console.log(`\nText preview: ${result.text.slice(0, 300)}${result.text.length > 300 ? "..." : ""}`);
}

main()
    .then(() => process.exit(0)) 
    .catch((err) => {
        console.log(err.message);
        process.exit(1);
    });