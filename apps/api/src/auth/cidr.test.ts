import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ipInRanges } from './cidr.js';

describe('address ranges', () => {
  it('lets everything in when there are no ranges', () => {
    assert.equal(ipInRanges('203.0.113.9', []), true);
    assert.equal(ipInRanges(undefined, []), true);
  });

  it('matches single addresses and subnets', () => {
    assert.equal(ipInRanges('203.0.113.9', ['203.0.113.0/24']), true);
    assert.equal(ipInRanges('203.0.114.9', ['203.0.113.0/24']), false);
    assert.equal(ipInRanges('198.51.100.7', ['198.51.100.7']), true);
    assert.equal(ipInRanges('198.51.100.8', ['198.51.100.7']), false);
    assert.equal(ipInRanges('10.1.2.3', ['203.0.113.0/24', '10.0.0.0/8']), true);
    assert.equal(ipInRanges('2001:db8::5', ['2001:db8::/32']), true);
    assert.equal(ipInRanges('2001:db9::5', ['2001:db8::/32']), false);
  });

  it('reads an IPv4 address given as an IPv6 socket reports it', () => {
    assert.equal(ipInRanges('::ffff:203.0.113.9', ['203.0.113.0/24']), true);
    assert.equal(ipInRanges('::FFFF:203.0.114.9', ['203.0.113.0/24']), false);
  });

  it('keeps out an unknown address and anything that is not an address', () => {
    assert.equal(ipInRanges(undefined, ['203.0.113.0/24']), false);
    assert.equal(ipInRanges('not-an-address', ['203.0.113.0/24']), false);
    assert.equal(ipInRanges('', ['203.0.113.0/24']), false);
    // A broken range matches nothing instead of everything.
    assert.equal(ipInRanges('203.0.113.9', ['garbage']), false);
  });

  it('does not match across address families', () => {
    assert.equal(ipInRanges('203.0.113.9', ['2001:db8::/32']), false);
    assert.equal(ipInRanges('2001:db8::1', ['203.0.113.0/24']), false);
  });
});
