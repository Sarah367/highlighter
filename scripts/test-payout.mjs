const BASE = "https://api-m.sandbox.paypal.com";

const {PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, RECEIVER_EMAILS} = process.env;

// one email = a clip bounty payout. Several (comma-separated) = contest winners paid in one batch.
const receivers = (RECEIVER_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);

// checks if ID or secret is missing.
if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || receivers.length === 0) {
  console.error("Missing settings. Copy .env.example to .env and fill in all three values.");
  process.exit(1);
}

// Step 1: trade client ID + secret for a short-lived access token...
async function getAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");


  // asking paypal for a token.
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Auth failed (${res.status}): ${JSON.stringify(data,null,2)}`);
  } else {
    return data.access_token;
  }
}

// create payout batch with one item per receiver.
async function createPayout(token) {
  const now = Date.now();

  const res = await fetch(`${BASE}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: `incontext-test-${now}`, // must be unique each time.
        email_subject: "You got paid for your clip!",
        email_message: "Thanks for clipping with Highlighter!",
      },
      items: receivers.map((email, i) => ({
        recipient_type: "EMAIL",
        amount: { value: "15.00", currency: "USD"},
        receiver: email,
        note: "Test payout for an approved clip.",
        sender_item_id: `clip-test-${now}--${i}`,
      })),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Payout failed (${res.status}): ${JSON.stringify(data,null,2)}`);
    
  } else {
    return data.batch_header.payout_batch_id;
  }
}

// check the batch status.
async function getPayout(token, batchId) {
  const res = await fetch(`${BASE}/v1/payments/payouts/${batchId}`, {
    headers: { Authorization: `Bearer ${token}`},
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Status check failed (${res.status}): ${JSON.stringify(data, null, 2)}`);

  } else {
    return data;
  }
}

// sleep helper since javascript has no built-in pause.
const sleep = (ms) => new Promise((r) => setTimeout(r,ms));

async function waitForResult(token, batchId) {
  // poll every 5 seconds for up to 2 minutes. (5 seconds * 24 == 2 minutes)
  for (let i = 0; i < 24; i++) {
    // get the payout + status, print it out in the console.
    const payout = await getPayout(token, batchId)
    const status = payout.batch_header.batch_status;
    console.log(`Batch status: ${status}`);
  
    if (status !== "PENDING" && status !== "PROCESSING") {
      for (const item of payout.items ?? []) {
        console.log(`   Item to ${item.payout_item.receiver}: ${item.transaction_status}`);
      }
      // if the status is success, return. 
      console.log(status === "SUCCESS" ? "\nPayout works. Sprint 1 is completed successfully." : "\nFinished, but not SUCCESS.");
      return;
    }
    await sleep(5000);
  }
  console.log(`\nStill processing after 2 minutes. Check again later with:\n  node --env-file=.env test-payout.mjs ${batchId}`);
}

async function main() {
  console.log("Getting access token...");
  const token = await getAccessToken();

  // checking existing batch, item[2] is whatever comes after the file name (the batch id presumably).
  const existingBatchId = process.argv[2];
  if (existingBatchId) {
    console.log(`Checking existing batch ${existingBatchId}...`);
    return waitForResult(token, existingBatchId);
  }

  // or sending a new payout...
  console.log(`Sending $15.00 to each of ${receivers.length} receiver(s): ${receivers.join(", ")}...`);
  const batchId = await createPayout(token);
  console.log(`Batch created: ${batchId}`);
  await waitForResult(token, batchId);
}

// actually starts the program and checks for any errors.
main().catch((err) => {
  console.error(err.message);
  process.exit(1);
})