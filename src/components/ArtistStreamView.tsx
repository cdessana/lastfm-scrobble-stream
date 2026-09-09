import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Radio, 
  Mic2, 
  Plus, 
  X, 
  Bell, 
  BellOff, 
  Clock, 
  ExternalLink, 
  Heart, 
  Volume2, 
  VolumeX, 
  Search, 
  Sparkles, 
  Calendar, 
  User, 
  TrendingUp, 
  Music2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import type { ScrobbleItem, WatchedArtist, ArtistSummary } from '../types.js';

interface ArtistStreamViewProps {
  streamItems: ScrobbleItem[];
  watchedArtists: WatchedArtist[];
  onAddArtist: (name: string) => void;
  onRemoveArtist: (name: string) => void;
  onToggleAlert: (name: string) => void;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// Pleasant gentle chime sound using Web Audio API
function playAlertChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Arpeggio chime notes: E5 -> G#5 -> B5
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(659.25, now);
    osc.frequency.exponentialRampToValueAtTime(830.61, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.16);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    // Audio playback may be restricted before user gesture
  }
}

export const ArtistStreamView: React.FC<ArtistStreamViewProps> = ({
  streamItems,
  watchedArtists,
  onAddArtist,
  onRemoveArtist,
  onToggleAlert
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [selectedArtistFilter, setSelectedArtistFilter] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [recentLiveAlert, setRecentLiveAlert] = useState<{ artist: string; track: string; user: string; time: number } | null>(null);

  const prevStreamCountRef = useRef(streamItems.length);
  const seenPlayIdsRef = useRef<Set<string>>(new Set());

  // Discovered artists in current real stream
  const discoveredStreamArtists = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of streamItems) {
      if (item.artistName) {
        map.set(item.artistName, (map.get(item.artistName) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);
  }, [streamItems]);

  // Set of watched artist names in lowercase
  const watchedNamesSet = useMemo(() => {
    return new Set(watchedArtists.map((a) => a.name.toLowerCase()));
  }, [watchedArtists]);

  // Filter play events that belong to watched artists
  const watchedPlays = useMemo(() => {
    if (watchedArtists.length === 0) return [];
    return streamItems.filter((item) => {
      const matchArtist = watchedNamesSet.has(item.artistName.toLowerCase());
      if (!matchArtist) return false;
      if (selectedArtistFilter) {
        return item.artistName.toLowerCase() === selectedArtistFilter.toLowerCase();
      }
      return true;
    });
  }, [streamItems, watchedArtists, watchedNamesSet, selectedArtistFilter]);

  // Aggregate stats per watched artist
  const artistSummaries = useMemo(() => {
    const map = new Map<string, ArtistSummary>();

    for (const a of watchedArtists) {
      map.set(a.name.toLowerCase(), {
        artistName: a.name,
        isCurrentlyPlaying: false,
        activePlayCount: 0,
        totalPlays: 0,
        lastPlayedAt: null,
        lastPlayedTrack: null,
        lastPlayedUser: null,
        plays: [],
        topTracks: []
      });
    }

    for (const item of streamItems) {
      const key = item.artistName.toLowerCase();
      if (map.has(key)) {
        const entry = map.get(key)!;
        entry.totalPlays++;
        entry.plays.push(item);
        if (item.nowPlaying) {
          entry.isCurrentlyPlaying = true;
          entry.activePlayCount++;
        }
        if (entry.lastPlayedAt === null || item.timestamp > entry.lastPlayedAt) {
          entry.lastPlayedAt = item.timestamp;
          entry.lastPlayedTrack = item.trackName;
          entry.lastPlayedUser = item.user.username;
        }
      }
    }

    // Compute top tracks per artist
    for (const entry of map.values()) {
      const trackCounts = new Map<string, number>();
      for (const play of entry.plays) {
        trackCounts.set(play.trackName, (trackCounts.get(play.trackName) || 0) + 1);
      }
      entry.topTracks = Array.from(trackCounts.entries())
        .map(([track, count]) => ({ track, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.isCurrentlyPlaying && !b.isCurrentlyPlaying) return -1;
      if (!a.isCurrentlyPlaying && b.isCurrentlyPlaying) return 1;
      return (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0);
    });
  }, [streamItems, watchedArtists]);

  // Active currently playing artists
  const currentlyPlayingArtists = useMemo(() => {
    return artistSummaries.filter((s) => s.isCurrentlyPlaying);
  }, [artistSummaries]);

  // Detect newly arriving plays for chosen artists to trigger notifications & audio alerts
  useEffect(() => {
    if (streamItems.length === 0) return;

    const latestItem = streamItems[0];
    if (latestItem && !seenPlayIdsRef.current.has(latestItem.id)) {
      seenPlayIdsRef.current.add(latestItem.id);

      const artistMatch = watchedArtists.find(
        (a) => a.name.toLowerCase() === latestItem.artistName.toLowerCase()
      );

      if (artistMatch && artistMatch.alertEnabled) {
        setRecentLiveAlert({
          artist: latestItem.artistName,
          track: latestItem.trackName,
          user: latestItem.user.username,
          time: Date.now()
        });

        if (soundEnabled) {
          playAlertChime();
        }
      }
    }

    prevStreamCountRef.current = streamItems.length;
  }, [streamItems, watchedArtists, soundEnabled]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    onAddArtist(searchInput.trim());
    setSearchInput('');
  };

  return (
    <div className="space-y-6">
      {/* Real-time Alert Toast Banner when a chosen artist is played live */}
      <AnimatePresence>
        {recentLiveAlert && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="bg-gradient-to-r from-red-950/90 via-slate-900 to-indigo-950/90 border border-red-500/50 rounded-xl p-4 shadow-xl shadow-red-950/30 flex items-center justify-between gap-4 text-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-red-600/30 text-red-400 border border-red-500/50 shrink-0">
                <Radio className="w-5 h-5 animate-pulse" />
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase font-bold tracking-wider text-red-400 bg-red-950/80 px-2 py-0.5 rounded border border-red-800">
                    Live Play Alert
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {timeAgo(recentLiveAlert.time)}
                  </span>
                </div>
                <p className="text-sm font-semibold text-white truncate mt-0.5">
                  <strong className="text-red-300">{recentLiveAlert.artist}</strong> is being played! &ldquo;{recentLiveAlert.track}&rdquo;
                </p>
                <p className="text-xs text-slate-300 flex items-center gap-1 mt-0.5">
                  <User className="w-3 h-3 text-slate-400" />
                  <span>Listener: <strong>@{recentLiveAlert.user}</strong> on Last.fm</span>
                </p>
              </div>
            </div>

            <button
              onClick={() => setRecentLiveAlert(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors shrink-0"
              title="Dismiss alert"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Artist Watchlist Controls & Discovery Section */}
      <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Mic2 className="w-5 h-5 text-red-400" />
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Artist Stream Watchlist
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                {watchedArtists.length} monitored
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Select your favorite musicians to watch their real-time scrobbles, live playback timeline, and listener activity.
            </p>
          </div>

          {/* Sound Notification Toggle */}
          <div className="flex items-center gap-2">
            <button
              id="toggle-sound-btn"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                soundEnabled
                  ? 'bg-slate-800 text-emerald-300 border-emerald-800/60 hover:bg-slate-750'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title={soundEnabled ? 'Mute play sound notifications' : 'Enable play sound notifications'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
              <span>{soundEnabled ? 'Chime Alert On' : 'Alert Muted'}</span>
            </button>
          </div>
        </div>

        {/* Add Artist Form */}
        <form onSubmit={handleAddSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              id="artist-search-input"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search or enter artist name (e.g., Beach House, Clairo, Tame Impala)..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
            />
          </div>
          <button
            id="add-artist-btn"
            type="submit"
            disabled={!searchInput.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shrink-0 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Track Artist</span>
          </button>
        </form>

        {/* Watched Artists Chips Bar */}
        {watchedArtists.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Your Watched Artists:</span>
              {selectedArtistFilter && (
                <button
                  onClick={() => setSelectedArtistFilter(null)}
                  className="text-xs text-red-400 hover:text-red-300 underline"
                >
                  Show all watched artists
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedArtistFilter(null)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                  selectedArtistFilter === null
                    ? 'bg-red-600 text-white shadow-sm ring-1 ring-red-400'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                All Watched ({watchedPlays.length} plays)
              </button>

              {watchedArtists.map((artist) => {
                const summary = artistSummaries.find((s) => s.artistName.toLowerCase() === artist.name.toLowerCase());
                const isSelected = selectedArtistFilter?.toLowerCase() === artist.name.toLowerCase();
                const isLive = summary?.isCurrentlyPlaying;

                return (
                  <div
                    key={artist.name}
                    className={`group inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-500 ring-1 ring-indigo-400'
                        : isLive
                        ? 'bg-emerald-950/80 text-emerald-200 border-emerald-700/80 shadow-xs'
                        : 'bg-slate-800 text-slate-200 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    {isLive && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    )}

                    <button
                      onClick={() =>
                        setSelectedArtistFilter(isSelected ? null : artist.name)
                      }
                      className="hover:underline flex items-center gap-1"
                    >
                      <span>{artist.name}</span>
                      {summary && summary.totalPlays > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
                          {summary.totalPlays}
                        </span>
                      )}
                    </button>

                    {/* Alert toggle button */}
                    <button
                      onClick={() => onToggleAlert(artist.name)}
                      className="p-1 rounded-full text-slate-400 hover:text-white"
                      title={artist.alertEnabled ? 'Alerts active' : 'Alerts disabled'}
                    >
                      {artist.alertEnabled ? (
                        <Bell className="w-3 h-3 text-amber-400" />
                      ) : (
                        <BellOff className="w-3 h-3 text-slate-500" />
                      )}
                    </button>

                    {/* Remove artist button */}
                    <button
                      onClick={() => onRemoveArtist(artist.name)}
                      className="p-1 rounded-full text-slate-400 hover:text-rose-400"
                      title="Remove from watched artists"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Add Discovered Artists from Real Stream */}
        {discoveredStreamArtists.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
            <span className="flex items-center gap-1 text-slate-400 font-medium mr-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Active in stream:</span>
            </span>
            {discoveredStreamArtists.map((name) => {
              const isAdded = watchedNamesSet.has(name.toLowerCase());
              return (
                <button
                  key={name}
                  id={`preset-${name.replace(/\s+/g, '-').toLowerCase()}`}
                  onClick={() => {
                    if (isAdded) {
                      onRemoveArtist(name);
                    } else {
                      onAddArtist(name);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                    isAdded
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-slate-800/70 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
                  }`}
                  title={`Discovered live • Click to ${isAdded ? 'remove' : 'add'}`}
                >
                  <span>{name}</span>
                  {isAdded ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  ) : (
                    <Plus className="w-3 h-3 text-slate-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Play Status Cards for Watched Artists */}
      {watchedArtists.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <span>Artist Playback Status ({artistSummaries.length})</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              Live now: <strong className="text-emerald-400">{currentlyPlayingArtists.length}</strong> active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {artistSummaries.map((summary) => (
              <div
                key={summary.artistName}
                onClick={() => setSelectedArtistFilter(summary.artistName)}
                className={`cursor-pointer rounded-xl p-4 border transition-all duration-200 relative overflow-hidden ${
                  summary.isCurrentlyPlaying
                    ? 'bg-gradient-to-b from-slate-900 to-emerald-950/40 border-emerald-500/50 shadow-md shadow-emerald-950/30 ring-1 ring-emerald-500/30'
                    : summary.totalPlays > 0
                    ? 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                    : 'bg-slate-900/40 border-slate-800/60 opacity-80 hover:opacity-100'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-base font-bold text-white truncate hover:text-red-300 transition-colors">
                      {summary.artistName}
                    </h4>

                    {/* Status Badge */}
                    <div className="mt-1 flex items-center gap-1.5">
                      {summary.isCurrentlyPlaying ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                          </span>
                          PLAYING NOW
                        </span>
                      ) : summary.lastPlayedAt ? (
                        <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {timeAgo(summary.lastPlayedAt)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 font-mono">
                          Awaiting stream play...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Play Count Badge */}
                  <div className="text-right shrink-0">
                    <span className="text-lg font-mono font-bold text-slate-100">
                      {summary.totalPlays}
                    </span>
                    <span className="block text-[10px] text-slate-400 uppercase font-sans">
                      {summary.totalPlays === 1 ? 'play' : 'plays'}
                    </span>
                  </div>
                </div>

                {/* Last/Current Track Info */}
                {summary.lastPlayedTrack ? (
                  <div className="mt-3 pt-3 border-t border-slate-800/80 text-xs">
                    <p className="text-slate-200 truncate font-medium flex items-center gap-1">
                      <Music2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="truncate">&ldquo;{summary.lastPlayedTrack}&rdquo;</span>
                    </p>
                    {summary.lastPlayedUser && (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        Scrobbled by <strong className="text-sky-400 font-mono">@{summary.lastPlayedUser}</strong>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-slate-800/60 text-xs text-slate-500 italic">
                    Listening for next scrobble...
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chronological Play Timeline Feed: "When It Is Being Played" */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              When Chosen Artists Are Being Played (Play Log)
            </h3>
          </div>
          <div className="text-xs text-slate-400 font-mono">
            {watchedPlays.length} recorded play{watchedPlays.length !== 1 ? 's' : ''}
          </div>
        </div>

        {watchedArtists.length === 0 ? (
          /* Empty State: No watched artists */
          <div className="text-center py-16 px-6 bg-slate-900/40 rounded-xl border border-dashed border-slate-800 space-y-3">
            <Mic2 className="w-12 h-12 mx-auto text-slate-600" />
            <h4 className="text-base font-semibold text-white">No Artists Chosen Yet</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Add artists above or click the popular suggestions to receive live playback notifications, historical play times, and listener details whenever their music is played on the stream.
            </p>
            <div className="pt-2">
              <button
                onClick={() => {
                  onAddArtist('Beach House');
                  onAddArtist('Clairo');
                  onAddArtist('Tame Impala');
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Track Popular Preset Trio (Beach House, Clairo, Tame Impala)</span>
              </button>
            </div>
          </div>
        ) : watchedPlays.length > 0 ? (
          /* Timeline Feed */
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {watchedPlays.map((scrobble) => (
                <motion.div
                  key={scrobble.id}
                  layout
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border transition-all ${
                    scrobble.nowPlaying
                      ? 'bg-slate-900/90 border-emerald-500/50 shadow-md shadow-emerald-950/30'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Left: Artwork, Track, Artist, Album */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="relative shrink-0 w-13 h-13 rounded-lg overflow-hidden bg-slate-800 border border-slate-700/80">
                      <img
                        src={scrobble.imageUrl}
                        alt={`${scrobble.trackName} album cover`}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      {scrobble.nowPlaying && (
                        <div className="absolute inset-0 bg-emerald-950/40 flex items-center justify-center">
                          <div className="flex items-end gap-0.5 h-3.5">
                            <span className="w-1 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s] h-3"></span>
                            <span className="w-1 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s] h-3.5"></span>
                            <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-2"></span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white truncate">
                          {scrobble.trackName}
                        </span>
                        {scrobble.loved && (
                          <Heart className="w-3.5 h-3.5 text-rose-500 fill-current shrink-0" />
                        )}
                        <a
                          href={scrobble.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-slate-500 hover:text-white"
                          title="Open on Last.fm"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      <div className="text-xs text-slate-300 flex items-center gap-2 mt-0.5">
                        <span className="font-semibold text-red-400">
                          {scrobble.artistName}
                        </span>
                        {scrobble.albumName && (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="text-slate-400 truncate">{scrobble.albumName}</span>
                          </>
                        )}
                      </div>

                      {/* Genre Tags */}
                      {scrobble.tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {scrobble.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: When it is being played (Exact Timestamp + relative time + user) */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto mt-3 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80 shrink-0">
                    {/* Listener details */}
                    <div className="flex items-center gap-2 text-left">
                      <img
                        src={scrobble.user.avatarUrl}
                        alt={scrobble.user.username}
                        className="w-6 h-6 rounded-full bg-slate-700 border border-slate-600"
                      />
                      <div>
                        <span className="text-xs font-mono font-medium text-sky-400 block">
                          @{scrobble.user.username}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {scrobble.user.country || 'Global'}
                        </span>
                      </div>
                    </div>

                    {/* Exact Time When Played */}
                    <div className="text-right">
                      {scrobble.nowPlaying ? (
                        <div className="flex flex-col items-end">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                            PLAYING NOW
                          </span>
                          <span className="text-[11px] text-emerald-400 font-mono mt-0.5">
                            Started {timeAgo(scrobble.timestamp)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-mono font-medium text-slate-200">
                            {formatTime(scrobble.timestamp)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {timeAgo(scrobble.timestamp)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          /* When artists are chosen, but haven't played yet in this buffer session */
          <div className="text-center py-12 px-4 bg-slate-900/40 rounded-xl border border-dashed border-slate-800 space-y-2">
            <Radio className="w-8 h-8 mx-auto text-slate-500 animate-pulse" />
            <h4 className="text-sm font-semibold text-slate-300">Listening For Your Chosen Artists...</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Your watched artists ({watchedArtists.map((a) => a.name).join(', ')}) are queued in the live monitor. When any Last.fm listener plays one of their tracks, the play event and exact time will appear here immediately.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
