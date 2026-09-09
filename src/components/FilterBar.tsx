import React, { useState } from 'react';
import { Search, Music, Mic2, Tag, X, Filter, Radio, User } from 'lucide-react';
import type { FilterOptions } from '../types.js';

interface FilterBarProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  availableTags: { tag: string; count: number }[];
  matchCount: number;
  totalCount: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onFilterChange,
  availableTags,
  matchCount,
  totalCount
}) => {
  const [tagInput, setTagInput] = useState('');

  const handleArtistChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, artistQuery: e.target.value });
  };

  const handleMusicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, musicQuery: e.target.value });
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, usernameQuery: e.target.value });
  };

  const handleToggleNowPlaying = () => {
    onFilterChange({ ...filters, nowPlayingOnly: !filters.nowPlayingOnly });
  };

  const handleToggleTag = (tag: string) => {
    const normalized = tag.toLowerCase();
    const isSelected = filters.selectedTags.includes(normalized);
    const newTags = isSelected
      ? filters.selectedTags.filter((t) => t !== normalized)
      : [...filters.selectedTags, normalized];
    onFilterChange({ ...filters, selectedTags: newTags });
  };

  const handleAddCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagInput.trim()) return;
    const clean = tagInput.trim().toLowerCase();
    if (!filters.selectedTags.includes(clean)) {
      onFilterChange({ ...filters, selectedTags: [...filters.selectedTags, clean] });
    }
    setTagInput('');
  };

  const handleResetFilters = () => {
    onFilterChange({
      artistQuery: '',
      musicQuery: '',
      selectedTags: [],
      nowPlayingOnly: false,
      usernameQuery: ''
    });
  };

  const hasActiveFilters =
    Boolean(filters.artistQuery) ||
    Boolean(filters.musicQuery) ||
    Boolean(filters.usernameQuery) ||
    filters.selectedTags.length > 0 ||
    filters.nowPlayingOnly;

  return (
    <div className="bg-slate-900/90 backdrop-blur border-b border-slate-800 p-4 text-slate-200">
      <div className="max-w-7xl mx-auto space-y-3">
        {/* Primary Filter Inputs Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Artist Filter */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Mic2 className="w-4 h-4" />
            </div>
            <input
              id="filter-artist-input"
              type="text"
              value={filters.artistQuery}
              onChange={handleArtistChange}
              placeholder="Filter by Artist..."
              className="w-full pl-9 pr-8 py-2 bg-slate-800/80 border border-slate-700 rounded-md text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
            />
            {filters.artistQuery && (
              <button
                onClick={() => onFilterChange({ ...filters, artistQuery: '' })}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Music (Song/Track) Filter */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Music className="w-4 h-4" />
            </div>
            <input
              id="filter-music-input"
              type="text"
              value={filters.musicQuery}
              onChange={handleMusicChange}
              placeholder="Filter by Music / Song..."
              className="w-full pl-9 pr-8 py-2 bg-slate-800/80 border border-slate-700 rounded-md text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
            />
            {filters.musicQuery && (
              <button
                onClick={() => onFilterChange({ ...filters, musicQuery: '' })}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* User Listener Filter */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <input
              id="filter-user-input"
              type="text"
              value={filters.usernameQuery}
              onChange={handleUsernameChange}
              placeholder="Filter by Last.fm user..."
              className="w-full pl-9 pr-8 py-2 bg-slate-800/80 border border-slate-700 rounded-md text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
            />
            {filters.usernameQuery && (
              <button
                onClick={() => onFilterChange({ ...filters, usernameQuery: '' })}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filter: Currently Playing Only & Reset */}
          <div className="flex items-center gap-2">
            <button
              id="filter-nowplaying-toggle"
              type="button"
              onClick={handleToggleNowPlaying}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-semibold border transition-all ${
                filters.nowPlayingOnly
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm shadow-emerald-900/50'
                  : 'bg-slate-800 hover:bg-slate-700/80 text-slate-300 border-slate-700'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${filters.nowPlayingOnly ? 'animate-pulse' : ''}`} />
              <span>Now Playing Only</span>
            </button>

            {hasActiveFilters && (
              <button
                id="reset-filters-btn"
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-red-400 hover:text-red-300 border border-slate-700 rounded-md text-xs font-medium transition-colors flex items-center gap-1"
                title="Clear all filters"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Genre Tags Filter Row */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div className="flex items-center gap-1 text-xs text-slate-400 font-medium mr-1">
            <Tag className="w-3.5 h-3.5 text-indigo-400" />
            <span>Genre Tags:</span>
          </div>

          {/* Popular Tag Chips */}
          {availableTags.slice(0, 10).map(({ tag }) => {
            const isSelected = filters.selectedTags.includes(tag.toLowerCase());
            return (
              <button
                key={tag}
                id={`tag-filter-${tag}`}
                onClick={() => handleToggleTag(tag)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80'
                }`}
              >
                #{tag}
              </button>
            );
          })}

          {/* Add custom tag input form */}
          <form onSubmit={handleAddCustomTag} className="flex items-center">
            <input
              id="custom-tag-input"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="+ add tag..."
              className="w-24 px-2 py-0.5 text-xs bg-slate-800/60 border border-slate-700 rounded-full text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:w-32 transition-all"
            />
          </form>

          {/* Matching counter */}
          <div className="ml-auto text-xs text-slate-400 font-mono">
            Matches: <strong className="text-slate-100">{matchCount}</strong> / {totalCount}
          </div>
        </div>
      </div>
    </div>
  );
};
