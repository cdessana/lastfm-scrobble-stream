/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useScrobbleStream } from './hooks/useScrobbleStream.js';
import { StreamHeader } from './components/StreamHeader.js';
import { FilterBar } from './components/FilterBar.js';
import { ScrobbleCard } from './components/ScrobbleCard.js';
import { ArtistStreamView } from './components/ArtistStreamView.js';
import { MonitoredUsersModal } from './components/MonitoredUsersModal.js';
import { RawDataInspector } from './components/RawDataInspector.js';
import type { FilterOptions, WatchedArtist } from './types.js';
import { Radio, AlertTriangle, Music, RefreshCw, X, Mic2, Sparkles, Users, Code } from 'lucide-react';

const STORAGE_KEY_WATCHED_ARTISTS = 'lastfm_stream_watched_artists';

const INITIAL_WATCHED_ARTISTS: WatchedArtist[] = [];

export default function App() {
  const {
    items,
    isPaused,
    pendingCount,
    connectionStatus,
    stats,
    lastRawEvent,
    eventCount,
    togglePause,
    clearFeed,
    reconnect
  } = useScrobbleStream();

  const [activeView, setActiveView] = useState<'all' | 'artists'>('all');

  const [watchedArtists, setWatchedArtists] = useState<WatchedArtist[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_WATCHED_ARTISTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_WATCHED_ARTISTS;
  });

  // Persist watched artists
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_WATCHED_ARTISTS, JSON.stringify(watchedArtists));
    } catch {
      // ignore
    }
  }, [watchedArtists]);

  const [filters, setFilters] = useState<FilterOptions>({
    artistQuery: '',
    musicQuery: '',
    selectedTags: [],
    nowPlayingOnly: false,
    usernameQuery: ''
  });

  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [showInspector, setShowInspector] = useState(false);

  // Set of watched artist names in lowercase
  const watchedNamesSet = useMemo(() => {
    return new Set(watchedArtists.map((a) => a.name.toLowerCase()));
  }, [watchedArtists]);

  // Number of watched artists currently playing in the live stream
  const activeWatchedPlayingCount = useMemo(() => {
    const currentlyPlaying = items.filter((item) => item.nowPlaying);
    return currentlyPlaying.filter((item) => watchedNamesSet.has(item.artistName.toLowerCase())).length;
  }, [items, watchedNamesSet]);

  const handleAddWatchedArtist = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    if (!watchedNamesSet.has(clean.toLowerCase())) {
      setWatchedArtists((prev) => [
        { name: clean, addedAt: Date.now(), alertEnabled: true },
        ...prev
      ]);
    }
  };

  const handleRemoveWatchedArtist = (name: string) => {
    const target = name.toLowerCase();
    setWatchedArtists((prev) => prev.filter((a) => a.name.toLowerCase() !== target));
  };

  const handleToggleArtistAlert = (name: string) => {
    const target = name.toLowerCase();
    setWatchedArtists((prev) =>
      prev.map((a) => (a.name.toLowerCase() === target ? { ...a, alertEnabled: !a.alertEnabled } : a))
    );
  };

  const handleToggleWatchArtist = (artistName: string) => {
    if (watchedNamesSet.has(artistName.toLowerCase())) {
      handleRemoveWatchedArtist(artistName);
    } else {
      handleAddWatchedArtist(artistName);
    }
  };

  // Compute available tags from current stream
  const availableTags = useMemo(() => {
    if (stats?.topGenres && stats.topGenres.length > 0) {
      return stats.topGenres;
    }
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const t of item.tags) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [items, stats]);

  // Filter items dynamically in real-time for the All stream
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Artist filter
      if (filters.artistQuery.trim()) {
        const q = filters.artistQuery.trim().toLowerCase();
        if (!item.artistName.toLowerCase().includes(q)) {
          return false;
        }
      }

      // 2. Music (song title) filter
      if (filters.musicQuery.trim()) {
        const q = filters.musicQuery.trim().toLowerCase();
        if (!item.trackName.toLowerCase().includes(q)) {
          return false;
        }
      }

      // 3. Genre tags filter
      if (filters.selectedTags.length > 0) {
        const itemTagsLower = item.tags.map((t) => t.toLowerCase());
        const matchesTag = filters.selectedTags.some((selectedTag) =>
          itemTagsLower.some((t) => t === selectedTag || t.includes(selectedTag))
        );
        if (!matchesTag) {
          return false;
        }
      }

      // 4. Now playing only toggle
      if (filters.nowPlayingOnly && !item.nowPlaying) {
        return false;
      }

      // 5. User listener filter
      if (filters.usernameQuery.trim()) {
        const q = filters.usernameQuery.trim().toLowerCase();
        if (!item.user.username.toLowerCase().includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [items, filters]);

  const handleTagClick = (tag: string) => {
    const normalized = tag.toLowerCase();
    if (!filters.selectedTags.includes(normalized)) {
      setFilters((prev) => ({
        ...prev,
        selectedTags: [...prev.selectedTags, normalized]
      }));
    }
  };

  const handleArtistClick = (artist: string) => {
    setFilters((prev) => ({
      ...prev,
      artistQuery: artist
    }));
  };

  const handleUserClick = (username: string) => {
    setFilters((prev) => ({
      ...prev,
      usernameQuery: username
    }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-red-500 selection:text-white font-sans antialiased">
      {/* Stream Header & Telemetry */}
      <StreamHeader
        connectionStatus={connectionStatus}
        isPaused={isPaused}
        pendingCount={pendingCount}
        stats={stats}
        onTogglePause={togglePause}
        onClearFeed={clearFeed}
        onReconnect={reconnect}
        onToggleUsersModal={() => setIsUsersModalOpen(true)}
        showInspector={showInspector}
        onToggleInspector={() => setShowInspector(!showInspector)}
        feedCount={items.length}
        activeView={activeView}
        onViewChange={setActiveView}
        watchedCount={watchedArtists.length}
        activeWatchedPlayingCount={activeWatchedPlayingCount}
      />

      {/* Raw Data Stream Inspector (Collapsible) */}
      <RawDataInspector
        isOpen={showInspector}
        onClose={() => setShowInspector(false)}
        lastRawEvent={lastRawEvent}
        eventCount={eventCount}
        connectionStatus={connectionStatus}
      />

      {/* Filter Controls Bar (Visible on 'all' view) */}
      {activeView === 'all' && (
        <FilterBar
          filters={filters}
          onFilterChange={setFilters}
          availableTags={availableTags}
          matchCount={filteredItems.length}
          totalCount={items.length}
        />
      )}

      {/* Main Stream Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Last.fm API Key Notice Banner */}
        {stats && !stats.isLiveApiConnected && (
          <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/70 border border-amber-500/60 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-200 text-xs shadow-md">
            <div className="flex items-start sm:items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <strong className="text-sm font-semibold text-white block">
                  Last.fm API Key Required
                </strong>
                <span className="text-slate-300">
                  This collector runs exclusively with real data from Last.fm Audioscrobbler (no mock data). Configure <code className="text-amber-300 bg-amber-950/80 px-1 py-0.5 rounded font-mono">LASTFM_API_KEY</code> and <code className="text-amber-300 bg-amber-950/80 px-1 py-0.5 rounded font-mono">LASTFM_USERS</code> in your <code className="text-amber-300">.env</code> to stream live playback and produce events to Kafka.
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsUsersModalOpen(true)}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold rounded-lg shrink-0 transition-colors"
            >
              Configure Users
            </button>
          </div>
        )}

        {/* Active Watched Artist playing banner when browsing All Stream */}
        {activeView === 'all' && activeWatchedPlayingCount > 0 && (
          <div className="bg-gradient-to-r from-emerald-950/90 via-slate-900 to-emerald-950/80 border border-emerald-500/50 p-3.5 rounded-xl flex items-center justify-between text-emerald-200 text-xs shadow-md">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span>
                <strong>{activeWatchedPlayingCount}</strong> of your watched artists {activeWatchedPlayingCount === 1 ? 'is' : 'are'} currently playing in the live stream!
              </span>
            </div>
            <button
              onClick={() => setActiveView('artists')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Mic2 className="w-3.5 h-3.5" />
              <span>Switch to Artist Stream</span>
            </button>
          </div>
        )}

        {/* Paused Stream Notification Banner */}
        {isPaused && pendingCount > 0 && (
          <div className="bg-amber-950/80 border border-amber-600/70 p-3 rounded-lg flex items-center justify-between text-amber-200 text-xs shadow-lg">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>
                Stream is paused. <strong>{pendingCount}</strong> new live scrobble{pendingCount !== 1 ? 's' : ''} buffered in background.
              </span>
            </div>
            <button
              onClick={togglePause}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded transition-colors"
            >
              Resume & Show
            </button>
          </div>
        )}

        {/* Connection Error Banner */}
        {connectionStatus === 'error' && (
          <div className="bg-rose-950/80 border border-rose-800 p-4 rounded-xl flex items-center justify-between text-rose-200 text-sm">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <strong className="block font-semibold text-white">Stream Disconnected</strong>
                <p className="text-xs text-rose-300">Attempting to reconnect to live SSE scrobble stream...</p>
              </div>
            </div>
            <button
              onClick={reconnect}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-md text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reconnect Now
            </button>
          </div>
        )}

        {/* VIEW 1: ARTIST STREAM VIEW */}
        {activeView === 'artists' && (
          <ArtistStreamView
            streamItems={items}
            watchedArtists={watchedArtists}
            onAddArtist={handleAddWatchedArtist}
            onRemoveArtist={handleRemoveWatchedArtist}
            onToggleAlert={handleToggleArtistAlert}
          />
        )}

        {/* VIEW 2: ALL SCROBBLES STREAM VIEW */}
        {activeView === 'all' && (
          <>
            {filteredItems.length > 0 ? (
              <div className="space-y-2.5">
                <AnimatePresence initial={false}>
                  {filteredItems.map((scrobble) => (
                    <motion.div
                      key={scrobble.id}
                      layout
                      initial={{ opacity: 0, y: -8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ScrobbleCard
                        scrobble={scrobble}
                        onTagClick={handleTagClick}
                        onArtistClick={handleArtistClick}
                        onUserClick={handleUserClick}
                        isWatched={watchedNamesSet.has(scrobble.artistName.toLowerCase())}
                        onToggleWatchArtist={handleToggleWatchArtist}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : items.length === 0 ? (
              /* Empty state: No scrobbles received yet from real API */
              <div className="text-center py-16 px-4 bg-slate-900/40 rounded-xl border border-dashed border-slate-800 space-y-3">
                <Music className="w-12 h-12 mx-auto text-slate-600 mb-2" />
                <h3 className="text-base font-semibold text-slate-200">
                  {stats?.isLiveApiConnected ? 'Awaiting Live Scrobbles' : 'Last.fm API Key Not Configured'}
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  {stats?.isLiveApiConnected
                    ? 'The collector engine is actively polling Last.fm for the configured user pool. Real playback and scrobbles will stream here and publish to Kafka as tracks are played.'
                    : 'All mock and simulated data have been removed. Provide your LASTFM_API_KEY in the environment (.env) to fetch real scrobbles and publish events to your Apache Kafka broker.'}
                </p>
                <div className="pt-2 flex justify-center gap-2">
                  <button
                    onClick={() => setIsUsersModalOpen(true)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5 text-sky-400" />
                    <span>View Monitored Users</span>
                  </button>
                  <button
                    onClick={() => setShowInspector(true)}
                    className="px-4 py-2 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 rounded-lg text-xs font-medium border border-indigo-800/60 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Code className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Inspect Kafka Schema</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Filtered out state: items exist in stream but filter excludes them */
              <div className="text-center py-16 px-4 bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
                <Music className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                <h3 className="text-base font-semibold text-slate-200">No Scrobbles Match Active Filters</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Live data stream is actively receiving scrobbles, but none match your current combination of artist, music, or genre tags.
                </p>
                <button
                  onClick={() =>
                    setFilters({
                      artistQuery: '',
                      musicQuery: '',
                      selectedTags: [],
                      nowPlayingOnly: false,
                      usernameQuery: ''
                    })
                  }
                  className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors inline-flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear Active Filters</span>
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Monitored Users Modal */}
      <MonitoredUsersModal
        isOpen={isUsersModalOpen}
        onClose={() => setIsUsersModalOpen(false)}
        onUserSelect={handleUserClick}
      />
    </div>
  );
}

