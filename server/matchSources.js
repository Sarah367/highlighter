// finds where each part of an entry's speech came from in the creator's episodes.
// this is plain text matching, no AI: it's what lets the context check know which pieces were spliced together.

const MIN_RUN = 3; // a traced piece needs at least 3 words in a row; shorter bits are too common to place

// entryWords: [{word, start, end}]

// episodes:   [{ id, title, words: [{ word, start, end }] }]
// normalize:  turns "Literally," into "literally", the same as word search

export function findSources(entryWords, episodes, normalize) {
    const entry = entryWords.map((w) => normalize(w.word)); // normalize so every word is compared the same way.
    const episodeNorm = episodes.map((ep) => ep.words.map((w) => normalize(w.word)));

    // 1. index every 3-word phrase in every episode; "i love tacos" --> [[episode, position], ...]
    // building this once will make each lookup instant, instead of scanning hours of transcript per word.
    const index = new Map();

    episodeNorm.forEach((words, e) => {
        for (let p = 0; p + MIN_RUN <= words.length; p++) {
            const key = words.slice(p, p + MIN_RUN).join(" ");
            index.get(key).push([e,p]); // maps to a specific episode and time, quick lookup with map
        }
    });
    // .flat() will merge the per-episode list into one big list of every word, Set keeps one copy of each word.
    // keeps every distinct word the creator has said. if a single word like "literally" in a compilation
    // doesn't start a 3-word match, the code checks the vocabulary set below. If word is in the set, then it
    // counts as a real word that was said by the creator, but too short to place to a specific episode.
    const vocabulary = new Set(episodeNorm.flat()); // every word the creator has said.
    
    // 2. walk through the entry (fan's transcript). at each spot, find the longest run of words that matches an episode.
    const segments = [];
    const unmatchedRuns = [];
    let matchedWords = 0;
    let shortWords = 0; // words the creator does say, but in pieces too short to place
    let unmatchedWords = 0; // words that never appear in the episodes at all 
    let i = 0;

    while (i < entry.length) {
        if (!entry[i]) {
            i++; // a word that was only punctuation...
            continue;
        }

        let best = null;
        for (const [e, p] of index.get(entry.slice(i, i + MIN_RUN).join(" ")) ?? []) {
        let length = MIN_RUN;
        while (i + length < entry.length && p + length < episodeNorm[e].length && entry[i + length] === episodeNorm[e][p + length]) {
            length++; // keep extending while the next words still match
        }
        if (!best || length > best.length) best = { e, p, length };
        }

        if (best) { // records where this piece came from: which episode, start and end time. 
            const episode = episodes[best.e];
            const last = i + best.length - 1;
            segments.push({
                entryStart: entryWords[i].start,
                entryEnd: entryWords[last].end,
                episodeId: episode.id,
                episodeTitle: episode.title,
                episodeStart: episode.words[best.p].start,
                episodeEnd: episode.words[best.p + best.length - 1].end,
                text: entryWords.slice(i, last+1).map((w) => w.word).join(" "),
            });
            matchedWords += best.length; 
            i += best.length;// jumps past the whole piece onto the next one.
        } else if (vocabulary.has(entry[i])) {
            shortWords++; // short word, could be from anywhere
            i++;

        } else {
            // the word is not in the episodes at all. 
            const previous = unmatchedRuns[unmatchedRuns.length-1];
            if (previous && previous.lastIndex === i - 1) {
                previous.text += ` ${entryWords[i].word}`;
                previous.end = entryWords[i].end;
                previous.lastIndex = i;
            } else {
                unmatchedRuns.push({start: entryWords[i].start, end: entryWords[i].end, text: entryWords[i].word, lastIndex: i});
            }
            unmatchedWords++;
            i++;
        }

    }

    return {
        segments,
        unmatchedRuns: unmatchedRuns.map(({ lastIndex, ...run}) => run), // drop bookkeeping field
        matchedWords,
        shortWords,
        unmatchedWords,
    };
}
