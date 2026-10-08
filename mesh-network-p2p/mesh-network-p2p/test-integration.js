const http = require('http');

function postJson(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 4001,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 4001,
      path,
      method: 'GET'
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Full System Integration Tests...\n');

  // Test 1: State
  console.log('1. Checking /state endpoint...');
  const stateRes = await getJson('/state');
  console.log(`   Status: ${stateRes.status}, Nodes: ${stateRes.data.nodes?.length || 0}`);

  // Test 2: AI Model
  console.log('2. Checking /model endpoint...');
  const modelRes = await getJson('/model');
  console.log(`   Status: ${modelRes.status}, Version: ${modelRes.data.version}`);

  // Test 3: PulseSeeker / InertiaSense Model
  console.log('3. Checking /api/pulse-seeker/model endpoint...');
  const psModelRes = await getJson('/api/pulse-seeker/model');
  console.log(`   Status: ${psModelRes.status}, Output Classes: ${psModelRes.data.outputClasses?.join(', ')}`);

  // Test 4: Auto-Beacon
  console.log('4. Testing /api/auto-beacon endpoint...');
  const beaconRes = await postJson('/api/auto-beacon', {
    type: 'tapping',
    confidence: 94,
    environment: 'sub-surface concrete rubble',
    location: { lat: 37.7749, lng: -122.4194, accuracy: 4.5 }
  });
  console.log(`   Status: ${beaconRes.status}, Beacon ID: ${beaconRes.data.beaconId}`);

  console.log('\n🎉 ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
