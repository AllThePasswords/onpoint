const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '..', 'data', 'settings.json');

const DEFAULTS = {
  sources: [],
  instructions: {
    style: 'Lead with a specific example and outcome. One sentence max. Be concrete — name the company, the metric, the result.',
    tone: 'Confident and direct. No hedging, no filler.',
    format: 'short',
  },
};

function load() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      const saved = JSON.parse(raw);
      return { ...DEFAULTS, ...saved, instructions: { ...DEFAULTS.instructions, ...saved.instructions } };
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  return { ...DEFAULTS };
}

function save(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save settings:', err);
    return false;
  }
}

module.exports = { load, save, DEFAULTS };
