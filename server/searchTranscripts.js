// finds every moment a word or phrase is said across transcribed episodes.
import {db} from "./firebaseAdmin.js";
import {getTranscript} from "./transcriptStore.js";

const MAX_RESULTS = 200;

// "Literally" --> "literally"; keeps letters, numbers, and apostrophes 
export function normalize(word) {
    return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
}

export async function searchTranscripts(query, episodeIds) {
    const terms = query.split(/\s+/).map(normalize).filter(Boolean);
    if (terms.length === 0) return [];
    let episodes;
    if (episodeIds?.length) { // fetches specific episodes (whose status is ready.) if user asks for specific episodes. (or later for contests that only allow specific episodes!)
        const docs = await db.getAll(...episodeIds.map((id) => db.collection("episodes").doc(id)));
        episodes = docs.filter((d) => d.exists && d.data().status === "ready");
    } else { // otherwise fetch all episodes (whose status is ready)
        episodes = (await db.collection("episodes").where("status", "==", "ready").get()).docs;
    }

    const results = [];
    // for each episode, get its transcript from the cache and make a normalized copy of its words, so they can be
    // compared to the search terms.
    for (const ep of episodes) {
        const transcript = await getTranscript(ep.id);
        if (!transcript) continue;
        const words = transcript.words;
        const normalized = words.map((w) => normalize(w.word));
        

        // sliding window:
        // slide along the transcript one word at a time, checking whether the next few words match the search terms in order.
        for (let i = 0; i + terms.length <= words.length; i++) {
            if (terms.every((term,j) => normalized[i+j] === term)) {
                const last = i + terms.length - 1;
                results.push({
                    episodeId: ep.id,
                    episodeTitle: ep.data().title,
                    start: words[i].start,
                    end: words[last].end,
                    before: words.slice(Math.max(0, i-6), i).map((w) => w.word).join(" "),
                    match: words.slice(i, last+1).map((w) => w.word).join(" "),
                    after: words.slice(last+1, last+7).map((w) => w.word).join(" "),
                });
                if (results.length >= MAX_RESULTS) return results;
            }
        }
    }
    return results;
}

