// MosaicHour is a Cloudflare Durable Object.
// One instance of this class holds everything about the CURRENT hour's mosaic:
// the grid of blocks, who owns each one, the queue, the naming vote, and the
// hourly reset. Cloudflare guarantees only one copy of this object runs at a
// time and processes messages one at a time, which is what makes the
// "fastest finger" claim race safe without any extra locking code.

// Two mode profiles: Blitz is the always-on, ambient, low-commitment mode —
// the one a brand-new visitor should land in. Long is a scheduled daily
// event (e.g. "The Long Hour, 8pm"), not a standing alternative, so it isn't
// given its own permanent "current" instance the way Blitz is — it gets
// spun up on a schedule using this same profile.
const MODE_PROFILES = {
  blitz: {
    maxPainters: 100,
    blockW: 2, blockH: 1,                 // 2–3 tiles — fast, gestural marks, not deep craft
    inactivityTimeoutMs: 60 * 1000,
    checkinGraceMs: 20 * 1000,
    racePoolSize: 8,
    tickIntervalMs: 5 * 1000,
    signupWindowMs: 45 * 1000,
    hourLengthMs: 10 * 60 * 1000,
    namingWindowMs: 40 * 1000,           // right after lock, not during — there's no spare time mid-round
  },
  long: {
    maxPainters: 100,
    blockW: 5, blockH: 2,                 // 10 tiles — room for real, time-invested craft
    inactivityTimeoutMs: 10 * 60 * 1000,
    checkinGraceMs: 2 * 60 * 1000,
    racePoolSize: 8,
    tickIntervalMs: 15 * 1000,
    signupWindowMs: 5 * 60 * 1000,
    hourLengthMs: 60 * 60 * 1000,
    namingWindowMs: 10 * 60 * 1000,
  },
};
const DEFAULT_MODE = 'blitz'; // the ambient, always-on mode a fresh visitor lands in
const DEFAULT_CONFIG = MODE_PROFILES[DEFAULT_MODE];

// Very small starter list — expand this freely, it's just plain text matching.
const BLOCKED_WORDS = ['badword1', 'badword2'];

export class MosaicHour {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set(); // { ws, userId, name }
    this.ready = this.state.blockConcurrencyWhile(() => this.load());
  }

  async load(requestedMode) {
    const stored = await this.state.storage.get(['modeKey', 'config', 'hour', 'blocks', 'queue', 'users', 'nameVotes', 'stats']);
    // Mode is decided once, the first time this instance is ever used, then
    // persists for its lifetime — "current" is always a Blitz instance,
    // "long-hour" is always Long, nobody can flip one into the other mid-run.
    this.modeKeyPersisted = stored.has('modeKey');
    this.modeKey = stored.get('modeKey') || requestedMode || DEFAULT_MODE;
    this.config = MODE_PROFILES[this.modeKey] || DEFAULT_CONFIG;
    this.hour = stored.get('hour') || this.createNewHour();
    this.blocks = stored.get('blocks') || [];
    this.queue = stored.get('queue') || [];
    this.users = stored.get('users') || {};
    this.nameVotes = stored.get('nameVotes') || {};
    // Real, honestly-scoped stats for THIS room (Blitz and Long each count
    // their own) — never fabricated. allTimeUserCount counts unique people
    // who have ever said hello here; countries comes straight from
    // Cloudflare's own geolocation on each new visitor's first request.
    this.stats = stored.get('stats') || { allTimeUserCount: 0, countries: {}, archiveCount: 0 };
    const existingAlarm = await this.state.storage.getAlarm();
    if (existingAlarm == null) {
      await this.state.storage.setAlarm(Date.now() + this.config.tickIntervalMs);
    }
  }

  createNewHour() {
    const startedAt = Date.now();
    return {
      id: crypto.randomUUID(),
      startedAt,
      signupEndsAt: startedAt + this.config?.signupWindowMs ?? DEFAULT_CONFIG.signupWindowMs,
      endsAt: startedAt + (this.config?.hourLengthMs ?? DEFAULT_CONFIG.hourLengthMs),
      headcount: 0,
      locked: false,
    };
  }

  async persist(...keys) {
    const map = {};
    for (const k of keys) map[k] = this[k];
    await this.state.storage.put(map);
  }

  // ---------- HTTP / WebSocket entry point ----------

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);

    // A brand-new instance (never persisted a modeKey before) adopts whatever
    // mode its very first caller asked for — this is how the Worker tells a
    // fresh Durable Object "you're a Blitz room" vs "you're the Long Hour."
    if (!this.modeKeyPersisted) {
      const requestedMode = url.searchParams.get('mode');
      if (requestedMode && MODE_PROFILES[requestedMode]) {
        this.modeKey = requestedMode;
        this.config = MODE_PROFILES[requestedMode];
        this.hour = this.createNewHour();
      }
      await this.state.storage.put('modeKey', this.modeKey);
      this.modeKeyPersisted = true;
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 400 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // Cloudflare attaches real geolocation to every request for free —
      // no IP lookups or extra services needed for honest country stats.
      const country = (request.cf && request.cf.country) || 'XX';
      this.handleSession(server, country);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/archive') {
      const archive = (await this.state.storage.get('archive')) || [];
      return new Response(JSON.stringify(archive), { headers: { 'content-type': 'application/json' } });
    }

    return new Response('not found', { status: 404 });
  }

  handleSession(ws, country) {
    ws.accept();
    const session = { ws, userId: null, name: null, country: country || 'XX' };
    this.sessions.add(session);

    ws.addEventListener('message', async (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        await this.handleMessage(session, msg);
      } catch (err) {
        try { session.ws.send(JSON.stringify({ type: 'error', message: String(err) })); } catch (e) {}
      }
    });
    ws.addEventListener('close', () => this.sessions.delete(session));
    ws.addEventListener('error', () => this.sessions.delete(session));
  }

  // ---------- Message handling ----------

  async handleMessage(session, msg) {
    switch (msg.type) {
      case 'hello': {
        session.userId = msg.userId || crypto.randomUUID();
        session.name = String(msg.name || 'Guest').slice(0, 24);
        const isNewUser = !this.users[session.userId];
        this.users[session.userId] = this.users[session.userId] || { name: session.name, isVip: !!msg.isVip };
        this.users[session.userId].name = session.name;
        if (msg.isVip !== undefined) this.users[session.userId].isVip = !!msg.isVip;
        if (isNewUser) {
          this.stats.allTimeUserCount++;
          this.stats.countries[session.country] = (this.stats.countries[session.country] || 0) + 1;
          await this.persist('stats');
        }
        await this.persist('users');
        session.ws.send(JSON.stringify({ type: 'welcome', userId: session.userId }));
        this.sendStateTo(session);
        break;
      }
      case 'joinQueue': {
        this.enqueue(session.userId);
        await this.tryAssignBlocks();
        await this.persist('queue', 'blocks', 'hour');
        this.broadcastState();
        this.notifyQueuePositions();
        break;
      }
      case 'claimBlock': {
        await this.tryClaim(session.userId, msg.blockId);
        break;
      }
      case 'stroke': {
        this.applyStroke(session.userId, msg);
        break;
      }
      case 'undo': {
        await this.undoLast(session.userId, msg.blockId);
        break;
      }
      case 'ping': {
        const block = this.blocks.find(b => b.id === msg.blockId && b.ownerId === session.userId);
        if (block) { block.lastActivity = Date.now(); block.checkinSentAt = null; }
        break;
      }
      case 'finishBlock': {
        await this.lockBlock(msg.blockId, 'finished');
        break;
      }
      case 'submitName': {
        this.submitName(session.userId, msg.name);
        await this.persist('nameVotes');
        this.broadcastState();
        break;
      }
      case 'voteName': {
        this.voteName(session.userId, msg.name);
        await this.persist('nameVotes');
        this.broadcastState();
        break;
      }
    }
  }

  // ---------- Queue & block allocation ----------

  enqueue(userId) {
    if (this.queue.some(q => q.userId === userId)) return;
    const entry = { userId, joinedAt: Date.now() };
    if (this.users[userId]?.isVip) {
      const idx = this.queue.findIndex(q => !this.users[q.userId]?.isVip);
      if (idx === -1) this.queue.push(entry); else this.queue.splice(idx, 0, entry);
    } else {
      this.queue.push(entry);
    }
  }

  notifyQueuePositions() {
    this.queue.forEach((entry, idx) => {
      this.sendToUser(entry.userId, { type: 'queuePosition', position: idx + 1, total: this.queue.length });
    });
  }

  async tryAssignBlocks() {
    // During the 5-minute signup window, every new arrival gets an immediate
    // block until we hit the configured cap. This IS the "measure headcount"
    // mechanism from Section 3.1 — headcount ends up being however many
    // people actually showed up, capped at maxPainters.
    while (this.queue.length > 0) {
      const now = Date.now();
      const withinSignup = now < this.hour.signupEndsAt && !this.hour.locked;
      if (withinSignup && this.hour.headcount < this.config.maxPainters) {
        const entry = this.queue.shift();
        this.createBlockFor(entry.userId);
        this.hour.headcount++;
      } else {
        break;
      }
    }
  }

  createBlockFor(userId) {
    const index = this.blocks.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(this.config.maxPainters)));
    const col = index % cols;
    const row = Math.floor(index / cols);
    const block = {
      id: crypto.randomUUID(),
      col, row,
      w: this.config.blockW, h: this.config.blockH,
      ownerId: userId,
      ownerName: this.users[userId]?.name || 'Guest',
      strokes: [],
      status: 'open',
      lastActivity: Date.now(),
      checkinSentAt: null,
    };
    this.blocks.push(block);
    if (this.users[userId]) this.users[userId].contributedHour = this.hour.id;
    this.broadcast({ type: 'blockAssigned', blockId: block.id, ownerId: userId, ownerName: block.ownerName, col, row, w: block.w, h: block.h });
    return block;
  }

  offerBlockToQueue(block) {
    if (this.queue.length === 0) return;
    block.status = 'offered';
    const pool = this.queue.slice(0, this.config.racePoolSize).map(q => q.userId);
    block.offerPool = pool;
    for (const userId of pool) {
      this.sendToUser(userId, { type: 'blockOpen', blockId: block.id });
    }
  }

  async tryClaim(userId, blockId) {
    const block = this.blocks.find(b => b.id === blockId);
    if (!block || block.status !== 'offered' || !block.offerPool?.includes(userId)) {
      this.sendToUser(userId, { type: 'claimFailed', blockId });
      return;
    }
    // Because the Durable Object processes one message at a time, whichever
    // claim message arrives first simply wins here — that's the entire
    // "fastest finger" mechanism, no extra locking required.
    block.status = 'open';
    block.ownerId = userId;
    block.ownerName = this.users[userId]?.name || 'Guest';
    block.strokes = [];
    block.lastActivity = Date.now();
    block.offerPool = null;
    if (this.users[userId]) this.users[userId].contributedHour = this.hour.id;
    this.queue = this.queue.filter(q => q.userId !== userId);
    await this.persist('blocks', 'queue');
    this.broadcast({ type: 'blockAssigned', blockId, ownerId: userId, ownerName: block.ownerName, col: block.col, row: block.row, w: block.w, h: block.h });
    this.notifyQueuePositions();
  }

  // ---------- Painting ----------

  applyStroke(userId, msg) {
    const block = this.blocks.find(b => b.id === msg.blockId);
    if (!block || block.ownerId !== userId || block.status !== 'open') return;
    // kind: 'line' (a brush/eraser stroke with points) or 'fill' (wash the whole block one color)
    const op = msg.kind === 'fill'
      ? { kind: 'fill', color: msg.color }
      : { kind: 'line', points: msg.points, color: msg.color, width: msg.width };
    block.strokes.push(op);
    block.lastActivity = Date.now();
    block.checkinSentAt = null;
    this.broadcast({ type: 'strokeAdded', blockId: block.id, op });
    if (block.strokes.length % 15 === 0) this.persist('blocks');
  }

  async undoLast(userId, blockId) {
    const block = this.blocks.find(b => b.id === blockId);
    if (!block || block.ownerId !== userId || block.status !== 'open') return;
    block.strokes.pop();
    block.lastActivity = Date.now();
    await this.persist('blocks');
    this.broadcast({ type: 'blockRepainted', blockId: block.id, strokes: block.strokes });
  }

  async lockBlock(blockId, reason) {
    const block = this.blocks.find(b => b.id === blockId);
    if (!block || block.status === 'locked') return;
    block.status = 'locked';
    block.lockedReason = reason;
    await this.persist('blocks');
    this.broadcast({ type: 'blockLocked', blockId });
  }

  // ---------- Naming vote (Section 3.10) ----------
  // Naming only opens in the final stretch of the hour — voting on a name
  // for a mosaic nobody's seen yet doesn't give people anything real to judge.

  isNamingOpen() {
    return Date.now() >= this.hour.endsAt - this.config.namingWindowMs;
  }

  submitName(userId, rawName) {
    if (!this.isNamingOpen()) return;
    const name = String(rawName || '').trim().slice(0, 40);
    if (!name) return;
    if (this.users[userId]?.contributedHour !== this.hour.id) return; // must have painted this hour
    const lower = name.toLowerCase();
    if (BLOCKED_WORDS.some(w => lower.includes(w))) return;
    if (!this.nameVotes[name]) {
      this.nameVotes[name] = { count: 0, submittedBy: userId, submittedAt: Date.now(), voters: [] };
    }
  }

  voteName(userId, name) {
    if (!this.isNamingOpen()) return;
    if (!this.nameVotes[name]) return;
    if (this.users[userId]?.contributedHour !== this.hour.id) return;
    for (const info of Object.values(this.nameVotes)) {
      const i = info.voters.indexOf(userId);
      if (i !== -1) { info.voters.splice(i, 1); info.count--; }
    }
    this.nameVotes[name].voters.push(userId);
    this.nameVotes[name].count++;
  }

  // ---------- Alarm: periodic inactivity checks + the hourly reset ----------

  async alarm() {
    await this.ready;
    const now = Date.now();

    if (!this.hour.locked && now >= this.hour.signupEndsAt) {
      this.hour.locked = true;
    }

    if (now >= this.hour.endsAt) {
      await this.performHourlyReset();
    } else {
      await this.checkInactiveBlocks(now);
    }

    await this.persist('hour', 'blocks', 'queue');
    await this.state.storage.setAlarm(Date.now() + this.config.tickIntervalMs);
  }

  async checkInactiveBlocks(now) {
    for (const block of this.blocks) {
      if (block.status !== 'open') continue;
      const idleFor = now - block.lastActivity;
      if (!block.checkinSentAt && idleFor > this.config.inactivityTimeoutMs) {
        block.checkinSentAt = now;
        this.sendToUser(block.ownerId, { type: 'checkin', blockId: block.id });
      } else if (block.checkinSentAt && (now - block.checkinSentAt) > this.config.checkinGraceMs) {
        block.status = 'unclaimed';
        block.ownerId = null;
        block.ownerName = null;
        block.strokes = [];
        block.checkinSentAt = null;
        this.broadcast({ type: 'blockReleased', blockId: block.id });
        this.offerBlockToQueue(block);
      }
    }
  }

  async performHourlyReset() {
    let winningName = null, topVotes = -1, topSubmittedAt = Infinity;
    for (const [name, info] of Object.entries(this.nameVotes)) {
      if (info.count > topVotes || (info.count === topVotes && info.submittedAt < topSubmittedAt)) {
        winningName = name; topVotes = info.count; topSubmittedAt = info.submittedAt;
      }
    }
    const archived = {
      id: this.hour.id,
      startedAt: this.hour.startedAt,
      endedAt: Date.now(),
      name: winningName || `Mosaic — ${new Date(this.hour.startedAt).toISOString()}`,
      blocks: this.blocks,
      headcount: this.hour.headcount,
    };
    let archive = (await this.state.storage.get('archive')) || [];
    archive.unshift(archived);
    archive = archive.slice(0, 200);
    await this.state.storage.put('archive', archive);
    this.stats.archiveCount++;
    await this.persist('stats');

    this.hour = this.createNewHour();
    this.blocks = [];
    this.nameVotes = {};
    await this.tryAssignBlocks();
    this.broadcast({ type: 'mosaicReset', hour: this.hour });
    this.broadcastState();
    this.notifyQueuePositions();
  }

  // ---------- Broadcasting ----------

  snapshotState() {
    return {
      type: 'state',
      hour: this.hour,
      config: this.config,
      blocks: this.blocks,
      queueLength: this.queue.length,
      nameVotes: this.nameVotes,
      namingOpen: this.isNamingOpen(),
      stats: {
        allTimeUserCount: this.stats.allTimeUserCount,
        countryCount: Object.keys(this.stats.countries).length,
        archiveCount: this.stats.archiveCount,
      },
      modeKey: this.modeKey,
    };
  }

  sendStateTo(session) { session.ws.send(JSON.stringify(this.snapshotState())); }
  broadcastState() { this.broadcast(this.snapshotState()); }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const s of this.sessions) {
      try { s.ws.send(data); } catch (e) { this.sessions.delete(s); }
    }
  }

  sendToUser(userId, msg) {
    const data = JSON.stringify(msg);
    for (const s of this.sessions) {
      if (s.userId === userId) { try { s.ws.send(data); } catch (e) {} }
    }
  }
}
