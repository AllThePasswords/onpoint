const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('onpoint', {
  onMatch: (callback) => {
    ipcRenderer.on('match-result', (_event, data) => callback(data));
  },
  onTranscript: (callback) => {
    ipcRenderer.on('transcript', (_event, data) => callback(data));
  },
  onStatus: (callback) => {
    ipcRenderer.on('status', (_event, data) => callback(data));
  },
  sendTranscript: (text) => {
    ipcRenderer.send('transcript-from-renderer', text);
  },
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  toggleListening: () => ipcRenderer.send('toggle-listening'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Sources
  scanSources: () => ipcRenderer.invoke('scan-sources'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
});
