const fs = require('fs').promises;
const path = require('path');

const GUILD_SETTINGS_FILE = path.join(__dirname, '..', 'guild-settings.json');

// Initialize guild settings file if it doesn't exist
async function ensureGuildSettingsFile() {
    try {
        await fs.access(GUILD_SETTINGS_FILE);
    } catch (error) {
        // File doesn't exist, create it with empty object
        await fs.writeFile(GUILD_SETTINGS_FILE, JSON.stringify({}, null, 2));
    }
}

// Load guild settings from file
async function loadGuildSettings() {
    await ensureGuildSettingsFile();
    try {
        const data = await fs.readFile(GUILD_SETTINGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading guild settings:', error);
        return {};
    }
}

// Save guild settings to file
async function saveGuildSettings(settings) {
    try {
        await fs.writeFile(GUILD_SETTINGS_FILE, JSON.stringify(settings, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving guild settings:', error);
        return false;
    }
}

// Set ranked-only preference for a guild
async function setRankedOnly(guildId, rankedOnly) {
    const settings = await loadGuildSettings();
    if (!settings[guildId]) {
        settings[guildId] = {};
    }
    settings[guildId].rankedOnly = rankedOnly;
    const saved = await saveGuildSettings(settings);
    
    if (saved) {
        return { success: true, message: `Notifications set to ${rankedOnly ? 'ranked games only' : 'all games'}` };
    } else {
        return { success: false, message: 'Failed to save setting' };
    }
}

// Get ranked-only preference for a guild (default: true for backwards compatibility)
async function getRankedOnly(guildId) {
    const settings = await loadGuildSettings();
    if (!settings[guildId] || settings[guildId].rankedOnly === undefined) {
        return true; // Default to ranked-only
    }
    return settings[guildId].rankedOnly;
}

// Get all guild settings
async function getAllGuildSettings() {
    return await loadGuildSettings();
}

module.exports = {
    setRankedOnly,
    getRankedOnly,
    getAllGuildSettings
};
