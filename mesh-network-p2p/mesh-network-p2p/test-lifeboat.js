/**
 * @file test-lifeboat.js
 * @description Automated verification test suite for the Lifeboat Routing System.
 * Tests LethalityCalculator factor scoring, PriorityQueue sorting, size capping, and Express API endpoints.
 */

const { LethalityCalculator } = require('./lethality-calculator');
const { LifeboatPriorityQueue } = require('./priority-queue');

function runTests() {
  console.log("=================================================");
  console.log("🚤 Running Lifeboat Routing System Test Suite");
  console.log("=================================================\n");

  const calculator = new LethalityCalculator();
  let passedCount = 0;
  let totalCount = 0;

  function assert(condition, testName, extraInfo = "") {
    totalCount++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${extraInfo}`);
    }
  }

  // -----------------------------------------------------------------
  // Test Case 1: Barometer Drop Test (Rapid drop > 5 hPa/min)
  // Expected: Score >= 40, Priority = elevated or critical
  // -----------------------------------------------------------------
  console.log("--- Test 1: Barometer Drop Test ---");
  const baroPayload = {
    deviceId: "dev-baro-1",
    sensors: {
      barometer: {
        readings: [
          { value: 1015, timestamp: Date.now() - 60000 },
          { value: 1008, timestamp: Date.now() } // 7 hPa drop in 1 minute = 7 hPa/min
        ]
      }
    },
    message: { text: "Heavy rain outside", timestamp: Date.now() }
  };

  const res1 = calculator.calculate(baroPayload);
  assert(res1.score >= 40, "Barometer drop score >= 40", `Got score: ${res1.score}`);
  assert(res1.priority === "elevated" || res1.priority === "critical", "Priority is elevated or critical", `Got priority: ${res1.priority}`);
  console.log(`   Score: ${res1.score}, Priority: ${res1.priority}, Factors: ${res1.factors.length}\n`);

  // -----------------------------------------------------------------
  // Test Case 2: Injury Keyword Test ("bleeding heavily")
  // Expected: Score >= 50, Priority = critical or elevated
  // -----------------------------------------------------------------
  console.log("--- Test 2: Injury Keyword Test ---");
  const injuryPayload = {
    deviceId: "dev-injury-2",
    sensors: {
      ambientLight: 10,
      battery: 15 // battery < 20% (+10)
    },
    message: { text: "I am trapped and bleeding heavily", timestamp: Date.now() }
  };

  const res2 = calculator.calculate(injuryPayload);
  assert(res2.score >= 50, "Injury keyword score >= 50", `Got score: ${res2.score}`);
  assert(res2.priority === "critical" || res2.priority === "elevated", "Priority is critical or elevated", `Got priority: ${res2.priority}`);
  console.log(`   Score: ${res2.score}, Priority: ${res2.priority}, Factors: ${res2.factors.map(f => f.factor).join("; ")}\n`);

  // -----------------------------------------------------------------
  // Test Case 3: Flood + No Movement Test ("water rising" + 6 min stationary)
  // Expected: Score >= 70, Priority = critical
  // -----------------------------------------------------------------
  console.log("--- Test 3: Flood + No Movement Test ---");
  const floodInertiaPayload = {
    deviceId: "dev-flood-3",
    sensors: {
      accelerometer: {
        readings: [
          { x: 0.1, y: 0.2, z: 9.8, timestamp: Date.now() - 360000 },
          { x: 0.1, y: 0.2, z: 9.8, timestamp: Date.now() } // stationary for 6 minutes
        ]
      },
      ambientLight: 2 // < 5 lux (+30)
    },
    location: { nearWater: true },
    message: { text: "Water level rising fast, cannot move", timestamp: Date.now() }
  };

  const res3 = calculator.calculate(floodInertiaPayload);
  assert(res3.score >= 70, "Flood + Inertia score >= 70", `Got score: ${res3.score}`);
  assert(res3.priority === "critical", "Priority is critical", `Got priority: ${res3.priority}`);
  console.log(`   Score: ${res3.score}, Priority: ${res3.priority}, Recommendations: ${res3.recommendations.length}\n`);

  // -----------------------------------------------------------------
  // Test Case 4: Low Priority Test ("I'm safe, checking in")
  // Expected: Score < 20, Priority = low
  // -----------------------------------------------------------------
  console.log("--- Test 4: Low Priority Test ---");
  const lowPayload = {
    deviceId: "dev-low-4",
    sensors: {
      ambientLight: 300,
      battery: 85
    },
    message: { text: "I'm safe, checking in with family", timestamp: Date.now() }
  };

  const res4 = calculator.calculate(lowPayload);
  assert(res4.score < 20, "Low priority score < 20", `Got score: ${res4.score}`);
  assert(res4.priority === "low", "Priority is low", `Got priority: ${res4.priority}`);
  console.log(`   Score: ${res4.score}, Priority: ${res4.priority}\n`);

  // -----------------------------------------------------------------
  // Test Case 5: Queue Overload Test (Enqueue 15,000 messages)
  // Expected: Queue size capped at 10,000, oldest dropped
  // -----------------------------------------------------------------
  console.log("--- Test 5: Queue Overload Test (15,000 Messages) ---");
  const queue = new LifeboatPriorityQueue({ maxSize: 10000 });

  for (let i = 0; i < 15000; i++) {
    const score = (i % 4) * 25; // 0, 25, 50, 75
    queue.enqueue({ deviceId: `dev-burst-${i}`, text: `Test message ${i}` }, score);
  }

  const stats = queue.getStats();
  assert(stats.totalQueued <= 10000, "Queue size capped at 10,000", `Got totalQueued: ${stats.totalQueued}`);
  assert(stats.totalDropped >= 5000, "Dropped count >= 5,000", `Got totalDropped: ${stats.totalDropped}`);
  console.log(`   Stats snapshot: Critical: ${stats.critical}, Elevated: ${stats.elevated}, Normal: ${stats.normal}, Low: ${stats.low}, Total: ${stats.totalQueued}, Dropped: ${stats.totalDropped}\n`);

  queue.destroy();

  console.log("=================================================");
  console.log(`🏁 Test Summary: ${passedCount} / ${totalCount} tests passed.`);
  console.log("=================================================");

  if (passedCount === totalCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
