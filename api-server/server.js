import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import extract from 'pdf-extraction';
import { fileURLToPath } from 'url';
import axios from 'axios';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// === CORS Setup ===
app.use(cors());
app.use(express.json());

// === Serve static files (like index.html, style.css) from the 'client' directory ===
// IMPORTANT CHANGE: Adjusting the path to serve static files from the 'client' folder.
// Assumes 'client' folder is one level up from 'api-server'
app.use(express.static(path.join(__dirname, '..', 'client')));


// Global variable for resume text
let resumeText = '';

// Gemini API Endpoint (defined once)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Get key once
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// === Function to test Gemini API connectivity ===
async function testGeminiAPI() {
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set in env. Please check your .env file.');
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
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.error('Please check your internet connection or API endpoint.');
    } else if (err.response && err.response.status === 403) {
      console.error('API Key might be invalid or unauthorized for Gemini 2.0 Flash.');
    } else if (err.response && err.response.status === 400 && err.response.data?.error?.message.includes("API key not valid")) {
      console.error('Your GEMINI_API_KEY appears to be invalid.');
    }
    return false; // Indicate failure
  }
}

// === Main function to start the server and load resources ===
async function startServer() {
  // Define resumePath here, within the main async function, to ensure its scope
  // Assuming resume.pdf is still in the same directory as server.js (api-server folder)
  const resumePath = path.join(__dirname, 'resume.pdf'); 

  // Load resume.pdf
  try {
    console.log('Looking for resume at:', resumePath);
    const buffer = fs.readFileSync(resumePath); 
    const data = await extract(buffer);
    resumeText = data.text.replace(/\r\n/g, '\n').trim();
    console.log(`✅ Loaded resume.pdf, length ${resumeText.length} characters.`);
  } catch (err) {
    // Now resumePath is definitely in scope here for the error message
    console.error(`❌ Failed to load/parse resume.pdf at ${resumePath}:`, err.message);
    resumeText = ''; // Ensure it's empty if loading fails
  }

  // Test Gemini API after resume loading
  await testGeminiAPI(); // Perform the test

  // === API Endpoint ===
  app.post('/api/answer', async (req, res) => {
    const { question } = req.body;
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'No question provided' });
    }
    const q = question.trim();

    // Adjusted prompt for less constraint, but still resume-focused
    const prompt = `
You are Aryan Awasthi’s AI assistant. Answer questions about Aryan Awasthi.
Prioritize information from the resume text provided below.
If you cannot find the answer in the resume, you may use your general knowledge, but clearly state when you are providing information not directly from the resume.
If the question is about Aryan's personal life or something not covered by professional context, politely decline to answer or redirect them to the contact section.

--- Resume Text ---
${resumeText}
--- End Resume ---

Question:
${q}
`;

    try {
      if (!GEMINI_API_KEY) { // Use the constant GEMINI_API_KEY
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
      // More specific error handling for API key issues
      if (err.response && err.response.status === 403) {
        console.error('API Key might be invalid or unauthorized for Gemini 2.0 Flash.');
      } else if (err.response && err.response.status === 400 && err.response.data?.error?.message.includes("API key not valid")) {
        console.error('Your GEMINI_API_KEY appears to be invalid.');
      }
      res.status(500).json({ error: 'AI request failed' });
    }
  });

  // Optional health-check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`🚀 Backend listening on port ${PORT}`);
    console.log(`▶️  POST /api/answer to ask questions`);
    console.log(`🌐 You can now access your application at http://localhost:${PORT}`);
  });
}

// Call the main function to start everything
startServer();
