import type {
  LastFmTrackRaw,
  LastFmUserRaw,
  KafkaScrobbleEvent,
  KafkaEventType
} from './types.js';

/**
 * Maps raw Last.fm image array to structured named image URLs
 */
function extractImages(rawImages?: LastFmTrackRaw['image']): KafkaScrobbleEvent['images'] {
  const images: KafkaScrobbleEvent['images'] = {};
  if (!Array.isArray(rawImages)) return images;

  for (const img of rawImages) {
    const url = img['#text']?.trim();
    if (!url) continue;

    if (img.size === 'small') images.small = url;
    else if (img.size === 'medium') images.medium = url;
    else if (img.size === 'large') images.large = url;
    else if (img.size === 'extralarge') images.extraLarge = url;
  }

  return images;
}

/**
 * Extracts artist name and MBID safely from Last.fm polymorphic artist field
 */
function extractArtist(rawArtist: LastFmTrackRaw['artist']): { name: string; mbid?: string; url: string } {
  if (typeof rawArtist === 'string') {
    return {
      name: rawArtist,
      url: `https://www.last.fm/music/${encodeURIComponent(rawArtist)}`
    };
  }

  const name = rawArtist?.name || rawArtist?.['#text'] || 'Unknown Artist';
  const mbid = rawArtist?.mbid || undefined;
  const url = rawArtist?.url || `https://www.last.fm/music/${encodeURIComponent(name)}`;

  return { name, mbid, url };
}

/**
 * Extracts album title and MBID safely
 */
function extractAlbum(rawAlbum?: LastFmTrackRaw['album']): { title: string; mbid?: string } {
  if (!rawAlbum) return { title: '' };
  const title = rawAlbum['#text'] || '';
  const mbid = rawAlbum.mbid || undefined;
  return { title, mbid };
}

/**
 * Generates a deterministic deduplication key for an event.
 * If the track is a historical scrobble with a timestamp (uts), the key is:
 *   "scrobble:{username}:{uts}:{artist}:{track}"
 * If the track is currently playing ("nowplaying"), the key is:
 *   "nowplaying:{username}:{artist}:{track}"
 */
export function generateEventKey(
  username: string,
  rawTrack: LastFmTrackRaw
): { eventId: string; deduplicationKey: string; isNowPlaying: boolean } {
  const cleanUser = username.trim().toLowerCase();
  const artist = extractArtist(rawTrack.artist).name.toLowerCase();
  const track = (rawTrack.name || '').toLowerCase();
  const isNowPlaying = rawTrack['@attr']?.nowplaying === 'true';

  if (isNowPlaying) {
    const deduplicationKey = `nowplaying:${cleanUser}:${artist}:${track}`;
    return {
      eventId: deduplicationKey,
      deduplicationKey,
      isNowPlaying: true
    };
  }

  const uts = rawTrack.date?.uts || '0';
  const deduplicationKey = `scrobble:${cleanUser}:${uts}:${artist}:${track}`;
  return {
    eventId: deduplicationKey,
    deduplicationKey,
    isNowPlaying: false
  };
}

/**
 * Transforms a raw Last.fm track and user context into a standardized KafkaScrobbleEvent
 */
export function transformToKafkaEvent(params: {
  username: string;
  rawTrack: LastFmTrackRaw;
  userInfo?: LastFmUserRaw | null;
  collectorInstanceId: string;
  pollCycle: number;
}): KafkaScrobbleEvent {
  const { username, rawTrack, userInfo, collectorInstanceId, pollCycle } = params;
  const now = Date.now();
  const producedAt = new Date(now).toISOString();

  const { eventId, isNowPlaying } = generateEventKey(username, rawTrack);
  const eventType: KafkaEventType = isNowPlaying ? 'track.now_playing' : 'track.scrobbled';

  const artist = extractArtist(rawTrack.artist);
  const album = extractAlbum(rawTrack.album);
  const images = extractImages(rawTrack.image);

  let scrobbledAtEpochMs: number | null = null;
  let scrobbledAtIso: string | null = null;
  let eventTimestamp = producedAt;

  if (rawTrack.date?.uts) {
    const epochMs = parseInt(rawTrack.date.uts, 10) * 1000;
    if (!isNaN(epochMs)) {
      scrobbledAtEpochMs = epochMs;
      scrobbledAtIso = new Date(epochMs).toISOString();
      eventTimestamp = scrobbledAtIso;
    }
  }

  const trackTitle = rawTrack.name || 'Unknown Track';
  const trackUrl = rawTrack.url || `https://www.last.fm/music/${encodeURIComponent(artist.name)}/_/${encodeURIComponent(trackTitle)}`;
  const loved = rawTrack.loved === '1';

  return {
    eventId,
    eventType,
    eventVersion: '1.0.0',
    source: 'lastfm-collector',
    timestamp: eventTimestamp,
    producedAt,
    user: {
      username: username.trim(),
      profileUrl: `https://www.last.fm/user/${encodeURIComponent(username.trim())}`,
      country: userInfo?.country || undefined,
      isSubscriber: userInfo?.subscriber === '1'
    },
    track: {
      title: trackTitle,
      mbid: rawTrack.mbid || undefined,
      url: trackUrl,
      loved
    },
    artist: {
      name: artist.name,
      mbid: artist.mbid,
      url: artist.url
    },
    album: {
      title: album.title,
      mbid: album.mbid
    },
    images,
    playback: {
      isNowPlaying,
      scrobbledAtEpochMs,
      scrobbledAtIso
    },
    collectorMetadata: {
      collectorInstanceId,
      pollCycle,
      ingestionLatencyMs: scrobbledAtEpochMs ? Math.max(0, now - scrobbledAtEpochMs) : 0
    }
  };
}

/**
 * Returns the Kafka partition key for the event.
 * Partitioning by username guarantees all scrobbles for a given user
 * are published to the same partition, preserving playback order.
 */
export function getKafkaMessageKey(event: KafkaScrobbleEvent): string {
  return event.user.username.toLowerCase();
}
