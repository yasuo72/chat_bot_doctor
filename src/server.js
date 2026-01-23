const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { handleChat } = require('./mediaguideEngine');
const { generateStructuredResponse } = require('./llmClient');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', engine: 'MediGuideBackend', version: '1.0' });
});

app.post('/api/chat', async (req, res) => {
  const input = req.body || {};

  try {
    // Preferred path: use structured text-generation backend (external text engine)
    if (process.env.TEXT_ENGINE_API_KEY) {
      const llmResult = await generateStructuredResponse(input);
      return res.json(llmResult);
    }
  } catch (err) {
    console.error('LLM structured response failed, falling back to rule-based engine:', err && err.message ? err.message : err);
  }

  try {
    // Fallback: deterministic rule-based engine
    const result = handleChat(input);
    return res.json(result);
  } catch (err) {
    console.error('MediGuideBackend error:', err && err.message ? err.message : err);
    return res.status(500).json({
      meta: {
        engine: 'MediGuideBackend',
        version: '1.0',
        timestampISO: new Date().toISOString(),
        language: 'en'
      },
      error: 'Internal server error. This service provides general health information only and is not a substitute for professional medical care.'
    });
  }
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`MediGuideBackend listening on port ${PORT}`);
});
