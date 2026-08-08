import { describe, expect, it, vi, afterEach } from 'vitest';
import type { AnyEvent } from '@nodo/contracts';
import { HttpPortalPublisher, PortalHttpError } from './http-publisher.js';

const envelope = {
  v: 1,
  type: 'match.suggested',
  id: 'evt_01',
  at: 1,
  actor: { kind: 'agent', id: 'matchmaker', displayName: 'MatchMaker' },
  payload: {},
  summary: { text: 't', icon: '🔗', refs: [] },
  graph: {},
} as unknown as AnyEvent;

afterEach(() => vi.unstubAllGlobals());

describe('HttpPortalPublisher', () => {
  it('envuelve el Envelope de dominio en el sobre de transporte de Portal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'm_1', seq: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const publisher = new HttpPortalPublisher('https://api.useportal.co', 'sk_test');
    const result = await publisher.publish('network-main', envelope);

    expect(result).toEqual({ id: 'm_1', seq: 1 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.useportal.co/v1/channels/network-main/messages');
    expect(JSON.parse(init.body as string)).toEqual({
      senderId: 'agent:matchmaker',
      type: 'match.suggested',
      content: envelope,
    });
  });

  it('lanza PortalHttpError si Portal rechaza la publicación', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}) }),
    );
    const publisher = new HttpPortalPublisher('https://api.useportal.co', 'sk_test');
    await expect(publisher.publish('network-main', envelope)).rejects.toThrow(PortalHttpError);
  });
});
