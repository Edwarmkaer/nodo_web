import { createPrivateKey, createPublicKey } from 'node:crypto';
import { exportJWK, importPKCS8, importSPKI, SignJWT, type JWK, type KeyLike } from 'jose';

/**
 * Mecanismo de ADR-006, literal: `jose` firma el token y deriva el JWKS de la
 * misma clave, sin construir el JSON a mano.
 */

export type PortalTeamsClaim = Record<string, 'member' | 'applicant'>;

export type IssueTokenInput = {
  personId: string;
  handle: string;
  name: string;
  teams: PortalTeamsClaim;
};

export class PortalTokenIssuer {
  private constructor(
    private readonly privateKey: KeyLike,
    private readonly issuer: string,
    private readonly kid: string,
  ) {}

  static async create(privateKeyPem: string, issuer: string, kid: string) {
    const privateKey = await importPKCS8(privateKeyPem, 'RS256');
    return new PortalTokenIssuer(privateKey, issuer, kid);
  }

  /**
   * `claimMap` de `portal.config.ts` mapea `sub → userId`, `name → username`,
   * `handle → handle`, `teams → teams`. Vida: 15 min (docs/05).
   */
  async issue(input: IssueTokenInput): Promise<{ token: string; expiresIn: number }> {
    const expiresIn = 15 * 60;
    const token = await new SignJWT({ handle: input.handle, name: input.name, teams: input.teams })
      .setProtectedHeader({ alg: 'RS256', kid: this.kid })
      .setIssuer(this.issuer)
      .setSubject(input.personId)
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(this.privateKey);

    return { token, expiresIn };
  }
}

/**
 * `GET /.well-known/jwks.json`. Público y sin auth: solo la clave pública.
 *
 * Se deriva de la misma PEM privada con el `crypto` nativo de Node —más
 * directo que rehacer el viaje por WebCrypto— y solo se ejecuta una vez, al
 * arrancar el proceso.
 */
export const buildJwks = async (
  privateKeyPem: string,
  kid: string,
): Promise<{ keys: JWK[] }> => {
  const publicKeyPem = createPublicKey(createPrivateKey(privateKeyPem))
    .export({ type: 'spki', format: 'pem' })
    .toString();

  const publicKey = await importSPKI(publicKeyPem, 'RS256');
  const jwk = await exportJWK(publicKey);
  return { keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] };
};
