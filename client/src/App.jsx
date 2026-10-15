import { useEffect, useState } from "react";
import EpisodeUpload from "./EpisodeUpload";
import EpisodeList from "./EpisodeList";
import EpisodeView from "./EpisodeView";
import { API_URL } from "./api";
import TranscriptSearch from "./TranscriptSearch";

export default function App() {
  const [status, setStatus] = useState("Checking server...");
  const [openEpisode, setOpenEpisode] = useState(null); // { id , startAt }

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => res.json())
      .then((data) => setStatus(data.message))
      .catch(() => setStatus("Can't reach the server. Is it running?"));
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Highlighter</h1>
      <p>{status}</p>
 
      {openEpisode ? (
        <EpisodeView
          episodeId={openEpisode.id}
          startAt={openEpisode.startAt}
          onBack={() => setOpenEpisode(null)}
        />
      ) : (
        <>
          <EpisodeUpload />
          <TranscriptSearch onResult={(id, seconds) => setOpenEpisode({ id, startAt: seconds })} />
          <EpisodeList onOpen={(id) => setOpenEpisode({ id, startAt: 0 })} />
        </>
      )}
    </main>
  );

}
