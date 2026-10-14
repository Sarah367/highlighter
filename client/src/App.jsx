import { useEffect, useState } from "react";
import EpisodeUpload from "./EpisodeUpload";
import EpisodeList from "./EpisodeList";
import EpisodeView from "./EpisodeView";
import { API_URL } from "./api";

export default function App() {
  const [status, setStatus] = useState("Checking server...");
  const [openEpisodeId, setOpenEpisodeId] = useState(null);

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

      {openEpisodeId ? (
        <EpisodeView episodeId={openEpisodeId} onBack={() => setOpenEpisodeId(null)}/>
      ) : (
        <>
          <EpisodeUpload />
          <EpisodeList onOpen={setOpenEpisodeId}/>
        </>
      )}
    </main>
  );
}
