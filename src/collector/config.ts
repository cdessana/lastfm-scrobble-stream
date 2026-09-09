import type { CollectorConfig } from './types.js';
import { logger } from './logger.js';

export function loadCollectorConfig(): CollectorConfig {
  const lastFmApiKey = process.env.LASTFM_API_KEY?.trim() || '';

  // Parse monitored users: comma-separated list (defaults to 'cdessana' for dry-run verification)
  const rawUsers = process.env.LASTFM_USERS?.trim() || 'cdessana';
  const monitoredUsers = rawUsers
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  // Poll interval in ms (default: 10,000 ms = 10s, min: 2,000 ms to respect Last.fm rate guidelines)
  const parsedPollInterval = parseInt(process.env.LASTFM_POLL_INTERVAL_MS || '10000', 10);
  const pollIntervalMs = Math.max(isNaN(parsedPollInterval) ? 10000 : parsedPollInterval, 2000);

  // Recent tracks fetch limit (default: 5, max: 50)
  const parsedLimit = parseInt(process.env.LASTFM_LIMIT || '5', 10);
  const fetchLimit = Math.min(Math.max(isNaN(parsedLimit) ? 5 : parsedLimit, 1), 50);

  // Kafka configuration
  const rawBootstrap = process.env.KAFKA_BOOTSTRAP_SERVERS || process.env.KAFKA_BROKERS || '';
  const bootstrapServers = rawBootstrap
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Enabled ONLY if explicitly set to 'true'. Defaults strictly to false (dry-run mode).
  const kafkaExplicit = process.env.KAFKA_PRODUCER_ENABLED;
  const kafkaEnabled = kafkaExplicit?.toLowerCase() === 'true';

  const topic = process.env.KAFKA_TOPIC?.trim() || 'lastfm.scrobbles';
  const clientId = process.env.KAFKA_CLIENT_ID?.trim() || 'lastfm-collector-producer';

  const acksRaw = process.env.KAFKA_ACKS?.trim() || '-1';
  const acks = acksRaw === '0' ? 0 : acksRaw === '1' ? 1 : -1;

  const compression = (process.env.KAFKA_COMPRESSION?.toLowerCase() as CollectorConfig['kafka']['compression']) || 'gzip';

  const securityProtocol = process.env.KAFKA_SECURITY_PROTOCOL?.toUpperCase() as CollectorConfig['kafka']['securityProtocol'];
  const saslMechanism = process.env.KAFKA_SASL_MECHANISM?.toLowerCase() as CollectorConfig['kafka']['saslMechanism'];
  const saslUsername = process.env.KAFKA_SASL_USERNAME?.trim();
  const saslPassword = process.env.KAFKA_SASL_PASSWORD?.trim();

  const config: CollectorConfig = {
    lastFmApiKey,
    monitoredUsers,
    pollIntervalMs,
    fetchLimit,
    kafka: {
      enabled: kafkaEnabled,
      bootstrapServers: bootstrapServers.length > 0 ? bootstrapServers : ['localhost:9092'],
      topic,
      clientId,
      acks,
      compression,
      securityProtocol,
      saslMechanism,
      saslUsername,
      saslPassword
    }
  };

  // Structured audit log of loaded configuration (masking secrets)
  logger.info('Collector configuration initialized', {
    hasApiKey: Boolean(config.lastFmApiKey),
    apiKeyPrefix: config.lastFmApiKey ? `${config.lastFmApiKey.substring(0, 4)}***` : 'NONE',
    userCount: config.monitoredUsers.length,
    users: config.monitoredUsers,
    pollIntervalMs: config.pollIntervalMs,
    kafkaEnabled: config.kafka.enabled,
    kafkaBootstrapServers: config.kafka.bootstrapServers,
    kafkaTopic: config.kafka.topic,
    kafkaClientId: config.kafka.clientId
  });

  return config;
}
