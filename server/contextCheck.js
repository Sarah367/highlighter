// ai screening; context check; asks Gemini whether an entry misrepresents the creator, using
// the traced pieces from part 1 plus what the creator actually said before and after each one

import {askGeminiJson} from "./gemini.js";

const MAX_PIECES = 60; // keeps prompt a sensible size for long entries.
const CONTEXT_SECONDS = 12; // how much of the original to show around each piece

// exact shape Gemini must answer in (Gemini's schema format uses capitalized type names)
// pieceReviews comes first on purpose: the model must compare every piece with its original
// before it is allowed to list any issues. Reasoning first makes the verdict more careful since
// models write their answers in order (structured reasoning is more reliable than just asking for a verdict).
const SCHEMA = {
    type: "OBJECT",
    properties: {
        pieceReviews: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    piece: {type: "INTEGER"},
                    originalMeaning: {type: "STRING"}, // what creator meant in the full original sentence
                    entryMeaning: {type: "STRING"}, // what a viewer of the entry would think the creator meant
                    meaningChanged: {type: "BOOLEAN"}, // true if the meaning changed, false if it stayed the same
                },
                required: ["piece", "originalMeaning", "entryMeaning", "meaningChanged"],
            },
        },
        issues: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    pieces: {type: "ARRAY", items: {type: "INTEGER"}}, // which pieces are involved in this issue
                    kind: {type: "STRING", enum: ["fake_quote", "out_of_context"]}, // what kind of misrepresentation it is
                    risk: {type: "STRING", enum: ["low", "medium", "high"]}, // how likely a viewer would be misled
                    quote: {type: "STRING"}, // what the entry actually sounds like
                    explanation: {type: "STRING"}, // why this is misleading, with reference to the original context
                },
                required: ["pieces", "kind", "risk", "quote", "explanation"],
            },
        },
        summary: {type: "STRING"}, // one sentence summary of the review
    },
    required: ["pieceReviews", "issues", "summary"],

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

// the full sentence(s) a piece was cut from: walk backward from the piece's first word to the end of
// the previous sentence, and forward from its last word to the end of its sentence.
function fullSentence(words, pieceStart, pieceEnd) {
    let first = words.findIndex((w) => w.start >= pieceStart - 0.01);
    let last = words.findLastIndex((w) => w.end <= pieceEnd + 0.01);
    if (first === -1 || last === -1) return "";
    while (first > 0 && !/[.?!]$/.test(words[first - 1].word)) first--;
    while (last < words.length - 1 && !/[.?!]$/.test(words[last].word)) last++;
    return words.slice(first, last + 1).map((w) => w.word).join(" ");
}

// describes each traced piece for Gemini: where it plays, where it came from, the full sentence 
// it was cut from, the talk around that, and whether it runs straight into the next piece 
function describePieces(segments, episodes) {
    const byId = new Map(episodes.map((ep) => [ep.id, ep]));
    const pieces = segments.slice(0, MAX_PIECES);

    return pieces
        .map((s,i) => {
            const words = byId.get(s.episodeId)?.words ?? []; // if the episode isn't found, just give Gemini an empty transcript
            const sentence = fullSentence(words, s.episodeStart, s.episodeEnd); // the full sentence the piece was cut from
            const before = wordsBetween(words, s.episodeStart - CONTEXT_SECONDS, s.episodeStart-0.01); // what the creator said just before the piece
            const after = wordsBetween(words, s.episodeEnd, s.episodeEnd + CONTEXT_SECONDS); // what the creator said just after the piece
            const next = pieces[i+1];
            const joined = next && next.entryStart - s.entryEnd < 1.5; // less than 1.5 seconds apart in entry

            return [
                `Piece ${i + 1}: plays at ${clock(s.entryStart)}-${clock(s.entryEnd)} in the entry. ` +
                  `From "${s.episodeTitle}" at ${clock(s.episodeStart)}-${clock(s.episodeEnd)}.` +
                  (joined ? ` Plays straight into piece ${i + 2}, with no pause.` : ""),
                `  What the entry plays: "${s.text}"`,
                `  The full original sentence it was cut from: "${sentence}"`,
                `  More of what the creator said around it: "...${before} [PIECE] ${after}..."`,
              ].join("\n");
        })
        .join("\n\n");
}

function buildPrompt(contest, segments, episodes) {
    return `You are protecting a creator from being misrepresented by fan-made edits on Highlighter.
  A fan made this entry by cutting pieces out of the creator's real episodes. Every piece below is real
  audio of the creator, listed in the order the entry plays them, along with the full original sentence
  each piece was cut from.
  
  Step 1. Review EVERY piece, one at a time, in pieceReviews:
  - originalMeaning: what the creator actually meant, based on the full original sentence.
  - entryMeaning: what a viewer watching only the entry would believe the creator means. For pieces that
    play straight into the next piece, consider how they sound together.
  - meaningChanged: true if a viewer would come away believing something the creator did not say or mean.
  
  Common ways a cut changes the meaning (check for each one):
  - Dropping who said it: "People claim I'm lazy" cut to "I'm lazy" makes someone else's claim sound like
    the creator's own admission.
  - Dropping a reversal that follows: "...but that's not true," "just kidding," "said nobody."
  - Dropping a negation or qualifier: "not," "never," "I used to," "some people think."
  - Splicing: pieces from different places played back to back so they sound like one new sentence.
  
  Step 2. List issues only for pieces where meaningChanged is true:
  - kind: "fake_quote" for a splice of two or more pieces; "out_of_context" for a single piece cut so its
    meaning changed.
  - risk: "high" if a viewer would likely believe the creator said or meant it; "medium" if plausibly
    misleading; "low" if minor.
  - quote: the words exactly as the entry plays them. explanation: one or two sentences comparing it to what
    the creator actually said.
  
  Do NOT report:
  - Obvious comedy edits nobody would mistake for a real statement, like the same word repeated many times.
  - Pieces whose meaning stays the same as the original, even if trimmed.
  - Anything just because it's rude, silly, or edgy. Only misrepresentation matters.
  - Whether the entry fits the contest brief. That is checked separately, so ignore it here.
  
  Step 3. Give a one-sentence summary of whether the entry misrepresents the creator.
  
  For background only, the contest type is "${contest.preset}".
  
  The pieces:
  
  ${describePieces(segments, episodes)}`;
}

// Runs the check. Returns { model, summary, pieceReviews, issues }, keeping only well-formed issues.
export async function checkContext({ contest, segments, episodes }) {
    const { answer, model } = await askGeminiJson(buildPrompt(contest, segments, episodes), SCHEMA);
    const issues = Array.isArray(answer.issues)
      ? answer.issues.filter((issue) => issue && issue.quote && issue.explanation && ["low", "medium", "high"].includes(issue.risk))
      : [];
    const pieceReviews = Array.isArray(answer.pieceReviews) ? answer.pieceReviews : [];
    return { model, summary: String(answer.summary ?? ""), pieceReviews, issues };
  }
  
// exported for testing: lets you see exactly what gemini is asked
export { buildPrompt };