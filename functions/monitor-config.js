const DEFAULT_IDLE_INTERVAL_SECONDS = 30;
const RIOT_PUBLISHED_REQUEST_LIMIT = 100;
const SAFETY_PADDING_PERCENT = 15;
const RIOT_REQUEST_BUDGET = Math.floor(
    RIOT_PUBLISHED_REQUEST_LIMIT * (1 - SAFETY_PADDING_PERCENT / 100)
);
const RIOT_RATE_LIMIT_WINDOW_SECONDS = 120;

const monitorConfig = {
    publishedRequestLimit: RIOT_PUBLISHED_REQUEST_LIMIT,
    safetyPaddingPercent: SAFETY_PADDING_PERCENT,
    requestBudget: RIOT_REQUEST_BUDGET,
    rateLimitWindowSeconds: RIOT_RATE_LIMIT_WINDOW_SECONDS
};

function calculateMinimumIntervalSeconds(playerCount) {
    if (playerCount <= 0) return DEFAULT_IDLE_INTERVAL_SECONDS;

    return Math.ceil(
        playerCount * monitorConfig.rateLimitWindowSeconds / monitorConfig.requestBudget
    );
}

function calculateMaxTrackedPlayers(intervalSeconds) {
    return Math.floor(
        monitorConfig.requestBudget * intervalSeconds / monitorConfig.rateLimitWindowSeconds
    );
}

function getEffectivePollIntervalSeconds(playerCount, pollingSettings) {
    const minimumInterval = calculateMinimumIntervalSeconds(playerCount);
    if (pollingSettings.mode === 'fixed') {
        return Math.max(pollingSettings.intervalSeconds, minimumInterval);
    }

    return minimumInterval;
}

module.exports = {
    monitorConfig,
    calculateMinimumIntervalSeconds,
    calculateMaxTrackedPlayers,
    getEffectivePollIntervalSeconds
};
