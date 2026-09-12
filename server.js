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

// Advanced Robust Line-by-Line Cookie Extractor
function parseAllCookieBlocks(inputText) {
  if (typeof inputText === 'object') {
    return Array.isArray(inputText) ? [inputText] : [[inputText]];
  }

  const str = String(inputText).trim();
  const validBlocks = [];

  // Strategy 1: Extract every [{...}] or {...} block using Regex Global match
  const blocks = str.match(/\[\s*\{[\s\S]*?\}\s*\]/g);

  if (blocks && blocks.length > 0) {
    blocks.forEach(blockStr => {
      try {
        const parsed = JSON.parse(blockStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          validBlocks.push(parsed);
        }
      } catch (e) {}
    });
  }

  // Strategy 2: Fallback line-by-line parsing if Strategy 1 found nothing
  if (validBlocks.length === 0) {
    const lines = str.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed) && parsed.length > 0) {
            validBlocks.push(parsed);
          }
        } catch (e) {}
      }
    });
  }

  if (validBlocks.length === 0) {
    throw new Error("No valid JSON cookie blocks detected.");
  }

  return validBlocks;
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

// API: Import Bulk Cookies JSON (Supports Multi-line JSON Arrays)
app.post('/api/import', (req, res) => {
  const { raw_data } = req.body;
  if (!raw_data) return res.status(400).json({ error: 'No data provided' });

  try {
    const cookieBlocks = parseAllCookieBlocks(raw_data);
    let importedCount = 0;

    cookieBlocks.forEach((parsedArray, idx) => {
      const id = Date.now().toString() + '_' + idx;
      const token = 'TOKEN-AES-' + encryptPayload(parsedArray);

      // Search for email cookie or construct dynamic account name
      let email = `Account_${importedCount + 1}_${id.slice(-4)}`;
      if (Array.isArray(parsedArray)) {
        const emailCookie = parsedArray.find(c => c && c.name && c.name.toLowerCase().includes('email'));
        if (emailCookie) email = emailCookie.value;
      }

      accountsStore.push({
        id,
        user_identifier: email,
        access_tier: 'Premium 4K',
        raw_payload: parsedArray,
        token_string: token,
        is_used: false,
        status: 'active',
        created_at: new Date().toISOString()
      });
      importedCount++;
    });

    res.json({ success: true, count: importedCount });
  } catch (err) {
    res.status(400).json({ error: 'Failed to extract valid cookies. Check text formatting.' });
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
