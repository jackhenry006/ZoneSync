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
      ctx.strokeStyle = "rgba(42, 48, 52, 0.4)";
      ctx.lineWidth = 0.5;
      for (let x = spacing; x < w; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = spacing; y < h; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.fillStyle = "rgba(127, 137, 145, 0.2)";
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
        const rgb = congestion === "congested" ? "255, 77, 77" : congestion === "watch" ? "255, 176, 0" : "184, 192, 199";

        ctx.strokeStyle = `rgba(${rgb}, ${0.08 + quality * 0.12 + (congestion !== "normal" ? 0.08 : 0)})`;
        ctx.lineWidth = 4 + quality * 3 + (congestion === "congested" ? 2 : 0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

        ctx.strokeStyle = `rgba(${rgb}, ${(0.3 + quality * 0.45) * (0.85 + pulse * 0.15)})`;
        ctx.lineWidth = 1 + quality * 1.2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

        if (l.weight < 500) {
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          ctx.fillStyle = `rgba(${rgb}, ${0.6 + quality * 0.3})`;
          ctx.font = "500 11px 'IBM Plex Mono', monospace";
          ctx.textAlign = "center";
          const label = congestion === "normal" ? `${Math.round(l.weight)}ms` : `${Math.round(l.weight)}ms ⚠ ${congestion}`;
          ctx.fillText(label, mx, my - 6);
        }
      });

      if (activeHop) {
        const a = posRef.current[activeHop.from], b = posRef.current[activeHop.to];
        if (a && b) {
          const color = activeHop.urgency === "critical" ? "#FF4D4D" : "#FFB000";
          const glowColor = activeHop.urgency === "critical" ? "rgba(255, 77, 77," : "rgba(255, 176, 0,";
          const prog = activeHop.progress;
          const px = a.x + (b.x - a.x) * prog, py = a.y + (b.y - a.y) * prog;

          ctx.strokeStyle = glowColor + "0.2)";
          ctx.lineWidth = 8;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

          ctx.strokeStyle = color;
          ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

          ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.fillStyle = glowColor + "0.3)"; ctx.fill();
          ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }

      particlesRef.current = particlesRef.current.filter(p => {
        p.progress += 0.02;
        p.life -= 0.015;
        if (p.life <= 0 || p.progress > 1.2) return false;
        const px = p.x + (p.tx - p.x) * Math.max(0, p.progress);
        const py = p.y + (p.ty - p.y) * Math.max(0, p.progress);
        const color = p.urgency === "critical" ? "255, 77, 77" : "255, 176, 0";
        ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${p.life * 0.7})`;
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
          ctx.fillStyle = "#1B1F22";
          ctx.strokeStyle = "#2A3034";
          ctx.lineWidth = 1.5;
          ctx.fill(); ctx.stroke();
        } else {
          const pulse = 0.5 + Math.sin(t * 2 + p.x * 0.01) * 0.5;

          ctx.beginPath(); ctx.arc(p.x, p.y, nodeRadius + 4 + pulse * 2, 0, Math.PI * 2);
          ctx.fillStyle = isSelf ? "rgba(255, 176, 0, 0.06)" : "rgba(34, 197, 94, 0.03)";
          ctx.fill();

          ctx.beginPath(); ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
          if (isSelf) {
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, nodeRadius);
            grad.addColorStop(0, "#FFC033");
            grad.addColorStop(1, "#FFB000");
            ctx.fillStyle = grad;
            ctx.strokeStyle = "#FF8A00";
            ctx.lineWidth = 2;
          } else {
            ctx.fillStyle = "#1B1F22";
            ctx.strokeStyle = `rgba(34, 197, 94, ${0.45 + pulse * 0.25})`;
            ctx.lineWidth = 1.6;
          }
          ctx.fill(); ctx.stroke();

          if (!isSelf) {
            ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(34, 197, 94, ${0.65 + pulse * 0.3})`;
            ctx.fill();
          }
        }

        ctx.fillStyle = n.alive ? "#F5F7F8" : "#7F8991";
        ctx.font = `${isSelf ? 700 : 600} ${isSelf ? 14 : 13}px 'Inter', sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(n.name, p.x, p.y + nodeRadius + 18);

        if (isSelf && n.alive) {
          ctx.fillStyle = "#FFB000";
          ctx.font = "700 10.5px 'IBM Plex Mono', monospace";
          ctx.fillText("YOU (ACTIVE)", p.x, p.y + nodeRadius + 32);
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
