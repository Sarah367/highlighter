// talks to Google's Gemini API and asks for answers in a fixed JSON shape.
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// gemini-flash-latest always points to google's latest flash model
// to pin a specific model, set GEMINI MODEL in server/.env, e.g. GEMINI_MODEL=gemini-flash-1.0.0
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

// sends a prompt and returns Gemini's answer as a JavaScript object, shaped like 'schema'.
export async function askGeminiJson(prompt, schema) {
    const key = process.env.GEMINI_API_KEY; // key lives in .env and never reaches browser.
    if (!key) throw new Error("GEMINI_API_KEY is missing from server/.env");

    const res = await fetch(`${GEMINI_URL}/${GEMINI_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
            contents: [{role: "user", parts: [{text: prompt}]}],
            generationConfig: {
                responseMimeType: "application/json", // tells Gemini to return JSON, not text
                responseSchema: schema, // tells Gemini what shape to return (structured output)
                temperature: 0, // as consistent as possible; same entry should get the SAME verdict.
            },
        }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(`Gemini request failed (${res.status}): ${data.error?.message ?? "unknown error"}`);

    // answer is text inside the first "candidate". With the settings above, that text is JSON.
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
    if (!text) {
        const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "no answer";
        throw new Error(`Gemini returned no answer: ${reason}`);
    }
    return JSON.parse(text);
}


