![lockd-icon](/icons/icon128.png)

# LOCKD

A no-bullshit social media blocker for Chrome and Firefox. (vibecoded 🥀)

## What it does

LOCKD intercepts navigation to distracting websites and asks you why you're there. Work or private? If it's work, you get a pass. If it's private, you wait. And think about what you've done.

## Features

- Separate work and private access modes
- Work mode: instant access (I trust you. Probably shouldn't.)
- Private mode: forced delay + guilt trip
- Domain matching: base domain, exact, or regex
- Auto-kick when your pass expires (yes, mid-scroll)
- No accounts, no data collection, no rounded corners, no sympathy

## Screenshots

| ![locked](/.github/assets/lockd_locked.png) | ![blocked](/.github/assets/lockd_blocked.png) |
| --- | --- |
| ![settings](/.github/assets/lockd_settings.png) | ![popup](/.github/assets/lockd_popup.png) |

## Installation

### Firefox

<a href="https://addons.mozilla.org/addon/lockd-block-distractions-focus?utm_source=github-readme"><img src="https://blog.mozilla.org/addons/files/2020/04/get-the-addon-fx-apr-2020.svg" alt="Get the add-on" width="200"/></a>

### Chrome

> [!NOTE]
> Chrome Web Store wants $5 for a developer account. I'm not doing that. Maybe later. For now:

1. Clone this repo
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select `dist/chrome`

## Domain Matching

| Mode | Example | Matches | Doesn't Match |
| --- | --- | --- | --- |
| Base Domain | `youtube.com` | `youtube.com`, `music.youtube.com` | `notyoutube.com` |
| Exact | `youtube.com` | `youtube.com` | `music.youtube.com` |
| Regex | `.*\.google\.com` | `mail.google.com` | `google.com` |

## Motivation

One-sec and freedom.to were too restrictive at work. So I built my own. Apparently that's easier than having self-control.

## Roadmap

- Desktop app (Rust) for system-wide blocking
- Android app
- Multi-device sync server
- Statistics (for masochists)

## Philosophy

Lock in. Or don't. This is an extension, not your mother.
