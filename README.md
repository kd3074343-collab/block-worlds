# Block Worlds — Render-ready

## Render Web Service settings
- Runtime/Language: Node
- Branch: main
- Root Directory: leave blank
- Build Command: `npm install`
- Start Command: `npm start`
- Instance: Free (if available)

The server reads Render's `PORT` environment variable and listens on `0.0.0.0`. WebSocket multiplayer uses `/ws`; the browser client automatically uses `wss://` when served over HTTPS.

## Important limitations
- The shared seed, connected players, and changed blocks are held in memory and reset when the service restarts.
- Free instances may sleep when idle; the first visit can be slow.
- Test gameplay after deployment; packaging and syntax checks do not guarantee full multiplayer behavior.


Custom HUD fix: The Custom HUD editor now includes visible “Save HUD” and “Cancel” buttons. Save persists the control positions locally.
