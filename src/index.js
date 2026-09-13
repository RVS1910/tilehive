import { MosaicHour } from './mosaic.js';
export { MosaicHour };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Everything real-time (painting, queue, votes) is handled by the one
    // Durable Object instance that represents "the current mosaic hour."
    if (url.pathname === '/ws' || url.pathname === '/archive') {
      const id = env.MOSAIC.idFromName('current');
      const stub = env.MOSAIC.get(id);
      return stub.fetch(request);
    }

    return new Response(HTML, { headers: { 'content-type': 'text/html;charset=UTF-8' } });
  },
};

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tilehive</title>
<style>
  :root{
    --paper:#FBFAF7; --ink:#202124; --muted:#6B6B70; --line:#E3E0D8; --panel:#F3F1EB;
    --indigo:#35406B; --amber:#C98A2C;
    --serif: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
    --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  }
  *{box-sizing:border-box;}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);}
  header{display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid var(--line);}
  header .word{font-family:var(--serif);font-size:20px;}
  header .status{font-size:13px;color:var(--muted);}
  main{padding:24px;max-width:1100px;margin:0 auto;}
  button{font-family:var(--sans);cursor:pointer;border:1px solid var(--indigo);background:#fff;color:var(--indigo);padding:9px 16px;font-size:13.5px;}
  button.primary{background:var(--indigo);color:#fff;}
  button.gold{border-color:var(--amber);color:var(--amber);}
  button:disabled{opacity:.4;cursor:default;}
  .panel{background:var(--panel);border:1px solid var(--line);padding:16px;margin-bottom:20px;}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}

  #mosaic{display:grid;gap:4px;margin-top:14px;}
  #mosaic canvas{width:100%;height:100%;background:#fff;border:1px solid var(--line);display:block;}
  .cellwrap{position:relative;}
  .cellwrap.mine::after{content:"";position:absolute;inset:0;outline:2px dashed var(--indigo);pointer-events:none;}
  .ownerlabel{position:absolute;bottom:2px;left:2px;font-size:9px;background:rgba(255,255,255,.8);padding:0 3px;color:var(--muted);}

  #workspace{display:none;margin-top:20px;}
  #workspace.active{display:block;}
  .paintarea{position:relative;border:1.5px solid var(--ink);width:100%;max-width:560px;}
  .paintarea canvas{position:absolute;top:0;left:0;width:100%;height:100%;}
  .palette{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;max-width:280px;margin:10px 0;}
  .swatch{width:28px;height:28px;border:2px solid transparent;cursor:pointer;}
  .swatch.selected{border-color:var(--ink);}

  #nameModal,#checkinModal{display:none;position:fixed;inset:0;background:rgba(20,18,15,0.5);align-items:center;justify-content:center;z-index:10;}
  #nameModal.show,#checkinModal.show{display:flex;}
  .modalbox{background:#fff;padding:26px;max-width:360px;width:90%;}
  .modalbox input{width:100%;padding:10px;border:1px solid var(--line);font-size:14px;margin:10px 0;}

  #offerBanner{display:none;background:var(--amber);color:#fff;padding:10px 16px;text-align:center;font-size:14px;}
  #offerBanner.show{display:block;}
</style>
</head>
<body>

<header>
  <span class="word">Tilehive</span>
  <span class="status" id="statusLine">connecting...</span>
</header>

<div id="offerBanner"></div>

<main>
  <div class="panel row" id="queuePanel">
    <button class="primary" id="joinBtn">Join queue</button>
    <span id="queueInfo" style="font-size:13px;color:var(--muted);"></span>
  </div>

  <div class="panel" id="namePanel">
    <b style="font-family:var(--serif);font-size:16px;">Name this mosaic</b>
    <div class="row" style="margin-top:8px;">
      <input id="nameInput" placeholder="Suggest a name" style="padding:8px;border:1px solid var(--line);flex:1;min-width:160px;">
      <button id="submitNameBtn">Submit</button>
    </div>
    <div id="voteList" style="margin-top:10px;font-size:13.5px;"></div>
  </div>

  <div id="mosaic"></div>

  <div id="workspace">
    <h3 style="font-family:var(--serif);">Your block</h3>
    <div class="paintarea" id="paintarea">
      <canvas id="lockedCanvas"></canvas>
      <canvas id="previewCanvas"></canvas>
    </div>
    <div class="palette" id="palette"></div>
    <div class="row">
      <button id="finishBtn">Finish &amp; lock</button>
    </div>
  </div>
</main>

<div id="nameModal">
  <div class="modalbox">
    <b style="font-family:var(--serif);font-size:18px;">Join the hive</b>
    <p style="font-size:13.5px;color:var(--muted);">Pick a name to paint under. (Real sign-in comes next — this is a placeholder for now.)</p>
    <input id="nameEntry" placeholder="Your name" maxlength="24">
    <button class="primary" id="enterBtn" style="width:100%;">Enter</button>
  </div>
</div>

<div id="checkinModal">
  <div class="modalbox">
    <b style="font-family:var(--serif);font-size:18px;">Still there?</b>
    <p style="font-size:13.5px;color:var(--muted);">You've been idle a while. Tap below or your block will open back up for someone else.</p>
    <button class="primary" id="stillHereBtn" style="width:100%;">I'm still painting</button>
  </div>
</div>

<script>
const COLORS = ['#202124','#E4572E','#2E86AB','#5B8C5A','#C98A2C','#7B4B94','#3E7CB1','#D4537E',
  '#639922','#E3B23C','#8C8C8C','#4C7A3E','#9B6B3C','#5C6690','#B23A6B','#3E9C8F',
  '#F2B84B','#C0523A','#6E9BC7','#7FA65C','#A8783D','#9A5C9E','#4E6E9C','#D97CA0',
  '#5AA34A','#E8C766','#B0ADA5','#3F6C4E','#8A5A2C','#6E5C99','#2F5A7A','#C25A7A'];

let ws, userId, myName, myBlockId = null, hour = null, config = null;
const blocks = new Map(); // id -> block data + dom refs
let selectedColor = COLORS[1];
let vipDebug = false;

userId = localStorage.getItem('tilehive_uid');
if (!userId) { userId = crypto.randomUUID(); localStorage.setItem('tilehive_uid', userId); }
myName = localStorage.getItem('tilehive_name');

function statusLine(t){ document.getElementById('statusLine').textContent = t; }

function connect(){
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host + '/ws');
  ws.onopen = () => {
    statusLine('connected');
    ws.send(JSON.stringify({ type:'hello', userId, name: myName || 'Guest', isVip: vipDebug }));
  };
  ws.onclose = () => { statusLine('disconnected — retrying...'); setTimeout(connect, 1500); };
  ws.onmessage = (evt) => handleMessage(JSON.parse(evt.data));
}

function handleMessage(msg){
  if (msg.type === 'welcome') { userId = msg.userId; }
  else if (msg.type === 'state') { applyState(msg); }
  else if (msg.type === 'blockAssigned') { onBlockAssigned(msg); }
  else if (msg.type === 'blockLocked') { onBlockLocked(msg.blockId); }
  else if (msg.type === 'blockReleased') { onBlockLocked(msg.blockId); }
  else if (msg.type === 'strokeAdded') { onStroke(msg); }
  else if (msg.type === 'blockOpen') { showOffer(msg.blockId); }
  else if (msg.type === 'claimFailed') { statusLine('someone else was faster — still in queue'); }
  else if (msg.type === 'checkin') { if (msg.blockId === myBlockId) document.getElementById('checkinModal').classList.add('show'); }
  else if (msg.type === 'mosaicReset') { myBlockId = null; document.getElementById('workspace').classList.remove('active'); }
}

function applyState(msg){
  hour = msg.hour; config = msg.config;
  document.getElementById('queueInfo').textContent =
    (hour.locked ? 'This hour is sized. ' : 'Sizing this hour... ') + msg.queueLength + ' waiting in queue.';
  renderVotes(msg.nameVotes);
  rebuildGrid(msg.blocks);
}

function rebuildGrid(list){
  const cols = Math.max(1, Math.ceil(Math.sqrt(config.maxPainters)));
  const grid = document.getElementById('mosaic');
  grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
  grid.innerHTML = '';
  blocks.clear();
  for (const b of list){
    const wrap = document.createElement('div');
    wrap.className = 'cellwrap' + (b.ownerId === userId ? ' mine' : '');
    wrap.style.aspectRatio = b.w + ' / ' + b.h;
    const canvas = document.createElement('canvas');
    canvas.width = b.w * 60; canvas.height = b.h * 60;
    wrap.appendChild(canvas);
    if (b.ownerName && b.status !== 'unclaimed'){
      const lbl = document.createElement('span');
      lbl.className = 'ownerlabel'; lbl.textContent = b.ownerName;
      wrap.appendChild(lbl);
    }
    grid.appendChild(wrap);
    const ctx = canvas.getContext('2d');
    for (const s of (b.strokes||[])) drawStroke(ctx, canvas.width, canvas.height, s);
    blocks.set(b.id, { ...b, canvas, ctx });
    if (b.ownerId === userId && b.status === 'open') openWorkspace(b);
  }
}

function drawStroke(ctx, w, h, stroke){
  if (!stroke.points || stroke.points.length < 2) return;
  ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width || 4;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  stroke.points.forEach((p, i) => {
    const x = p[0]*w, y = p[1]*h;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
}

function onBlockAssigned(msg){
  const existing = blocks.get(msg.blockId) || {};
  const merged = { ...existing, id: msg.blockId, ownerId: msg.ownerId, ownerName: msg.ownerName,
    col: msg.col, row: msg.row, w: msg.w||existing.w, h: msg.h||existing.h, status:'open', strokes: [] };
  blocks.set(msg.blockId, merged);
  if (msg.ownerId === userId){
    myBlockId = msg.blockId;
    openWorkspace(merged);
    document.getElementById('offerBanner').classList.remove('show');
  }
}

function onBlockLocked(blockId){
  if (blockId === myBlockId){
    myBlockId = null;
    document.getElementById('workspace').classList.remove('active');
  }
}

function onStroke(msg){
  const b = blocks.get(msg.blockId);
  if (b && b.ctx) drawStroke(b.ctx, b.canvas.width, b.canvas.height, msg);
  if (msg.blockId === myBlockId){
    const preview = document.getElementById('previewCanvas');
    preview.getContext('2d').clearRect(0,0,preview.width,preview.height);
  }
}

function showOffer(blockId){
  const banner = document.getElementById('offerBanner');
  banner.textContent = 'A block just opened up — claim it before someone else does!';
  banner.classList.add('show');
  banner.onclick = () => ws.send(JSON.stringify({ type:'claimBlock', blockId }));
}

function openWorkspace(b){
  document.getElementById('workspace').classList.add('active');
  const locked = document.getElementById('lockedCanvas');
  const preview = document.getElementById('previewCanvas');
  const area = document.getElementById('paintarea');
  const targetW = 560, targetH = Math.round(560 * b.h / b.w);
  area.style.height = targetH + 'px';
  [locked, preview].forEach(c => { c.width = targetW; c.height = targetH; });
  const ctx = locked.getContext('2d');
  ctx.clearRect(0,0,targetW,targetH);
  for (const s of (b.strokes||[])) drawStroke(ctx, targetW, targetH, s);
  setupPainting(preview, targetW, targetH, b.id);
}

function setupPainting(canvas, w, h, blockId){
  let drawing = false, points = [];
  const ctx = canvas.getContext('2d');
  function pos(evt){
    const r = canvas.getBoundingClientRect();
    const cx = (evt.touches ? evt.touches[0].clientX : evt.clientX) - r.left;
    const cy = (evt.touches ? evt.touches[0].clientY : evt.clientY) - r.top;
    return [cx / r.width, cy / r.height];
  }
  function start(evt){ drawing = true; points = [pos(evt)]; }
  function move(evt){
    if (!drawing) return;
    points.push(pos(evt));
    ctx.clearRect(0,0,w,h);
    drawStroke(ctx, w, h, { points, color: selectedColor, width: 4 });
    evt.preventDefault();
  }
  function end(){
    if (!drawing) return;
    drawing = false;
    if (points.length > 1){
      ws.send(JSON.stringify({ type:'stroke', blockId, points, color: selectedColor, width: 4 }));
      ws.send(JSON.stringify({ type:'ping', blockId }));
    } else {
      ctx.clearRect(0,0,w,h);
    }
  }
  canvas.onmousedown = start; canvas.onmousemove = move; window.onmouseup = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
}

function renderVotes(votes){
  const el = document.getElementById('voteList');
  el.innerHTML = '';
  const entries = Object.entries(votes || {}).sort((a,b) => b[1].count - a[1].count);
  for (const [name, info] of entries){
    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginBottom = '4px';
    row.innerHTML = '<span style="flex:1;">' + name + ' — ' + info.count + ' votes</span>';
    const btn = document.createElement('button');
    btn.textContent = 'Vote';
    btn.onclick = () => ws.send(JSON.stringify({ type:'voteName', name }));
    row.appendChild(btn);
    el.appendChild(row);
  }
}

// ---- palette ----
const paletteEl = document.getElementById('palette');
COLORS.forEach((c, i) => {
  const sw = document.createElement('div');
  sw.className = 'swatch' + (i===1 ? ' selected' : '');
  sw.style.background = c;
  sw.onclick = () => { selectedColor = c; document.querySelectorAll('.swatch').forEach(s=>s.classList.remove('selected')); sw.classList.add('selected'); };
  paletteEl.appendChild(sw);
});

// ---- controls ----
document.getElementById('joinBtn').onclick = () => ws.send(JSON.stringify({ type:'joinQueue' }));
document.getElementById('finishBtn').onclick = () => { if (myBlockId) ws.send(JSON.stringify({ type:'finishBlock', blockId: myBlockId })); };
document.getElementById('submitNameBtn').onclick = () => {
  const v = document.getElementById('nameInput').value;
  if (v) ws.send(JSON.stringify({ type:'submitName', name: v }));
  document.getElementById('nameInput').value = '';
};
document.getElementById('stillHereBtn').onclick = () => {
  document.getElementById('checkinModal').classList.remove('show');
  if (myBlockId) ws.send(JSON.stringify({ type:'ping', blockId: myBlockId }));
};

// ---- name entry gate ----
if (!myName){
  document.getElementById('nameModal').classList.add('show');
  document.getElementById('enterBtn').onclick = () => {
    const v = document.getElementById('nameEntry').value.trim();
    myName = v || 'Guest';
    localStorage.setItem('tilehive_name', myName);
    document.getElementById('nameModal').classList.remove('show');
    connect();
  };
} else {
  connect();
}
</script>
</body>
</html>`;
