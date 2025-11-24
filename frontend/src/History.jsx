import { useCallback, useEffect, useMemo, useState } from "react";

const domain = import.meta.env.VITE_BACKEND_DOMAIN || "localhost:8080";
const isLocal = domain.includes('localhost');
const protocol = isLocal ? 'http' : 'https';
const HISTORY_URL = `${protocol}://${domain}/api/orders/history`;

const statusPalette = {
  confirmed: '#10b981',
  failed: '#ef4444',
  submitted: '#f59e0b',
  building: '#f59e0b',
  routing: '#3b82f6',
  pending: '#3b82f6',
  queued: '#3b82f6'
};

const formatStatusLabel = (status) =>
  (status || '')
    .toString()
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatTimestamp = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const shorten = (value, length = 6) => {
  if (!value) return '--';
  if (value.length <= length * 2) return value;
  return `${value.slice(0, length)}...${value.slice(-length)}`;
};

const amountFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 6
});

export default function History() {
  const [orders, setOrders] = useState([]);
  const [limit, setLimit] = useState(50);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(async ({ cursor: cursorParam, append = false } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(HISTORY_URL);
      url.searchParams.set('limit', String(limit));
      if (cursorParam) {
        url.searchParams.set('cursor', cursorParam);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }
      const payload = await response.json();
      const rows = payload?.data ?? [];

      setOrders((prev) => (append ? [...prev, ...rows] : rows));
      setNextCursor(payload?.pagination?.nextCursor ?? null);
    } catch (err) {
      setError(err.message ?? 'Failed to fetch history');
      if (!append) {
        setOrders([]);
      }
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleLimitChange = (event) => {
    setLimit(Number(event.target.value));
  };

  const handleRefresh = () => {
    fetchHistory();
  };

  const handleLoadMore = () => {
    if (nextCursor) {
      fetchHistory({ cursor: nextCursor, append: true });
    }
  };

  const computedRows = useMemo(() => orders.map((order) => ({
    ...order,
    latestStatus: formatStatusLabel(order.status),
    statusColor: statusPalette[order.status] || '#6b7280',
    statusTrail: (order.statusHistory || [])
        .map((entry) => formatStatusLabel(entry.status))
        .join(' -> ')
  })), [orders]);

  return (
    <div className="container">
      <header className="header">
        <h1>Order History</h1>
        <p>Persisted execution records sourced directly from PostgreSQL</p>
      </header>

      <div className="history-controls">
        <div className="history-controls-left">
          <label htmlFor="history-limit">Rows per fetch:</label>
          <select id="history-limit" value={limit} onChange={handleLimitChange} disabled={loading}>
            {[25, 50, 100, 150, 200].map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="history-controls-right">
          <button className={`refresh-btn ${loading ? 'disabled' : ''}`} onClick={handleRefresh} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>{error}</p>
        </div>
      )}

      <div className="history-table-wrapper">
        <table className="history-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Pair</th>
              <th>Amount</th>
              <th>Status</th>
              <th>DEX</th>
              <th>Tx Hash</th>
              <th>Updated</th>
              <th>Timeline</th>
            </tr>
          </thead>
          <tbody>
            {computedRows.length === 0 && !loading && (
              <tr>
                <td colSpan="8" className="history-empty">No orders found</td>
              </tr>
            )}
            {computedRows.map((order) => (
              <tr key={order.orderId}>
                <td>
                  <div className="history-order-cell">
                    <code>{shorten(order.orderId)}</code>
                    <small>{formatTimestamp(order.receivedAt)}</small>
                  </div>
                </td>
                <td>
                  <div className="history-pair">
                    <span>{shorten(order.tokenIn, 4)}</span>
                    <span className="history-arrow">{'->'}</span>
                    <span>{shorten(order.tokenOut, 4)}</span>
                  </div>
                </td>
                <td>{amountFormatter.format(Number(order.amount) || 0)}</td>
                <td>
                  <span
                    className="history-status"
                    style={{ backgroundColor: order.statusColor }}
                  >
                    {order.latestStatus}
                  </span>
                  {order.lastError && (
                    <div className="history-error">{order.lastError}</div>
                  )}
                </td>
                <td>{order.dex ? order.dex.toUpperCase() : '--'}</td>
                <td>
                  {order.txHash ? (
                    <a
                      href={order.explorerLink || `https://explorer.solana.com/tx/${order.txHash}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="history-link"
                    >
                      {shorten(order.txHash)}
                    </a>
                  ) : '--'}
                </td>
                <td>{formatTimestamp(order.updatedAt)}</td>
                <td className="history-timeline">{order.statusTrail || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div className="history-load-more">
          <button className={`load-more-btn ${loading ? 'disabled' : ''}`} onClick={handleLoadMore} disabled={loading}>
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
