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

// creator approved the payment in PayPal.
export async function finishFunding(contestId, orderId) {
    if (!orderId) throw fail("Missing the PayPal order ID.", 400);

    const {ref, contest} = await loadContest(contestId);

    // already done with this exact order (such as retried request) then just return the contest.
    if (contest.status == "open" && contest.paypalOrderId === orderId) return getContest(contestId);
    // if the contest's status is not a draft, that means it's already been funded (since it must be funded to move from draft status to open status).
    if (contest.status !== "draft") throw fail("This contest's prize pool is already funded.", 409);
    // prevents someone from reusing an orderId from a different, cheaper contest to fund the prize pool.
    if (contest.pendingOrderId !== orderId) throw fail("That PayPal order doesn't belong to this contest!", 400);

    const result = await captureOrder(orderId);
    const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
    if (result.status !== "COMPLETED" || capture?.status !== "COMPLETED") {
        throw fail(`PayPal didn't complete the payment (status: ${capture?.status ?? result.status}).`, 402);
    }

    // make sure PayPal charged exactly the prize total in US currency.
    const expected = centsToValue(contest.prizeTotalCents);
    if (capture.amount.value !== expected || capture.amount.currency_code !== "USD") {
        throw fail(`PayPal charged ${capture.amount.value} ${capture.amount.currency_code}, but the prize pool is ${expected} USD.`, 409);
    }

    await ref.update({
        status: "open",
        paypalOrderId: orderId,
        paypalCaptureId: capture.id, // PayPal's receipt number for this payment
        fundedAt: FieldValue.serverTimestamp(),
        pendingOrderId: FieldValue.delete(),
    });
    return getContest(contestId);
}