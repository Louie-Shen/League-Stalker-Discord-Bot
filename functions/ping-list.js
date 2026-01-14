const fs = require('fs').promises;
const path = require('path');

const PING_LIST_FILE = path.join(__dirname, '..', 'ping-list.json');

// Initialize ping list file if it doesn't exist
// Initialize ping list file if it doesn't exist
async function ensurePingListFile() {
    try {
        await fs.access(PING_LIST_FILE);
    } catch (error) {
        await fs.writeFile(PING_LIST_FILE, JSON.stringify({}, null, 2));
    }
}

// Migrate old array format to new object format
function migratePingList(data) {
    let modified = false;
    for (const guildId in data) {
        if (Array.isArray(data[guildId])) {
            const users = data[guildId];
            data[guildId] = {
                subscriptions: {
                    GLOBAL: {}
                }
            };
            users.forEach(userId => {
                data[guildId].subscriptions.GLOBAL[userId] = 'all';
            });
            modified = true;
        } else if (!data[guildId].subscriptions) {
            // Handle case where it might be an empty object or just missing structure
            data[guildId] = { subscriptions: { GLOBAL: {} } };
            modified = true;
        }
    }
    return { data, modified };
}

// Load ping list from file
async function loadPingList() {
    await ensurePingListFile();
    try {
        const fileContent = await fs.readFile(PING_LIST_FILE, 'utf8');
        let data = JSON.parse(fileContent);

        const { data: migratedData, modified } = migratePingList(data);

        if (modified) {
            await savePingList(migratedData);
            return migratedData;
        }

        return data;
    } catch (error) {
        console.error('Error loading ping list:', error);
        return {};
    }
}

// Save ping list to file
async function savePingList(pingList) {
    try {
        await fs.writeFile(PING_LIST_FILE, JSON.stringify(pingList, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving ping list:', error);
        return false;
    }
}

/**
 * Add a user to the ping list
 * @param {string} guildId 
 * @param {string} userId 
 * @param {string} type 'all' | 'ranked'
 * @param {string} puuid 'GLOBAL' or specific player PUUID
 */
async function addPingSubscriber(guildId, userId, type = 'all', puuid = 'GLOBAL') {
    const pingList = await loadPingList();

    if (!pingList[guildId]) {
        pingList[guildId] = { subscriptions: { GLOBAL: {} } };
    }
    if (!pingList[guildId].subscriptions) {
        pingList[guildId].subscriptions = { GLOBAL: {} };
    }
    if (!pingList[guildId].subscriptions[puuid]) {
        pingList[guildId].subscriptions[puuid] = {};
    }

    const currentType = pingList[guildId].subscriptions[puuid][userId];
    if (currentType === type) {
        return { success: false, message: `You are already subscribed to ${type} pings for ${puuid === 'GLOBAL' ? 'all players' : 'this player'}.` };
    }

    pingList[guildId].subscriptions[puuid][userId] = type;
    const saved = await savePingList(pingList);

    if (saved) {
        const targetName = puuid === 'GLOBAL' ? 'all players' : 'this player';
        return { success: true, message: `Updated your ping preference to **${type}** for ${targetName}.` };
    }

    return { success: false, message: 'Failed to update the ping list.' };
}

/**
 * Remove a user from the ping list
 * @param {string} guildId 
 * @param {string} userId 
 * @param {string} puuid 'GLOBAL' or specific player PUUID
 */
async function removePingSubscriber(guildId, userId, puuid = 'GLOBAL') {
    const pingList = await loadPingList();

    if (!pingList[guildId] || !pingList[guildId].subscriptions || !pingList[guildId].subscriptions[puuid]) {
        return { success: false, message: `You are not subscribed to pings for ${puuid === 'GLOBAL' ? 'all players' : 'this player'}.` };
    }

    if (!pingList[guildId].subscriptions[puuid][userId]) {
        return { success: false, message: `You are not subscribed to pings for ${puuid === 'GLOBAL' ? 'all players' : 'this player'}.` };
    }

    delete pingList[guildId].subscriptions[puuid][userId];

    // Cleanup empty objects
    if (Object.keys(pingList[guildId].subscriptions[puuid]).length === 0) {
        delete pingList[guildId].subscriptions[puuid];
    }

    const saved = await savePingList(pingList);

    if (saved) {
        return { success: true, message: `Removed your subscription for ${puuid === 'GLOBAL' ? 'all players' : 'this player'}.` };
    }

    return { success: false, message: 'Failed to update the ping list.' };
}

/**
 * Get users to ping for a specific event
 * @param {string} guildId 
 * @param {boolean} isRanked 
 * @param {string} puuid 
 * @returns {Promise<string[]>} Array of user IDs
 */
async function getUsersToPing(guildId, isRanked, puuid) {
    const pingList = await loadPingList();
    if (!pingList[guildId] || !pingList[guildId].subscriptions) {
        return [];
    }

    const subs = pingList[guildId].subscriptions;
    const usersToPing = new Set();

    // Helper to check if a subscription matches
    const checkSub = (subType) => {
        if (subType === 'all') return true;
        if (subType === 'ranked' && isRanked) return true;
        return false;
    };

    // Check specific player subscriptions
    if (subs[puuid]) {
        for (const [userId, type] of Object.entries(subs[puuid])) {
            if (checkSub(type)) {
                usersToPing.add(userId);
            }
        }
    }

    // Check global subscriptions
    // Logic: Specific subscription should probably override global? 
    // Or additive? 
    // "For example, !ping ranked bork#louie would set up pings for ranked games for the account bork#louie"
    // User probably wants to be notified if matches EITHER global OR specific.
    // If I have Global ALL, I want everything.
    // If I have Global RANKED, and Specific ALL. I want ranked for everyone, and casuals for specific.
    // So additive (Set union) is appropriate.

    if (subs['GLOBAL']) {
        for (const [userId, type] of Object.entries(subs['GLOBAL'])) {
            if (checkSub(type)) {
                usersToPing.add(userId);
            }
        }
    }

    return Array.from(usersToPing);
}

// Legacy function for backward compatibility if needed, or just return global all subscribers
async function getPingSubscribers(guildId) {
    // This function is less useful now, but we can return all unique users who have ANY subscription
    const pingList = await loadPingList();
    if (!pingList[guildId] || !pingList[guildId].subscriptions) return [];

    const users = new Set();
    for (const target of Object.values(pingList[guildId].subscriptions)) {
        for (const userId of Object.keys(target)) {
            users.add(userId);
        }
    }
    return Array.from(users);
}

module.exports = {
    addPingSubscriber,
    removePingSubscriber,
    getUsersToPing,
    getPingSubscribers
};
