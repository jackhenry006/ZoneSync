import React, { useState } from "react";
import { PulseSeekerPanel } from "../components/PulseSeekerPanel.jsx";
import { JoinModal } from "../components/JoinModal.jsx";
import { uid } from "../services/urgencyClassifier.js";

export function PulseSeekerView() {
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
      <PulseSeekerPanel />
    </div>
  );
}
