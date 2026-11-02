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


// generous to fans on purpose; its judging relevance only, not quality or taste (those come from the creator who judges the videos)
// and only marks an entry off-brief when its clearly about something else.
// when transcript can't show it (most visual edits and not a lot of talking) then the fan gets the benefit of the doubt!
function buildPrompt(contest, words) {
    return `You are helping a creator review fan entries for a contest on Highlighter.
Decide whether this entry is a genuine attempt at what the contest's brief asks for.
 
Contest title: "${contest.title}"
Contest type: ${contest.preset}
The brief, in the creator's words: "${contest.brief}"
 
You only have the entry's transcript (what is said in it), not its visuals or music.
 
Step 1. whatTheEntryIs: in one sentence, describe what the entry seems to be, based on the transcript.
Step 2. canTell: false if the transcript doesn't give you enough to judge, for example a music video, a mostly
visual edit, or very little speech. When you can't tell, the entry gets the benefit of the doubt.
Step 3. fitsBrief: true if the entry is a genuine attempt at the brief, even a loose, creative, or low-quality one.
Judge relevance only, not quality or taste. Only mark it false when the entry is clearly about something else.
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