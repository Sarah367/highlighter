import {useEffect, useState} from "react";

export default function App() {
  const [status, setStatus] = useState("Checking server...");

  useEffect(() => {
    fetch("http://localhost:3001/api/health")
      .then((res) => res.json())
      .then((data) => setStatus(data.message))
      .catch(() => setStatus("Can't reach the server. Is it running?"));
  }, []);

  return (
    <main>
      <h1>Highlighter</h1>
      <p>{status}</p>
    </main>
  )
}