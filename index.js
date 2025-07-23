require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { getPlayerId } = require('./get-player-Id');
const { stalkPlayer } = require('./in-game');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
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
        const puuid = message.content.trim();

        try{
            const matchStatus = stalkPlayer(puuid)
            if(matchStatus) {
                message.reply("In game!");
            }
            if(!matchStatus) {
                message.reply("not in game!");
            }
        } catch (error) {
            console.error(error);
            message.reply("Sorry, an error occurred while I was stalking.");
        }
    }
});

client.login(TOKEN);