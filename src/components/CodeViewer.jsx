import React from 'react';
import Editor from '@monaco-editor/react';
import './CodeViewer.css';

function CodeViewer({ content, filename, onChange, onSave }) {
  const getLanguage = () => {
    if (!filename) return 'javascript';
    const ext = filename.split('.').pop().toLowerCase();
    const languageMap = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      sh: 'shell',
      json: 'json',
      css: 'css',
      md: 'markdown',
      html: 'html',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
    };
    return languageMap[ext] || 'javascript';
  };

  const handleEditorChange = (value) => {
    if (onChange) {
      onChange(value || '');
    }
  };

  const handleEditorDidMount = (editor, monaco) => {
    // Add keyboard shortcut for save (Cmd/Ctrl + S)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, (e) => {
      e?.preventDefault();
      if (onSave) {
        onSave();
      }
    });
  };

  return (
    <div className="code-viewer">
      <div className="code-header">
        <span className="code-filename">{filename || 'No file selected'}</span>
        {filename && (
          <button 
            className="save-button" 
            onClick={(e) => {
              e.preventDefault();
              if (onSave) onSave();
            }} 
            title="Save (Ctrl/Cmd + S)"
          >
            💾 Save
          </button>
        )}
      </div>
      <div className="code-content">
        {filename ? (
          <Editor
            height="100%"
            language={getLanguage()}
            value={content || ''}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
            theme="vs-dark"
            options={{
              fontSize: 14,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
              formatOnPaste: true,
              formatOnType: true,
            }}
          />
        ) : (
          <div className="code-placeholder">
            // Select a file to view and edit its content
          </div>
        )}
      </div>
    </div>
  );
}

export default CodeViewer;
