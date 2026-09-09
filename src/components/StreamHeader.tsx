import React from 'react';
import { Radio, Play, Pause, Trash2, Users, Code, RefreshCw, Activity, Wifi, WifiOff, Mic2 } from 'lucide-react';
import type { StreamStats } from '../types.js';

interface StreamHeaderProps {
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  isPaused: boolean;
  pendingCount: number;
  stats: StreamStats | null;
  onTogglePause: () => void;
  onClearFeed: () => void;
  onReconnect: () => void;
  onToggleUsersModal: () => void;
  showInspector: boolean;
  onToggleInspector: () => void;
  feedCount: number;
  activeView: 'all' | 'artists';
  onViewChange: (view: 'all' | 'artists') => void;
  watchedCount: number;
  activeWatchedPlayingCount: number;
}

export const StreamHeader: React.FC<StreamHeaderProps> = ({
  connectionStatus,
  isPaused,
  pendingCount,
  stats,
  onTogglePause,
  onClearFeed,
  onReconnect,
  onToggleUsersModal,
  showInspector,
  onToggleInspector,
  feedCount,
  activeView,
  onViewChange,
  watchedCount,
  activeWatchedPlayingCount
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Logo, Live Beacon, and Navigation Mode Switcher */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-red-600/20 text-red-500 border border-red-500/30">
              <Radio className="w-5 h-5 animate-pulse" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-400 opacity-75' : 'bg-amber-400 opacity-75'}`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">Last.fm Live Stream</h1>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-medium flex items-center gap-1 ${
                  connectionStatus === 'connected' 
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80' 
                    : 'bg-amber-950 text-amber-300 border border-amber-800/80'
                }`}>
                  {connectionStatus === 'connected' ? (
                    <>
                      <Wifi className="w-3 h-3" />
                      LIVE
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3" />
                      {connectionStatus.toUpperCase()}
                    </>
                  )}
                </span>

                {/* Kafka Producer Status Badge */}
                {stats?.collectorStatus?.kafka && (
                  <span
                    className={`hidden lg:inline-flex text-[10px] px-2 py-0.5 rounded-full font-mono border items-center gap-1 ${
                      stats.collectorStatus.kafka.enabled
                        ? stats.collectorStatus.kafka.status === 'connected'
                          ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                          : stats.collectorStatus.kafka.status === 'connecting'
                          ? 'bg-amber-950/70 text-amber-300 border-amber-800'
                          : 'bg-rose-950/70 text-rose-300 border-rose-800'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                    title={
                      stats.collectorStatus.kafka.enabled
                        ? `Kafka Producer: ${stats.collectorStatus.kafka.status} • Topic: ${stats.collectorStatus.kafka.topic}`
                        : 'Kafka Producer disabled (Dry-Run Mode). Set KAFKA_PRODUCER_ENABLED=true in .env to publish.'
                    }
                  >
                    <span>Kafka:</span>
                    <strong>
                      {stats.collectorStatus.kafka.enabled
                        ? stats.collectorStatus.kafka.status
                        : 'dry-run'}
                    </strong>
                  </span>
                )}
              </div>
            </div>

            {/* View Switcher: All Stream vs Artist Stream */}
            <div className="flex items-center bg-slate-950/80 p-1 rounded-lg border border-slate-800 sm:ml-2">
              <button
                id="view-all-stream-btn"
                onClick={() => onViewChange('all')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  activeView === 'all'
                    ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>All Scrobbles</span>
              </button>

              <button
                id="view-artist-stream-btn"
                onClick={() => onViewChange('artists')}
                className={`relative flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  activeView === 'artists'
                    ? 'bg-red-600 text-white shadow-sm ring-1 ring-red-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Mic2 className="w-3.5 h-3.5" />
                <span>Artist Stream</span>
                {watchedCount > 0 && (
                  <span className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    activeView === 'artists' ? 'bg-black/30 text-white' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {watchedCount}
                  </span>
                )}
                {activeWatchedPlayingCount > 0 && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Telemetry Metrics Bar */}
          <div className="flex items-center gap-3 sm:gap-5 text-xs text-slate-300 bg-slate-950/70 py-1 px-3 rounded-lg border border-slate-800">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-red-400" />
              <span>Speed:</span>
              <strong className="font-mono text-emerald-400">{stats ? `${stats.scrobblesPerMinute} /min` : '--'}</strong>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 border-l border-slate-800 pl-3">
              <span>Streamed:</span>
              <strong className="font-mono text-slate-100">{stats?.totalScrobblesReceived ?? feedCount}</strong>
            </div>
            <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
              <span>Users:</span>
              <strong className="font-mono text-sky-400">{stats?.activeUsersCount ?? 0}</strong>
            </div>
          </div>

          {/* Stream Controls */}
          <div className="flex items-center gap-2">
            <button
              id="toggle-pause-btn"
              onClick={onTogglePause}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                isPaused
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
              title={isPaused ? 'Resume live scrobbles' : 'Pause stream feed'}
            >
              {isPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Resume {pendingCount > 0 && `(+${pendingCount})`}
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </>
              )}
            </button>

            <button
              id="clear-feed-btn"
              onClick={onClearFeed}
              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition-colors"
              title="Clear visible feed"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <button
              id="manage-users-btn"
              onClick={onToggleUsersModal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
              title="Manage Monitored Last.fm Users"
            >
              <Users className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline">Users Pool</span>
            </button>

            <button
              id="toggle-inspector-btn"
              onClick={onToggleInspector}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                showInspector
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Toggle Live Stream Inspector (Raw SSE & Payload)"
            >
              <Code className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Raw Data</span>
            </button>

            {connectionStatus === 'error' && (
              <button
                id="reconnect-stream-btn"
                onClick={onReconnect}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Reconnect
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

