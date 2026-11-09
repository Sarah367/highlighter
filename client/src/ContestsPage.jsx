import {useEffect, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import ContestForm from "./ContestForm";
import ContestList from "./ContestList";
import ContestView from "./ContestView";
import { API_URL } from "./api";

// creator's contest screen: form on top, their contests below.
export default function ContestPage() {
    const {contestId} = useParams(); // only set at /contests/CONTEST_ID
    const navigate = useNavigate();
    const [presets, setPresets] = useState(null);
    const [loadError, setLoadError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0); 
    const [openContestId, setOpenContestId] = useState(null);

    // gets presets from the server once, so form and server always agree.
    useEffect(() => {
        fetch(`${API_URL}/api/contest-presets`)
            .then((res) => res.json())
            .then(setPresets)
            .catch((err) => setLoadError(err.message));
    }, []);

    if (loadError) return <p>Couldn't load presets: {loadError}</p>;
    if (!presets) return <p>Loading...</p>;
    // one contest is open (ID is in the address), show that contest instead of the whole list
    if (contestId) {
        return (
            <ContestView
                key={contestId}
                contestId={contestId}
                presets={presets}
                onBack={() => navigate("/contests")}
                onReviewEntries={(id) => navigate(`/entries/${id}`)}
            />
        )
    }


    return (
        <>
        <div className="page-head">
            <h1>Contests</h1>
            <p>Set a brief, fund the prizes, and let your fans create. You pick the winners.</p>

        </div>
    
        {loadError && <p className="alert">Couldn't load contest presets: {loadError}</p>}
        {!loadError && !presets && <p className="notice">Loading…</p>}
        {presets && (
            <>
            <ContestForm presets={presets} onCreated={() => setRefreshKey((k) => k + 1)} />
            <ContestList presets={presets} refreshKey={refreshKey} onOpen={(id) => navigate(`/contests/${id}`)}/>
            </>
        )}
        </>
    );
}