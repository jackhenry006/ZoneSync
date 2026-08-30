// Root entry point for Render deployment when Root Directory is left as default
const path = require('path');
const targetDir = path.join(__dirname, 'mesh-network-p2p', 'mesh-network-p2p');
process.chdir(targetDir);
require(path.join(targetDir, 'signaling-server.js'));
