// sends audio or video (by link) to Deepgram and returns the transcript with word timestamps.
const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

export async function transcribeFromUrl(mediaUrl) {
    if (!process.env.DEEPGRAM_API_KEY) {
        throw new Error("DEEPGRAM_API_KEY is missing from server/.env");
    }


    const params = new URLSearchParams({
        model: "nova-3",
        smart_format: "true", // adds punctuation, capital letters, formats numbers
    });

    const res = await fetch(`${DEEPGRAM_URL}?${params}`, {
        method: "POST",
        headers: {
            Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({url: mediaUrl}),
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Deepgram failed (${res.status}): ${JSON.stringify(data)}`);
    }

    // deepgram returns several guesses but the first one is its best guess.
    const best = data.results?.channels?.[0]?.alternatives?.[0];
    if (!best) throw new Error("Deepgram returned no transcript.");

    return {
        durationSec: data.metadata?.duration ?? null,
        text: best.transcript,
        words: best.words.map((w) => ({
        word: w.punctuated_word ?? w.word,
        start: w.start, // seconds from the start of the episode
        end: w.end,
        })),
    };
}