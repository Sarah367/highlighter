import {FieldValue} from "firebase-admin/firestore";
import {db} from "./firebaseAdmin.js";
import {getContest} from "./contests.js";

// flags that mean an entry broke a rule.. "unchecked" means the Ai could not run, so we are not disqualifying it
const RULE_FLAGS = ["context", "source", "unedited", "length", "duplicate", "brief"];

// creates an error with HTTP status code attached so server can tell the browser what kind of problem happened.
function fail(message,status) {
    const err = new Error(message); // creates Java's built in error Object with the message in it
    err.status = status; // adds extra property to the Error Object, which is status
    return err; // returns the error
}

// "1 entry" or "3 entries": right word for the number
function count(n, singular, plural) {
    return `${n} ${n === 1 ? singular : plural}`;
}

// true when screening gave the entry at least one real rule flag.
function hasRuleFlag(entry) {
    if (!entry.screening || !entry.screening.flags) {
        return false;
    }

    for (const flag of entry.screening.flags) {
        if (RULE_FLAGS.includes(flag.type)) return true;
    }
    return false;
}

// "end contest now" button. no more entries after this, and winners can be picked
export async function closeContest(contestId) {
    const contest = await getContest(contestId);
    if (!contest) throw fail("No contest with that ID.", 404);

    if (contest.status !== "open") throw fail("Only an open contest can be ended!", 409);

    await db.collection("contests").doc(contestId).update({
        status: "closed", // change status to closed
        closedAt: FieldValue.serverTimestamp(), // record the time in which the contest was closed!
   });
   return getContest(contestId);


}

// everything the creator needs to pick winners: who can win, how many winners are actually needed, and anything
// that has to happen first.
export async function winnerOptions(contestId) {
    const contest = await getContest(contestId);
    if (!contest) throw fail("No contest with that ID.", 404);

    const snapshot = await db.collection("entries").where("contestId", "==", contestId).get();

    let stillScreening = 0; // entries that haven't finished the screening process yet.
    let needsReview = 0; // flagged entries that the creator hasn't shortlisted or rejected yet.
    const candidates = []; // winners in good standing (these are possible "winning" candidates)

    for (const doc of snapshot.docs) { // loop through each entry
        const entry = doc.data();

        if (entry.status === "submitted" || entry.status === "screening") {
            stillScreening++; // its still being screened
            continue; // so skip it.
        }
        const flagged = hasRuleFlag(entry); 
        if (flagged && !entry.creatorDecision) needsReview++; // if entry has been flagged but creator hasn't made a decision, mark it as needs review

        // disqualified: screening flagged it AND the creator rejected it, so it broke the rules. Its out and doesn't count towards the prizes owed.
        if (flagged && entry.creatorDecision === "reject") continue;

        candidates.push({
            id: doc.id,
            title: entry.title || `Entry by ${entry.fanName}`,
            fanName: entry.fanName,
            // entries rejected for taste stay in good standing, otherwise a creator could maliciously reject every
            // genuine entry to avoid paying (and thus steal their fan's content/creativity)
            rejected: entry.creatorDecision === "reject", 
        });

        // entries the creator didn't reject come first in the list, so they're the obvious choice
        candidates.sort((a,b) => Number(a.rejected) - Number(b.rejected));

        // every prize place must be awarded while there are entries in good standing to award it to. 
        // we take the minimum of the number of prizes and number of candidates, whihcever runs out first
        // 3 prizes and 1000 candidates is fine.
        // 3 prizes and 2 candidates means not enough entries.
        // 3 prizes and 0 candidates = nobody to reward, so give creator a full refund.
        // LESS candidates than prizes means that we are hitting an edge case
        const winnersNeeded = Math.min(contest.prizesCents.length, candidates.length);

        return {
            status: contest.status,
            closed: contest.closed,
            stillScreening,
            needsReview,
            winnersNeeded,
            prizesCents: contest.prizesCents,
            candidates, 
            winners: contest.winners || null,
        };
    }
}

// saves the winners , in place order: entryIds[0] wins 1st place, entryIds[1] wins 2nd, entryIds[2] wins 3rd
export async function pickWinners(contestId, entryIds) {
    if (!Array.isArray(entryIds)) {
        throw fail("Send the winners as a list of entry IDs, in place order.", 400);
    }

    const options = await winnerOptions(contestId);
    if (options.status === "paid") {
        throw fail("This contest's winners have already been paid!", 409);
    }
    if (!options.closed) {
        throw fail("Winners can only be picked after the contest closes. End it early, or wait for the deadline.", 409);

    }
    if (options.stillScreening > 0) {
        const waiting = count(options.stillScreening, "entry is", "entries are");
        throw fail(`${waiting} still being screened. Wait for screening to finish first.`, 409);
    }
    if (options.needsReview > 0) {
        const flagged = count(options.needsReview, "flagged entry", "flagged entries");
        throw fail(`Review the ${flagged} first: shortlist or reject each one.`, 409);
    }

    // no skipping places: exactly as many winners as places that can be filled...
    // this means a creator can't just give one person 3rd place and then close their entry.
    // they MUST fill out at least as many prize places as there are contestants. 
    // 1 contestant means --> 1st place
    // 2 contestants means --> 1st and 2nd place filled out
    if (entryIds.length !== options.winnersNeeded) {
        throw fail(
            `Pick exactly ${count(options.winnersNeeded, "winner", "winners")}: one for each prize, from 1st place down, ` +
            `as long as there are entries in good standing to award them to.`,
            400
        );
    }

    const winners = [];
    const used = [];
    for (let i = 0; i < entryIds.length; i++) {
        const entryId = entryIds[i];
        // check to make sure we aren't giving multiple prizes to one person.
        if (used.includes(entryId)) throw fail("An entry can only win one place!", 400);
        used.push(entryId);

        // the winner must be one of the entries in good standing!
        let candidate = null;
        for (const c of options.candidates) {
            if (c.id === entryId) candidate = c;
        }

        if (!candidate) {
            throw fail("Every winner must be an entry in good standing in this contest.", 400);
        }

        winners.push({
            place: i+1,
            entryId,
            fanName: candidate.fanName,
            title: candidate.title,
            prizeCents: options.prizesCents[i],
        });

    }

    // prizes nobody was left to win. They'll be refunded to the creator when winners are paid!
    let unusedCents = 0;
    // starts at i = winners.length; the first position after the winners.
    // With 2 winners, thats position 2, the 3rd place prize... keeps adding until end of list
    for (let i = winners.length; i < options.prizesCents.length; i++) {
        unusedCents += options.prizesCents[i];
    }

    await db.collection("contests").doc(contestId).update({
        status: "closed", // a contest that closed at its deadline becomes officially closed here
        winners, 
        unusedCents,
        winnersPickedAt: FieldValue.serverTimestamp(),
    });

    return getContest(contestId);

}


