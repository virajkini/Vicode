import React, { useState, useEffect } from 'react';
import FileSelector from './components/FileSelector';
import CodeViewer from './components/CodeViewer';
import ConsolePanel from './components/ConsolePanel';
import CreateFileModal from './components/CreateFileModal';
import Login from './components/Login';
import './App.css';

function App() {
  const AUTOSAVE_DELAY_MS = 2000;
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('google_id_token');
    if (!token) {
      setAuthReady(true);
      return;
    }

    (async () => {
      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Session expired');
        }

        const data = await response.json();
        setAuthToken(token);
        setUser(data.user || null);
      } catch (error) {
        localStorage.removeItem('google_id_token');
        setAuthToken(null);
        setUser(null);
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (user) {
      fetchFiles();
    }
  }, [user]);

  const authFetch = async (url, options = {}) => {
    const headers = {
      ...(options.headers || {}),
    };

    const token = authToken || localStorage.getItem('google_id_token');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      handleLogout();
      throw new Error('Session expired. Please sign in again.');
    }
    return response;
  };

  const handleLogout = () => {
    localStorage.removeItem('google_id_token');
    setAuthToken(null);
    setUser(null);
    setFiles([]);
    setSelectedFile(null);
    setFileContent('');
    setConsoleLogs([]);
  };

  const handleGoogleLogin = async (idToken) => {
    try {
      setAuthError('');
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Login failed' }));
        throw new Error(errorData.error || 'Login failed');
      }

      const data = await response.json();
      setAuthToken(idToken);
      localStorage.setItem('google_id_token', idToken);
      setUser(data.user);
    } catch (error) {
      setAuthError(error.message || 'Login failed');
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await authFetch('/api/files');
      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const handleFileSelect = async (filename) => {
    setSelectedFile(filename);
    try {
      const response = await authFetch(`/api/file/${encodeURIComponent(filename)}`);
      const data = await response.json();
      setFileContent(data.content || '');
      setIsDirty(false);
      setConsoleLogs([]);
    } catch (error) {
      console.error('Error fetching file content:', error);
      setFileContent('Error loading file');
      setIsDirty(false);
    }
  };

  const handleContentChange = (newContent) => {
    setFileContent(newContent);
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    try {
      const response = await authFetch(`/api/file/${encodeURIComponent(selectedFile)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: fileContent }),
      });

      const data = await response.json();
      if (data.success) {
        setConsoleLogs([{ type: 'info', message: '✅ File saved successfully!' }]);
        setIsDirty(false);
      } else {
        setConsoleLogs([{ type: 'error', message: data.error || 'Failed to save file' }]);
      }
    } catch (error) {
      setConsoleLogs([{ type: 'error', message: error.message }]);
    }
  };

  const handleExecute = async () => {
    if (!selectedFile) return;

    // Auto-save before executing
    await handleSave();

    setIsExecuting(true);
    setConsoleLogs([{ type: 'info', message: 'Executing...' }]);

    try {
      const response = await authFetch('/api/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename: selectedFile }),
      });

      const data = await response.json();
      
      if (data.error) {
        setConsoleLogs([{ type: 'error', message: data.error }]);
      } else {
        const output = data.output || '';
        const lines = output.split('\n').filter(line => line.trim() !== '');
        setConsoleLogs(lines.map(line => ({ type: 'log', message: line })));
      }
    } catch (error) {
      setConsoleLogs([{ type: 'error', message: error.message }]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCreateFile = async (filename) => {
    try {
      const response = await authFetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
        setConsoleLogs([{ type: 'error', message: errorData.error || `Failed to create file: ${response.status}` }]);
        return;
      }

      const data = await response.json();
      if (data.success) {
        // Refresh file list
        await fetchFiles();
        // Select the newly created file
        await handleFileSelect(filename);
        setIsModalOpen(false);
        setConsoleLogs([{ type: 'info', message: `✅ File "${filename}" created successfully!` }]);
      } else {
        setConsoleLogs([{ type: 'error', message: data.error || 'Failed to create file' }]);
      }
    } catch (error) {
      setConsoleLogs([{ type: 'error', message: `Network error: ${error.message}` }]);
    }
  };

  const handleDeleteFile = async (filename) => {
    try {
      const response = await authFetch(`/api/file/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
        setConsoleLogs([{ type: 'error', message: errorData.error || `Failed to delete file: ${response.status}` }]);
        return;
      }

      const data = await response.json();
      if (data.success) {
        if (selectedFile === filename) {
          setSelectedFile(null);
          setFileContent('');
          setIsDirty(false);
        }
        await fetchFiles();
        setConsoleLogs([{ type: 'info', message: `🗑️ File "${filename}" deleted successfully!` }]);
      } else {
        setConsoleLogs([{ type: 'error', message: data.error || 'Failed to delete file' }]);
      }
    } catch (error) {
      setConsoleLogs([{ type: 'error', message: `Network error: ${error.message}` }]);
    }
  };

  useEffect(() => {
    if (!selectedFile || !isDirty) return;
    const timeoutId = setTimeout(() => {
      handleSave();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [fileContent, selectedFile, isDirty]);

  if (!authReady) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-title">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Login
        error={authError}
        onLogin={handleGoogleLogin}
      />
    );
  }

  return (
    <div className="app">
      <div className="header">
        <FileSelector
          files={files}
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          onCreateFile={() => setIsModalOpen(true)}
          onDeleteFile={handleDeleteFile}
        />
        <div className="user-chip">
          {user.picture ? (
            <img src={user.picture} alt={user.name} />
          ) : (
            <div className="user-avatar-fallback">
              {user.name?.slice(0, 1)?.toUpperCase() || '?'}
            </div>
          )}
          <div className="user-meta">
            <div className="user-name">{user.name}</div>
            <div className="user-email">{user.email}</div>
          </div>
          <button className="logout-button" onClick={handleLogout}>Logout</button>
        </div>
      </div>
      <CreateFileModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateFile}
      />
      <div className="main-content">
        <div className="left-panel">
          <CodeViewer
            content={fileContent}
            filename={selectedFile}
            onChange={handleContentChange}
            onSave={handleSave}
            onExecute={handleExecute}
            isExecuting={isExecuting}
            hasFile={!!selectedFile}
          />
        </div>
        <div className="right-panel">
          <ConsolePanel
            logs={consoleLogs}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
