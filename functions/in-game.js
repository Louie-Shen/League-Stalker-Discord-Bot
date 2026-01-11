require('dotenv').config()

async function stalkPlayer(puuid) {
    try {
         const response = await fetch("https://na1.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/" + puuid, 
            {
            headers: {
                'X-Riot-Token': process.env.RIOT_TOKEN
            }
        });
        
        // 404 means player is not in game
        if (response.status === 404) {
            return { inGame: false, gameType: null };
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return { 
            inGame: true, 
            gameType: data.gameType || null 
        };
    } catch (err) {
        console.error('Error spectating player: ', err);
        return null;
    }
}

module.exports = { stalkPlayer }