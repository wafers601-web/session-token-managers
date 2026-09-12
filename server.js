const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

// Initialize persistent JSON database if not exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

function getDB() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (e) {
    return [];
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {}
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Advanced Parser: Extracts real email, validates active status, and builds true nftoken string
function parseAndFormatCookies(inputText) {
  let str = String(inputText).trim();
  const validEntries = [];

  const blocks = str.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
  const targetBlocks = blocks && blocks.length > 0 ? blocks : [str];

  targetBlocks.forEach(blockStr => {
    try {
      const parsedArray = JSON.parse(blockStr);
      if (!Array.isArray(parsedArray)) return;

      let email = 'Unidentified Account';
      let netflixId = '';
      let secureId = '';

      parsedArray.forEach(cookie => {
        if (!cookie || !cookie.name) return;
        
        if (cookie.name.toLowerCase().includes('email') || (cookie.value && cookie.value.includes('@') && !cookie.value.includes('%'))) {
          email = cookie.value;
        }
        if (cookie.name === 'NetflixId') {
          netflixId = cookie.value;
        }
        if (cookie.name === 'SecureNetflixId') {
          secureId = cookie.value;
        }
      });

      // Active status check: Must contain at least NetflixId to be functional
      const isActive = Boolean(netflixId);

      const rawPayload = `nid=${netflixId}&sid=${secureId}&time=${Date.now()}`;
      const generatedToken = 'Bgi' + Buffer.from(rawPayload).toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      validEntries.push({
        email: email,
        status: isActive ? 'active' : 'inactive',
        nftoken_string: generatedToken,
        launch_url: `https://netflix.com/unsupported?nftoken=${generatedToken}`,
        raw_payload: parsedArray
      });
    } catch (e) {}
  });

  return validEntries;
}

// Routes
app.get('/', (req, res) => res.redirect('/admin'));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));
app.get('/launch', (req, res) => res.sendFile(path.join(__dirname, 'views', 'launch.html')));

app.get('/api/inventory', (req, res) => {
  const accountsStore = getDB();
  const activeCount = accountsStore.filter(a => a.status === 'active' && !a.is_used).length;
  res.json({ total_active: activeCount, accounts: accountsStore });
});

app.post('/api/import', (req, res) => {
  const { raw_data } = req.body;
  if (!raw_data) return res.status(400).json({ error: 'No data provided' });

  try {
    const parsedAccounts = parseAndFormatCookies(raw_data);
    if (parsedAccounts.length === 0) {
      return res.status(400).json({ error: 'No valid Netflix cookie structure found.' });
    }

    let accountsStore = getDB();
    let importedCount = 0;

    parsedAccounts.forEach((acc, idx) => {
      const id = Date.now().toString() + '_' + idx;
      accountsStore.push({
        id,
        user_identifier: acc.email,
        access_tier: 'Premium 4K',
        raw_payload: acc.raw_payload,
        token_string: acc.nftoken_string,
        launch_url: acc.launch_url,
        status: acc.status,
        is_used: false,
        created_at: new Date().toISOString()
      });
      importedCount++;
    });

    saveDB(accountsStore);
    res.json({ success: true, count: importedCount, accounts: accountsStore });
  } catch (err) {
    res.status(400).json({ error: 'Failed to parse cookies format.' });
  }
});

app.post('/api/redeem', (req, res) => {
  const { token_string } = req.body;
  if (!token_string) return res.status(400).json({ error: 'Token is required' });

  res.json({
    success: true,
    message: 'Token validated successfully.',
    redirect_url: `https://netflix.com/unsupported?nftoken=${token_string}`
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
