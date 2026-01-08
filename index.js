require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { getPlayerId } = require('./functions/get-player-Id');
const { stalkPlayer } = require('./functions/in-game');
const { startKeepAliveServer } = require('./functions/upTime');
const { addTrackedPlayer, removeTrackedPlayer, getTrackedPlayers } = require('./functions/tracked-players');
const { setGuildChannel, getAllGuildChannels } = require('./functions/guild-channels');
const { setRankedOnly, getAllGuildSettings, getRankedOnly } = require('./functions/guild-settings');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;

// Store previous in-game status for each tracked player (puuid -> { inGame: boolean, gameType: string | null })
const playerStatus = new Map();

startKeepAliveServer();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    startMonitoring();
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content === '!ping') {
        message.reply('Pong!');
    }

    if (message.content.startsWith('!find ')) {
        const args = message.content.slice('!find '.length).trim();
        const nameAndTag = args.split(',');

        if (nameAndTag.length !== 2) {
            return message.reply("Please provide the username and tag separated by a comma. Example: `!find YourUsername,NA1`");
        }

        const username = nameAndTag[0].trim();
        const tag = nameAndTag[1].trim();

        if (!username || !tag) {
            return message.reply("Username or tag is missing. Example: `!find YourUsername,NA1`");
        }

        try {
            const puuid = await getPlayerId(username, tag);
            if (puuid) {
                message.reply(`PUUID found: ${puuid}`);
            } else {
                message.reply("Sorry, I couldn't find a player with that username and tag.");
            }
        } catch (error) {
            console.error(error);
            message.reply("Sorry, an error occurred while I was trying to find the player.");
        }
    }

    if (message.content.startsWith('!stalk ')) {
        const puuid = message.content.slice('!stalk '.length).trim();

        if (!puuid) {
            return message.reply("Please provide a PUUID. Example: `!stalk your-puuid-here`");
        }

        try {
            const matchStatus = await stalkPlayer(puuid);
            if (matchStatus === null) {
                message.reply("Sorry, I couldn't check the player's status.");
            } else if (matchStatus.inGame) {
                message.reply(`In game! (${matchStatus.gameType || 'Unknown type'})`);
            } else {
                message.reply("Not in game!");
            }
        } catch (error) {
            console.error(error);
            message.reply("Sorry, an error occurred while I was stalking.");
        }
    }

    if (message.content.startsWith('!track ')) {
        const usernameTag = message.content.slice('!track '.length).trim();

        if (!usernameTag) {
            return message.reply("Please provide a username#tag. Example: `!track YourUsername#NA1`");
        }

        try {
            const result = await addTrackedPlayer(usernameTag);
            message.reply(result.message);
            
            // Initialize status tracking if player was successfully added
            if (result.success && result.puuid) {
                playerStatus.set(result.puuid, { inGame: false, gameType: null });
            }
        } catch (error) {
            console.error(error);
            message.reply("Sorry, an error occurred while trying to track the player.");
        }
    }

    if (message.content.startsWith('!untrack ')) {
        const usernameTag = message.content.slice('!untrack '.length).trim();

        if (!usernameTag) {
            return message.reply("Please provide a username#tag. Example: `!untrack YourUsername#NA1`");
        }

        try {
            // Get players before removing to find the PUUID
            const playersBefore = await getTrackedPlayers();
            const playerToRemove = playersBefore.find(p => 
                `${p.username}#${p.tag}` === usernameTag
            );
            
            const result = await removeTrackedPlayer(usernameTag);
            message.reply(result.message);
            
            // Remove from status tracking if player was found
            if (playerToRemove) {
                playerStatus.delete(playerToRemove.puuid);
            }
        } catch (error) {
            console.error(error);
            message.reply("Sorry, an error occurred while trying to untrack the player.");
        }
    }

    if (message.content === '!list') {
        try {
            const players = await getTrackedPlayers();
            if (players.length === 0) {
                message.reply("No players are currently being tracked.");
            } else {
                const playerList = players.map(p => `• ${p.username}#${p.tag}`).join('\n');
                message.reply(`**Tracked Players:**\n${playerList}`);
            }
        } catch (error) {
            console.error(error);
            message.reply("Sorry, an error occurred while fetching the tracking list.");
        }
    }

    if (message.content.startsWith('!channel')) {
        // Set the notification channel for this guild (server)
        if (!message.guild) {
            return message.reply("This command can only be used in a server, not in DMs.");
        }
        
        try {
            const result = await setGuildChannel(message.guild.id, message.channel.id);
            message.reply(result.message);
        } catch (error) {
            console.error(error);
            message.reply("Sorry, an error occurred while setting the notification channel.");
        }
    }

    if (message.content.startsWith('!gamemode')) {
        // Toggle between ranked-only and all games
        if (!message.guild) {
            return message.reply("This command can only be used in a server, not in DMs.");
        }
        
        try {
            const currentSetting = await getRankedOnly(message.guild.id);
            const newSetting = !currentSetting;
            const result = await setRankedOnly(message.guild.id, newSetting);
            message.reply(result.message);
        } catch (error) {
            console.error(error);
            message.reply("Sorry, an error occurred while toggling game mode.");
        }
    }
});

// Monitoring function that checks tracked players periodically
async function startMonitoring() {
    console.log('Starting player monitoring...');
    
    // Check every 30 seconds (adjust as needed, but be mindful of API rate limits)
    setInterval(async () => {
        try {
            const players = await getTrackedPlayers();
            
            for (const player of players) {
                try {
                    const currentStatus = await stalkPlayer(player.puuid);
                    if (currentStatus === null) {
                        continue; // Skip if we couldn't check status
                    }
                    
                    const previousStatus = playerStatus.get(player.puuid) || { inGame: false, gameType: null };
                    
                    // Check if player just started a game
                    const startedGame = !previousStatus.inGame && currentStatus.inGame;
                    
                    // Update status
                    playerStatus.set(player.puuid, currentStatus);
                    
                    // If player just started a game, notify
                    if (startedGame) {
                        notifyPlayerInGame(player, currentStatus.gameType);
                    }
                    
                    // Small delay to avoid hitting rate limits too fast
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error(`Error checking player ${player.username}#${player.tag}:`, error);
                }
            }
        } catch (error) {
            console.error('Error in monitoring loop:', error);
        }
    }, 30000); // Check every 30 seconds
}

// Send notification when a player starts a game
async function notifyPlayerInGame(player, gameType) {
    try {
        const guildChannels = await getAllGuildChannels();
        const allSettings = await getAllGuildSettings();
        
        if (Object.keys(guildChannels).length === 0) {
            console.log(`Player ${player.username}#${player.tag} started a game, but no notification channels are set.`);
            return;
        }
        
        const isRanked = gameType === 'RANKED';
        
        // Send notification to guilds that have set a notification channel and match the filter
        for (const [guildId, channelId] of Object.entries(guildChannels)) {
            try {
                // Get this guild's ranked-only preference (default: true)
                const rankedOnly = allSettings[guildId]?.rankedOnly !== false; // Default to true for backwards compatibility
                
                // Skip if guild wants ranked-only but this is not a ranked game
                if (rankedOnly && !isRanked) {
                    continue;
                }
                
                const channel = await client.channels.fetch(channelId);
                if (channel) {
                    const gameTypeText = isRanked ? 'RANKED' : gameType || 'game';
                    await channel.send(`🎮 **${player.username}#${player.tag}** started a ${gameTypeText} game!`);
                }
            } catch (error) {
                console.error(`Error sending notification to channel ${channelId}:`, error);
                // Continue to other channels even if one fails
            }
        }
    } catch (error) {
        console.error('Error in notifyPlayerInGame:', error);
    }
}

client.login(TOKEN);