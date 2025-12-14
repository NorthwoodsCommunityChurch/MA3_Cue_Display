const { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const osc = require('osc');
const os = require('os');

let mainWindow = null;
let tray = null;
let httpServer = null;
let wss = null;
let udpPort = null;

const HTTP_PORT = 3000;
const OSC_PORT = 8000;

// Store last triggered cue state
let currentState = {
  sequenceName: '',
  cueNumber: '--',
  cueName: '',
  progress: 0,
  isActive: false,
  lastUpdate: null,
  connected: false
};

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Get local IP addresses
function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push({ address: net.address, interface: name });
      }
    }
  }
  return ips;
}

// Broadcast to all connected WebSocket clients
function broadcast(message) {
  if (wss) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const expressApp = express();
    httpServer = http.createServer(expressApp);
    wss = new WebSocket.Server({ server: httpServer });

    // Serve static files from public directory
    expressApp.use(express.static(path.join(__dirname, 'public')));

    // API endpoint for current state
    expressApp.get('/api/state', (req, res) => {
      res.json(currentState);
    });

    // Main route
    expressApp.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // WebSocket connection handling
    wss.on('connection', (ws) => {
      console.log('Web client connected');

      ws.send(JSON.stringify({
        type: 'state',
        data: currentState
      }));

      ws.on('close', () => {
        console.log('Web client disconnected');
      });
    });

    // Create OSC UDP Port to receive messages from GrandMA3
    udpPort = new osc.UDPPort({
      localAddress: '0.0.0.0',
      localPort: OSC_PORT,
      metadata: true
    });

    // Parse incoming OSC messages
    udpPort.on('message', (oscMsg, timeTag, info) => {
      const address = oscMsg.address;
      const args = oscMsg.args;


      currentState.connected = true;
      currentState.lastUpdate = new Date().toISOString();

      // Always notify launcher window of OSC activity
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('osc-status', {
          connected: true,
          lastUpdate: currentState.lastUpdate,
          lastMessage: address
        });
      }

      // Extract sequence identifier from address
      const addressParts = address.split('/').filter(p => p);
      if (addressParts.length > 0) {
        const lastPart = addressParts[addressParts.length - 1];
        if (lastPart.includes('.')) {
          const pathParts = lastPart.split('.');
          currentState.sequenceName = 'Seq ' + pathParts[pathParts.length - 1];
        } else {
          currentState.sequenceName = lastPart;
        }
      }

      // Parse GrandMA3 OSC message format
      if (args && args.length > 0) {
        const action = args[0]?.value;

        if (action === 'Go+' || action === 'Go-' || action === 'Goto' || action === 'Top') {
          if (args[2] && args[2].type === 's') {
            currentState.cueName = args[2].value;

            const match = args[2].value.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+(.+)$/);
            if (match) {
              currentState.cueNumber = match[2];
            }
          }

          if (args[1] && (args[1].type === 'i' || args[1].type === 'f')) {
            if (!currentState.cueNumber || currentState.cueNumber === '--') {
              currentState.cueNumber = args[1].value.toString();
            }
          }

          currentState.isActive = true;
        }
        else if (action === 'FaderMaster') {
          if (args[2] && args[2].type === 'f') {
            currentState.progress = args[2].value * 100;
          }
        }
      }

      broadcast({
        type: 'cueUpdate',
        data: currentState
      });
    });

    udpPort.on('ready', () => {
      console.log(`OSC listening on port ${OSC_PORT}`);
    });

    udpPort.on('error', (err) => {
      console.error('OSC Error:', err);
    });

    udpPort.open();

    httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
      console.log(`GrandMA3 Cue Display running at http://localhost:${HTTP_PORT}`);
      resolve();
    });

    httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${HTTP_PORT} in use`);
        reject(new Error(`Port ${HTTP_PORT} is already in use`));
      } else {
        reject(err);
      }
    });
  });
}

function getServerPort() {
  return httpServer ? httpServer.address().port : HTTP_PORT;
}

function createWindow(showOnCreate = false) {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 420,
    resizable: false,
    maximizable: false,
    show: showOnCreate,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('window.html');

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// IPC handlers
ipcMain.handle('open-in-browser', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('get-login-item-settings', () => {
  return app.getLoginItemSettings();
});

ipcMain.handle('set-login-item-settings', (event, openAtLogin) => {
  app.setLoginItemSettings({
    openAtLogin: openAtLogin,
    openAsHidden: true
  });
  return app.getLoginItemSettings();
});

ipcMain.handle('get-network-info', () => {
  return {
    ips: getLocalIPs(),
    httpPort: getServerPort(),
    oscPort: OSC_PORT
  };
});

ipcMain.handle('get-osc-status', () => {
  return {
    connected: currentState.connected,
    lastUpdate: currentState.lastUpdate
  };
});

function createTray() {
  // Create tray icon - use template image for macOS menu bar
  // When app is packaged, assets are unpacked to app.asar.unpacked
  let iconPath = path.join(__dirname, 'assets', 'trayTemplate.png');
  if (!require('fs').existsSync(iconPath)) {
    iconPath = iconPath.replace('app.asar', 'app.asar.unpacked');
  }
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      // Fallback: create a simple icon programmatically
      trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABzSURBVDiNY2AYBaNgGAAGJgYGBn8GBoZ/DAwM/0H0fwYGhn9QMQY0MSh7P5I8VCM6fz9UDAwYsGjGJwcWJ0IcLv//IfL/MSYDkQZBXYKsGcz+j80AlBhIAiMNADQA7gIMLoB7AYsLsHoBxSGBPSSGAcYAAJB+Hfm8O6aYAAAAAElFTkSuQmCC');
    }
    trayIcon.setTemplateImage(true);
  } catch (e) {
    console.error('Error loading tray icon:', e);
    trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABzSURBVDiNY2AYBaNgGAAGJgYGBn8GBoZ/DAwM/0H0fwYGhn9QMQY0MSh7P5I8VCM6fz9UDAwYsGjGJwcWJ0IcLv//IfL/MSYDkQZBXYKsGcz+j80AlBhIAiMNADQA7gIMLoB7AYsLsHoBxSGBPSSGAcYAAJB+Hfm8O6aYAAAAAElFTkSuQmCC');
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('GrandMA3 Cue Display');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Display in Browser',
      click: () => {
        shell.openExternal(`http://localhost:${getServerPort()}`);
      }
    },
    {
      label: 'Show Launcher',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: `Web: localhost:${getServerPort()}`,
      enabled: false
    },
    {
      label: `OSC: port ${OSC_PORT}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit GMA3 Cue Display',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

app.whenReady().then(async () => {
  // Hide dock icon - run as menu bar only app
  if (app.dock) {
    app.dock.hide();
  }

  try {
    await startServer();
    createWindow(true);  // Show launcher on startup
    createTray();

    // Send network info to renderer
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('network-info', {
        ips: getLocalIPs(),
        httpPort: getServerPort(),
        oscPort: OSC_PORT
      });
    });
  } catch (err) {
    console.error('Failed to start:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Keep running in tray on macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (udpPort) {
    udpPort.close();
  }
  if (httpServer) {
    httpServer.close();
  }
});
