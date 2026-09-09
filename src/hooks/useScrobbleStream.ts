import { useState, useEffect, useRef, useCallback } from 'react';
import type { ScrobbleItem, StreamStats } from '../types.js';

export function useScrobbleStream() {
  const [items, setItems] = useState<ScrobbleItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [pendingItems, setPendingItems] = useState<ScrobbleItem[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [lastRawEvent, setLastRawEvent] = useState<string>('');
  const [eventCount, setEventCount] = useState<number>(0);

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const eventSourceRef = useRef<EventSource | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Connect to SSE stream
  const connectStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionStatus('connecting');
    const es = new EventSource('/api/stream');
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnectionStatus('connected');
    };

    es.addEventListener('init', (event: MessageEvent) => {
      try {
        const initialData: ScrobbleItem[] = JSON.parse(event.data);
        const uniqueItems = initialData.filter((item) => {
          if (seenIdsRef.current.has(item.id)) return false;
          seenIdsRef.current.add(item.id);
          return true;
        });

        setItems(uniqueItems);
        setEventCount((prev) => prev + uniqueItems.length);
        setLastRawEvent(JSON.stringify(initialData[0] || {}, null, 2));
      } catch (err) {
        console.error('Failed to parse init stream data:', err);
      }
    });

    es.addEventListener('scrobble', (event: MessageEvent) => {
      try {
        const scrobble: ScrobbleItem = JSON.parse(event.data);
        setLastRawEvent(JSON.stringify(scrobble, null, 2));
        setEventCount((prev) => prev + 1);

        if (seenIdsRef.current.has(scrobble.id)) {
          return;
        }
        seenIdsRef.current.add(scrobble.id);

        if (isPausedRef.current) {
          setPendingItems((prev) => [scrobble, ...prev.slice(0, 49)]);
        } else {
          setItems((prev) => [scrobble, ...prev.slice(0, 199)]);
        }
      } catch (err) {
        console.error('Failed to parse scrobble stream data:', err);
      }
    });

    es.onerror = () => {
      setConnectionStatus('error');
    };
  }, []);

  // Flush pending items when resuming
  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev;
      if (!next && pendingItems.length > 0) {
        setItems((current) => [...pendingItems, ...current].slice(0, 200));
        setPendingItems([]);
      }
      return next;
    });
  }, [pendingItems]);

  const clearFeed = useCallback(() => {
    setItems([]);
    setPendingItems([]);
    seenIdsRef.current.clear();
  }, []);

  // Poll statistics every 4 seconds
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data: StreamStats = await res.json();
          setStats(data);
        }
      } catch {
        // Ignore stats fetch failure
      }
    };

    fetchStats();
    const timer = setInterval(fetchStats, 4000);
    return () => clearInterval(timer);
  }, []);

  // Initialize stream
  useEffect(() => {
    connectStream();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connectStream]);

  return {
    items,
    isPaused,
    pendingCount: pendingItems.length,
    connectionStatus,
    stats,
    lastRawEvent,
    eventCount,
    togglePause,
    clearFeed,
    reconnect: connectStream
  };
}
