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
// adds the token, sends the json body, and turns any failures into readable errors
async function paypalRequest(path, {body, requestId} = {}) {
    const token = await getAccessToken();
    const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            // if requestId was provided, then use it , otherwise just use empty object
            ...(requestId ? { "PayPal-Request-Id": requestId} : {}),
            // same ID on a retry = payapl does the action only once (idempotency key)
        },
        body: JSON.stringify(body ?? {}),
    });
    const data = await res.json();
    if (!res.ok) {
        const err = new Error(`PayPal request failed (${res.status}): ${data.message || data.name || "unknown error"}`);
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

