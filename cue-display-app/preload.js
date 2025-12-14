const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openInBrowser: (url) => {
    ipcRenderer.invoke('open-in-browser', url);
  },
  onNetworkInfo: (callback) => {
    ipcRenderer.on('network-info', (event, info) => callback(info));
  },
  getNetworkInfo: () => {
    return ipcRenderer.invoke('get-network-info');
  },
  getAppVersion: () => {
    return require('./package.json').version;
  },
  getLoginItemSettings: () => {
    return ipcRenderer.invoke('get-login-item-settings');
  },
  setLoginItemSettings: (openAtLogin) => {
    return ipcRenderer.invoke('set-login-item-settings', openAtLogin);
  },
  onOscStatus: (callback) => {
    ipcRenderer.on('osc-status', (event, status) => callback(status));
  },
  getOscStatus: () => {
    return ipcRenderer.invoke('get-osc-status');
  }
});
