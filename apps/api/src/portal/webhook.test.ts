import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isFromMatchmaker, verifyHmac } from './webhook.js';

describe('verifyHmac — orden obligatorio de docs/05', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ id: 'evt_1', type: 'team.updated' });
  const sign = (raw: string) => createHmac('sha256', secret).update(raw).digest('hex');

  it('acepta una firma válida', () => {
    expect(verifyHmac(body, sign(body), secret)).toBe(true);
  });

  it('rechaza una firma incorrecta', () => {
    expect(verifyHmac(body, sign('otro body'), secret)).toBe(false);
  });

  it('rechaza cuando falta el header', () => {
    expect(verifyHmac(body, undefined, secret)).toBe(false);
  });

  it('rechaza una firma de otro largo sin lanzar', () => {
    expect(verifyHmac(body, 'abc', secret)).toBe(false);
  });
});

describe('isFromMatchmaker — guardarraíl anti-bucle de ADR-004', () => {
  it('detecta al propio agente', () => {
    expect(isFromMatchmaker({ data: { senderId: 'agent:matchmaker' } })).toBe(true);
  });

  it('deja pasar eventos de otro origen', () => {
    expect(isFromMatchmaker({ data: { senderId: 'per_camilo' } })).toBe(false);
  });

  it('deja pasar un evento sin data', () => {
    expect(isFromMatchmaker({})).toBe(false);
  });
});
