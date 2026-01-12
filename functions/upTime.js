const express = require('express');

function startKeepAliveServer(port = Number(process.env.PORT) || 3000) {
    const app = express();

    app.get('/', (req, res) => res.send('Bot is alive!'));
    app.listen(port, () => console.log(`Web server running on ${port}...`));
}

module.exports = { startKeepAliveServer };
