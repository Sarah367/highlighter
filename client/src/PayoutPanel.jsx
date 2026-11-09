import {useEffect, useState} from "react";
import { API_URL, authFetch } from "./api";
import {formatMoney} from "./format";

// each winner's payment status, in plain words. these are paypal's status for each payment
const PAYMENT_LABELS = {
    SUCCESS: "Paid",
    PENDING: "Pending",
    UNCLAIMED: "Unclaimed",
    ONHOLD: "On hold",
    FAILED: "Failed",
    RETURNED: "Returned",
    BLOCKED: "Blocked",
    REFUNDED: "Refunded",
    REVERSED: "Reversed",
};

// which badge color each status gets: green when paid, yellow while waiting, red when something
// went wrong
function badgeClass(status) {
    if (status === "SUCCESS") return "status status-open";
    if (status === "PENDING" || status === "UNCLAIMED" || status === "ONHOLD") return "status status-transcribing";
    return "status status-error";
}

// "1st", "2nd", "3rd"
function placeLabel(place) {
    if (place === 1) return "1st";
    if (place === 2) return "2nd";
    if (place === 3) return "3rd";
    return `${place}th`;
}

// after "Pay winners" button: how payout is going, and the refund of any unused prizes.
// onChange(contest): called with updated contest whenever PayPal's status is checked

export default function PayoutPanel({contest, onChange}) {
    const [checking, setChecking] = useState(false);
    const [problem, setProblem] = useState("");

    async function checkStatus() {
        setChecking(true);
        setProblem("");
        try {// sends request to server to check with paypal and gets updates on the payout status
            const res = await authFetch(`${API_URL}/api/contests/${contest.id}/payout-status`, {method: "POST"});
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            onChange(data);
        } catch (err) {
            setProblem(err.message);
        } finally {
            setChecking(false);
        }
    }

    // while paypal is still working on it, check again every 10 seconds (and stop once its status is paid)
    const waiting = contest.status === "paying" && contest.payout;
    useEffect(() => {
        if (!waiting)return; // if status is not paying, then we know its paid so we stop and return
        const timer = setInterval(checkStatus, 10000); // 10000 ms = 10 seconds
        return () => clearInterval(timer);
    }, [waiting, contest.id]);
    
    // each winner's latest payment status from paypal (pending till paypal reports back)
    function paymentStatus(place) { // passes in the place (1st ,2nd , 3rd, etc)
        // make sure there are saved statuses (because right after clicking pay, paypal may have not 
        // reported back the statuses of the contests yet.)
        if (contest.payout && contest.payout.items) { 
            for (const item of contest.payout.items) {  // go thru list and find the item for this place 
                if (item.place === place) return item.status; // if this item is the place im looking for, return its status
            }
        }
        return "PENDING";
    }
    let anyUnclaimed = false;
    for (const w of contest.winners || []) {
        if (paymentStatus(w.place) === "UNCLAIMED" ) anyUnclaimed = true;
    }
    const noWinners = !contest.winners || contest.winners.length === 0;

    return (
        <section className="panel">
            <h2>{contest.status === "paid" ? (noWinners ? "Prize pool refunded" : "Winners paid") : "Paying winners"} </h2>
            <div className="stack">
                {!noWinners && (
                    <ul className="rows">
                        {contest.winners.map((w) => {
                            const status = paymentStatus(w.place);
                            return (
                                <li key={w.place} className="row">
                                    <span className="row-main">
                                        {placeLabel(w.place)} place: {w.title}, by {w.fanName}
                                    </span>
                                    <span>{formatMoney(w.prizeCents)}</span>
                                    <span className="payment-status">
                                        {/* a spinner while paypal is still working on this payment */}
                                        {waiting && status === "PENDING" && <span className="spinner" aria-hidden="true"></span>}
                                        <span className={badgeClass(status)}>{PAYMENT_LABELS[status] || status}</span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                    )}
                    {contest.refund && (
                        <p>
                            {formatMoney(contest.refund.amountCents)} {noWinners ? "(the full prize pool)" : "in unused prizes"} was
                            refunded to you{contest.refund.status === "COMPLETED" ? "." : ",and PayPal is still processing it."}
                        </p>
                    )}

                    {anyUnclaimed && (
                        <p className="hint">
                            Unclaimed means the winner's email doesn't have a PayPal account yet. PayPal emails them, and holds the money 
                            for 30 days for them to claim it.
                        </p>
                    )}
                    {problem && <p className="alert">{problem}</p>}
                    {waiting && (
                        <div className="actions">
                            <button onClick={checkStatus} disabled={checking}>
                                {checking ? "Checking..." : "Check status"}
                            </button>
                            <span className="hint">PayPal usually finishes within a few minutes. This page checks every 10 seconds.</span>
                        </div>
                    )}
            </div>
        </section>
    );
}
