// talks to PayPal's REST API: access tokens, creating orders, and capturing payments.
// later (if decide to go live), it will use live link
const BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

// trades the client ID + secret key for a short-lived access token from PayPal
export async function getAccessToken() {
    const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are missing from server/.env");
    }

    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
    const res = await fetch(`${BASE}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded"},
        body: "grant_type=client_credentials",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`PayPal login failed (${res.status}): ${data.error_description || data.error}`);
    return data.access_token;
}

export function centsToValue(cents) {
    return `${Math.floor(cents/100)}.${String(cents % 100).padStart(2, "0")}`;
}

// one helper for every paypal call
// method: "POST" (the default) to do something, or "GET" to look something up.
// adds the token, sends the json body, and turns any failures into readable errors
async function paypalRequest(path, {method = "POST", body, requestId} = {}) {
    const token = await getAccessToken();
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            // if requestId was provided, then use it , otherwise just use empty object
            ...(requestId ? { "PayPal-Request-Id": requestId} : {}),
            // same ID on a retry = payapl does the action only once (idempotency key)
        },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {}), 
    });
    const data = await res.json();
    if (!res.ok) {
        // PayPal's message, plus its first specific problem if it gave one, like which field was wrong.
        let reason = data.message || data.name || "unknown error";
        if (data.details && data.details.length > 0) {
            const first = data.details[0];
            let detail = first.issue || first.description || "";
            if (first.field) detail = `${first.field}: ${detail}`;
            reason += ` (${detail})`;
        }
        const err = new Error(`PayPal request failed (${res.status}): ${reason}`);
        err.status = 502; // PayPal had a problem
        err.paypal = data; // full details
        throw err;
    }
    return data;
}

// creates an order 
export function createOrder({amountCents, referenceId, description}) {
    return paypalRequest("/v2/checkout/orders", {
        body: {
            intent: "CAPTURE",
            purchase_units: [
                {
                    reference_id: referenceId,
                    description: description.slice(0, 127), // paypal's length limit
                    amount: {currency_code: "USD", value: centsToValue(amountCents)},
                },
            ],
        },
    });
}

// captures an approved order, moment the money actually moves and request is sent out
export function captureOrder(orderId) {
    return paypalRequest(`/v2/checkout/orders/${orderId}/capture`, {requestId: `capture-${orderId}`});
}

// pays several people at once, by email, in one PayPal "batch payout"
// senderBatchId labels the batch: PayPal refuses a second batch with same label which naturally prevents double charges
export function createPayoutBatch({senderBatchId, items, subject, message}) {
    return paypalRequest("/v1/payments/payouts", {
        body: {
            sender_batch_header: {
                sender_batch_id: senderBatchId,
                email_subject: subject,
                email_message: message,
            }, 
            items,
        },
    });
}

// looks up a payout batch: its overall status, and each person's payment status.
export function getPayoutBatch(batchId) {
    return paypalRequest(`/v1/payments/payouts/${batchId}`, {method: "GET"});
}

// refunds part (or all) of a captured payment, like a contest's prize pool.
// requestId makes it safe to retry: same ID returns same refund receipt
export function refundCapture({captureId, amountCents, requestId, note}) {
    return paypalRequest(`/v2/payments/captures/${captureId}/refund`, {
        requestId,
        body: {
            amount: {currency_code: "USD", value: centsToValue(amountCents)},
            note_to_payer: note,
        },
    });
}

