const { app, BrowserWindow, screen, session, desktopCapturer, Tray, Menu, nativeImage,
        ipcMain, powerMonitor, globalShortcut } = require('electron');
const path = require('path');

// fixes the "cache Access denied" errors
app.setPath('userData', path.join(app.getPath('appData'), 'MyBuddy'));
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

const TASKBAR_H = 48;   // height of the Windows taskbar when it pops up (DIP)

let win, tray, lastGreet = 0, musicEnabled = true, tbShown = false;
let lastCx = null, lastCy = null;

if (!app.requestSingleInstanceLock()) {
  console.log('Another MyBuddy is already running. Quitting this one. Run stop-buddy.bat first.');
  app.quit();
}

const send = (name, arg) => win && !win.isDestroyed() && win.webContents.send('cmd', name, arg);
function greet() {
  if (Date.now() - lastGreet < 60000) return; // don't greet twice within a minute
  lastGreet = Date.now();
  send('greet');
}

function createWindow() {
  const b = screen.getPrimaryDisplay().bounds;
  const width = Math.round(b.width * 0.45), height = 420;   // small strip, bottom-right only (taller for the timer panel)
  win = new BrowserWindow({
    x: b.x + b.width - width, y: b.y + b.height - height, width, height,
    transparent: true, frame: false, alwaysOnTop: true, focusable: false,
    hasShadow: false, resizable: false, skipTaskbar: true, show: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      autoplayPolicy: 'no-user-gesture-required'   // lets the alarm sound play
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true }); // click-through by default
  win.loadFile('index.html');
  win.once('ready-to-show', () => win.showInactive());
  win.webContents.on('did-finish-load', () => setTimeout(greet, 3000)); // boot / login greeting
  win.webContents.on('console-message', (e, level, message) => console.log('[buddy]', e.message || message));
}

// Detect the auto-hide taskbar popping up: cursor pushed to the bottom edge = shown,
// cursor moved well above the taskbar = hidden again.
function pollTaskbar() {
  const b = screen.getPrimaryDisplay().bounds;
  const p = screen.getCursorScreenPoint();

  const fromBottom = b.y + b.height - p.y;

  let next = tbShown;

  // Detect the cursor touching the bottom edge
  if (fromBottom <= 3) {
    next = true;
  }
  // Keep the taskbar visible while the cursor is within its area
  else if (fromBottom <= TASKBAR_H + 10) {
    next = true;
  }
  // Hide the buddy's taskbar state when the cursor moves away
  else if (fromBottom > TASKBAR_H + 30) {
    next = false;
  }

  if (next !== tbShown) {
    tbShown = next;
    send('taskbar', tbShown);
  }
}

// Tell the page where the mouse is (relative to the buddy window).
// The page uses this for hover detection and to decide when clicks should work.
function sendCursor() {
  if (!win || win.isDestroyed()) return;
  const p = screen.getCursorScreenPoint();
  if (p.x === lastCx && p.y === lastCy) return;   // only send when the mouse moved
  lastCx = p.x; lastCy = p.y;
  const wb = win.getBounds();
  send('cursor', { x: p.x - wb.x, y: p.y - wb.y });
}

// Windows pulls the taskbar above other always-on-top windows when you use it,
// which hides his hanging legs. Keep pushing him back on top (no focus stealing).
function keepOnTop() {
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
  }
}

function toggleMusic() {
  musicEnabled = !musicEnabled;
  console.log('music dance enabled:', musicEnabled);
  send('music', musicEnabled);
  buildMenu();
}

function buildMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Remind me now', click: () => send('remind') },
    { label: 'Say hi', click: () => send('greet') },
    { label: 'Dismiss (Ctrl+Alt+B)', click: () => send('dismiss') },
    { label: 'Hide / Show buddy (Ctrl+Alt+H)', click: () => send('hide-toggle') },
    { label: 'Dance when music plays (Ctrl+Alt+M)', type: 'checkbox', checked: musicEnabled, click: toggleMusic },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'front.png')).resize({ width: 16 });
  tray = new Tray(icon);
  tray.setToolTip('My Buddy');
  buildMenu();
}

function reg(key, fn) {
  const ok = globalShortcut.register(key, fn);
  console.log(`shortcut ${key}:`, ok ? 'OK' : 'FAILED (another app uses it)');
}

app.whenReady().then(() => {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true }); // auto-start (packaged exe only)

  // system-audio capture for the dance (no picker popup)
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then(s => cb({ video: s[0], audio: 'loopback' }));
  });

  ipcMain.on('click-through', (e, on) => {
    if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(on, on ? { forward: true } : undefined);
  });

  createWindow();
  createTray();
  setInterval(pollTaskbar, 120);
  setInterval(sendCursor, 40);
  setInterval(keepOnTop, 300);

  powerMonitor.on('resume', () => setTimeout(greet, 2000));        // wake from sleep
  powerMonitor.on('unlock-screen', () => setTimeout(greet, 1500)); // unlock
  reg('Control+Alt+B', () => send('dismiss'));
  reg('Control+Alt+H', () => send('hide-toggle'));
  reg('Control+Alt+M', toggleMusic);
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());