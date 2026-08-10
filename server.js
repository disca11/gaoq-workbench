// 高全的工作台 —— 零依赖同步服务（同时托管页面 + /api/state 同步接口 + WebSocket 即时推送）
// 运行： node server.js   （端口可用 PORT 环境变量覆盖，云端如 Render 会自动注入）
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');

// 持久磁盘解析：Render 把 disk 挂载到 DATA_DIR（默认 /data）；
// 检测到该目录存在就把 data.json 写到挂载盘，彻底避免临时文件系统清空导致数据丢失；
// 本地开发无挂载盘时回落到项目目录（data.json 在仓库内），行为不变。
function resolveDataDir() {
  const env = process.env.DATA_DIR;
  try { if (env && fs.existsSync(env) && fs.statSync(env).isDirectory()) return env; } catch (e) {}
  try { if (fs.existsSync('/data') && fs.statSync('/data').isDirectory()) return '/data'; } catch (e) {}
  return ROOT;
}
const DATA_DIR = resolveDataDir();
const DATA_FILE = path.join(DATA_DIR, 'data.json');

let state = { todos: [], notes: [], projects: [], worklog: {}, meta: { lastAutoRoll: '', version: 1, seeded: false }, rev: 0 };
if (fs.existsSync(DATA_FILE)) {
  try { state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { /* corrupt, start fresh */ }
}
if (typeof state.rev !== 'number') state.rev = 0;
if (!state.worklog || typeof state.worklog !== 'object') state.worklog = {};

function persist() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(state)); } catch (e) { console.error('persist fail', e); }
}
persist();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon'
};

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function snapshot() {
  return { todos: state.todos, notes: state.notes, projects: state.projects, worklog: state.worklog, meta: state.meta, rev: state.rev };
}

/* ===================== 自动导入 WorkBuddy 任务记录 ===================== */
// WorkBuddy 在 .workbuddy/memory/YYYY-MM-DD.md 中按约定格式写任务行：
//   - [WB] 任务标题 | 成果：file1, file2 | 备注文字
// 后端定时扫描当天日志，把这类行自动汇入工作台「工作记录」(来源=WorkBuddy)，无需手动填写。
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function parseWBLines(text) {
  const out = [];
  text.split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*-\s*\[WB\]\s*(.+)$/);
    if (!m) return;
    let rest = m[1].trim();
    let title = rest, file = '', note = '';
    const fm = rest.match(/^(.*?)\s*\|\s*成果[:：]\s*(.+)$/);
    if (fm) {
      title = fm[1].trim();
      const after = fm[2];
      const nm = after.match(/^(.*?)\s*\|\s*(.+)$/);
      if (nm) { file = nm[1].trim(); note = nm[2].trim(); }
      else file = after.trim();
    } else {
      const nm = rest.match(/^(.*?)\s*\|\s*(.+)$/);
      if (nm) { title = nm[1].trim(); note = nm[2].trim(); }
    }
    out.push({ title, file, note });
  });
  return out;
}

function importFromWorkbuddy() {
  const dir = process.env.WORKBUDDY_MEMORY || path.join(ROOT, '../.workbuddy/memory');
  if (!fs.existsSync(dir)) return 0;
  const td = ymd(new Date());
  const file = path.join(dir, td + '.md');
  if (!fs.existsSync(file)) return 0;
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return 0; }
  const items = parseWBLines(text);
  if (!items.length) return 0;
  state.worklog = state.worklog || {};
  if (!state.worklog[td]) state.worklog[td] = [];
  const have = new Set(state.worklog[td].filter(x => x.source === 'WorkBuddy').map(x => x.title));
  let added = 0;
  for (const it of items) {
    if (have.has(it.title)) continue;
    state.worklog[td].push({
      id: crypto.randomBytes(4).toString('hex'), date: td, source: 'WorkBuddy',
      title: it.title, file: it.file, note: it.note, wbAuto: true, createdAt: Date.now()
    });
    have.add(it.title); added++;
  }
  if (added) { state.rev++; persist(); broadcast({ type: 'sync', rev: state.rev, at: Date.now() }); }
  return added;
}

/* ===================== WebSocket（零依赖实现） ===================== */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients = new Set();

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // ---- 同步接口 ----
  if (urlPath === '/api/state' && req.method === 'GET') {
    return sendJSON(res, 200, snapshot());
  }
  if (urlPath === '/api/state' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const inc = JSON.parse(body);
        if (inc && inc.state && typeof inc.rev === 'number') {
          if (inc.rev >= state.rev) {
            state = {
              todos: inc.state.todos || [], notes: inc.state.notes || [],
              projects: inc.state.projects || [], worklog: inc.state.worklog || {},
              meta: inc.state.meta || {}, rev: inc.rev
            };
            persist();
          }
          sendJSON(res, 200, snapshot());
          broadcast({ type: 'sync', rev: state.rev, at: Date.now() });
          return;
        }
        sendJSON(res, 400, { error: 'bad payload' });
      } catch (e) { sendJSON(res, 500, { error: String(e) }); }
    });
    return;
  }
  if (urlPath === '/api/import-workbuddy' && req.method === 'POST') {
    const added = importFromWorkbuddy();
    return sendJSON(res, 200, { added, rev: state.rev });
  }
  if (urlPath === '/api/lan' && req.method === 'GET') {
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
      for (const ni of nets[name]) {
        if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
      }
    }
    return sendJSON(res, 200, { port: PORT, ips, local: 'http://localhost:' + PORT });
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  // ---- 静态页面 ----
  let p = decodeURIComponent(urlPath);
  if (p === '/') p = '/index.html';
  const filePath = path.join(PUBLIC, path.normalize(p));
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

/* ---- WS 握手与帧处理 ---- */
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  socket._buf = Buffer.alloc(0);
  clients.add(socket);
  socket.on('data', chunk => { socket._buf = Buffer.concat([socket._buf, chunk]); parseFrames(socket); });
  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => { clients.delete(socket); });
});

function parseFrames(socket) {
  let buf = socket._buf;
  while (buf.length >= 2) {
    const b1 = buf[1];
    const opcode = buf[0] & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f, offset = 2;
    if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); offset = 4; }
    else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
    let mask;
    if (masked) { if (buf.length < offset + 4) return; mask = buf.slice(offset, offset + 4); offset += 4; }
    if (buf.length < offset + len) return;
    const payload = Buffer.from(buf.slice(offset, offset + len));
    if (masked) { for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]; }
    buf = buf.slice(offset + len);
    if (opcode === 0x8) { try { socket.end(); } catch (e) {} clients.delete(socket); return; }
    if (opcode === 0x9) sendFrame(socket, 0xA, payload); // ping -> pong
    // 客户端发来的文本/二进制无需处理
  }
  socket._buf = buf;
}

function sendFrame(socket, opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  try { socket.write(Buffer.concat([header, payload])); } catch (e) {}
}

function broadcast(obj) {
  const m = Buffer.from(JSON.stringify(obj), 'utf8');
  clients.forEach(s => { if (s.writable) sendFrame(s, 0x1, m); });
}

importFromWorkbuddy();
setInterval(importFromWorkbuddy, 60000);
server.listen(PORT, HOST, () => console.log('高全的工作台 已启动: http://localhost:' + PORT + '  (WS 已启用, WorkBuddy 自动导入已开启) | 数据文件: ' + DATA_FILE));
