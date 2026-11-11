// "your taste" : naive bayes classifier that learns from a creator's own shortlist and rejects decisions
// plus predicts how likely the creator would DECIDE on entries they have not reviewed yet
// only a hint ; creator still makes the final call on whether to reject/shortlist or not

// assumes features are independent of each other. 
// features being independent of each other is very unlikely (things are usually connected and influence each other)
// but in this case - with very little actual data - it is fine to assume that things are independent.

// yes-or-no facts about an entry that the model learns from. each has words for explaining a prediction
// "group" : features about the same thing. every high-risk context flag is also a context flag, so those two
// are not independent

export const FEATURES = [
    { key: "context", group: "context", yes: "a context flag", no: "no context flag"},
    { key: "contextHigh", group: "context", yes: "a high-risk context flag", no: "no high-risk context flag"},
    { key: "source", yes: "clips not found in your episodes", no: "clips traced to your episodes"},
    { key: "duplicate", yes: "a duplicate flag", no: "no duplicate flag"},
    { key: "brief", yes: "a brief flag", no: "fits the brief"},
    { key: "mostlyTraced", yes: "mostly your own words", no: "lots of words not from your episodes"},
];

// least decisions the model needs before it says anything, with at least one shortlist and one reject
export const MIN_DECISIONS = 5;

// a feature is only named as a reason IF it makes one decison at least 1.5 times as likely as the other
// 1.5 is a judgement call , its strong enough to filter out small coincidences
// if having a high-context flag is about 5 TIMES more common with rejected entries, then it counts towards 
// the reasons why the creator might reject that entry.

// weaker pushes still count towards percentage, but obviously they will only "tilt" the percentage a little bit

// We only name features that are 1.5 times more/less significant in our explanation as to why the creator would lean a certain way
// (either shortlist or reject)

const MIN_REASON_PUSH = Math.log(1.5);

// does this entry have a flag of this type? and, if risk is given, with this risk level?
function hasFlag(flags, type, risk) {
    for (const flag of flags) {
        if (flag.type !== type) continue;
        if (risk && flag.risk !== risk) continue;
        return true;
    }
    return false;
}

// turns an entry's screening results into yes (1) or no(0) for each feature
export function featuresOf(entry) {
    let screening = entry.screening;
    if (!screening) screening = {}; // not screened yet: every feature is 0

    let flags = screening.flags;
    if (!flags) flags = [];

    // "mostly traced": at least 80% of the words were found in the creator's episodes
    let mostlyTraced = 0;
    if (screening.wordCount > 0 && screening.matchedWords / screening.wordCount >= 0.8) {
        mostlyTraced = 1;
    }

    // source: clips not found in the episodes, or not edited at all (both are about where the clips came from)
    let source = 0;
    if (hasFlag(flags, "source") || hasFlag(flags, "unedited")) {
        source = 1;
    }

    // an entry with NO screening data would keep all zeros instead of crashing
    const features = {
        context: 0,
        contextHigh: 0,
        source: source,
        duplicate: 0, 
        brief: 0,
        mostlyTraced: mostlyTraced,
    };

    if (hasFlag(flags, "context")) features.context = 1;
    if (hasFlag(flags, "context", "high")) features.contextHigh = 1;
    if (hasFlag(flags, "duplicate")) features.duplicate = 1;
    if (hasFlag(flags, "brief")) features.brief = 1;

    return features;

}

// learns from entries the creator has decided on. "Training" in Naive Bayes is just counting: 
// for shortlisted and rejected entries separately: how many there are, and how many had each feature
export function trainTaste(entries) { // entries is every entry in this contest
    // start every count at 0 
    const counts = {
        // total: how many entries got that decision
        // yes: for each feature, how many of those entries had it
        // example:   
        // shortlist: { total: 0, yes: { context: 0, contextHigh: 0, source: 0, duplicate: 0, brief: 0, mostlyTraced: 0 } },

        shortlist: {total: 0, yes: {}},
        reject: {total: 0, yes: {}},
    };

    for (const feature of FEATURES) {
        counts.shortlist.yes[feature.key] = 0;
        counts.reject.yes[feature.key] = 0;
    }

    let decided = 0; // how many entries have we learned from?? 
    for (const entry of entries) {
        // We do NOT COUNT entries that haven't been screened or flagged!
        if (!entry.screening) continue;
        if (entry.creatorDecision !== "shortlist" && entry.creatorDecision !== "reject") continue;

        decided++;
        const label = entry.creatorDecision; // "shortlist" or "reject"
        counts[label].total++; // tallies up shortlist or reject

        const features = featuresOf(entry); // get the entries features as 1s and 0s
        // example:
        // { context: 1, contextHigh: 1, source: 0, duplicate: 0, brief: 0, mostlyTraced: 1 }

        // for EACH of the six features, we add 1 or 0 to the feature's count.
        for (const feature of FEATURES) {
            // example:
            // counts.reject.yes.contextHigh goes up by 1
            counts[label].yes[feature.key] += features[feature.key];
        }


    }

    // ready to guess? at least MIN_DECISIONS decisions, with AT LEAST ONE OF EACH
    let ready = false;
    if (decided >= MIN_DECISIONS && counts.shortlist.total > 0 && counts.reject.total > 0) {
        ready = true;
    }

    // returns counts, how many decisions total the classifier learned from, and if its ready or not 
    return {counts: counts, decided: decided, ready: ready};
}

// P(feature = value | label) : of the entries with this label, how many had this value for this feature?
// Laplace smoothing: add 1 to the count ( and 2 to the total, since feature has two possible values (yes or no))
// nothing is ever exactly 0 or 100%

// Example: Of the entries the creator shortlisted, what fraction had a context flag? 
function likelihood(model, label, key,value) {
    const labelCounts = model.counts[label]; 

    // what fraction of the side had that feature.
    // Entries with the feature / All entries on that side
    // If context flag is 0 and shortlisted entries is 30, we would do 0/30, which is 0, 
    // and since everything gets multiplied together later on, this would make the WHOLE ANSWER 0, 
    // which is blatantly wrong
    // (multiplying by 0 would wipe out every other piece of evidence we had)

    const yesChance = (labelCounts.yes[key]+1)/(labelCounts.total+2);
    if (value === 1) {
        return yesChance; // if value is 1 (it has the feature), return the chance of having it.
    } else {
        return 1-yesChance; // if value is 0 (it does not have the feature), return the chance of not having it.
    }
}

// predicts how likely the creator is to shortlist the entry, and names the features that pushed it the most
export function predictTaste(model, entry) {
    const features = featuresOf(entry);
    const shortlistTotal = model.counts.shortlist.total;
    const rejectTotal = model.counts.reject.total;
    const total = shortlistTotal + rejectTotal;

    // the prior: how often the creator shortlists at all 
    // we use Laplace smoothing again IN CASE THE CREATOR SHORTLISTED/REJECTED 0 ENTRIES!
    let shortlistScore = Math.log((shortlistTotal+1) / (total+2));
    let rejectScore = Math.log((rejectTotal+1) / (total+2));

    const pushes = [];
    for (const feature of FEATURES) {
        const value = features[feature.key]; // does this entry have this feature (1 or 0)
        // we use logs so that tiny numbers don't round to 0 (in case of multiplying)

        // how common is this (having or not having feature) among shortlisted entries?
        const forShortlist = Math.log(likelihood(model, "shortlist", feature.key, value));

        // similarly, how common is it amongst rejected entries
        const forReject = Math.log(likelihood(model, "reject", feature.key, value));

        shortlistScore += forShortlist;
        rejectScore += forReject;

        let words = feature.no;
        if (value === 1) words = feature.yes; // the words describing this entry for this feature

        // save this feature as it's shortlist number minus its reject number
        // Positive: it fit shortlisted entries better, so it pushes toward shortlist
        // Negative: the feature fits rejected entries better, so it pushes toward reject
        // Near 0: the feature is EQUALLY COMMON on both sides, so it doesn't matter
        pushes.push({group: feature.group, words: words, effect: forShortlist - forReject});

        // So pushes could be something like:
        // [
        //     { group: "context",   words: "a context flag",        push: -1.1 },
        //     { group: "context",   words: "a high-risk context flag", push: -0.9 },
        //     { group: "source",    words: "clips traced to your episodes", push: 0.1 },
        //     ...
        // ]
        
    }

    // turns the two scores into a probability between 0 and 1
    const shortlistChance = 1 / (1+Math.exp(rejectScore - shortlistScore));

    let leaning = "reject";

    if (shortlistChance >= 0.5) leaning = "shortlist";

    // two reasons: up to two features that pushed in the same direction as the guess, hard enough
    // to be worth naming, strongest first, and never two about the same thing (same group of features)

    const strong = [];
    for (const feature of pushes) {
        let sameDirection = false;
        if (leaning === "shortlist" && feature.effect > 0) sameDirection = true;
        if (leaning === "reject" && feature.effect < 0) sameDirection= true;
        if (!sameDirection) continue;

        const strength = Math.abs(feature.effect); // how hard it pushed, whichever direction
        if (strength < MIN_REASON_PUSH) continue; // too weak to name (less than 1.5 times likely)

        strong.push({group: feature.group, words: feature.words, strength: strength});
    }

    // pick the strongest one, then the strongest one left thats about something else
    // there can be 2 reasons, one, or none.
    const reasons = [];
    const usedGroups = [];
    while (reasons.length < 2) {
        let best = null;
        for (const candidate of strong) {
            if (usedGroups.includes(candidate.group)) continue; // if already used its group, skip

            // if its the first one we've looked at (best === null) or stronger than the best so far,
            // THEN, its the NEW best. 
            if (best === null || candidate.strength > best.strength) best = candidate; 
        }
        // we set best back to null after iteration #1, so if its still null, then stop the loop
        // (you have only 1 reason)
        if (best === null) break; // nothing strong is left

        reasons.push(best.words);
        usedGroups.push(best.group);
    }

    return {shortlistChance: shortlistChance, leaning: leaning, reasons: reasons};
}



