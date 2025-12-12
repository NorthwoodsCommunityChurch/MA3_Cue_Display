#!/bin/bash

#######################################################################
#  GrandMA3 Cue Display - One Click Installer for Mac
#  
#  Double-click this file to:
#  1. Install Node.js if needed
#  2. Install dependencies
#  3. Start the server
#  4. Open the display in your browser
#######################################################################

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$PROJECT_DIR"

OSC_PORT=8000
HTTP_PORT=3000

clear
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║          GrandMA3 Cue Display - Installer              ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo "[1/4] Checking for Node.js..."

if command_exists node; then
    echo "  ✓ Node.js found: $(node -v)"
else
    echo "  ! Node.js not found. Installing..."
    
    if ! command_exists brew; then
        echo "  Installing Homebrew first..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        [[ -f "/opt/homebrew/bin/brew" ]] && eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    
    echo "  Installing Node.js..."
    brew install node
    
    if ! command_exists node; then
        echo "  ✗ Failed to install Node.js"
        read -p "Press Enter to exit..."
        exit 1
    fi
    echo "  ✓ Node.js installed: $(node -v)"
fi

echo "[2/4] Checking for npm..."

if command_exists npm; then
    echo "  ✓ npm found: v$(npm -v)"
else
    echo "  ✗ npm not found"
    read -p "Press Enter to exit..."
    exit 1
fi

echo "[3/4] Installing dependencies..."

if [ -f "package.json" ]; then
    npm install --silent 2>/dev/null
    echo "  ✓ Dependencies installed"
else
    echo "  ✗ package.json not found"
    read -p "Press Enter to exit..."
    exit 1
fi

echo "[4/4] Starting server..."
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║                  Server Running                        ║"
echo "╠════════════════════════════════════════════════════════╣"
echo "║                                                        ║"
echo "║  Web Interface:    http://localhost:${HTTP_PORT}               ║"
echo "║  OSC Listen Port:  ${OSC_PORT}                                  ║"
echo "║                                                        ║"
echo "║  Shows the last triggered cue from any sequence        ║"
echo "║                                                        ║"
echo "║  Press Ctrl+C to stop                                  ║"
echo "║                                                        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

sleep 1
open "http://localhost:${HTTP_PORT}"

OSC_PORT=$OSC_PORT HTTP_PORT=$HTTP_PORT node src/server.js
