import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, readFile, stat, writeFile, unlink } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 4002;
const execAsync = promisify(exec);

app.use(cors());
app.use(express.json());

// Get the practise folder path (assuming it's in the parent directory or same directory)
const PRACTISE_FOLDER = join(__dirname, '..', 'practise');

// API to get all files in practise folder
app.get('/api/files', async (req, res) => {
  try {
    const files = await getAllFiles(PRACTISE_FOLDER);
    res.json({ files });
  } catch (error) {
    console.error('Error reading files:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to get file content
app.get('/api/file/:filename(*)', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = join(PRACTISE_FOLDER, filename);
    const content = await readFile(filePath, 'utf-8');
    res.json({ content, filename });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to save file content
app.post('/api/file/:filename(*)', async (req, res) => {
  try {
    const filename = req.params.filename;
    const { content } = req.body;
    const filePath = join(PRACTISE_FOLDER, filename);
    
    await writeFile(filePath, content, 'utf-8');
    res.json({ success: true, message: 'File saved successfully' });
  } catch (error) {
    console.error('Error saving file:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to delete file
app.delete('/api/file/:filename(*)', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = join(PRACTISE_FOLDER, filename);
    await unlink(filePath);
    res.json({ success: true, message: 'File deleted successfully', filename });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to create new file
app.post('/api/files', async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename || !filename.trim()) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    const filePath = join(PRACTISE_FOLDER, filename);
    
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

    // Create empty file
    await writeFile(filePath, '', 'utf-8');
    res.json({ success: true, message: 'File created successfully', filename });
  } catch (error) {
    console.error('Error creating file:', error);
    res.status(500).json({ error: error.message });
  }
});

// API to execute file
app.post('/api/execute', async (req, res) => {
  try {
    const { filename } = req.body;
    const filePath = join(PRACTISE_FOLDER, filename);
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
      cwd: PRACTISE_FOLDER,
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
        const relativePath = filePath.replace(PRACTISE_FOLDER + '/', '');
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
