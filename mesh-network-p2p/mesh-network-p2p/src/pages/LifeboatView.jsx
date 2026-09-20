import React, { useState } from "react";
import { LifeboatPanel } from "../components/LifeboatPanel.jsx";
import { JoinModal } from "../components/JoinModal.jsx";

export function LifeboatView() {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("mesh_node_name") || sessionStorage.getItem("mesh_node_name") || "";
    } catch (e) {
      return "";
    }
  });
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
    return <JoinModal name={name} setName={setName} onJoin={handleJoin} defaultMode="/lifeboat" />;
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <LifeboatPanel />
    </div>
  );
}

