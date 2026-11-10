import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { API_URL } from "./api";
import { formatTime } from "./format";
import TranscriptSearch from "./TranscriptSearch";
import EpisodeView from "./EpisodeView";
import { ContestTabs, FanHeader } from "./ContestShell";

// saerch the episodes: everything the creator said in a contest's episodes, for fans finding clips.

export default function ContestEpisodesPage() {
    const {contestId, episodeId} = useParams(); // handles contest ID and episode ID
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [contest, setContest] = useState(null);
    const [problem, setProblem] = useState("");

    useEffect(() => { // same public contest route that the contest page uses, includes list of episodes this contest allows
        fetch(`${API_URL}/api/public/contests/${contestId}`)
            .then(async (res) => {
                const data = await res.json(); // server sends back list of episodes this contest allows
                if (!res.ok) throw new Error(data.error);
                setContest(data); 
            })
            .catch((err) => setProblem(err.message));
    }, [contestId]);

    const episodesAddress = `/c/${contestId}/episodes`; // the contest's search page address, saved once

    return (
        <>
            <FanHeader />
            <main className="container page">{renderBody()}</main>
        </>
    );

    function renderBody() {
        if (!contest) { // contest isn't loaded yet
            // if there's a problem show alert box; otherwise show "loading" message
            return <p className={problem ? "alert" : "notice"}>{problem || "Loading..."}</p>;
        }


        // user is watching one episode, from a search result or the list. address keeps up with the video (?t=),
        // so refreshing or sharing the link comes back to the same moment.
        if (episodeId) {
            const startAt = Number(searchParams.get("t")) || 0;
            return (
                <EpisodeView
                    key={episodeId}
                    episodeId={episodeId}
                    startAt={startAt}
                    rememberTime
                    backLabel="Back to the episodes"
                    onBack={() => navigate(episodesAddress)}
                />
            );
        }
        
        // the search page itself
        const episodeIds = contest.episodes.map((ep) => ep.id);

        return (
            <>
                <div className="page-head">
                    <h1>{contest.title}</h1>
                    <ContestTabs contestId={contestId}/>

                </div>
                {contest.episodes.length === 0 ? (
                    <p className="notice">This contest's episodes aren't ready to search yet. Check back soon.</p>
                ) : (
                    <>
                        <section className="episode-search">
                            <p className="eyebrow">
                                {contest.episodes.length === 1 ? "1 episode" : `${contest.episodes.length} episodes`} in this contest
                            </p>
                            {/* only this contest's episodes are searched; a result opens the episode at that moment */}
                            <TranscriptSearch
                                episodeIds={episodeIds}
                                onResult={(id, seconds) => navigate(`${episodesAddress}/${id}?t=${Math.floor(seconds)}`)}
                            />
                        </section>
            <section className="block">
                            <h2>Episodes you can use</h2>
                            <ul className="rows">
                                {contest.episodes.map((ep) => (
                                    <li key={ep.id} className="row">
                                        <div className="row-main">
                                            <span className="row-title">{ep.title}</span>
                                            {ep.durationSec ? <span className="meta">{formatTime(ep.durationSec)}</span> : null}
                                        </div>
                                        <Link className="button-link" to={`${episodesAddress}/${ep.id}`}>Watch</Link>
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


