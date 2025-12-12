# GrandMA3 Cue Display

Real-time cue display for GrandMA3 lighting consoles. Shows the current cue name from your GrandMA3 console using OSC (Open Sound Control) protocol.

## Features

- Real-time cue display from GrandMA3 console
- OSC communication (UDP)
- Web-based interface accessible from any device
- Auto-reconnect on connection loss
- Clean, theatrical UI optimized for stage visibility

## Quick Start

### Prerequisites

- Node.js 16.0.0 or higher
- GrandMA3 console or onPC software
- Network connection between your computer and the console

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd gma3-cue-display

# Install dependencies
npm install

# Start the server
npm start
```

Open http://localhost:3000 in your browser.

### One-Click Start (macOS)

Double-click `scripts/start.sh` to automatically install dependencies and launch the server.

## GrandMA3 Configuration

### Step 1: Open OSC Settings
1. Press **Menu**
2. Navigate to **In & Out**
3. Select **OSC**

### Step 2: Configure OSC Output
1. **Enable Output**: Toggle ON
2. **Destination IP**: Enter the IP address of the computer running this app
3. **Port**: Set to `8000` (or match the `OSC_PORT` in your configuration)
4. **Mode**: UDP

### Step 3: Enable Send Options
In the OSC configuration grid, set **Send** to **Yes** for the rows you want to monitor.

### Step 4: Verify Connection
When a cue is triggered on the console, you should see the cue name update in real-time on the web display.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | 3000 | Web server port |
| `OSC_PORT` | 8000 | OSC listening port |

### Example with custom ports:
```bash
HTTP_PORT=8080 OSC_PORT=9000 npm start
```

Or copy `.env.example` to `.env` and modify the values.

## Project Structure

```
gma3-cue-display/
├── public/              # Static web files
│   └── index.html       # Web display interface
├── src/
│   └── server.js        # Node.js server (OSC + WebSocket)
├── scripts/
│   └── start.sh         # macOS one-click launcher
├── .env.example         # Environment configuration template
├── .gitignore
├── LICENSE
├── package.json
└── README.md
```

## Network Architecture

```
┌─────────────────┐         OSC (UDP)          ┌─────────────────┐
│   GrandMA3      │ ────────────────────────▶  │   Node.js       │
│   Console       │        Port 8000           │   Server        │
└─────────────────┘                            └────────┬────────┘
                                                        │
                                                        │ WebSocket
                                                        │
                                               ┌────────▼────────┐
                                               │   Web Browser   │
                                               │   (Display)     │
                                               └─────────────────┘
```

## API Reference

### GET /api/state

Returns the current state as JSON:

```json
{
  "sequenceName": "Seq 7",
  "cueNumber": "3.5",
  "cueName": "Song 1 - Chorus",
  "progress": 100,
  "isActive": true,
  "lastUpdate": "2024-01-15T20:30:00.000Z",
  "connected": true
}
```

### WebSocket

Connect to the server's WebSocket endpoint to receive real-time updates. Messages are JSON with a `type` field:

- `state` - Initial state on connection
- `cueUpdate` - Cue information has changed

## Troubleshooting

### No Connection

1. **Check Network**: Ensure console and display computer are on the same network
2. **Verify IP**: Confirm the destination IP in GrandMA3 OSC settings matches your computer
3. **Check Port**: Make sure port 8000 isn't blocked by a firewall
4. **Enable Output**: Verify "Enable Output" is ON in GrandMA3

### Cues Not Updating

1. **Check Send Setting**: Ensure "Send" is set to Yes for your sequence in the OSC grid
2. **Trigger Cue**: Press Go+ on the console to trigger a cue change
3. **Check Server Logs**: The server logs all incoming OSC messages for debugging

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## License

MIT License - see [LICENSE](LICENSE) for details.

## Credits

Built for the live entertainment industry. Designed to work with MA Lighting's GrandMA3 platform.
