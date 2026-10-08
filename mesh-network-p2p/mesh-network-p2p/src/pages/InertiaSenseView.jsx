import React, { useState } from "react";
import { PulseSeekerPanel } from "../components/PulseSeekerPanel.jsx";
import { JoinModal } from "../components/JoinModal.jsx";
import { uid } from "../services/urgencyClassifier.js";

export function PulseSeekerView() {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("mesh_node_name") || sessionStorage.getItem("mesh_node_name") || "";
    } catch (e) {
      return "";
    }
  });
  const [selfId] = useState(() => uid());
  const [joined, setJoined] = useState(() => {
    try {
      return Boolean(sessionStorage.getItem("mesh_joined") === "true" && (localStorage.getItem("mesh_node_name") || sessionStorage.getItem("mesh_node_name")));
    } catch (e) {
      return false;
    }
  });

  function handleJoin(customName) {
    const finalName = (customName || name || "").trim();
    if (!finalName) return;
    setName(finalName);
    try {
      localStorage.setItem("mesh_node_name", finalName);
      sessionStorage.setItem("mesh_node_name", finalName);
      sessionStorage.setItem("mesh_joined", "true");
    } catch (e) {}
    setJoined(true);
  }

  if (!joined) {
    return <JoinModal name={name} setName={setName} onJoin={handleJoin} defaultMode="/pulseseeker" />;
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <PulseSeekerPanel />
    </div>
  );
}
