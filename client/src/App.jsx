import { useEffect, useState, useCallback } from "react";
import {Link,Route, Routes, NavLink, Navigate, useNavigate, useParams, useSearchParams} from "react-router-dom";
import EpisodeUpload from "./EpisodeUpload";
import EpisodeList from "./EpisodeList";
import EpisodeView from "./EpisodeView";
import TranscriptSearch from "./TranscriptSearch";
import ContestsPage from "./ContestsPage";
import PublicContestPage from "./PublicContestPage";
import {API_URL} from "./api";
import EntriesPage from "./EntriesPage";

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

// the creator's side: Episodes and Contests tabs. Every page has its own address, so refreshing,
// the back button, and sharing a link all keep you where you were
function CreatorApp() {
  const [tab, setTab] = useState("episodes"); // "episodes" or "contests"
  // which episode is open, and when to start playing. null = show the tab's screen.
  const [openEpisode, setOpenEpisode] = useState(null);
  // which contests the entries tab shows. null = pick the newest contest
  const [entriesContestId, setEntriesContestId] = useState(null);

  function showTab(name) {
    setTab(name);
    setOpenEpisode(null);
  }

  // contest's "Review entries" button, switch to the Entries tab, showing that contest and it's entries
  function reviewEntries(contestId) {
    setEntriesContestId(contestId);
    showTab("entries");
  }
  
  return (
    <>
      <header className="app-header">
        <div className="container header-inner">
          <Link to="/episodes" className="brand">
            <span className="marker">Highlighter</span>
          </Link>
          {/* NavLink knows which tab matches the address, and marks it with aria-current="page"*/}
          <nav className="tabs" aria-label="Sections">
            <NavLink to="/episodes" className="tab">
              <span>Episodes</span>
            </NavLink>
            <NavLink to="/contests" className="tab">
              <span>Contests</span>
            </NavLink>
            <NavLink to="/entries" className="tab">
              <span>Entries</span>
            </NavLink>
          </nav>
        </div>
      </header>
 
      <main className="container page">
        <Routes>
          <Route index element={<Navigate to="/episodes" replace/>}/>
          <Route path="episodes" element={<EpisodesPage />}/>
          <Route path="episodes/:episodeId" element={<EpisodeRoute />}/>
          <Route path="contests" element={<ContestsPage />}/>
          <Route path="contests/:contestId" element={<ContestsPage />}/>
          <Route path="entries" element={<EntriesRoute />}/>
          <Route path="entries/:contestId" element={<EntriesRoute />}/>
          <Route path="*" element={<NotFound />}/>
        </Routes>
    </main>
    </>
  );
}

// episodes page: upload, search, and list of episodes
function EpisodesPage() {
  const navigate = useNavigate();
  return (
    <>
      <div className="page-head">
        <h1>Episodes</h1>
        <p>Upload your episodes once. They're transcribed automatically, so fans can search everything you've said.</p>
      </div>
      <EpisodeUpload />
      {/* a search result opens that episode at the moment words are said*/}
      <TranscriptSearch onResult={(id,seconds) => navigate(`/episodes/${id}?t=${Math.floor(seconds)}`)}/>
      <EpisodeList onOpen={(id) => navigate(`/episodes/${id}`)}/>
    </>
  );
}

// one episode, read from the address: /episodes/EPISODE_ID, with ?t=SECONDS to start at that moment
function EpisodeRoute() {
  const {episodeId} = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const startAt = Number(searchParams.get("t")) || 0; // no ?t= (or a bad one) just starts the user at the beginning instead.
  return <EpisodeView key={episodeId} episodeId={episodeId} startAt={startAt} onBack={() => navigate("/episodes")} />
}

// Entries page, with contest read from the address: /entries/CONTEST_ID
function EntriesRoute() {
  const {contestId} = useParams();
  const navigate = useNavigate();

  // picking a contest in dropdown changes the address. When page picks the newest contest 
  // automatically (at /entries), it replaces address instead of adding to history
  const changeContest=useCallback(
    (id) => navigate(`/entries/${id}`, {replace: !contestId}),
    [navigate, contestId]
  );

  return <EntriesPage contestId={contestId || null} onChangeContest={changeContest}/>;
}

// any address that doesnt match a page
function NotFound() {
  return (
    <div className="page-head">
      <h1>Page not found</h1>
      <p>
        Oops! There's nothing at this address. <Link to="/episodes">Go to your episodes</Link>.
      </p>
    </div>
  );
}