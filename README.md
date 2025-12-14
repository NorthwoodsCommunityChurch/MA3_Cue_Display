# GrandMA3 Cue Display

A macOS app that displays your current GrandMA3 cue in a web browser. Point any device on your network to the display URL and see real-time cue information from your lighting console.

## What It Does

This app runs quietly in your macOS menu bar and serves a **web-based cue display** that shows:
- **Sequence name** on the first line
- **Cue number and name** on the second line

Open the display URL in any web browser on any device (phone, tablet, laptop, dedicated monitor) to see your current cue in real-time.

## Features

- **Web-based display** - View cues in any browser on any device on your network
- **Menu bar app** - Runs silently in your macOS menu bar
- **Real-time updates** - Cue changes appear instantly via WebSocket
- **OSC communication** - Receives cue data from GrandMA3 via UDP
- **OSC log viewer** - Debug incoming OSC messages at `/osc-log`
- **Clean UI** - Large, readable text optimized for stage visibility
- **Auto-reconnect** - Browser reconnects automatically if connection drops

## Quick Start (macOS)

1. **Download** the DMG from Releases (or build from source)
2. **Install** by dragging "GMA3 Cue Display" to Applications
3. **Launch** the app - it appears in your menu bar
4. **Open** the cue display in your browser from the launcher window

The launcher window shows:
- Display URL to open in any browser
- OSC port for GrandMA3 configuration
- Connection status indicator

## GrandMA3 Configuration

### Step 1: Open OSC Settings
1. Press **Menu**
2. Navigate to **In & Out**
3. Select **OSC**

### Step 2: Configure OSC Output
1. **Enable Output**: Toggle ON
2. **Destination IP**: Enter the IP address of the computer running this app
3. **Port**: Set to `8000`
4. **Mode**: UDP

### Step 3: Enable Send Options
In the OSC configuration grid, set **Send** to **Yes** for the rows you want to monitor.

### Step 4: Verify Connection
When a cue is triggered on the console, you should see the cue name update in real-time on the web display.

## Ports

| Port | Protocol | Description |
|------|----------|-------------|
| 3000 | HTTP/WebSocket | Web display server |
| 8000 | UDP | OSC input from GrandMA3 |

## Project Structure

```
MA3 Cue Display/
├── cue-display-app/          # Electron menu bar app
│   ├── main.js               # Main process (server + OSC)
│   ├── public/
│   │   ├── index.html        # Web cue display (served to browsers)
│   │   └── osc-log.html      # OSC message log viewer
│   ├── window.html           # Launcher window UI
│   └── package.json          # Dependencies and build config
└── README.md
```

## Network Architecture

```
┌─────────────────┐         OSC (UDP)          ┌─────────────────┐
│   GrandMA3      │ ────────────────────────▶  │   Menu Bar App  │
│   Console       │        Port 8000           │   (Electron)    │
└─────────────────┘                            └────────┬────────┘
                                                        │
                                                        │ WebSocket
                                                        │ Port 3000
                                               ┌────────▼────────┐
                                               │   Web Browser   │
                                               │  (Cue Display)  │
                                               └─────────────────┘
```

Open `http://<your-ip>:3000` in any browser to view the cue display.

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
- `oscLog` - New OSC message received (for log viewers)

### GET /api/osc-log

Returns the last 100 OSC messages as a JSON array.

## Troubleshooting

### No Connection

1. **Check Network**: Ensure console and display computer are on the same network
2. **Verify IP**: Confirm the destination IP in GrandMA3 OSC settings matches your computer
3. **Check Port**: Make sure port 8000 isn't blocked by a firewall
4. **Enable Output**: Verify "Enable Output" is ON in GrandMA3

### Cues Not Updating

1. **Check Send Setting**: Ensure "Send" is set to Yes for your sequence in the OSC grid
2. **Trigger Cue**: Press Go+ on the console to trigger a cue change
3. **View OSC Log**: Open the OSC log from the launcher to see incoming messages

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## License

MIT License - see [LICENSE](LICENSE) for details.

## Credits

Built for the live entertainment industry. Designed to work with MA Lighting's GrandMA3 platform.
