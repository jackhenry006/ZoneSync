const os = require('os');
const qrcode = require('qrcode-terminal');

function getNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

function printNetworkQr({ port = 3000, protocol = 'https', path = '', title = 'ZoneSync Mesh Network' } = {}) {
  const ip = getNetworkIp();
  const url = `${protocol}://${ip}:${port}${path}`;

  console.log('\n┌────────────────────────────────────────────────────────┐');
  console.log(`│ 🌐 ${title.padEnd(52)}│`);
  console.log(`│ 📱 URL: ${url.padEnd(47)}│`);
  console.log('└────────────────────────────────────────────────────────┘\n');

  qrcode.generate(url, { small: true }, (qr) => {
    console.log(qr);
  });

  console.log('💡 Instructions:');
  console.log('   1. Ensure your phone/device is on the same Wi-Fi / Local Network.');
  console.log(`   2. Scan the QR code above or visit: ${url}`);
  if (protocol === 'https') {
    console.log('   3. Tap "Advanced" -> "Proceed" if your browser warns about the self-signed SSL cert.');
  }
  console.log('');
}

if (require.main === module) {
  const customPort = process.argv[2] ? parseInt(process.argv[2], 10) : 3000;
  const customProto = process.argv[3] || 'https';
  printNetworkQr({ port: customPort, protocol: customProto });
}

module.exports = { getNetworkIp, printNetworkQr };
