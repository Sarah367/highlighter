// run from the client folder: node scripts/test-taste/mjs

// checks the "Your taste" classifier with a made-up creator who rejects context flags, duplicates, and entries

import {trainTaste, predictTaste, MIN_DECISIONS} from "../src/tasteModel.js";

// a made-up screened entry: its decision (or null) ,its flags, and how many of its 
// *100 words* were traced

function entry(decision, flags, durationSec = 60, matched = 90) {
    return {
        creatorDecision: decision,
        screening: {flags: flags, durationSec: durationSec, wordCount: 100, matchedWords: matched},
    };
}

const contextFlag = {type: "context", risk: "high"};

const decisions = [
    entry("shortlist", []), entry("shortlist", []), entry("shortlist", [], 90), entry("shortlist", [{type: "brief", risk: "medium"}]),
    entry("reject", [contextFlag]), entry("reject", [contextFlag], 150), entry("reject", [{type: "duplicate"}]),
    entry("reject", [], 200, 40),
]

let passed = 0;
let failed = 0;

function check(name,ok) {
    if (ok) passed++; // if true, then passed
    else failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}

check("not ready with too few decisions", !trainTaste(decisions.slice(0, MIN_DECISIONS-1)).ready);
// six shortlists and no rejects: nothing to compare against
const onlyShortlists = [entry("shortlist", []), entry("shortlist", []), entry("shortlist", []), entry("shortlist", []), entry("shortlist", []), entry("shortlist", [])];
check("not ready with only shortlists", !trainTaste(onlyShortlists).ready);

const model = trainTaste(decisions);
check("ready with 8 decisions of both kinds", model.ready && model.decided === 8);

const clean = predictTaste(model, entry(null, []));
console.log("   clean entry:", Math.round(clean.shortlistChance * 100) + "%", clean.reasons);
check("a clean entry leans shortlist", clean.leaning === "shortlist" && clean.shortlistChance > 0.7);

const twisted = predictTaste(model, entry(null, [contextFlag], 150));
console.log("   high-risk context flag:", Math.round(twisted.shortlistChance * 100) + "%", twisted.reasons);
check("a high-risk context flag leans reject", twisted.leaning === "reject" && twisted.shortlistChance < 0.3);
check("the reasons mention the context flag", twisted.reasons.includes("a context flag"));
check("a weak coincidence isn't named as a reason", !twisted.reasons.includes("fits the brief"));
// never both "a context flag" and "a high-risk context flag" (they're about the same thing)
const bothContext = twisted.reasons.includes("a context flag") && twisted.reasons.includes("a high-risk context flag");
check("the two reasons are about different things", !bothContext);
 
// train without any duplicates, then ask about a duplicate: a feature the model has never seen
const noDuplicates = [];
for (const e of decisions) {
    if (e.screening.flags.length === 1 && e.screening.flags[0].type === "duplicate") continue;
    noDuplicates.push(e);
}
const unseen = predictTaste(trainTaste(noDuplicates), entry(null, [{ type: "duplicate" }]));
check("a feature never seen before isn't 0% or 100% (smoothing)", unseen.shortlistChance > 0 && unseen.shortlistChance < 1);
 
const empty = predictTaste(model, { screening: null, durationSec: 30 });
check("an entry with no screening data doesn't crash", empty.shortlistChance > 0 && empty.shortlistChance < 1);
 
console.log(`\n${passed} of ${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);