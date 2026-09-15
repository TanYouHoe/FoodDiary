// Logic test: listen address, port and trust proxy settings.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkServerConfig, isValidHost, parseTrustProxy, listenHost, listenPort,
  DEFAULT_HOST, DEFAULT_PORT, MAX_TRUST_PROXY_HOPS, MIN_JWT_SECRET_LENGTH,
} from '../logic/config.js';

describe('isValidHost', () => {
  it('accepts IP addresses and host names', () => {
    for (const host of ['127.0.0.1', '0.0.0.0', '192.168.1.36', '::1', '::', 'fe80::1', 'localhost', 'm6.lan', 'NucBox-M6Ultra']) {
      assert.equal(isValidHost(host), true, host);
    }
  });

  it('refuses anything else, zone IDs and IPv4-mapped forms included', () => {
    for (const host of ['', ' ', '256.0.0.1', '1.2.3', 'http://127.0.0.1', '127.0.0.1:3115', 'a b', '-bad.host', 'bad-.host', 'x..y', ':::1:::',
      'fe80::1%eth0', '::ffff:127.0.0.1']) {
      assert.equal(isValidHost(host), false, host);
    }
  });
});

describe('parseTrustProxy', () => {
  it('unset or empty trusts no proxy', () => {
    assert.deepEqual(parseTrustProxy(undefined), { ok: true, value: false });
    assert.deepEqual(parseTrustProxy(''), { ok: true, value: false });
  });

  it('accepts loopback, a hop count from 1 to 3 and an IP or CIDR list', () => {
    assert.equal(MAX_TRUST_PROXY_HOPS, 3);
    assert.deepEqual(parseTrustProxy('loopback'), { ok: true, value: 'loopback' });
    assert.deepEqual(parseTrustProxy('1'), { ok: true, value: 1 });
    assert.deepEqual(parseTrustProxy('3'), { ok: true, value: 3 });
    assert.deepEqual(parseTrustProxy('10.0.0.1'), { ok: true, value: ['10.0.0.1'] });
    assert.deepEqual(parseTrustProxy('10.0.0.0/8, 172.16.0.0/12,::1, fd00::/8'), { ok: true, value: ['10.0.0.0/8', '172.16.0.0/12', '::1', 'fd00::/8'] });
  });

  it('refuses true, names, bad counts and bad addresses', () => {
    for (const value of ['true', 'TRUE', 'yes', 'all', '*', '-1', '0', '4', '100', '1.5', '0x1', '10.0.0.0/33', '::1/129', '10.0.0.1,',
      'loopback,10.0.0.1', 'example.com', '300.0.0.1']) {
      assert.equal(parseTrustProxy(value).ok, false, value);
    }
  });

  it('the message names the accepted forms and the ones that are not', () => {
    const { error } = parseTrustProxy('loopback,10.0.0.1');
    assert.match(error, /1 to 3/);
    assert.match(error, /loopback.*not.*mixed|cannot be mixed/i);
  });
});

describe('listenHost and listenPort', () => {
  it('fall back to the defaults', () => {
    assert.equal(listenHost(undefined), DEFAULT_HOST);
    assert.equal(DEFAULT_HOST, '127.0.0.1');
    assert.equal(listenHost('0.0.0.0'), '0.0.0.0');
    assert.equal(listenPort(undefined), DEFAULT_PORT);
    assert.equal(listenPort('3115'), 3115);
  });
});

describe('checkServerConfig: HOST, PORT, TRUST_PROXY', () => {
  it('accepts valid values and unset ones', () => {
    assert.deepEqual(checkServerConfig({ host: '127.0.0.1', port: '3115', trustProxy: 'loopback' }), []);
    assert.deepEqual(checkServerConfig({ host: undefined, port: undefined, trustProxy: undefined }), []);
  });

  it('reports each bad value', () => {
    assert.equal(checkServerConfig({ host: 'http://x' }).length, 1);
    assert.match(checkServerConfig({ host: 'http://x' })[0], /HOST/);
    assert.match(checkServerConfig({ host: 'fe80::1%eth0' })[0], /zone/i);
    for (const port of ['0', '65536', 'abc', '3.5', '']) {
      assert.equal(checkServerConfig({ port }).length, 1, port);
      assert.match(checkServerConfig({ port })[0], /PORT/);
    }
    for (const trustProxy of ['true', '0', '4', '100']) {
      assert.equal(checkServerConfig({ trustProxy }).length, 1, trustProxy);
      assert.match(checkServerConfig({ trustProxy })[0], /TRUST_PROXY/);
    }
  });
});

describe('checkServerConfig: a local proxy in production', () => {
  const REQUIRED = 'TRUST_PROXY is required behind a local proxy in production';
  const prod = { nodeEnv: 'production', jwtSecret: 'x'.repeat(MIN_JWT_SECRET_LENGTH), publicOrigin: 'https://food.example.test' };

  it('a loopback listen host needs TRUST_PROXY', () => {
    for (const host of [undefined, '127.0.0.1', '127.1.2.3', '::1', 'localhost', 'LOCALHOST']) {
      assert.deepEqual(checkServerConfig({ ...prod, host }), [REQUIRED], String(host));
      assert.deepEqual(checkServerConfig({ ...prod, host, trustProxy: '' }), [REQUIRED], String(host));
      assert.deepEqual(checkServerConfig({ ...prod, host, trustProxy: 'loopback' }), [], String(host));
    }
  });

  it('another listen host, or outside production, does not', () => {
    assert.deepEqual(checkServerConfig({ ...prod, host: '0.0.0.0' }), []);
    assert.deepEqual(checkServerConfig({ ...prod, host: '192.168.1.36' }), []);
    assert.deepEqual(checkServerConfig({ ...prod, nodeEnv: 'development', host: '127.0.0.1' }), []);
  });
});
