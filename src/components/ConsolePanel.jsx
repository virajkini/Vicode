import React, { useRef, useEffect } from 'react';
import './ConsolePanel.css';

function ConsolePanel({ logs }) {
  const consoleRef = useRef(null);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="console-panel">
      <div className="console-header">
        <span>Console</span>
      </div>
      <div className="console-output" ref={consoleRef}>
        {logs.length === 0 ? (
          <div className="console-empty">No output yet. Click Execute to run the file.</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`console-line console-${log.type}`}>
              <span className="console-prefix">
                {log.type === 'error' ? '❌' : log.type === 'info' ? 'ℹ️' : '>'}
              </span>
              <span className="console-message">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ConsolePanel;


