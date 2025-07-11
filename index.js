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

// Log the token that was loaded from the environment so we know dotenv worked
console.log(TOKEN);
// client.once('ready', () => {
//     console.log(`Logged in as ${client.user.tag}!`);
// });

// client.on('messageCreate', message => {
//     if (message.content === '!ping') {
//         message.reply('Pong!');
//     }
// });

// client.login(TOKEN);