# LOCKD

A no-bullshit social media blocker for Chrome and Firefox. (vibecoded 🥀)

## What it does

LOCKD intercepts navigation to distracting websites and asks you why you're there. Work or private? If it's work, you get a pass. If it's private, you wait.

## Motivation

I wanted a social media blocker like one-sec or freedom.to but with a selection of either work or private use..

One-sec and freedom.to were too restrictive while I was at work.

Put me on a cross for vibecoding.. my bigger projects I'll do by my own hand/mind!

## Features

- Block social media and other distracting sites
- Separate work and private access modes
- Work mode: instant access for a configured duration
- Private mode: forced delay before you can choose how long you need
- Per-site configuration (work only, private only, or completely blocked)
- Cross-browser support (Chrome and Firefox)
- No account required
- No data collection
- No bullshit

## Screenshots

![locked](/.github/assets/lockd_locked.png)
![popup](/.github/assets/lockd_popup.png)
![blocked](/.github/assets/lockd_blocked.png)
![settings](/.github/assets/lockd_settings.png)

## Installation

### Chrome

> [!NOTE]
> Chrome web store is paywalling non-profit open-source developers with a 5$ fee to open up a developer account.
> I'm not doing that.. you can just follow these steps below.

1. Download or clone this repository
2. Open `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `lockd-extension` folder

### Firefox

> [!NOTE]
> I'm currently in the process of getting this Add-on added in the Firefox Extension store! I'll update this as soon as I got it. :)
> Firefox temporary add-ons are removed when the browser closes. For permanent installation, the extension needs to be signed by Mozilla.

1. Download or clone this repository
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file inside `lockd-extension`

## Configuration

Click the LOCKD icon in your browser toolbar and select "Settings" to:

- Add or remove sites from the block list
- Configure which sites are allowed for work, private, or completely blocked
- Set the duration for work passes (default: 30 minutes)
- Set the default duration for private passes (default: 15 minutes)
- Set the delay before private access is granted (default: 15 seconds)

## Default blocked sites

- discord.com
- facebook.com
- instagram.com
- linkedin.com
- reddit.com
- snapchat.com
- tiktok.com
- twitch.tv
- x.com
- youtube.com

## How it works

1. You try to visit a blocked site
2. LOCKD intercepts the request and shows a choice screen
3. Choose "WORK" for instant access (configurable duration)
4. Choose "PRIVATE" to wait (configurable delay), then select how long you need
5. After the pass expires, you'll be prompted again

## Future Roadmap

*(far far ahead... don't expect them soon at all, unless I'm motivated)*

- Desktop application (Rust) for system-wide blocking
- Mobile application (Android) for on-device blocking
- Central management server for multi-device configuration sync

## Philosophy

Lock in. Stay focused. Build something great.
