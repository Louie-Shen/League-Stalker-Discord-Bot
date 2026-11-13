const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPostGameLinks } = require('../functions/match-links');

test('buildPostGameLinks creates encoded DPM.LOL and OP.GG links', () => {
    const links = buildPostGameLinks(
        { username: 'Game Name', tag: 'NA 1' },
        { gameId: 12345 }
    );

    assert.deepEqual(links, {
        dpm: 'https://dpm.lol/Game%20Name-NA%201?match=12345',
        opgg: 'https://op.gg/lol/summoners/na/Game%20Name-NA%201'
    });
});
