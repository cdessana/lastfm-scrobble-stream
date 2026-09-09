import React, { useState } from 'react';
import { Terminal, Copy, Check, X, ShieldCheck, Database } from 'lucide-react';

interface RawDataInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  lastRawEvent: string;
  eventCount: number;
  connectionStatus: string;
}

export const RawDataInspector: React.FC<RawDataInspectorProps> = ({
  isOpen,
  onClose,
  lastRawEvent,
  eventCount,
  connectionStatus
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'kafka' | 'sse'>('kafka');

  if (!isOpen) return null;

  // Convert the SSE payload to a preview of the KafkaScrobbleEvent produced to Kafka
  let kafkaFormattedJson = '';
  if (lastRawEvent) {
    try {
      const parsed = JSON.parse(lastRawEvent);
      const kafkaEvent = {
        eventId: parsed.id || `scrobble-${Date.now()}`,
        eventType: parsed.nowPlaying ? 'TRACK_NOW_PLAYING' : 'TRACK_SCROBBLED',
        schemaVersion: '1.0.0',
        timestamp: parsed.timestamp || Date.now(),
        user: {
          username: parsed.user?.username || 'unknown',
          realName: parsed.user?.realName || null,
          country: parsed.user?.country || null,
          playcount: parsed.user?.playcount || 0
        },
        track: {
          name: parsed.trackName || '',
          artist: parsed.artistName || '',
          album: parsed.albumTitle || null,
          mbid: parsed.mbid || null,
          url: parsed.trackUrl || null,
          nowPlaying: Boolean(parsed.nowPlaying),
          tags: parsed.tags || []
        },
        metadata: {
          source: 'lastfm-collector',
          collectorVersion: '1.0.0',
          ingestedAt: Date.now()
        }
      };
      kafkaFormattedJson = JSON.stringify(kafkaEvent, null, 2);
    } catch {
      kafkaFormattedJson = '// Error formatting Kafka event';
    }
  }

  const activeContent = viewMode === 'kafka' ? (kafkaFormattedJson || lastRawEvent) : lastRawEvent;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-950 border-b border-indigo-900/60 p-4 text-slate-300 font-mono text-xs">
      <div className="max-w-7xl mx-auto space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-slate-100 uppercase tracking-wider">
              Data Stream & Kafka Inspector
            </span>
            <span className="bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded text-[10px]">
              {connectionStatus}
            </span>
            <span className="text-slate-400 text-[11px]">
              Events: <strong className="text-emerald-400">{eventCount}</strong>
            </span>

            {/* View Mode Toggle */}
            <div className="inline-flex rounded-md bg-slate-900 p-0.5 border border-slate-800 ml-2">
              <button
                onClick={() => setViewMode('kafka')}
                className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold transition-colors flex items-center gap-1 ${
                  viewMode === 'kafka'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Database className="w-3 h-3" />
                Kafka Event Schema
              </button>
              <button
                onClick={() => setViewMode('sse')}
                className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold transition-colors ${
                  viewMode === 'sse'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Raw SSE Payload
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy JSON'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Schema details badge */}
        <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-900/80 p-2 rounded border border-slate-800">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            {viewMode === 'kafka' ? (
              <>
                <strong>Kafka Payload Model:</strong> Partition key is <code className="text-indigo-300">user.username</code>. Ready for consumption by downstream Kafka consumer groups.
              </>
            ) : (
              <>
                <strong>SSE Stream Model:</strong> Live streaming Last.fm Audioscrobbler real-time play events.
              </>
            )}
          </span>
        </div>

        {/* JSON Preview */}
        <div className="relative bg-slate-900 rounded-lg p-3 border border-slate-800 max-h-64 overflow-y-auto">
          <pre className="text-emerald-400 leading-relaxed overflow-x-auto text-[11px]">
            {activeContent || '// Waiting for first real scrobble event... (Configure LASTFM_API_KEY in .env)'}
          </pre>
        </div>
      </div>
    </div>
  );
};
