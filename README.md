# Discord League Tracker Bot

A Discord bot that automatically monitors League of Legends players and sends notifications when tracked players start games. The bot uses a configurable, rate-safe polling interval and sends notifications to configured channels in each server.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory with the following:
   ```
   DISCORD_TOKEN=your-discord-bot-token-here
   RIOT_TOKEN=your-riot-api-token-here
   ```

   The polling interval is managed with the `!interval` Discord command. The bot
   uses a 15% safety margin below Riot's published personal-key request limit,
   calculates safe intervals and tracking capacity, and persists the selected mode
   across restarts. All Riot requests share a rolling-window limiter and respect
   `429 Retry-After` responses.

3. Run the bot:
   ```bash
   npm start
   ```

## Commands

### General Commands
- `!ping` - Returns "Pong!" (health check)

### Player Lookup
- `!find [username], [tag]` - Looks up a player and returns their PUUID
  - Example: `!find YourUsername,NA1`

- `!stalk [puuid]` - Checks if a player (by PUUID) is currently in a game and shows game type
  - Example: `!stalk your-puuid-here`

### Player Tracking
- `!track [username#tag]` - Adds a player to the tracking list (automatic monitoring)
  - Example: `!track YourUsername#NA1`
  - The bot automatically checks this player using the configured safe interval

- `!untrack [username#tag]` - Removes a player from the tracking list
  - Example: `!untrack YourUsername#NA1`

- `!list` - Lists all currently tracked players

- `!interval` - Enables the fastest safe automatic interval for the current list
- `!interval [seconds]` - Sets a fixed interval when the current list fits its request budget
- `!interval status` - Shows the current interval and tracking capacity

### Server Configuration
- `!channel` - Sets the current channel as the notification channel for this server
  - Must be run in a server (not DMs)
  - Each server can have its own notification channel
  - When a tracked player starts a game, notifications are sent to all servers that have set a notification channel

- `!gamemode` - Toggles between ranked-only and all games for this server
  - Must be run in a server (not DMs)
  - Toggles between:
    - **Ranked games only** (default) - Only sends notifications for RANKED games
    - **All games** - Sends notifications for any game type (RANKED, NORMAL, etc.)
  - Each server can have its own preference
  - Example: Run `!gamemode` once to switch to all games, run it again to switch back to ranked-only

### User Subscriptions
- `!ping [type] [player]` - Subscribe to receive mentions when players start games
  - `!ping` or `!ping all` - Subscribe to ALL games from ALL players
  - `!ping ranked` - Subscribe to RANKED games only (from ALL players)
  - `!ping all username#tag` - Subscribe to ALL games from a SPECIFIC player
  - `!ping ranked username#tag` - Subscribe to RANKED games from a SPECIFIC player
  - Example: `!ping ranked Hide on bush#KR1`

- `!pingremove [player]` - Unsubscribe from pings
  - `!pingremove` - Unsubscribe from ALL global pings
  - `!pingremove username#tag` - Unsubscribe from a SPECIFIC player
  - Example: `!pingremove Hide on bush#KR1`

### Help
- `!help` - Lists all available commands and usage instructions

## How It Works

1. **Track Players**: Use `!track` to add players you want to monitor
2. **Set Notification Channel**: Use `!channel` in the channel where you want notifications
3. **Configure Game Mode** (optional): Use `!gamemode` to toggle server-wide filter (default: ranked-only)
4. **Subscribe to Pings** (optional): Use `!ping` to get mentioned when games start
5. **Automatic Monitoring**: The bot checks all tracked players using the configured safe interval
6. **Notifications**: When a tracked player starts a game, the bot sends a notification to servers that have configured a notification channel. Users who subscribed via `!ping` will be mentioned.

## Notes

- **Ping Preference**: You can subscribe to pings globally (for all tracked players) or for specific players.
- **Default Behavior**: By default, servers only receive notifications for **RANKED** games (configurable via `!gamemode`)
- **Game Mode Toggle**: Use `!gamemode` to switch between ranked-only and all games per server
- **Notification Channels**: Each server can have its own notification channel
- **Player Tracking**: Player tracking is global await(shared across all servers)
- **Multi-Server**: Notifications are sent to all servers that have configured notification channels and match their game mode preference
- Polling introduces a notification delay of up to approximately the configured interval
