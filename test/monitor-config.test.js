const test = require('node:test');
const assert = require('node:assert/strict');
const {
    monitorConfig,
    calculateMinimumIntervalSeconds,
    calculateMaxTrackedPlayers,
    getEffectivePollIntervalSeconds
} = require('../functions/monitor-config');

test('Riot request budget preserves the configured safety margin', () => {
    assert.equal(monitorConfig.requestBudget, 85);
    assert.equal(monitorConfig.safetyPaddingPercent, 15);
});

test('automatic polling calculates a safe interval', () => {
    assert.equal(calculateMinimumIntervalSeconds(0), 30);
    assert.equal(calculateMinimumIntervalSeconds(85), 120);
    assert.equal(calculateMaxTrackedPlayers(120), 85);
});

test('fixed polling never runs faster than the safe interval', () => {
    assert.equal(
        getEffectivePollIntervalSeconds(85, { mode: 'fixed', intervalSeconds: 30 }),
        120
    );
    assert.equal(
        getEffectivePollIntervalSeconds(1, { mode: 'fixed', intervalSeconds: 60 }),
        60
    );
});
