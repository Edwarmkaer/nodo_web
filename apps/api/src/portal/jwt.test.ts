import { generateKeyPairSync } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { buildJwks, PortalTokenIssuer } from './jwt.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const ISSUER = 'https://api.nodo.test';
const KID = 'nodo-1';

describe('PortalTokenIssuer + JWKS — mecanismo de ADR-006', () => {
  it('firma un token que el propio JWKS puede verificar', async () => {
    const issuer = await PortalTokenIssuer.create(privateKeyPem, ISSUER, KID);
    const { token, expiresIn } = await issuer.issue({
      personId: 'per_camilo',
      handle: 'camilo',
      name: 'Camilo',
      teams: { tm_healthai: 'member' },
    });
    expect(expiresIn).toBe(900);

    const jwks = await buildJwks(privateKeyPem, KID);
    const keySet = createLocalJWKSet(jwks);
    const { payload, protectedHeader } = await jwtVerify(token, keySet, { issuer: ISSUER });

    expect(protectedHeader.kid).toBe(KID);
    expect(payload.sub).toBe('per_camilo');
    expect(payload.handle).toBe('camilo');
    expect(payload.teams).toEqual({ tm_healthai: 'member' });
  });

  it('el kid de la cabecera coincide con la entrada del JWKS', async () => {
    const jwks = await buildJwks(privateKeyPem, KID);
    expect(jwks.keys[0]?.kid).toBe(KID);
    expect(jwks.keys[0]).not.toHaveProperty('d'); // nunca la clave privada
  });

  it('rechaza un issuer distinto', async () => {
    const issuer = await PortalTokenIssuer.create(privateKeyPem, ISSUER, KID);
    const { token } = await issuer.issue({
      personId: 'per_camilo',
      handle: 'camilo',
      name: 'Camilo',
      teams: {},
    });
    const jwks = await buildJwks(privateKeyPem, KID);
    const keySet = createLocalJWKSet(jwks);

    await expect(
      jwtVerify(token, keySet, { issuer: 'https://otro.issuer' }),
    ).rejects.toThrow();
  });
});
