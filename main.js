const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Embedded Express sunucusunu başlat
require('./server/server.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    title: 'Tweetier',
    backgroundColor: '#0b0e14'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

// Pencere Kontrolleri (Kesin Çözüm)
ipcMain.on('window-control', (event, action) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) return;
  
  if (action === 'minimize') {
    win.minimize();
  } else if (action === 'maximize') {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  } else if (action === 'close') {
    win.close();
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});