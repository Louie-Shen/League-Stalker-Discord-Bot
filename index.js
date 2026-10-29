require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { getPlayerId } = require('./functions/get-player-Id');
const { stalkPlayer } = require('./functions/in-game');
const { startKeepAliveServer } = require('./functions/upTime');
const { addTrackedPlayer, removeTrackedPlayer, getTrackedPlayers } = require('./functions/tracked-players');
const { setGuildChannel, getAllGuildChannels } = require('./functions/guild-channels');
const { setRankedOnly, getAllGuildSettings, getRankedOnly } = require('./functions/guild-settings');
const { addPingSubscriber, removePingSubscriber, getUsersToPing } = require('./functions/ping-list');
const {
    monitorConfig,
    calculateMinimumIntervalSeconds,
    calculateMaxTrackedPlayers,
    getEffectivePollIntervalSeconds
} = require('./functions/monitor-config');
const {
    getPollingSettings,
    setAutomaticPolling,
    setFixedPollingInterval
} = require('./functions/monitor-settings');

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

    if (message.content.startsWith('!ping')) {
        if (!message.guild) {
            return message.reply('This command can only be used in a server, not in DMs.');
        }

        const args = message.content.slice('!ping'.length).trim().split(/\s+/);
        // Default values
        let type = 'all';
        let targetPlayer = null;
        let puuid = 'GLOBAL';

        // !ping (no args) -> default to 'all' for GLOBAL
        // !ping ranked -> 'ranked' for GLOBAL
        // !ping all -> 'all' for GLOBAL
        // !ping ranked bork#louie -> 'ranked' for specific
        // !ping all bork#louie -> 'all' for specific

        if (args[0] && args[0].length > 0) {
            const firstArg = args[0].toLowerCase();
            if (firstArg === 'ranked' || firstArg === 'all') {
                type = firstArg;
            } else {
                return message.reply(`Invalid ping type: \`${firstArg}\`. Use \`ranked\` or \`all\`.`);
            }
        }

        if (args[1]) {
            // Player specified
            // Reconstruct username#tag potentially? args[1] should be enough if no spaces
            // But username might contain spaces? 
            // "For example, !ping ranked bork#louie" - spaces in name?
            // "League of Legends names can contain spaces".
            // If args > 2, join them
            const playerString = args.slice(1).join(' '); // "bork#louie" or "name with space#tag"

            // Validate format
            const parts = playerString.split('#');
            if (parts.length < 2) {
                return message.reply('Invalid player format. Please use username#tag (e.g., YourUsername#NA1)');
            }

            // We need to look up the player in tracked list to get PUUID
            try {
                const trackedPlayers = await getTrackedPlayers();
                const matchedPlayer = trackedPlayers.find(p => `${p.username}#${p.tag}`.toLowerCase() === playerString.toLowerCase());

                if (matchedPlayer) {
                    puuid = matchedPlayer.puuid;
                    targetPlayer = `${matchedPlayer.username}#${matchedPlayer.tag}`;
                } else {
                    return message.reply(`Player \`${playerString}\` is not in the tracked list. Use \`!list\` to see tracked players.`);
                }
            } catch (error) {
                console.error(error);
                return message.reply('Error checking tracked players.');
            }
        }

        try {
            const result = await addPingSubscriber(message.guild.id, message.author.id, type, puuid);
            message.reply(result.message);
        } catch (error) {
            console.error(error);
            message.reply('Sorry, an error occurred while updating the ping list.');
        }
    }

    if (message.content.startsWith('!pingremove')) {
        if (!message.guild) {
            return message.reply('This command can only be used in a server, not in DMs.');
        }

        const args = message.content.slice('!pingremove'.length).trim().split(/\s+/);
        let puuid = 'GLOBAL';

        if (args[0] && args[0].length > 0) {
            const playerString = args.join(' ');
            // Verify if user wants to remove specific player subscription
            try {
                const trackedPlayers = await getTrackedPlayers();
                const matchedPlayer = trackedPlayers.find(p => `${p.username}#${p.tag}`.toLowerCase() === playerString.toLowerCase());

                if (matchedPlayer) {
                    puuid = matchedPlayer.puuid;
                } else {
                    return message.reply(`Player \`${playerString}\` is not in the tracked list.`);
                }
            } catch (error) {
                console.error(error);
                return message.reply('Error checking tracked players.');
            }
        }

        try {
            const result = await removePingSubscriber(message.guild.id, message.author.id, puuid);
            message.reply(result.message);
        } catch (error) {
            console.error(error);
            message.reply('Sorry, an error occurred while updating the ping list.');
        }
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
                playerStatus.set(result.puuid, { inGame: false, gameType: null, isRanked: false });
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

    if (message.content === '!interval' || message.content.startsWith('!interval ')) {
        const argument = message.content.slice('!interval'.length).trim().toLowerCase();

        try {
            const players = await getTrackedPlayers();
            const playerCount = players.length;
            const minimumInterval = calculateMinimumIntervalSeconds(playerCount);

            if (!argument || argument === 'auto' || argument === 'automatic') {
                await setAutomaticPolling();
                const maxAtCurrentInterval = calculateMaxTrackedPlayers(minimumInterval);
                return message.reply(
                    `Automatic polling enabled. With ${playerCount} tracked player${playerCount === 1 ? '' : 's'}, ` +
                    `the fastest safe interval is **${minimumInterval} seconds**. ` +
                    `That interval supports up to **${maxAtCurrentInterval} players** with a ` +
                    `${monitorConfig.safetyPaddingPercent}% safety margin.`
                );
            }

            if (argument === 'status') {
                const pollingSettings = await getPollingSettings();
                const effectiveInterval = getEffectivePollIntervalSeconds(playerCount, pollingSettings);
                const configuredText = pollingSettings.mode === 'automatic'
                    ? 'automatic'
                    : `${pollingSettings.intervalSeconds} seconds`;
                const maxPlayers = calculateMaxTrackedPlayers(effectiveInterval);

                return message.reply(
                    `Polling mode: **${configuredText}**\n` +
                    `Tracked players: **${playerCount}**\n` +
                    `Current effective interval: **${effectiveInterval} seconds**\n` +
                    `Fastest safe interval for this list: **${minimumInterval} seconds**\n` +
                    `Maximum players at the effective interval: **${maxPlayers}**`
                );
            }

            const requestedInterval = Number(argument);
            if (!Number.isInteger(requestedInterval) || requestedInterval <= 0) {
                return message.reply('Use `!interval`, `!interval status`, or `!interval <positive whole seconds>`.');
            }

            const maxTrackedPlayers = calculateMaxTrackedPlayers(requestedInterval);
            if (maxTrackedPlayers < Math.max(1, playerCount)) {
                return message.reply(
                    `A **${requestedInterval}-second** interval is not safe with ${playerCount} tracked ` +
                    `player${playerCount === 1 ? '' : 's'}. It allows at most **${maxTrackedPlayers}**. ` +
                    `The fastest safe interval for the current list is **${minimumInterval} seconds**. ` +
                    `The polling setting was not changed.`
                );
            }

            await setFixedPollingInterval(requestedInterval);
            return message.reply(
                `Polling interval set to **${requestedInterval} seconds**. ` +
                `This allows at most **${maxTrackedPlayers} tracked players** with a ` +
                `${monitorConfig.safetyPaddingPercent}% safety margin. ` +
                `The current list contains **${playerCount}**.`
            );
        } catch (error) {
            console.error('Error updating polling interval:', error);
            return message.reply('Sorry, an error occurred while updating the polling interval.');
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

    if (message.content === '!help') {
        const helpText = `
**League Stalker Bot Commands:**

**Tracking:**
\`!track <username>#<tag>\` - Track a new player (e.g., \`!track hide on bush#NA1\`)
\`!untrack <username>#<tag>\` - Stop tracking a player
\`!list\` - List all tracked players
\`!find <username>,<tag>\` - Find a player's PUUID

**Monitoring & Notifications:**
\`!channel\` - Set the current channel for notifications
\`!gamemode\` - Toggle server-wide filter (Ranked Only / All Games)
\`!stalk <puuid>\` - Manually check a player's status by PUUID
\`!interval\` - Use the fastest safe automatic polling interval
\`!interval <seconds>\` - Set a fixed interval if the current list permits it
\`!interval status\` - Show the current interval and tracking capacity

**Ping Subscriptions:**
\`!ping [ranked|all] [username#tag]\` - Subscribe to pings
  • \`!ping\` (or \`!ping all\`) - Notify for ALL games from ALL players
  • \`!ping ranked\` - Notify for RANKED games from ALL players
  • \`!ping all hide on bush#NA1\` - Notify for ALL games from THIS player
  • \`!ping ranked hide on bush#NA1\` - Notify for RANKED games from THIS player
\`!pingremove [username#tag]\` - Unsubscribe
  • \`!pingremove\` - Unsubscribe from global pings
  • \`!pingremove hide on bush#NA1\` - Unsubscribe from specific player pings
`;
        message.reply(helpText);
    }
});

// Monitoring function that checks tracked players periodically
async function startMonitoring() {
    console.log('Starting player monitoring...');
    console.log(
        `Riot request budget: ${monitorConfig.requestBudget}/${monitorConfig.rateLimitWindowSeconds}s.`
    );
    await monitorLoop();
}

async function monitorLoop() {
    let nextCycleDelay = 30000;

    try {
        const players = await getTrackedPlayers();
        const pollingSettings = await getPollingSettings();
        const intervalSeconds = getEffectivePollIntervalSeconds(players.length, pollingSettings);
        const intervalMilliseconds = intervalSeconds * 1000;
        const cycleStartedAt = Date.now();
        nextCycleDelay = intervalMilliseconds;

        if (
            pollingSettings.mode === 'fixed'
            && intervalSeconds > pollingSettings.intervalSeconds
        ) {
            console.warn(
                `Configured ${pollingSettings.intervalSeconds}s interval is unsafe for ` +
                `${players.length} players; using ${intervalSeconds}s.`
            );
        }

        for (let index = 0; index < players.length; index++) {
            const player = players[index];
            try {
                const currentStatus = await stalkPlayer(player.puuid);

                if (currentStatus === null) {
                    // Preserve the previous status when Riot cannot answer the request.
                } else {
                    const previousStatus = playerStatus.get(player.puuid) || { inGame: false, gameType: null, isRanked: false };

                    // Check if player just started a game
                    const startedGame = !previousStatus.inGame && currentStatus.inGame;

                    // Update status
                    playerStatus.set(player.puuid, currentStatus);

                    // If player just started a game, notify
                    if (startedGame) {
                        notifyPlayerInGame(player, currentStatus);
                    }
                }

            } catch (error) {
                console.error(`Error checking player ${player.username}#${player.tag}:`, error);
            }

            // Spread checks across the interval instead of sending a burst.
            const nextCheckAt = cycleStartedAt
                + Math.round((index + 1) * intervalMilliseconds / players.length);
            const delay = nextCheckAt - Date.now();
            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        nextCycleDelay = Math.max(0, cycleStartedAt + intervalMilliseconds - Date.now());
    } catch (error) {
        console.error('Error in monitoring loop:', error);
    }

    setTimeout(monitorLoop, nextCycleDelay);
}

// Send notification when a player starts a game
async function notifyPlayerInGame(player, gameStatus) {
    try {
        const guildChannels = await getAllGuildChannels();
        const allSettings = await getAllGuildSettings();

        if (Object.keys(guildChannels).length === 0) {
            console.log(`Player ${player.username}#${player.tag} started a game, but no notification channels are set.`);
            return;
        }

        const isRanked = gameStatus.isRanked;

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
                    const gameTypeText = gameStatus.gameType || 'game';
                    const pingSubscribers = await getUsersToPing(guildId, isRanked, player.puuid);
                    const pingMentions = pingSubscribers.map(userId => `<@${userId}>`).join(' ');
                    const pingText = pingMentions ? ` ${pingMentions}` : '';
                    await channel.send(`**${player.username}#${player.tag}** started a ${gameTypeText} game!${pingText}`);
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
