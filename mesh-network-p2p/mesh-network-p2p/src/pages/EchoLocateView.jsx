import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { EchoLocatePanel } from "../components/EchoLocatePanel.jsx";
import { uid } from "../services/urgencyClassifier.js";
import { JoinModal } from "../components/JoinModal.jsx";

export function EchoLocateView() {
  const [socket] = useState(() => io(import.meta.env.VITE_BACKEND_URL || undefined));
  const [name, setName] = useState("");
  const [selfId] = useState(() => uid());
  const [joined, setJoined] = useState(false);

  function handleJoin() {
    if (!name.trim()) return;
    setJoined(true);
  }

  if (!joined) {
    return <JoinModal name={name} setName={setName} onJoin={handleJoin} />;
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <EchoLocatePanel socket={socket} selfId={selfId} selfName={name} />
    </div>
  );
}
