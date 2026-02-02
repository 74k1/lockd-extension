# Default recipe - show available commands
default:
    @just --list

# Clean build directory
clean:
    rm -rf dist

# Create directory structure
setup:
    mkdir -p dist/firefox dist/chrome

# Copy common files to a target
_copy target:
    cp background.js dist/{{target}}/
    cp -r popup dist/{{target}}/
    cp -r blocked dist/{{target}}/
    cp -r options dist/{{target}}/
    cp -r analytics dist/{{target}}/
    cp -r styles dist/{{target}}/
    cp -r icons dist/{{target}}/
    cp -r content dist/{{target}}/

# Build Firefox extension
build-firefox: setup
    just _copy firefox
    cp manifest.json dist/firefox/manifest.json

# Build Chrome extension
build-chrome: setup
    just _copy chrome
    cp manifest.chrome.json dist/chrome/manifest.json

# Build both extensions
build: clean build-firefox build-chrome
    @echo "Build complete!"

# Package Firefox extension
package-firefox: build-firefox
    cd dist/firefox && zip -r ../lockd-firefox.zip .
    @echo "Packaged: dist/lockd-firefox.zip"

# Package Chrome extension
package-chrome: build-chrome
    cd dist/chrome && zip -r ../lockd-chrome.zip .
    @echo "Packaged: dist/lockd-chrome.zip"

# Package both extensions
package: clean build-firefox build-chrome package-firefox package-chrome
    @echo ""
    @echo "Packages ready:"
    @echo "  Firefox: dist/lockd-firefox.zip"
    @echo "  Chrome:  dist/lockd-chrome.zip"

# Dev: Load Firefox extension (opens about:debugging)
dev-firefox: build-firefox
    @echo "Load extension from: dist/firefox"
    @echo "Opening Firefox debugging page..."
    firefox "about:debugging#/runtime/this-firefox" &

# Dev: Load Chrome extension (opens extensions page)
dev-chrome: build-chrome
    @echo "Load extension from: dist/chrome"
    @echo "Opening Chrome extensions page..."
    google-chrome "chrome://extensions" &

# Watch for changes and rebuild (requires watchexec)
watch target="firefox":
    watchexec -e js,html,css,json -w . -w Justfile --ignore dist "just build-{{target}}"

# Bump version (usage: just bump 1.0.1)
bump version:
    sed -i '' 's/"version": "[^"]*"/"version": "{{version}}"/' manifest.json
    sed -i '' 's/"version": "[^"]*"/"version": "{{version}}"/' manifest.chrome.json
    @echo "Version bumped to {{version}}"

# Show current version
version:
    @grep '"version"' manifest.json | head -1 | sed 's/.*: "\(.*\)".*/\1/'

# Lint (requires web-ext)
lint: build-firefox
    cd dist/firefox && web-ext lint

# Validate icons exist and are correct size (requires imagemagick)
check-icons:
    @echo "Checking icons..."
    @identify icons/icon16.png 2>/dev/null | grep -q "16x16" && echo "  icon16.png: OK" || echo "  icon16.png: MISSING or WRONG SIZE"
    @identify icons/icon48.png 2>/dev/null | grep -q "48x48" && echo "  icon48.png: OK" || echo "  icon48.png: MISSING or WRONG SIZE"
    @identify icons/icon128.png 2>/dev/null | grep -q "128x128" && echo "  icon128.png: OK" || echo "  icon128.png: MISSING or WRONG SIZE"
