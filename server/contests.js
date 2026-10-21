import {FieldValue} from "firebase-admin/firestore";
import {db} from "./firebaseAdmin.js";
// contests: checking what the creator sent, and saving it as a draft...

// presets is just a starting set of settings for common contest types. The creator can change any of the settings.
// presets are entirely OPTIONAL to select. users can always create their own *custom* contests.
// can be a max of 10 minutes; as long as possible so as to not limit the creativity of devoted/dedicated fans.
export const PRESETS = {
    compilation: { label: "Compilation", entryFormats: ["video"], minLengthSec: 15, maxLengthSec: 600, sourceRule: "required", fakeQuoteCheck: true, maxEntriesPerFan: 1},
    roast: { label: "Roast", entryFormats: ["video"], minLengthSec: 15, maxLengthSec: 600, sourceRule: "optional", fakeQuoteCheck: true, maxEntriesPerFan: 1},
    musicVideo: { label: "Music video or remix", entryFormats: ["video", "audio"], minLengthSec: 30, maxLengthSec: 600, sourceRule: "optional", fakeQuoteCheck: true, maxEntriesPerFan: 1 },
    original: { label: "Original creation", entryFormats: ["video", "audio"], minLengthSec: 5, maxLengthSec: 600, sourceRule: "none", fakeQuoteCheck: false, maxEntriesPerFan: 1 },
}

const FORMATS = ["video", "audio"];
const SOURCE_RULES = ["required", "optional", "none"];
const HOUR_MS = 60 * 60 * 1000;

// will check every field and returns {errors} if anything is wrong, or {contest} with clean values.
export function validateContest(input) {
    const errors = [];

    const title = String(input.title ?? "").trim();
    const brief = String(input.brief ?? "").trim();
    if (title.length < 3 || title.length > 100) errors.push("Title must be 3 to 100 characters.");
    if (brief.length < 10 || brief.length > 2000) errors.push("Brief must be 10 to 2000 characters.");
    const preset = input.preset in PRESETS ? input.preset : "custom";

    
    const entryFormats = Array.isArray(input.entryFormats) ? input.entryFormats.filter((f) => FORMATS.includes(f)) : [];
    if (entryFormats.length === 0) errors.push("Allow at least one entry format (video or audio).");

    const minLengthSec = Number(input.minLengthSec);
    const maxLengthSec = Number(input.maxLengthSec);
    if (!Number.isFinite(minLengthSec) || minLengthSec < 0) errors.push("Minimum length can't be negative.");
    if (!Number.isFinite(maxLengthSec) || maxLengthSec <= minLengthSec || maxLengthSec > 3600) {
        errors.push("Maximum length must be longer than the minimum, and 1 hour at most.");
    }

    const sourceRule = input.sourceRule;
    if (!SOURCE_RULES.includes(sourceRule)) errors.push("Choose a source material setting.");

    // null means "all of the creator's episodes", the default. A list narrows it down.
    let eligibleEpisodeIds = null;
    if (sourceRule !== "none" && Array.isArray(input.eligibleEpisodeIds) && input.eligibleEpisodeIds.length > 0)  {
        eligibleEpisodeIds = input.eligibleEpisodeIds.map(String);
    }

    // fake-quote check needs the creator's episodes, so it's always off when there's no source material.
    const fakeQuoteCheck = sourceRule === "none" ? false : Boolean(input.fakeQuoteCheck);

    const deadline = new Date(input.deadline);
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() < Date.now() + HOUR_MS) {
        errors.push("The deadline must be at least an hour from now.");
    }

    const maxEntriesPerFan = Number(input.maxEntriesPerFan ?? 1);

    if (!Number.isInteger(maxEntriesPerFan) || maxEntriesPerFan < 1 || maxEntriesPerFan > 10) {
        errors.push("Entries per fan must be a whole number from 1 to 10.");
    }

    // Money is stored in cents (whole numbers), so adding prizes never causes rounding errors.
    const prizes = Array.isArray(input.prizes) ? input.prizes : [];
    const prizesCents = prizes.map((p) => Math.round(Number(p) * 100));
    if (prizesCents.length < 1 || prizesCents.length > 10) errors.push("Add between 1 and 10 prizes.");
    if (prizesCents.some((c) => !Number.isInteger(c) || c < 100 || c > 1000000)) {
        errors.push("Each prize must be between $1 and $10,000.");
    }

    // The server calculates the total itself, so a tampered request can't change what PayPal charges.
    const prizeTotalCents = prizesCents.reduce((sum, c) => sum + c, 0);

    if (errors.length > 0) return { errors };

    return {
        contest: {
            title, brief, preset, entryFormats, minLengthSec, maxLengthSec, 
            sourceRule, eligibleEpisodeIds, fakeQuoteCheck, deadline, maxEntriesPerFan,
            prizesCents, prizeTotalCents,
        },
    };
}

export async function createContest(input) {
    const {errors, contest} = validateContest(input);

    if (errors) {
        const err = new Error(errors.join(" "));
        err.status = 400;
        err.details = errors;
        throw err;
    }

    const ref = await db.collection("contests").add({
        ...contest,
        status: "draft", // becomes "open" once the prize pool is funded via paypal!
        createdAt: FieldValue.serverTimestamp(),
    });
    return { id: ref.id, ...contest, status: "draft"};
}

// Firestore stores dates as Timestamps; turn them into normal text dates that can translate cleanly to JSON.
function toJson(doc) {
    const data = doc.data();
    return {
        id: doc.id,
        ...data,
        deadline: data.deadline?.toDate().toISOString() ?? null,
        createdAt: data.createdAt?.toDate().toISOString() ?? null,
        fundedAt: data.fundedAt?.toDate().toISOString() ?? null,
    };
}

// gets all contests (newest first).
export async function listContests() {
    const snapshot = await db.collection("contests").orderBy("createdAt", "desc").get();
    return snapshot.docs.map(toJson);
}

export async function getContest(id) {
    const doc = await db.collection("contests").doc(id).get();
    return doc.exists ? toJson(doc) : null;
}

