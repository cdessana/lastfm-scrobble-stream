/**
 * Types and schemas for the Last.fm Data Collector & Kafka Producer
 * Keeps raw Last.fm API models strictly separate from Kafka event models.
 */

// ==========================================
// 1. Raw Last.fm Audioscrobbler API Models
// ==========================================

export interface LastFmImageRaw {
  '#text': string;
  size: 'small' | 'medium' | 'large' | 'extralarge' | '';
}

export interface LastFmDateRaw {
  uts: string;
  '#text': string;
}

export interface LastFmArtistRaw {
  mbid?: string;
  '#text'?: string;
  name?: string;
  url?: string;
}

export interface LastFmAlbumRaw {
  mbid?: string;
  '#text'?: string;
}

export interface LastFmTrackRaw {
  name: string;
  artist: LastFmArtistRaw | { name: string; mbid?: string; url?: string };
  album?: LastFmAlbumRaw;
  url: string;
  image?: LastFmImageRaw[];
  date?: LastFmDateRaw;
  '@attr'?: {
    nowplaying?: string;
  };
  mbid?: string;
  loved?: string;
  streamable?: string;
}

export interface LastFmRecentTracksResponse {
  recenttracks?: {
    track: LastFmTrackRaw | LastFmTrackRaw[];
    '@attr'?: {
      user: string;
      page: string;
      perPage: string;
      totalPages: string;
      total: string;
    };
  };
  error?: number;
  message?: string;
}

export interface LastFmUserRaw {
  name: string;
  realname?: string;
  url: string;
  image?: LastFmImageRaw[];
  country?: string;
  age?: string;
  gender?: string;
  subscriber?: string;
  playcount?: string;
  playlists?: string;
  registered?: {
    uts: string;
    '#text': number;
  };
}

export interface LastFmUserInfoResponse {
  user?: LastFmUserRaw;
  error?: number;
  message?: string;
}

// ==========================================
// 2. Kafka Event Models (Separate from API)
// ==========================================

export type KafkaEventType = 'track.scrobbled' | 'track.now_playing';

export interface KafkaScrobbleEvent {
  /** Unique deterministic identifier for event deduplication */
  eventId: string;
  /** High-level event categorization */
  eventType: KafkaEventType;
  /** Schema specification version */
  eventVersion: '1.0.0';
  /** System identifier of producer */
  source: 'lastfm-collector';
  /** Event occurrence timestamp (ISO-8601) */
  timestamp: string;
  /** Producer ingestion timestamp (ISO-8601) */
  producedAt: string;

  /** Monitored Last.fm user attribution */
  user: {
    username: string;
    profileUrl: string;
    country?: string;
    isSubscriber?: boolean;
  };

  /** Musical track entity metadata */
  track: {
    title: string;
    mbid?: string;
    url: string;
    loved: boolean;
  };

  /** Recording artist entity metadata */
  artist: {
    name: string;
    mbid?: string;
    url: string;
  };

  /** Album release entity metadata */
  album: {
    title: string;
    mbid?: string;
  };

  /** Album / track artwork links */
  images: {
    small?: string;
    medium?: string;
    large?: string;
    extraLarge?: string;
  };

  /** Playback timing context */
  playback: {
    isNowPlaying: boolean;
    scrobbledAtEpochMs: number | null;
    scrobbledAtIso: string | null;
  };

  /** Producer runtime metadata for telemetry & auditing */
  collectorMetadata: {
    collectorInstanceId: string;
    pollCycle: number;
    ingestionLatencyMs: number;
  };
}

export interface KafkaPublishResult {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  key: string;
}

// ==========================================
// 3. Collector & Producer Configuration
// ==========================================

export interface CollectorConfig {
  lastFmApiKey: string;
  monitoredUsers: string[];
  pollIntervalMs: number;
  fetchLimit: number;
  kafka: {
    enabled: boolean;
    bootstrapServers: string[];
    topic: string;
    clientId: string;
    acks: number;
    compression: 'none' | 'gzip' | 'snappy' | 'lz4' | 'zstd';
    securityProtocol?: 'PLAINTEXT' | 'SSL' | 'SASL_PLAINTEXT' | 'SASL_SSL';
    saslMechanism?: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    saslUsername?: string;
    saslPassword?: string;
  };
}

export interface CollectorStatus {
  lastFm: {
    apiKeyConfigured: boolean;
    monitoredUsers: string[];
    pollIntervalMs: number;
    totalPolls: number;
    successfulPolls: number;
    failedPolls: number;
    rateLimitHits: number;
    lastPolledAt: number | null;
    lastError: string | null;
  };
  kafka: {
    enabled: boolean;
    status: 'connected' | 'connecting' | 'disconnected' | 'disabled' | 'error';
    bootstrapServers: string[];
    topic: string;
    clientId: string;
    messagesProduced: number;
    messagesFailed: number;
    lastProducedAt: number | null;
    lastError: string | null;
  };
  events: {
    totalDiscovered: number;
    duplicatesFiltered: number;
    inMemoryBufferCount: number;
  };
}
