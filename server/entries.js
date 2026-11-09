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

// one signed-in fan's entries in one contest, by account
function entriesByAccount(contestId, uid) {
    return db.collection("entries").where("contestId", "==", contestId).where("fanUid", "==", uid);
}

// how many different entries are in these query results. An entry can show up in both lists
// (same email AND same account), so each entry ID is only counted once.
// this means that a signed-in fan can't dodge the limit simply by switching emails.
function countEntries(snapshots) {
    const ids = [];
    // we search through both paypal email and the fan account name, because a fan can maliciously
    // enter multiple entries by switching out the emails... but we know that they are doing this 
    // because all entries will be linked back to their same account name.

    // thus, looping through both account names and paypal emails allows us to collect ALL POSSIBLE
    // entry IDs from a user.
    for (const snapshot of snapshots) {
        for (const doc of snapshot.docs) { // collects the entry IDs, which is the main source of truth for finding entries from a fan
            if (!ids.includes(doc.id)) ids.push(doc.id);
        }
    }

    return ids.length;
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
// user: the signed-in fan, or null. Signed-in fans' entries count by email AND by account,
// so they can't get around the limit by switching emails.
export async function checkCanEnter(contestId, rawEmail, user) {
    const email = normalizeEmail(rawEmail);
    if (!EMAIL_PATTERN.test(email)) throw fail("Enter a valid PayPal email.",  400);

    const { contest } = await loadOpenContest(contestId);
    const lists = [await entriesByFan(contestId,email).get()];
    if (user) lists.push(await entriesByAccount(contestId, user.uid).get());
    const used = countEntries(lists);
    if (used >= contest.maxEntriesPerFan) {
        throw fail(limitMessage(contest.maxEntriesPerFan), 409); // if user has surpassed their entries
    }
    return {ok: true, remaining: contest.maxEntriesPerFan-used}; // return the number of entries they have left. 
}

// after file is uploaded, check every rule , save the user's entry and then increment the contest's entry counter.
// user: the signed-in fan, or null. Signed-in fans' entries are linked to their account (for My entries).
export async function createEntry(contestId, input, user) {
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
            const contestSnap = await tx.get(contestRef);
            const lists = [await tx.get(entriesByFan(contestId, email))];
            if (user) lists.push(await tx.get(entriesByAccount(contestId, user.uid)));
            const current = contestSnap.data();
            
            if (countEntries(lists) >= current.maxEntriesPerFan) throw fail(limitMessage(current.maxEntriesPerFan), 409);

            tx.set(entryRef, {
                contestId,
                fanName,
                paypalEmail: email, // private: never shown publicly
                fanUid: user ? user.uid : null, // fan's account, if they were signed in (for My entries)
                title: title || null,
                description: description || null,
                storagePath,
                contentType,
                sizeBytes,
                fileHash: meta.md5Hash || null, // files fingerprint, saved right away so duplicates are caught when screening runs
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

// creator's decision on many entries at once: bulk shortlist, reject, or undo (null)
// every entry must belong to this contest. Firestore saves at most 500 changes in one batch,
// so big selections are checked and saved in chunks
export async function decideEntries(contestId, entryIds, decision) {
    if (decision !== null && decision !== "shortlist" && decision !== "reject") {
        throw fail("The decision must be shortlist, reject, or null.", 400);
    }

    if (!Array.isArray(entryIds) || entryIds.length === 0) throw fail("Select at least one entry.", 400);
    if (entryIds.length > 5000) throw fail("That's too many entries at once. Try a smaller selection.", 400);


    const refs = [];
    for (const id of entryIds) { // push all entries that were selected.
        refs.push(db.collection("entries").doc(String(id)));
    }

    const CHUNK = 400;  // safely under Firestore's 500 change limit

    // first, check every entry exists and belongs to this contest, before changing anything
    for (let i = 0; i < refs.length; i+= CHUNK) {
        // db.getAll() loads many entries in one request, ... spreads the list of references into separate args
        const snaps = await db.getAll(...refs.slice(i, i + CHUNK));
        for (const snap of snaps) {
            if (!snap.exists || snap.data().contestId !== contestId) {
                throw fail("Every selected entry must belong to this contest.", 400);
            }
        }
    }

    // now after checking that every entry is valid, we actually
    // save the decision on all of them, one chunk at a time.
    for (let i = 0; i < refs.length; i += CHUNK) {
        const batch = db.batch();
        for (const ref of refs.slice(i, i+CHUNK)) {
            batch.update(ref, {
                creatorDecision: decision,
                decidedAt: decision ? FieldValue.serverTimestamp() : null,
            });
        }
        await batch.commit();
    }
    return { updated: refs.length, creatorDecision: decision };
}

// "1st", "2nd"  etc
function placeLabel(place) {
    if (place === 1) return "1st";
    if (place === 2) return "2nd";
    if (place === 3) return "3rd";
    return `${place}th`;
}

// where a contest is, from a fan's point of view: "open" "judging" (past the deadline, winners not announced yet),
// or "winners" (winners announced, once they're being paid)
function contestStage(contest) {
    if (contest.status === "paying" || contest.status === "paid") return "winners";
    if (contest.status === "open" && contest.deadline.toDate() > new Date()) return "open";
    return "judging";
}

// a signed-in person's entries, for My entries. Only what a fan should see: the contest's stage,
// and whether they won. Never the AI's flags or the creator's decision, which are the creator's private
// review tools. Winners only show once they're being paid, since before that, the creator can still change them
export async function listMyEntries(uid) {
    const snapshot = await db.collection("entries").where("fanUid", "==", uid).get(); // get person's entries

    const contests = {}; // each contest is loaded once, even if they entered it several times
    const mine = [];


    // small cache: loads each contest once, even if the person entered that contest multiple times.
    // if a contest allows multiple entries, we do 1 database read instead of potentially hundreds since
    // we are saving the contest ID 
    for (const doc of snapshot.docs) { // goes through user's entries
        const entry = doc.data();
        if (!(entry.contestId in contests)) {
            const contestSnap = await db.collection("contests").doc(entry.contestId).get();
            contests[entry.contestId] = contestSnap.exists ? contestSnap.data() : null;
        }
        const contest = contests[entry.contestId]; // get the person's entry from the cache


        if (!contest) continue; // the contest was deleted

        const stage = contestStage(contest);

        // did this entry win?? only checked once winners are announced.
        let win = null;
        if (stage === "winners" && Array.isArray(contest.winners)) {
            for (const winner of contest.winners) { // goes through the contest's winners
                if (winner.entryId !== doc.id) continue; // skips every winner that isn't this entry
                let paymentStatus = "PENDING"; // found it, find out how the payment is going
                if (contest.payout && contest.payout.items) { // if paypal has reported back, this holds each place's status, so it looks for this winner's place, and uses that status
                    for (const item of contest.payout.items) {
                        if (item.place === winner.place) paymentStatus = item.status;
                    }
                }
                // build win details (if entry wasn't winning, then "win" stays null)
                win = {place: winner.place, placeLabel: placeLabel(winner.place), prizeCents: winner.prizeCents, paymentStatus };
            }
        }

        mine.push({
            id: doc.id,
            title: entry.title || "Untitled entry",
            contestId: entry.contestId,
            contestTitle: contest.title,
            deadline: contest.deadline.toDate().toISOString(),
            stage,
            win,
            createdAt: entry.createdAt ? entry.createdAt.toDate().toISOString() : null,
        });
    }
    mine.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))); // newest first
    return mine;
}