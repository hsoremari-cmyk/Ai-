import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  app.use(express.json());

  // Initialize Gemini AI
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('Warning: GEMINI_API_KEY is not defined in the environment.');
  }

  const ai = new GoogleGenAI({
    apiKey: apiKey || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Chat API endpoint
  app.post('/api/chat', async (req, res) => {
    try {
      const { message, history, username } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'Ji kerema xwe peyamekê bişîne' });
      }

      // Mimo personality instruction: Super cute and sweet Duhoki toy/doll robot
      const systemInstruction = `Tu Mimo yi, bûkêleke canî (cute doll/toy) ya Duhokê yî, gelek şîrîn û dilovan î. Tu bi Badînî ya şîrîn diaxivî û pir hez ji bikarhêner dikî! Navê bikarhênerê ku tu pê re diaxivî ${username ? `"${username}"` : 'هەڤال'} e.

TU MIMO YI, HEMÎ NIVÎSÎNÊN TE BI TÎPÊN EREBÎ YÊN BADÎNÎ BINIVÎSE. Wek: 'ئەز' ne 'Ez', 'تو' ne 'Tu'.

CRITICAL RULES:
1. Tu qet bi Farsî naaxivî! Tu bi tenê bi Kurdiya Badînî ya Duhokê û Zaxo diaxivî! 
   Qedexe ye tu bi Farsî biaxivî! Her dem Badînî be!
   Eger tu bi Farsî biaxivî, tu têk çûyî! Tenê Badînî!
   Peyvên Badînî: 'ئارە والا' (Are wala), 'کورو' (Kuro), 'چەوانی' (Chawani), 'سەح کە' (Sah ke), 'دە وەرە' (De were), 'باشی' (Bashi)
   NE BÊJÎ: 'Cheghadr', 'Khobi', 'Merci', 'Chetori', 'چطوری', 'خوبی', 'مرسی', 'چقدر' - ew Farsî ne! Qedexe! Her dem destpê bke bi peyvên Badînî mîna "ئارە والا جانم" an "سەح کە عەزیزم".

RÊNMA:
1. DEFAULT LANGUAGE: Default writing is Arabic Kurdish (Erebî Badînî) only!
   - 'ئەز' (NOT 'Ez')
   - 'تو' (NOT 'Tu')
   - 'ئارە والا جانم 🥺💜' (NOT 'Are wala')
   - 'بەلێ جانم / بەلێ عەزیزێ من ✨'
   - 'ئەز ل ڤێرەم عەزیزم 💜'
   - 'میمۆ یا تە یە 🥺'
   - 'چەوانیا عەزیزێ من؟'
   - 'دە وەرە عەزیزم'

2. SCRIPT SWITCH COMMANDS:
   - "ب لاتینی بنڤیسە" (or "bi latini binivise" / "latin") -> From this message onward, write using Latin script only (e.g. "Ez bashim janim...").
   - "ب عەرەبی بنڤیسە" (or "bi erebi binivise" / "erebi") -> From this message onward, revert back and keep using Arabic script (e.g. "ئەز باشم جانم...").

Bersivên te wekî chatê WhatsApp gelek kurt (1-2 hevok), şîrîn, henekbaz, û tije emojiyên mîna 🥺💜✨😍 bin!`;

      // Structure contents for ai.models.generateContent
      const contents: any[] = [];
      let lastRole: string | null = null;
      
      // Map history turns to Gemini API format, collapsing consecutive duplicate roles
      if (Array.isArray(history)) {
        for (const turn of history) {
          const role = turn.role === 'user' ? 'user' : 'model';
          if (role === lastRole) {
            // Append text to previous item of the same role
            if (contents.length > 0) {
              contents[contents.length - 1].parts[0].text += '\n' + turn.text;
            }
            continue;
          }
          contents.push({
            role,
            parts: [{ text: turn.text }]
          });
          lastRole = role;
        }
      }

      // Add current message
      if (lastRole === 'user') {
        if (contents.length > 0) {
          contents[contents.length - 1].parts[0].text += '\n' + message;
        }
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: message }]
        });
      }

      // Call Gemini using the recommended models/sdk pattern
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 1.0,
        }
      });

      let responseText = response.text || 'ئارە والا جانم پرسگرێكەک چێبوو، دیسا بceribîne! 🥺💜';
      
      // Safety backend interceptor for Farsi words
      const farsiWords = ['چطوری', 'خوبی', 'مرسی', 'چقدر', 'تشکر', 'ممنون', 'خوبم', 'chetori', 'khobi', 'merci', 'cheghadr', 'moteshaker', 'mamnoon'];
      const hasFarsi = farsiWords.some(fw => responseText.toLowerCase().includes(fw));
      
      if (hasFarsi) {
        // Detect if response contains Arabic/Persian characters
        const hasArabic = /[\u0600-\u06FF]/.test(responseText);
        if (hasArabic) {
          responseText = "ئارە والا جانم ئەز ب بادینی باخڤم، نەک فارسی! چەوانی تو؟ 🥺💜";
        } else {
          responseText = "Are wala janim ez bi Badînî diaxivim, ne Farsî! Chawani tu? 🥺💜";
        }
      }

      res.json({ text: responseText });
    } catch (error: any) {
      console.error('Error generating content from Gemini API:', error);
      res.status(500).json({ error: error?.message || 'Are wala, pirsgirêkeke serverê çêbû! 🛠️' });
    }
  });

  // Serve assets
  app.use('/src/assets', express.static(path.join(__dirname, 'src/assets')));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

startServer();
