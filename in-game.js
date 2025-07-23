require('dotenv').config()

async function stalkPlayer(puuid) {
    try {
         const response = await fetch("https://na1.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/" + PUUID, 
            {
            headers: {
                'X-Riot-Token': process.env.RIOT_TOKEN
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.gameType == 'RANKED') {
            return true
        }
        return false
    } catch (err) {
        console.error('Error spectating player: '. err);
        return null
    }
}

module.exports = { stalkPlayer }