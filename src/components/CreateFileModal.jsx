import React, { useState, useEffect, useRef } from 'react';
import './CreateFileModal.css';

function CreateFileModal({ isOpen, onClose, onCreate }) {
  const [filename, setFilename] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setFilename('');
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (filename.trim()) {
      onCreate(filename.trim());
      setFilename('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create New File</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label htmlFor="filename-input">File Name:</label>
            <input
              id="filename-input"
              ref={inputRef}
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., myfile.js, script.py"
              autoFocus
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="modal-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal-create" disabled={!filename.trim()}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateFileModal;




