require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;

console.log(DISCORD_TOKEN);
// client.once('ready', () => {
//     console.log(`Logged in as ${client.user.tag}!`);
// });

// client.on('messageCreate', message => {
//     if (message.content === '!ping') {
//         message.reply('Pong!');
//     }
// });

// client.login(TOKEN);