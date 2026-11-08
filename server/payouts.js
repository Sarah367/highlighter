import {FieldValue} from "firebase-admin/firestore";
import {db} from "./firebaseAdmin.js";
import {getContest} from "./contests.js";
import {createPayoutBatch, getPayoutBatch, refundCapture, centsToValue} from "./paypal.js";

function fail(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

// just puts label... right now UI for handling extra winners (more than 3) is repeatedly clicking button,
// maybe change in future
function placeLabel(place) {
    if (place === 1) return "1st";
    if (place === 2) return "2nd";
    if (place === 3) return "3rd";
    return `${place}th`;
}

// "pay winners" button
export async function payWinners(contestId) {
    const contestRef = db.collection("contests").doc(contestId);

    // We have race condition here. Pay button will be disabled so creator CANNOT double click, BUT
    // they can have the contest open in two tabs, or in two separate devices..
    // Claim the contest for paying inside Firestore transaction
    // thus if two "pay" clicks come at same time, only one goes thru properly
    const contest = await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(contestRef);
        if (!snap.exists) throw fail("No contest with that ID.", 404);

        const data = snap.data();
        if (data.status === "paying" || data.status === "paid") {
            throw fail("This contest's winners are already being paid.", 409);
        }
        if (data.status !== "closed" || !Array.isArray(data.winners)) {
            throw fail("Pick and save your winners before paying them.", 409);
        }
        transaction.update(contestRef, {status: "paying", payingStartedAt: FieldValue.serverTimestamp()});
        return data;

    });

    try {
        // now we do budget check
        // every winner gets their exact prize amount; prizes plus refund add up to prize pool that creator paid for
        let winnersCents = 0;
        for (const winner of contest.winners) {
            // this is mostly a spoofing browser check, not sure this would actually happen without intervention from user.
            if (winner.prizeCents !== contest.prizesCents[winner.place-1]) {
                throw fail(`The ${placeLabel(winner.place)} place prize doesn't match the contest's prizes.`, 409);
            }
            winnersCents += winner.prizeCents;

        }

        const refundCents = contest.unusedCents || 0;
        if (winnersCents + refundCents !== contest.prizeTotalCents) {
            throw fail("The winners' prizes and the refund don't add up to the prize pool. Save your winners again.", 409);
        }

        // each winner's paypal email, stored privately on their entry (never sent to browser)
        const items = [];
        for (const winner of contest.winners) {
            const entrySnap = await db.collection("entries").doc(winner.entryId).get();
            if (!entrySnap.exists) throw fail(`The ${placeLabel(winner.place)} place entry no longer exists.`, 409);
        
            items.push({
                recipient_type: "EMAIL",
                receiver: entrySnap.data().paypalEmail,
                amount: {value: centsToValue(winner.prizeCents), currency: "USD"},
                sender_item_id: `${contestId}-place-${winner.place}`, // lets us match PayPal's results to places
                note: `${placeLabel(winner.place)} place in "${contest.title}" on Highlighter. Congratulations!`,
            });
        }
        // refund unused prizes first... 
        // using the same request ID instead of making new one.
        // If paypal sees same request ID, it answers with RECEIPT from first refund.
        let refund = null;
        if (refundCents > 0) {
            const result = await refundCapture({
                captureId: contest.paypalCaptureId,
                amountCents: refundCents,
                requestId: `refund-${contestId}`,
                note: `Unused prizes from "${contest.title}" on Highlighter.`,
            });
            refund = {id: result.id, status: result.status, amountCents: refundCents};
        }

        // pay every winner LAST, in one batch, labeled with contest's ID.
        // PayPal refuses a second batch with same label, so winners can never be paid twice.
        let payout = null;
        if (items.length > 0) {
            const batch = await createPayoutBatch({
                senderBatchId: `highlighter-${contestId}`,
                items,
                subject: `You won a prize in "${contest.title}"!`,
                message: `Congratulations! Here's your prize from "${contest.title} on Highlighter.`,
            });
            payout = {batchId: batch.batch_header.payout_batch_id, batchStatus: batch.batch_header.batch_status, items: []};
        }
        
        const update = {
            status: "paying",
            payout,
            refund,
            payoutError: FieldValue.delete(),
        };
        // with no winners (full refund), there's nothing left to wait for
        if (!payout) {
            update.status = "paid";
            update.paidAt = FieldValue.serverTimestamp();
        }
        await contestRef.update(update); // tell paypal to pay winners
        return getContest(contestId);
    } catch (err) {
        // if anything failed, winner was not paid (since payout batch was last step)
        // give contest back
        await contestRef.update({status: "closed", payoutError: err.message});
        throw err;
    }

    
}
// asks PayPal how payout is going, and saves each winner's payment status.
// once paypal has processed the whole batch, the contest is marked as paid.
export async function checkPayout(contestId) {
    const contestRef = db.collection("contests").doc(contestId);
    // load the contest and make sure there's are a payout to check. 
    const snap = await contestRef.get();
    if (!snap.exists) throw fail("No contest with that ID.", 404);
    const contest = snap.data();
    if (!contest.payout || !contest.payout.batchId) throw fail("This contest's winners haven't been paid yet.", 409);
    
    // ask paypal , which replies with batch's overall status, plus list of each payment in it, with
    // that payment's own status.
    const batch = await getPayoutBatch(contest.payout.batchId);

    // each payment's status, matched back to its place using the label we gave it.
    const items = [];
    for (const item of batch.items || []) { // use empty loop so it doesn't crash
        const label = item.payout_item.sender_item_id; 
        // extracts the place but cutting the label at "-place-", giving "abc123" and "2"
        const place = Number(label.split("-place-")[1]); 
        items.push({place, status: item.transaction_status}); // we push the place and the status
    }

    // paypal is done with a batch once its status is SUCCESS (each payment then has its own result, 
    // like SUCCESS, or UNCLAIMED when email doesn't have paypal account yet)
    const update = {
        // we save the same batch ID, paypal's overall status, and each place's status (items array)
        payout: {
            batchId: contest.payout.batchId,
            batchStatus: batch.batch_header.batch_status,
            items,
        },
    };
    // if paypal is done, mark contest as PAID
    if (batch.batch_header.batch_status === "SUCCESS" && contest.status === "paying") {
        update.status = "paid";
        update.paidAt = FieldValue.serverTimestamp();
    }
    // save it and send back updated contest
    await contestRef.update(update);
    return getContest(contestId);
}




