const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 8080);
const HOST = '0.0.0.0';
const HTML = path.join(__dirname, 'index.html');

// One shared world for everyone connected to this server process.
// World edits remain in memory until the server restarts.
const seed = 1 + Math.floor(Math.random() * 900000);
const players = new Map();
const blocks = new Map();

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  if (pathname === '/' || pathname === '/index.html') {
    fs.readFile(HTML, (err, data) => {
      if (err) { res.writeHead(500); return res.end('Could not read index.html'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(data);
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  if (pathname !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function roster() {
  return [...players.values()].map(p => ({
    id: p.id, name: p.name, position: p.position, online: true
  }));
}
function broadcast(data, except) {
  const raw = JSON.stringify(data);
  for (const p of players.values()) {
    if (p.ws !== except && p.ws.readyState === WebSocket.OPEN) p.ws.send(raw);
  }
}
function broadcastRoster() { broadcast({ type: 'players', players: roster() }); }

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'join') {
      if (ws.playerId) return;
      const id = crypto.randomUUID();
      const name = String(msg.name || 'Player').trim().slice(0, 20) || 'Player';
      const isHost = players.size === 0;
      const player = { id, name, ws, position: null, joinedAt: Date.now() };
      ws.playerId = id;
      players.set(id, player);
      send(ws, {
        type: 'welcome', id, host: isHost, seed,
        blocks: Object.fromEntries(blocks),
        players: roster().filter(p => p.id !== id)
      });
      broadcastRoster();
      console.log(`${name} joined (${players.size} players)`);
      return;
    }

    const player = ws.playerId && players.get(ws.playerId);
    if (!player) return;

    if (msg.type === 'player:move' && msg.position && typeof msg.position === 'object') {
      const p = msg.position;
      const vals = ['x','y','z','yaw','pitch'];
      if (!vals.every(k => Number.isFinite(Number(p[k])))) return;
      player.position = {
        x: Number(p.x), y: Number(p.y), z: Number(p.z),
        yaw: Number(p.yaw) || 0, pitch: Number(p.pitch) || 0,
        moving: !!p.moving
      };
      broadcast({ type: 'player:move', id: player.id, name: player.name, position: player.position }, ws);
      // Roster updates keep names and positions available to newly joined players.
      if (Date.now() - (player.lastRosterAt || 0) > 1500) {
        player.lastRosterAt = Date.now();
        broadcastRoster();
      }
    } else if (msg.type === 'block:set' && msg.block) {
      const b = msg.block;
      const x = Math.trunc(Number(b.x)), y = Math.trunc(Number(b.y)), z = Math.trunc(Number(b.z));
      const id = Math.trunc(Number(b.id)), meta = Math.trunc(Number(b.meta) || 0);
      if (![x,y,z,id,meta].every(Number.isFinite) || x < 0 || x >= 128 || z < 0 || z >= 128 || y < 0 || y >= 48 || id < 0 || id > 255) return;
      const block = { x, y, z, id, meta };
      blocks.set([x,y,z].join(','), block);
      broadcast({ type: 'block:set', block }, ws);
    } else if (msg.type === 'ping' && Number.isFinite(Number(msg.t))) {
      send(ws, { type: 'pong', t: Number(msg.t) });
    }
  });

  ws.on('close', () => {
    if (!ws.playerId) return;
    const p = players.get(ws.playerId);
    players.delete(ws.playerId);
    if (p) console.log(`${p.name} left (${players.size} players)`);
    broadcastRoster();
  });
  ws.on('error', () => {});
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000);
server.on('close', () => clearInterval(heartbeat));
server.listen(PORT, HOST, () => {
  console.log(`Block Worlds server listening on http://127.0.0.1:${PORT}`);
  console.log(`Shared world seed: ${seed}`);
});
