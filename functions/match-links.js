const OP_GG_REGION = 'na';

function getProfilePath(username, tag) {
    return `${encodeURIComponent(username)}-${encodeURIComponent(tag)}`;
}

function buildPostGameLinks(player, gameStatus) {
    const profilePath = getProfilePath(player.username, player.tag);
    const gameId = encodeURIComponent(String(gameStatus.gameId));

    return {
        dpm: `https://dpm.lol/${profilePath}?match=${gameId}`,
        opgg: `https://op.gg/lol/summoners/${OP_GG_REGION}/${profilePath}`
    };
}

module.exports = { buildPostGameLinks };
