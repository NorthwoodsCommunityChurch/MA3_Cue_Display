# GMA3 Cue Display - Development Notes

## Overview

This is an Electron-based menu bar application that displays real-time cue information from GrandMA3 lighting consoles via OSC.

## Architecture

- **Electron** - Desktop app framework
- **Express** - Web server for the display interface (port 3000)
- **WebSocket** - Real-time updates to web clients
- **OSC (osc.js)** - Receives cue data from GrandMA3 (port 8000)

## Building

```bash
cd cue-display-app
npm install
npm run build:mac
```

The DMG will be created in `dist/GMA3 Cue Display-1.0.0-arm64.dmg`

## Development

```bash
npm start
```

## Known Issues

### ELECTRON_RUN_AS_NODE Environment Variable

**Problem:** VS Code sets `ELECTRON_RUN_AS_NODE=1` in its integrated terminal environment. This causes Electron to run as a Node.js process instead of as an Electron app, which prevents the app from starting correctly.

**Symptoms:**
- App launches but immediately exits
- No tray icon appears
- Server doesn't start
- No console output

**Solution:** The npm scripts include `unset ELECTRON_RUN_AS_NODE` to clear this variable before launching Electron.

**For manual testing from terminal:**
```bash
# Option 1: Use env -i with open command
env -i /usr/bin/open -a "GMA3 Cue Display"

# Option 2: Unset the variable first
unset ELECTRON_RUN_AS_NODE
npm start

# Option 3: Launch from Finder (double-click)
# This always works because Finder doesn't inherit VS Code's environment
```

### Tray Icon Path in Packaged App

**Problem:** When the app is packaged with asar, `nativeImage.createFromPath()` cannot read files from inside the asar archive.

**Solution:** Assets are unpacked using `asarUnpack` in package.json:
```json
{
  "asar": true,
  "asarUnpack": ["assets/**"]
}
```

The code checks if the path exists and falls back to the unpacked location:
```javascript
let iconPath = path.join(__dirname, 'assets', 'trayTemplate.png');
if (!require('fs').existsSync(iconPath)) {
  iconPath = iconPath.replace('app.asar', 'app.asar.unpacked');
}
```

### Code Signing

The app is not signed with an Apple Developer certificate, which means:
- Users may see Gatekeeper warnings on first launch
- Right-click > Open or System Preferences > Security may be needed to allow the app

To remove quarantine attribute after copying:
```bash
xattr -dr com.apple.quarantine "/Applications/GMA3 Cue Display.app"
```

## File Structure

```
cue-display-app/
├── main.js              # Electron main process (server, tray, OSC)
├── preload.js           # IPC bridge for renderer
├── window.html          # Launcher window UI
├── window.js            # Launcher window logic
├── package.json         # Dependencies and build config
├── entitlements.mac.plist # macOS permissions
├── assets/
│   ├── icon.svg         # App icon source (CD3)
│   ├── icon.icns        # App icon for macOS
│   ├── trayTemplate.svg # Menu bar icon source (CD)
│   ├── trayTemplate.png # Menu bar icon 16x16
│   └── trayTemplate@2x.png # Menu bar icon 32x32 (retina)
└── public/
    └── index.html       # Web display interface
```

## Ports

- **3000** - HTTP server (web interface)
- **8000** - OSC UDP listener (GrandMA3 input)

## GrandMA3 Configuration

Configure GrandMA3 to send OSC messages to this computer's IP address on port 8000.

The app parses these OSC message types:
- `Go+`, `Go-`, `Goto`, `Top` - Cue triggers
- `FaderMaster` - Fader position updates
