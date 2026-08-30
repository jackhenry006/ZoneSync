import React, { useRef, useEffect, useCallback } from 'react';

export function MeshCanvas({ nodes, links, activeHop, selfId, onNodeClick, linkMode }) {
  const canvasRef = useRef(null);
  const posRef = useRef({});
  const particlesRef = useRef([]);

  const layout = useCallback((width, height) => {
    const cx = width / 2, cy = height / 2;
    const r = Math.min(width, height) * 0.32;
    nodes.forEach((n, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      posRef.current[n.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
  }, [nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf, t = 0;

    function resize() {
      if (!canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      layout(rect.width, rect.height);
    }
    resize();
    window.addEventListener("resize", resize);

    if (activeHop) {
      const a = posRef.current[activeHop.from], b = posRef.current[activeHop.to];
      if (a && b) {
        for (let i = 0; i < 6; i++) {
          particlesRef.current.push({
            x: a.x, y: a.y,
            tx: b.x, ty: b.y,
            progress: -i * 0.08,
            urgency: activeHop.urgency,
            life: 1,
          });
        }
      }
    }

    function drawGrid(w, h) {
      const spacing = 40;
      ctx.strokeStyle = "rgba(30, 44, 60, 0.15)";
      ctx.lineWidth = 0.5;
      for (let x = spacing; x < w; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = spacing; y < h; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.fillStyle = "rgba(50, 70, 90, 0.2)";
      for (let x = spacing; x < w; x += spacing) {
        for (let y = spacing; y < h; y += spacing) {
          ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    function draw() {
      t += 0.015;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      ctx.clearRect(0, 0, w, h);

      drawGrid(w, h);

      links.forEach(l => {
        const a = posRef.current[l.a], b = posRef.current[l.b];
        if (!a || !b) return;
        const quality = Math.max(0, 1 - l.weight / 300);
        const pulse = 0.5 + Math.sin(t * 1.5 + l.weight * 0.01) * 0.2;
        const congestion = l.congestion || "normal";
        const rgb = congestion === "congested" ? "255, 75, 92" : congestion === "watch" ? "240, 166, 60" : "51, 214, 166";

        ctx.strokeStyle = `rgba(${rgb}, ${0.04 + quality * 0.08 + (congestion !== "normal" ? 0.05 : 0)})`;
        ctx.lineWidth = 6 + quality * 4 + (congestion === "congested" ? 2 : 0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

        ctx.strokeStyle = `rgba(${rgb}, ${(0.2 + quality * 0.4) * (0.8 + pulse * 0.2)})`;
        ctx.lineWidth = 1 + quality * 1.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

        if (l.weight < 500) {
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          ctx.fillStyle = `rgba(${rgb}, ${0.5 + quality * 0.3})`;
          ctx.font = "500 9px 'IBM Plex Mono', monospace";
          ctx.textAlign = "center";
          const label = congestion === "normal" ? `${Math.round(l.weight)}ms` : `${Math.round(l.weight)}ms ⚠ ${congestion}`;
          ctx.fillText(label, mx, my - 6);
        }
      });

      if (activeHop) {
        const a = posRef.current[activeHop.from], b = posRef.current[activeHop.to];
        if (a && b) {
          const color = activeHop.urgency === "critical" ? "#FF4B5C" : activeHop.urgency === "elevated" ? "#F0A63C" : "#33D6A6";
          const glowColor = activeHop.urgency === "critical" ? "rgba(255,75,92," : activeHop.urgency === "elevated" ? "rgba(240,166,60," : "rgba(51,214,166,";
          const prog = activeHop.progress;
          const px = a.x + (b.x - a.x) * prog, py = a.y + (b.y - a.y) * prog;

          ctx.strokeStyle = glowColor + "0.15)";
          ctx.lineWidth = 10;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.shadowColor = color;
          ctx.shadowBlur = 16;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.shadowBlur = 0;

          ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
          ctx.fillStyle = glowColor + "0.2)"; ctx.fill();
          ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 20;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      particlesRef.current = particlesRef.current.filter(p => {
        p.progress += 0.02;
        p.life -= 0.015;
        if (p.life <= 0 || p.progress > 1.2) return false;
        const px = p.x + (p.tx - p.x) * Math.max(0, p.progress);
        const py = p.y + (p.ty - p.y) * Math.max(0, p.progress);
        const color = p.urgency === "critical" ? "255,75,92" : p.urgency === "elevated" ? "240,166,60" : "51,214,166";
        ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${p.life * 0.6})`;
        ctx.fill();
        return true;
      });

      nodes.forEach(n => {
        const p = posRef.current[n.id];
        if (!p) return;
        const isSelf = n.id === selfId;
        const nodeRadius = isSelf ? 18 : 14;

        if (!n.alive) {
          ctx.beginPath(); ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
          ctx.fillStyle = "#111820";
          ctx.strokeStyle = "#2A3542";
          ctx.lineWidth = 1.5;
          ctx.fill(); ctx.stroke();
        } else {
          const pulse = 0.5 + Math.sin(t * 2 + p.x * 0.01) * 0.5;

          ctx.beginPath(); ctx.arc(p.x, p.y, nodeRadius + 6 + pulse * 3, 0, Math.PI * 2);
          ctx.fillStyle = isSelf ? "rgba(51, 214, 166, 0.04)" : "rgba(51, 214, 166, 0.02)";
          ctx.fill();

          ctx.beginPath(); ctx.arc(p.x, p.y, nodeRadius + 3, 0, Math.PI * 2);
          ctx.fillStyle = isSelf ? "rgba(51, 214, 166, 0.08)" : "rgba(51, 214, 166, 0.03)";
          ctx.fill();

          ctx.beginPath(); ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
          if (isSelf) {
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, nodeRadius);
            grad.addColorStop(0, "#3AEDB8");
            grad.addColorStop(1, "#28B890");
            ctx.fillStyle = grad;
          } else {
            ctx.fillStyle = "#111D28";
          }
          ctx.strokeStyle = isSelf ? "#33D6A6" : `rgba(51, 214, 166, ${0.35 + pulse * 0.25})`;
          ctx.lineWidth = isSelf ? 2.5 : 1.5;
          ctx.shadowColor = "#33D6A6";
          ctx.shadowBlur = isSelf ? 14 : 4 + pulse * 4;
          ctx.fill(); ctx.stroke();
          ctx.shadowBlur = 0;

          if (!isSelf) {
            ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(51, 214, 166, ${0.5 + pulse * 0.3})`;
            ctx.fill();
          }
        }

        ctx.fillStyle = n.alive ? "#E7EDF4" : "#3A4A5A";
        ctx.font = `${isSelf ? 700 : 600} ${isSelf ? 12 : 11}px 'IBM Plex Mono', monospace`;
        ctx.textAlign = "center";
        ctx.fillText(n.name, p.x, p.y + nodeRadius + 18);

        if (isSelf && n.alive) {
          ctx.fillStyle = "rgba(51, 214, 166, 0.5)";
          ctx.font = "700 8px 'IBM Plex Mono', monospace";
          ctx.fillText("YOU", p.x, p.y + nodeRadius + 30);
        }
      });

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [nodes, links, activeHop, selfId, layout]);

  function handleClick(e) {
    if (!linkMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    for (const n of nodes) {
      const p = posRef.current[n.id];
      if (!p) continue;
      if (Math.hypot(p.x - x, p.y - y) < 20) { onNodeClick(n.id); return; }
    }
  }

  return <canvas ref={canvasRef} onClick={handleClick} style={{ cursor: linkMode ? "crosshair" : "default" }} />;
}
