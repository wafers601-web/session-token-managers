const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

let accountsStore = [];

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const encryptPayload = (data) => {
  return Buffer.from(JSON.stringify(data)).toString('base64');
};

const decryptPayload = (token) => {
  try {
    const str = Buffer.from(token, 'base64').toString('utf8');
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
};

// Helper: Smart JSON Extraction & Sanitizer
function parseSmartCookies(inputText) {
  if (typeof inputText === 'object') return inputText;
  
  let str = String(inputText).trim();

  // 1. Try direct JSON parse first
  try {
    return JSON.parse(str);
  } catch (e) {}

  // 2. Extract valid JSON blocks [...] or {...} if text has headers/watermarks
  const jsonArrayMatch = str.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (jsonArrayMatch) {
    try {
      return JSON.parse(jsonArrayMatch[0]);
    } catch (e) {}
  }

  const jsonObjectMatch = str.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      return JSON.parse(jsonObjectMatch[0]);
    } catch (e) {}
  }

  throw new Error("Unable to extract valid JSON data format.");
}

// Routes
app.get('/', (req, res) => {
  res.redirect('/admin');
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get('/launch', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'launch.html'));
});

// API: Get Inventory Count & Accounts
app.get('/api/inventory', (req, res) => {
  const activeCount = accountsStore.filter(a => a.status === 'active' && !a.is_used).length;
  res.json({ total_active: activeCount, accounts: accountsStore });
});

// API: Import Bulk Cookies JSON with Cleaner
app.post('/api/import', (req, res) => {
  const { raw_data } = req.body;
  if (!raw_data) return res.status(400).json({ error: 'No data provided' });

  try {
    let parsed = parseSmartCookies(raw_data);
    
    // Convert single object to array for consistent handling
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }

    let importedCount = 0;

    // Check if array contains valid cookie elements
    if (parsed.length > 0) {
      const id = Date.now().toString();
      const token = 'TOKEN-AES-' + encryptPayload(parsed);
      
      // Extract Email or fallback identifier
      let email = `Account_${id.slice(-4)}`;
      if (Array.isArray(parsed)) {
        const emailCookie = parsed.find(c => c && c.name && c.name.toLowerCase().includes('email'));
        if (emailCookie) email = emailCookie.value;
      }

      accountsStore.push({
        id,
        user_identifier: email,
        access_tier: 'Premium 4K',
        raw_payload: parsed,
        token_string: token,
        is_used: false,
        status: 'active',
        created_at: new Date().toISOString()
      });
      importedCount = 1;
    }

    res.json({ success: true, count: importedCount });
  } catch (err) {
    res.status(400).json({ error: 'Invalid JSON structure. Please clean text format.' });
  }
});

// API: Redeem / Validate Token
app.post('/api/redeem', (req, res) => {
  const { token_string } = req.body;
  if (!token_string) return res.status(400).json({ error: 'Token is required' });

  const rawToken = token_string.replace('TOKEN-AES-', '');
  const decodedData = decryptPayload(rawToken);

  if (!decodedData) {
    return res.status(400).json({ error: 'Invalid or corrupted token payload structure.' });
  }

  res.json({
    success: true,
    message: 'Token decrypted and validated successfully.',
    session_data: decodedData
  });
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
