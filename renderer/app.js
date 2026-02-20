// DOM refs
const statusDot = document.getElementById('statusDot');
const setupScreen = document.getElementById('setupScreen');
const mainContent = document.getElementById('mainContent');
const btnStart = document.getElementById('btnStart');
const btnMinimize = document.getElementById('btnMinimize');
const btnSettings = document.getElementById('btnSettings');
const errorMsg = document.getElementById('errorMsg');
const questionEl = document.getElementById('question');
const leadEl = document.getElementById('lead');
const sourcePanel = document.getElementById('sourcePanel');
const badgeEl = document.getElementById('badge');
const sourceIdEl = document.getElementById('sourceId');
const sourceMetrics = document.getElementById('sourceMetrics');
const sourceContext = document.getElementById('sourceContext');
const runnerUpEl = document.getElementById('runnerUp');
const runnerUpLead = document.getElementById('runnerUpLead');
const runnerUpBadge = document.getElementById('runnerUpBadge');
const runnerUpId = document.getElementById('runnerUpId');
const waitingEl = document.getElementById('waiting');
const transcriptEl = document.getElementById('transcript');
const liveBadge = document.getElementById('liveBadge');

// Settings DOM refs
const settingsOverlay = document.getElementById('settingsOverlay');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const btnAddSource = document.getElementById('btnAddSource');
const settingsStyle = document.getElementById('settingsStyle');
const settingsTone = document.getElementById('settingsTone');
const settingsFormat = document.getElementById('settingsFormat');
const sourceList = document.getElementById('sourceList');

const btnStop = document.getElementById('btnStop');
const vizCanvas = document.getElementById('vizCanvas');

let socket = null;
let mediaRecorder = null;
let stream = null;
let currentSettings = null;
let audioContext = null;
let analyser = null;
let vizAnimFrame = null;

// Speaker tracking — identify which speaker is the user vs interviewer
let speakerWordCounts = {}; // { "0": 150, "1": 45 }
let mySpeaker = null; // The speaker ID we identify as "me" (most words = closest to mic)

// ── UI helpers ──

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
}

function setStatus(state) {
  statusDot.className = 'status-dot';
  if (state === 'listening') {
    statusDot.classList.add('listening');
    liveBadge.classList.add('visible');
  } else {
    liveBadge.classList.remove('visible');
  }
  if (state === 'error') statusDot.classList.add('error');
}

function showMatch(data) {
  waitingEl.style.display = 'none';

  // Question
  questionEl.textContent = data.question;
  questionEl.classList.add('visible');

  // Lead sentence
  leadEl.textContent = data.match ? data.match.lead : 'No strong match — speak freely, lead with an outcome.';
  leadEl.classList.add('visible');

  // Source panel
  if (data.match) {
    badgeEl.textContent = data.match.category.replace(/-/g, ' ');
    sourceIdEl.textContent = data.match.sourceFile || data.match.id;
    sourceMetrics.textContent = data.match.metrics || '';
    sourceContext.textContent = data.match.context || '';
    sourcePanel.style.display = 'flex';
    sourcePanel.classList.add('visible');
  } else {
    sourcePanel.style.display = 'none';
    sourcePanel.classList.remove('visible');
  }

  // Runner-up
  if (data.runnerUp) {
    runnerUpLead.textContent = data.runnerUp.lead;
    runnerUpBadge.textContent = data.runnerUp.category.replace(/-/g, ' ');
    runnerUpId.textContent = data.runnerUp.id;
    runnerUpEl.style.display = 'flex';
    runnerUpEl.classList.add('visible');
  } else {
    runnerUpEl.style.display = 'none';
    runnerUpEl.classList.remove('visible');
  }
}

// ── Settings ──

function renderSourceList() {
  sourceList.innerHTML = '';

  if (!currentSettings || !currentSettings.sources) return;

  for (let i = 0; i < currentSettings.sources.length; i++) {
    const source = currentSettings.sources[i];
    const item = document.createElement('div');
    item.className = 'source-item';
    item.innerHTML = `
      <div class="source-item-info">
        <div class="source-item-name">${source.name}</div>
        <div class="source-item-path">${source.path}</div>
      </div>
      <button class="source-item-toggle ${source.enabled ? 'active' : ''}" data-index="${i}" title="Toggle source"></button>
      <button class="source-item-remove" data-index="${i}" title="Remove">&times;</button>
    `;
    sourceList.appendChild(item);
  }

  // Toggle handlers
  sourceList.querySelectorAll('.source-item-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      currentSettings.sources[idx].enabled = !currentSettings.sources[idx].enabled;
      renderSourceList();
    });
  });

  // Remove handlers
  sourceList.querySelectorAll('.source-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      currentSettings.sources.splice(idx, 1);
      renderSourceList();
    });
  });
}

async function openSettings() {
  currentSettings = await window.onpoint.getSettings();

  settingsStyle.value = currentSettings.instructions.style || '';
  settingsTone.value = currentSettings.instructions.tone || '';
  settingsFormat.value = currentSettings.instructions.format || 'short';
  renderSourceList();

  settingsOverlay.style.display = 'flex';
}

function closeSettings() {
  settingsOverlay.style.display = 'none';
}

async function saveSettings() {
  currentSettings.instructions.style = settingsStyle.value;
  currentSettings.instructions.tone = settingsTone.value;
  currentSettings.instructions.format = settingsFormat.value;

  await window.onpoint.saveSettings(currentSettings);
  closeSettings();
}

async function addSource() {
  const folderPath = await window.onpoint.pickFolder();
  if (!folderPath) return;

  // Derive name from folder
  const name = folderPath.split('/').pop() || 'Source';

  if (!currentSettings.sources) currentSettings.sources = [];
  currentSettings.sources.push({
    type: 'folder',
    name: name,
    path: folderPath,
    enabled: true,
  });

  renderSourceList();
}

// ── Audio visualizer ──

function startViz() {
  if (!stream || !vizCanvas) return;

  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 64;
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  const bufLen = analyser.frequencyBinCount;
  const dataArr = new Uint8Array(bufLen);
  const ctx = vizCanvas.getContext('2d');
  const W = vizCanvas.width;
  const H = vizCanvas.height;
  const barCount = 7;
  const barW = 4;
  const gap = 3;

  function draw() {
    vizAnimFrame = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArr);

    ctx.clearRect(0, 0, W, H);

    const totalW = barCount * barW + (barCount - 1) * gap;
    const startX = (W - totalW) / 2;

    for (let i = 0; i < barCount; i++) {
      // Sample from lower frequencies (more voice energy there)
      const idx = Math.min(i + 1, bufLen - 1);
      const val = dataArr[idx] / 255;
      const barH = Math.max(3, val * H * 0.85);
      const x = startX + i * (barW + gap);
      const y = (H - barH) / 2;

      ctx.fillStyle = `rgba(61, 107, 94, ${0.4 + val * 0.6})`;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 2);
      ctx.fill();
    }
  }

  draw();
}

function stopViz() {
  if (vizAnimFrame) {
    cancelAnimationFrame(vizAnimFrame);
    vizAnimFrame = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (vizCanvas) {
    const ctx = vizCanvas.getContext('2d');
    ctx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
  }
}

// ── Deepgram connection ──

async function startListening() {
  try {
    const apiKey = await window.onpoint.getApiKey();

    if (!apiKey || apiKey === 'your_deepgram_api_key_here') {
      showError('Add your Deepgram API key to .env file. Get one free at deepgram.com');
      return;
    }

    // Get microphone access — this triggers the macOS permission prompt
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Connect to Deepgram
    const dgUrl = 'wss://api.deepgram.com/v1/listen?' +
      'model=nova-3&' +
      'punctuate=true&' +
      'interim_results=true&' +
      'utterance_end_ms=1500&' +
      'vad_events=true&' +
      'smart_format=true&' +
      'diarize=true';

    socket = new WebSocket(dgUrl, ['token', apiKey]);

    socket.onopen = () => {
      setStatus('listening');
      setupScreen.style.display = 'none';
      mainContent.style.display = 'flex';
      btnStop.style.display = 'inline-block';

      // Reset speaker tracking for new session
      speakerWordCounts = {};
      mySpeaker = null;

      // Start real audio visualizer
      startViz();

      // Start sending audio chunks
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socket && socket.readyState === WebSocket.OPEN) {
          socket.send(event.data);
        }
      };
      mediaRecorder.start(250);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const alt = data.channel?.alternatives?.[0];
      const transcript = alt?.transcript;

      if (transcript) {
        // Track speaker from diarization
        const words = alt.words || [];
        let utteranceSpeaker = null;

        if (data.is_final && words.length > 0) {
          // Count words per speaker for identification
          for (const w of words) {
            if (w.speaker !== undefined) {
              speakerWordCounts[w.speaker] = (speakerWordCounts[w.speaker] || 0) + 1;
              utteranceSpeaker = w.speaker;
            }
          }

          // The speaker with the most words is "me" (closest to mic)
          let maxWords = 0;
          for (const [spk, count] of Object.entries(speakerWordCounts)) {
            if (count > maxWords) {
              maxWords = count;
              mySpeaker = parseInt(spk);
            }
          }
        }

        // Show who's speaking in the transcript
        const speakerLabel = utteranceSpeaker !== null
          ? (utteranceSpeaker === mySpeaker ? 'You' : 'Them')
          : '';
        transcriptEl.textContent = speakerLabel ? `[${speakerLabel}] ${transcript}` : transcript;

        if (data.is_final && transcript.trim().length > 3) {
          // Only process as a potential question if it's NOT from "me"
          const isInterviewer = utteranceSpeaker !== null && utteranceSpeaker !== mySpeaker;
          const totalWords = Object.values(speakerWordCounts).reduce((a, b) => a + b, 0);
          const hasEnoughData = totalWords > 30; // Need ~30 words to reliably identify speakers

          if (!hasEnoughData || isInterviewer) {
            // Process: either we don't have enough data yet, or it's the interviewer
            window.onpoint.sendTranscript(transcript.trim());
          }
          // Skip sending if we know it's our own voice
        }
      }
    };

    socket.onerror = (err) => {
      console.error('Deepgram error:', err);
      setStatus('error');
      showError('Connection error. Check your API key and internet connection.');
    };

    socket.onclose = (event) => {
      console.log('Deepgram closed:', event.code, event.reason);
      setStatus('error');
      setTimeout(() => {
        if (stream && stream.active) {
          startListening();
        }
      }, 3000);
    };

  } catch (err) {
    console.error('Start error:', err);
    if (err.name === 'NotAllowedError') {
      showError('Microphone access denied. Allow mic access in System Settings > Privacy > Microphone.');
    } else {
      showError(`Error: ${err.message}`);
    }
    setStatus('error');
  }
}

function stopListening() {
  // Prevent auto-reconnect
  const s = stream;
  stream = null;

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  if (s) {
    s.getTracks().forEach(track => track.stop());
  }

  stopViz();
  setStatus('');
  btnStop.style.display = 'none';

  // Return to setup screen
  mainContent.style.display = 'none';
  setupScreen.style.display = 'flex';
  waitingEl.style.display = 'flex';
  questionEl.classList.remove('visible');
  leadEl.classList.remove('visible');
  sourcePanel.style.display = 'none';
  runnerUpEl.style.display = 'none';
  transcriptEl.textContent = '\u00a0';
}

// ── IPC listeners ──

window.onpoint.onMatch((data) => {
  showMatch(data);
});

window.onpoint.onTranscript((data) => {
  transcriptEl.textContent = data.text;
});

// ── Button handlers ──

btnStart.addEventListener('click', () => {
  errorMsg.style.display = 'none';
  startListening();
});

btnStop.addEventListener('click', () => {
  stopListening();
});

btnMinimize.addEventListener('click', () => {
  window.onpoint.toggleListening();
});

btnSettings.addEventListener('click', () => {
  openSettings();
});

btnCloseSettings.addEventListener('click', () => {
  closeSettings();
});

btnSaveSettings.addEventListener('click', () => {
  saveSettings();
});

btnAddSource.addEventListener('click', () => {
  addSource();
});
