// Logic: the rules a server configuration must meet before the server starts.

import { isValidTimeZone } from './meal-period.js';

// The signing secret used when JWT_SECRET is not set. Public, so development only.
export const DEV_JWT_SECRET = 'food-diary-dev-secret';

// A production secret shorter than this is too easy to guess.
export const MIN_JWT_SECRET_LENGTH = 32;

// The zone for a user whose browser has not told the server its zone yet.
export const DEFAULT_TIME_ZONE = 'Asia/Kuala_Lumpur';

// The port the server listens on when PORT is not set, and the origin of the
// server on this machine at that port.
export const DEFAULT_PORT = 3004;
export const DEV_ORIGIN = `http://localhost:${DEFAULT_PORT}`;

// The address the server listens on when HOST is not set: this machine only.
// A proxy on the same machine (cloudflared) reaches it; the network does not.
export const DEFAULT_HOST = '127.0.0.1';

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HOST_NAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

const isIPv4 = (value) => IPV4.test(value);

function isIPv6(value) {
  const halves = value.split('::');
  if (halves.length > 2) return false;
  const groups = halves.flatMap(part => (part === '' ? [] : part.split(':')));
  if (!groups.every(group => /^[0-9a-f]{1,4}$/i.test(group))) return false;
  return halves.length === 2 ? groups.length <= 7 : groups.length === 8;
}

// An IP address, or a host name. All-digit names must be a real IPv4 address.
// IPv6 zone IDs (fe80::1%eth0) and IPv4-mapped forms (::ffff:127.0.0.1) are refused.
export function isValidHost(value) {
  if (typeof value !== 'string') return false;
  if (isIPv4(value) || isIPv6(value)) return true;
  return !/^[\d.]+$/.test(value) && HOST_NAME.test(value);
}

// A listen address only this machine can reach.
const isLoopbackHost = (value) => (isIPv4(value) && value.startsWith('127.')) || value === '::1' || value.toLowerCase() === 'localhost';

// The most proxy hops TRUST_PROXY may name. Cloudflare plus cloudflared is two;
// more would let a client's own X-Forwarded-For entries count as proxies.
export const MAX_TRUST_PROXY_HOPS = 3;

// An IP address, or an address with a /prefix of the right size.
function isIpOrCidr(value) {
  const [address, prefix, extra] = value.split('/');
  if (extra !== undefined) return false;
  const bits = isIPv4(address) ? 32 : isIPv6(address) ? 128 : 0;
  if (bits === 0) return false;
  return prefix === undefined || (/^\d{1,3}$/.test(prefix) && Number(prefix) <= bits);
}

// TRUST_PROXY as set, or undefined. Which proxies may name the client's IP in
// X-Forwarded-For: none (unset or empty), 'loopback' (a proxy on this
// machine), a hop count from 1 to MAX_TRUST_PROXY_HOPS, or a comma-separated
// list of IPs or CIDR ranges ('loopback' cannot be mixed into the list).
// 'true' (trust anyone) is refused: any client could then choose its own IP
// and escape the lockout. Returns { ok, value } with Express's trust proxy value.
const TRUST_PROXY_PROBLEM = `TRUST_PROXY must be 'loopback', a hop count from 1 to ${MAX_TRUST_PROXY_HOPS}, `
  + "or a comma-separated list of IPs or CIDR ranges; 'loopback' cannot be mixed with IPs.";

export function parseTrustProxy(value) {
  if (value === undefined || value === '') return { ok: true, value: false };
  if (value === 'loopback') return { ok: true, value: 'loopback' };
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    return hops >= 1 && hops <= MAX_TRUST_PROXY_HOPS ? { ok: true, value: hops } : { ok: false, error: TRUST_PROXY_PROBLEM };
  }
  const entries = value.split(',').map(entry => entry.trim());
  if (entries.every(isIpOrCidr)) return { ok: true, value: entries };
  return { ok: false, error: TRUST_PROXY_PROBLEM };
}

// HOST and PORT as set, or undefined; checked by checkServerConfig first.
export const listenHost = (host) => host ?? DEFAULT_HOST;
export const listenPort = (port) => (port === undefined ? DEFAULT_PORT : Number(port));

const isValidPort = (port) => /^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;

// The protocol ('http:', 'https:', ...) when value is a bare origin (a
// trailing slash is allowed, a path is not), else null.
function originProtocol(value) {
  try {
    const url = new URL(value);
    return url.origin === value.replace(/\/+$/, '') ? url.protocol : null;
  } catch {
    return null;
  }
}

// requireTotp: REQUIRE_TOTP as set ('1' | '0'), or undefined. Unset, the
// second factor is required in production only.
export function shouldRequireTotp({ requireTotp, nodeEnv }) {
  if (requireTotp === '1') return true;
  if (requireTotp === '0') return false;
  return nodeEnv === 'production';
}

// nodeEnv: NODE_ENV; jwtSecret: JWT_SECRET as set, or undefined;
// requireTotp: REQUIRE_TOTP as set, or undefined; it must be '1' or '0';
// defaultTimeZone: DEFAULT_TIME_ZONE as set, or undefined;
// publicOrigin: PUBLIC_ORIGIN as set, or undefined. Account invite links are
// built on it, so production needs it, over https; elsewhere http also works.
// host, port, trustProxy: HOST, PORT, TRUST_PROXY as set, or undefined.
// Returns a list of problems; an empty list means the server may start.
export function checkServerConfig({ nodeEnv, jwtSecret, defaultTimeZone, publicOrigin, requireTotp, host, port, trustProxy }) {
  const problems = [];
  if (host !== undefined && !isValidHost(host)) {
    problems.push(`HOST must be an IP address or a host name, such as ${DEFAULT_HOST}; IPv6 zone IDs and IPv4-mapped forms are not accepted.`);
  }
  if (port !== undefined && !isValidPort(port)) problems.push('PORT must be a whole number from 1 to 65535.');
  const trust = parseTrustProxy(trustProxy);
  if (!trust.ok) problems.push(trust.error);
  // A production server on a loopback address is reached only through a proxy
  // on this machine. Without TRUST_PROXY every client would share the proxy's
  // IP, and one guesser would lock everyone out.
  if (nodeEnv === 'production' && trust.ok && trust.value === false && isLoopbackHost(listenHost(host))) {
    problems.push('TRUST_PROXY is required behind a local proxy in production');
  }
  if (requireTotp !== undefined && requireTotp !== '1' && requireTotp !== '0') {
    problems.push("REQUIRE_TOTP must be '1' or '0'.");
  }
  if (nodeEnv === 'production') {
    if (!jwtSecret) problems.push('JWT_SECRET must be set in production.');
    else if (jwtSecret === DEV_JWT_SECRET) problems.push('JWT_SECRET must not be the development default in production.');
    else if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
      problems.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters in production.`);
    }
    if (!publicOrigin) problems.push('PUBLIC_ORIGIN must be set in production.');
    else if (originProtocol(publicOrigin) !== 'https:') {
      problems.push('PUBLIC_ORIGIN must be an https origin in production, such as https://food.example.com.');
    }
  } else if (publicOrigin && !['http:', 'https:'].includes(originProtocol(publicOrigin))) {
    problems.push(`PUBLIC_ORIGIN must be an http or https origin, such as ${DEV_ORIGIN}.`);
  }
  if (defaultTimeZone !== undefined && !isValidTimeZone(defaultTimeZone)) {
    problems.push(`DEFAULT_TIME_ZONE must be an IANA time zone, such as ${DEFAULT_TIME_ZONE}.`);
  }
  return problems;
}
