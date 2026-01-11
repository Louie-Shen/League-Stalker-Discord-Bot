const fs = require('fs').promises;
const path = require('path');

const GUILD_CHANNELS_FILE = path.join(__dirname, '..', 'guild-channels.json');

// Initialize guild channels file if it doesn't exist
async function ensureGuildChannelsFile() {
    try {
        await fs.access(GUILD_CHANNELS_FILE);
    } catch (error) {
        // File doesn't exist, create it with empty object
        await fs.writeFile(GUILD_CHANNELS_FILE, JSON.stringify({}, null, 2));
    }
}

// Load guild channels from file
async function loadGuildChannels() {
    await ensureGuildChannelsFile();
    try {
        const data = await fs.readFile(GUILD_CHANNELS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading guild channels:', error);
        return {};
    }
}

// Save guild channels to file
async function saveGuildChannels(channels) {
    try {
        await fs.writeFile(GUILD_CHANNELS_FILE, JSON.stringify(channels, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving guild channels:', error);
        return false;
    }
}

// Set notification channel for a guild
async function setGuildChannel(guildId, channelId) {
    const channels = await loadGuildChannels();
    channels[guildId] = channelId;
    const saved = await saveGuildChannels(channels);
    
    if (saved) {
        return { success: true, message: `Notification channel set for this server!` };
    } else {
        return { success: false, message: 'Failed to save channel setting' };
    }
}

// Get notification channel for a guild
async function getGuildChannel(guildId) {
    const channels = await loadGuildChannels();
    return channels[guildId] || null;
}

// Get all guild channels
async function getAllGuildChannels() {
    return await loadGuildChannels();
}

module.exports = {
    setGuildChannel,
    getGuildChannel,
    getAllGuildChannels
};
