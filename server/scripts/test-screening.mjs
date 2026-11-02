// this will be regression test for screening; re-screens a fixed set of test entries, and checks that each one
// gets exactly the flags it should. run after any change to screening, to make sure nothing broke 
//
// run from the server folder:
// "node --env-file=.env scripts/test-screening.mjs"      runs every test
// "node --env-file=.env scripts/test-screening.mjs --only "Fake" "    runs tests whose name contains "Fake"
// "node --env-file=.env scripts/test-screening.mjs --list ID"       lists a contest's entries, to find IDs for the test set

import {readFile, readFileSync} from "node:fs";
import {screenEntry, listEntries} from "../screenEntry.js";
// import.meta.url means relative to this file, meaning that it works no matter which folder i run it from
const TESTS_FILE = new URL("./screening-tests.json", import.meta.url);

// different flag types in a list of flags, sorted, with no repeats: ["brief", "source"]
function flagTypes(flags) {
    const types = [];
    for (const flag of flags) {
        if (!types.includes(flag.type)) {
            types.push(flag.type);
        }
    }
    return types.sort(); // we sort it so that when we compare later, the order is the same 
}

// true when the screening produced the exact flags I expected.
function sameList(a,b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false; // they dont match
        }
    }
    return true;
}

// converts list of flag types into text for the table:  "brief, source" or "none"
function describe(types) {
    if (types.length === 0) {
        return "none";
    }
    return types.join(", ");
}

// --list: shows every entry in a contest; easier to then copy IDs into screening-tests.json
async function listContestEntries(contestId) {
    const entries = await listEntries(contestId);
    console.log(`${entries.length} entries in contest ${contestId}:\n`);
    for (const entry of entries) {
        let flags = [];
        if (entry.screening) flags = flagTypes(entry.screening.flags);
        const title = entry.title || "(no title)";
        console.log(`${entry.id}  ${title}, by ${entry.fanName}   flags now: ${describe(flags)}`);
    }
}

async function runTests(only) {
    const allTests = JSON.parse(readFileSync(TESTS_FILE, "utf8"));

    // --only "word" : run just the tests whose name contains that word
    const tests = [];
    for (const test of allTests) {
        if (!only || test.name.toLowerCase().includes(only.toLowerCase())) tests.push(test);
    }
    console.log(`Running ${tests.length} screening tests. Each one takes about a minute.\n`);

    const rows = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    // one at a time, on purpose, since running them all at once would hit Gemini's rate limits
    for (const test of tests) {
        console.log(`Screening "${test.name}"...`);
        const expected = [...test.expectFlags].sort();

        let result;
        try {
            result = await screenEntry(test.entryId, {force: true});
        } catch (err) {
            rows.push({name: test.name, expected: describe(expected), got: "error", outcome: "ERROR", note: err.message});
            failed++;
            continue;
        }
        const got = flagTypes(result.flags || []);
        
        if (got.includes("unchecked")) {
            // Gemini couldn't run, so this test says nothing about screening's accuracy: skip it, don't fail it
            rows.push({name: test.name, expected: describe(expected), got: describe(got), outcome: "SKIPPED", note: "Gemini couldn't run"});
            skipped++;
        } else if (sameList(got, expected)) { // if we got exactly the expected flags
            rows.push({name: test.name, expected: describe(expected), got: describe(got), outcome: "PASS", note: ""});
            passed++;
        } else { // any difference (extra flag, missing flag, different flag)
            rows.push({name: test.name, expected: describe(expected), got: describe(got), outcome: "FAIL", note: test.why || ""});
            failed++;
        }

    }
    // just creates the results table, with each column padded to line up 
    const headers = { name: "Test" , expected: "Expected flags", got: "Got", outcome: "Result"};
    const widths = {};
    for (const column of Object.keys(headers)) {
        let width = headers[column].length;
        for (const row of rows) {
            width = Math.max(width, String(row[column]).length);
            widths[column] = width;
        }
    }
    const line = (row) => 
        `${row.name.padEnd(widths.name)} ${row.expected.padEnd(widths.expected)} ${row.got.padEnd(widths.got)}  ${row.outcome}`;

    console.log("\n" + line(headers));
    console.log("-".repeat(widths.name + widths.expected + widths.got + 14));

    for (const row of rows) {
        console.log(line(row));
        if (row.outcome !== "PASS" && row.note) {
            console.log(`    note: ${row.note}`);
        }
    }

    const scored = passed + failed;
    // prints out "5 of 6 passed" as well as how many were skipped 
    console.log(`\n${passed} of ${scored} passed${skipped ? `, ${skipped} skipped because Gemini couldn't run` : ""}.`);

    // a non-zero exit code means "something failed", which tools like GitHub Actions can understand.
    process.exit(failed > 0 ? 1 : 0);


}
// read the command: --list CONTEST_ID , or only "word" , or nothing.
const args = process.argv.slice(2); // .slice(2) skips the first two, which is just node and the script's path
if (args[0] === "--list") { // run all tests
    await listContestEntries(args[1]);
    process.exit(0);
} else { // otherwise run only the ones that are given
    let only = null;
    if (args[0] === "--only") only = args[1];
    await runTests(only);
}   

