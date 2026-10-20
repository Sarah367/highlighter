// funding a contest's prize pool with PayPal: create the order, then capture it and open the contest.
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./firebaseAdmin.js";
import { createOrder, captureOrder, centsToValue } from "./paypal.js";
import { getContest } from "./contests.js";

function fail(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

async function loadContest(contestId) {
    const ref = db.collection("contests").doc(contestId);
    const snap = await ref.get();
    if (!snap.exists) throw fail("No contest with that ID.", 404);
    return { ref, contest: snap.data()};
}

// creator clicks the PayPal button. Create an order for the prize total.
export async function startFunding(contestId) {
    const {ref, contest} = await loadContest(contestId);
    if (contest.status !== "draft") throw fail("This contest's prize pool is already funded.", 409);

    if (contest.deadline.toDate() <= new Date()) {
        throw fail("This contest's deadline has already passed, so it can't be funded.", 400);
    }

    // amount comes from the server's own total, NEVER the browser (prevents spoofing amounts)
    const order = await createOrder({
        amountCents: contest.prizeTotalCents,
        referenceId: contestId,
        description: `Highlighter prize pool: ${contest.title}`,
    });

    // remember which order belongs to this contest, so that only that order can fund it.
    await ref.update({pendingOrderId: order.id});
    return {orderId: order.id};
}