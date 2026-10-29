require('dotenv').config();

const { riotFetch } = require('./riot-api');

async function getPlayerId(name, tag) {
    try {
        const response = await riotFetch(
            "https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/"
             + encodeURIComponent(name) + "/" + encodeURIComponent(tag),
            {
            headers: {
                'X-Riot-Token': process.env.RIOT_TOKEN
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('PUUID found: ', data.puuid);
        return data.puuid;
    } catch (err) {
        console.error('Error fetching player ID:', err);
        return null; 
    }
}

module.exports = { getPlayerId };
