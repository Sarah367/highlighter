// AI screening, part 1: transcribe an entry, check its real length, and trace its speech
// back to the creator's episodes. Part 2 (the Gemini context check) builds on these results.
import { FieldValue } from "firebase-admin/firestore";
import { db, bucket } from "./firebaseAdmin.js";
import { transcribeFromUrl } from "./deepgram.js";
import { getTranscript } from "./transcriptStore.js";
import { normalize } from "./searchTranscripts.js";
import { findSources, longestContinuousPiece } from "./matchSources.js";
import { getPublicContest } from "./contests.js";
import { checkContext } from "./contextCheck.js";
 
const UNMATCHED_LIMIT = 0.3; // in "required" contests, flag entries where over 30% of the speech isn't from the episodes
// 30% due to the fact that deepgram mishears words and is not completely accurate.
function fail(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function clock(seconds) {
    const s = Math.floor(seconds);
    return `${Math.floor(s/60)}:${String(s % 60).padStart(2, "0")}`;
}

function describeLength(totalSeconds) {
    const seconds = Math.round(totalSeconds);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (!minutes) return `${rest} seconds`;
    return rest ? `${minutes} minutes ${rest} seconds` : `${minutes} minutes`;
}

export async function screenEntry(entryId, {force = false} = {}) {
    const entryRef = db.collection("entries").doc(entryId);
    const snap = await entryRef.get();

    if (!snap.exists) throw fail("No entry with that ID.", 404);
    const entry = snap.data();

    // same pattern as transcribing episodes: never screen twice at once, never redo finished work.
    if (entry.status === "screening" && !force) throw fail("This entry is already being screened.", 409);
    if (entry.status !== "submitted" && entry.status !== "error" && !force) {
        return {id: entryId, status: entry.status, cached: true};
    }

    await entryRef.update({status: "screening"});

    try {
        // getPublicContest also tells us which episodes this contest's entries may use.
        const contest = await getPublicContest(entry.contestId);
        if (!contest) throw fail("This entry's contest isn't available.", 404);

        // 1. transcribe the entry with deepgram, the same way as episodes are transcribed.
        const [signedUrl] = await bucket.file(entry.storagePath).getSignedUrl({
            version: "v4",
            action: "read",
            expires: Date.now() + 60 * 60 * 1000,
        });
        const result = await transcribeFromUrl(signedUrl);

        const transcriptPath = `entry-transcripts/${entryId}.json`;
        await bucket.file(transcriptPath).save(JSON.stringify({text: result.text, words: result.words}), {
            contentType: "application/json",
        });
        const flags = []; // each flag: {type, message}. the creator sees these and decides.

        // 2. the real length, measured by Deepgram. The browser's number could have been faked.
        const duration = result.durationSec;
        if (duration != null && (duration < contest.minLengthSec - 1 || duration > contest.maxLengthSec+1)) {
            flags.push({
                type: "length",
                message: `This entry is ${describeLength(duration)} long, but the contest allows ${describeLength(contest.minLengthSec)} to ${describeLength(contest.maxLengthSec)}`,
            });
        }

        let sources = null;
        const episodes = []; // eligible episodes' transcripts, also used by context check function 
        if (contest.sourceRule !== "none" && contest.episodes.length > 0) {
            for (const ep of contest.episodes) {
                const transcript = await getTranscript(ep.id);
                if (transcript) episodes.push({id: ep.id, title: ep.title, words: transcript.words});
            }
            sources = findSources(result.words, episodes, normalize);

            const spoken = sources.matchedWords + sources.shortWords + sources.unmatchedWords;
            const unmatchedShare = spoken ? sources.unmatchedWords / spoken : 0;
            // only "required" contests flag this. In "optional" ones (roasts, music videos), original content is welcome.
            if (contest.sourceRule === "required" && spoken >= 10 && unmatchedShare > UNMATCHED_LIMIT) {
                flags.push({
                    type: "source",
                    message: `About ${Math.round(unmatchedShare * 100)}% of the speech in this entry doesn't match your episodes.`,
                });
            }
            const longest = longestContinuousPiece(sources.segments);
            if (longest && duration && longest.length >= duration * 0.8) {
                flags.push({
                    type: "unedited",
                    message: `This entry looks like an unedited stretch of "${longest.episodeTitle}" (${clock(longest.episodeStart)} to ${clock(longest.episodeEnd)}), not an edited entry.`,
                });
            }
        }

        // does the entry put the creator's speech in a misleading context?
        // gemini checks the traced pieces and contest brief, only when contest has it turned on and there are traced pieces to judge.
        let contextCheck = null;
        if (contest.fakeQuoteCheck && sources?.segments.length > 0) {
            try {
                contextCheck = await checkContext({contest, segments: sources.segments, episodes});
                for (const issues of contextCheck.issues) {
                    if (issue.risk === "low") continue; // kept in the results, but not worth a flag
                    const label = issue.kind === "fake-quote" ? "Possible fake quote" : "Possibly out of context";
                    flags.push({ type: "context", risk: issue.risk, message: `${label} (${issue.risk} risk): "${issue.quote}". ${issue.explanation}` });
                }
            } catch (err) {
                // if Gemini is down / busy, finish screening anyway, but make sure the creator knows.
                contextCheck = {error: err.message};
                flags.push({ type: "unchecked", message: `The context check couldn't run (${err.message}). Re-screen this entry to try again.` });
            }
        }


        const status = flags.length > 0 ? "flagged" : "shortlisted";
        await entryRef.update({
            status,
            screening: {
                durationSec: duration,
                wordCount: result.words.length,
                transcriptPath,
                matchedWords: sources?.matchedWords ?? null,
                shortWords: sources?.shortWords ?? null,
                unmatchedWords: sources?.unmatchedWords ?? null,
                segments: sources?.segments.slice(0,300) ?? [], // capped, to stay well under Firestore's 1 MB limit
                unmatchedRuns: sources?.unmatchedRuns.slice(0, 50) ?? [],
                contextCheck, // gemini's verdict on whether the entry misrepresents the creator's speech, if it ran
                flags,
                screenedAt: FieldValue.serverTimestamp(),
            },
            error: FieldValue.delete(),
        });
        return {id: entryId, status, flags};
    } catch (err) {
        await entryRef.update({status: "error", error: err.message});
        throw err;
    }
}

// creator's view of a contest's entries, newest first. 
export async function listEntries(contestId) {
    const snapshot = await db.collection("entries").where("contestId", "==", contestId).get();
    return snapshot.docs
        .map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate().toISOString() ?? null,
                screening: data.screening
                    ? { ...data.screening, screenedAt: data.screening.screenedAt?.toDate().toISOString() ?? null}
                    : null,
            };
        })
        .sort((a,b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")); // sorted here, no database index needed.
}