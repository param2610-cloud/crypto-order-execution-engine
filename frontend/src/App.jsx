import { useState } from "react";

const API_URL =
  "http://localhost:8080/api/orders/execute";

const ORDER_BODY = {
  tokenIn: "7667oZyeKhXWkFXma7zP9rXhSspbHqVSAXfNVSiwZaJx",
  tokenOut: "52oX2aHhnhN8vYbtAhDLGjFKE1eEpNuu1Y3U2t4ALRQT",
  amount: 1000000,
  orderType: "market",
};

export default function OrderExecutor() {
  const [orders, setOrders] = useState(
    Array(5).fill({ orderId: null, status: "idle", logs: [] })
  );

  const executeOrders = async () => {
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
      orderId: res.orderId,
      status: res.status || "pending",
      logs: [`Order created with ID: ${res.orderId}`],
    }));

    setOrders(updatedOrders);

    // Connect WebSockets for each orderId
    updatedOrders.forEach((order, idx) => {
      const ws = new WebSocket(
        `ws://localhost:8080/api/orders/execute?orderId=${order.orderId}`
      );

      ws.onopen = () => {
        setOrders((prev) => {
          const copy = [...prev];
          copy[idx].logs.push("WS Connected");
          return copy;
        });
      };

      ws.onmessage = (msg) => {
        const data = msg.data;

        setOrders((prev) => {
          const copy = [...prev];
          copy[idx].status = data;
          copy[idx].logs.push(data);
          return copy;
        });
      };

      ws.onerror = (err) => {
        setOrders((prev) => {
          const copy = [...prev];
          copy[idx].logs.push("WebSocket Error: " + err.message);
          return copy;
        });
      };

      ws.onclose = () => {
        setOrders((prev) => {
          const copy = [...prev];
          copy[idx].logs.push("WebSocket Closed");
          return copy;
        });
      };
    });
  };

  return (
    <div style={{ padding: "20px" }}>
      <button
        onClick={executeOrders}
        style={{
          padding: "12px 20px",
          fontSize: "18px",
          fontWeight: "600",
          marginBottom: "20px",
        }}
      >
        Execute 5 Orders
      </button>

      <div style={{ display: "flex", gap: "15px" }}>
        {orders.map((order, i) => (
          <div
            key={i}
            style={{
              width: "20%",
              border: "1px solid #ccc",
              borderRadius: "8px",
              padding: "10px",
              background: "#f7f7f7",
            }}
          >
            <h3>Order {i + 1}</h3>

            <p>
              <strong>ID:</strong>{" "}
              {order.orderId ? order.orderId : "Waiting..."}
            </p>
            <p>
              <strong>Status:</strong> {order.status}
            </p>

            <div
              style={{
                marginTop: "10px",
                padding: "8px",
                background: "#fff",
                height: "180px",
                overflowY: "scroll",
                borderRadius: "5px",
                fontSize: "12px",
                border: "1px solid #ddd",
              }}
            >
              {order.logs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}