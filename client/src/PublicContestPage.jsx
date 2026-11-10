import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_URL } from "./api";
import { formatMoney} from "./format";
import { PrizeList, RulesList, timeLeft } from "./contestDetails";
import EntryForm from "./EntryForm";
import { ContestTabs, FanHeader } from "./ContestShell";

// the page a creator shares with fans: /c/CONTEST_ID
export default function PublicContestPage() {
    const {contestId} = useParams(); // the ID from the address
    const [contest, setContest] = useState(null);
    const [problem, setProblem] = useState("");
    

    useEffect(() => {
        fetch(`${API_URL}/api/public/contests/${contestId}`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setContest(data);
            })
            .catch((err) => setProblem(err.message));
    }, [contestId]);

    return (
        <>
            <FanHeader/>
            <main className="container page">{renderBody()}</main>
        </>
    );

    function renderBody() {
        if (!contest) {
            return <p className={problem ? "alert" : "notice"}>{problem || "Loading contest..."}</p>;
        }


        const isOpen = contest.status === "open" && new Date(contest.deadline) > new Date();
        const entries = contest.entryCount ?? 0;

        return (
            <>
                <div className="page-head">
                    <h1>{contest.title}</h1>
                    <div className="stats">
                        <div>
                            <span className="stat-value">{formatMoney(contest.prizeTotalCents)}</span>
                            <span className="stat-label">Prize pool, funded with PayPal</span>
                        </div>
                        <div>
                            <span className="stat-value">{entries.toLocaleString()}</span>
                            <span className="stat-label">{entries === 1 ? "Entry so far" : "Entries so far"}</span>
                        </div>
                        <div>
                            <span className="stat-value">{timeLeft(contest.deadline)}</span>
                            <span className="stat-label">
                                Ends {new Date(contest.deadline).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                            </span>
                        </div>
                    </div>
                    <ContestTabs contestId={contestId} />
                </div>
                {/* the transcript search, one click away: it's how fans find clips */}
                {contest.episodes.length > 0 && (
                    <Link className="search-callout" to={`/c/${contestId}/episodes`}>
                        <strong>Looking for clips?</strong>
                        <span>
                            Search everything the creator said in this contest's{" "}
                            {contest.episodes.length === 1 ? "episode" : `${contest.episodes.length} episodes`}, and jump to the exact moment.
                        </span>
                        <span className="search-callout-arrow" aria-hidden="true">→</span>
                    </Link>
                )}
                <section className="panel">
                    <h2>{isOpen ? "Enter this contest" : "This contest is closed"}</h2>
                    {isOpen ? (
                        // After a successful entry, show the new count right away.
                        <EntryForm contest={contest} onSubmitted={(count) => setContest((c) => ({ ...c, entryCount: count }))} />
                    ) : (
                        <p className="muted">Entries are no longer being accepted.</p>
                    )}
                </section>
                <div className="block">
                    <h2>Brief</h2>
                    <p className="brief">{contest.brief}</p>
                </div>
                <div className="block">
                    <h2>Prizes</h2>
                    <PrizeList prizesCents={contest.prizesCents} prizeTotalCents={contest.prizeTotalCents}/>
                </div>
                <div className="block">
                    <h2>Rules</h2>
                    <RulesList contest={contest}/>
                </div>
                </>
        );
    }
}