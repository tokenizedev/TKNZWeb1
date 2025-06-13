import assert from 'assert';
import { describe, it } from 'node:test';
import { createLeaderboardHandler } from '../netlify/functions/leaderboard.js';

/**
 * Fake in-memory Redis client to simulate sorted set operations.
 */
class FakeRedis {
  constructor() {
    this.store = Object.create(null);
  }
  async execute(cmd) {
    const [command, key, startStr, endStr] = cmd;
    if (command !== 'ZREVRANGE') throw new Error(`Unexpected command: ${command}`);
    const list = this.store[key] || [];
    const sorted = list.slice().sort((a, b) => b.score - a.score);
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    const slice = sorted.slice(start, end + 1);
    const result = [];
    for (const { member, score } of slice) {
      result.push(member, score.toString());
    }
    return result;
  }
  async zadd(key, { member, score }) {
    if (!this.store[key]) this.store[key] = [];
    // replace existing member
    this.store[key] = this.store[key].filter(x => x.member !== member);
    this.store[key].push({ member, score });
  }
  async del(key) {
    delete this.store[key];
  }
  multi() {
    const ops = [];
    return {
      del: (key) => ops.push(['DEL', key]),
      zadd: (key, { member, score }) => ops.push(['ZADD', key, score.toString(), member]),
      exec: async () => {
        for (const [cmd, key, arg1, arg2] of ops) {
          if (cmd === 'DEL') await this.del(key);
          if (cmd === 'ZADD') await this.zadd(key, { member: arg2, score: parseFloat(arg1) });
        }
      },
    };
  }
}

describe('Leaderboard Function', () => {
  it('returns empty list when no entries exist', async () => {
    const fakeRedis = new FakeRedis();
    const handler = createLeaderboardHandler(fakeRedis);
    const event = { queryStringParameters: {} };
    const res = await handler(event);
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.deepEqual(data, { page: 1, perPage: 25, entries: [] });
  });

  it('paginates correctly across multiple pages', async () => {
    const fakeRedis = new FakeRedis();
    // Seed 60 entries: score 0 to 59
    for (let i = 0; i < 60; i++) {
      await fakeRedis.zadd('leaderboard', { member: `member${i}`, score: i });
    }
    const handler = createLeaderboardHandler(fakeRedis);

    // Page 1
    let res = await handler({ queryStringParameters: { page: '1' } });
    assert.equal(res.statusCode, 200);
    let data = JSON.parse(res.body);
    assert.equal(data.page, 1);
    assert.equal(data.perPage, 25);
    assert.equal(data.entries.length, 25);
    assert.equal(data.entries[0].member, 'member59');
    assert.equal(data.entries[24].member, 'member35');

    // Page 3 (should have 10 entries)
    res = await handler({ queryStringParameters: { page: '3' } });
    data = JSON.parse(res.body);
    assert.equal(data.page, 3);
    assert.equal(data.entries.length, 10);
    assert.equal(data.entries[0].member, 'member9');
    assert.equal(data.entries[9].member, 'member0');
  });

  it('defaults to page 1 for invalid page params', async () => {
    const fakeRedis = new FakeRedis();
    const handler = createLeaderboardHandler(fakeRedis);
    const res = await handler({ queryStringParameters: { page: 'abc' } });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.page, 1);
    assert.equal(data.entries.length, 0);
  });
});