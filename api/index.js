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


// === API Endpoint (This is the route that Vercel will expose) ===
app.post('/api/answer', async (req, res) => {
  const { question } = req.body;
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'No question provided' });
  }
  const q = question.trim();

  // Adjusted prompt for less constraint, but still resume-focused
  const prompt = `
You are Aryan Awasthi’s AI assistant. Answer questions about Aryan in a friendly, concise, and well-formatted way.

**Guidelines:**
- Keep answers short, clear, and directly relevant.
- Use bullet points and bold for key info.
- Do NOT repeat the entire resume; summarize only what is asked.
- For questions like "tell me about Aryan," give a 4-5 bullet professional snapshot (education, skills, work, notable projects).
- If the question is about a skill, summarize it briefly.
- If the question is about education, summarize the degree and institution.
- If the question is about work experience, summarize the role and company.
- If the question is about a project, summarize it and provide a link if available in resume.
- Structure your reply for easy reading (like a LinkedIn summary, not a resume dump).
- Example for "tell me about Aryan":
    ---
    **Aryan Awasthi**  
    - Recent Master’s Graduate from Concordia University in Computer Science. 
    - Experienced in Python, ML, MLOps, and backend development.
    - Projects: Multi-agent LLM chatbot, Real-time YouTube analytics, Android sport tracker.
    - Former TechOps Engineer at Tech Mahindra-Comviva.
    - Cloud & DevOps: AWS, Docker, Kubernetes.
    - Has PGWP (Post-Graduation Work Permit) valid until 2028.
    - LinkedIn: [linkedin.com/in/aryan-awasthi](https://www.linkedin.com/in/aryan-awasthi)
    - GitHub: [github.com/arextron](https://github.com/arextron)
    - contact: aryanbvp.09@gmail.com 
    - Phone: +1 (438) 855-6936
    - Location: willing to relocate anywhere in Canada.
    - Open to full-time roles in Canada.
    - Available for work immediately.

--- Resume Text ---
${resumeText}
--- End Resume ---

Question:
${q}
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
    res.json({ answer: reply });
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

// Optional health-check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: Export the app for Vercel
export default app;

// The app.listen() block is removed as Vercel handles the server listening.
// For local development, you would run this via `vercel dev`
