// ai screening; context check; asks Gemini whether an entry misrepresents the creator, using
// the traced pieces from part 1 plus what the creator actually said before and after each one

import {askGeminiJson, GEMINI_MODEL} from "./gemini.js";

const MAX_PIECES = 60; // keeps prompt a sensible size for long entries.
const CONTEXT_SECONDS = 12; // how much of the original to show around each piece

// exact shape Gemini must answer in. (Gemini's schema format uses capitalized type names)
// a summary, plus list of issues, each with piece numbers invovled, the kind (fake quote or out of context),
// a risk level (low, medium, high), the quote itself, and an explanation of why it's a problem.
const SCHEMA = {
    type: "OBJECT",
    properties: {
        summary: {type: "STRING"},
        issues: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    pieces: { type: "ARRAY", items: { type: "INTEGER" } },
                    kind: { type: "STRING", enum: ["fake_quote", "out_of_context"] },
                    risk: { type: "STRING", enum: ["low", "medium", "high"] },
                    quote: { type: "STRING" },
                    explanation: { type: "STRING" },
                },
                required: ["pieces", "kind", "risk", "quote", "explanation"],
            },
        },
    },
    required: ["summary", "issues"],

};

function clock(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s/60)}:${String(s%60).padStart(2, "0")}`;
}

// words said between two moments in an episode
function wordsBetween(words, from, to) {
    return words
        .filter((w) => w.start >= from && w.start < to)
        .map((w) => w.word)
        .join(" ");
}

// describes each traced piece for Gemini: where it plays in the entry, where it came from,
// what was said around it, and whether it runs straight into the next piece (possible splice).
function describePieces(segments, episodes) {
    const byId = new Map(episodes.map((ep) => [ep.id, ep]));
    const pieces = segments.slice(0, MAX_PIECES);

    return pieces
        .map((s, i) => {
            const words = byId.get(s.episodeId)?.words ?? [];
            const before = wordsBetween(words, s.episodeStart - CONTEXT_SECONDS, s.episodeStart-0.01);
            const after = wordsBetween(words, s.episodeEnd, s.episodeEnd + CONTEXT_SECONDS);
            const next = pieces[i + 1];
            const joined = next && next.entryStart -s.entryEnd < 1.5; // less than 1.5 seconds apart in the entry

            return [
                `Piece ${i + 1}: plays at ${clock(s.entryStart)}-${clock(s.entryEnd)} in the entry. ` +
                `From "${s.episodeTitle}" at ${clock(s.episodeStart)}-${clock(s.episodeEnd)}.` +
                (joined ? ` Plays straight into piece ${i + 2}.` : ""),
                `  Said just before it: "...${before}"`,
                `  The piece: "${s.text}"`,
                `  Said just after it: "${after}..."`,
            ].join("\n");
        })
        .join("\n\n");
}

function buildPrompt(contest, segments, episodes) {
    return `You are reviewing a fan-made entry for a creator's fan contest on Highlighter.
    The entry was edited together from pieces of the creator's real episodes. Each piece below is real audio
    of the creator, listed in the order the entry plays them, with what the creator said just before and after
    it in the original episode.
     
    Contest type: ${contest.preset}
    Contest brief: "${contest.brief}"
     
    Your job is to protect the creator from being misrepresented. Report:
    1. fake_quote: pieces played back to back that sound like one statement the creator never actually made.
    2. out_of_context: a piece cut so its meaning changes, for example cut right before "just kidding",
       a "but" that reverses it, or someone else's opinion the creator was quoting or arguing against.
     
    Do NOT report:
    - Obvious comedy edits that nobody would mistake for a real statement, like the same word repeated
      many times, or a montage of separate moments.
    - Pieces whose meaning stays the same as in the original, even if trimmed.
    - Anything just because it's rude, silly, or edgy. Only misrepresentation matters.
     
    For each issue, give the piece numbers involved, the kind, a risk level (high = a viewer would likely believe
    the creator said or meant this; medium = plausibly misleading; low = minor), the quote as it sounds in the
    entry, and a one or two sentence explanation that refers to what the creator actually said. If there are no
    issues, return an empty list. Also give a one sentence summary of your review.
     
    The pieces:
     
    ${describePieces(segments, episodes)}`;
}

// runs the check. returns {model, summary, issues}, with only well-formed issues that are kept.
export async function checkContext({contest, segments, episodes}) {
    const answer = await askGeminiJson(buildPrompt(contest, segments, episodes), SCHEMA);
    // double checks the answer, keeping only well-formed issues (trusting a model's output is risky, even with schema)
    const issues = Array.isArray(answers.issues) 
        ? answer.issues.filter((issue) => issue && issue.quote && issue.explanation && ["low", "medium", "high"].includes(issue.risk))
        : [];
    return { model: GEMINI_MODEL, summary: String(answer.summary ?? ""), issues};
}

// exported for testing: lets you see exactly what gemini is asked
export { buildPrompt };