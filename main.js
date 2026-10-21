const { app, BrowserWindow, screen, session, desktopCapturer, Tray, Menu, nativeImage,
        ipcMain, powerMonitor, globalShortcut, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

// fixes the "cache Access denied" errors
app.setPath('userData', path.join(app.getPath('appData'), 'MyBuddy'));
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

const TASKBAR_H = 48;               // height of the Windows taskbar when it pops up (DIP)
const GITHUB_USER = 'Karthik-ctrl25';
const STREAK_HOUR = 21;             // streak guard starts checking at 9 pm (local time)

// ================= NIGHT WIND-DOWN =================
const SLEEP_FROM = 0;          // 12 am
const SLEEP_TO = 5;            // stop at 5 am
const SLEEP_EVERY_MIN = 10;    // repeat every 10 min
let nightLevel = 0, nightKeyDone = null, nextSleepAt = 0, sleepSkipKey = null;
const nightKey = () => new Date(Date.now() - 6 * 3600 * 1000).toDateString();  // same "night" across midnight

// ================= OPEN WHATSAPP =================
const WA_URL = 'https://web.whatsapp.com/';
const WA_EMAIL = 'karthikraikar25@gmail.com';   // Chrome profile signed in with this account

function chromeExe() {
  const dirs = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA];
  for (const d of dirs) {
    if (!d) continue;
    const f = path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe');
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// Finds the Chrome profile folder (Default / Profile 1 / ...) signed in with WA_EMAIL.
function chromeProfileDir() {
  try {
    const ls = JSON.parse(fs.readFileSync(
      path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Local State'), 'utf8'));
    const cache = ls.profile.info_cache;
    for (const dir in cache) {
      if ((cache[dir].user_name || '').toLowerCase() === WA_EMAIL) return dir;
    }
  } catch (e) { console.log('profile lookup failed:', e.message); }
  return 'Default';
}

function openWhatsApp() {
  const exe = chromeExe();
  if (!exe) { shell.openExternal(WA_URL); return; }   // Chrome not found: default browser
  execFile(exe, ['--profile-directory=' + chromeProfileDir(), WA_URL], err => {
    if (err) console.log('open WhatsApp failed:', err.message);
  });
}

// ================= WEATHER =================
const WEATHER_FROM = 5;  // Start checking at 5 AM
const WEATHER_TO = 11;   // Stop checking at 11 AM

let weatherDay = null;
let lastKnownLocation = null;

let win, tray, lastGreet = 0, musicEnabled = true, tbShown = false;
let lastCx = null, lastCy = null;
let streakDoneDay = null, nextStreakCheck = 0;   // streak guard memory

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
// ================= WEATHER UPDATES =================

function weatherWord(code) {
  if (code === 0) return '☀️ Clear';
  if (code <= 3) return '⛅ Partly cloudy';
  if (code === 45 || code === 48) return '🌫️ Foggy';
  if (code >= 51 && code <= 57) return '🌦️ Drizzle';
  if (code >= 61 && code <= 67) return '🌧️ Rain';
  if (code >= 71 && code <= 77) return '❄️ Snow';
  if (code >= 80 && code <= 82) return '🌧️ Showers';
  if (code >= 95) return '⛈️ Thunderstorm';
  return '🌤️ Mixed weather';
}

// Get approximate location using the public IP address.
// If this fails, fall back to the last successful location.
async function getWeatherLocation() {
  if (lastKnownLocation) return lastKnownLocation;

  const response = await fetch('https://ipwho.is/');

  if (!response.ok) {
    throw new Error('Could not detect location');
  }

  const location = await response.json();

  if (!location.success || !location.latitude || !location.longitude) {
    throw new Error('Location detection failed');
  }

  lastKnownLocation = {
    latitude: location.latitude,
    longitude: location.longitude,
    city: location.city || 'your location'
  };

  return lastKnownLocation;
}

async function morningWeather(tries = 0, force = false) {
  const now = new Date();
  const hour = now.getHours();

  // Send weather only once per day during the morning window.
  if (
    !force &&
    (hour < WEATHER_FROM ||
      hour >= WEATHER_TO ||
      weatherDay === now.toDateString())
  ) {
    return;
  }

  try {
    const location = await getWeatherLocation();

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}` +
      `&longitude=${location.longitude}` +
      `&current=temperature_2m,apparent_temperature,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&forecast_days=1`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Weather API error: ' + response.status);
    }

    const data = await response.json();

    const current = data.current;
    const daily = data.daily;

    const rain = daily.precipitation_probability_max?.[0] ?? 0;

    let message =
      `${weatherWord(current.weather_code)} in ${location.city}: ` +
      `${Math.round(current.temperature_2m)}°C ` +
      `(feels like ${Math.round(current.apparent_temperature)}°C). ` +
      `Today: ${Math.round(daily.temperature_2m_min[0])}–` +
      `${Math.round(daily.temperature_2m_max[0])}°C. ` +
      `Rain chance: ${rain}%.`;

    if (rain >= 50) {
      message += ' Take an umbrella! ☂️';
    }

    weatherDay = now.toDateString();
    send('weather', message);

  } catch (error) {
    console.log('Weather update failed:', error.message);

    if (tries < 3) {
      setTimeout(() => morningWeather(tries + 1, force), 60000);
    }
  }
}

function createWindow() {
  const b = screen.getPrimaryDisplay().bounds;
  const width = Math.round(b.width * 0.45), height = 420;   // small strip, bottom-right only
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
  win.webContents.on('did-finish-load', () => {
  setTimeout(greet, 3000);
  setTimeout(() => morningWeather(), 8000);
});
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

// ================= STREAK GUARD =================
// Looks at your public GitHub events. GitHub counts days in UTC, so we compare UTC dates.
async function pushedToday() {
  // TEST: put "return false;" on the next line to force the "no commit" warning, then remove it.
  const res = await fetch(`https://api.github.com/users/${GITHUB_USER}/events/public?per_page=100`, {
    headers: { 'User-Agent': 'my-buddy', 'Accept': 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error('GitHub ' + res.status);
  const events = await res.json();
  const today = new Date().toISOString().slice(0, 10);
  return events.some(e => e.type === 'PushEvent' && e.created_at.slice(0, 10) === today);
}

async function streakTick() {                 // runs every minute
  const now = new Date();
  if (now.getHours() < STREAK_HOUR) return;                  // before 9 pm: nothing to do
  if (streakDoneDay === now.toDateString()) return;          // already pushed (or skipped) today
  if (Date.now() < nextStreakCheck) return;                  // check at most every 30 min
  nextStreakCheck = Date.now() + 30 * 60 * 1000;
  try {
    if (await pushedToday()) streakDoneDay = now.toDateString();   // pushed: stop checking today
    else send('streak');                                           // no push yet: he warns you
  } catch (e) {
    console.log('streak check failed:', e.message);
  }
}

// ================= SYSTEM STATS =================
let prevCpu = os.cpus();
function cpuPercent() {
  const cur = os.cpus();
  let idle = 0, total = 0;
  cur.forEach((c, i) => {
    const p = prevCpu[i];
    for (const k in c.times) total += c.times[k] - p.times[k];
    idle += c.times.idle - p.times.idle;
  });
  prevCpu = cur;
  return total ? Math.round(100 * (1 - idle / total)) : 0;
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
    { label: 'Open WhatsApp (Ctrl+Alt+W)', click: openWhatsApp },
    { label: 'Check GitHub streak now', click: () => send('streak-now') },
    {label: 'Show weather now',click: () => morningWeather(0, true)},
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

  // the page asks for these:
  ipcMain.handle('stats', () => {
    const total = os.totalmem(), free = os.freemem();
    return { cpu: cpuPercent(), ramUsedGB: (total - free) / 2 ** 30, ramTotalGB: total / 2 ** 30 };
  });
  ipcMain.handle('streak-check', async () => {
    try { return { pushed: await pushedToday() }; }
    catch (e) { return { error: e.message }; }
  });
  ipcMain.on('streak-skip', () => { streakDoneDay = new Date().toDateString(); });   // "Skip today"

  createWindow();
  createTray();
  setInterval(pollTaskbar, 120);
  setInterval(sendCursor, 40);
  setInterval(keepOnTop, 300);
  setInterval(streakTick, 60 * 1000);

  powerMonitor.on('resume', () => setTimeout(greet, 2000));        // wake from sleep
  powerMonitor.on('unlock-screen', () => setTimeout(greet, 1500)); // unlock
  reg('Control+Alt+B', () => send('dismiss'));
  reg('Control+Alt+H', () => send('hide-toggle'));
  reg('Control+Alt+M', toggleMusic);
  reg('Control+Alt+W', openWhatsApp);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => app.quit());