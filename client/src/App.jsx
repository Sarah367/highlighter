import { useEffect, useState, useCallback } from "react";
import {Link,Route, Routes, NavLink, Navigate, useLocation, useNavigate, useParams, useSearchParams} from "react-router-dom";
import EpisodeUpload from "./EpisodeUpload";
import EpisodeList from "./EpisodeList";
import EpisodeView from "./EpisodeView";
import TranscriptSearch from "./TranscriptSearch";
import ContestsPage from "./ContestsPage";
import PublicContestPage from "./PublicContestPage";
import {API_URL} from "./api";
import EntriesPage from "./EntriesPage";
import AuthPage from "./AuthPage";
import BrowsePage from "./BrowsePage";
import MyEntriesPage from "./MyEntriesPage";
import StartCreatingPage from "./StartCreatingPage";
import UpgradeButton from "./UpgradeButton";
import {AuthProvider, useAuth} from "./auth";

export default function App() {
  const [serverDown, setServerDown] = useState(false);

  // only say something about the server when it's unreachable.
  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => setServerDown(!res.ok))
      .catch(() => setServerDown(true));
  }, []);

  return (
    // everything is wrapped in auth provider so every page can call useAuth()
    <AuthProvider>
      {serverDown && (
        <div className="banner" role="alert">
          Can't reach the server. Start it with npm run dev in the server folder, then refresh.
        </div>
      )}

      {/* Which page to show depends on the address */}
      <Routes>
        <Route path="/c/:contestId" element={<PublicContestPage/>}/>
        <Route path="*" element={<SiteApp/>}/>
      </Routes>
    </AuthProvider>
  );
}
// everything except the fan contest pages (which have their own header). every page has its own address
// so refreshing, the back button, and sharing a link all keep you where you were
// Anyone can browse, login, signup (/browse, /login, /signup)
// Only creators can look at their episodes, contests, entries, and pages under them

function SiteApp() {
  return (
    <>
      <SiteHeader/>
      <main className="container page">
        <Routes>
          {/* the home page will go here; for now, send people to their starting page */}
          <Route index element={<StartPage />}/>
          <Route path="browse" element={<BrowsePage />}/>
          <Route path="login" element={<AuthPage mode="login" />}/>
          <Route path="signup" element={<AuthPage mode="signup" />} />
          <Route path="my-entries" element={<RequireUser><MyEntriesPage></MyEntriesPage></RequireUser>}/>
          <Route path="start-creating" element={<RequireUser><StartCreatingPage></StartCreatingPage></RequireUser>}/>
          {/* creator pages: RequireCreator checks for a creator account before showing them */}
          <Route path="episodes" element={<RequireCreator><EpisodesPage /></RequireCreator>} />
          <Route path="episodes/:episodeId" element={<RequireCreator><EpisodeRoute /></RequireCreator>} />
          <Route path="contests" element={<RequireCreator><ContestsPage /></RequireCreator>} />
          <Route path="contests/:contestId" element={<RequireCreator><ContestsPage /></RequireCreator>} />
          <Route path="entries" element={<RequireCreator><EntriesRoute /></RequireCreator>} />
          <Route path="entries/:contestId" element={<RequireCreator><EntriesRoute /></RequireCreator>} />

          <Route path="*" element={<NotFound />} /> 
        </Routes>
      </main>


    </>
  );
}

// the header changes with who's signed in: creators see their tabs, everyone else sees Browse contests.
function SiteHeader() {
  const {user, profile, loading, isCreator, logOut} = useAuth();
  const navigate = useNavigate();

  async function handleLogOut() {
    await logOut();
    navigate("/browse");
  }

  return (
    <header className="app-header">
      <div className="container header-inner">
        <Link to="/" className="brand">
          <span className="marker">Highlighter</span>
        </Link>
        
        <div className="header-actions">
          {/* NavLink knows which tab matches the address, and marks it with aria-current="page" */}
          <nav className="tabs" aria-label="Sections">
            {isCreator ? (
              <>
                <NavLink to="/episodes" className="tab"><span>Episodes</span></NavLink>
                <NavLink to="/contests" className="tab"><span>Contests</span></NavLink>
                <NavLink to="/entries" className="tab"><span>Entries</span></NavLink>
              </>  
            ) : (
              <>
                <NavLink to="/browse" className="tab"><span>Browse contests</span></NavLink>
                {/* signed-in fans can start running contests anytime*/}
                {user && <NavLink to="/start-creating" className="tab"><span>Run contests</span></NavLink>}
              </>
            )}
          </nav>

          {/* nothing until Firebase says whether anyone is signed in, so buttons don't flicker*/}
          {!loading && (
            <div className="account">
              {user ? (
                <>
                  <NavLink to="/my-entries" className="tab"><span>My entries</span></NavLink>
                  <span className="account-name">{profile ? profile.name : user.email}</span>
                  <button className="btn-quiet" onClick={handleLogOut}>Log out</button>
                </>
              ) : (
                <>
                  <Link to="/login" className="tab"><span>Log in</span></Link>
                  <Link to="/signup" className="button-link btn-primary">Sign up</Link>
                </>
          )}
        </div>
        )}
      </div>
      </div>
    </header>
  );

}

// "/": creators start on their contests; everyone else starts browsing. (The home page will replace this)
function StartPage() {
  const {loading, isCreator} = useAuth();
  if (loading) return <p className="notice">Loading...</p>;
  return <Navigate to={isCreator ? "/contests" : "/browse"} replace />;
}

// shows its page to anyone signed in (creator or fan). if signed out, log in first, then come back here
function RequireUser({children}) {
  const {user,loading} = useAuth();
  const location = useLocation();

  if (loading) return <p className="notice">Loading...</p>
  if (!user) {
    const here = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(here)}`} replace />;
  }
  return children;
}

// shows its page only to signed-in creators. if signed out, Log in first, then come back here.
// Signed in as a fan? explain that this page is for creators
function RequireCreator({children}) {
  const {user, loading, isCreator} = useAuth();
  const location = useLocation();

  if (loading) return <p className="notice">Loading...</p>;
  if (!user) {
    const here = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(here)}`} replace />;
  }
  if (!isCreator) {
    return (
      <>
        <div className="page-head">
          <h1>This page is for creators</h1>
          <p>
            Your account is set up for entering contests. Want to run your own? You'll keep everything you can do now.
            Or <Link to="/browse">browse open contests</Link>.
          </p>
        </div>
        <UpgradeButton />
      </>
    );
  }
  return children;
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
            <NavLink to="/browse" className="tab">
              <span>Browse</span>
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
  return <EpisodeView key={episodeId} episodeId={episodeId} startAt={startAt} rememberTime onBack={() => navigate("/episodes")} />
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
        Oops! There's nothing at this address. <Link to="/">Go to your episodes</Link>.
      </p>
    </div>
  );
}