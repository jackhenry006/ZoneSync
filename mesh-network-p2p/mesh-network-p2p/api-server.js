/**
 * @file api-server.js
 * @description Express API Server for the Lifeboat Routing System. Integrates LethalityCalculator
 * and LifeboatPriorityQueue to handle heartbeats, queue status, critical alerts, and emergency metrics.
 * 
 * @module ApiServer
 */

const express = require("express");
const cors = require("cors");
const http = require("http");
const { LethalityCalculator } = require("./lethality-calculator");
const { LifeboatPriorityQueue } = require("./priority-queue");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Core System Services
const calculator = new LethalityCalculator();
const queue = new LifeboatPriorityQueue({ maxSize: 10000 });

// Historical trend tracker for stats endpoint
const alertLog = [];
const MAX_ALERT_LOG = 200;

/**
 * POST /api/heartbeat
 * Accepts device heartbeat & sensor data, computes lethality score, and enqueues message.
 */
app.post("/api/heartbeat", (req, res) => {
  try {
    const data = req.body || {};
    if (!data.deviceId) {
      return res.status(400).json({ error: "Missing required parameter: deviceId" });
    }

    // 1. Calculate Lethality Score & Risk Factors
    const result = calculator.calculate(data);

    // 2. Add Message to Priority Queue
    const queueResult = queue.enqueue({
      deviceId: data.deviceId,
      sensors: data.sensors,
      location: data.location,
      message: data.message || { text: data.text || "" },
      factors: result.factors
    }, result.score);

    // 3. Return Combined Response
    res.json({
      ...result,
      deviceId: data.deviceId,
      queuePosition: queueResult.position,
      estimatedDelivery: queueResult.estimatedTime,
      queueId: queueResult.queueId,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error("[API Error /api/heartbeat]", err);
    res.status(500).json({ error: "Internal processing error", message: err.message });
  }
});

/**
 * GET /api/priority/queue
 * Returns current queue status, tier sizes, and preview of upcoming critical messages.
 */
app.get("/api/priority/queue", (req, res) => {
  try {
    const stats = queue.getStats();
    // Peek at next 5 critical messages without removing them from queue
    const nextCritical = queue.queues.critical.slice(0, 5);

    res.json({
      success: true,
      stats,
      nextCritical: nextCritical.map(entry => ({
        id: entry.id,
        deviceId: entry.meta.deviceId,
        score: entry.score,
        priority: entry.priority,
        messageText: entry.message.text,
        location: entry.message.location,
        timestamp: entry.timestamp
      }))
    });
  } catch (err) {
    console.error("[API Error /api/priority/queue]", err);
    res.status(500).json({ error: "Failed to fetch queue status", message: err.message });
  }
});

/**
 * GET /api/priority/critical
 * Returns all active critical emergency messages with GPS coordinates and timestamps.
 */
app.get("/api/priority/critical", (req, res) => {
  try {
    const criticalEntries = queue.queues.critical.map(entry => ({
      id: entry.id,
      deviceId: entry.meta.deviceId,
      score: entry.score,
      priority: entry.priority,
      message: entry.message,
      location: entry.meta.location,
      factors: entry.meta.factors,
      timestamp: entry.timestamp
    }));

    res.json({
      success: true,
      count: criticalEntries.length,
      criticalMessages: criticalEntries
    });
  } catch (err) {
    console.error("[API Error /api/priority/critical]", err);
    res.status(500).json({ error: "Failed to fetch critical messages", message: err.message });
  }
});

/**
 * POST /api/alert/send
 * Triggers emergency dispatch alert for critical messages and logs dispatch event.
 */
app.post("/api/alert/send", (req, res) => {
  try {
    const { count } = req.body || {};
    const batchSize = typeof count === "number" ? count : 10;

    // Dequeue next highest-priority critical messages
    const dequeued = queue.dequeue(batchSize);

    // Filter dispatched critical entries
    const dispatched = dequeued.map(entry => {
      const alertItem = {
        alertId: `alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        id: entry.id,
        deviceId: entry.meta.deviceId,
        score: entry.score,
        priority: entry.priority,
        location: entry.meta.location,
        messageText: entry.message.text,
        dispatchedAt: Date.now()
      };

      alertLog.unshift(alertItem);
      return alertItem;
    });

    if (alertLog.length > MAX_ALERT_LOG) alertLog.length = MAX_ALERT_LOG;

    res.json({
      success: true,
      dispatchedCount: dispatched.length,
      dispatchedAlerts: dispatched
    });
  } catch (err) {
    console.error("[API Error /api/alert/send]", err);
    res.status(500).json({ error: "Failed to send emergency alerts", message: err.message });
  }
});

/**
 * GET /api/priority/stats
 * Returns detailed queue metrics, throughput, historical dispatch log, and trends.
 */
app.get("/api/priority/stats", (req, res) => {
  try {
    const stats = queue.getStats();

    res.json({
      success: true,
      stats,
      recentAlertsCount: alertLog.length,
      recentAlerts: alertLog.slice(0, 20),
      serverTimestamp: Date.now()
    });
  } catch (err) {
    console.error("[API Error /api/priority/stats]", err);
    res.status(500).json({ error: "Failed to fetch queue statistics", message: err.message });
  }
});

const server = http.createServer(app);
const PORT = process.env.PORT || 4004;

if (require.main === module) {
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[Lifeboat API] Port ${PORT} is already in use by another running instance.`);
      console.warn(`[Lifeboat API] The Lifeboat Priority Queue server is already active and handling requests!`);
      process.exit(0);
    } else {
      console.error("[Lifeboat API Error]", err);
      process.exit(1);
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚤 Lifeboat Priority Queue Server listening on http://0.0.0.0:${PORT}`);
    console.log(`Endpoints: POST /api/heartbeat | GET /api/priority/queue | GET /api/priority/critical | GET /api/priority/stats`);
  });
}

module.exports = { app, server, calculator, queue };
