# Code Executor App

A React application that allows you to browse, view, and execute files from your practise folder.

## Features

- 🔍 Searchable dropdown to browse all files in the `practise` folder
- 📝 VS Code-like syntax highlighting for code files
- 🖥️ Console panel on the left side to view execution output
- ▶️ Execute button to run files (supports JS, Python, TypeScript, Bash, etc.)
- 🎨 Clean, modern UI inspired by VS Code

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `practise` folder in the project root (if it doesn't exist):
```bash
mkdir practise
```

3. Add some test files to the `practise` folder (optional):
```bash
echo "console.log('Hello, World!');" > practise/test.js
```

## Running the App

Start both the frontend and backend servers:
```bash
npm run dev
```

The app will be available at:
- Frontend: http://localhost:4001
- Backend API: http://localhost:4002

## Usage

1. Use the searchable dropdown at the top to select a file from your `practise` folder
2. The file content will be displayed on the right with syntax highlighting
3. Click the "Execute" button in the console panel (left side) to run the file
4. View the output/logs in the console panel

## Supported File Types

- JavaScript (.js, .mjs)
- Python (.py)
- TypeScript (.ts)
- Bash scripts (.sh)

## Project Structure

```
.
├── server/          # Express backend server
│   └── index.js    # API endpoints
├── src/
│   ├── components/ # React components
│   │   ├── FileSelector.jsx
│   │   ├── CodeViewer.jsx
│   │   └── ConsolePanel.jsx
│   ├── App.jsx     # Main app component
│   └── main.jsx    # Entry point
└── practise/       # Your code files go here
```




