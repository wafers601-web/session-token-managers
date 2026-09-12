const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

// Initialize local JSON Database if not exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ accounts: [] }, null, 2));
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper Functions
const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

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

// Routes
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get('/launch', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'launch.html'));
});

// API: Get Inventory Count & Accounts
app.get('/api/inventory', (req, res) => {
  const db = readDB();
  const activeCount = db.accounts.filter(a => a.status === 'active' && !a.is_used).length;
  res.json({ total_active: activeCount, accounts: db.accounts });
});

// API: Import Bulk Cookies JSON
app.post('/api/import', (req, res) => {
  const { raw_data } = req.body;
  if (!raw_data) return res.status(400).json({ error: 'No data provided' });

  try {
    let parsed = typeof raw_data === 'string' ? JSON.parse(raw_data) : raw_data;
    if (!Array.isArray(parsed)) parsed = [parsed];

    const db = readDB();
    let importedCount = 0;

    parsed.forEach((item, idx) => {
      const id = Date.now().toString() + '_' + idx;
      const token = 'TOKEN-AES-' + encryptPayload(item);
      const email = item.user_email || item.email || `Account_${id.slice(-4)}`;
      const tier = item.plan || item.tier || 'Premium 4K';

      db.accounts.push({
        id,
        user_identifier: email,
        access_tier: tier,
        raw_payload: item,
        token_string: token,
        is_used: false,
        status: 'active',
        created_at: new Date().toISOString()
      });
      importedCount++;
    });

    writeDB(db);
    res.json({ success: true, count: importedCount });
  } catch (err) {
    res.status(400).json({ error: 'Invalid JSON format' });
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
