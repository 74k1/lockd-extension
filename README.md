![lockd-icon](/icons/icon128.png)

# LOCKD

A no-bullshit social media blocker for Chrome and Firefox. (vibecoded 🥀)

## What it does

LOCKD intercepts navigation to distracting websites and asks you why you're there. Work or private? If it's work, you get a pass. If it's private, you wait. And think about what you've done.

## Features

- Separate work and private access modes
- Work mode: instant access (I trust you. Probably shouldn't.)
- Private mode: forced delay + guilt trip
- **Rations**: daily time budgets per site. When it's gone, it's gone. (Until you add overtime like a hypocrite.)
- **Overtime**: because willpower is a myth
- **Feelings check**: after your ration expires, asks how you feel. Worth it? Meh? Regret? Be honest.
- **Analytics**: heatmaps, daily trends, peak hours, top sites. For masochists who want receipts.
- Domain matching: base domain, exact, or regex
- Auto-kick when your pass expires (yes, mid-scroll)
- Pauses videos when blocked (yes, even YouTube Shorts)
- No accounts, no data collection, no rounded corners, no sympathy

## Screenshots

<p>
  <img src="/.github/assets/lockd_locked.png" height="200" />
  <img src="/.github/assets/lockd_ration.png" height="200" />
  <img src="/.github/assets/lockd_settings.png" height="200" />
  <img src="/.github/assets/lockd_analytics.png" height="200" />
  <img src="/.github/assets/lockd_blocked.png" height="200" />
  <img src="/.github/assets/lockd_popup.png" height="200" />
</p>

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

## Rations vs Passes

| Mode | How it works |
| --- | --- |
| Pass | Choose work/private, get a timed pass. When it expires, you're out. |
| Ration | Daily time budget. Use it however you want. When it's gone, beg for overtime. |

## Motivation

One-sec and freedom.to were too restrictive at work. So I built my own. Apparently that's easier than having self-control.

## Roadmap

- Desktop app (Rust) for system-wide blocking
- Android app
- Multi-device sync server
- ~~Statistics (for masochists)~~ Done. You're welcome.

## Philosophy

Lock in. Or don't. This is an extension, not your mother.
