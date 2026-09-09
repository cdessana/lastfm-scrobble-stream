import type {
  LastFmRecentTracksResponse,
  LastFmTrackRaw,
  LastFmUserInfoResponse,
  LastFmUserRaw
} from './types.js';
import { logger } from './logger.js';

export class LastFmApiError extends Error {
  public readonly httpStatus: number;
  public readonly lastFmCode?: number;
  public readonly isRateLimit: boolean;
  public readonly isAuthError: boolean;
  public readonly isNotFound: boolean;

  constructor(message: string, httpStatus: number, lastFmCode?: number) {
    super(message);
    this.name = 'LastFmApiError';
    this.httpStatus = httpStatus;
    this.lastFmCode = lastFmCode;
    this.isRateLimit = httpStatus === 429 || lastFmCode === 29;
    this.isAuthError = httpStatus === 401 || httpStatus === 403 || lastFmCode === 10 || lastFmCode === 26;
    this.isNotFound = httpStatus === 404 || lastFmCode === 6;
  }
}

export class LastFmClient {
  private readonly baseUrl = 'https://ws.audioscrobbler.com/2.0/';
  private readonly userAgent = 'LastFmKafkaCollector/1.0.0 (Kafka Learning Project Producer)';
  private backoffUntil: number = 0;

  constructor(private apiKey: string) {}

  public updateApiKey(newKey: string) {
    this.apiKey = newKey;
  }

  public hasApiKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Fetches recent scrobbles for a specific Last.fm user.
   * Documented Last.fm API endpoint: user.getrecenttracks
   */
  public async getRecentTracks(username: string, limit = 5): Promise<LastFmTrackRaw[]> {
    if (!this.hasApiKey()) {
      throw new LastFmApiError('LASTFM_API_KEY is not configured', 401, 10);
    }

    if (!username || !username.trim()) {
      throw new LastFmApiError('Username is required for user.getrecenttracks', 400);
    }

    const now = Date.now();
    if (this.backoffUntil > now) {
      const waitSeconds = Math.ceil((this.backoffUntil - now) / 1000);
      throw new LastFmApiError(`Rate limit backoff active for another ${waitSeconds}s`, 429, 29);
    }

    const cleanUser = username.trim();
    const params = new URLSearchParams({
      method: 'user.getrecenttracks',
      user: cleanUser,
      api_key: this.apiKey,
      format: 'json',
      limit: String(limit)
    });

    const url = `${this.baseUrl}?${params.toString()}`;

    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        }
      });
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      logger.error('Network failure connecting to Last.fm API', { user: cleanUser, error: msg });
      throw new LastFmApiError(`Network failure calling Last.fm: ${msg}`, 0);
    }

    // Handle HTTP status errors
    if (!response.ok) {
      if (response.status === 429) {
        this.applyRateLimitBackoff(15000);
      }
      let errBody = '';
      try {
        errBody = await response.text();
      } catch {
        // ignore
      }
      logger.error('Last.fm API HTTP error', {
        status: response.status,
        statusText: response.statusText,
        user: cleanUser,
        body: errBody.substring(0, 200)
      });
      throw new LastFmApiError(
        `Last.fm API returned HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    // Parse JSON
    let data: LastFmRecentTracksResponse;
    try {
      data = (await response.json()) as LastFmRecentTracksResponse;
    } catch {
      logger.error('Failed to parse Last.fm API response as JSON', { user: cleanUser });
      throw new LastFmApiError('Malformed JSON received from Last.fm API', 502);
    }

    // Check for Last.fm specific application-level error codes
    if (data.error) {
      if (data.error === 29) {
        this.applyRateLimitBackoff(15000);
      }
      logger.error('Last.fm API application error', {
        code: data.error,
        message: data.message,
        user: cleanUser
      });
      throw new LastFmApiError(
        `Last.fm API error [${data.error}]: ${data.message || 'Unknown error'}`,
        response.status,
        data.error
      );
    }

    const rawTracks = data.recenttracks?.track;
    if (!rawTracks) {
      logger.debug('Empty recenttracks payload from Last.fm', { user: cleanUser });
      return [];
    }

    // Last.fm returns a single object if only 1 track, or an array if multiple
    if (Array.isArray(rawTracks)) {
      return rawTracks;
    } else if (typeof rawTracks === 'object') {
      return [rawTracks];
    }

    return [];
  }

  /**
   * Fetches real user profile metadata to validate user existence and enrich scrobble events.
   * Documented Last.fm API endpoint: user.getinfo
   */
  public async getUserInfo(username: string): Promise<LastFmUserRaw | null> {
    if (!this.hasApiKey()) {
      throw new LastFmApiError('LASTFM_API_KEY is not configured', 401, 10);
    }

    const cleanUser = username.trim();
    const params = new URLSearchParams({
      method: 'user.getinfo',
      user: cleanUser,
      api_key: this.apiKey,
      format: 'json'
    });

    const url = `${this.baseUrl}?${params.toString()}`;

    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        }
      });
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw new LastFmApiError(`Network failure calling user.getinfo: ${msg}`, 0);
    }

    if (!response.ok) {
      throw new LastFmApiError(`Last.fm user.getinfo failed with HTTP ${response.status}`, response.status);
    }

    const data = (await response.json()) as LastFmUserInfoResponse;
    if (data.error) {
      throw new LastFmApiError(`Last.fm user.getinfo error [${data.error}]: ${data.message}`, 200, data.error);
    }

    return data.user || null;
  }

  private applyRateLimitBackoff(durationMs: number) {
    this.backoffUntil = Date.now() + durationMs;
    logger.warn('Last.fm rate limit encountered, applying backoff window', {
      durationMs,
      backoffUntil: new Date(this.backoffUntil).toISOString()
    });
  }
}
