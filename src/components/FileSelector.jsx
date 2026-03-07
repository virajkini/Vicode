import React, { useState, useMemo, useEffect, useRef } from 'react';
import './FileSelector.css';

function FileSelector({ files, selectedFile, onFileSelect, onCreateFile, onDeleteFile }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const filteredFiles = useMemo(() => {
    if (!searchTerm) return files;
    return files.filter(file =>
      file.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [files, searchTerm]);

  const handleSelect = (filename) => {
    onFileSelect(filename);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleDelete = (e, filename) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Delete "${filename}"? This cannot be undone.`);
    if (confirmed && onDeleteFile) {
      onDeleteFile(filename);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="file-selector" ref={containerRef}>
      <div className="file-selector-label">Select File:</div>
      <div className="dropdown-container">
        <div
          className="dropdown-trigger"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span>{selectedFile || 'Choose a file...'}</span>
          <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
        </div>
        {isOpen && (
          <div className="dropdown-menu">
            <input
              type="text"
              className="search-input"
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
            <div className="file-list">
              {filteredFiles.length === 0 ? (
                <div className="no-files">No files found</div>
              ) : (
                filteredFiles.map((file, index) => (
                  <div
                    key={index}
                    className={`file-item ${selectedFile === file ? 'selected' : ''}`}
                    onClick={() => handleSelect(file)}
                  >
                    <span className="file-name">{file}</span>
                    <button
                      type="button"
                      className="delete-file-button"
                      title="Delete file"
                      onClick={(e) => handleDelete(e, file)}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      <button 
        className="add-file-button"
        onClick={onCreateFile}
        title="Create new file"
      >
        +
      </button>
    </div>
  );
}

export default FileSelector;
