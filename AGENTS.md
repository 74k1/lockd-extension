# LOCKD Extension - Agent Development Guide

This guide provides essential information for agentic coding agents working on the LOCKD browser extension.

## Project Overview

LOCKD is a no-bullshit social media blocker for Chrome and Firefox that intercepts navigation to distracting websites and forces users to choose between "work" and "private" access modes. The extension is built with vanilla JavaScript and follows a minimalist, brutalist design philosophy.

## Build Commands

The project uses `just` as the task runner. Install it first, then use:

```bash
# Show all available commands
just

# Build both Firefox and Chrome extensions
just build

# Build individual targets
just build-firefox
just build-chrome

# Clean build directory
just clean

# Development workflow
just dev-firefox    # Build and open Firefox debugging page
just dev-chrome     # Build and open Chrome extensions page

# Watch for changes and auto-rebuild
just watch firefox
just watch chrome

# Package for distribution
just package

# Linting (requires web-ext)
just lint

# Version management
just version        # Show current version
just bump 1.0.1     # Bump version

# Validate assets
just check-icons    # Verify icon dimensions
```

## Testing

This project currently has no automated test suite. Manual testing involves:
1. Loading the extension in browser developer mode
2. Testing navigation to configured sites
3. Verifying pass granting and expiration
4. Testing both Firefox and Chrome builds

## Code Style Guidelines

### JavaScript Conventions

- **Language**: Vanilla JavaScript (ES6+), no frameworks
- **Browser Compatibility**: Use `globalThis.browser || globalThis.chrome` for cross-browser support
- **Strict Mode**: Not enforced, but use modern JS practices
- **Semicolons**: Required
- **Quotes**: Single quotes for strings, double quotes for HTML attributes

### File Structure

```
/
├── background.js          # Service worker/background script
├── popup/                 # Extension popup
│   ├── popup.html
│   └── popup.js
├── options/              # Settings page
│   ├── options.html
│   └── options.js
├── blocked/              # Interstitial page
│   ├── blocked.html
│   └── blocked.js
├── styles/
│   └── common.css        # Shared styles
├── icons/                # Extension icons
├── manifest.json         # Firefox manifest
├── manifest.chrome.json  # Chrome manifest
└── Justfile             # Build tasks
```

### Import Patterns

- No imports/exports - each file is self-contained
- Use browser extension APIs directly
- Cross-browser compatibility: `const browser = globalThis.browser || globalThis.chrome;`

### Naming Conventions

- **Variables**: `camelCase` (e.g., `activePasses`, `siteConfig`)
- **Functions**: `camelCase` with descriptive names (e.g., `hostnameMatchesSite`, `grantAccessAndRedirect`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_SITES`, `DEFAULT_CONFIG`)
- **DOM Elements**: `camelCase` with element type suffix (e.g., `domainEl`, `btnWork`, `statusEl`)
- **CSS Classes**: `kebab-case` (e.g., `pass-item`, `site-remove`, `toggle-active`)

### Error Handling

- Always wrap browser API calls in try-catch blocks
- Use console.error with `[LOCKD]` prefix for debugging
- Graceful degradation when APIs aren't available
- Example: Check for `browser.webNavigation` and fallback to `browser.tabs.onUpdated`

### Async/Await Patterns

- Prefer async/await over Promise chains
- Always handle errors in async functions
- Use `await` for browser extension messaging
- Example: `const config = await browser.runtime.sendMessage({ action: 'getConfig' });`

### DOM Manipulation

- Use vanilla DOM APIs (`document.createElement`, `appendChild`, etc.)
- For SVG elements, use `document.createElementNS` with proper namespace
- Clean up event listeners and intervals when appropriate
- Use CSS classes for state changes, avoid inline styles

### CSS Architecture

- **CSS Variables**: Use custom properties for theming (defined in `:root`)
- **Naming**: `kebab-case` for class names
- **No Frameworks**: Vanilla CSS, no preprocessors
- **Design System**: Brutalist theme with sharp corners, monospace fonts
- **Responsive**: Minimal, mostly fixed widths for popup
- **State Classes**: Use `.active`, `.hidden`, `.visible` for UI states

### Data Patterns

- **Storage**: Use `browser.storage.local` for persistence
- **Configuration**: Single config object with nested structure
- **State Management**: Simple in-memory objects with storage sync
- **Messaging**: Use action-based messages with `action` property

### Security Best Practices

- No eval() or dynamic code execution
- Sanitize user inputs (especially for regex patterns)
- Use content security policy headers
- No external dependencies or CDN links

### Extension-Specific Patterns

- **Manifest V3**: Use service workers for background scripts
- **Permissions**: Minimal required permissions in manifest
- **Cross-Browser**: Feature detection and graceful fallbacks
- **Alarms**: Use `browser.alarms` for timed operations
- **Navigation**: Intercept with `webNavigation.onBeforeNavigate`

### Code Organization

- Keep functions focused and single-purpose
- Use descriptive function names that explain behavior
- Group related functionality together
- Add JSDoc comments for complex functions
- Use consistent error logging patterns

### Performance Considerations

- Clean up expired passes regularly
- Use event listeners efficiently
- Minimize DOM queries and updates
- Debounce expensive operations where needed

## Development Workflow

1. Make changes to source files
2. Run `just build` or `just watch firefox` for development
3. Load extension in browser developer mode
4. Test functionality thoroughly
5. Run `just lint` before committing
6. Use semantic versioning for releases

## Philosophy

- **No Bullshit**: Direct, functional code without unnecessary abstractions
- **Brutalist Design**: Sharp corners, monospace fonts, high contrast
- **Minimal Dependencies**: Zero external dependencies
- **Cross-Browser**: Works identically in Firefox and Chrome
- **Privacy-First**: No analytics, no tracking, no data collection