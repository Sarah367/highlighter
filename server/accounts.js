import {db, adminAuth} from "./firebaseAdmin.js";

// who's making a request, and what they're allowed to do.
// the app sends a Firebase sign-in token in the "Authorization: Bearer TOKEN" header.
// Only Firebase can create these tokens, so verifying one proves who's asking, and nobody can pretend
// to be someone else.

function fail(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function sendError(res, err) {
    if (!err.status || err.status >= 500) console.error(err);
    res.status(err.status || 500).json({error: err.message});
}

// reads the token from the request, and asks Firebase who it belongs to
// returns {uid, email} or null when theres no token. A fake or expired token is an error.
async function userFromRequest(req) {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return null;

    const token = header.slice("Bearer ".length);

    try {
        const decoded = await adminAuth.verifyIdToken(token);
        return {uid: decoded.uid, email: decoded.email || null};
    } catch {
        throw fail("Your sign-in has expired. Log in again.", 401);
    }
}

// for routes anyone can use, that act differently for signed-in people (like entering a contest)
// sets req.user to the signed-in person, or null
export async function optionalUser(req,res,next) {
    try {
        req.user = await userFromRequest(req);
        next();
    } catch (err) {
        sendError(res,err);
    }
}

// for routes that need any signed-in account, creator or fan (like My entries)
export async function requireUser(req,res,next) {
    try {
        const user = await userFromRequest(req);
        if (!user) throw fail("Log in to do this.", 401);
        req.user=user;
        next();
    } catch (err) {
        sendError(res,err);
    }
}

// for creator-only routes: a valid token, from an account whose role is creator
export async function requireCreator(req, res, next) {
    try {
        const user = await userFromRequest(req);
        if (!user) throw fail("Log in to do this.", 401);

        const profile = await db.collection("users").doc(user.uid).get();
        if (!profile.exists || profile.data().role !== "creator") {
            throw fail("Only creator accounts can do this.", 403);
        }
        req.user = user;
        next();
    } catch (err) {
        sendError(res,err);
    }
}

// contest in the address (/api/contests/:id/...) must belong to the signed-in creator
// someone else's contest gets the same "no contest" answer as one that doesn't exist, so nobody can find out 
// which contest IDs exist by trying them
export async function ownsContest(req,res,next) {
    try {
        const snap = await db.collection("contests").doc(req.params.id).get();
        if (!snap.exists || snap.data().ownerId !== req.user.uid) throw fail("No contest with that ID.", 404);
        next();
    } catch (err) {
        sendError(res,err);
    }
}

// the episode in the address (/api/episodes/:id/...) must belong to the signed-in creator.
export async function ownsEpisode(req,res,next) {
    try {
        const snap = await db.collection("episodes").doc(req.params.id).get();
        if (!snap.exists || snap.data().ownerId !== req.user.uid) throw fail("No episode with that ID.", 404);
        next();
    } catch (err) {
        sendError(res,err);
    }
}

// the entry in the address (/api/entries/:id/...) must be in a contest the signed-in creator owns.
export async function ownsEntry(req, res, next) {
    try {
        const entry = await db.collection("entries").doc(req.params.id).get();
        if (!entry.exists) throw fail("No entry with that ID.", 404);
 
        const contest = await db.collection("contests").doc(entry.data().contestId).get();
        if (!contest.exists || contest.data().ownerId !== req.user.uid) throw fail("No entry with that ID.", 404);
        next();
    } catch (err) {
        sendError(res, err);
    }
}

// creators can't enter their own contests: not while signed in as the owner,
// and not with the email address on the owner's account.
export async function blockOwnEntry(contestId, user, paypalEmail) {
    const snap = await db.collection("contests").doc(contestId).get(); // load the contest
    if (!snap.exists) return; // entry code explains missing contests itself
    const ownerId = snap.data().ownerId;
    if (!ownerId) return;

    // if you are signed in as the owner (user is whoever is signed in)
    if (user && user.uid === ownerId) throw fail("You can't enter your own contest.", 403);

    // or if you are using the owner's email.
    const owner = await db.collection("users").doc(ownerId).get(); 
    const email = String(paypalEmail || "").trim().toLowerCase();
    if (owner.exists && email && String(owner.data().email || "").toLowerCase() === email) {
        throw fail("You can't enter your own contest.", 403);
    }
}



