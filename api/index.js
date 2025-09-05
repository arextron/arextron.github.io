

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import extract from 'pdf-extraction';
import { fileURLToPath } from 'url';
import axios from 'axios';
import logger from './utils/logger.js';
import { requestLogging, errorLogging, performanceLogging, securityLogging, analyticsLogging } from './middleware/logging.js';
import { getChatLogsForSession, getRecentChatActivity, getLogStatistics, searchLogs } from './utils/logViewer.js';

// Determine the current directory of this module (api/index.js)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables. IMPORTANT: For Vercel, you'll configure these in the Vercel dashboard.
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

// === Logging Middleware Setup ===
app.use(requestLogging);
app.use(performanceLogging);
app.use(securityLogging);
app.use(analyticsLogging);

// === CORS Setup ===
app.use((req, res, next) => {
  logger.debug('CORS Check', { origin: req.headers.origin });
  next();
});
app.use(cors({
  origin: [
    "https://arextron.github.io", 
    "http://localhost:8080", 
    "http://127.0.0.1:8080",
    "https://arextron-github-io.vercel.app"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));

app.use(express.json());

// Global variable for resume text
let resumeText = '';

// Conversation memory (simple in-memory store for demo - in production, use Redis or database)
const conversationMemory = new Map();

// Gemini API Endpoint (defined once)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Get key once
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// ScreenshotOne API Key
const SCREENSHOTONE_API_KEY = process.env.SCREENSHOTONE_API_KEY;
logger.info('Environment Configuration Check', {
  SCREENSHOTONE_API_KEY_exists: !!SCREENSHOTONE_API_KEY,
  SCREENSHOTONE_API_KEY_length: SCREENSHOTONE_API_KEY?.length || 0,
  SCREENSHOTONE_API_KEY_prefix: SCREENSHOTONE_API_KEY?.substring(0, 4) || 'undefined'
});

// === Screenshot Endpoint ===
app.get('/api/screenshot', async (req, res) => {
  try {
    const { url } = req.query;
    
    logger.info('Screenshot Request Received', { url, apiKeyConfigured: !!SCREENSHOTONE_API_KEY });
    
    if (!url) {
      logger.warn('Screenshot Request Failed - No URL provided');
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    if (!SCREENSHOTONE_API_KEY) {
      logger.error('Screenshot Request Failed - API key not configured');
      return res.status(500).json({ error: 'ScreenshotOne API key not configured' });
    }
    
    // Build ScreenshotOne URL with your API key - Optimized for production
    const screenshotUrl = `https://api.screenshotone.com/take?url=${encodeURIComponent(url)}&access_key=${SCREENSHOTONE_API_KEY}&viewport_width=1200&viewport_height=800&format=png&image_quality=80&block_ads=true&block_cookie_banners=true&block_banners_by_heuristics=true&block_trackers=true&delay=2&timeout=20&full_page=true&full_page_algorithm=by_sections&full_page_scroll_by=800&full_page_scroll_delay=1000&reduced_motion=true`;
    
    logger.external.request('ScreenshotOne', '/take', 'GET', { url });
    
    // Fetch the screenshot
    const startTime = Date.now();
    const response = await axios.get(screenshotUrl, {
      responseType: 'stream',
      timeout: 15000
    });
    const responseTime = Date.now() - startTime;
    
    logger.external.response('ScreenshotOne', '/take', response.status, responseTime, {
      contentType: response.headers['content-type'],
      contentLength: response.headers['content-length']
    });
    
    // Set appropriate headers
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
    });
    
    // Pipe the screenshot to the response
    response.data.pipe(res);
    
    logger.api.success(req, 'Screenshot generated successfully', { url });
    
  } catch (error) {
    logger.external.error('ScreenshotOne', '/take', error, { url: req.query.url });
    res.status(500).json({ 
      error: 'Failed to generate screenshot',
      details: error.message,
      url: req.query.url
    });
  }
});

// === Test Screenshot Endpoint ===
app.get('/api/test-screenshot', async (req, res) => {
  try {
    logger.info('Screenshot Test Endpoint Accessed');
    res.json({
      message: 'Screenshot endpoint is working',
      apiKeyConfigured: !!SCREENSHOTONE_API_KEY,
      apiKeyLength: SCREENSHOTONE_API_KEY ? SCREENSHOTONE_API_KEY.length : 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Screenshot Test Endpoint Error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// === Simple Screenshot Test ===
app.get('/api/screenshot-test', async (req, res) => {
  try {
    if (!SCREENSHOTONE_API_KEY) {
      logger.error('Screenshot Test Failed - API key not configured');
      return res.status(500).json({ error: 'API key not configured' });
    }
    
    const testUrl = 'https://google.com';
    const screenshotUrl = `https://api.screenshotone.com/take?url=${encodeURIComponent(testUrl)}&access_key=${SCREENSHOTONE_API_KEY}&viewport_width=1200&viewport_height=800&format=png&full_page=true&full_page_algorithm=by_sections&full_page_scroll_by=500&full_page_scroll_delay=1500&reduced_motion=true`;
    
    logger.info('Screenshot Test Started', { testUrl, screenshotUrl });
    
    const response = await axios.get(screenshotUrl, {
      responseType: 'stream',
      timeout: 10000
    });
    
    res.set('Content-Type', 'image/png');
    response.data.pipe(res);
    
    logger.info('Screenshot Test Completed Successfully', { testUrl });
    
  } catch (error) {
    logger.error('Screenshot Test Error', {
      error: error.message,
      response: error.response?.data || 'No response data'
    });
    res.status(500).json({ 
      error: 'Screenshot test failed',
      message: error.message,
      response: error.response?.data || 'No response data'
    });
  }
});

// === Function to test Gemini API connectivity ===
async function testGeminiAPI() {
  if (!GEMINI_API_KEY) {
    logger.error('Gemini API Key not configured during startup test');
    return false; // Indicate failure
  }

  try {
    logger.info('Testing Gemini API connectivity...');
    const testPrompt = "Hello"; // A simple prompt to test
    const testPayload = { contents: [{ parts: [{ text: testPrompt }] }] };

    const response = await axios.post(
      GEMINI_ENDPOINT,
      testPayload,
      { timeout: 5000 } // Add a timeout for the test call
    );

    if (response.status === 200 && response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      logger.info('Gemini API connected successfully!');
      return true; // Indicate success
    } else {
      logger.error('Gemini API test failed: Unexpected response structure or status', {
        status: response.status,
        response: response.data
      });
      return false; // Indicate failure
    }
  } catch (err) {
    logger.error('Error connecting to Gemini API during test', {
      error: err.response?.data || err.message,
      status: err.response?.status
    });
    if (axios.isAxiosError(err) && err.response) {
        if (err.response.status === 403) {
            logger.error('API Key might be invalid or unauthorized for Gemini 2.0 Flash');
        } else if (err.response.status === 400 && err.response.data?.error?.message?.includes("API key not valid")) {
            logger.error('GEMINI_API_KEY appears to be invalid');
        }
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      logger.error('Please check your internet connection or API endpoint');
    }
    return false; // Indicate failure
  }
}

// === Main function to load resources (runs once when the serverless function initializes) ===
// This will be called outside of the request handling, simulating server startup
(async () => {
  // Define resumePath relative to this file (api/index.js)
  const resumePath = path.join(__dirname, 'resume.pdf'); 

  // Load resume.pdf
  try {
    logger.info('Loading resume file', { path: resumePath });
    const buffer = fs.readFileSync(resumePath); 
    const data = await extract(buffer);
    resumeText = data.text.replace(/\r\n/g, '\n').trim();
    logger.info('Resume loaded successfully', { 
      length: resumeText.length,
      path: resumePath 
    });
  } catch (err) {
    logger.error('Failed to load/parse resume.pdf', {
      path: resumePath,
      error: err.message
    });
    resumeText = ''; // Ensure it's empty if loading fails
  }

  // Test Gemini API (optional for production, but good for local/dev checks)
  await testGeminiAPI(); 
})();


// === Enhanced AI Assistant Functions ===

// Function to get conversation context
function getConversationContext(sessionId) {
  const context = conversationMemory.get(sessionId) || [];
  return context.slice(-6); // Keep last 6 exchanges for context
}

// Function to update conversation memory
function updateConversationMemory(sessionId, question, answer) {
  if (!conversationMemory.has(sessionId)) {
    conversationMemory.set(sessionId, []);
  }
  const context = conversationMemory.get(sessionId);
  context.push({ question, answer, timestamp: new Date().toISOString() });
  
  // Keep only last 10 exchanges to prevent memory bloat
  if (context.length > 10) {
    context.splice(0, context.length - 10);
  }
}

// Function to detect question intent and context
function analyzeQuestionIntent(question) {
  const q = question.toLowerCase();
  
  const intents = {
    greeting: /^(hi|hello|hey|good morning|good afternoon|good evening)/.test(q),
    about: /^(tell me about|who is|what about|about aryan)/.test(q),
    projects: /(project|github|repository|code|built|developed)/.test(q),
    skills: /(skill|technology|tech|programming|language|framework)/.test(q),
    experience: /(experience|work|job|career|employment|company)/.test(q),
    education: /(education|university|degree|study|school|concordia|amity)/.test(q),
    contact: /(contact|email|phone|linkedin|github|reach|connect)/.test(q),
    availability: /(available|hiring|job|position|work|relocate|canada)/.test(q),
    technical: /(how|what|why|explain|describe|implement|build)/.test(q),
    navigation: /(section|page|scroll|go to|show me)/.test(q)
  };
  
  return intents;
}

// Function to generate contextual follow-up suggestions
function generateFollowUpSuggestions(intent, question) {
  const suggestions = {
    about: [
      "What projects has Aryan worked on?",
      "Tell me about Aryan's technical skills",
      "What's Aryan's work experience?"
    ],
    projects: [
      "How can I see the live demos?",
      "What technologies were used?",
      "Tell me about Aryan's other projects"
    ],
    skills: [
      "What projects showcase these skills?",
      "Tell me about Aryan's AI/ML experience",
      "What's Aryan's cloud experience?"
    ],
    experience: [
      "What were the key achievements?",
      "Tell me about Aryan's current role",
      "What technologies were used at work?"
    ],
    education: [
      "What's Aryan's current status?",
      "Tell me about Aryan's projects",
      "Is Aryan available for work?"
    ],
    contact: [
      "Is Aryan available for interviews?",
      "What's Aryan's location?",
      "Tell me about Aryan's work permit status"
    ],
    availability: [
      "What type of roles is Aryan looking for?",
      "Tell me about Aryan's technical skills",
      "What's Aryan's experience level?"
    ]
  };
  
  return suggestions[intent] || [
    "Tell me more about Aryan's projects",
    "What are Aryan's key skills?",
    "Is Aryan available for work?"
  ];
}

// === API Endpoint (This is the route that Vercel will expose) ===
app.post('/api/answer', async (req, res) => {
  const startTime = Date.now();
  const { question, sessionId = 'default' } = req.body;
  
  // Log conversation start if this is a new session
  if (!conversationMemory.has(sessionId)) {
    logger.chat.conversationStart(sessionId, {
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    });
  }
  
  if (!question || typeof question !== 'string' || !question.trim()) {
    logger.warn('Chat Request Failed - No question provided', { sessionId });
    return res.status(400).json({ error: 'No question provided' });
  }
  const q = question.trim();

  // Analyze question intent
  const intent = analyzeQuestionIntent(q);
  const conversationContext = getConversationContext(sessionId);
  
  // Log user message and intent analysis
  const primaryIntent = Object.keys(intent).find(key => intent[key]) || 'general';
  logger.chat.userMessage(sessionId, q, primaryIntent, {
    messageLength: q.length,
    hasContext: conversationContext.length > 0,
    contextLength: conversationContext.length
  });
  
  // Log detailed intent analysis
  logger.chat.intentAnalysis(sessionId, q, intent, primaryIntent);
  
  // Build conversation history for context
  let contextHistory = '';
  if (conversationContext.length > 0) {
    contextHistory = '\n\n**Previous Conversation Context:**\n';
    conversationContext.forEach(exchange => {
      contextHistory += `User: ${exchange.question}\nAI: ${exchange.answer}\n\n`;
    });
  }

  // Enhanced prompt with personality and context awareness
  const prompt = `
You are Aryan Awasthi's AI assistant - a friendly, knowledgeable, and enthusiastic representative of Aryan's professional profile. You're here to help visitors learn about Aryan in an engaging and interactive way.

**Your Personality:**
- Friendly and approachable, but professional
- Enthusiastic about Aryan's technical achievements
- Helpful and encouraging
- Use emojis sparingly but effectively (🚀, 💻, 🎯, ⚡, 🔥)
- Show genuine interest in helping visitors

**Response Guidelines:**
- Keep responses conversational yet informative
- Use proper line breaks and formatting for readability
- Include relevant emojis to make responses engaging
- Provide specific examples and metrics when available
- Always end with a helpful follow-up suggestion or question
- Be context-aware based on previous conversation

**Formatting Rules:**
- Use **bold** for key information and names
- Use bullet points (-) for lists with proper line breaks
- Use code blocks for technical terms and metrics
- Include [links](url) when relevant
- Add line breaks between sections for readability
- Structure responses with clear paragraphs and bullet points
- Make sure each bullet point is on its own line

**Context Awareness:**
- If user asks about navigation, suggest specific sections
- If discussing projects, always mention GitHub links
- If talking about skills, connect them to real projects
- If discussing availability, mention work permit status
- Build on previous conversation context naturally

**Special Instructions:**
- For greeting questions: Be warm and introduce Aryan briefly
- For project questions: Always include GitHub links and tech stacks
- For skill questions: Connect skills to specific projects/achievements
- For experience questions: Highlight quantifiable achievements
- For availability questions: Mention PGWP status and relocation willingness
- For technical questions: Provide detailed explanations with examples

${contextHistory}

**Aryan's Key Information:**
ge - Recent Master's graduate in Applied Computer Science from Concordia University (2023-2025)
- Bachelor's in Computer Science from Amity University (2017-2021)
- Currently: Associate I at Amazon Canada FC (Oct 2023 - May 2025)
- Previous: TechOps Engineer at Comviva (June 2021 - Aug 2021)
- Location: Montreal, QC (willing to relocate anywhere in Canada)
- Work Status: PGWP valid until 2028, actively seeking full-time AI/ML engineering roles
- Contact: aryanbvp.09@gmail.com

**Notable Projects:**
1. **Tik AI** - TikTok AI Agent with Google Gemini 2.5 Flash (90%+ accuracy, <2s response) - Live Demo: https://ai-agent-livid-eight.vercel.app/
2. **Scrapy** - TikTok Scraper with AI Vector Search (100ms embedding, <50ms search) - Website: https://scrapy-ai.vercel.app/
3. **Multi-Agent LLM Chatbot** - RLHF system (92% routing accuracy, 87% response relevance) - GitHub repository available
4. **TubeLytics v2** - Real-time YouTube Analytics (60% API call reduction) - GitHub repository available
5. **OpenTracks** - Sport Tracker Android App (Aggregate-Statistics dashboard, voice announcements) - GitHub: https://github.com/HWJFish/OpenTracks-Winter-SOEN-6431_2024

**IMPORTANT - Link Guidelines:**
- ONLY mention links that are explicitly provided above
- Do NOT create or suggest GitHub links, website links, or demo URLs that aren't listed
- For projects without specific links, say "repository available" or "live demo available" but don't provide fake URLs
- Be accurate about which projects have public links vs private repositories
- Do NOT make up website URLs or demo links that don't exist

**Tech Stack Highlights:**
- AI/ML: LangChain, FAISS, TensorFlow, Vertex AI, Gemini API
- Backend: FastAPI, Node.js, Java, Scala, Play Framework
- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Mobile: Android SDK, Java, Material Design, Gradle
- Cloud: AWS (SageMaker, Lambda, S3), Docker, Kubernetes
- Databases: PostgreSQL, Redis, Vector Databases

--- Full Resume Text ---
${resumeText}
--- End Resume ---

**Current Question:** ${q}

**Instructions:**
1. Analyze the question intent and provide a helpful, engaging response
2. Use the conversation context to build naturally on previous exchanges
3. Include relevant technical details and achievements
4. End with a follow-up suggestion to encourage continued engagement
5. Keep the response conversational but informative
6. Use appropriate emojis and formatting for engagement

Respond as Aryan's AI assistant:
`;

  try {
    if (!GEMINI_API_KEY) { 
      logger.error('Gemini API Key not configured', { sessionId });
      return res.status(500).json({ error: 'Server misconfiguration: missing API key' });
    }
    
    // Log Gemini API call start
    const geminiStartTime = Date.now();
    logger.external.request('Gemini', '/generateContent', 'POST', { 
      sessionId, 
      promptLength: prompt.length 
    });
    
    const apiRes = await axios.post(
      GEMINI_ENDPOINT,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const geminiResponseTime = Date.now() - geminiStartTime;
    const reply = apiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    // Log successful Gemini API call
    logger.chat.geminiApiCall(sessionId, prompt.length, geminiResponseTime, true);
    
    // Update conversation memory
    updateConversationMemory(sessionId, q, reply);
    
    // Generate follow-up suggestions based on intent
    const followUpSuggestions = generateFollowUpSuggestions(primaryIntent, q);
    
    // Log follow-up suggestions
    logger.chat.followUpSuggestions(sessionId, followUpSuggestions.slice(0, 3), {
      primaryIntent,
      totalSuggestions: followUpSuggestions.length
    });
    
    // Log AI response
    const totalResponseTime = Date.now() - startTime;
    logger.chat.aiResponse(sessionId, reply, totalResponseTime, {
      intent: primaryIntent,
      responseLength: reply.length,
      geminiResponseTime
    });
    
    // Enhanced response with metadata
    const response = {
      answer: reply,
      metadata: {
        intent: primaryIntent,
        followUpSuggestions: followUpSuggestions.slice(0, 3), // Limit to 3 suggestions
        timestamp: new Date().toISOString(),
        sessionId: sessionId
      }
    };
    
    res.json(response);
  } catch (err) {
    const totalResponseTime = Date.now() - startTime;
    const geminiResponseTime = Date.now() - startTime; // Approximate
    
    // Log Gemini API error
    logger.chat.geminiApiCall(sessionId, prompt.length, geminiResponseTime, false, err);
    logger.chat.error(sessionId, err, { 
      question: q,
      intent: primaryIntent,
      totalResponseTime 
    });
    
    if (axios.isAxiosError(err) && err.response) {
        if (err.response.status === 403) {
            logger.error('Gemini API Key might be invalid or unauthorized', { sessionId });
        } else if (err.response.status === 400 && err.response.data?.error?.message?.includes("API key not valid")) {
            logger.error('Gemini API Key appears to be invalid', { sessionId });
        }
    }
    res.status(500).json({ error: 'AI request failed' });
  }
});

// Conversation management endpoints
app.get('/api/conversation/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const context = getConversationContext(sessionId);
  
  logger.info('Conversation History Retrieved', {
    sessionId,
    messageCount: context.length,
    ip: req.ip || req.connection.remoteAddress
  });
  
  res.json({ 
    sessionId, 
    conversationHistory: context,
    messageCount: context.length 
  });
});

app.delete('/api/conversation/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const context = getConversationContext(sessionId);
  
  logger.chat.conversationEnd(sessionId, context.length, 0, {
    action: 'manual_clear',
    ip: req.ip || req.connection.remoteAddress
  });
  
  conversationMemory.delete(sessionId);
  res.json({ message: 'Conversation cleared', sessionId });
});

// Optional health-check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    features: {
      conversationMemory: true,
      intentAnalysis: true,
      followUpSuggestions: true,
      enhancedPrompting: true,
      logging: true
    }
  });
});

// Chat analytics endpoint (for monitoring chat activity)
app.get('/api/chat/analytics', (req, res) => {
  try {
    const analytics = {
      totalSessions: conversationMemory.size,
      activeSessions: Array.from(conversationMemory.keys()),
      sessionStats: Array.from(conversationMemory.entries()).map(([sessionId, messages]) => ({
        sessionId,
        messageCount: messages.length,
        lastActivity: messages[messages.length - 1]?.timestamp,
        firstActivity: messages[0]?.timestamp
      })),
      timestamp: new Date().toISOString()
    };
    
    logger.info('Chat Analytics Retrieved', {
      totalSessions: analytics.totalSessions,
      ip: req.ip || req.connection.remoteAddress
    });
    
    res.json(analytics);
  } catch (error) {
    logger.error('Chat Analytics Error', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve chat analytics' });
  }
});

// Log viewing endpoints
app.get('/api/logs/chat/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { lines = 50 } = req.query;
    
    const result = getChatLogsForSession(sessionId, parseInt(lines));
    
    if (result.error) {
      return res.status(500).json({ error: result.error });
    }
    
    logger.info('Chat Logs Retrieved', { sessionId, lines: result.logs.length });
    res.json(result);
  } catch (error) {
    logger.error('Chat Logs Error', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve chat logs' });
  }
});

app.get('/api/logs/recent', (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const result = getRecentChatActivity(parseInt(hours));
    
    if (result.error) {
      return res.status(500).json({ error: result.error });
    }
    
    logger.info('Recent Chat Activity Retrieved', { hours, logs: result.logs.length });
    res.json(result);
  } catch (error) {
    logger.error('Recent Chat Activity Error', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve recent chat activity' });
  }
});

app.get('/api/logs/stats', (req, res) => {
  try {
    const stats = getLogStatistics();
    
    if (stats.error) {
      return res.status(500).json({ error: stats.error });
    }
    
    logger.info('Log Statistics Retrieved');
    res.json(stats);
  } catch (error) {
    logger.error('Log Statistics Error', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve log statistics' });
  }
});

app.get('/api/logs/search', (req, res) => {
  try {
    const { q: query, type = 'all', limit = 100 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    const result = searchLogs(query, type, parseInt(limit));
    
    if (result.error) {
      return res.status(500).json({ error: result.error });
    }
    
    logger.info('Log Search Performed', { query, type, results: result.logs.length });
    res.json(result);
  } catch (error) {
    logger.error('Log Search Error', { error: error.message });
    res.status(500).json({ error: 'Failed to search logs' });
  }
});

// IMPORTANT: Export the app for Vercel
export default app;

// Add error handling middleware
app.use(errorLogging);

// For local development, start the server
if (process.env.NODE_ENV === 'development') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    logger.info('Local API server started', {
      port: PORT,
      healthCheck: `http://localhost:${PORT}/health`,
      aiEndpoint: `http://localhost:${PORT}/api/answer`
    });
  });
}
