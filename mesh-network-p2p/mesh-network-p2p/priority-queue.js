/**
 * @file priority-queue.js
 * @description Manages 4-tier priority queues (critical, elevated, normal, low) for emergency messages,
 * supporting high-concurrency throughput, automatic size capping (10,000 max), TTL expiration cleanup,
 * and detailed metrics tracking.
 * 
 * @module LifeboatPriorityQueue
 */

/**
 * @typedef {Object} QueueMeta
 * @property {string} [deviceId] - Originating device ID
 * @property {Object} [sensors] - Sensor telemetry payload
 * @property {*} [extra] - Additional metadata
 */

/**
 * @typedef {Object} PriorityMessageEntry
 * @property {string} id - Unique message entry ID
 * @property {Object} message - Original message payload & location
 * @property {number} score - Lethality score (0-100)
 * @property {("critical"|"elevated"|"normal"|"low")} priority - Priority tier
 * @property {number} timestamp - Ingestion timestamp in ms
 * @property {number} ttl - Time-to-live in ms (default 1 hour)
 * @property {QueueMeta} meta - Origin device metadata
 */

/**
 * @typedef {Object} EnqueueResult
 * @property {string} queueId - Assigned message ID
 * @property {number} position - Position in priority order
 * @property {string} estimatedTime - Estimated rescue delivery window
 * @property {number} totalQueued - Total items in queue system
 */

/**
 * @typedef {Object} QueueStats
 * @property {number} critical - Size of critical queue
 * @property {number} elevated - Size of elevated queue
 * @property {number} normal - Size of normal queue
 * @property {number} low - Size of low queue
 * @property {number} totalQueued - Sum of items across all 4 tiers
 * @property {number} totalProcessed - Total messages dequeued
 * @property {number} totalDropped - Total messages evicted due to overflow/limits
 * @property {number} maxSize - Maximum total queue capacity limit
 * @property {number} ttl - Message time-to-live setting in ms
 */

class LifeboatPriorityQueue {
  /**
   * Initializes LifeboatPriorityQueue instance.
   * 
   * @param {Object} [options] - Configuration options
   * @param {number} [options.maxSize=10000] - Max total allowed queue capacity
   * @param {number} [options.maxLowSize=1000] - Max size for low priority queue
   * @param {number} [options.ttl=3600000] - Time-to-live in ms (default 1 hour)
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 10000;
    this.maxLowSize = options.maxLowSize || 1000;
    this.ttl = options.ttl || 3600000; // 1 hour

    /** @type {{ critical: PriorityMessageEntry[], elevated: PriorityMessageEntry[], normal: PriorityMessageEntry[], low: PriorityMessageEntry[] }} */
    this.queues = {
      critical: [],  // Score >= 80 - Immediate dispatch
      elevated: [],  // Score 50-79 - 5 min response window
      normal: [],    // Score 20-49 - 30 min window
      low: []        // Score 0-19 - Stored for analysis only
    };

    this.totalProcessed = 0;
    this.totalDropped = 0;
    this.totalEnqueued = 0;

    // Automatic periodic cleanup interval (every 60 seconds)
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Enqueues a message into the appropriate priority queue tier.
   * 
   * @param {Object} messageData - Payload containing deviceId, message text, location, etc.
   * @param {number} score - Lethality score (0-100)
   * @returns {EnqueueResult} Queue placement result details
   */
  enqueue(messageData, score) {
    if (!messageData || typeof messageData !== "object") {
      throw new Error("Invalid message: messageData must be an object");
    }

    const numScore = typeof score === "number" ? Math.min(100, Math.max(0, score)) : 0;
    const priority = this._determinePriority(numScore);
    const msgId = `msg-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const entry = {
      id: msgId,
      message: messageData.message || { text: messageData.text || "", location: messageData.location },
      score: numScore,
      priority,
      timestamp: Date.now(),
      ttl: this.ttl,
      meta: {
        deviceId: messageData.deviceId || "unknown-device",
        sensors: messageData.sensors,
        location: messageData.location,
        factors: messageData.factors
      }
    };

    this.totalEnqueued++;

    // Route to priority queue tier
    if (priority === "critical") {
      // Critical messages go to the front of critical queue
      this.queues.critical.unshift(entry);
    } else if (priority === "elevated") {
      this.queues.elevated.push(entry);
    } else if (priority === "normal") {
      this.queues.normal.push(entry);
    } else {
      // Low priority queue: limit size to maxLowSize (1,000), drop oldest if full
      if (this.queues.low.length >= this.maxLowSize) {
        this.queues.low.shift();
        this.totalDropped++;
      }
      this.queues.low.push(entry);
    }

    // Enforce overall max size capacity limit (10,000 max)
    this.enforceSizeLimits();

    const position = this._calculatePosition(entry);
    const estimatedTime = this._getEstimatedDelivery(priority);
    const totalQueued = this._getTotalQueued();

    return {
      queueId: msgId,
      position,
      estimatedTime,
      totalQueued
    };
  }

  /**
   * Dequeues the next batch of highest-priority emergency messages.
   * Processes ALL critical first, then elevated, then normal. Low queue is skipped.
   * 
   * @param {number} [count=10] - Maximum number of messages to dequeue
   * @returns {PriorityMessageEntry[]} Dequeued emergency messages
   */
  dequeue(count = 10) {
    const limit = Math.max(1, count);
    const result = [];

    // 1. Drain Critical Queue First
    while (result.length < limit && this.queues.critical.length > 0) {
      const item = this.queues.critical.shift();
      result.push(item);
    }

    // 2. Drain Elevated Queue Second
    while (result.length < limit && this.queues.elevated.length > 0) {
      const item = this.queues.elevated.shift();
      result.push(item);
    }

    // 3. Drain Normal Queue Third
    while (result.length < limit && this.queues.normal.length > 0) {
      const item = this.queues.normal.shift();
      result.push(item);
    }

    // Low queue is NEVER dequeued (stored for offline analytics)

    this.totalProcessed += result.length;
    return result;
  }

  /**
   * Returns current statistics and metrics for all priority queue tiers.
   * 
   * @returns {QueueStats} Metrics snapshot
   */
  getStats() {
    return {
      critical: this.queues.critical.length,
      elevated: this.queues.elevated.length,
      normal: this.queues.normal.length,
      low: this.queues.low.length,
      totalQueued: this._getTotalQueued(),
      totalProcessed: this.totalProcessed,
      totalDropped: this.totalDropped,
      maxSize: this.maxSize,
      ttl: this.ttl
    };
  }

  /**
   * Removes expired messages (> 1 hour TTL) across all queues.
   */
  cleanup() {
    const now = Date.now();
    let expiredCount = 0;

    ["critical", "elevated", "normal", "low"].forEach(tier => {
      const originalLen = this.queues[tier].length;
      this.queues[tier] = this.queues[tier].filter(entry => (now - entry.timestamp) <= entry.ttl);
      expiredCount += (originalLen - this.queues[tier].length);
    });

    this.totalDropped += expiredCount;
    return expiredCount;
  }

  /**
   * Enforces global queue capacity limit (maxSize = 10,000).
   * Drops oldest messages starting from low -> normal -> elevated if capacity exceeded.
   */
  enforceSizeLimits() {
    let currentTotal = this._getTotalQueued();
    if (currentTotal <= this.maxSize) return;

    let overflow = currentTotal - this.maxSize;

    // 1. Evict oldest from low queue
    while (overflow > 0 && this.queues.low.length > 0) {
      this.queues.low.shift();
      this.totalDropped++;
      overflow--;
    }

    // 2. Evict oldest from normal queue
    while (overflow > 0 && this.queues.normal.length > 0) {
      this.queues.normal.shift();
      this.totalDropped++;
      overflow--;
    }

    // 3. Evict oldest from elevated queue
    while (overflow > 0 && this.queues.elevated.length > 0) {
      this.queues.elevated.shift();
      this.totalDropped++;
      overflow--;
    }
  }

  /**
   * Destroys queue instance resources and clears intervals.
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Determines priority tier based on numerical lethality score.
   * 
   * @private
   * @param {number} score - Lethality score (0-100)
   * @returns {("critical"|"elevated"|"normal"|"low")} Priority level
   */
  _determinePriority(score) {
    if (score >= 80) return "critical";
    if (score >= 50) return "elevated";
    if (score >= 20) return "normal";
    return "low";
  }

  /**
   * Calculates position index of an entry in global priority order.
   * 
   * @private
   * @param {PriorityMessageEntry} entry - Target entry
   * @returns {number} 1-based position rank
   */
  _calculatePosition(entry) {
    if (entry.priority === "critical") {
      return this.queues.critical.indexOf(entry) + 1;
    }
    if (entry.priority === "elevated") {
      return this.queues.critical.length + this.queues.elevated.indexOf(entry) + 1;
    }
    if (entry.priority === "normal") {
      return this.queues.critical.length + this.queues.elevated.length + this.queues.normal.indexOf(entry) + 1;
    }
    return this._getTotalQueued();
  }

  /**
   * Calculates response delivery window estimation based on priority tier.
   * 
   * @private
   * @param {string} priority - Priority level
   * @returns {string} Estimated response time description
   */
  _getEstimatedDelivery(priority) {
    switch (priority) {
      case "critical":
        return "Immediate rescue dispatch (< 1 min)";
      case "elevated":
        return "Dispatch within 5 minutes";
      case "normal":
        return "Dispatch within 30 minutes";
      case "low":
      default:
        return "Routine queue monitoring / stored for analysis";
    }
  }

  /**
   * Calculates sum of items across all 4 queue tiers.
   * 
   * @private
   * @returns {number} Total queued items
   */
  _getTotalQueued() {
    return (
      this.queues.critical.length +
      this.queues.elevated.length +
      this.queues.normal.length +
      this.queues.low.length
    );
  }
}

module.exports = { LifeboatPriorityQueue };
