import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import extract from 'pdf-extraction';
import { fileURLToPath } from 'url';
import axios from 'axios';

// Load environment variables. IMPORTANT: For Vercel, you'll configure these in the Vercel dashboard.
dotenv.config();

// Determine the current directory of this module (api/index.js)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// === CORS Setup ===
app.use((req, res, next) => {
  console.log('Incoming origin:', req.headers.origin);
  next();
});
app.use(cors({
  origin: "https://arextron.github.io",
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

// === Function to test Gemini API connectivity ===
async function testGeminiAPI() {
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set in env. Please check your .env file or Vercel environment variables.');
    return false; // Indicate failure
  }

  try {
    console.log('Testing Gemini API connectivity...');
    const testPrompt = "Hello"; // A simple prompt to test
    const testPayload = { contents: [{ parts: [{ text: testPrompt }] }] };

    const response = await axios.post(
      GEMINI_ENDPOINT,
      testPayload,
      { timeout: 5000 } // Add a timeout for the test call
    );

    if (response.status === 200 && response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.log('✅ Gemini API connected successfully!');
      return true; // Indicate success
    } else {
      console.error('❌ Gemini API test failed: Unexpected response structure or status.');
      console.error('Gemini response:', response.data);
      return false; // Indicate failure
    }
  } catch (err) {
    console.error('❌ Error connecting to Gemini API during test:', err.response?.data || err.message);
    if (axios.isAxiosError(err) && err.response) {
        if (err.response.status === 403) {
            console.error('API Key might be invalid or unauthorized for Gemini 2.0 Flash.');
        } else if (err.response.status === 400 && err.response.data?.error?.message?.includes("API key not valid")) {
            console.error('Your GEMINI_API_KEY appears to be invalid.');
        }
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.error('Please check your internet connection or API endpoint.');
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
    console.log('Looking for resume at:', resumePath);
    const buffer = fs.readFileSync(resumePath); 
    const data = await extract(buffer);
    resumeText = data.text.replace(/\r\n/g, '\n').trim();
    console.log(`✅ Loaded resume.pdf, length ${resumeText.length} characters.`);
  } catch (err) {
    console.error(`❌ Failed to load/parse resume.pdf at ${resumePath}:`, err.message);
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
  const { question, sessionId = 'default' } = req.body;
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'No question provided' });
  }
  const q = question.trim();

  // Analyze question intent
  const intent = analyzeQuestionIntent(q);
  const conversationContext = getConversationContext(sessionId);
  
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
- Use Markdown formatting for structure and readability
- Include relevant emojis to make responses engaging
- Provide specific examples and metrics when available
- Always end with a helpful follow-up suggestion or question
- Be context-aware based on previous conversation

**Formatting Rules:**
- Use **bold** for key information and names
- Use bullet points (-) for lists
- Use code blocks for technical terms
- Include [links](url) when relevant
- Add blank lines between sections for readability

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
- Master's in Applied Computer Science from Concordia University (2023-2025)
- Bachelor's in Computer Science from Amity University (2017-2021)
- Currently: Associate I at Amazon Canada FC (Oct 2023 - May 2025)
- Previous: TechOps Engineer at Comviva (June 2021 - Aug 2021)
- Location: Montreal, QC (willing to relocate anywhere in Canada)
- Work Status: PGWP valid until 2028, available immediately
- Contact: aryanbvp.09@gmail.com

**Notable Projects:**
1. **Tik AI** - TikTok AI Agent with Google Gemini 2.5 Flash (90%+ accuracy, <2s response)
2. **Scrapy** - TikTok Scraper with AI Vector Search (100ms embedding, <50ms search)
3. **Multi-Agent LLM Chatbot** - RLHF system (92% routing accuracy, 87% response relevance)
4. **TubeLytics v2** - Real-time YouTube Analytics (60% API call reduction)

**Tech Stack Highlights:**
- AI/ML: LangChain, FAISS, TensorFlow, Vertex AI, Gemini API
- Backend: FastAPI, Node.js, Java, Scala, Play Framework
- Frontend: Next.js, React, TypeScript, Tailwind CSS
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
      console.error('❌ GEMINI_API_KEY not set in env during API call attempt.');
      return res.status(500).json({ error: 'Server misconfiguration: missing API key' });
    }
    
    const apiRes = await axios.post(
      GEMINI_ENDPOINT,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const reply = apiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    // Update conversation memory
    updateConversationMemory(sessionId, q, reply);
    
    // Generate follow-up suggestions based on intent
    const primaryIntent = Object.keys(intent).find(key => intent[key]) || 'general';
    const followUpSuggestions = generateFollowUpSuggestions(primaryIntent, q);
    
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
    console.error('❌ Error calling Gemini API:', err.response?.data || err.message);
    if (axios.isAxiosError(err) && err.response) {
        if (err.response.status === 403) {
            console.error('API Key might be invalid or unauthorized for Gemini 2.0 Flash.');
        } else if (err.response.status === 400 && err.response.data?.error?.message?.includes("API key not valid")) {
            console.error('Your GEMINI_API_KEY appears to be invalid.');
        }
    }
    res.status(500).json({ error: 'AI request failed' });
  }
});

// Conversation management endpoints
app.get('/api/conversation/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const context = getConversationContext(sessionId);
  res.json({ 
    sessionId, 
    conversationHistory: context,
    messageCount: context.length 
  });
});

app.delete('/api/conversation/:sessionId', (req, res) => {
  const { sessionId } = req.params;
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
      enhancedPrompting: true
    }
  });
});

// IMPORTANT: Export the app for Vercel
export default app;

// The app.listen() block is removed as Vercel handles the server listening.
// For local development, you would run this via `vercel dev`
