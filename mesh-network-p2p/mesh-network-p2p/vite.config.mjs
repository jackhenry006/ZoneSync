import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

function isIgnoredError(err) {
  if (!err) return false;
  const ignoredCodes = ['ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT', 'ERR_STREAM_DESTROYED'];
  
  const code = err.code || (err.errors && err.errors[0] && err.errors[0].code);
  if (code && ignoredCodes.includes(code)) return true;
  
  const msg = err.message || '';
  if (ignoredCodes.some(c => msg.includes(c))) return true;
  
  return false;
}

export default defineConfig({
  plugins: [react(), basicSsl()],
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:4001',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (isIgnoredError(err)) {
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(504, { 'Content-Type': 'text/plain' });
                res.end('Signaling server offline');
              }
              return;
            }
            console.error('[vite proxy error]', err);
          });
          proxy.on('open', (proxySocket) => {
            if (proxySocket && typeof proxySocket.emit === 'function') {
              const origEmit = proxySocket.emit;
              proxySocket.emit = function (event, ...args) {
                if (event === 'error' && isIgnoredError(args[0])) {
                  return true;
                }
                return origEmit.apply(this, [event, ...args]);
              };
            }
          });
          proxy.on('proxyReqWs', (proxyReq, _req, socket) => {
            if (proxyReq && typeof proxyReq.emit === 'function') {
              const origEmit = proxyReq.emit;
              proxyReq.emit = function (event, ...args) {
                if (event === 'error' && isIgnoredError(args[0])) {
                  return true;
                }
                return origEmit.apply(this, [event, ...args]);
              };
            }
            if (socket && typeof socket.emit === 'function') {
              const origEmit = socket.emit;
              socket.emit = function (event, ...args) {
                if (event === 'error' && isIgnoredError(args[0])) {
                  return true;
                }
                return origEmit.apply(this, [event, ...args]);
              };
            }
          });
        },
      },
      '/sync': {
        target: 'http://127.0.0.1:4001',
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (isIgnoredError(err)) {
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(504, { 'Content-Type': 'text/plain' });
                res.end('Cloud server offline');
              }
              return;
            }
          });
        },
      },
      '/echolocate-api': {
        target: 'http://127.0.0.1:4001',
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (isIgnoredError(err)) {
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(504, { 'Content-Type': 'text/plain' });
                res.end('EchoLocate server offline');
              }
              return;
            }
          });
        },
      },
      '/model': {
        target: 'http://127.0.0.1:4001',
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (isIgnoredError(err)) {
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(504, { 'Content-Type': 'text/plain' });
                res.end('Cloud server offline');
              }
              return;
            }
          });
        },
      },
      '/state': {
        target: 'http://127.0.0.1:4001',
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (isIgnoredError(err)) {
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(504, { 'Content-Type': 'text/plain' });
                res.end('Cloud server offline');
              }
              return;
            }
          });
        },
      },
      '/api': {
        target: 'http://127.0.0.1:4001',
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (isIgnoredError(err)) {
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(504, { 'Content-Type': 'text/plain' });
                res.end('Lifeboat API server offline');
              }
              return;
            }
          });
        },
      },
    },
  },
});
