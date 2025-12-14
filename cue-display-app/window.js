let httpPort = 3000;
let oscPort = 8000;
let localIP = '--';

// Listen for network info from main process
window.electronAPI.onNetworkInfo((info) => {
  updateNetworkInfo(info);
});

// Also fetch it directly in case the event was missed
window.electronAPI.getNetworkInfo().then(updateNetworkInfo).catch(console.error);

// OSC connection status
const oscDot = document.getElementById('oscDot');
const oscStatusText = document.getElementById('oscStatusText');

function updateOscStatus(status) {
  if (status.connected) {
    oscDot.classList.remove('disconnected');
    oscDot.classList.add('connected');
    oscStatusText.textContent = 'Receiving OSC';
  } else {
    oscDot.classList.remove('connected');
    oscDot.classList.add('disconnected');
    oscStatusText.textContent = 'Waiting for OSC data...';
  }
}

// Listen for OSC status updates
window.electronAPI.onOscStatus(updateOscStatus);

// Get initial OSC status
window.electronAPI.getOscStatus().then(updateOscStatus).catch(console.error);

function updateNetworkInfo(info) {
  httpPort = info.httpPort;
  oscPort = info.oscPort;

  document.getElementById('webUrl').textContent = `localhost:${httpPort}`;
  document.getElementById('oscPort').textContent = oscPort.toString();

  if (info.ips && info.ips.length > 0) {
    localIP = info.ips[0].address;
    document.getElementById('localIP').textContent = localIP;
  }
}

// Open in browser button
document.getElementById('openBtn').addEventListener('click', () => {
  window.electronAPI.openInBrowser(`http://localhost:${httpPort}`);
});

// Open OSC log button
document.getElementById('oscLogBtn').addEventListener('click', () => {
  window.electronAPI.openInBrowser(`http://localhost:${httpPort}/osc-log`);
});

// Set version
try {
  const version = window.electronAPI.getAppVersion();
  document.getElementById('version').textContent = `v${version}`;
} catch (e) {
  // Version not available
}

// Open at Login checkbox
const openAtLoginCheckbox = document.getElementById('openAtLogin');
const loginSettingDiv = document.getElementById('loginSetting');

// Initialize checkbox state
async function initLoginSettings() {
  try {
    const settings = await window.electronAPI.getLoginItemSettings();
    openAtLoginCheckbox.checked = settings.openAtLogin;
  } catch (e) {
    console.error('Failed to get login settings:', e);
  }
}

// Handle checkbox change
openAtLoginCheckbox.addEventListener('change', async () => {
  try {
    await window.electronAPI.setLoginItemSettings(openAtLoginCheckbox.checked);
  } catch (e) {
    console.error('Failed to set login settings:', e);
  }
});

// Make the whole div clickable
loginSettingDiv.addEventListener('click', (e) => {
  if (e.target !== openAtLoginCheckbox) {
    openAtLoginCheckbox.checked = !openAtLoginCheckbox.checked;
    openAtLoginCheckbox.dispatchEvent(new Event('change'));
  }
});

initLoginSettings();
