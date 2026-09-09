# Last.fm Standalone Data Collector & Kafka Producer

> **Note:** The initial version of this project was developed with Google AI Studio as part of a hands-on exploration of the platform and its capabilities.

A high-reliability, real-data collector that ingests live playback and scrobbles from the **Last.fm Audioscrobbler API** and publishes structured streaming events directly to an **Apache Kafka** cluster.

Designed as an independent data ingestion producer for Apache Kafka learning projects, streaming analytics pipelines (Flink, Spark, Kafka Streams), or real-time event-driven architectures.

---

## 1. Project Purpose & Philosophy

- **Real Data Only:** All mock, random, synthetic, and hardcoded listening data have been completely removed. The pipeline operates exclusively against real Last.fm user streams.
- **Standalone Producer:** This repository contains only the collector and Kafka producer integration. It does not contain Kafka brokers, zookeepers, Docker containers, consumers, or databases, preserving complete independence from your Kafka cluster infrastructure.
- **Production-Grade Resilience:** Features automatic HTTP 429 rate-limit backoff, in-memory deduplication, non-blocking Kafka publishing, and graceful shutdown handling.

---

## 2. Architecture & Data Flow

```
[ Last.fm Audioscrobbler API v2.0 ]
                │
                │ HTTP Polling (user.getrecenttracks)
                ▼
      ┌───────────────────┐
      │   LastFmClient    │ ◄─── Rate-Limiting & Exponential Backoff (429 handling)
      └─────────┬─────────┘
                │ Raw Track JSON
                ▼
      ┌───────────────────┐
      │  CollectorEngine  │ ◄─── Round-robin user polling & cycle orchestration
      └─────────┬─────────┘
                │
                ├───────────────────────────────────────┐
                ▼                                       ▼
     ┌──────────────────────┐               ┌───────────────────────┐
     │  EventDeduplicator   │               │ Server-Sent Events    │
     │  (Bounded FIFO ring) │               │ (SSE /api/stream)     │
     └──────────┬───────────┘               └───────────┬───────────┘
                │ Unique scrobbles                      │
                ▼                                       ▼
     ┌──────────────────────┐               ┌───────────────────────┐
     │ KafkaScrobbleProducer│               │ Live Web Dashboard    │
     │ (KafkaJS Producer)   │               │ (Telemetry & Filters) │
     └──────────┬───────────┘               └───────────────────────┘
                │
                │ Partition Key: user.username
                ▼
[ External Apache Kafka Cluster ]
(Topic: lastfm.scrobbles.raw)
```

### Components:
1. **`LastFmClient` (`src/collector/lastfm-client.ts`):** Handles HTTP communication with `ws.audioscrobbler.com/2.0/`, response normalization, and rate-limit backoffs.
2. **`CollectorEngine` (`src/collector/engine.ts`):** Orchestrates polling across the configured user pool, tracking active play states and delegating to the deduplicator.
3. **`EventDeduplicator` (`src/collector/deduplicator.ts`):** Employs a bounded FIFO cache to prevent republishing the same scrobble or `nowplaying` state across poll intervals.
4. **`KafkaScrobbleProducer` (`src/collector/kafka-producer.ts`):** Connects to your external Kafka cluster via `kafkajs`, publishing structured `KafkaScrobbleEvent` messages keyed by username.
5. **Real-Time Web UI (`src/App.tsx`):** Provides a visual dashboard to inspect live scrobbles, monitor Kafka connectivity, track specific artists, and inspect the raw Kafka JSON payloads.

---

## 3. Installation & Getting Started

### Prerequisites
- Node.js 18.0.0 or higher
- A Last.fm API Key ([Get a free API key here](https://www.last.fm/api/account/create))
- An Apache Kafka broker (local, Dockerized, or cloud-hosted such as Confluent, Redpanda, or Aiven)

### Step 1: Clone and Install Dependencies
```bash
git clone <repository-url>
cd lastfm-kafka-collector
npm install
```

### Step 2: Configure Environment Variables
Copy the template configuration:
```bash
cp .env.example .env
```
Edit `.env` and provide your credentials (see section below).

### Step 3: Run the Collector
To run in development mode (Express server + Vite UI on port 3000):
```bash
npm run dev
```

To build and run in production mode:
```bash
npm run build
npm start
```

---

## 4. Configuration & Environment Variables

All settings are configured via environment variables or a `.env` file at the root:

| Variable | Type | Default | Description |
|---|---|---|---|
| `LASTFM_API_KEY` | `string` | *(empty)* | **Required.** Your Last.fm Audioscrobbler API key. |
| `LASTFM_USERS` | `string` | `rj,muesli` | Comma-separated list of Last.fm usernames to poll. |
| `LASTFM_POLL_INTERVAL_MS` | `number` | `10000` | Polling interval per cycle in milliseconds (min: 2000). |
| `KAFKA_PRODUCER_ENABLED` | `boolean` | `false` | Enable/disable sending events to Kafka (set to `true` to publish). |
| `KAFKA_BROKERS` | `string` | `localhost:9092` | Comma-separated list of Kafka broker endpoints. |
| `KAFKA_CLIENT_ID` | `string` | `lastfm-collector` | Client ID identifying this producer in Kafka logs. |
| `KAFKA_TOPIC` | `string` | `lastfm.scrobbles.raw` | Kafka topic where scrobble events are published. |
| `KAFKA_COMPRESSION` | `string` | `gzip` | Message compression codec (`none`, `gzip`, `snappy`, `lz4`). |
| `KAFKA_PRODUCER_RETRIES` | `number` | `5` | Maximum delivery retry attempts for transient errors. |
| `KAFKA_PRODUCER_TIMEOUT_MS` | `number` | `30000` | Kafka socket and request timeout in milliseconds. |
| `PORT` | `number` | `3000` | HTTP server port for the dashboard and SSE stream. |

> **Note on Dry-Run Mode:** If `KAFKA_PRODUCER_ENABLED=false`, the collector operates in dry-run mode: it polls Last.fm, deduplicates events, logs messages, and streams them to the UI via SSE, but skips Kafka network socket transmission.

---

## 5. Kafka Message Schema (`KafkaScrobbleEvent`)

Messages are published as serialized JSON UTF-8 strings. The message key is set to `user.username` to ensure that all events for a given listener route to the same Kafka partition, preserving chronological ordering.

### Sample Kafka Message Payload:
```json
{
  "eventId": "lastfm-rj-1710000000-0",
  "eventType": "TRACK_SCROBBLED",
  "schemaVersion": "1.0.0",
  "timestamp": 1710000000000,
  "user": {
    "username": "rj",
    "realName": "Richard Jones",
    "country": "United Kingdom",
    "playcount": 128450
  },
  "track": {
    "name": "Myth",
    "artist": "Beach House",
    "album": "Bloom",
    "mbid": "60a4b75a-38bb-4eb9-b883-7c3858c16053",
    "url": "https://www.last.fm/music/Beach+House/_/Myth",
    "nowPlaying": false,
    "tags": ["dream pop", "indie", "shoegaze"]
  },
  "metadata": {
    "source": "lastfm-collector",
    "collectorVersion": "1.0.0",
    "ingestedAt": 1710000005120
  }
}
```

### Event Types:
- `TRACK_NOW_PLAYING`: Emitted when a listener starts playback of a track (Last.fm `@attr.nowplaying = true`).
- `TRACK_SCROBBLED`: Emitted when a track playback has concluded and has been recorded to the user's permanent scrobble history with an official UTC timestamp.

### Downstream Consumer Partitioning Strategy:
- **Partition Key:** `user.username`
- **Guarantees:** In-order delivery per user across partition consumers.
- **Consumer Group Sizing:** Scale consumer partitions based on the size of your active user pool.

---

## 6. Error Handling & Operational Resilience

1. **HTTP 429 & Last.fm Rate Limiting:**
   Last.fm limits requests to approximately 5 queries/sec per API key. If the API returns HTTP 429 or status `29` (Rate limit exceeded), `LastFmClient` activates a 15-second cool-down backoff and exponential retry loop before resuming polls.

2. **Deduplication:**
   Polling an active user every few seconds could result in retrieving the same currently playing track multiple times. The `EventDeduplicator` creates a composite key (`username:artist:track:timestamp:nowPlaying`) stored in a bounded in-memory ring buffer (10,000 keys) to ensure events are published to Kafka exactly once per state transition.

3. **Kafka Connection Resiliency:**
   `KafkaScrobbleProducer` handles broker disconnections gracefully. If Kafka is unavailable at startup or during temporary network interruptions, the producer logs warnings with structured metadata and attempts reconnection with configurable retries, without crashing the HTTP server.

4. **Graceful Shutdown:**
   Upon receiving `SIGINT` or `SIGTERM`, the collector halts the polling timer, flushes in-flight Kafka producer batches, disconnects the Kafka client cleanly, and closes active SSE listener streams.

---

## 7. Operational Modes: Dry-Run vs. External Kafka Cluster

### Mode 1: Dry-Run Mode (Default)
In dry-run mode, the collector:
- Connects to the real Last.fm Audioscrobbler API using `LASTFM_API_KEY`.
- Continuously polls real playback from monitored users (e.g. `LASTFM_USERS=cdessana`).
- Performs deduplication to eliminate repeated polls of the same track.
- Formats each scrobble into a validated `KafkaScrobbleEvent` JSON object.
- Logs the collected events to structured JSON logs.
- Streams events to the browser dashboard via Server-Sent Events (`/api/stream`).
- **Skips all network socket calls to Apache Kafka.** No Kafka brokers are contacted or required.

Configuration for Dry-Run Mode:
```env
LASTFM_API_KEY="<your-lastfm-api-key>"
LASTFM_USERS="cdessana"
KAFKA_PRODUCER_ENABLED=false
```

---

### Mode 2: Switching to an External Kafka Cluster
When your external Kafka cluster is running (in your separate Kafka learning project):

1. **Verify your Kafka broker endpoint and topic:**
   Ensure the topic exists or topic auto-creation is enabled on your brokers:
   ```bash
   # Example check using Kafka CLI in your Kafka project directory:
   kafka-topics --bootstrap-server localhost:9092 --list
   ```

2. **Update your environment variables in `.env`:**
   ```env
   # Enable Kafka transmission:
   KAFKA_PRODUCER_ENABLED=true

   # Point to your external broker(s):
   KAFKA_BOOTSTRAP_SERVERS="localhost:9092"

   # Set the destination topic:
   KAFKA_TOPIC="lastfm.scrobbles"

   # Client ID identifying this producer:
   KAFKA_CLIENT_ID="lastfm-collector-producer"
   ```

3. **Restart the collector:**
   ```bash
   npm run dev
   ```
   The engine will initialize `KafkaScrobbleProducer`, connect to `KAFKA_BOOTSTRAP_SERVERS`, and publish each deduplicated scrobble using `user.username` as the partition key.

4. **Verify incoming messages with a Kafka consumer:**
   In your separate Kafka environment:
   ```bash
   kafka-console-consumer --bootstrap-server localhost:9092 --topic lastfm.scrobbles --from-beginning
   ```

---

## 8. Ingestion Semantics & Known Behavior: Concurrent "Now Playing" Events

### Observed Behavior
In the stream and web dashboard, it is possible to observe more than one track marked as `"Now Playing"` (`isNowPlaying: true`) for the same user, even when the user is only listening on a single physical device.

---

### Technical Root Causes

1. **Event Streaming (Immutable Log) vs. State Storage:**
   - Apache Kafka and this collector operate on an **append-only immutable event stream** model.
   - When **Track A** begins playback, a `TRACK_NOW_PLAYING` event is emitted.
   - When the user advances or skips to **Track B**, a new `TRACK_NOW_PLAYING` event is emitted.
   - In a pure event stream, historical events are not retroactively mutated or deleted. Without a downstream state store (e.g., a `KTable` in Kafka Streams or a materialized view in Flink), both events remain in the raw event history.

2. **Last.fm's Dual Representation of Songs:**
   - Last.fm represents playback in two distinct formats:
     - **Active Playback:** `@attr.nowplaying = "true"`, without a UTC timestamp.
     - **Completed Scrobble:** An entry containing a permanent `date.uts` UNIX timestamp once recorded.
   - Because they represent different moments in time, they generate different event IDs:
     - `nowplaying:{user}:{artist}:{track}`
     - `scrobble:{user}:{uts}:{artist}:{track}`
   - The arrival of a completed scrobble event does not retroactively remove or mutate the preceding `nowplaying` event in an append-only event stream.

3. **In-Memory Buffer & Dashboard Accumulation:**
   - The local inspection feed (`scrobbleBuffer` in `server.ts` and `useScrobbleStream.ts` in the UI) currently acts as a raw FIFO queue of emitted events.
   - It appends each incoming event to the view without collapsing or reconciling active playback per user account.

4. **Polling Deduplication Interplay:**
   - When Spotify or Last.fm scrobbles a track midway through playback, Last.fm's API returns both the completed scrobble and the active `nowplaying` flag for the same track in the same response payload.
   - If the deduplicator clears the active listening session when processing the completed scrobble, the adjacent `nowplaying` entry can be re-evaluated as a fresh listening session on subsequent polling cycles.

---

### Recommended Patterns for Downstream Kafka Consumers

If your downstream architecture requires a single, authoritative "Current Playback" status per user:

* **Use Keyed State Stores (`KTable` or Flink State):**
  Consume from the topic using the partition key `user.username`. Maintain a state store where any newer event for a username updates the active track state.
* **Treat `TRACK_NOW_PLAYING` as Ephemeral State:**
  Consider `TRACK_NOW_PLAYING` events as heartbeat status signals with an expiration window (e.g., TTL of track duration or 5 minutes).
* **Treat `TRACK_SCROBBLED` as Fact Records:**
  Store `TRACK_SCROBBLED` events in append-only storage (e.g., data warehouse or analytics store) as immutable historical records.

---

## 9. Development & Verification

### Running Linter & Typecheck:
```bash
npm run lint
```

### Production Build:
```bash
npm run build
npm start
```
