/**
 * @file lethalityCalculator.js
 * @description Calculates lethality scores (0-100), risk factors, priority classification,
 * and actionable rescue recommendations based on multi-modal sensor inputs and text keywords.
 * 
 * @module LethalityCalculator
 */

export class LethalityCalculator {
  constructor() {
    this.keywordGroups = {
      injury: ["bleeding", "trapped", "crush", "injured", "fracture", "unconscious", "dying", "broken"],
      flood: ["water", "rising", "drowning", "flood", "submerged", "overflow"],
      collapse: ["rubble", "debris", "crushed", "cave-in", "collapse", "collapsed", "trapped"],
      vulnerable: ["elderly", "baby", "infant", "pregnant", "disabled", "child"]
    };
  }

  calculate(input) {
    if (!input || typeof input !== "object") {
      throw new Error("Invalid payload: input must be an object");
    }

    const factors = [];
    let rawScore = 0;

    const sensors = input.sensors || {};
    const location = input.location || {};
    const message = input.message || {};
    const text = (message.text || "").toLowerCase();

    // 1. Barometer Pressure Drop Analysis (> 5 hPa/min -> +50 points)
    const baroDrop = this._analyzeBarometer(sensors.barometer);
    if (baroDrop.rateHpaPerMin > 5.0) {
      const weight = 50;
      rawScore += weight;
      factors.push({
        factor: "Rapid water rise / barometric pressure drop",
        weight,
        value: Math.round(baroDrop.rateHpaPerMin * 10) / 10
      });
    }

    // 2. Accelerometer Stillness / Inertia (> 5 minutes no movement -> +15 points)
    const inertiaSec = this._analyzeAccelerometer(sensors.accelerometer);
    if (inertiaSec >= 300) {
      const weight = 15;
      rawScore += weight;
      factors.push({
        factor: "No movement / prolonged inertia",
        weight,
        value: `${Math.round(inertiaSec / 60)} minutes`
      });
    }

    // 3. Ambient Light (< 5 lux -> +30 points)
    if (typeof sensors.ambientLight === "number" && sensors.ambientLight < 5) {
      const weight = 30;
      rawScore += weight;
      factors.push({
        factor: "Low ambient light / rubble or basement entrapment",
        weight,
        value: `${sensors.ambientLight} lux`
      });
    }

    // 4. Keyword Analysis
    this.keywordGroups.injury.forEach(word => {
      if (text.includes(word)) {
        const weight = 25;
        rawScore += weight;
        factors.push({ factor: `Injury keyword: ${word}`, weight });
      }
    });

    this.keywordGroups.flood.forEach(word => {
      if (text.includes(word)) {
        const weight = 20;
        rawScore += weight;
        factors.push({ factor: `Flood keyword: ${word}`, weight });
      }
    });

    this.keywordGroups.collapse.forEach(word => {
      const alreadyAdded = factors.some(f => f.factor.includes(`keyword: ${word}`));
      if (text.includes(word) && !alreadyAdded) {
        const weight = 25;
        rawScore += weight;
        factors.push({ factor: `Collapse keyword: ${word}`, weight });
      }
    });

    this.keywordGroups.vulnerable.forEach(word => {
      if (text.includes(word)) {
        const weight = 15;
        rawScore += weight;
        factors.push({ factor: `Vulnerable person keyword: ${word}`, weight });
      }
    });

    // 5. Battery Level (< 20% -> +10 points)
    if (typeof sensors.battery === "number" && sensors.battery < 20) {
      const weight = 10;
      rawScore += weight;
      factors.push({
        factor: "Low battery / imminent device loss risk",
        weight,
        value: `${sensors.battery}%`
      });
    }

    // 6. Proximity to Water Body (nearWater = true -> +15 points)
    if (location.nearWater === true) {
      const weight = 15;
      rawScore += weight;
      factors.push({
        factor: "Proximity to flood or water hazard",
        weight,
        value: true
      });
    }

    const score = Math.min(100, Math.max(0, rawScore));
    const priority = this._determinePriority(score);
    const interpretation = this._getInterpretation(priority, score);
    const recommendations = this._generateRecommendations(factors, priority, location);

    return {
      score,
      priority,
      factors,
      rawScore,
      interpretation,
      recommendations
    };
  }

  _analyzeBarometer(baroSensor) {
    if (!baroSensor || !Array.isArray(baroSensor.readings) || baroSensor.readings.length < 2) {
      return { rateHpaPerMin: 0, totalDropHpa: 0 };
    }
    const readings = baroSensor.readings;
    const oldest = readings[0];
    const newest = readings[readings.length - 1];

    const timeDiffMs = newest.timestamp - oldest.timestamp;
    if (timeDiffMs <= 0) return { rateHpaPerMin: 0, totalDropHpa: 0 };

    const dropHpa = oldest.value - newest.value;
    const timeDiffMin = timeDiffMs / (1000 * 60);

    const rateHpaPerMin = dropHpa / timeDiffMin;
    return {
      rateHpaPerMin: Math.max(0, rateHpaPerMin),
      totalDropHpa: Math.max(0, dropHpa)
    };
  }

  _analyzeAccelerometer(accelSensor) {
    if (!accelSensor || !Array.isArray(accelSensor.readings) || accelSensor.readings.length < 2) {
      return 0;
    }

    const readings = accelSensor.readings;
    let maxDelta = 0;
    for (let i = 1; i < readings.length; i++) {
      const dx = Math.abs(readings[i].x - readings[i - 1].x);
      const dy = Math.abs(readings[i].y - readings[i - 1].y);
      const dz = Math.abs(readings[i].z - readings[i - 1].z);
      const delta = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (delta > maxDelta) maxDelta = delta;
    }

    if (maxDelta < 0.25) {
      return (readings[readings.length - 1].timestamp - readings[0].timestamp) / 1000;
    }

    return 0;
  }

  _determinePriority(score) {
    if (score >= 80) return "critical";
    if (score >= 50) return "elevated";
    if (score >= 20) return "normal";
    return "low";
  }

  _getInterpretation(priority, score) {
    switch (priority) {
      case "critical":
        return `CRITICAL (${score}/100) - Life-threatening emergency situation`;
      case "elevated":
        return `ELEVATED (${score}/100) - High risk, urgent intervention required`;
      case "normal":
        return `NORMAL (${score}/100) - Standard priority response`;
      case "low":
      default:
        return `LOW (${score}/100) - Routine check-in or low risk status`;
    }
  }

  _generateRecommendations(factors, priority, location) {
    const recs = [];

    if (priority === "critical") {
      recs.push("DISPATCH RESCUE TEAM IMMEDIATELY");
    } else if (priority === "elevated") {
      recs.push("Dispatch rescue assets within 5 minutes");
    }

    const hasWater = factors.some(f => f.factor.includes("water") || f.factor.includes("Flood"));
    if (hasWater) {
      recs.push("Deploy flood rescue craft and water survival gear");
    }

    const hasInjury = factors.some(f => f.factor.includes("Injury") || f.factor.includes("bleeding"));
    if (hasInjury) {
      recs.push("Deploy medical team with trauma and tourniquet kit");
    }

    const hasCollapse = factors.some(f => f.factor.includes("Collapse") || f.factor.includes("rubble"));
    if (hasCollapse) {
      recs.push("Deploy heavy structural extraction and shoring equipment");
    }

    const hasVulnerable = factors.some(f => f.factor.includes("Vulnerable"));
    if (hasVulnerable) {
      recs.push("Prepare specialized pediatric / maternity / geriatric medical care");
    }

    if (location && typeof location.lat === "number" && typeof location.lng === "number") {
      recs.push(`Share exact location coordinates (${location.lat}, ${location.lng}) with field units`);
    }

    if (recs.length === 0) {
      recs.push("Monitor device status during routine queue processing");
    }

    return recs;
  }
}
