// junk checks that don't even need AI: exact same file submitted twice, and near-copies of another entry
import {db, bucket} from "./firebaseAdmin.js";
import {normalize} from "./searchTranscripts.js";

const NEAR_COPY_LIMIT = 0.9; // flag when 90% or more of the words match, in the same order.
const SIZE_TOLERANCE = 0.1; // only compare entries within 10% of each other's length and word count

// size tolerance is comparing entries that are the exact same

// file's fingerprint (an MD5 hash) , which Firebase Storage calculates for every upload.
// Identical files always have identical fingerprints, so this needs no extra work
// MD5 hash is a short code computed from every byte of the file. 
// TWO FILES WITH THE SAME MD5 HASH ARE THE EXACT SAME FILE! 

// Storage (Google Firebase) already did the work of calculating this MD5 hash for us, we just read it and see 
// if the files are the same. 
export async function fileFingerprint(storagePath) {
    const [meta] = await bucket.file(storagePath).getMetadata();
    return meta.md5Hash ?? null; 
}

// This is actually Leetcode's longest common subsequence problem.
// All we are doing is finding the largest number of words two transcripts share IN THE SAME ORDER 
// how similar two word lists are IN ORDER, so the most words they share in the same order, divided by 
// the longer list's length. 1 = identical, 0 = nothing in common!
// Its a range between 0 to 1

export function orderedSimilarity(a,b) {
    if (a.length === 0 || b.length === 0) return 0; // if transcripts is empty, return 0.

    let previous = new Array(b.length+1).fill(0); // we initialize an array of 0's, with an extra spot for empty prefixes.
    // i tracks how many words from transcript A we've considered.
    // j tracks how many words from transcript B we've considered.
    // previous stores dynamic programming results for the previous row.
    // row stores the results currently being calculated. 
    for (let i = 1; i <= a.length; i++) { // iterates through transcript A, comparing its words against transcript B.
        const row = new Array(b.length + 1).fill(0);

        for (let j = 1; j <= b.length; j++) {
            if (a[i-1] === b[j-1]) { // the words match!
                row[j] = previous[j-1] + 1; // take longest common subsequence for 2 earlier prefixes and extend it by one matching word.
            } else { // words don't match
                row[j] = Math.max(previous[j], row[j-1]); // we retain whichever gives us the longer common subsequence.
            }
        }
        previous = row; // after finishing the previous row, we replace it with the row we just calculated and keep going.
    }
    // b.length has the longest length, and we decide by whichever transcript has more words.
    return previous[b.length] / Math.max(a.length, b.length); 
}

// true when two numbers are within 10% of each other.
function similarSize(x,y) {
    if (!x || !y) return false;

    const difference = Math.abs(x-y); // calculate absolute difference bet 2 numbers
    // size tolerance is 0.1 for 10%, can always change later.
    const maxDifference = SIZE_TOLERANCE*Math.max(x,y); // calculate 10% of larger number, which is the max allowed difference
    // if difference is less than calcualted difference, then return true; otherwise its too large (greater than 10% and we return false!)
    return difference <= maxDifference;
}

// turns entry's submission time into a short date like "Oct 28", for flag messages.
function day(entry) {
    if (!entry.createdAt) return "earlier";

    const date = entry.createdAt.toDate(); // Firestore Timestamp --> normal JavaScript date
    return date.toLocaleDateString("en-US", {month: "short", day: "numeric"});

}

// turns Deepgram's words into plain lowercase words: "Literally" --> "literally"
function cleanWords(words) {
    const clean = [];
    for (const w of words) {
        const word = normalize(w.word);
        if (word) clean.push(word); // skips words that were only punctuation
    }
    return clean;
}

// compares an entry with entries submitted BEFORE it in the same contest, so only the later copy gets flagged.

// returns list of flags: empty if nothing looks duplicated.
export async function findDuplicates({entryId, entry, fileHash, words, durationSec}) {
    const snapshot = await db.collection("entries").where("contestId", "==", entry.contestId).get();

    // keep only entries submitted before this one.
    const earlier = [];
    for (const doc of snapshot.docs) {
        if (doc.id === entryId) continue; // skip the entry we're screening.

        const other = doc.data();
        other.id = doc.id;

        if (!other.createdAt || !entry.createdAt) continue; // can't compare without both times.
        const otherIsOlder = other.createdAt.toMillis() < entry.createdAt.toMillis();
        if (otherIsOlder) {
            earlier.push(other);
        }
    }

    // 1. exact same file: same fingerprint means same file!
    if (fileHash) {
        for (const other of earlier) {
            if (other.fileHash === fileHash) {
                const message = `This is the exact same file as the entry by ${other.fanName}, submitted ${day(other)}.`;
                return [{type: "duplicate", risk: "high", message}];
            }
        }
    }

    // 2. near-copies, so they hold *almost* the same words (in the same order too)

    const mine = cleanWords(words); // we normalize the words first
    if (mine.length < 20) return []; // not enough speech to actually judge it 
    for (const other of earlier) {
        const screening = other.screening;
        if (!screening || !screening.transcriptPath) continue; // entry wasnt even screened

        // cheap filter first: only compare entries with a similar length and word count
        // we only download transcripts for entries that could actually be copies
        if (!similarSize(screening.durationSec, durationSec)) continue;
        if (!similarSize(screening.wordCount, words.length)) continue;

        // download the other transcript and clean it's words up as well
        const [contents] = await bucket.file(screening.transcriptPath).download();
        const transcript = JSON.parse(contents.toString());
        const theirs = cleanWords(transcript.words);
        const similarity = orderedSimilarity(mine, theirs);

        if (similarity >= NEAR_COPY_LIMIT) { // greater than 90% 
            const percent = Math.round(similarity * 100);
            const message = // we already know the percent is greater than 90 
                `About ${percent}% of this entry's words match the entry by ${other.fanName}, ` +
                `submitted ${day(other)}, in the same order. It may be a re-edited copy.`;
            return [{type: "duplicate", risk: "medium", message}];
        }
        
    }
    return []; // no duplicates found! 
}