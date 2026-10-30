// fan entries, involves checking the rules and saving each entry.
import {FieldValue} from "firebase-admin/firestore";
import {db, bucket}  from "./firebaseAdmin.js";

const MAX_ENTRY_BYTES = 2*1024*1024*1024; // 2 GB, which is deepgram's limit at the moment
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function normalizeEmail(email) {
    return String(email ?? "").trim().toLowerCase();
}

// 45 --> "45 seconds" or 600 seconds becomes 10 minutes
function describeLength(seconds) {
    return seconds % 60 === 0 && seconds >= 60 ? `${seconds/60} minutes` : `${seconds} seconds`;
}

// contest must exist, be open, and still be before its deadline.
async function loadOpenContest(contestId) {
    const ref = db.collection("contests").doc(contestId);
    const snap = await ref.get();
    if (!snap.exists) throw fail("No contest with that ID.", 404);
    const contest = snap.data();

    if (contest.status !== "open") throw fail("This contest isn't accepting entries.", 409);
    if (contest.deadline.toDate() <= new Date()) throw fail("This contest's deadline has passed.", 409);

    return {ref, contest};
}

// one fan's entries in one contest. Fans are identified by PayPal email until fan accounts exist for now
function entriesByFan(contestId, email) {
    return db.collection("entries").where("contestId", "==", contestId).where("paypalEmail", "==", email);
}

function limitMessage(max) {
    return max === 1 ? "You've already entered this contest." : `You've already used all ${max} of your entries for this contest!`;
}

// if an entry is rejected AFTER its file is uploaded, then the file will be deleted so that Storage won't fill 
// up with a bunch of rejected files (conserves memory).
async function deleteUpload(contestId, storagePath) {
    if (!storagePath.startsWith(`entries/${contestId}/`)) return; // only ever this contest's entry files
    await bucket.file(storagePath).delete({ignoreNotFound: true}).catch(() => {});

}

// before uploading, ask if this fan can still enter. saves them from uploading a big file for nothing
export async function checkCanEnter(contestId, rawEmail) {
    const email = normalizeEmail(rawEmail);
    if (!EMAIL_PATTERN.test(email)) throw fail("Enter a valid PayPal email.",  400);

    const { contest } = await loadOpenContest(contestId);
    const used = (await entriesByFan(contestId, email).get()).size;
    if (used >= contest.maxEntriesPerFan) {
        throw fail(limitMessage(contest.maxEntriesPerFan), 409); // if user has surpassed their entries
    }
    return {ok: true, remaining: contest.maxEntriesPerFan-used}; // return the number of entries they have left. 
}

// after file is uploaded, check every rule , save the user's entry and then increment the contest's entry counter.
export async function createEntry(contestId, input) {
    const email = normalizeEmail(input.paypalEmail);
    const fanName = String(input.fanName ?? "").trim();
    const title = String(input.title ?? "").trim();
    const description = String(input.description ?? "").trim();
    const storagePath = String(input.storagePath ?? "");
    const durationSec = Number(input.durationSec);

    try {
        const errors = [];
        if (fanName.length < 1 || fanName.length > 60) errors.push("Add the name you want to be credited as (up to 60 characters).");
        if (!EMAIL_PATTERN.test(email)) errors.push("Enter a valid PayPal email.");
        if (title.length > 100) errors.push("Keep the title under 100 characters.");
        if (description.length > 1000) errors.push("Keep the description under 1000 characters.");
        if (!storagePath.startsWith(`entries/${contestId}/`)) errors.push("The entry file is missing. Please upload it again.");
        if (errors.length > 0) throw fail(errors.join(" "), 400);

        const {ref: contestRef, contest} = await loadOpenContest(contestId);

        // trust Storage's own record of the file, not what the browser claims.
        const file = bucket.file(storagePath);
        const [exists] = await file.exists();
        if (!exists) throw fail("The entry file is missing. Please upload it again.", 400);
        
        const [meta] = await file.getMetadata();
        const sizeBytes = Number(meta.size);
        const contentType = meta.contentType || "";
        const kind = contentType.startsWith("video/") ? "video" : contentType.startsWith("audio/") ? "audio" : null;

        if (!kind || !contest.entryFormats.includes(kind)) {
            throw fail(`This contest only accepts ${contest.entryFormats.join(" or ")} entries.`, 400);

        }
        if (sizeBytes > MAX_ENTRY_BYTES) throw fail(`Entries can be up to 2 GB.`, 400);

        // length comes from browser for now. screening checks the real length later.
        if (Number.isFinite(durationSec) && (durationSec < contest.minLengthSec -1 || durationSec > contest.maxLengthSec +1)) {
            throw fail(`Entries must be ${describeLength(contest.minLengthSec)} to ${describeLength(contest.maxLengthSec)} long.`, 400);
        }

        // A transaction re-checks the entry limit and saves everything at once, so two submissions
        // arriving at the same moment can't both slip past the limit or miscount.
        const entryRef = db.collection("entries").doc(); // new ID, chosen before saving
        const entryCount = await db.runTransaction(async (tx) => {
            const [contestSnap, mine] = await Promise.all([tx.get(contestRef), tx.get(entriesByFan(contestId, email))]);
            const current = contestSnap.data();
            if (mine.size >= current.maxEntriesPerFan) throw fail(limitMessage(current.maxEntriesPerFan), 409);

            tx.set(entryRef, {
                contestId,
                fanName,
                paypalEmail: email, // private: never shown publicly
                title: title || null,
                description: description || null,
                storagePath,
                contentType,
                sizeBytes,
                durationSec: Number.isFinite(durationSec) ? durationSec : null,
                status: "submitted", // screening moves it to "shortlisted" or "flagged"
                createdAt: FieldValue.serverTimestamp(),
            });
            tx.update(contestRef, {entryCount: FieldValue.increment(1)});

            return (current.entryCount ?? 0) + 1;
        });

        return {id: entryRef.id, status: "submitted", entryCount};
    } catch (err) {
        await deleteUpload(contestId, storagePath); // a rejected entry's file isn't kept.
        throw err;
    }
} 


// creator's decision. shortlist, reject, or null to undo their decision
// stored separately from AI's verdict because the AI only flags while the creator actually decides.
export async function decideEntry(entryId, decision) {
    if (decision !== null && decision !== "shortlist" && decision !== "reject") {
        throw fail("The decision must be shortlist, reject, or null.", 400);
    }

    const ref = db.collection("entries").doc(entryId);
    const snap = await ref.get();
    if (!snap.exists) throw fail("No entry with that ID.", 404);

    await ref.update({
        creatorDecision: decision,
        decidedAt: decision ? FieldValue.serverTimestamp() : null,
    });
    return {id: entryId, creatorDecision: decision};
}

