import { describe, expect, it } from 'vitest';
import type { MainEvent } from '@nodo/contracts';
import { FakePortalPublisher } from './fake-publisher.js';
import { EventPublisher, type OutboxStore, type WatermarkStore } from './event-publisher.js';

class InMemoryWatermarks implements WatermarkStore {
  seqByChannel = new Map<string, number>();
  async record(channel: string, seq: number): Promise<void> {
    this.seqByChannel.set(channel, seq);
  }
}

class InMemoryOutbox implements OutboxStore {
  queued: Array<{ channel: string; envelope: unknown }> = [];
  async enqueue(channel: string, envelope: unknown): Promise<void> {
    this.queued.push({ channel, envelope });
  }
}

const envelope = { type: 'team.updated', payload: {} } as unknown as MainEvent;

describe('EventPublisher — commit → publish (ADR-005)', () => {
  it('actualiza la marca de agua solo para network-main, tras publicar con éxito', async () => {
    const portal = new FakePortalPublisher();
    const watermarks = new InMemoryWatermarks();
    const outbox = new InMemoryOutbox();
    const publisher = new EventPublisher(portal, watermarks, outbox);

    await publisher.publishMain(envelope);

    expect(portal.published).toHaveLength(1);
    expect(portal.published[0]?.channel).toBe('network-main');
    expect(watermarks.seqByChannel.get('network-main')).toBe(1);
    expect(outbox.queued).toHaveLength(0);
  });

  it('un sobre de equipo no toca la marca de agua', async () => {
    const portal = new FakePortalPublisher();
    const watermarks = new InMemoryWatermarks();
    const outbox = new InMemoryOutbox();
    const publisher = new EventPublisher(portal, watermarks, outbox);

    await publisher.publishTeam('tm_healthai', envelope as never);

    expect(portal.published[0]?.channel).toBe('team-tm_healthai');
    expect(watermarks.seqByChannel.size).toBe(0);
  });

  it('si Portal falla, encola en outbox y no lanza — el estado en Postgres ya es correcto', async () => {
    const portal = new FakePortalPublisher();
    portal.failNext = true;
    const watermarks = new InMemoryWatermarks();
    const outbox = new InMemoryOutbox();
    const publisher = new EventPublisher(portal, watermarks, outbox);

    await expect(publisher.publishMain(envelope)).resolves.toBeUndefined();

    expect(outbox.queued).toHaveLength(1);
    expect(outbox.queued[0]?.channel).toBe('network-main');
    expect(watermarks.seqByChannel.size).toBe(0);
  });
});
