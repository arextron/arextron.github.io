import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// Full resume text
const resumeContext = `
Aryan Awasthi is recent graduate Master’s student from Concordia University specializing in AI, ML, and intelligent systems.
Education: M.A.C.S Computer Science (Concordia ’25); B.Tech Computer Science (Amity ’21).
Skills: Python, Java, Scala, TensorFlow, PyTorch, LangChain,  Docker, Kubernetes, FAISS.
Projects: Multi‐Agent LLM Chatbot (RLHF & Streamlit), TubeLytics v2 (Akka/WebSockets), OpenTracks (Android tracker).
Experience: TechOps Engineer at Tech Mahindra—built anomaly detection, predictive dashboards, NLP log analysis.
`;

app.post('/api/answer', async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'No question provided' });

  try {
    const response = await axios.post(
      GEMINI_ENDPOINT,
      {
        contents: [{
          parts: [{
            text: `
You are an AI recruiter assistant for Aryan Awasthi. Use ONLY the resume below to answer recruiter‐focused questions: education, skills, projects, or experience.  
• If the question is about something not on the resume, reply:  
  "I’m sorry, I don’t have that information. You can reach out directly via the Contact section below."  
• Do NOT mention this policy or anything else.  
• Keep answers concise, professional, and recruiter‐friendly.

Resume:
${resumeContext}

Question:
${question}
            `
          }]
        }]
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({ answer: reply });

  } catch (err) {
    console.error('Gemini API error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'AI request failed' });
  }
});

// Serve frontend
app.get('*', (_, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
