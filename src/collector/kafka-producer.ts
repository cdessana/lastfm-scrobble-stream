import { Kafka, CompressionTypes, logLevel, type Producer } from 'kafkajs';
import type { CollectorConfig, KafkaScrobbleEvent, KafkaPublishResult } from './types.js';
import { getKafkaMessageKey } from './transformer.js';
import { logger } from './logger.js';

export class KafkaScrobbleProducer {
  private producer: Producer | null = null;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;
  private status: 'connected' | 'connecting' | 'disconnected' | 'disabled' | 'error' = 'disconnected';
  private lastError: string | null = null;
  private messagesProduced = 0;
  private messagesFailed = 0;
  private lastProducedAt: number | null = null;

  constructor(private readonly config: CollectorConfig['kafka']) {
    if (!this.config.enabled) {
      this.status = 'disabled';
      logger.info('Kafka producer is disabled by configuration (dry-run mode)');
    }
  }

  public getStatus() {
    return {
      enabled: this.config.enabled,
      status: this.status,
      bootstrapServers: this.config.bootstrapServers,
      topic: this.config.topic,
      clientId: this.config.clientId,
      messagesProduced: this.messagesProduced,
      messagesFailed: this.messagesFailed,
      lastProducedAt: this.lastProducedAt,
      lastError: this.lastError
    };
  }

  public async connect(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    if (this.isConnected && this.producer) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.status = 'connecting';
    this.connectionPromise = (async () => {
      try {
        const kafkaConfig: Record<string, unknown> = {
          clientId: this.config.clientId,
          brokers: this.config.bootstrapServers,
          logLevel: logLevel.NOTHING, // Handled by our own structured logger
          retry: {
            initialRetryTime: 300,
            retries: 5
          }
        };

        if (this.config.securityProtocol === 'SSL' || this.config.securityProtocol === 'SASL_SSL') {
          kafkaConfig.ssl = true;
        }

        if (this.config.saslUsername && this.config.saslPassword) {
          kafkaConfig.sasl = {
            mechanism: this.config.saslMechanism || 'plain',
            username: this.config.saslUsername,
            password: this.config.saslPassword
          };
        }

        const kafka = new Kafka(kafkaConfig as unknown as ConstructorParameters<typeof Kafka>[0]);

        this.producer = kafka.producer({
          allowAutoTopicCreation: true,
          idempotent: false // Standard producer for wide broker compatibility
        });

        await this.producer.connect();
        this.isConnected = true;
        this.status = 'connected';
        this.lastError = null;

        logger.info('Kafka producer connected successfully to broker(s)', {
          brokers: this.config.bootstrapServers,
          topic: this.config.topic,
          clientId: this.config.clientId
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.status = 'error';
        this.lastError = msg;
        this.isConnected = false;
        logger.error('Failed to connect Kafka producer to external broker(s)', {
          brokers: this.config.bootstrapServers,
          error: msg
        });
      } finally {
        this.connectionPromise = null;
      }
    })();

    return this.connectionPromise;
  }

  public async publishEvent(event: KafkaScrobbleEvent): Promise<KafkaPublishResult | null> {
    if (!this.config.enabled) {
      logger.debug('Kafka producer disabled, skipping message send', { eventId: event.eventId });
      return null;
    }

    if (!this.isConnected || !this.producer) {
      // Attempt reconnection
      try {
        await this.connect();
      } catch {
        // Logged in connect()
      }
    }

    if (!this.isConnected || !this.producer) {
      this.messagesFailed++;
      logger.warn('Unable to publish to Kafka: producer is not connected', {
        topic: this.config.topic,
        eventId: event.eventId,
        brokers: this.config.bootstrapServers
      });
      return null;
    }

    const key = getKafkaMessageKey(event);
    const value = JSON.stringify(event);

    try {
      const recordMetadata = await this.producer.send({
        topic: this.config.topic,
        acks: this.config.acks,
        compression: this.config.compression === 'gzip' ? CompressionTypes.GZIP : CompressionTypes.None,
        messages: [
          {
            key,
            value,
            timestamp: String(Date.now()),
            headers: {
              'source': 'lastfm-collector',
              'eventType': event.eventType,
              'eventVersion': event.eventVersion,
              'username': event.user.username
            }
          }
        ]
      });

      this.messagesProduced++;
      this.lastProducedAt = Date.now();
      this.status = 'connected';
      this.lastError = null;

      const firstMeta = recordMetadata[0];
      const result: KafkaPublishResult = {
        topic: firstMeta?.topicName || this.config.topic,
        partition: firstMeta?.partition ?? 0,
        offset: firstMeta?.offset || '0',
        timestamp: new Date().toISOString(),
        key
      };

      logger.info('Published scrobble event to Kafka topic', {
        topic: result.topic,
        partition: result.partition,
        offset: result.offset,
        key,
        eventId: event.eventId,
        eventType: event.eventType,
        track: `${event.artist.name} - ${event.track.title}`,
        user: event.user.username
      });

      return result;
    } catch (err: unknown) {
      this.messagesFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      this.status = 'error';
      this.lastError = msg;
      logger.error('Error publishing event to Kafka', {
        topic: this.config.topic,
        eventId: event.eventId,
        error: msg
      });
      return null;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.producer && this.isConnected) {
      try {
        await this.producer.disconnect();
        this.isConnected = false;
        this.status = 'disconnected';
        logger.info('Kafka producer disconnected cleanly');
      } catch (err) {
        logger.warn('Error disconnecting Kafka producer', { error: String(err) });
      }
    }
  }
}
