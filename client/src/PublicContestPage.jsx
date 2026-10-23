import {useEffect, useState} from "react";
import {Link, useParams} from "react-router-dom";
import { API_URL } from "./api";
import { formatMoney, formatTime } from "./format";
import { PrizeList, RulesList, timeLeft } from "./contestDetails";
import TranscriptSearch from "./TranscriptSearch";
import EpisodeView from "./EpisodeView";

// the page a creator shares with fans: /c/CONTEST_ID
export default function PublicContestPage() {
    const {contestId} = useParams(); // the ID from the address
    const [contest, setContest] = useState(null);
    const [problem, setProblem] = useState("");
    const [openEpisode, setOpenEpisode] = useState(null); // {id,startAt}

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
            <header className="app-header">
                <div className="container header-inner">
                    <Link to="/" className="brand">
                        <span className = "marker">Highlighter</span>
                    </Link>
                    <span className="hint">Fan contest</span>
                </div>
            </header>

            <main className="container page">{renderBody()}</main>
        </>
    );

    function renderBody() {
        if (!contest) {
            return <p className={problem ? "alert" : "notice"}>{problem || "Loading contest..."}</p>;
        }

        // a fan is watching an episode: show the player, with a way back to the contest.
        if (openEpisode) {
            return (
                <EpisodeView
                    episodeId={openEpisode.id}
                    startAt={openEpisode.startAt}
                    backLabel="Back to the contest"
                    onBack={() => setOpenEpisode(null)}
                />
            );
        }

        const isOpen = contest.status === "open" && new Date(contest.deadline) > new Date();
        const entries = contest.entryCount ?? 0;
        const episodeIds = contest.episodes.map((ep) => ep.id);

        return (
            <>
                <div className="page-head">
                    <h1>{contest.title}</h1>
                    <div className="stats">
                        <div>
                            <span className="stat-value">{formatMoney(contest.prizeTotalCents)}</span>
                            <span className="stat-label">{entries === 1 ? "Entry so far" : "Entries so far"}</span>
                        </div>
                        <div>
                            <span className="stat-value">{timeLeft(contest.deadline)}</span>
                            <span className="stat-label">
                                Ends {new Date(contest.deadline).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                            </span>
                        </div>
                    </div>
                </div>
                <section className="panel">
                    <h2>{isOpen ? "Enter this contest" : "This contest is closed"}</h2>
                    <p className="muted">
                        {isOpen
                            ? "Entry submission is coming next. Read the brief and rules below, then start creating."
                            : "Entries are no longer being accepted."}
                    </p>
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
                {contest.episodes.length > 0 && (
                    <>
                        <TranscriptSearch episodeIds={episodeIds} onResult={(id, seconds) => setOpenEpisode({ id, startAt: seconds })} />
                            <section className="block">
                            <h2>Episodes you can use</h2>
                            <ul className="rows">
                                {contest.episodes.map((ep) => (
                                <li key={ep.id} className="row">
                                    <div className="row-main">
                                    <span className="row-title">{ep.title}</span>
                                    {ep.durationSec ? <span className="meta">{formatTime(ep.durationSec)}</span> : null}
                                    </div>
                                    <button onClick={() => setOpenEpisode({ id: ep.id, startAt: 0 })}>Watch</button>
                                </li>
                                ))}
                            </ul>
                            </section>
                        </>
                        )}
            </>
        );
    }
}