import {useEffect, useCallback, useState} from "react";
import { API_URL } from "./api";
import {formatMoney} from "./format";
import FundContest from "./FundContest";

const STATUS_LABELS = {
    draft: "Draft",
    open: "Open for entries",
    closed: "Closed",
    paid: "Winners paid",
};

const SOURCE_LABELS = {
    required: "Required: entries must use clips from your episodes",
    optional: "Optional: your episodes can be used, and original content is welcome",
    none: "None: entirely original work",

};

function placeLabel(n) {
    return ["1st", "2nd", "3rd"][n-1] ?? `${n}th`;
}

function formatLength(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (minutes) {
        parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
    }
    if (seconds || !minutes) {
        parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);
    }
    return parts.join(" ");
}

// One contest showing prize, rules, status. 
// Draft contests show where the funding goes.
export default function ContestView({contestId, presets, onBack}) {
    const [contest, setContest] = useState(null);
    const [problem, setProblem] = useState("");
    // called by paypal button once payment is captured. server will send back the updated contest.
    // useCallback keeps it the same function so paypal button doesn't have to be set up again. 
    const handleFunded = useCallback((updated) => setContest(updated), []); 

    useEffect(() => {
        fetch(`${API_URL}/api/contests/${contestId}`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setContest(data);
            })
            .catch((err) => setProblem(err.message));
    }, [contestId]);

    if (!contest) {
        return (
            <section>
                <button className="btn-quiet" onClick={onBack}>
                    Back to contests
                </button>
                <p className={problem ? "alert" : "notice"} style={{marginTop: 16}}>
                    {problem || "Loading contest..."}
                </p>
            </section>
        );
    }

    const formats = contest.entryFormats.map((f) => (f === "video" ? "Video" : "Audio")).join(" or ");
    const deadline = new Date(contest.deadline).toLocaleString([], {dateStyle: "full", timeStyle: "short"});

    return (
        <section>
            <button className="btn-quiet" onClick={onBack}>
                Back to contests
            </button>

            <div className="page-head" style={{marginTop: 8}}>
                <h1>{contest.title}</h1>
                <div className="meta" style={{marginTop: 10}}>
                    <span className={`status status-${contest.status}`}>{STATUS_LABELS[contest.status] ?? contest.status}</span>
                    <span>{presets[contest.preset]?.label ?? "Custom"}</span>
                    <span>Ends {deadline}</span>
                </div>
            </div>
            {contest.status === "draft" && (
                <section className="panel">
                    <h2>Fund the prize pool</h2>
                    <div className="stack">
                        <p>
                            Your contest opens to fans once the prize pool of <strong>{formatMoney(contest.prizeTotalCents)}</strong> is paid.
                            Funding up front shows fans the prizes are real, and winners are paid from it when the contest ends.
                        </p>
                        <FundContest contest={contest} onFunded={handleFunded} />
                    </div>
                </section>
            )}
            {contest.status === "open" && (
                <section className="panel">
                    <h2>Prize pool funded</h2>
                    <p>
                        You paid <strong>{formatMoney(contest.prizeTotalCents)}</strong> with PayPal
                        {contest.fundedAt ? ` on ${new Date(contest.fundedAt).toLocaleDateString([], { dateStyle: "long" })}` : ""}. Your
                        contest is open, and fans can enter until {deadline}.
                    </p>
                </section>
            )}
            <div className="block">
                <h2>Brief</h2>
                <p className="brief">{contest.brief}</p>
            </div>

            <div className="block">
                <h2>Prizes</h2>
                <ul className="rows">
                {contest.prizesCents.map((cents, i) => (
                    <li key={i} className="row">
                    <span className="row-main">{placeLabel(i + 1)} place</span>
                    <span>{formatMoney(cents)}</span>
                    </li>
                ))}
                <li className="row">
                    <span className="row-main total">Prize pool</span>
                    <span className="total">{formatMoney(contest.prizeTotalCents)}</span>
                </li>
                </ul>
            </div>
            <div className="block">
                <h2>Rules</h2>
                <dl className="details">
                <dt>Entry format</dt>
                <dd>{formats}</dd>
        
                <dt>Length</dt>
                <dd>
                    {formatLength(contest.minLengthSec)} to {formatLength(contest.maxLengthSec)}
                </dd>
        
                <dt>Entries per fan</dt>
                <dd>{contest.maxEntriesPerFan}</dd>
        
                <dt>Source material</dt>
                <dd>{SOURCE_LABELS[contest.sourceRule]}</dd>
        
                {contest.sourceRule !== "none" && (
                    <>
                    <dt>Episodes</dt>
                    <dd>
                        {contest.eligibleEpisodeIds
                        ? `${contest.eligibleEpisodeIds.length} selected episode${contest.eligibleEpisodeIds.length === 1 ? "" : "s"}`
                        : "All of your episodes"}
                    </dd>
                    </>
                )}
        
                <dt>Fake-quote check</dt>
                <dd>{contest.fakeQuoteCheck ? "On: edits that put words in your mouth get flagged" : "Off"}</dd>
                </dl>
            </div>
        </section>
    );
}