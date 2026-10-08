import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { EvoSensePanel } from "../components/EvoSensePanel.jsx";
import { MeshNode } from "../services/meshNode.js";
import { uid } from "../services/urgencyClassifier.js";
import { JoinModal } from "../components/JoinModal.jsx";

export function EvoSenseView() {
  const [socket] = useState(() => io(import.meta.env.VITE_BACKEND_URL || undefined));
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("mesh_node_name") || sessionStorage.getItem("mesh_node_name") || "";
    } catch (e) {
      return "";
    }
  });
  const [selfId] = useState(() => {
    try {
      let saved = localStorage.getItem("mesh_node_id") || sessionStorage.getItem("mesh_node_id");
      if (!saved) {
        saved = uid();
        localStorage.setItem("mesh_node_id", saved);
        sessionStorage.setItem("mesh_node_id", saved);
      }
      return saved;
    } catch (e) {
      return uid();
    }
  });
  const [joined, setJoined] = useState(() => {
    try {
      return Boolean(sessionStorage.getItem("mesh_joined") === "true" && (localStorage.getItem("mesh_node_name") || sessionStorage.getItem("mesh_node_name")));
    } catch (e) {
      return false;
    }
  });
  const meshRef = useRef(null);

  // Automatically connect to ConnectX P2P Mesh Network in background when joined
  useEffect(() => {
    if (!joined || !name.trim() || !socket || !selfId) return;

    const mesh = new MeshNode(selfId, name.trim(), socket, {
      onTopology: () => {},
      onLog: () => {},
      onHop: () => {},
      onDelivered: () => {},
      onPeerState: () => {},
      onCloudStatus: () => {},
      onModel: () => {},
      onLocationStatus: () => {},
      onCryptoStatus: () => {},
      onIdentities: () => {},
      onMediaProgress: () => {},
      onMediaDelivered: () => {},
    });

    meshRef.current = mesh;
    mesh.register();

    return () => {
      mesh.destroy();
      meshRef.current = null;
    };
  }, [joined, name, socket, selfId]);

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
    return <JoinModal name={name} setName={setName} onJoin={handleJoin} defaultMode="/echolocate" />;
  }

  return (
    <div className="evosense-view-wrapper">
      <EvoSensePanel socket={socket} selfId={selfId} selfName={name} />
    </div>
  );
}

export { EvoSenseView as EchoLocateView };

