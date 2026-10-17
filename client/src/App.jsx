import { useEffect, useState } from "react";
import EpisodeUpload from "./EpisodeUpload";
import EpisodeList from "./EpisodeList";
import EpisodeView from "./EpisodeView";
import TranscriptSearch from "./TranscriptSearch";
import ContestsPage from "./ContestsPage";
import {API_URL} from "./api";

export default function App() {
  const [serverDown, setServerDown] = useState(false);
  const [tab, setTab] = useState("episodes"); // "episodes" or "contests"
  const [openEpisode, setOpenEpisode] = useState(null); // { id , startAt }

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => setServerDown(!res.ok))
      .catch(() => setServerDown(true));
  }, []);

  function showTab(name) {
    setTab(name);
    setOpenEpisode(null);
  }
  
  return (
    <>
      <header className="app-header">
        <div className="container header-inner">
          <span className="brand">
            <span className="marker">Highlighter</span>
          </span>
          <nav className="tabs" aria-label="Sections">
            <button className="tab" aria-pressed={tab === "episodes"} onClick={() => showTab("episodes")}>
              <span>Episodes</span>
            </button>
            <button className="tab" aria-pressed={tab === "contests"} onClick={() => showTab("contests")}>
              <span>Contests</span>
            </button>
          </nav>
        </div>
      </header>
 
      {serverDown && (
        <div className="banner" role="alert">
          Can't reach the server. Start it with npm run dev in the server folder, then refresh.
        </div>
      )}
 
      <main className="container page">
        {openEpisode ? (
          <EpisodeView episodeId={openEpisode.id} startAt={openEpisode.startAt} onBack={() => setOpenEpisode(null)} />
        ) : tab === "episodes" ? (
          <>
            <div className="page-head">
              <h1>Episodes</h1>
              <p>Upload your episodes once. They're transcribed automatically, so fans can search everything you've said.</p>
            </div>
            <EpisodeUpload />
            <TranscriptSearch onResult={(id, seconds) => setOpenEpisode({ id, startAt: seconds })} />
            <EpisodeList onOpen={(id) => setOpenEpisode({ id, startAt: 0 })} />
          </>
        ) : (
          <ContestsPage />
        )}
      </main>
    </>
  );
}

