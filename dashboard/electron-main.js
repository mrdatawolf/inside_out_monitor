const { app, BrowserWindow } = require('electron');
const path = require('path');
const { existsSync } = require('fs');

let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false  // Allow external API calls
    },
    icon: path.join(__dirname, 'icon.png'), // Optional: add an icon later
    title: 'Inside-Out Monitor Dashboard'
  });

  // Find the built React app
  // Try multiple locations for flexibility
  const possiblePaths = [
    path.join(__dirname, 'dist', 'index.html'),
    path.join(__dirname, '..', 'dashboard', 'dist', 'index.html'),
    path.join(process.resourcesPath, 'dist', 'index.html')
  ];

  let indexPath = null;
  for (const filePath of possiblePaths) {
    if (existsSync(filePath)) {
      indexPath = filePath;
      console.log(`Found dashboard at: ${filePath}`);
      break;
    }
  }

  if (!indexPath) {
    console.error('ERROR: Could not find built React dashboard!');
    console.error('Make sure to run "npm run build" first.');
    console.error('Tried:');
    possiblePaths.forEach(p => console.error(`  - ${p}`));
    app.quit();
    return;
  }

  // Load the index.html from the dist folder
  mainWindow.loadFile(indexPath);

  // Open DevTools for debugging
  mainWindow.webContents.openDevTools();

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Log when ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Dashboard loaded successfully');
  });
}

// Create window when Electron is ready
app.whenReady().then(createWindow);

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On macOS, re-create window when dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Log app version
app.on('ready', () => {
  console.log('Inside-Out Monitor Dashboard');
  console.log(`Electron v${process.versions.electron}`);
  console.log(`Node v${process.versions.node}`);
  console.log(`Chrome v${process.versions.chrome}`);
});
