import {useEffect, useCallback, useState} from "react";
import { API_URL, authFetch} from "./api";
import {formatMoney} from "./format";
import FundContest from "./FundContest";
import PayoutPanel from "./PayoutPanel";
const STATUS_LABELS = {
    draft: "Draft",
    open: "Open for entries",
    closed: "Closed",
    paying: "Paying winners", 
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
export default function ContestView({contestId, presets, onBack, onReviewEntries}) {
    const [contest, setContest] = useState(null);
    const [problem, setProblem] = useState("");
    const [copied, setCopied] = useState(false);
    const [ending, setEnding] = useState(false); // true while "End contest now" is saving
    const [paying, setPaying] = useState(false); // true while "Pay winners" is sending payout
    // called by paypal button once payment is captured. server will send back the updated contest.
    // useCallback keeps it the same function so paypal button doesn't have to be set up again. 
    const handleFunded = useCallback((updated) => setContest(updated), []); 

    useEffect(() => {
        authFetch(`${API_URL}/api/contests/${contestId}`)
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
    const shareUrl = `${window.location.origin}/c/${contest.id}`;

    const deadline = new Date(contest.deadline).toLocaleString([], {dateStyle: "full", timeStyle: "short"});

    // an open contest past its deadline will show as closed (calculated by the isClosed() function)
    // if the contest is closed but the database still shows open, show "Closed" instead. Otherwise, show whatever database says
    const statusKey = contest.closed && contest.status === "open" ? "closed" : contest.status;

    // "end contest now" : asks first, since fans cant enter after this
    // "Pay winners": shows exactly where the money goes ,and asks first, since payouts can't be undone.
    async function payWinners() {
        let summary = "";
        for (const w of contest.winners) {
            summary += `\n${placeLabel(w.place)} place: ${formatMoney(w.prizeCents)} to ${w.fanName}`;
        }
        if (contest.unusedCents > 0) {
            summary += `\n\n${formatMoney(contest.unusedCents)} in unused prizes will be refunded to you.`;
        }
        const question =
            contest.winners.length > 0 // if winners,  send summary, otherwise, offer full refund
                ? `Pay your winners now? This sends the money with PayPal, and can't be undone.\n${summary}`
                : `Refund your full prize pool of ${formatMoney(contest.prizeTotalCents)}? No entries could win.`;
        if (!window.confirm(question)) return;

        setPaying(true);
        setProblem("");
        try {
            const res = await authFetch(`${API_URL}/api/contests/${contest.id}/pay`, {method: "POST"});
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setContest(data);
        } catch (err) {
            // reload the contest: if payout failed after the refund, the page should show that
            // refund happened, and the saved error (which the winners panel displays)
            const res = await authFetch(`${API_URL}/api/contests/${contest.id}`);
            const latest = await res.json();
            if (res.ok) setContest(latest);
            // only show error at the top if winners panel isn't already showing it
            if (!res.ok || latest.payoutError !== err.message) setProblem(err.message);
        } finally {
            setPaying(false);
        }
    }
    async function endContest() {
        const sure = window.confirm("End this contest now? Fans won't be able to enter anymore, and you'll be able to pick the winners.");
        if (!sure) return;

        setEnding(true);
        try {
            const res = await authFetch(`${API_URL}/api/contests/${contest.id}/close`, {method: "POST"});
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setContest(data);
        } catch (err) {
            setProblem(err.message);
        } finally {
            setEnding(false);
        }
    }

    return (
        <section>
            <button className="btn-quiet" onClick={onBack}>
                Back to contests
            </button>

            <div className="page-head" style={{marginTop: 8}}>
                <h1>{contest.title}</h1>
                <div className="meta" style={{marginTop: 10}}>
                    <span className={`status status-${statusKey}`}>{STATUS_LABELS[statusKey] ?? statusKey}</span>
                    {contest.status === "paying" && <span className="spinner" aria-label="Paying winners"></span>}
                    <span>{presets[contest.preset]?.label ?? "Custom"}</span>
                    <span>
                        {(contest.entryCount ?? 0).toLocaleString()} {contest.entryCount === 1 ? "entry" : "entries"}
                    </span>
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
            {problem && <p className="alert">{problem}</p>}
            
            {contest.status === "open" && !contest.closed && ( // prize pools only show when the contest is actually open
                <section className="panel">
                <h2>Prize pool funded</h2>
                <div className="stack">
                    <p>
                    You paid <strong>{formatMoney(contest.prizeTotalCents)}</strong> with PayPal
                    {contest.fundedAt ? ` on ${new Date(contest.fundedAt).toLocaleDateString([], { dateStyle: "long" })}` : ""}. Your
                    contest is open, and fans can enter until {deadline}.
                    </p>
                    <div className="field">
                    <span className="label">Share this link with your fans</span>
                    <div className="share">
                        <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label="Contest link" />
                        <button onClick={() => navigator.clipboard.writeText(shareUrl).then(() => setCopied(true))}>
                        {copied ? "Copied" : "Copy link"}
                        </button>
                    </div>
                    
                    </div>
                    <div className="actions">
                        <button onClick={endContest} disabled={ending}>
                            {ending ? "Ending..." : "End contest now"}
                        </button>
                        <span className="hint">Stops new entries early, so you can pick winners.</span>
                    </div>
                </div>
                </section>
            )}
            {/*closed contests: next step is picking winners, then paying them after*/}
            {contest.closed && contest.status === "closed" && (
                <section className="panel">
                    <h2>{contest.winners ? "Winners picked" : "Contest closed"}</h2>
                    {!contest.winners && <p>No more entries can come in. Next, pick your winners on the Entries tab.</p>}
                    {contest.winners && contest.winners.length > 0 && (
                        <ul className="rows">
                            {contest.winners.map((w) => (
                                <li key={w.place} className="row">
                                    <span className="row-main">{placeLabel(w.place)} place: {w.title}, by {w.fanName}</span>
                                    <span>{formatMoney(w.prizeCents)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {contest.winners && contest.winners.length === 0 && (
                        <p>No entries were in good standing, so no prizes were awarded.</p>
                    )}
                    {contest.winners && contest.unusedCents > 0 && (
                        <p className="hint">
                            {contest.refund
                                ? `${formatMoney(contest.refund.amountCents)} in unused prizes was refunded to you.`
                                : `${formatMoney(contest.unusedCents)} in unused prizes will be refunded to you when you pay your winners.`}
                        </p>
                    )}
                    {/*payout that failed last time (nothing was paid, so it's safe to try again)*/}
                    {contest.payoutError && <p className="alert">The last payment attempt didn't go through: {contest.payoutError}</p>}
                    <div className="actions">
                        {contest.winners && (
                            <button className="btn-primary" onClick={payWinners} disabled={paying}>
                                {paying ? "Paying..." : contest.winners.length > 0 ? "Pay winners" : "Refund prize pool"}
                            </button>
                        )}
                        <button className={contest.winners ? "" : "btn-primary"} onClick={() => onReviewEntries(contest.id)}>
                            {contest.winners ? "Change winners" : "Pick winners"}
                        </button>
                        
                    </div>
                </section>
            )}
            {/* after pay winners button, show payout panel (with each winners payment status and refund (if applicable)*/}
            {(contest.status === "paying" || contest.status ==="paid") && (
                <PayoutPanel contest={contest} onChange={setContest}/>
            )}
            {/* open contests: how many entries so far, and a button to the Entries tab to review them */}
            {contest.status !== "draft" && (
                <section className="panel">
                    <h2>Entries</h2>
                    <div className="actions" style={{ justifyContent: "space-between" }}>
                        <span>
                            {(contest.entryCount ?? 0).toLocaleString()} {contest.entryCount === 1 ? "entry" : "entries"} so far
                        </span>
                        <button className="btn-primary" onClick={() => onReviewEntries(contest.id)}>
                            Review entries
                        </button>
                    </div>
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