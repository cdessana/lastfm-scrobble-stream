import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import type { Response } from 'express';
import { loadCollectorConfig } from './src/collector/config.js';
import { CollectorEngine } from './src/collector/engine.js';
import { logger } from './src/collector/logger.js';
import type { KafkaScrobbleEvent } from './src/collector/types.js';
import type { ScrobbleItem, StreamStats } from './src/types.js';

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize collector configuration and engine
const config = loadCollectorConfig();
const engine = new CollectorEngine(config);

// In-memory buffer of verified real Last.fm scrobbles
const MAX_BUFFER_SIZE = 250;
const scrobbleBuffer: ScrobbleItem[] = [];
const sseClients = new Set<Response>();
const scrobbleTimestamps: number[] = [];

/**
 * Transforms a verified KafkaScrobbleEvent into the client-facing ScrobbleItem model
 */
function kafkaEventToScrobbleItem(event: KafkaScrobbleEvent): ScrobbleItem {
  const primaryImg =
    event.images.large ||
    event.images.extraLarge ||
    event.images.medium ||
    event.images.small ||
    '';

  const timestamp = event.playback.scrobbledAtEpochMs || Date.now();

  return {
    id: event.eventId,
    trackName: event.track.title,
    artistName: event.artist.name,
    albumName: event.album.title,
    imageUrl: primaryImg,
    nowPlaying: event.playback.isNowPlaying,
    timestamp,
    user: {
      username: event.user.username,
      avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(event.user.username)}`,
      profileUrl: event.user.profileUrl,
      country: event.user.country
    },
    tags: [],
    url: event.track.url,
    loved: event.track.loved,
    kafkaEvent: event
  };
}

// Subscribe to real scrobbles emitted by the collector engine.
// NOTE: scrobbleBuffer operates as an append-only FIFO stream of ingested events.
// Prior "Now Playing" events remain in the raw stream until shifted out by capacity,
// consistent with Kafka append-only topic semantics (see README.md Section 8).
engine.subscribe((kafkaEvent) => {
  const item = kafkaEventToScrobbleItem(kafkaEvent);

  scrobbleBuffer.unshift(item);
  if (scrobbleBuffer.length > MAX_BUFFER_SIZE) {
    scrobbleBuffer.pop();
  }

  scrobbleTimestamps.push(Date.now());
  const oneMinuteAgo = Date.now() - 60000;
  while (scrobbleTimestamps.length > 0 && scrobbleTimestamps[0] < oneMinuteAgo) {
    scrobbleTimestamps.shift();
  }

  const payload = `event: scrobble\ndata: ${JSON.stringify(item)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
});

// ==========================================
// API Routes
// ==========================================

// 1. Health check & basic operational readiness
app.get('/api/health', (req, res) => {
  const status = engine.getStatus();
  res.json({
    status: 'ok',
    liveClients: sseClients.size,
    bufferSize: scrobbleBuffer.length,
    lastFmConfigured: status.lastFm.apiKeyConfigured,
    kafkaEnabled: status.kafka.enabled,
    kafkaStatus: status.kafka.status
  });
});

// 2. Comprehensive Collector & Kafka Producer Status
app.get('/api/collector/status', (req, res) => {
  res.json(engine.getStatus());
});

// 3. Server-Sent Events (SSE) live data stream
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial real backlog (empty if collector just started or no API key)
  res.write(`event: init\ndata: ${JSON.stringify(scrobbleBuffer.slice(0, 50))}\n\n`);

  sseClients.add(res);

  // Send heartbeat ping every 15 seconds to keep connection alive
  const pingTimer = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(pingTimer);
      sseClients.delete(res);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(pingTimer);
    sseClients.delete(res);
  });
});

// 4. Historical query endpoint with multi-criteria filtering
app.get('/api/feed', (req, res) => {
  const { artist, music, tag, nowPlayingOnly, username, limit = '50' } = req.query;
  const max = Math.min(parseInt(limit as string, 10) || 50, 100);

  let results = [...scrobbleBuffer];

  if (artist && typeof artist === 'string') {
    const q = artist.toLowerCase().trim();
    results = results.filter((s) => s.artistName.toLowerCase().includes(q));
  }

  if (music && typeof music === 'string') {
    const q = music.toLowerCase().trim();
    results = results.filter((s) => s.trackName.toLowerCase().includes(q));
  }

  if (tag && typeof tag === 'string') {
    const q = tag.toLowerCase().trim();
    results = results.filter((s) => s.tags.some((t) => t.toLowerCase() === q || t.toLowerCase().includes(q)));
  }

  if (nowPlayingOnly === 'true') {
    results = results.filter((s) => s.nowPlaying);
  }

  if (username && typeof username === 'string') {
    const q = username.toLowerCase().trim();
    results = results.filter((s) => s.user.username.toLowerCase().includes(q));
  }

  res.json({
    items: results.slice(0, max),
    totalMatches: results.length
  });
});

// 5. Collector and stream statistics
app.get('/api/stats', (req, res) => {
  const oneMinuteAgo = Date.now() - 60000;
  const spm = scrobbleTimestamps.filter((t) => t >= oneMinuteAgo).length;

  const collectorStatus = engine.getStatus();

  const tagCounts = new Map<string, number>();
  for (const s of scrobbleBuffer) {
    for (const t of s.tags) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }

  const topGenres = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const stats: StreamStats = {
    totalScrobblesReceived: collectorStatus.events.totalDiscovered,
    scrobblesPerMinute: spm,
    activeUsersCount: collectorStatus.lastFm.monitoredUsers.length,
    connectedClients: sseClients.size,
    isLiveApiConnected: collectorStatus.lastFm.apiKeyConfigured,
    topGenres,
    collectorStatus
  };

  res.json(stats);
});

// 6. Monitored Users API (Real Last.fm Accounts)
app.get('/api/users', (req, res) => {
  const users = engine.getMonitoredUsers().map((username) => {
    const lastItem = scrobbleBuffer.find((s) => s.user.username.toLowerCase() === username.toLowerCase());
    return {
      username,
      addedAt: Date.now(),
      status: 'active',
      currentTrack: lastItem ? `${lastItem.artistName} - ${lastItem.trackName}` : undefined,
      isCustom: true
    };
  });
  res.json({ users });
});

app.post('/api/users', async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    res.status(400).json({ error: 'Valid Last.fm username is required' });
    return;
  }

  try {
    const result = await engine.addUser(username);
    res.status(201).json({
      user: {
        username: result.username,
        addedAt: Date.now(),
        status: 'active',
        verified: result.verified,
        isCustom: true
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

app.delete('/api/users/:username', (req, res) => {
  const target = req.params.username;
  const removed = engine.removeUser(target);
  res.json({ success: removed, remaining: engine.getMonitoredUsers().length });
});

// 7. Popular tags extracted from real scrobbles
app.get('/api/tags', (req, res) => {
  const tagCounts = new Map<string, number>();
  for (const s of scrobbleBuffer) {
    for (const t of s.tags) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }

  const tags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  res.json({ tags });
});

// 8. Artists stream & playback history aggregated strictly from real data
app.get('/api/artists', (req, res) => {
  const { names } = req.query;
  const filterNames = names && typeof names === 'string'
    ? names.split(',').map((n) => n.trim().toLowerCase()).filter(Boolean)
    : [];

  const artistMap = new Map<string, {
    artistName: string;
    totalPlays: number;
    isCurrentlyPlaying: boolean;
    lastPlayedAt: number | null;
    lastPlayedTrack: string | null;
    lastPlayedUser: string | null;
    imageUrl: string;
    tags: string[];
    plays: ScrobbleItem[];
  }>();

  for (const item of scrobbleBuffer) {
    const key = item.artistName.toLowerCase();
    if (filterNames.length > 0 && !filterNames.includes(key)) {
      continue;
    }

    if (!artistMap.has(key)) {
      artistMap.set(key, {
        artistName: item.artistName,
        totalPlays: 0,
        isCurrentlyPlaying: false,
        lastPlayedAt: null,
        lastPlayedTrack: null,
        lastPlayedUser: null,
        imageUrl: item.imageUrl,
        tags: item.tags,
        plays: []
      });
    }

    const entry = artistMap.get(key)!;
    entry.totalPlays++;
    entry.plays.push(item);

    if (item.nowPlaying) {
      entry.isCurrentlyPlaying = true;
    }

    if (entry.lastPlayedAt === null || item.timestamp > entry.lastPlayedAt) {
      entry.lastPlayedAt = item.timestamp;
      entry.lastPlayedTrack = item.trackName;
      entry.lastPlayedUser = item.user.username;
      entry.imageUrl = item.imageUrl;
    }
  }

  const artists = Array.from(artistMap.values()).sort((a, b) => {
    if (a.isCurrentlyPlaying && !b.isCurrentlyPlaying) return -1;
    if (!a.isCurrentlyPlaying && b.isCurrentlyPlaying) return 1;
    return (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0);
  });

  res.json({ artists });
});

// Integrate Vite Middleware
async function startServer() {
  // Start the collector engine
  await engine.start();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Last.fm Data Collector & Kafka Producer running on http://0.0.0.0:${PORT}`);
  });
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down collector...');
  await engine.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down collector...');
  await engine.stop();
  process.exit(0);
});

startServer();
