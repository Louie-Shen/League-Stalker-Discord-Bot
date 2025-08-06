const express = require('express');

function startKeepAliveServer(port = 3000){
    const app = express();
    
    app.get('/', (req, res) => res.send('Bot is alive!'));
    app.listen(3000, () => console.log('Web server running...'));
}

module.exports = { startKeepAliveServer }