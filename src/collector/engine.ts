import type {
  CollectorConfig,
  CollectorStatus,
  KafkaScrobbleEvent,
  LastFmTrackRaw,
  LastFmUserRaw
} from './types.js';
import { LastFmClient, LastFmApiError } from './lastfm-client.js';
import { KafkaScrobbleProducer } from './kafka-producer.js';
import { EventDeduplicator } from './deduplicator.js';
import { transformToKafkaEvent, generateEventKey } from './transformer.js';
import { logger } from './logger.js';

export type EventListener = (event: KafkaScrobbleEvent) => void;

export class CollectorEngine {
  private readonly config: CollectorConfig;
  private readonly lastFmClient: LastFmClient;
  private readonly kafkaProducer: KafkaScrobbleProducer;
  private readonly deduplicator: EventDeduplicator;
  private readonly collectorInstanceId: string;
  private readonly monitoredUsers: Set<string>;
  private readonly userMetaCache: Map<string, LastFmUserRaw> = new Map();
  private readonly recentEventsBuffer: KafkaScrobbleEvent[] = [];
  private readonly listeners: Set<EventListener> = new Set();

  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private pollCycle = 0;
  private totalPolls = 0;
  private successfulPolls = 0;
  private failedPolls = 0;
  private rateLimitHits = 0;
  private totalDiscovered = 0;
  private duplicatesFiltered = 0;
  private lastPolledAt: number | null = null;
  private lastError: string | null = null;

  constructor(config: CollectorConfig) {
    this.config = config;
    this.collectorInstanceId = `collector-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    this.lastFmClient = new LastFmClient(config.lastFmApiKey);
    this.kafkaProducer = new KafkaScrobbleProducer(config.kafka);
    this.deduplicator = new EventDeduplicator(10000);
    this.monitoredUsers = new Set(config.monitoredUsers.map((u) => u.trim().toLowerCase()));
  }

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getRecentEvents(limit = 50): KafkaScrobbleEvent[] {
    return this.recentEventsBuffer.slice(0, limit);
  }

  public getMonitoredUsers(): string[] {
    return Array.from(this.monitoredUsers);
  }

  public async addUser(username: string): Promise<{ username: string; verified: boolean }> {
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser) {
      throw new Error('Username cannot be empty');
    }

    if (this.monitoredUsers.has(cleanUser)) {
      return { username: cleanUser, verified: true };
    }

    // Verify user exists on Last.fm if API key is present
    let verified = false;
    if (this.lastFmClient.hasApiKey()) {
      try {
        const info = await this.lastFmClient.getUserInfo(cleanUser);
        if (info) {
          this.userMetaCache.set(cleanUser, info);
          verified = true;
        }
      } catch (err: unknown) {
        if (err instanceof LastFmApiError && err.isNotFound) {
          throw new Error(`Last.fm user "${cleanUser}" does not exist`);
        }
        // If temporary network error, still register
        logger.warn('Could not verify user profile, registering anyway', { user: cleanUser, error: String(err) });
      }
    }

    this.monitoredUsers.add(cleanUser);
    logger.info('Added user to monitored stream pool', { user: cleanUser, totalMonitored: this.monitoredUsers.size });

    // Poll immediately for this user if collector is running
    if (this.isRunning && this.lastFmClient.hasApiKey()) {
      void this.pollUser(cleanUser);
    }

    return { username: cleanUser, verified };
  }

  public removeUser(username: string): boolean {
    const cleanUser = username.trim().toLowerCase();
    const removed = this.monitoredUsers.delete(cleanUser);
    if (removed) {
      this.userMetaCache.delete(cleanUser);
      logger.info('Removed user from monitored stream pool', { user: cleanUser, remaining: this.monitoredUsers.size });
    }
    return removed;
  }

  public getStatus(): CollectorStatus {
    const kafkaStatus = this.kafkaProducer.getStatus();
    return {
      lastFm: {
        apiKeyConfigured: this.lastFmClient.hasApiKey(),
        monitoredUsers: Array.from(this.monitoredUsers),
        pollIntervalMs: this.config.pollIntervalMs,
        totalPolls: this.totalPolls,
        successfulPolls: this.successfulPolls,
        failedPolls: this.failedPolls,
        rateLimitHits: this.rateLimitHits,
        lastPolledAt: this.lastPolledAt,
        lastError: this.lastError
      },
      kafka: {
        enabled: kafkaStatus.enabled,
        status: kafkaStatus.status,
        bootstrapServers: kafkaStatus.bootstrapServers,
        topic: kafkaStatus.topic,
        clientId: kafkaStatus.clientId,
        messagesProduced: kafkaStatus.messagesProduced,
        messagesFailed: kafkaStatus.messagesFailed,
        lastProducedAt: kafkaStatus.lastProducedAt,
        lastError: kafkaStatus.lastError
      },
      events: {
        totalDiscovered: this.totalDiscovered,
        duplicatesFiltered: this.duplicatesFiltered,
        inMemoryBufferCount: this.recentEventsBuffer.length
      }
    };
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('Starting Last.fm Collector Engine', {
      instanceId: this.collectorInstanceId,
      monitoredUsersCount: this.monitoredUsers.size,
      pollIntervalMs: this.config.pollIntervalMs,
      kafkaEnabled: this.config.kafka.enabled
    });

    // Connect Kafka producer if enabled
    if (this.config.kafka.enabled) {
      try {
        await this.kafkaProducer.connect();
      } catch (err) {
        logger.error('Initial Kafka connection failure, will retry on message send', { error: String(err) });
      }
    }

    // Execute first poll cycle immediately
    void this.executePollCycle();

    // Schedule periodic polling
    this.pollTimer = setInterval(() => {
      void this.executePollCycle();
    }, this.config.pollIntervalMs);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    await this.kafkaProducer.disconnect();
    logger.info('Last.fm Collector Engine stopped');
  }

  private async executePollCycle(): Promise<void> {
    this.pollCycle++;
    this.lastPolledAt = Date.now();

    if (!this.lastFmClient.hasApiKey()) {
      this.lastError = 'LASTFM_API_KEY environment variable is not set. Collector is waiting for API key.';
      logger.warn('Last.fm Collector idle: No LASTFM_API_KEY configured');
      return;
    }

    const users = Array.from(this.monitoredUsers);
    if (users.length === 0) {
      logger.debug('No monitored users configured, skipping poll cycle');
      return;
    }

    for (const username of users) {
      if (!this.isRunning) break;
      await this.pollUser(username);
    }
  }

  private async pollUser(username: string): Promise<void> {
    this.totalPolls++;

    try {
      const rawTracks = await this.lastFmClient.getRecentTracks(username, this.config.fetchLimit);
      this.successfulPolls++;
      this.lastError = null;

      // Ensure user metadata is populated in background
      let userMeta = this.userMetaCache.get(username);
      if (!userMeta) {
        // Fetch user metadata asynchronously
        this.lastFmClient.getUserInfo(username).then((info) => {
          if (info) this.userMetaCache.set(username, info);
        }).catch(() => {
          // ignore background user info failure
        });
      }

      // Process raw tracks in reverse chronological order (oldest to newest)
      // so Kafka receives them in strictly ascending time order
      const orderedTracks = [...rawTracks].reverse();

      for (const track of orderedTracks) {
        this.processTrack(username, track, userMeta);
      }
    } catch (err: unknown) {
      this.failedPolls++;
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;

      if (err instanceof LastFmApiError) {
        if (err.isRateLimit) {
          this.rateLimitHits++;
          logger.warn('Rate limit backoff active on Last.fm API', { user: username });
        } else if (err.isNotFound) {
          logger.warn('Monitored user not found on Last.fm, removing from active pool', { user: username });
          this.monitoredUsers.delete(username);
        } else {
          logger.error('Last.fm API call failed during user polling', { user: username, error: msg });
        }
      } else {
        logger.error('Unexpected error polling Last.fm user', { user: username, error: msg });
      }
    }
  }

  private processTrack(
    username: string,
    rawTrack: LastFmTrackRaw,
    userInfo?: LastFmUserRaw
  ) {
    this.totalDiscovered++;

    const { deduplicationKey, isNowPlaying } = generateEventKey(username, rawTrack);
    const artistName = typeof rawTrack.artist === 'string'
      ? rawTrack.artist
      : rawTrack.artist?.name || rawTrack.artist?.['#text'] || '';
    const trackSignature = `${artistName.toLowerCase()}:${(rawTrack.name || '').toLowerCase()}`;

    // Deduplication check
    const isDup = this.deduplicator.isDuplicate(
      username,
      deduplicationKey,
      isNowPlaying,
      trackSignature
    );

    if (isDup) {
      this.duplicatesFiltered++;
      return;
    }

    // Transform into clean KafkaScrobbleEvent
    const kafkaEvent = transformToKafkaEvent({
      username,
      rawTrack,
      userInfo,
      collectorInstanceId: this.collectorInstanceId,
      pollCycle: this.pollCycle
    });

    // Store in in-memory inspection buffer (capped at 200 items)
    this.recentEventsBuffer.unshift(kafkaEvent);
    if (this.recentEventsBuffer.length > 200) {
      this.recentEventsBuffer.pop();
    }

    // Publish to external Kafka cluster (or log in dry-run mode)
    if (this.config.kafka.enabled) {
      this.kafkaProducer.publishEvent(kafkaEvent).catch((err) => {
        logger.error('Async Kafka publish exception', { error: String(err), eventId: kafkaEvent.eventId });
      });
    } else {
      logger.info('Dry-run: collected real Last.fm event (Kafka publish skipped)', {
        eventId: kafkaEvent.eventId,
        eventType: kafkaEvent.eventType,
        user: kafkaEvent.user.username,
        artist: kafkaEvent.artist.name,
        track: kafkaEvent.track.title,
        nowPlaying: kafkaEvent.playback.isNowPlaying
      });
    }

    // Notify local subscribers (SSE feed / UI)
    for (const listener of this.listeners) {
      try {
        listener(kafkaEvent);
      } catch (err) {
        logger.error('Error notifying event listener', { error: String(err) });
      }
    }
  }
}
