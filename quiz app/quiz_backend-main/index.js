const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
require('dotenv').config();


const PORT = process.env.PORT || 3001;

const serviceAccount = {
  type: process.env.GOOGLE_TYPE,
  project_id: process.env.GOOGLE_PROJECT_ID,
  private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
  // Support private keys stored with escaped newlines in .env
  private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  client_id: process.env.GOOGLE_CLIENT_ID,
  auth_uri: process.env.GOOGLE_AUTH_URI,
  token_uri: process.env.GOOGLE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_X509,
  client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT,
  universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN,
};

// Spreadsheet configuration
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1DgEjp7MnPcOpAIqR-5g8xbu2JnLO7gLybOPuwASxKWQ';


// Auth client
const auth = new google.auth.GoogleAuth({
  credentials:serviceAccount,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
app.get("/", async (req, res) => { 
    res.json({ message: "hello" });
});

// Simple quiz runner UI for taking the test
app.get('/take/:name', async (req, res) => {
  const quizName = req.params.name;
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Take Quiz - ${quizName}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; }
      .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; max-width: 720px; margin: 0 auto; }
      .q { margin-top: 16px; }
      button { background: #4f46e5; color: white; border: 0; padding: 10px 14px; border-radius: 6px; cursor: pointer; }
      .opt { display: block; margin: 8px 0; }
      .result { margin-top: 16px; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2 id="title">Loading...</h2>
      <div id="meta">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin:10px 0 6px;">
          <input id="name" placeholder="Your Name" style="flex:1; padding:8px;"/>
          <input id="reg" placeholder="Register Number" style="flex:1; padding:8px;"/>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <input id="dept" placeholder="Department (e.g., IT)" style="flex:1; padding:8px;"/>
          <input id="year" placeholder="Year (e.g., 2025)" style="flex:1; padding:8px;"/>
        </div>
      </div>
      <div id="content">Please wait...</div>
    </div>
    <script>
      async function load() {
        const res = await fetch('/quiz/${quizName}');
        const data = await res.json();
        document.getElementById('title').textContent = data.quizName || '${quizName}';
        const container = document.getElementById('content');
        let idx = 0; let score = 0;
        function render() {
          if (idx >= data.questions.length) {
            container.innerHTML = '<div class="result">Completed! Score: ' + score + ' / ' + data.questions.length + '</div>' +
            '<div style=\"margin-top:8px;\"><button id=\"submitBtn\">Submit Result</button></div>';
            document.getElementById('submitBtn').onclick = async () => {
              const payload = {
                name: document.getElementById('name').value || 'Anonymous',
                register_number: document.getElementById('reg').value || '',
                department: document.getElementById('dept').value || '',
                year: document.getElementById('year').value || '',
                score: score
              };
              try {
                const resp = await fetch('/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const j = await resp.json().catch(() => ({}));
                alert(j.message || 'Submission saved!');
              } catch (e) { alert('Failed to submit result'); }
            };
            return;
          }
          const q = data.questions[idx];
          container.innerHTML = '<div class="q"><div><b>Q' + (idx+1) + '.</b> ' + q.question + '</div>' +
            q.options.map(o => '<label class="opt"><input type="radio" name="opt" value="' + o + '"> ' + o + '</label>').join('') +
            '<div style="margin-top:12px;"><button id="next">Next</button></div></div>';
          document.getElementById('next').onclick = () => {
            const sel = document.querySelector('input[name=opt]:checked');
            if (sel && sel.value === q.answer) score++;
            idx++;
            render();
          };
        }
        render();
      }
      load();
    </script>
  </body>
  </html>`);
});

app.get('/quiz/:name', async (req, res) => {
  const quizName = req.params.name;

  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${quizName}'!A:Z`
    });

    const rows = response.data.values;

    if (!rows || rows.length < 3) {
      return res.status(400).json({ error: 'Invalid sheet format' });
    }

    const headers = rows[1];
      
    const questions = rows.slice(2).map((row) => ({
  question: row[headers.indexOf('question')],
  options: row[headers.indexOf('options')].split(',').map((opt) => opt.trim()),
  answer: row[headers.indexOf('answer')],
  image: row[headers.indexOf('image')] || '',  // If cell is empty, default to ''
}));

    res.json({ quizName: rows[0][0], questions });
  } catch (err) {
    console.error('Google Sheets error:', err);
    res.status(500).json({ error: 'Failed to fetch quiz data',msg:err });
  }
});


app.post('/submit', async (req, res) => {
  const { name, register_number, score, department,year } = req.body;

  if (!name ||score == null) {
    return res.status(400).json({ error: 'Missing fields in submission' });
  }

  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "result", // Make sure this tab exists
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[new Date().toLocaleString(), name, register_number, score, department,year]],
      },
    });

    res.status(200).json({ message: 'Submission saved successfully!' });
  } catch (err) {
    console.error('Error saving result to sheet:', err);
    res.status(500).json({ error: 'Failed to save result' });
  }
});

app.get('/submitted-registers', async (req, res) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'result!C2:C', // C2:C to skip the header
    });

    const rows = readResponse.data.values || [];

    // Flatten the rows and send as an array
    const registerNumbers = rows.map(row => row[0]);

    res.status(200).json({ registerNumbers });
  } catch (error) {
    console.error('Error fetching register numbers:', error);
    res.status(500).json({ error: 'Failed to fetch submitted register numbers' });
  }
});


app.listen(PORT,'0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
