import { MosaicHour } from './mosaic.js';
export { MosaicHour };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // "current" is always the Blitz room — the always-on, low-commitment
    // mode a brand-new visitor lands in. "long-hour" is the scheduled daily
    // event and only matters while it's actually running.
    if (url.pathname === '/ws' || url.pathname === '/archive') {
      const wantsLong = url.searchParams.get('mode') === 'long';
      const id = env.MOSAIC.idFromName(wantsLong ? 'long-hour' : 'current');
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
    --paper:#FBFAF7; --ink:#1A1611; --muted:#6B6B70; --line:#E3E0D8; --panel:#F3F1EB;
    --indigo:#35406B; --amber:#C98A2C; --cream:#F4EFE6;
    --serif: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
    --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  }
  *{box-sizing:border-box;}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);}

  header{background:var(--ink);color:var(--cream);display:flex;justify-content:space-between;align-items:center;padding:16px 24px;}
  header .word{font-family:var(--serif);font-size:20px;}
  header .meta{font-size:12.5px;color:#C9C1B2;display:flex;gap:18px;}
  header .meta b{color:var(--amber);font-weight:600;}

  main{padding:24px;max-width:1100px;margin:0 auto;}
  button{font-family:var(--sans);cursor:pointer;border:1px solid var(--indigo);background:#fff;color:var(--indigo);padding:9px 16px;font-size:13.5px;}
  button.primary{background:var(--indigo);color:#fff;}
  button.active{background:var(--indigo);color:#fff;}
  button:disabled{opacity:.4;cursor:default;}
  .panel{background:var(--panel);border:1px solid var(--line);padding:16px;margin-bottom:20px;}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}

  h2.hero-h{font-family:var(--serif);font-size:24px;margin:0 0 4px 0;}
  .subtle{font-size:13px;color:var(--muted);margin:0 0 14px 0;}

  #mosaic{display:grid;gap:0;margin-bottom:14px;border:1px solid var(--line);}
  #mosaic canvas{width:100%;height:100%;background:#fff;display:block;}
  .cellwrap{position:relative;}
  .cellwrap.mine::after{content:"";position:absolute;inset:0;outline:2px dashed var(--indigo);outline-offset:-2px;pointer-events:none;z-index:2;}
  .ownerlabel{position:absolute;bottom:2px;left:2px;font-size:9px;background:rgba(255,255,255,.8);padding:0 3px;color:var(--muted);}
  .navlink{color:#C9C1B2;text-decoration:none;font-size:12.5px;cursor:pointer;margin-right:14px;}
  .page{display:none;} .page.active{display:block;}
  .archGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:14px;}
  .archCard{background:var(--panel);border:1px solid var(--line);padding:12px;cursor:pointer;}
  .chip{display:inline-block;background:#fff;border:1px solid var(--line);padding:3px 10px;border-radius:12px;font-size:12px;margin:2px;}
  .statCards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:16px 0;}
  .statCard{background:var(--panel);border:1px solid var(--line);padding:18px;}
  .statCard .num{font-family:var(--serif);font-size:32px;color:var(--indigo);}
  .statCard .lbl{font-size:12px;color:var(--muted);}
  .barrow{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:13px;}
  .barrow .bar{background:var(--indigo);height:12px;}

  .join-bar{display:flex;justify-content:space-between;align-items:center;border:1px solid var(--line);padding:12px 16px;margin-bottom:28px;}
  .join-bar span{font-size:13px;color:var(--muted);}

  #workspace{display:none;margin-bottom:28px;}
  #workspace.active{display:block;}
  .paintarea{position:relative;border:1.5px solid var(--ink);width:100%;max-width:560px;}
  .paintarea canvas{position:absolute;top:0;left:0;width:100%;height:100%;}
  .palette{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;max-width:280px;margin:10px 0;}
  .swatch{width:28px;height:28px;border:2px solid transparent;cursor:pointer;}
  .swatch.selected{border-color:var(--ink);}
  .tools{display:flex;gap:8px;margin-bottom:10px;}

  #namingSection.locked{color:var(--muted);font-size:13.5px;}

  #nameModal,#checkinModal{display:none;position:fixed;inset:0;background:rgba(20,18,15,0.5);align-items:center;justify-content:center;z-index:10;}
  #nameModal.show,#checkinModal.show{display:flex;}
  .modalbox{background:#fff;padding:26px;max-width:360px;width:90%;}
  .modalbox input{width:100%;padding:10px;border:1px solid var(--line);font-size:14px;margin:10px 0;}

  #offerBanner{display:none;background:var(--amber);color:#fff;padding:10px 16px;text-align:center;font-size:14px;margin-bottom:16px;cursor:pointer;}
  #offerBanner.show{display:block;}
</style>
</head>
<body>

<header>
  <span class="word" style="cursor:pointer;" onclick="showPage('live')">Tilehive</span>
  <div class="meta">
    <a class="navlink" onclick="showPage('archive')">Archive</a>
    <a class="navlink" onclick="showPage('stats')">Stats</a>
    <a class="navlink" onclick="showPage('profile')">Profile</a>
    <button id="modeBlitz" class="active" style="padding:4px 10px;">Blitz</button>
    <button id="modeLong" style="padding:4px 10px;">Long Hour</button>
    <span><b id="paintingCount">0</b> painting now</span>
    <span><b id="queueCount">0</b> waiting</span>
    <span id="statusLine">connecting...</span>
  </div>
</header>

<div id="offerBanner"></div>

<div id="statsBar" style="background:#241F19;color:#C9C1B2;padding:10px 24px;font-size:12.5px;display:flex;gap:28px;flex-wrap:wrap;">
  <span><b id="statUsers" style="color:var(--amber);">0</b> people have painted in this room</span>
  <span><b id="statCountries" style="color:var(--amber);">0</b> countries represented here</span>
  <span><b id="statArchive" style="color:var(--amber);">0</b> mosaics archived from this room</span>
</div>

<main>
<div class="page active" id="page-live">
  <section>
    <h2 class="hero-h">The hive right now</h2>
    <p class="subtle" id="hourSubtitle">Sizing this hour...</p>
    <div id="mosaic"></div>
    <div class="join-bar">
      <button class="primary" id="joinBtn">Join queue</button>
      <span id="queueInfo"></span>
    </div>
  </section>

  <section id="workspace">
    <h2 class="hero-h">Your block</h2>
    <div class="paintarea" id="paintarea">
      <canvas id="lockedCanvas"></canvas>
      <canvas id="previewCanvas"></canvas>
    </div>
    <div class="tools">
      <button class="active" id="toolBrush">Brush</button>
      <button id="toolEraser">Eraser</button>
      <button id="toolFill">Fill background</button>
      <button id="undoBtn">Undo</button>
    </div>
    <div class="row" style="margin-bottom:10px;">
      <span style="font-size:12.5px;color:var(--muted);">Brush size</span>
      <button class="active" id="sizeSmall">Small</button>
      <button id="sizeMedium">Medium</button>
      <button id="sizeLarge">Large</button>
    </div>
    <div class="palette" id="palette"></div>
    <div class="row">
      <button id="finishBtn">Finish &amp; lock</button>
    </div>
  </section>

  <section class="panel" id="namingSection">
    <b style="font-family:var(--serif);font-size:16px;">Name this mosaic</b>
    <div id="namingBody"></div>
  </section>
  <p style="text-align:center;"><a class="navlink" style="color:var(--indigo);" onclick="showPage('terms')">Terms of Use &amp; Privacy</a></p>
</div>

<div class="page" id="page-archive">
  <h2 class="hero-h">Archive</h2>
  <p class="subtle">Every past hour from this room — browse freely, no sign-in needed to look.</p>
  <div class="archGrid" id="archGrid"></div>
</div>

<div class="page" id="page-archiveDetail">
  <a class="navlink" style="color:var(--indigo);" onclick="showPage('archive')">← Back to archive</a>
  <h2 class="hero-h" id="detailName" style="margin-top:10px;">—</h2>
  <p class="subtle" id="detailMeta"></p>
  <div id="detailMosaic" style="display:grid;gap:0;border:1px solid var(--line);margin-bottom:12px;"></div>
  <div class="row">
    <button id="likeBtn">♡ Like</button>
    <button id="shareBtn">Share</button>
    <button class="primary" id="downloadBtn">Download</button>
  </div>
  <div class="panel" style="margin-top:16px;">
    <b>Painted by</b>
    <div id="collabChips" style="margin-top:8px;"></div>
  </div>
</div>

<div class="page" id="page-stats">
  <h2 class="hero-h">Stats — this room</h2>
  <p class="subtle">Real numbers, this room only — Blitz and Long Hour each keep their own.</p>
  <div class="statCards">
    <div class="statCard"><div class="num" id="bigStatUsers">0</div><div class="lbl">People who've painted here</div></div>
    <div class="statCard"><div class="num" id="bigStatCountries">0</div><div class="lbl">Countries represented</div></div>
    <div class="statCard"><div class="num" id="bigStatArchive">0</div><div class="lbl">Mosaics archived</div></div>
  </div>
  <h3 style="font-family:var(--serif);font-size:16px;">By country</h3>
  <div id="countryBars"></div>
</div>

<div class="page" id="page-profile">
  <h2 class="hero-h" id="profileName">—</h2>
  <div class="panel">🏆 <b>Naming vote wins:</b> <span id="profWins">0</span> &nbsp;·&nbsp; <b>Votes received on your suggestions:</b> <span id="profVotes">0</span></div>
  <h3 style="font-family:var(--serif);font-size:16px;">Your contributions</h3>
  <div id="profContribs"></div>
</div>

<div class="page" id="page-terms">
  <h2 class="hero-h">Terms of Use &amp; Privacy</h2>
  <div class="panel" style="border-left:3px solid var(--amber);color:var(--muted);font-size:13px;">Placeholder copy — the real version needs an actual lawyer before launch.</div>
  <p class="subtle" style="max-width:70ch;"><b style="color:var(--ink);">Painting here is public.</b> Anything you paint becomes part of that hour's permanent, public mosaic once your block locks.</p>
  <p class="subtle" style="max-width:70ch;"><b style="color:var(--ink);">The license you grant us.</b> You give Tilehive the right to display, reproduce, archive, and use the mosaic — including your contribution — in prints, marketing, or a future licensing deal.</p>
  <p class="subtle" style="max-width:70ch;"><b style="color:var(--ink);">Privacy, briefly.</b> No password is stored by Tilehive for name-based sign-in; real OAuth sign-in is coming.</p>
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
const blocks = new Map();
let selectedColor = COLORS[1];
let activeTool = 'brush'; // 'brush' | 'eraser' | 'fill'
let brushWidth = 3;
let myQueuePosition = null;
let vipDebug = false;

userId = localStorage.getItem('tilehive_uid');
if (!userId) { userId = crypto.randomUUID(); localStorage.setItem('tilehive_uid', userId); }
myName = localStorage.getItem('tilehive_name');

function statusLine(t){ document.getElementById('statusLine').textContent = t; }

// Blitz is the always-on room everyone lands in by default; Long only
// exists while it's actually running as a scheduled event. Switching modes
// means reconnecting to a different room entirely, not a setting on this one.
let currentMode = 'blitz';
function connect(mode){
  if (mode) currentMode = mode;
  if (ws) { ws.onclose = null; ws.close(); }
  myBlockId = null; myQueuePosition = null;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const qs = currentMode === 'long' ? '?mode=long' : '';
  ws = new WebSocket(proto + '://' + location.host + '/ws' + qs);
  ws.onopen = () => {
    statusLine('connected — ' + currentMode);
    ws.send(JSON.stringify({ type:'hello', userId, name: myName || 'Guest', isVip: vipDebug }));
  };
  ws.onclose = () => { statusLine('disconnected — retrying...'); setTimeout(() => connect(), 1500); };
  ws.onmessage = (evt) => handleMessage(JSON.parse(evt.data));
}

function handleMessage(msg){
  if (msg.type === 'welcome') { userId = msg.userId; }
  else if (msg.type === 'state') { applyState(msg); }
  else if (msg.type === 'blockAssigned') { onBlockAssigned(msg); }
  else if (msg.type === 'blockLocked') { onBlockLocked(msg.blockId); }
  else if (msg.type === 'blockReleased') { onBlockLocked(msg.blockId); }
  else if (msg.type === 'strokeAdded') { onStroke(msg); }
  else if (msg.type === 'blockRepainted') { onRepainted(msg); }
  else if (msg.type === 'blockOpen') { showOffer(msg.blockId); }
  else if (msg.type === 'queuePosition') { myQueuePosition = msg.position; updateQueueInfo(msg.total); }
  else if (msg.type === 'claimFailed') { statusLine('someone else was faster — still in queue'); }
  else if (msg.type === 'checkin') { if (msg.blockId === myBlockId) document.getElementById('checkinModal').classList.add('show'); }
  else if (msg.type === 'mosaicReset') { myBlockId = null; myQueuePosition = null; document.getElementById('workspace').classList.remove('active'); }
  else if (msg.type === 'archiveList') { renderArchiveGallery(msg.items); }
  else if (msg.type === 'archiveDetail') { renderArchiveDetail(msg.item); }
  else if (msg.type === 'profileData') { renderProfile(msg); }
}

// ---- page navigation ----
function showPage(name){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (name === 'archive') ws.send(JSON.stringify({ type:'getArchive' }));
  if (name === 'profile') {
    if (!myName){
      document.getElementById('profileName').textContent = 'Not signed in yet';
      document.getElementById('profContribs').innerHTML = '<p class="subtle">Join the queue once to create a profile.</p>';
      return;
    }
    document.getElementById('profileName').textContent = myName;
    ws.send(JSON.stringify({ type:'getProfile' }));
  }
}

function renderArchiveGallery(items){
  const el = document.getElementById('archGrid');
  if (!items.length){ el.innerHTML = '<p class="subtle">Nothing archived from this room yet — come back after the first hour finishes.</p>'; return; }
  el.innerHTML = items.map(a =>
    '<div class="archCard" onclick="openArchiveDetail(\''+a.id+'\')"><b style="font-family:var(--serif);">'+a.name+'</b>'+
    '<p style="font-size:12px;color:var(--muted);margin:4px 0 0 0;">'+new Date(a.startedAt).toLocaleString()+' · '+a.headcount+' painters · '+a.likes+' ♡</p></div>'
  ).join('');
}
function openArchiveDetail(id){
  currentArchiveId = id;
  showPage('archiveDetail');
  ws.send(JSON.stringify({ type:'getArchiveDetail', id }));
}
let currentArchiveId = null;
let currentArchiveItem = null;

function renderArchiveDetail(item){
  if (!item) { document.getElementById('detailName').textContent = 'Not found'; return; }
  currentArchiveItem = item;
  document.getElementById('detailName').textContent = item.name;
  document.getElementById('detailMeta').textContent = new Date(item.startedAt).toLocaleString() + ' · ' + item.headcount + ' painters';
  const cols = Math.max(1, Math.ceil(Math.sqrt(100)));
  const grid = document.getElementById('detailMosaic');
  grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
  grid.innerHTML = '';
  const names = new Set();
  for (const b of item.blocks){
    const canvas = document.createElement('canvas');
    canvas.width = b.w*60; canvas.height = b.h*60;
    canvas.style.width = '100%'; canvas.style.display = 'block';
    grid.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    for (const op of (b.strokes||[])) drawOp(ctx, canvas.width, canvas.height, op);
    if (b.ownerName) names.add(b.ownerName);
  }
  document.getElementById('collabChips').innerHTML = [...names].map(n => '<span class="chip">'+n+'</span>').join('') || '<span class="subtle">Nobody painted here.</span>';
  document.getElementById('likeBtn').textContent = '♡ Like (' + (item.likes||0) + ')';
}
document.getElementById('likeBtn').onclick = () => {
  if (!myName){ alert('Join the queue once first to set a name, then you can like mosaics.'); return; }
  ws.send(JSON.stringify({ type:'likeArchive', id: currentArchiveId }));
};
document.getElementById('shareBtn').onclick = () => {
  const url = location.href.split('#')[0] + '#' + currentArchiveId;
  navigator.clipboard?.writeText(url);
  alert('Link copied: ' + url);
};
document.getElementById('downloadBtn').onclick = () => {
  if (!currentArchiveItem) return;
  const cols = Math.max(1, Math.ceil(Math.sqrt(100)));
  const rows = Math.ceil(currentArchiveItem.blocks.length / cols);
  const cellPx = 60;
  const big = document.createElement('canvas');
  big.width = cols*cellPx; big.height = rows*cellPx;
  const ctx = big.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,big.width,big.height);
  currentArchiveItem.blocks.forEach((b, i) => {
    const col = i % cols, row = Math.floor(i/cols);
    const ox = col*cellPx, oy = row*cellPx;
    for (const op of (b.strokes||[])){
      ctx.save(); ctx.translate(ox, oy);
      drawOp(ctx, cellPx, cellPx, op);
      ctx.restore();
    }
  });
  const link = document.createElement('a');
  link.download = (currentArchiveItem.name || 'tilehive-mosaic') + '.png';
  link.href = big.toDataURL('image/png');
  link.click();
};

function renderProfile(msg){
  document.getElementById('profWins').textContent = msg.namingWins;
  document.getElementById('profVotes').textContent = msg.votesReceived;
  const el = document.getElementById('profContribs');
  if (!msg.contributions.length){ el.innerHTML = '<p class="subtle">No contributions from this room yet.</p>'; return; }
  el.innerHTML = msg.contributions.map(c =>
    '<div class="row" style="margin-bottom:6px;"><span style="flex:1;">'+c.name+' — '+new Date(c.startedAt).toLocaleDateString()+' — '+c.likes+' likes</span>'+
    '<button onclick="openArchiveDetail(\''+c.id+'\')">View</button></div>'
  ).join('');
}

function renderCountryBars(countries){
  const el = document.getElementById('countryBars');
  if (!el) return;
  const entries = Object.entries(countries||{}).sort((a,b)=>b[1]-a[1]);
  const max = entries.length ? entries[0][1] : 1;
  el.innerHTML = entries.map(([code,count]) =>
    '<div class="barrow"><span style="width:40px;">'+code+'</span><div class="bar" style="width:'+Math.max(8,(count/max)*260)+'px;"></div><span>'+count+'</span></div>'
  ).join('') || '<p class="subtle">Nobody yet.</p>';
}

function updateQueueInfo(total){
  const info = document.getElementById('queueInfo');
  const joinBtn = document.getElementById('joinBtn');
  if (myBlockId){
    info.textContent = 'You have a block — go paint!';
    joinBtn.disabled = true; joinBtn.textContent = 'Join queue';
  } else if (myQueuePosition){
    info.textContent = "You're #" + myQueuePosition + ' in line · ' + total + ' total waiting.';
    joinBtn.disabled = true; joinBtn.textContent = 'In queue...';
  } else {
    joinBtn.disabled = false; joinBtn.textContent = 'Join queue';
  }
}

function applyState(msg){
  hour = msg.hour; config = msg.config;
  const paintingCount = msg.blocks.filter(b => b.status === 'open').length;
  document.getElementById('paintingCount').textContent = paintingCount;
  document.getElementById('queueCount').textContent = msg.queueLength;
  document.getElementById('hourSubtitle').textContent = hour.locked
    ? 'This hour is sized — ' + msg.blocks.length + ' blocks.'
    : 'Sizing this hour from who shows up in the first few minutes...';
  document.getElementById('queueInfo').textContent = msg.queueLength + ' waiting in queue.';
  updateQueueInfo(msg.queueLength);
  renderNaming(msg.nameVotes, msg.namingOpen);
  rebuildGrid(msg.blocks);
  if (msg.stats){
    document.getElementById('statUsers').textContent = msg.stats.allTimeUserCount;
    document.getElementById('statCountries').textContent = msg.stats.countryCount;
    document.getElementById('statArchive').textContent = msg.stats.archiveCount;
    document.getElementById('bigStatUsers').textContent = msg.stats.allTimeUserCount;
    document.getElementById('bigStatCountries').textContent = msg.stats.countryCount;
    document.getElementById('bigStatArchive').textContent = msg.stats.archiveCount;
    renderCountryBars(msg.stats.countries);
  }
}

function renderNaming(votes, open){
  const section = document.getElementById('namingSection');
  const body = document.getElementById('namingBody');
  if (!open){
    section.classList.add('locked');
    body.innerHTML = '<p style="margin:6px 0 0 0;">Naming opens once this hour is mostly painted, so people are voting on something real.</p>';
    return;
  }
  section.classList.remove('locked');
  const entries = Object.entries(votes || {}).sort((a,b) => b[1].count - a[1].count);
  let html = '<div class="row" style="margin:8px 0;"><input id="nameInput" placeholder="Suggest a name" style="padding:8px;border:1px solid var(--line);flex:1;min-width:160px;"><button id="submitNameBtn">Submit</button></div>';
  html += '<div>';
  for (const [name, info] of entries){
    html += '<div class="row" style="margin-bottom:4px;"><span style="flex:1;">'+name+' — '+info.count+' votes</span><button class="votebtn" data-name="'+name+'">Vote</button></div>';
  }
  html += '</div>';
  body.innerHTML = html;
  document.getElementById('submitNameBtn').onclick = () => {
    const v = document.getElementById('nameInput').value;
    if (v) ws.send(JSON.stringify({ type:'submitName', name: v }));
    document.getElementById('nameInput').value = '';
  };
  document.querySelectorAll('.votebtn').forEach(btn => {
    btn.onclick = () => ws.send(JSON.stringify({ type:'voteName', name: btn.dataset.name }));
  });
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
    for (const op of (b.strokes||[])) drawOp(ctx, canvas.width, canvas.height, op);
    blocks.set(b.id, { ...b, canvas, ctx });
    if (b.ownerId === userId && b.status === 'open') openWorkspace(b);
  }
}

function drawOp(ctx, w, h, op){
  if (op.kind === 'fill'){
    ctx.fillStyle = op.color; ctx.fillRect(0,0,w,h);
    return;
  }
  if (!op.points || op.points.length < 2) return;
  ctx.strokeStyle = op.color; ctx.lineWidth = op.width || 4;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  op.points.forEach((p, i) => {
    const x = p[0]*w, y = p[1]*h;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
}

function redrawWholeBlock(blockId, strokes){
  const b = blocks.get(blockId);
  if (b && b.ctx){
    b.ctx.clearRect(0,0,b.canvas.width,b.canvas.height);
    for (const op of strokes) drawOp(b.ctx, b.canvas.width, b.canvas.height, op);
  }
  if (blockId === myBlockId){
    const locked = document.getElementById('lockedCanvas');
    const ctx = locked.getContext('2d');
    ctx.clearRect(0,0,locked.width,locked.height);
    for (const op of strokes) drawOp(ctx, locked.width, locked.height, op);
  }
}

function onBlockAssigned(msg){
  const existing = blocks.get(msg.blockId) || {};
  const merged = { ...existing, id: msg.blockId, ownerId: msg.ownerId, ownerName: msg.ownerName,
    col: msg.col, row: msg.row, w: msg.w||existing.w, h: msg.h||existing.h, status:'open', strokes: [] };
  blocks.set(msg.blockId, merged);
  if (msg.ownerId === userId){
    myBlockId = msg.blockId;
    myQueuePosition = null;
    openWorkspace(merged);
    document.getElementById('offerBanner').classList.remove('show');
    updateQueueInfo(0);
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
  if (b && b.ctx) drawOp(b.ctx, b.canvas.width, b.canvas.height, msg.op);
  if (msg.blockId === myBlockId){
    const locked = document.getElementById('lockedCanvas');
    drawOp(locked.getContext('2d'), locked.width, locked.height, msg.op);
    const preview = document.getElementById('previewCanvas');
    preview.getContext('2d').clearRect(0,0,preview.width,preview.height);
  }
}

function onRepainted(msg){
  redrawWholeBlock(msg.blockId, msg.strokes);
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
  for (const op of (b.strokes||[])) drawOp(ctx, targetW, targetH, op);
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
  function colorForStroke(){ return activeTool === 'eraser' ? '#FFFFFF' : selectedColor; }
  function start(evt){
    if (activeTool === 'fill'){
      ws.send(JSON.stringify({ type:'stroke', blockId, kind:'fill', color: selectedColor }));
      ws.send(JSON.stringify({ type:'ping', blockId }));
      evt.preventDefault();
      return;
    }
    drawing = true; points = [pos(evt)];
  }
  function move(evt){
    if (!drawing) return;
    points.push(pos(evt));
    ctx.clearRect(0,0,w,h);
    drawOp(ctx, w, h, { kind:'line', points, color: colorForStroke(), width: brushWidth });
    evt.preventDefault();
  }
  function end(){
    if (!drawing) return;
    drawing = false;
    if (points.length > 1){
      ws.send(JSON.stringify({ type:'stroke', blockId, kind:'line', points, color: colorForStroke(), width: brushWidth }));
      ws.send(JSON.stringify({ type:'ping', blockId }));
    } else {
      ctx.clearRect(0,0,w,h);
    }
  }
  canvas.onmousedown = start; canvas.onmousemove = move; window.onmouseup = end;
  canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
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

// ---- tools ----
function setTool(name, btn){
  activeTool = name;
  document.querySelectorAll('#toolBrush,#toolEraser,#toolFill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
document.getElementById('toolBrush').onclick = (e) => setTool('brush', e.target);
document.getElementById('toolEraser').onclick = (e) => setTool('eraser', e.target);
document.getElementById('toolFill').onclick = (e) => setTool('fill', e.target);
document.getElementById('undoBtn').onclick = () => { if (myBlockId) ws.send(JSON.stringify({ type:'undo', blockId: myBlockId })); };

function setSize(px, btn){
  brushWidth = px;
  document.querySelectorAll('#sizeSmall,#sizeMedium,#sizeLarge').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
document.getElementById('sizeSmall').onclick = (e) => setSize(3, e.target);
document.getElementById('sizeMedium').onclick = (e) => setSize(6, e.target);
document.getElementById('sizeLarge').onclick = (e) => setSize(11, e.target);

// ---- controls ----
document.getElementById('joinBtn').onclick = () => {
  if (!myName){
    document.getElementById('nameModal').classList.add('show');
    return;
  }
  ws.send(JSON.stringify({ type:'joinQueue' }));
};
document.getElementById('finishBtn').onclick = () => { if (myBlockId) ws.send(JSON.stringify({ type:'finishBlock', blockId: myBlockId })); };
document.getElementById('stillHereBtn').onclick = () => {
  document.getElementById('checkinModal').classList.remove('show');
  if (myBlockId) ws.send(JSON.stringify({ type:'ping', blockId: myBlockId }));
};

// ---- name entry (only needed when you actually try to join) ----
document.getElementById('enterBtn').onclick = () => {
  const v = document.getElementById('nameEntry').value.trim();
  myName = v || 'Guest';
  localStorage.setItem('tilehive_name', myName);
  document.getElementById('nameModal').classList.remove('show');
  ws.send(JSON.stringify({ type:'hello', userId, name: myName, isVip: vipDebug }));
  ws.send(JSON.stringify({ type:'joinQueue' }));
};

document.getElementById('modeBlitz').onclick = () => {
  document.getElementById('modeBlitz').classList.add('active');
  document.getElementById('modeLong').classList.remove('active');
  connect('blitz');
};
document.getElementById('modeLong').onclick = () => {
  document.getElementById('modeLong').classList.add('active');
  document.getElementById('modeBlitz').classList.remove('active');
  connect('long');
};

// Everyone connects immediately so spectators can watch with no sign-in at all.
connect('blitz');
</script>
</body>
</html>`;
