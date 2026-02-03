# Kafka Setup (Optional)

## Current Status

The ingestion service is configured to work **without Kafka**. It will run in degraded mode if Kafka is not available, but will still accept and process data.

## Why Kafka Errors?

The Kafka connection errors you see are **expected** if Kafka is not running. The service will:
- ✅ Continue to accept HTTP/WebSocket/MQTT data
- ✅ Process and validate data
- ✅ Store data in Redis (if available)
- ❌ Skip publishing to Kafka (if Kafka is unavailable)

## To Use Kafka (Optional)

### Option 1: Use Docker Compose (Recommended)

Kafka is already configured in `docker-compose.yml`. To start it:

```bash
docker compose up -d zookeeper kafka
```

### Option 2: Install Kafka Locally

```bash
# macOS
brew install kafka

# Start Zookeeper
zookeeper-server-start /opt/homebrew/etc/kafka/zookeeper.properties

# Start Kafka (in another terminal)
kafka-server-start /opt/homebrew/etc/kafka/server.properties
```

### Option 3: Run Without Kafka

**This is fine!** The service will work without Kafka. You'll just miss:
- Message queuing for downstream processing
- Event streaming capabilities

All other features (HTTP ingestion, validation, Redis caching) will work normally.

## Suppressing Kafka Errors

The errors are now suppressed in the logs. The service will:
- Only show one warning when Kafka is unavailable
- Skip Kafka operations silently
- Continue normal operation

## Verify Kafka is Running

```bash
# Check if Kafka is listening
nc -zv localhost 9092

# Or check Docker containers
docker ps | grep kafka
```

## Configuration

Kafka settings are in `.env`:
```
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
```

You can change this to point to a remote Kafka cluster if needed.

