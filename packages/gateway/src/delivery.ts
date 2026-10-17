import { randomBytes } from "node:crypto";
import type { DeliveryRecord, OpaqueId } from "@asi/contracts";
import "@asi/episodic";
import "@asi/telemetry";

export interface DeliveryConfig {
  maxRetries: number;
  retryDelayMs: number;
  signingKey: Uint8Array;
  keyId: string;
}

export interface DeliveryResult {
  remoteReceiptId?: string;
  status: "sent" | "unknown" | "failed";
  deliveredAt: string;
}

export interface OutboxRecord {
  id: OpaqueId;
  record: DeliveryRecord;
  attempts: number;
  status: "pending" | "sent" | "failed";
  createdAt: string;
  lastAttemptAt?: string;
  remoteReceiptId?: string;
}

type ChannelDeliveryResult =
  | { status: "sent"; remoteReceiptId: string }
  | { status: "unknown"; remoteReceiptId?: string };

export class DeliveryManager {
  private config: DeliveryConfig;
  private outbox: Map<string, OutboxRecord> = new Map();

  constructor(config: DeliveryConfig) {
    this.config = config;
  }

  async deliverReply(record: DeliveryRecord): Promise<DeliveryResult> {
    const outboxId = `outbox-${randomBytes(8).toString("hex")}`;

    const outboxRecord: OutboxRecord = {
      id: outboxId,
      record,
      attempts: 0,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    this.outbox.set(outboxRecord.id, outboxRecord);

    try {
      const result = await this.attemptDelivery(outboxRecord);
      return result;
    } catch {
      return {
        status: "failed",
        deliveredAt: new Date().toISOString(),
      };
    }
  }

  private async attemptDelivery(outboxRecord: OutboxRecord): Promise<DeliveryResult> {
    // Simulate channel delivery
    const channelResult = await this.sendViaChannel();

    if (channelResult.status === "sent") {
      outboxRecord.status = "sent";
      outboxRecord.remoteReceiptId = channelResult.remoteReceiptId;
      outboxRecord.lastAttemptAt = new Date().toISOString();

      // Persist delivery confirmation
      await this.persistDeliveryConfirmation();

      return {
        remoteReceiptId: channelResult.remoteReceiptId,
        status: "sent",
        deliveredAt: new Date().toISOString(),
      };
    } else {
      outboxRecord.attempts++;
      outboxRecord.lastAttemptAt = new Date().toISOString();

      if (outboxRecord.attempts >= this.config.maxRetries) {
        outboxRecord.status = "failed";
        return {
          status: "failed",
          deliveredAt: new Date().toISOString(),
        };
      }

      // Schedule retry
      setTimeout(() => this.attemptDelivery(outboxRecord), this.config.retryDelayMs);
      
      return {
        status: "unknown",
        deliveredAt: new Date().toISOString(),
      };
    }
  }

  private async sendViaChannel(): Promise<ChannelDeliveryResult> {
    // In a real implementation, this would use ChannelAdapter
    // Existing stub: the generated receipt does not confirm remote delivery.
    return {
      status: "sent",
      remoteReceiptId: `receipt-${randomBytes(8).toString("hex")}`,
    };
  }

  private async persistDeliveryConfirmation(): Promise<void> {
    // Persist to durable storage stub; real persistence is out of scope for this layer.
  }

  async reconcileDeliveries(): Promise<void> {
    for (const outboxRecord of this.outbox.values()) {
      if (outboxRecord.status === "pending" && outboxRecord.attempts > 0) {
        // Check if delivery was actually successful
        const isDelivered = await this.checkDeliveryStatus();
        
        if (isDelivered) {
          outboxRecord.status = "sent";
          await this.persistDeliveryConfirmation();
        }
      }
    }
  }

  private async checkDeliveryStatus(): Promise<boolean> {
    // In a real implementation, this would query the channel
    // For now, assume unknown deliveries need reconciliation
    return false;
  }

  getOutboxStats(): { pending: number; sent: number; failed: number } {
    let pending = 0, sent = 0, failed = 0;
    for (const record of this.outbox.values()) {
      switch (record.status) {
        case "pending": pending++; break;
        case "sent": sent++; break;
        case "failed": failed++; break;
      }
    }
    return { pending, sent, failed };
  }
}

export function createDeliveryManager(config: DeliveryConfig): DeliveryManager {
  return new DeliveryManager(config);
}

export function createDeliveryRoutes(): void {
  // HTTP routes for delivery management stub.
}