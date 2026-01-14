require('dotenv').config()

const QUEUE_TYPES = {
    420: { name: 'Ranked Solo/Duo', isRanked: true },
    440: { name: 'Ranked Flex', isRanked: true },
    400: { name: 'Normal Draft', isRanked: false },
    430: { name: 'Normal Blind', isRanked: false },
    450: { name: 'ARAM', isRanked: false },
    480: { name: 'Quickplay', isRanked: false },
    1700: { name: 'Arena', isRanked: false },
    // Add more as needed
};

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
            return { inGame: false, gameType: null, isRanked: false };
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        let gameType = data.gameType; // Default to raw type
        let isRanked = false;

        if (data.gameType === 'CUSTOM_GAME') {
            gameType = 'Custom Game';
        } else if (data.gameType === 'TUTORIAL_GAME') {
            gameType = 'Tutorial';
        } else if (data.gameQueueConfigId) {
            const queueInfo = QUEUE_TYPES[data.gameQueueConfigId];
            if (queueInfo) {
                gameType = queueInfo.name;
                isRanked = queueInfo.isRanked;
            } else {
                // Determine if it's URF or other special modes if needed, 
                // or just leave it as MATCHED_GAME or try to find a generic name
                gameType = `Queue ${data.gameQueueConfigId}`;
            }
        }

        return {
            inGame: true,
            gameType: gameType,
            isRanked: isRanked,
            rawGameType: data.gameType // Keep original just in case
        };
    } catch (err) {
        console.error('Error spectating player: ', err);
        return null;
    }
}

module.exports = { stalkPlayer }