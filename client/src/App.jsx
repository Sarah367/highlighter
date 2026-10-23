import { useEffect, useState } from "react";
import {Link,Route, Routes} from "react-router-dom";
import EpisodeUpload from "./EpisodeUpload";
import EpisodeList from "./EpisodeList";
import EpisodeView from "./EpisodeView";
import TranscriptSearch from "./TranscriptSearch";
import ContestsPage from "./ContestsPage";
import PublicContestPage from "./PublicContestPage";
import {API_URL} from "./api";

export default function App() {
  const [serverDown, setServerDown] = useState(false);

  // only say something about the server when it's unreachable.
  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => setServerDown(!res.ok))
      .catch(() => setServerDown(true));
  }, []);

  return (
    <>
      {serverDown && (
        <div className="banner" role="alert">
          Can't reach the server. Start it with npm run dev in the server folder, then refresh.
        </div>
      )}

      {/* Which page to show depends on the address */}
      <Routes>
        <Route path="/c/:contestId" element={<PublicContestPage/>}/>
        <Route path="*" element={<CreatorApp/>}/>
      </Routes>
    </>
  );
}

// the creator's side: Episodes and Contests tabs.
function CreatorApp() {
  const [tab, setTab] = useState("episodes"); // "episodes" or "contests"
  // which episode is open, and when to start playing. null = show the tab's screen.
  const [openEpisode, setOpenEpisode] = useState(null);


  function showTab(name) {
    setTab(name);
    setOpenEpisode(null);
  }
  
  return (
    <>
      <header className="app-header">
        <div className="container header-inner">
          <Link to="/" className="brand" onClick={() => showTab("episodes")}>
            <span className="marker">Highlighter</span>
          </Link>
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

