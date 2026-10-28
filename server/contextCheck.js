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
        spliceReviews: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    splice: {type: "INTEGER"},
                    whatCreatorActuallySaid: {type: "STRING"}, // original sentences in the creator's real meaning
                    whatViewerHears: {type: "STRING"}, // what the joined passage sounds like the creator is saying
                    isFakeQuote: {type: "BOOLEAN"}, // true if the joined passage is a fake quote, false if it is not
                    },
                    required: ["splice", "whatCreatorActuallySaid", "whatViewerHears", "isFakeQuote"],
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
    required: ["pieceReviews", "spliceReviews", "issues", "summary"],

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

function findSplices(pieces) {
    const splices = [];
    let current = null;
    for (let i = 0; i < pieces.length-1; i++) {
        const a = pieces[i];
        const b = pieces[i+1];
        const backToBack = b.entryStart - a.entryEnd < 1.5; 
        const sameStretch =
            a.episodeId === b.episodeId && Math.abs(b.episodeStart - b.entryStart - (a.episodeStart - a.entryStart)) < 2;
        // two pieces are a splice if they play back to back in the entry but come from different places in the original episodes.
        if (backToBack && !sameStretch) {
            if (current && current[current.length-1] === i) {
                current.push(i+1); // splice keeps going.
            } else {
                current = [i, i+1]; // new splice starts
                splices.push(current);
            }
        } else {
            current = null; // splice ends
        }
    }
    return splices; // lists of piece positions, like [[1,2]] for pieces 2 and 3
}

function describeSplices(splices,pieces,episodes) {
    if (splices.length === 0) return "None: no pieces from different places play back to back.";
    const byId = new Map(episodes.map((ep) => [ep.id, ep]));
    return splices
        .map((indexes, n) => {
            const passage = indexes.map((i) => pieces[i].text).join(" ");
            const sources = indexes
                .map((i) => {
                    const s = pieces[i];
                    const sentence = fullSentence(byId.get(s.episodeId)?.words ?? [], s.episodeStart, s.episodeEnd);
                    return `    Piece ${i + 1} ("${s.text}") really came from: "${sentence}"`;
                })
                .join("\n");
            return `Splice ${n + 1} (pieces ${indexes.map((i) => i + 1).join(" + ")}).\n  As the entry plays it: "${passage}"\n${sources}`;
        })
        .join("\n\n");
}

// entry's full transcript, exactly as it plays, with each traced piece in [brackets] labelled by its
// number. Words outside the brackets couldn't be traced to a specific moment (too short, or transcribed a little differently )
// but they're still part of what viewers hear, so the model needs to see them too.
function markedTranscript(entryWords, pieces) {
    const parts = [];
    let open = null; // index of the piece that is currently open in brackets, or null if none

    for (const w of entryWords) { // walk through the entry's words in order
        const index =  // find which piece this word belongs to, if any
        pieces.findIndex((p) => w.start >= p.entryStart - 0.01 && w.start < p.entryEnd - 0.01);
        if (index !== open) { // we're entering or leaving a piece
            if (open !== null && open !== -1) parts.push("]"); // close the previous piece
            if (index !== -1) parts.push(`[${index +1}:`); 
            open = index; // update the current piece index
        }
        parts.push(w.word); // add the word to the transcript
    }
    if (open !== null && open !== -1) parts.push("]"); // close the last piece if it was open
    return parts.join(" ").replace(/\[(\d+): /g, "[$1: ").replace(/ \]/g, "]"); // clean up spacing around brackets
}

function buildPrompt(contest, segments, episodes, entryWords = []) {
    const pieces = segments.slice(0, MAX_PIECES);
    const splices = findSplices(pieces);
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
  
  Step 2. Review EVERY splice listed under "The splices", one at a time, in spliceReviews. A splice is
  pieces from different places that play back to back, so a viewer hears them as one statement. Judge the
  joined passage as a whole, not each piece on its own:
  - whatCreatorActuallySaid: what the creator really said and meant in the original sentences.
  - whatViewerHears: what the joined passage sounds like the creator is saying.
  - isFakeQuote: true only if JOINING the pieces creates a new statement that none of the pieces says on its
    own, like "I can't wait" + "to quit" becoming "I can't wait to quit." If a splice is misleading only
    because one of its pieces was cut out of context, mark it false: that piece is reported through
    pieceReviews instead, so it isn't reported twice.
  If there are no splices, return an empty list.
  
  Untraced words: words in the full transcript that sit outside the [brackets] couldn't be matched to a specific
  moment, usually because they're too short or were transcribed a little differently, but they are most likely
  still the creator's real words. Check them too. If untraced words combine with a neighbouring piece into a
  statement the creator never made (for example, an untraced "I'm never gonna" right before a piece that says
  "love my job"), report it as a fake_quote issue listing the neighbouring piece's number, with the full
  passage as the quote.
  
  Step 3. List issues for every piece where meaningChanged is true and every splice where isFakeQuote is true:
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
  
  Step 4. Give a one-sentence summary of whether the entry misrepresents the creator.
  
  For background only, the contest type is "${contest.preset}".
  
  What the entry says, in full, as it plays (traced pieces in [brackets], numbered):
  
  "${markedTranscript(entryWords, pieces)}"
  
  The pieces:
  
  ${describePieces(pieces, episodes)}
  
  The splices:
  
  ${describeSplices(splices, pieces, episodes)}`;
  }
  
  

// Runs the check. Returns { model, summary, pieceReviews, spliceReviews, issues }.
export async function checkContext({ contest, segments, episodes, entryWords = [] }) {
    const { answer, model } = await askGeminiJson(buildPrompt(contest, segments, episodes, entryWords), SCHEMA);
    const pieces = segments.slice(0, MAX_PIECES);
    const splices = findSplices(pieces);
    const pieceReviews = Array.isArray(answer.pieceReviews) ? answer.pieceReviews : [];
    const spliceReviews = Array.isArray(answer.spliceReviews) ? answer.spliceReviews : [];
    const issues = Array.isArray(answer.issues)
      ? answer.issues.filter((issue) => issue && issue.quote && issue.explanation && ["low", "medium", "high"].includes(issue.risk))
      : [];
        // Safety net: the step-by-step reviews are the careful part of the answer, so they count even if the
        // model forgot to list them as issues. Any review that found a problem but has no matching issue gets one.
        const covered = new Set(issues.flatMap((issue) => issue.pieces ?? []));
        for (const review of spliceReviews) {
            const indexes = splices[review.splice - 1];
            if (!review.isFakeQuote || !indexes) continue;
            const numbers = indexes.map((i) => i + 1);
            if (numbers.some((n) => covered.has(n))) continue;
            issues.push({
            pieces: numbers,
            kind: "fake_quote",
            risk: "medium",
            quote: indexes.map((i) => pieces[i].text).join(" "),
            explanation: `${review.whatViewerHears} But the creator actually said: ${review.whatCreatorActuallySaid}`,
            });
            numbers.forEach((n) => covered.add(n));
        }
        for (const review of pieceReviews) {
            const piece = pieces[review.piece - 1];
            if (!review.meaningChanged || !piece || covered.has(review.piece)) continue;
            issues.push({
            pieces: [review.piece],
            kind: "out_of_context",
            risk: "medium",
            quote: piece.text,
            explanation: `${review.entryMeaning} But the creator meant: ${review.originalMeaning}`,
            });
            covered.add(review.piece);
        }

        return { model, summary: String(answer.summary ?? ""), pieceReviews, spliceReviews, issues };
}

  
// exported for testing: lets you see exactly what gemini is asked
export { buildPrompt, markedTranscript };