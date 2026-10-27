// Authentication and role lookup for the Growth API.
//
// Cloudflare Access sits in front of the Pages site and attaches a signed
// JWT (Cf-Access-JWT-Assertion) to every request it lets through. We verify
// that signature here against the team's public keys, so we never trust a
// plain email header a client could forge.
//
// Local development: when ENVIRONMENT is not "production" and DEV_AUTH_ROLE
// is set, that role is used without a JWT. Ignored in production.

export type Role = 'manager' | 'leadership'

export type AuthEnv = {
  DB: D1Database
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  ENVIRONMENT?: string
  DEV_AUTH_ROLE?: string
}

export type AuthedUser = { email: string; role: Role }

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string }

let jwksCache: { domain: string; keys: Jwk[]; fetchedAt: number } | null = null
const JWKS_TTL_MS = 60 * 60 * 1000

function base64UrlToBytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function decodeJsonPart(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)))
}

async function getKeys(domain: string): Promise<Jwk[]> {
  if (jwksCache && jwksCache.domain === domain && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys
  }
  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`)
  if (!res.ok) throw new Error(`failed to fetch Access certs (${res.status})`)
  const body = (await res.json()) as { keys: Jwk[] }
  jwksCache = { domain, keys: body.keys, fetchedAt: Date.now() }
  return body.keys
}

// Returns the verified email from a Cf-Access-JWT-Assertion token, or null.
export async function verifyAccessJwt(token: string, env: AuthEnv): Promise<string | null> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const header = decodeJsonPart(parts[0]) as { kid?: string; alg?: string }
  const payload = decodeJsonPart(parts[1]) as { aud?: string[] | string; exp?: number; email?: string; iss?: string }

  if (header.alg !== 'RS256' || !header.kid) return null
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null
  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audList.includes(env.ACCESS_AUD)) return null
  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null

  const keys = await getKeys(env.ACCESS_TEAM_DOMAIN)
  const jwk = keys.find((k) => k.kid === header.kid)
  if (!jwk) return null

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  )
  if (!valid || !payload.email) return null
  return payload.email.toLowerCase()
}

export async function lookupRole(db: D1Database, email: string): Promise<Role | null> {
  const row = await db
    .prepare('SELECT role FROM role_assignments WHERE email = ?')
    .bind(email)
    .first<{ role: Role }>()
  return row?.role ?? null
}

// Resolves who is calling. Returns null when not authenticated (401) or when
// authenticated but not in the role table (403) — caller decides which.
export async function resolveUser(
  headers: Headers,
  env: AuthEnv
): Promise<{ user: AuthedUser | null; unauthenticated: boolean }> {
  if (env.ENVIRONMENT !== 'production' && env.DEV_AUTH_ROLE) {
    const role = env.DEV_AUTH_ROLE as Role
    return { user: { email: 'dev@localhost', role }, unauthenticated: false }
  }

  const token = headers.get('Cf-Access-JWT-Assertion')
  if (!token) return { user: null, unauthenticated: true }

  const email = await verifyAccessJwt(token, env)
  if (!email) return { user: null, unauthenticated: true }

  const role = await lookupRole(env.DB, email)
  if (!role) return { user: null, unauthenticated: false }
  return { user: { email, role }, unauthenticated: false }
}
