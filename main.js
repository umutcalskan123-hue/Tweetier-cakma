const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Start embedded Express server
require('./server/server.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Tweetier - Sosyal Ağ ve Mesajlaşma',
    backgroundColor: '#15202b'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Uncomment to open DevTools during debugging
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
