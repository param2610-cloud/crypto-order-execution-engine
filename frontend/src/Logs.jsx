import { useState, useEffect } from "react";

const domain = import.meta.env.VITE_BACKEND_DOMAIN || "localhost:8080";
const isLocal = domain.includes('localhost');
const protocol = isLocal ? 'http' : 'https';
const LOGS_URL = `${protocol}://${domain}/logs`;

export default function Logs() {
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(LOGS_URL);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const text = await response.text();
      setLogs(text);
    } catch (err) {
      setError(err.message);
      setLogs("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="container">
      <header className="header">
        <h1>Application Logs</h1>
        <p>View DEX routing decisions and application logs</p>
      </header>

      <div className="logs-controls">
        <button
          onClick={fetchLogs}
          disabled={loading}
          className={`refresh-btn ${loading ? "disabled" : ""}`}
        >
          {loading ? "Refreshing..." : "Refresh Logs"}
        </button>
      </div>

      {error && (
        <div className="error-message">
          <p>Error fetching logs: {error}</p>
        </div>
      )}

      <div className="logs-display">
        <h3>Recent Logs</h3>
        <pre className="logs-content">
          {logs || (loading ? "Loading logs..." : "No logs available")}
        </pre>
      </div>
    </div>
  );
}