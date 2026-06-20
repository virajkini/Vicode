import express from 'express';
import cors from 'cors';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { put, del, list } from '@vercel/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4002;
const execAsync = promisify(exec);

app.use(cors());
app.use(express.json());

loadEnvFile();
logEnvStatus();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
if (!GOOGLE_CLIENT_ID) {
  console.warn('GOOGLE_CLIENT_ID is not set. Google login will fail until it is configured.');
}

// Auth endpoints
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }
    const payload = await verifyGoogleIdToken(idToken);
    const user = extractUser(payload);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: error.message || 'Authentication failed' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// API to get all files
app.get('/api/files', requireAuth, async (req, res) => {
  try {
    const prefix = getUserPrefix(req.user.email);
    const { blobs } = await list({ prefix, token: process.env.BLOB_READ_WRITE_TOKEN });
    const files = blobs.map(b => b.pathname.slice(prefix.length)).sort();
    res.json({ files });
  } catch (error) {
    console.error('Error reading files:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to get file content
app.get('/api/file/:filename(*)', requireAuth, async (req, res) => {
  try {
    const filename = validateFilename(req.params.filename);
    const pathname = getUserPrefix(req.user.email) + filename;
    const { blobs } = await list({ prefix: pathname, limit: 10, token: process.env.BLOB_READ_WRITE_TOKEN });
    const blob = blobs.find(b => b.pathname === pathname);
    if (!blob) return res.status(404).json({ error: 'File not found' });
    const response = await fetch(blob.url);
    const content = await response.text();
    res.json({ content, filename });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to save file content
app.post('/api/file/:filename(*)', requireAuth, async (req, res) => {
  try {
    const filename = validateFilename(req.params.filename);
    const { content } = req.body;
    const pathname = getUserPrefix(req.user.email) + filename;
    await put(pathname, Buffer.from(content ?? ''), {
      access: 'public',
      contentType: 'text/plain',
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    res.json({ success: true, message: 'File saved successfully' });
  } catch (error) {
    console.error('Error saving file:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to delete file
app.delete('/api/file/:filename(*)', requireAuth, async (req, res) => {
  try {
    const filename = validateFilename(req.params.filename);
    const pathname = getUserPrefix(req.user.email) + filename;
    const { blobs } = await list({ prefix: pathname, limit: 10, token: process.env.BLOB_READ_WRITE_TOKEN });
    const blob = blobs.find(b => b.pathname === pathname);
    if (!blob) return res.status(404).json({ error: 'File not found' });
    await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    res.json({ success: true, message: 'File deleted successfully', filename });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to create new file
app.post('/api/files', requireAuth, async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename || !filename.trim()) {
      return res.status(400).json({ error: 'Filename is required' });
    }
    const validFilename = validateFilename(filename.trim());
    const pathname = getUserPrefix(req.user.email) + validFilename;
    const { blobs } = await list({ prefix: pathname, limit: 10, token: process.env.BLOB_READ_WRITE_TOKEN });
    if (blobs.find(b => b.pathname === pathname)) {
      return res.status(400).json({ error: 'File already exists' });
    }
    await put(pathname, Buffer.from(''), {
      access: 'public',
      contentType: 'text/plain',
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    res.json({ success: true, message: 'File created successfully', filename: validFilename });
  } catch (error) {
    console.error('Error creating file:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to execute file
app.post('/api/execute', requireAuth, async (req, res) => {
  try {
    const { filename } = req.body;
    const validFilename = validateFilename(filename);
    const pathname = getUserPrefix(req.user.email) + validFilename;
    const ext = extname(validFilename).toLowerCase();

    const { blobs } = await list({ prefix: pathname, limit: 10, token: process.env.BLOB_READ_WRITE_TOKEN });
    const blob = blobs.find(b => b.pathname === pathname);
    if (!blob) return res.status(404).json({ error: 'File not found' });

    const response = await fetch(blob.url);
    const content = await response.text();

    // Write to /tmp for execution (only /tmp is writable on serverless)
    const safeEmail = sanitizeEmail(req.user.email);
    const tmpDir = `/tmp/vicode/${safeEmail}`;
    await mkdir(tmpDir, { recursive: true });
    const tmpFile = join(tmpDir, validFilename.replace(/\//g, '_'));
    await writeFile(tmpFile, content, 'utf-8');

    let command;
    switch (ext) {
      case '.js':
      case '.mjs':
        command = `node "${tmpFile}"`;
        break;
      case '.py':
        command = `python3 "${tmpFile}"`;
        break;
      case '.ts':
        command = `ts-node "${tmpFile}"`;
        break;
      case '.sh':
        command = `bash "${tmpFile}"`;
        break;
      default:
        return res.status(400).json({ error: `Unsupported file type: ${ext}` });
    }

    const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
    res.json({ output: stdout || stderr || '', error: stderr || null });
  } catch (error) {
    res.json({ output: '', error: error.message || 'Execution failed' });
  }
});

if (!process.env.VERCEL) {
  const DIST_DIR = join(__dirname, '..', 'dist');
  if (existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
    app.get('*', (req, res) => {
      res.sendFile(join(DIST_DIR, 'index.html'));
    });
  }
}

function getUserPrefix(email) {
  return `practise/${sanitizeEmail(email)}/`;
}

function validateFilename(filename) {
  const parts = filename.split('/');
  for (const part of parts) {
    if (part === '..' || part === '.') throw new Error('Invalid path');
  }
  if (filename.startsWith('/')) throw new Error('Invalid path');
  return filename;
}

function sanitizeEmail(email) {
  return email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
}

function loadEnvFile() {
  const envPath = join(__dirname, '..', '.env');
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function logEnvStatus() {
  const keys = ['GOOGLE_CLIENT_ID', 'VITE_GOOGLE_CLIENT_ID', 'PORT', 'VERCEL', 'BLOB_READ_WRITE_TOKEN'];
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      console.log(`[env] ${key} is set (length=${String(value).length})`);
    } else {
      console.log(`[env] ${key} is NOT set`);
    }
  }
}

async function verifyGoogleIdToken(idToken) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is not configured on the server');
  }
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let googleError = 'Invalid Google token';
          try {
            const body = JSON.parse(data);
            if (body.error_description) googleError = `Google token error: ${body.error_description}`;
            else if (body.error) googleError = `Google token error: ${body.error}`;
          } catch (_) {}
          return reject(new Error(`${googleError} (HTTP ${res.statusCode})`));
        }
        try {
          const payload = JSON.parse(data);
          if (payload.aud !== GOOGLE_CLIENT_ID) {
            return reject(new Error(`Token audience mismatch: expected ${GOOGLE_CLIENT_ID}, got ${payload.aud}`));
          }
          if (payload.email_verified !== 'true' && payload.email_verified !== true) {
            return reject(new Error('Google email is not verified'));
          }
          resolve(payload);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (err) => reject(new Error(`Failed to reach Google token endpoint: ${err.message}`)));
  });
}

function extractUser(payload) {
  if (!payload?.email) return null;
  return {
    email: payload.email,
    name: payload.name || payload.email,
    picture: payload.picture || ''
  };
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization token' });
    }
    const payload = await verifyGoogleIdToken(token);
    const user = extractUser(payload);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: error.message || 'Unauthorized' });
  }
}

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
