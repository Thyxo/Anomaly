// Default settings for ANOMALY.
//
// To use AI-generated anomalies (Mode A), copy this file to `config.js` in the
// same folder and put your API key there. `config.js` is git-ignored and is
// loaded after this file, so it overrides these values.
//
// NEVER publish the game folder, a fork, or a hosted copy with a key inside it.
// Anyone who can open the page can read the key.
window.ANOMALY_CONFIG = {
  // 'gemini' | 'openai' | 'none'
  provider: 'none',

  gemini: {
    apiKey: '',
    // Image-editing capable Gemini models. Alternatives:
    // 'gemini-3.1-flash-image-preview' (Nano Banana 2), 'gemini-3-pro-image-preview' (Nano Banana Pro)
    model: 'gemini-2.5-flash-image',
  },

  openai: {
    apiKey: '',
    model: 'gpt-image-1',
    quality: 'medium', // 'low' | 'medium' | 'high'
  },

  // How many AI anomalies to prepare per camera room during calibration.
  aiAnomaliesPerRoom: 2,

  // Real minutes for one night (00:00 → 06:00).
  nightLengthMinutes: 7,
};
