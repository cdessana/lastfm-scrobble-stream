import React from 'react';
import { Radio, ExternalLink, Heart, Clock, User, Music, Star } from 'lucide-react';
import type { ScrobbleItem } from '../types.js';

interface ScrobbleCardProps {
  scrobble: ScrobbleItem;
  onTagClick: (tag: string) => void;
  onArtistClick: (artist: string) => void;
  onUserClick: (username: string) => void;
  isWatched?: boolean;
  onToggleWatchArtist?: (artist: string) => void;
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

export const ScrobbleCard: React.FC<ScrobbleCardProps> = ({
  scrobble,
  onTagClick,
  onArtistClick,
  onUserClick,
  isWatched = false,
  onToggleWatchArtist
}) => {
  return (
    <article
      id={`scrobble-${scrobble.id}`}
      className={`group relative flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border transition-all duration-200 ${
        scrobble.nowPlaying
          ? 'bg-slate-900/90 border-emerald-500/40 shadow-sm shadow-emerald-950/40 hover:border-emerald-500/60'
          : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-850 hover:border-slate-700'
      }`}
    >
      {/* Left section: Artwork + Track & Artist Metadata */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* Album Artwork */}
        <div className="relative shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-slate-800 border border-slate-700/60 shadow-inner">
          <img
            src={scrobble.imageUrl}
            alt={`${scrobble.albumName || scrobble.trackName} artwork`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            referrerPolicy="no-referrer"
            onError={(e) => {
              // fallback image on error
              (e.target as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80';
            }}
          />
          {scrobble.nowPlaying && (
            <div className="absolute inset-0 bg-emerald-950/40 flex items-center justify-center backdrop-blur-[1px]">
              <div className="flex items-end gap-0.5 h-4">
                <span className="w-1 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s] h-3"></span>
                <span className="w-1 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s] h-4"></span>
                <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-2.5"></span>
              </div>
            </div>
          )}
        </div>

        {/* Track, Artist, Album Title */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-semibold text-slate-100 truncate group-hover:text-white">
              <a
                href={scrobble.url}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:underline flex items-center gap-1.5"
              >
                <span>{scrobble.trackName}</span>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
              </a>
            </h3>

            {scrobble.loved && (
              <span title="Loved Track on Last.fm" className="text-rose-500 shrink-0">
                <Heart className="w-3.5 h-3.5 fill-current" />
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-300">
            <button
              id={`artist-btn-${scrobble.id}`}
              type="button"
              onClick={() => onArtistClick(scrobble.artistName)}
              className="font-medium text-slate-200 hover:text-red-400 truncate hover:underline text-left"
            >
              {scrobble.artistName}
            </button>

            {onToggleWatchArtist && (
              <button
                id={`watch-artist-btn-${scrobble.id}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleWatchArtist(scrobble.artistName);
                }}
                className={`p-0.5 rounded transition-colors ${
                  isWatched
                    ? 'text-amber-400 hover:text-amber-300'
                    : 'text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100'
                }`}
                title={isWatched ? `Remove ${scrobble.artistName} from watched artists` : `Track ${scrobble.artistName} in Artist Stream`}
              >
                <Star className={`w-3.5 h-3.5 ${isWatched ? 'fill-current' : ''}`} />
              </button>
            )}

            {scrobble.albumName && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400 truncate text-xs">{scrobble.albumName}</span>
              </>
            )}
          </div>

          {/* Genre Tags */}
          {scrobble.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {scrobble.tags.slice(0, 4).map((tag) => (
                <button
                  key={tag}
                  id={`tag-badge-${scrobble.id}-${tag}`}
                  type="button"
                  onClick={() => onTagClick(tag)}
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-indigo-900/60 hover:text-indigo-200 text-slate-400 border border-slate-700/60 transition-colors"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right section: Scrobbling User + Real-Time Status badge */}
      <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto mt-3 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60 shrink-0">
        {/* User profile */}
        <button
          id={`user-filter-${scrobble.id}`}
          type="button"
          onClick={() => onUserClick(scrobble.user.username)}
          className="flex items-center gap-2 text-left p-1.5 rounded-lg hover:bg-slate-800/70 transition-colors"
          title={`Filter feed by user: ${scrobble.user.username}`}
        >
          <img
            src={scrobble.user.avatarUrl}
            alt={scrobble.user.username}
            className="w-6 h-6 rounded-full bg-slate-700 border border-slate-600"
          />
          <div className="flex flex-col">
            <span className="text-xs font-mono font-medium text-slate-300 hover:text-sky-300">
              {scrobble.user.username}
            </span>
            {scrobble.user.country && (
              <span className="text-[10px] text-slate-500 font-mono">
                {scrobble.user.country}
              </span>
            )}
          </div>
        </button>

        {/* Status Indicator */}
        <div className="flex flex-col items-end">
          {scrobble.nowPlaying ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/80 shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              NOW PLAYING
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-mono">
              <Clock className="w-3 h-3 text-slate-500" />
              {timeAgo(scrobble.timestamp)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
};
