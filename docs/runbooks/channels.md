# Slack Channel Adapter Runbook

> **Current platform scope — 2026-10-15:** Build and deploy the Windows version only. Linux is allowed only as an optional VM guest for qualified isolation; standalone Linux hosts/releases are deferred. This supersedes earlier platform assumptions in this document. PostgreSQL/Redis and ordinary integration/security tests remain in the Windows work queue. Preserve required protections and tests; unsupported executable paths stay disabled. See ADR 0004.

> Qualification notice (2026-10-10): this is the Task20 operational reference. Consult [the consolidated guide](../v2-build-guide.md#start-here) and live task qualification before using these procedures. Example endpoints, commands, alerts and deployment snippets require matching implementation and service acceptance; this document does not certify them.


## Overview

The Slack Channel Adapter implements the `ChannelAdapter` interface to provide bidirectional communication with Slack workspaces. It handles incoming events via webhook, verifies Slack signatures, manages thread identity, and provides outbound messaging capabilities.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Slack API     │────▶│  Slack Adapter   │────▶│  Gateway Core   │
│  (Events API)   │     │  (Webhook)       │     │  (Ingress)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │  Slack Web API   │
                       │  (chat.postMessage)│
                       └──────────────────┘
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_SIGNING_SECRET` | Yes | Slack app signing secret |
| `SLACK_BOT_TOKEN` | Yes | Bot user OAuth token (xoxb-...) |
| `SLACK_APP_TOKEN` | Optional | App-level token for Socket Mode (xapp-...) |

### Adapter Configuration

```typescript
const adapter = createSlackAdapter({
  name: "slack",
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  botToken: process.env.SLACK_BOT_TOKEN!,
  appToken: process.env.SLACK_APP_TOKEN,
  maxInputSize: 1024 * 1024, // 1 MiB
  timeoutMs: 5000,
});
```

## Webhook Setup

### Slack App Configuration

1. Create a Slack App at https://api.slack.com/apps
2. Enable **Event Subscriptions**
3. Set Request URL to: `https://your-gateway.com/channels/slack/events`
5. Subscribe to bot events:
   - `message.channels`
   - `message.groups`
   - `message.im`
   - `message.mpim`
   - `app_mention`
6. Install to workspace and note the **Signing Secret** and **Bot Token**

### Signature Verification

All incoming requests are verified using Slack's signature scheme:

```
basestring = "v0:{timestamp}:{request_body}"
signature = "v0=" + HMAC_SHA256(signing_secret, basestring)
```

The adapter rejects requests with:
- Missing `x-slack-signature` or `x-slack-request-timestamp` headers
- Timestamp older than 5 minutes (replay protection)
- Invalid signature (HMAC mismatch)

## Event Processing

### Supported Event Types

| Event Type | Description | Handling |
|------------|-------------|----------|
| `message.channels` | Channel messages | Normalized to SessionEvent |
| `message.groups` | Private channel messages | Normalized to SessionEvent |
| `message.im` | Direct messages | Normalized to SessionEvent |
| `message.mpim` | Multi-person IM | Normalized to SessionEvent |
| `app_mention` | Bot mentions | Normalized to SessionEvent |

### Event Filtering

- **Bot messages ignored**: Events with `bot_id` are dropped to prevent loops
- **Deduplication**: Events are deduplicated using `event_ts + channel + user`
- **Thread tracking**: Thread identity preserved via `thread_ts` or `ts`

### Normalized Output

```typescript
{
  event: {
    schemaVersion: 1,
    eventId: "slack-1234567890.123456-abc123",
    tenantId: "T123456",
    sessionId: "C123456",
    platform: "slack",
    externalMessageId: "1234567890.123456",
    traceId: "trace-abc123",
    correlationId: "corr-abc123",
    causationId: "cause-abc123",
    principal: { ... },
    receivedAt: "2026-10-09T12:00:00.000Z",
    content: [{ type: "text", text: "Hello world" }],
    attachments: [
      { attachmentId: "slack-F123", name: "file.pdf", mediaType: "application/pdf", sizeBytes: 1024, url: "https://..." }
    ]
  },
  principal: { ... }
}
```

## Outbound Messaging

### Sending Messages

```typescript
const result = await adapter.sendMessage({
  channel: "C123456",
  text: "Hello world",
  blocks: [
    { type: "section", text: { type: "mrkdwn", text: "Hello *world*!" } }
  ],
  thread_ts: "1234567890.123456", // optional
});
// Returns: { ts: "1234567890.123456", channel: "C123456" }
```

### Thread Replies

```typescript
const result = await adapter.sendThreadReply("C123456", "1234567890.123456", "Thread reply text");
```

## Thread Management

### Thread Identity

The adapter maintains a thread identity map:
- If event has `thread_ts`, uses that as thread ID
- Otherwise uses event `ts` as thread ID
- Mapped per channel: `channel_id → thread_id`

```typescript
const threadId = adapter.getThreadId("C123456");
// Returns thread_ts or message ts
```

## Attachment Handling

File attachments from Slack are included in the normalized event:

```typescript
attachments: [
  {
    attachmentId: "slack-F123456",
    name: "document.pdf",
    mediaType: "application/pdf",
    sizeBytes: 102400,
    url: "https://files.slack.com/files-pri/.../document.pdf"
  }
]
```

Note: Download URLs require the bot token for authentication.

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `Invalid Slack signature` | Invalid signing secret | Verify `SLACK_SIGNING_SECRET` matches Slack app config |
| `Invalid Slack timestamp` | Timestamp > 5 min old | Check server clock synchronization |
| `Missing x-slack-signature` | Header missing | Verify Slack sends signature header |
| `Invalid JSON payload` | Malformed request body | Check Slack request format |

### Retry Logic

The adapter itself doesn't implement retry logic for outbound messages. The gateway's delivery manager handles retries with exponential backoff.

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `slack_events_received_total` | Total events received | N/A |
| `slack_events_invalid_signature` | Invalid signature count | > 10/min |
| `slack_events_deduplicated` | Deduplicated events | > 100/min |
| `slack_outbound_messages_sent` | Messages sent | N/A |
| `slack_outbound_errors` | Send failures | > 5/min |
| `slack_webhook_latency_ms` | Webhook processing time | > 1000ms |

### Health Checks

```bash
# Liveness
curl http://localhost:8080/health/liveness

# Readiness
curl http://localhost:8080/health/readiness
```

## Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
EXPOSE 8080
CMD ["node", "dist/apps/gateway/src/main.js"]
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: gateway
  template:
    metadata:
      labels:
        app: gateway
    spec:
      containers:
      - name: gateway
        image: asi/gateway:latest
        ports:
        - containerPort: 8080
        env:
        - name: SLACK_SIGNING_SECRET
          valueFrom:
            secretKeyRef:
              name: slack-secrets
              key: signing-secret
        - name: SLACK_BOT_TOKEN
          valueFrom:
            secretKeyRef:
              name: slack-secrets
              key: bot-token
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

## Security

### Secrets Management

Never commit secrets to version control. Use:
- Kubernetes Secrets
- HashiCorp Vault
- AWS Secrets Manager
- Environment variables (development only)

### Network Policies

Restrict egress to:
- `slack.com` (API endpoints)
- `files.slack.com` (file downloads)
- Internal services only

## Troubleshooting

### Common Issues

| Symptom | Check |
|---------|-------|
| Events not received | Verify Slack Request URL, check firewall, check signature verification |
| Duplicate events | Check deduplication cache size, verify event_ts uniqueness |
| Thread not tracked | Verify thread_ts handling, check channel mapping |
| Outbound fails | Check bot token permissions, rate limits |

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

### Log Analysis

```bash
# Search for signature errors
grep "Invalid Slack signature" logs/app.log

# Find deduplication hits
grep "deduplicat" logs/app.log

# Trace message flow
grep "slack.*message" logs/app.log | head -20
```

## Supported Message Types

### Inbound (Events API)

| Type | Subtypes | Normalized |
|------|----------|------------|
| `message` | channels, groups, im, mpim | ✅ |
| `app_mention` | - | ✅ |

### Outbound (Web API)

| Method | Supported | Notes |
|--------|-----------|-------|
| `chat.postMessage` | ✅ | Full support |
| `chat.postEphemeral` | ❌ | Planned |
| `chat.update` | ❌ | Planned |
| `chat.delete` | ❌ | Planned |
| `conversations.replies` | ❌ | Planned |
| `files.upload` | ❌ | Planned |

## Testing

### Unit Tests

```bash
npm run test:unit -- packages/channels/src/slack.ts
```

### Integration Tests

```bash
npm run test:integration -- tests/integration/slack.test.ts
```

### Fixture Testing

```bash
# Record Slack events
npm run test:record -- --channel slack

# Replay recorded events
npm run test:replay -- --channel slack
```

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-10-09 | Initial implementation |