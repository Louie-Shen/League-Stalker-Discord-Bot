const fs = require('fs').promises;
const path = require('path');
const { getPlayerId } = require('./get-player-Id');

const TRACKED_PLAYERS_FILE = path.join(__dirname, '..', 'tracked-players.json');

// Initialize tracked players file if it doesn't exist
async function ensureTrackedPlayersFile() {
    try {
        await fs.access(TRACKED_PLAYERS_FILE);
    } catch (error) {
        // File doesn't exist, create it with empty array
        await fs.writeFile(TRACKED_PLAYERS_FILE, JSON.stringify([], null, 2));
    }
}

// Load tracked players from file
async function loadTrackedPlayers() {
    await ensureTrackedPlayersFile();
    try {
        const data = await fs.readFile(TRACKED_PLAYERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading tracked players:', error);
        return [];
    }
}

// Save tracked players to file
async function saveTrackedPlayers(players) {
    try {
        await fs.writeFile(TRACKED_PLAYERS_FILE, JSON.stringify(players, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving tracked players:', error);
        return false;
    }
}

// Add a player to the tracking list (by username#tag)
async function addTrackedPlayer(usernameTag) {
    // Parse username#tag format
    const parts = usernameTag.split('#');
    if (parts.length !== 2) {
        return { success: false, message: 'Invalid format. Please use username#tag (e.g., YourUsername#NA1)' };
    }
    
    const username = parts[0].trim();
    const tag = parts[1].trim();
    
    if (!username || !tag) {
        return { success: false, message: 'Username or tag is missing' };
    }
    
    // Get PUUID using getPlayerId
    const puuid = await getPlayerId(username, tag);
    if (!puuid) {
        return { success: false, message: 'Could not find player with that username and tag' };
    }
    
    const players = await loadTrackedPlayers();
    
    // Check if player already exists
    const exists = players.find(p => p.puuid === puuid || `${p.username}#${p.tag}` === usernameTag);
    if (exists) {
        return { success: false, message: 'Player is already being tracked' };
    }
    
    players.push({ username, tag, puuid });
    const saved = await saveTrackedPlayers(players);
    
    if (saved) {
        return { success: true, message: `Added ${username}#${tag} to tracking list`, puuid };
    } else {
        return { success: false, message: 'Failed to save tracked player' };
    }
}

// Remove a player from the tracking list
async function removeTrackedPlayer(usernameTag) {
    const players = await loadTrackedPlayers();
    const initialLength = players.length;
    
    // Remove by username#tag only
    const filtered = players.filter(p => {
        return `${p.username}#${p.tag}` !== usernameTag;
    });
    
    if (filtered.length === initialLength) {
        return { success: false, message: 'Player not found in tracking list' };
    }
    
    const saved = await saveTrackedPlayers(filtered);
    
    if (saved) {
        const removed = players.find(p => !filtered.includes(p));
        return { success: true, message: `Removed ${removed.username}#${removed.tag} from tracking list` };
    } else {
        return { success: false, message: 'Failed to remove tracked player' };
    }
}

// Get all tracked players
async function getTrackedPlayers() {
    return await loadTrackedPlayers();
}

module.exports = {
    addTrackedPlayer,
    removeTrackedPlayer,
    getTrackedPlayers,
    loadTrackedPlayers
};
