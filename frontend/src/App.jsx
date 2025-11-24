import { Routes, Route, NavLink } from 'react-router-dom';
import { useState } from "react";
import "./App.css";
import Logs from './Logs.jsx';
import History from './History.jsx';

const domain = import.meta.env.VITE_BACKEND_DOMAIN || "localhost:8080";
const isLocal = domain.includes('localhost');
const protocol = isLocal ? 'http' : 'https';
const wsProtocol = isLocal ? 'ws' : 'wss';
const API_URL = `${protocol}://${domain}/api/orders/execute`;

const ORDER_BODY = {
  tokenIn: "7667oZyeKhXWkFXma7zP9rXhSspbHqVSAXfNVSiwZaJx",
  tokenOut: "52oX2aHhnhN8vYbtAhDLGjFKE1eEpNuu1Y3U2t4ALRQT",
  amount: 1000000,
  orderType: "market",
};

const formatJson = (str) => {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
};

const getStatusColor = (status) => {
  switch (status) {
    case "confirmed":
      return "#10b981";
    case "failed":
      return "#ef4444";
    case "submitted":
    case "building":
      return "#f59e0b";
    case "routing":
    case "pending":
    case "queued":
      return "#3b82f6";
    default:
      return "#6b7280";
  }
};

const formatStatusLabel = (status, fallback = "Waiting") => {
  if (!status) return fallback;
  return status
    .toString()
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const safeParseJson = (value) => {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const createEmptyOrder = () => ({
  orderId: null,
  status: null,
  logs: [],
  response: null,
  explorerLink: null,
  lastPayload: null,
});

function OrderExecutor() {
  const [orders, setOrders] = useState(() =>
    Array.from({ length: 5 }, createEmptyOrder)
  );
  const [isLoading, setIsLoading] = useState(false);

  const updateOrderAt = (index, updater) => {
    setOrders((prev) => {
      const clone = [...prev];
      if (!clone[index]) {
        return prev;
      }

      const snapshot = {
        ...clone[index],
        logs: [...clone[index].logs],
      };

      clone[index] = updater(snapshot) ?? snapshot;
      return clone;
    });
  };

  const executeOrders = async () => {
    setIsLoading(true);
    try {
      // Fire 5 parallel API requests
      const promises = [...Array(5)].map(() =>
        fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ORDER_BODY),
        }).then((r) => r.json())
      );

      const results = await Promise.all(promises);

      // Update UI with orderIds
      const updatedOrders = results.map((res) => ({
        ...createEmptyOrder(),
        orderId: res.orderId,
        status: res.status || "pending",
        logs: [`✓ Order created with ID: ${res.orderId}`],
        response: res,
        explorerLink: res.link ?? null,
      }));

      setOrders(updatedOrders);

      // Connect WebSockets for each orderId
      updatedOrders.forEach((order, idx) => {
        const ws = new WebSocket(
          `${wsProtocol}://${domain}/api/orders/execute?orderId=${order.orderId}`
        );

        ws.onopen = () => {
          updateOrderAt(idx, (current) => ({
            ...current,
            logs: [...current.logs, "→ WS Connected"],
          }));
        };

        ws.onmessage = (msg) => {
          const rawData = typeof msg.data === "string" ? msg.data : String(msg.data);
          const payload = safeParseJson(rawData);

          updateOrderAt(idx, (current) => {
            const nextStatus = payload?.status ?? rawData ?? current.status;
            const prettyPayload = payload
              ? formatJson(JSON.stringify(payload))
              : rawData;

            return {
              ...current,
              status: nextStatus || current.status,
              explorerLink: payload?.link ?? current.explorerLink,
              lastPayload: payload ?? current.lastPayload,
              logs: [...current.logs, `→ ${prettyPayload}`],
            };
          });

          // Close WebSocket after order is confirmed
          if (payload?.status === 'confirmed') {
            ws.close();
          }
        };

        ws.onerror = () => {
          updateOrderAt(idx, (current) => ({
            ...current,
            logs: [...current.logs, "✗ WebSocket Error"],
          }));
        };

        ws.onclose = () => {
          updateOrderAt(idx, (current) => ({
            ...current,
            logs: [...current.logs, "◆ WebSocket Closed"],
          }));
        };
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>Order Execution Engine</h1>
        <p>Execute 5 orders simultaneously with real-time WebSocket updates</p>
      </header>

      <button
        onClick={executeOrders}
        disabled={isLoading}
        className={`execute-btn ${isLoading ? "disabled" : ""}`}
      >
        {isLoading ? "Executing..." : "Execute 5 Orders"}
      </button>

      <div className="orders-grid">
        {orders.map((order, i) => {
          const badgeLabel = formatStatusLabel(
            order.status,
            order.orderId ? "Processing" : "Waiting"
          );
          const badgeColor = getStatusColor(order.status);
          const explorerLink = order.explorerLink || order.response?.link;
          const isConfirmed = (order.status || "").toLowerCase() === "confirmed";

          return (
            <div key={i} className="order-card">
              <div className="order-header">
                <h3>Order {i + 1}</h3>
                <span
                  className="order-badge"
                  style={
                    order.status
                      ? {
                          color: badgeColor,
                          borderColor: badgeColor,
                          backgroundColor: `${badgeColor}20`,
                        }
                      : undefined
                  }
                >
                  {badgeLabel}
                </span>
              </div>

              <div className="order-info">
                <div className="info-row">
                  <label>Order ID:</label>
                  <code>{order.orderId ? `${order.orderId.substring(0, 12)}...` : "—"}</code>
                </div>
                <div className="info-row">
                  <label>Status:</label>
                  <span
                    className="status-badge"
                    style={{ backgroundColor: badgeColor }}
                  >
                    {order.status ? formatStatusLabel(order.status) : "—"}
                  </span>
                </div>
                {isConfirmed && explorerLink && (
                  <div className="info-row link-row">
                    <label>Tx Link:</label>
                    <a
                      href={explorerLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="explorer-link"
                    >
                      View on Explorer ↗
                    </a>
                  </div>
                )}
              </div>

              <div className="response-section">
                <h4>API Response</h4>
                <pre className="response-body">
                  {order.response
                    ? formatJson(JSON.stringify(order.response))
                    : "No response yet"}
                </pre>
              </div>

              <div className="logs-section">
                <h4>Event Log</h4>
                <div className="logs-container">
                  {order.logs.length > 0 ? (
                    order.logs.map((log, idx) => (
                      <div key={idx} className="log-entry">
                        {log}
                      </div>
                    ))
                  ) : (
                    <div className="log-entry empty">No events yet</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div>
      <nav className="nav-bar">
        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          Orders
        </NavLink>
        <NavLink to="/logs" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          Logs
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          History
        </NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<OrderExecutor />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/history" element={<History />} />
      </Routes>
    </div>
  );
}