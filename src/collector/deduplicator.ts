/**
 * In-memory deduplicator to prevent publishing duplicate events to Kafka.
 * Uses a bounded FIFO/Set cache for historical scrobbles and a state map for now-playing tracks.
 */
export class EventDeduplicator {
  private readonly maxEntries: number;
  private readonly publishedKeysSet: Set<string> = new Set();
  private readonly publishedKeysOrder: string[] = [];
  private readonly currentNowPlayingByUser: Map<string, string> = new Map();

  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Checks if an event is a duplicate.
   * If it is new, registers it and returns false.
   * If it is duplicate, returns true.
   */
  public isDuplicate(
    username: string,
    deduplicationKey: string,
    isNowPlaying: boolean,
    trackSignature: string
  ): boolean {
    const userKey = username.trim().toLowerCase();

    // 1. For "now playing" tracks:
    // Only publish once per continuous listening session for that specific track.
    if (isNowPlaying) {
      const currentActive = this.currentNowPlayingByUser.get(userKey);
      if (currentActive === trackSignature) {
        return true; // Still playing the same track, do not re-emit duplicate Kafka event
      }
      // Track changed or started
      this.currentNowPlayingByUser.set(userKey, trackSignature);
      return false;
    }

    // When user scrobbles a track, clear their current now-playing if it matches.
    // NOTE: See README.md Section 8 ("Concurrent Now Playing Events"). In an append-only event stream,
    // the completed scrobble event does not retract the previously published TRACK_NOW_PLAYING event;
    // downstream state stores (e.g. KTable) reconcile active playback state per username.
    const currentActive = this.currentNowPlayingByUser.get(userKey);
    if (currentActive === trackSignature) {
      this.currentNowPlayingByUser.delete(userKey);
    }

    // 2. For historical/completed scrobbles:
    if (this.publishedKeysSet.has(deduplicationKey)) {
      return true;
    }

    // Register new event key with bounded capacity
    this.publishedKeysSet.add(deduplicationKey);
    this.publishedKeysOrder.push(deduplicationKey);

    if (this.publishedKeysOrder.length > this.maxEntries) {
      const oldestKey = this.publishedKeysOrder.shift();
      if (oldestKey) {
        this.publishedKeysSet.delete(oldestKey);
      }
    }

    return false;
  }

  public getTrackedCount(): number {
    return this.publishedKeysSet.size;
  }

  public clear(): void {
    this.publishedKeysSet.clear();
    this.publishedKeysOrder.length = 0;
    this.currentNowPlayingByUser.clear();
  }
}
