# 🧍 My Buddy

A tiny Windows desktop companion that sits on your taskbar, reminds you to drink water, greets you when you wake your laptop, dances to music, and tells you to go to sleep when you stay up too late.

Built with Electron, Node.js, JavaScript, and custom character animations.

## ✨ Features

- 💧 Water reminders with interactive responses
- 👋 Greetings on startup, unlock, and wake from sleep
- 🎵 Music detection with dancing animations
- 🪑 Sits on the taskbar
- ⏱️ Pomodoro Timer
- 📊 System Buddy: Live battery, RAM, and CPU monitoring with low-battery warnings
- 🛡️ Streak Guard: Checks public GitHub activity
- 🌤️ Morning weather update based on your location
- 🌙 Night Wind-Down: from 12 am he reminds you to sleep every 10 minutes, getting more insistent each time, with a soft chime
- 💬 One-key shortcut to open WhatsApp Web in the right Chrome profile
- 🖱️ Transparent, click-through window
- 🚀 Automatic startup with Windows

## 🛠️ Tech Stack

- Electron
- Node.js
- JavaScript
- HTML & CSS

## 🚀 Getting Started

**Requirements:** Windows 10/11 and Node.js.

```bash
npm install
npm start
```

## 📦 Build for Windows

```bash
npm run pack
```

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Alt + B` | Send Buddy away |
| `Ctrl + Alt + H` | Hide/show Buddy |
| `Ctrl + Alt + M` | Toggle music dancing |
| `Ctrl + Alt + W` | Open WhatsApp Web in Chrome |

## 🌙 Night Wind-Down

Between 12 am and 5 am, Buddy reminds you to sleep every 10 minutes. The messages and chime get stronger each time. Use the tray menu to skip it for the night or to test it. The time window and interval can be changed in `main.js` (`SLEEP_FROM`, `SLEEP_TO`, `SLEEP_EVERY_MIN`).

## 🤖 Built with AI

Developed with assistance from Claude, alongside my own contributions to the idea, behaviour design, testing, debugging, and packaging.

## 📌 Future Improvements

- More animations and character poses
- Customizable reminder settings
- App launcher shortcuts and type-to-open
- Exam countdown and daily DSA reminder
- Assistant panel with notes and quick actions