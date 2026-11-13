require('dotenv').config();

const { Client, EmbedBuilder, Events, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const { getPlayerId } = require('./functions/get-player-Id');
const { stalkPlayer } = require('./functions/in-game');
const { buildPostGameLinks } = require('./functions/match-links');
const { startKeepAliveServer } = require('./functions/upTime');
const { addTrackedPlayer, removeTrackedPlayer, getTrackedPlayers } = require('./functions/tracked-players');
const { setGuildChannel, getAllGuildChannels } = require('./functions/guild-channels');
const { setRankedOnly, getAllGuildSettings, getRankedOnly } = require('./functions/guild-settings');
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
const FOLLOWER_ROLE_NAME = 'followers of the goat';
const followerRoleCreationPromises = new Map();

// Store previous in-game status for each tracked player (puuid -> { inGame: boolean, gameType: string | null })
const playerStatus = new Map();

startKeepAliveServer();

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}!`);
    startMonitoring();
});

async function getOrCreateFollowerRole(guild) {
    if (followerRoleCreationPromises.has(guild.id)) {
        return followerRoleCreationPromises.get(guild.id);
    }

    const rolePromise = (async () => {
        const roles = await guild.roles.fetch();
        const existingRole = roles.find(role => role.name.toLowerCase() === FOLLOWER_ROLE_NAME);
        if (existingRole) return existingRole;

        if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
            throw new Error('MISSING_MANAGE_ROLES');
        }

        return guild.roles.create({
            name: FOLLOWER_ROLE_NAME,
            mentionable: true,
            reason: 'League Stalker notification followers'
        });
    })();

    followerRoleCreationPromises.set(guild.id, rolePromise);
    try {
        return await rolePromise;
    } finally {
        followerRoleCreationPromises.delete(guild.id);
    }
}

async function getFollowerRole(guild) {
    const roles = await guild.roles.fetch();
    return roles.find(role => role.name.toLowerCase() === FOLLOWER_ROLE_NAME) || null;
}

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content.trim().toLowerCase() === '!join') {
        if (!message.guild) {
            return message.reply('This command can only be used in a server, not in DMs.');
        }

        try {
            const role = await getOrCreateFollowerRole(message.guild);
            if (message.member.roles.cache.has(role.id)) {
                return message.reply(`You already have the **${FOLLOWER_ROLE_NAME}** role.`);
            }

            await message.member.roles.add(role, 'Joined League Stalker notifications');
            return message.reply(`You joined **${FOLLOWER_ROLE_NAME}** and will be notified when a tracked player starts a game.`);
        } catch (error) {
            console.error(error);
            if (error.message === 'MISSING_MANAGE_ROLES') {
                return message.reply('I need the **Manage Roles** permission before I can create the notification role.');
            }
            return message.reply('I could not assign the notification role. Make sure my bot role has **Manage Roles** and is above **followers of the goat**.');
        }
    }

    if (message.content.trim().toLowerCase() === '!leave') {
        if (!message.guild) {
            return message.reply('This command can only be used in a server, not in DMs.');
        }

        try {
            const role = await getFollowerRole(message.guild);
            if (!role || !message.member.roles.cache.has(role.id)) {
                return message.reply(`You are not currently in **${FOLLOWER_ROLE_NAME}**.`);
            }

            await message.member.roles.remove(role, 'Left League Stalker notifications');
            return message.reply(`You left **${FOLLOWER_ROLE_NAME}** and will no longer receive game notifications.`);
        } catch (error) {
            console.error(error);
            return message.reply('I could not remove the notification role. Please ask a server administrator for help.');
        }
    }

    if (message.content === '!find' || message.content.startsWith('!find ')) {
        const riotId = message.content.slice('!find '.length).trim();
        const separatorIndex = riotId.lastIndexOf('#');
        const username = riotId.slice(0, separatorIndex).trim();
        const tag = riotId.slice(separatorIndex + 1).trim();

        if (separatorIndex <= 0 || !username || !tag) {
            return message.reply('Please provide a Riot ID in `Game Name#TAG` format. Example: `!find Hide on bush#KR1`');
        }

        try {
            const puuid = await getPlayerId(username, tag);
            if (!puuid) {
                return message.reply(`I could not find the Riot ID **${username}#${tag}**.`);
            }

            const matchStatus = await stalkPlayer(puuid);
            if (matchStatus === null) {
                return message.reply(`I found **${username}#${tag}**, but could not check their live-game status.`);
            }
            if (matchStatus.inGame) {
                return message.reply(`**${username}#${tag}** is currently in a **${matchStatus.gameType || 'game'}** game.`);
            }
            return message.reply(`**${username}#${tag}** is not currently in a game.`);
        } catch (error) {
            console.error(error);
            return message.reply('Sorry, an error occurred while checking that Riot ID.');
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

        if (message.content.startsWith('!hi')) {
        // Toggle between ranked-only and all games
       message.reply("yo")
    }

    if (message.content === '!help') {
        const helpEmbed = new EmbedBuilder()
            .setColor(0xC89B3C)
            .setTitle('League Stalker Bot Commands')
            .setDescription('Use Riot IDs in `Game Name#TAG` format.')
            .addFields(
                {
                    name: '🔔 Notifications',
                    value: [
                        '`!join` — Join **followers of the goat** and receive game alerts',
                        '`!leave` — Leave the notification role',
                        '`!channel` — Send future alerts to the current channel',
                        '`!gamemode` — Toggle ranked-only or all-game alerts',
                        'Finished-game alerts include DPM.LOL and OP.GG links without a ping'
                    ].join('\n')
                },
                {
                    name: '👤 Player Tracking',
                    value: [
                        '`!track Game Name#TAG` — Add a player to continuous tracking',
                        '`!untrack Game Name#TAG` — Stop tracking a player',
                        '`!list` — Show all tracked players',
                        '`!find Game Name#TAG` — Check whether a Riot ID is currently in game'
                    ].join('\n')
                },
                {
                    name: '⏱️ Polling',
                    value: [
                        '`!interval` — Enable the fastest safe automatic interval',
                        '`!interval <seconds>` — Set a safe fixed interval',
                        '`!interval status` — Show polling mode, interval, and capacity'
                    ].join('\n')
                }
            )
            .setFooter({ text: 'Example Riot ID: Hide on bush#KR1' });

        return message.reply({ embeds: [helpEmbed] });
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
                    const previousStatus = playerStatus.get(player.puuid) || {
                        inGame: false,
                        gameType: null,
                        isRanked: false,
                        gameId: null
                    };

                    const startedGame = !previousStatus.inGame && currentStatus.inGame;
                    const finishedGame = previousStatus.inGame && !currentStatus.inGame;

                    playerStatus.set(player.puuid, currentStatus);

                    if (startedGame) {
                        await notifyPlayerInGame(player, currentStatus);
                    } else if (finishedGame) {
                        await notifyPlayerGameFinished(player, previousStatus);
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
                    const guild = channel.guild;
                    const followerRole = guild ? await getFollowerRole(guild) : null;
                    const roleMention = followerRole ? ` <@&${followerRole.id}>` : '';
                    const allowedRoleMentions = followerRole ? [followerRole.id] : [];

                    await channel.send({
                        content: `**${player.username}#${player.tag}** started **${gameTypeText}**!${roleMention}`,
                        allowedMentions: { roles: allowedRoleMentions }
                    });
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

// Send match links after a tracked player leaves their game, without pinging anyone.
async function notifyPlayerGameFinished(player, gameStatus) {
    try {
        if (!gameStatus.gameId) {
            console.warn(`Finished game for ${player.username}#${player.tag} had no game ID.`);
            return;
        }

        const guildChannels = await getAllGuildChannels();
        const allSettings = await getAllGuildSettings();
        const links = buildPostGameLinks(player, gameStatus);

        for (const [guildId, channelId] of Object.entries(guildChannels)) {
            try {
                const rankedOnly = allSettings[guildId]?.rankedOnly !== false;
                if (rankedOnly && !gameStatus.isRanked) {
                    continue;
                }

                const channel = await client.channels.fetch(channelId);
                if (channel) {
                    const gameTypeText = gameStatus.gameType || 'game';
                    await channel.send({
                        content:
                            `**${player.username}#${player.tag}** finished **${gameTypeText}**.\n` +
                            `[View this match on DPM.LOL](${links.dpm}) • ` +
                            `[View profile on OP.GG](${links.opgg})`,
                        allowedMentions: { parse: [] }
                    });
                }
            } catch (error) {
                console.error(`Error sending game-finished notification to channel ${channelId}:`, error);
            }
        }
    } catch (error) {
        console.error('Error in notifyPlayerGameFinished:', error);
    }
}

client.login(TOKEN);
