// one-time setup: gives every contest and episode made before accounts existed an owner 
// run from the server folder, AFTER signing up as a creator in the app

import {db, adminAuth} from "../firebaseAdmin.js";

const email = process.argv[2];
if (!email) {
    console.log("Add your account's email, like: node --env-file=.env scripts/assign-owner.mjs you@example.com");
    process.exit(1);
}

// find account with that email.
const account = await adminAuth.getUserByEmail(email);
const profile = await db.collection("users").doc(account.uid).get();
if (!profile.exists || profile.data().role !== "creator") {
    console.log(`${email} isn't a creator account. Sign up as a creator in the app first.`);
    process.exit(1);
}

// sets ownerId on every document in a collection that doesn't have one yet. Leaves the rest alone.
async function assign(collectionName) {
    const snapshot = await db.collection(collectionName).get();

    let batch = db.batch();
    let inBatch = 0;
    let assigned = 0;
 
    for (const doc of snapshot.docs) {
        if (doc.data().ownerId) continue; // already has an owner
        batch.update(doc.ref, { ownerId: account.uid });
        inBatch++;
        assigned++;
        if (inBatch === 400) {
            // Firestore saves at most 500 changes per batch
            await batch.commit();
            batch = db.batch();
            inBatch = 0;
        }
    }
    if (inBatch > 0) await batch.commit();
    console.log(`${collectionName}: gave ${assigned} of ${snapshot.size} an owner.`);
}
 
await assign("contests");
await assign("episodes");
console.log(`Done. Everything without an owner now belongs to ${email}.`);
process.exit(0);
