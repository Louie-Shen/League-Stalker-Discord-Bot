const fs = require('fs').promises;
const path = require('path');

const BOT_SETTINGS_FILE = path.join(__dirname, '..', 'bot-settings.json');
const DEFAULT_SETTINGS = {
    polling: {
        mode: 'automatic',
        intervalSeconds: null
    }
};

async function saveBotSettings(settings) {
    await fs.writeFile(BOT_SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

async function loadBotSettings() {
    try {
        const data = await fs.readFile(BOT_SETTINGS_FILE, 'utf8');
        const settings = JSON.parse(data);
        const polling = settings.polling;

        if (
            polling
            && (polling.mode === 'automatic' || polling.mode === 'fixed')
            && (polling.mode !== 'fixed'
                || (Number.isInteger(polling.intervalSeconds) && polling.intervalSeconds > 0))
        ) {
            return settings;
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Error loading bot settings:', error);
        }
    }

    await saveBotSettings(DEFAULT_SETTINGS);
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

async function getPollingSettings() {
    const settings = await loadBotSettings();
    return settings.polling;
}

async function setAutomaticPolling() {
    const settings = await loadBotSettings();
    settings.polling = { mode: 'automatic', intervalSeconds: null };
    await saveBotSettings(settings);
    return settings.polling;
}

async function setFixedPollingInterval(intervalSeconds) {
    const settings = await loadBotSettings();
    settings.polling = { mode: 'fixed', intervalSeconds };
    await saveBotSettings(settings);
    return settings.polling;
}

module.exports = {
    getPollingSettings,
    setAutomaticPolling,
    setFixedPollingInterval
};
