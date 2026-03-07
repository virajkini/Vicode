import express from 'express';
import cors from 'cors';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { readdir, readFile, stat, writeFile, unlink, mkdir } from 'fs/promises';
import { join, extname, resolve, relative, dirname as pathDirname, sep } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4002;
const execAsync = promisify(exec);

app.use(cors());
app.use(express.json());

loadEnvFile();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
if (!GOOGLE_CLIENT_ID) {
  console.warn('GOOGLE_CLIENT_ID is not set. Google login will fail until it is configured.');
}

// Get the practise root folder path (per-user folders live under here)
const PRACTISE_ROOT = process.env.PRACTISE_ROOT
  ? resolve(process.env.PRACTISE_ROOT)
  : join(__dirname, '..', 'practise');

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

// API to get all files in practise folder
app.get('/api/files', requireAuth, async (req, res) => {
  try {
    const userRoot = await ensureUserRoot(req.user.email);
    const files = await getAllFiles(userRoot);
    res.json({ files });
  } catch (error) {
    console.error('Error reading files:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to get file content
app.get('/api/file/:filename(*)', requireAuth, async (req, res) => {
  try {
    const filename = req.params.filename;
    const userRoot = await ensureUserRoot(req.user.email);
    const filePath = resolveSafePath(userRoot, filename);
    const content = await readFile(filePath, 'utf-8');
    res.json({ content, filename });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to save file content
app.post('/api/file/:filename(*)', requireAuth, async (req, res) => {
  try {
    const filename = req.params.filename;
    const { content } = req.body;
    const userRoot = await ensureUserRoot(req.user.email);
    const filePath = resolveSafePath(userRoot, filename);
    
    await mkdir(pathDirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
    res.json({ success: true, message: 'File saved successfully' });
  } catch (error) {
    console.error('Error saving file:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to delete file
app.delete('/api/file/:filename(*)', requireAuth, async (req, res) => {
  try {
    const filename = req.params.filename;
    const userRoot = await ensureUserRoot(req.user.email);
    const filePath = resolveSafePath(userRoot, filename);
    await unlink(filePath);
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

    const userRoot = await ensureUserRoot(req.user.email);
    const filePath = resolveSafePath(userRoot, filename);
    
    // Check if file already exists
    try {
      await stat(filePath);
      return res.status(400).json({ error: 'File already exists' });
    } catch (error) {
      // File doesn't exist, which is what we want
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Create empty file (and folders if needed)
    await mkdir(pathDirname(filePath), { recursive: true });
    await writeFile(filePath, '', 'utf-8');
    res.json({ success: true, message: 'File created successfully', filename });
  } catch (error) {
    console.error('Error creating file:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to execute file
app.post('/api/execute', requireAuth, async (req, res) => {
  try {
    const { filename } = req.body;
    const userRoot = await ensureUserRoot(req.user.email);
    const filePath = resolveSafePath(userRoot, filename);
    const ext = extname(filename).toLowerCase();
    
    let command;
    switch (ext) {
      case '.js':
      case '.mjs':
        command = `node "${filePath}"`;
        break;
      case '.py':
        command = `python3 "${filePath}"`;
        break;
      case '.ts':
        command = `ts-node "${filePath}"`;
        break;
      case '.sh':
        command = `bash "${filePath}"`;
        break;
      default:
        return res.status(400).json({ error: `Unsupported file type: ${ext}` });
    }

    const { stdout, stderr } = await execAsync(command, {
      cwd: userRoot,
      timeout: 30000
    });

    res.json({ 
      output: stdout || stderr || '',
      error: stderr || null
    });
  } catch (error) {
    res.json({ 
      output: '',
      error: error.message || 'Execution failed'
    });
  }
});

const DIST_DIR = join(__dirname, '..', 'dist');
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
}

// Helper function to get all files recursively
async function getAllFiles(dir, fileList = []) {
  try {
    const files = await readdir(dir);
    
    for (const file of files) {
      const filePath = join(dir, file);
      const fileStat = await stat(filePath);
      
      if (fileStat.isDirectory()) {
        await getAllFiles(filePath, fileList);
      } else {
        // Get relative path from practise folder
        const relativePath = relative(dir, filePath);
        fileList.push(relativePath);
      }
    }
    
    return fileList.sort();
  } catch (error) {
    // If practise folder doesn't exist, return empty array
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
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

async function verifyGoogleIdToken(idToken) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is not configured on the server');
  }

  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error('Invalid Google token'));
        }
        try {
          const payload = JSON.parse(data);
          if (payload.aud !== GOOGLE_CLIENT_ID) {
            return reject(new Error('Token audience mismatch'));
          }
          if (payload.email_verified !== 'true' && payload.email_verified !== true) {
            return reject(new Error('Google email is not verified'));
          }
          resolve(payload);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
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

async function ensureUserRoot(email) {
  const safeEmail = sanitizeEmail(email);
  const userRoot = join(PRACTISE_ROOT, safeEmail);
  await mkdir(userRoot, { recursive: true });
  return userRoot;
}

function sanitizeEmail(email) {
  return email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
}

function resolveSafePath(root, relativePath) {
  const resolved = resolve(root, relativePath);
  const rel = relative(root, resolved);
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || rel.includes(`${sep}..`)) {
    throw new Error('Invalid path');
  }
  return resolved;
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
