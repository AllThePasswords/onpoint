require('dotenv').config();

const { app, BrowserWindow, globalShortcut, ipcMain, screen, systemPreferences, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { QuestionDetector } = require('./lib/question-detector');
const { Matcher } = require('./lib/matcher');
const settings = require('./lib/settings');
const { scanSource } = require('./lib/source-scanner');

let win;
let questionDetector;
let matcher;
let currentSettings;
let sourceChunks = []; // Scanned content from source folders

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: 480,
    height: 420,
    x: screenW - 500,
    y: screenH - 440,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Let Electron/macOS handle mic permission prompts naturally
  // (no auto-grant — the system dialog will appear on first getUserMedia call)
}

function loadExamples() {
  const examplesPath = path.join(__dirname, 'data', 'examples.json');
  const raw = fs.readFileSync(examplesPath, 'utf-8');
  const data = JSON.parse(raw);
  return data.examples;
}

function scanAllSources() {
  sourceChunks = [];
  const results = [];

  for (const source of currentSettings.sources) {
    if (!source.enabled) continue;
    const result = scanSource(source);
    results.push({ name: source.name, ...result });
    if (result.chunks) {
      sourceChunks.push(...result.chunks);
    }
  }

  console.log(`Scanned ${sourceChunks.length} content chunks from ${results.length} sources`);
  return results;
}

function setupIPC() {
  // Send API key to renderer for Deepgram connection
  ipcMain.handle('get-api-key', () => {
    return process.env.DEEPGRAM_API_KEY || '';
  });

  // Settings
  ipcMain.handle('get-settings', () => {
    return currentSettings;
  });

  ipcMain.handle('save-settings', (_event, newSettings) => {
    currentSettings = newSettings;
    const saved = settings.save(newSettings);
    if (saved) {
      // Re-scan sources when settings change
      scanAllSources();
    }
    return saved;
  });

  // Sources
  ipcMain.handle('scan-sources', () => {
    return scanAllSources();
  });

  ipcMain.handle('pick-folder', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select a source folder',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // Receive transcript from renderer, run detection + matching
  ipcMain.on('transcript-from-renderer', (_event, text) => {
    // Forward raw transcript to UI
    win.webContents.send('transcript', { text, isFinal: true });

    // Detect if it's a question
    const detection = questionDetector.process(text);

    if (detection.isQuestion) {
      const result = matcher.match(detection.text, sourceChunks);
      win.webContents.send('match-result', {
        question: detection.text,
        instructions: currentSettings.instructions,
        match: result.match ? {
          id: result.match.example.id,
          lead: result.match.example.lead,
          category: result.match.example.category,
          metrics: result.match.example.metrics,
          context: result.match.example.context,
          score: result.match.score,
          sourceFile: result.match.example.sourceFile || null,
        } : null,
        runnerUp: result.runnerUp ? {
          id: result.runnerUp.example.id,
          lead: result.runnerUp.example.lead,
          category: result.runnerUp.example.category,
          score: result.runnerUp.score,
        } : null,
      });
    }
  });
}

app.whenReady().then(async () => {
  // Check macOS microphone permission
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    console.log('Mic permission status:', micStatus);

    if (micStatus !== 'granted') {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      console.log('Mic permission granted:', granted);
    }
  }

  // Load settings
  currentSettings = settings.load();

  // Load examples and init engines
  const examples = loadExamples();
  questionDetector = new QuestionDetector();
  matcher = new Matcher(examples);

  // Scan sources on startup
  scanAllSources();

  createWindow();
  setupIPC();

  // Toggle visibility: Cmd+Shift+O
  globalShortcut.register('CommandOrControl+Shift+O', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});
