const { monitorConfig } = require('./monitor-config');

const MAX_RETRIES = 2;
const requestTimestamps = [];
const requestQueue = [];
let processingQueue = false;
let blockedUntil = 0;

function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function pruneOldRequests(now) {
    const windowStart = now - monitorConfig.rateLimitWindowSeconds * 1000;
    while (requestTimestamps.length > 0 && requestTimestamps[0] <= windowStart) {
        requestTimestamps.shift();
    }
}

function getRetryDelayMilliseconds(response) {
    const retryAfter = Number(response.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter >= 0) {
        return Math.max(1000, Math.ceil(retryAfter * 1000));
    }

    return 5000;
}

async function waitForRequestSlot() {
    while (true) {
        const now = Date.now();
        pruneOldRequests(now);

        if (now < blockedUntil) {
            await sleep(blockedUntil - now);
            continue;
        }

        if (requestTimestamps.length < monitorConfig.requestBudget) return;

        const nextAvailableAt = requestTimestamps[0]
            + monitorConfig.rateLimitWindowSeconds * 1000
            + 25;
        await sleep(Math.max(25, nextAvailableAt - now));
    }
}

async function executeRequest(url, options) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        await waitForRequestSlot();
        requestTimestamps.push(Date.now());

        const response = await fetch(url, options);
        if (response.status !== 429 || attempt === MAX_RETRIES) {
            return response;
        }

        const retryDelay = getRetryDelayMilliseconds(response);
        blockedUntil = Math.max(blockedUntil, Date.now() + retryDelay);
        console.warn(`Riot API rate limit reached. Retrying in ${Math.ceil(retryDelay / 1000)} seconds.`);
    }
}

async function processQueue() {
    if (processingQueue) return;
    processingQueue = true;

    while (requestQueue.length > 0) {
        const request = requestQueue.shift();
        try {
            const response = await executeRequest(request.url, request.options);
            request.resolve(response);
        } catch (error) {
            request.reject(error);
        }
    }

    processingQueue = false;
}

function riotFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        requestQueue.push({ url, options, resolve, reject });
        processQueue();
    });
}

module.exports = { riotFetch };
