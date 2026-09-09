import type { KafkaScrobbleEvent, CollectorStatus } from './collector/types.js';

export type { KafkaScrobbleEvent, CollectorStatus };

export interface ScrobbleItem {
  id: string;
  trackName: string;
  artistName: string;
  albumName: string;
  imageUrl: string;
  nowPlaying: boolean;
  timestamp: number; // Unix timestamp in ms
  user: {
    username: string;
    avatarUrl: string;
    profileUrl: string;
    country?: string;
  };
  tags: string[];
  url: string;
  loved?: boolean;
  kafkaEvent?: KafkaScrobbleEvent;
}

export interface FilterOptions {
  artistQuery: string;
  musicQuery: string;
  selectedTags: string[];
  nowPlayingOnly: boolean;
  usernameQuery: string;
}

export interface StreamStats {
  totalScrobblesReceived: number;
  scrobblesPerMinute: number;
  activeUsersCount: number;
  connectedClients: number;
  isLiveApiConnected: boolean;
  topGenres: { tag: string; count: number }[];
  collectorStatus?: CollectorStatus;
}

export interface MonitoredUser {
  username: string;
  addedAt: number;
  lastScrobbleTime?: number;
  status: 'active' | 'idle';
  currentTrack?: string;
  isCustom?: boolean;
}

export interface WatchedArtist {
  name: string;
  addedAt: number;
  alertEnabled: boolean;
  color?: string;
}

export interface ArtistPlayEvent {
  scrobble: ScrobbleItem;
  artistName: string;
  playedAt: number;
  isNowPlaying: boolean;
  listener: string;
  trackTitle: string;
}

export interface ArtistSummary {
  artistName: string;
  isCurrentlyPlaying: boolean;
  activePlayCount: number;
  totalPlays: number;
  lastPlayedAt: number | null;
  lastPlayedTrack: string | null;
  lastPlayedUser: string | null;
  plays: ScrobbleItem[];
  topTracks: { track: string; count: number }[];
}
