// talks to Google's Gemini API and asks for answers in a fixed JSON shape.
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// models to try, in order: if one is busy or unavailable, the next is tried.
// to choose your own, set GEMINI_MODEL in server/.env, e.g. GEMINI_MODEL=gemini-flash-1.0.0
export const GEMINI_MODELS = (process.env.GEMINI_MODELS || "gemini-flash-latest,gemini-flash-lite-latest")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const RETRY_WAITS = [0, 3000, 8000]; // per model: try now, then after 3 seconds, then after 8 seconds. (Gemini sometimes returns 503 if it's busy.)
const BUSY = new Set([429, 500, 503]); // rate-limited or overloaded: worth waiting and retrying, rather than failing immediately.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// sends a prompt and returns {answer, model}: Gemini's answer shaped like `schema`, plus the model that answered. Tries multiple models and retries if busy.
export async function askGeminiJson(prompt, schema) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is missing from server/.env");
    
    let lastError;
    for (const model of GEMINI_MODELS) { // loops through all models
      for (const wait of RETRY_WAITS) { // 0 (start), then 3 seconds, then 8 seconds
        if (wait) await sleep(wait);
  
        let res;
        try {
            res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json", "x-goog-api-key": key
                },
                body: JSON.stringify({
                    contents: [{role: "user", parts: [{text: prompt}]}],
                    generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0},
                }),
            });
        } catch (err) {
            // no answer at all (network hiccup, Wi-Fi drop, connection reset): worth retrying , like a busy error
            // err.cause holds the real reason, like ECONNRESET or ENOTFOUND (couldn't find the address)
            lastError = new Error(`Couldn't reach Gemini (${model}): ${err.cause?.code ?? err.cause?.message ?? err.message}`);
            continue;
        }
        const data = await res.json().catch(() => ({}));
  
        if (res.ok) {
          const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
          if (!text) {
            const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "no answer";
            throw new Error(`Gemini returned no answer (${reason}).`);
          }
          return { answer: JSON.parse(text), model };
        }
  
        lastError = new Error(`Gemini (${model}) failed (${res.status}): ${data.error?.message ?? "unknown error"}`);
        if (res.status === 404) break; // this model name doesn't exist: skip straight to the next model
        if (!BUSY.has(res.status)) throw lastError; // a real problem, like a bad key: retrying won't help
      }
    }
    throw lastError;
}


