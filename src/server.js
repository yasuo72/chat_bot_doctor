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
    if (process.env.TEXT_ENGINE_API_KEY || process.env.GEMINI_API_KEY) {
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

// Compatibility endpoint for existing Flutter RagChatService
// Expects: { "question": "..." } and returns: { "answer": "..." }
app.post('/chat', async (req, res) => {
  const question = (req.body && typeof req.body.question === 'string')
    ? req.body.question
    : '';

  const payload = {
    session: {
      userId: 'online_chat',
      locale: 'en-IN',
      timezone: 'Asia/Kolkata',
      chatMode: 'symptom_triage'
    },
    userProfile: {},
    context: {
      lastMessages: [],
      attachedText: null,
      source: 'chat'
    },
    message: {
      text: question
    }
  };

  function buildAnswerFromStructured(result) {
    const assistant = (result && result.assistantMessage) || {};
    const lines = [];
    if (assistant.title && typeof assistant.title === 'string') {
      lines.push(assistant.title);
    }
    if (assistant.summary && typeof assistant.summary === 'string') {
      lines.push(assistant.summary);
    }
    if (Array.isArray(assistant.whatToDoNow) && assistant.whatToDoNow.length > 0) {
      lines.push('What to do now:');
      lines.push(assistant.whatToDoNow.map((s) => `• ${s}`).join('\n'));
    }
    if (Array.isArray(assistant.whenToSeekCare) && assistant.whenToSeekCare.length > 0) {
      lines.push('When to seek care:');
      lines.push(assistant.whenToSeekCare.map((s) => `• ${s}`).join('\n'));
    }
    if (lines.length === 0) {
      try {
        return JSON.stringify(result);
      } catch (e) {
        return '';
      }
    }
    return lines.join('\n\n');
  }

  try {
    if (process.env.TEXT_ENGINE_API_KEY || process.env.GEMINI_API_KEY) {
      const llmResult = await generateStructuredResponse(payload);
      const answerText = buildAnswerFromStructured(llmResult);
      return res.json({ answer: answerText });
    }
  } catch (err) {
    console.error('LLM structured response for /chat failed, falling back to rule-based engine:', err && err.message ? err.message : err);
  }

  try {
    const result = handleChat(payload);
    const answerText = buildAnswerFromStructured(result);
    return res.json({ answer: answerText });
  } catch (err) {
    console.error('MediGuideBackend /chat error:', err && err.message ? err.message : err);
    return res.status(500).json({
      answer: 'Internal server error. This service provides general health information only and is not a substitute for professional medical care.'
    });
  }
});

// Simple stub for /passages used by Flutter OnlineChatbotScreen.
// Currently returns an empty list; can be wired to a real RAG index later.
app.post('/passages', (req, res) => {
  res.json({ passages: [] });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`MediGuideBackend listening on port ${PORT}`);
});
