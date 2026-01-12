const fs = require('fs').promises;
const path = require('path');

const PING_LIST_FILE = path.join(__dirname, '..', 'ping-list.json');

// Initialize ping list file if it doesn't exist
async function ensurePingListFile() {
    try {
        await fs.access(PING_LIST_FILE);
    } catch (error) {
        await fs.writeFile(PING_LIST_FILE, JSON.stringify({}, null, 2));
    }
}

// Load ping list from file
async function loadPingList() {
    await ensurePingListFile();
    try {
        const data = await fs.readFile(PING_LIST_FILE, 'utf8');
        return JSON.parse(data);
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

// Add a user to the ping list for a guild
async function addPingSubscriber(guildId, userId) {
    const pingList = await loadPingList();
    if (!pingList[guildId]) {
        pingList[guildId] = [];
    }

    if (pingList[guildId].includes(userId)) {
        return { success: false, message: 'You are already on the ping list for this server.' };
    }

    pingList[guildId].push(userId);
    const saved = await savePingList(pingList);

    if (saved) {
        return { success: true, message: 'You have been added to the ping list for this server.' };
    }

    return { success: false, message: 'Failed to update the ping list.' };
}

// Remove a user from the ping list for a guild
async function removePingSubscriber(guildId, userId) {
    const pingList = await loadPingList();
    const subscribers = pingList[guildId] || [];

    if (!subscribers.includes(userId)) {
        return { success: false, message: 'You are not on the ping list for this server.' };
    }

    const updated = subscribers.filter(id => id !== userId);
    if (updated.length === 0) {
        delete pingList[guildId];
    } else {
        pingList[guildId] = updated;
    }

    const saved = await savePingList(pingList);

    if (saved) {
        return { success: true, message: 'You have been removed from the ping list for this server.' };
    }

    return { success: false, message: 'Failed to update the ping list.' };
}

// Get ping list for a guild
async function getPingSubscribers(guildId) {
    const pingList = await loadPingList();
    return pingList[guildId] || [];
}

module.exports = {
    addPingSubscriber,
    removePingSubscriber,
    getPingSubscribers
};
