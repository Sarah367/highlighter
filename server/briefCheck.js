// brief check: does the entry fit what the contest asked for??
// a small, separate Gemini call with one focused job, so it can't distract the context check (or the other way around)

// this is literally just making sure that the entry matches the brief.
import {askGeminiJson} from "./gemini.js";

const MAX_WORDS = 3000; //plenty to judge relevance, and keeps prompt a sensible size



// gemini must answer in exactly this shape. 
// describing the entry first makes it look at the entry before it judges

// gemini describes what the entry seems to be, then decide whether it can tell at all whether its within brief,
// then whether it fits the brief, then the reason (explain)

// we are describing the entry first in order to FORCE the model to actually look at the entry before it judges
const SCHEMA = {
    type: "OBJECT",
    properties: {
        whatTheEntryIs: {type: "STRING"},
        canTell: {type: "BOOLEAN"},
        fitsBrief: {type: "BOOLEAN"},
        reason: {type: "STRING"},
    },
    required: ["whatTheEntryIs", "canTell", "fitsBrief", "reason"],
};

// entry's transcript as one string, up to MAX_WORDS words
function transcriptText(words) {
    const parts = [];
    for (let i = 0; i < words.length && i < MAX_WORDS; i++) {
        parts.push(words[i].word);
    }
    return parts.join(" ");
}


// generous to fans on purpose: it judges the SUBJECT only. format, editing, and honesty belong to other checks,
// and a transcript can't show where the cuts are anyway (removed contest type)
function buildPrompt(contest, words) {
    return `You are helping a creator review fan entries for a contest on Highlighter.
Decide whether this entry's subject matches what the contest's brief asks for.

Contest title: "${contest.title}"
The brief, in the creator's words: "${contest.brief}"

You only have the entry's transcript (what is said in it), not its visuals, music, or edits.

Step 1. whatTheEntryIs: in one sentence, describe what the entry is about, based on the transcript.
Step 2. canTell: false if the transcript doesn't give you enough to judge, for example a music video, a mostly
visual edit, or very little speech. When you can't tell, the entry gets the benefit of the doubt.
Step 3. fitsBrief: true if the entry's subject matches what the brief asks for, even loosely or creatively.
Judge the SUBJECT only. Do NOT judge:
- the format or editing: whether it's a compilation, how many cuts it has, or whether it looks like one
  uncut clip. A transcript doesn't show where the cuts are, and another check handles editing.
- honesty: whether the entry misrepresents the creator. Another check handles that.
- quality or taste.
Only mark it false when the entry is clearly about something else entirely.
Step 4. reason: one or two sentences explaining your decision, referring to the brief.

The entry's transcript:
"${transcriptText(words)}"`;
}

// asks Gemini and returns {model, whatTheEntryIs, canTell, fitsBrief, reason}.

export async function checkBrief({contest, words}) {
    const result = await askGeminiJson(buildPrompt(contest,words), SCHEMA);
    const answer = result.answer;

    // be careful with answer; anything unclear and we will give fan the benefit of the doubt
    let canTell = false;
    if (answer.canTell === true) canTell = true; // only "can tell" when Gemini clearly says so

    let fitsBrief = true;
    if (answer.fitsBrief === false) fitsBrief = false; // only "doesnt fit" when gemini says so

    return {
        model: result.model,
        whatTheEntryIs: String(answer.whatTheEntryIs || ""),
        canTell,
        fitsBrief,
        reason: String(answer.reason || ""),
    };
}
export {buildPrompt};