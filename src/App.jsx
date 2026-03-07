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
  const [tabs, setTabs] = useState([
    { id: 1, filename: null, content: '', isDirty: false },
  ]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [files, setFiles] = useState([]);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];

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
    setTabs([{ id: 1, filename: null, content: '', isDirty: false }]);
    setActiveTabId(1);
    setFiles([]);
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
      const fileList = data.files || [];
      setFiles(fileList);
      if (fileList.length > 0 && activeTab && !activeTab.filename) {
        await loadFileIntoTab(activeTab.id, fileList[0]);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const loadFileIntoTab = async (tabId, filename) => {
    try {
      const response = await authFetch(`/api/file/${encodeURIComponent(filename)}`);
      const data = await response.json();
      setTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab.id === tabId
            ? { ...tab, filename, content: data.content || '', isDirty: false }
            : tab
        )
      );
      setConsoleLogs([]);
    } catch (error) {
      console.error('Error fetching file content:', error);
      setTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab.id === tabId
            ? { ...tab, filename, content: 'Error loading file', isDirty: false }
            : tab
        )
      );
    }
  };

  const handleFileSelect = async (filename) => {
    if (!activeTab) return;
    await loadFileIntoTab(activeTab.id, filename);
  };

  const handleContentChange = (newContent) => {
    if (!activeTab) return;
    setTabs((prevTabs) =>
      prevTabs.map((tab) =>
        tab.id === activeTab.id
          ? { ...tab, content: newContent, isDirty: true }
          : tab
      )
    );
  };

  const handleSave = async () => {
    if (!activeTab?.filename) return;

    try {
      const response = await authFetch(`/api/file/${encodeURIComponent(activeTab.filename)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: activeTab.content }),
      });

      const data = await response.json();
      if (data.success) {
        setConsoleLogs([{ type: 'info', message: '✅ File saved successfully!' }]);
        setTabs((prevTabs) =>
          prevTabs.map((tab) =>
            tab.id === activeTab.id ? { ...tab, isDirty: false } : tab
          )
        );
      } else {
        setConsoleLogs([{ type: 'error', message: data.error || 'Failed to save file' }]);
      }
    } catch (error) {
      setConsoleLogs([{ type: 'error', message: error.message }]);
    }
  };

  const handleExecute = async () => {
    if (!activeTab?.filename) return;

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
        body: JSON.stringify({ filename: activeTab.filename }),
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
        // Select the newly created file in the active tab
        if (activeTab) {
          await loadFileIntoTab(activeTab.id, filename);
        }
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
        setTabs((prevTabs) =>
          prevTabs.map((tab) =>
            tab.filename === filename
              ? { ...tab, filename: null, content: '', isDirty: false }
              : tab
          )
        );
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
    if (!activeTab?.filename || !activeTab?.isDirty) return;
    const timeoutId = setTimeout(() => {
      handleSave();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [activeTabId, activeTab?.content, activeTab?.isDirty, activeTab?.filename]);

  const handleAddTab = () => {
    const nextId = Date.now();
    setTabs((prevTabs) => [
      ...prevTabs,
      { id: nextId, filename: null, content: '', isDirty: false },
    ]);
    setActiveTabId(nextId);
  };

  const handleCloseTab = (tabId) => {
    setTabs((prevTabs) => {
      if (prevTabs.length === 1) {
        return [{ id: Date.now(), filename: null, content: '', isDirty: false }];
      }
      const nextTabs = prevTabs.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(nextTabs[0]?.id || null);
      }
      return nextTabs;
    });
  };

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

  const selectedFile = activeTab?.filename || null;
  const activeContent = activeTab?.content || '';

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
          <div className="tabs-bar">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`tab-button ${tab.id === activeTabId ? 'active' : ''}`}
              >
                <button
                  className="tab-label"
                  onClick={() => setActiveTabId(tab.id)}
                  title={tab.filename || 'Untitled'}
                >
                  {tab.filename || 'Untitled'}
                  {tab.isDirty ? '*' : ''}
                </button>
                <button
                  className="tab-close"
                  onClick={() => handleCloseTab(tab.id)}
                  title="Close tab"
                >
                  ×
                </button>
              </div>
            ))}
            <button className="tab-add-button" onClick={handleAddTab}>
              + Tab
            </button>
          </div>
          <CodeViewer
            content={activeContent}
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
