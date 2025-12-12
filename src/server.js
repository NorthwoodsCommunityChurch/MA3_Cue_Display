/**
 * GrandMA3 Cue Display Server
 * 
 * Receives OSC messages from a GrandMA3 console and broadcasts
 * the last triggered cue to connected web clients via WebSocket.
 * 
 * GrandMA3 Configuration:
 * 1. Menu > In & Out > OSC
 * 2. Enable Output
 * 3. Set Destination IP to this computer's IP
 * 4. Set Port to 8000
 * 5. Enable "Send" for your sequences
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const osc = require('osc');
const path = require('path');

// Configuration
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const OSC_PORT = process.env.OSC_PORT || 8000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API endpoint for current state
app.get('/api/state', (req, res) => {
    res.json(currentState);
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

// Broadcast to all connected clients
function broadcast(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Create OSC UDP Port to receive messages from GrandMA3
const udpPort = new osc.UDPPort({
    localAddress: '0.0.0.0',
    localPort: OSC_PORT,
    metadata: true
});

// Parse incoming OSC messages
udpPort.on('message', (oscMsg, timeTag, info) => {
    const address = oscMsg.address;
    const args = oscMsg.args;
    
    // Log everything for debugging
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('OSC Message Received:');
    console.log('  From:', info.address + ':' + info.port);
    console.log('  Address:', address);
    console.log('  Args:', JSON.stringify(args, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    currentState.connected = true;
    currentState.lastUpdate = new Date().toISOString();
    
    // Extract sequence identifier from address (e.g., /14.14.1.6.67 -> 67)
    const addressParts = address.split('/').filter(p => p);
    if (addressParts.length > 0) {
        const lastPart = addressParts[addressParts.length - 1];
        if (lastPart.includes('.')) {
            // Extract the sequence number from path like 14.14.1.6.67
            const pathParts = lastPart.split('.');
            currentState.sequenceName = 'Seq ' + pathParts[pathParts.length - 1];
        } else {
            currentState.sequenceName = lastPart;
        }
    }
    
    // Parse GrandMA3 OSC message format
    // Format: [action, cue_number, cue_name] for Go+ messages
    // Format: [action, value] for other messages
    if (args && args.length > 0) {
        const action = args[0]?.value;
        
        // Handle Go+, Go-, Goto commands - these contain cue info
        if (action === 'Go+' || action === 'Go-' || action === 'Goto' || action === 'Top') {
            // The cue name is the third argument (string)
            if (args[2] && args[2].type === 's') {
                currentState.cueName = args[2].value;
                
                // Try to extract cue number from the name
                // Format might be "Song Name 9 Verse 2 / Description" where 9 is the cue
                // Or just use the raw cue name
                const match = args[2].value.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+(.+)$/);
                if (match) {
                    // Found a pattern like "Name NUMBER Rest"
                    currentState.cueNumber = match[2];
                }
            }
            
            // The second arg might be the cue number in some cases
            if (args[1] && (args[1].type === 'i' || args[1].type === 'f')) {
                // Only use this if we didn't extract from name
                if (!currentState.cueNumber || currentState.cueNumber === '--') {
                    currentState.cueNumber = args[1].value.toString();
                }
            }
            
            currentState.isActive = true;
            
            console.log(`>>> CUE: ${currentState.cueName}`);
        }
        // Handle FaderMaster messages for progress/level
        else if (action === 'FaderMaster') {
            if (args[2] && args[2].type === 'f') {
                currentState.progress = args[2].value * 100; // Convert 0-1 to 0-100
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
    console.log('Waiting for OSC messages...\n');
});

udpPort.on('error', (err) => {
    console.error('OSC Error:', err);
});

udpPort.open();

// Get local IP addresses
const os = require('os');
const nets = os.networkInterfaces();
const ips = [];
for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
            ips.push(`${net.address} (${name})`);
        }
    }
}

// Start HTTP server
server.listen(HTTP_PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║              GrandMA3 Cue Display Server                     ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Web Interface:  http://localhost:${HTTP_PORT}                       ║
║  OSC Port:       ${OSC_PORT}                                          ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  Your Mac's IP address(es) - use one of these in GrandMA3:   ║
║                                                              ║`);
    ips.forEach(ip => console.log(`║    ${ip.padEnd(58)}║`));
    console.log(`║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  GrandMA3 Setup (Menu > In & Out > OSC):                     ║
║                                                              ║
║    • Enable Output = ON                                      ║
║    • Destination IP = your Mac's IP (see above)              ║
║    • Port = ${OSC_PORT}                                               ║
║    • Mode = UDP                                              ║
║    • In the grid: Set "Send" = Yes                           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
});

process.on('SIGINT', () => {
    console.log('\nShutting down...');
    udpPort.close();
    server.close();
    process.exit(0);
});
