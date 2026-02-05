// LOCKD Content Script - Overlay Blocker
// Injects blocking overlay instead of navigating away

// Guard against multiple injections (Chrome re-injects scripts)
if (window.__lockdBlockerLoaded) {
  // Script already loaded, just exit
} else {
  window.__lockdBlockerLoaded = true;

const browser = globalThis.browser || globalThis.chrome;

// State
let overlay = null;
let config = null;
let siteConfig = null;
let currentMode = null;
let originalUrl = window.location.href;
let currentFeeling = null;
let canGoBack = false; // Whether there's history to go back to
let referrerWouldBeBlocked = false; // Whether going back would hit the same blocked site

// Motivational lines
const motivationalLines = [
  "Lock in.",
  "Stay focused.",
  "Build something great.",
  "Deep work wins.",
  "Distractions are the enemy.",
  "You know why you're here.",
  "Future you will thank you.",
  "Stay on target.",
  "Discipline equals freedom.",
  "The grind doesn't stop.",
  "Execute.",
  "Less scrolling, more building.",
  "Your goals won't chase themselves.",
  "Focus is a superpower.",
  "Make it count.",
  "Time is finite.",
  "Choose wisely.",
  "What would your best self do?",
  "This can wait.",
  "Get back to work.",
];

const FEELINGS_RESPONSES = {
  neutral: "You gained nothing. You lost nothing. Except time.",
  positive: "Congrats. You beat the algorithm. (This time.)",
  negative: "Shocker. Maybe remember this next time."
};

function getRandomLine() {
  return motivationalLines[Math.floor(Math.random() * motivationalLines.length)];
}

// Check if the referrer URL matches the same blocked site
// If so, going back would just land on another blocked page
function checkReferrerWouldBeBlocked() {
  // For SPA sites like YouTube, document.referrer doesn't update on navigation
  // So we check if the current site is rationed/blocked - if so, going back
  // within the same site would likely hit another blocked page
  
  // If we're on a rationed site with exhausted budget, going back would be blocked too
  if (siteConfig && (siteConfig.blocked || (siteConfig.ration && currentMode === 'ration-expired'))) {
    // Check referrer if available
    if (document.referrer) {
      try {
        const referrerUrl = new URL(document.referrer);
        const referrerHostname = referrerUrl.hostname.replace(/^www\./, '');
        
        // Check if referrer matches the same site config
        const siteMatch = siteConfig.match || 'base';
        
        switch (siteMatch) {
          case 'exact':
            if (referrerHostname === siteConfig.domain) return true;
            break;
          
          case 'regex':
            try {
              const regex = new RegExp(siteConfig.domain);
              if (regex.test(referrerHostname)) return true;
            } catch (e) {
              // Invalid regex
            }
            break;
          
          case 'base':
          default:
            if (referrerHostname === siteConfig.domain || 
                referrerHostname.endsWith('.' + siteConfig.domain)) {
              return true;
            }
        }
      } catch (e) {
        // Invalid referrer URL
      }
    }
    
    // For SPAs: if no referrer or different site, check if this looks like internal navigation
    // YouTube Shorts, clicking videos, etc. - history entries are same-site
    // We can detect this by checking if the navigation type suggests same-site
    if (window.performance && window.performance.navigation) {
      // TYPE_BACK_FORWARD = 2, which means user used back/forward
      // In that case, previous page was likely same site
    }
    
    // Conservative approach for rationed/blocked sites:
    // If we're on a rationed site with no budget, assume going back stays on same site
    // This is safer - user can always close tab if needed
    return true;
  }
  
  return false;
}

// Pause all videos and audio on the page
let mediaPauseInterval = null;

function pauseAllMedia() {
  // Pause all video elements
  document.querySelectorAll('video').forEach(video => {
    try {
      video.pause();
      video.muted = true;
    } catch (e) {
      // Ignore errors
    }
  });
  
  // Pause all audio elements
  document.querySelectorAll('audio').forEach(audio => {
    try {
      audio.pause();
      audio.muted = true;
    } catch (e) {
      // Ignore errors
    }
  });
  
  // YouTube specific: try to pause via their player API
  try {
    const ytPlayer = document.querySelector('#movie_player');
    if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
      ytPlayer.pauseVideo();
    }
  } catch (e) {
    // Ignore
  }
}

function startMediaPausing() {
  // Pause immediately
  pauseAllMedia();
  
  // Keep pausing every 100ms to catch dynamically loaded videos (YouTube Shorts, etc.)
  if (mediaPauseInterval) {
    clearInterval(mediaPauseInterval);
  }
  mediaPauseInterval = setInterval(pauseAllMedia, 100);
}

function stopMediaPausing() {
  if (mediaPauseInterval) {
    clearInterval(mediaPauseInterval);
    mediaPauseInterval = null;
  }
  
  // Unmute videos when overlay is removed
  document.querySelectorAll('video').forEach(video => {
    try {
      video.muted = false;
    } catch (e) {
      // Ignore
    }
  });
  document.querySelectorAll('audio').forEach(audio => {
    try {
      audio.muted = false;
    } catch (e) {
      // Ignore
    }
  });
}

// Create the overlay element
function createOverlay() {
  if (overlay) return overlay;
  
  overlay = document.createElement('div');
  overlay.id = 'lockd-overlay';
  
  const hostname = window.location.hostname.replace(/^www\./, '');
  
  // Helper to create elements with classes and text
  const el = (tag, className, text) => {
    const elem = document.createElement(tag);
    if (className) elem.className = className;
    if (text) elem.textContent = text;
    return elem;
  };
  
  // Helper to create button with data attributes
  const btn = (className, dataAttr, dataValue, text) => {
    const button = el('button', className, text);
    button.setAttribute(`data-${dataAttr}`, dataValue);
    return button;
  };
  
  // Main container
  const container = el('div', 'lockd-container');
  
  // Logo and domain
  container.appendChild(el('div', 'lockd-logo', 'LOCKD'));
  container.appendChild(el('div', 'lockd-domain', hostname));
  
  // === Choose Screen ===
  const chooseScreen = el('div', 'lockd-screen lockd-choose-screen');
  chooseScreen.appendChild(el('div', 'lockd-motivational', getRandomLine()));
  chooseScreen.appendChild(el('div', 'lockd-notice lockd-work-only hidden', 'Work access only for this site'));
  chooseScreen.appendChild(el('div', 'lockd-notice lockd-private-only hidden', 'Private access only for this site'));
  
  const chooseButtons = el('div', 'lockd-buttons');
  chooseButtons.appendChild(btn('lockd-btn lockd-btn-work', 'action', 'work', 'Work'));
  chooseButtons.appendChild(btn('lockd-btn lockd-btn-private', 'action', 'private', 'Private'));
  chooseScreen.appendChild(chooseButtons);
  container.appendChild(chooseScreen);
  
  // === Waiting Screen ===
  const waitingScreen = el('div', 'lockd-screen lockd-waiting-screen');
  waitingScreen.appendChild(el('div', 'lockd-timer', '15'));
  waitingScreen.appendChild(el('div', 'lockd-waiting-text', 'Patience is a virtue...'));
  container.appendChild(waitingScreen);
  
  // === Duration Screen ===
  const durationScreen = el('div', 'lockd-screen lockd-duration-screen');
  
  const durationSliderContainer = el('div', 'lockd-slider-container');
  const durationSliderValue = el('div', 'lockd-slider-value private');
  const durationValueSpan = el('span', 'lockd-duration-value', '15');
  durationSliderValue.appendChild(durationValueSpan);
  durationSliderValue.appendChild(document.createTextNode(' min'));
  durationSliderContainer.appendChild(durationSliderValue);
  
  const durationLabels = el('div', 'lockd-slider-labels');
  durationLabels.appendChild(el('span', 'lockd-slider-min', '5 min'));
  durationLabels.appendChild(el('span', 'lockd-slider-max', '30 min'));
  durationSliderContainer.appendChild(durationLabels);
  
  const durationSlider = document.createElement('input');
  durationSlider.type = 'range';
  durationSlider.className = 'lockd-slider lockd-duration-slider';
  durationSlider.min = '5';
  durationSlider.max = '30';
  durationSlider.value = '15';
  durationSliderContainer.appendChild(durationSlider);
  durationScreen.appendChild(durationSliderContainer);
  
  const durationButtons = el('div', 'lockd-buttons');
  durationButtons.appendChild(btn('lockd-btn lockd-btn-back', 'action', 'back', 'Back'));
  durationButtons.appendChild(btn('lockd-btn lockd-btn-confirm', 'action', 'confirm-private', 'Confirm'));
  durationScreen.appendChild(durationButtons);
  container.appendChild(durationScreen);
  
  // === Ration Expired Screen ===
  const rationScreen = el('div', 'lockd-screen lockd-ration-expired-screen');
  
  const rationInfo = el('div', 'lockd-ration-info');
  rationInfo.appendChild(document.createTextNode('Your '));
  rationInfo.appendChild(el('span', 'lockd-ration-minutes', '5'));
  rationInfo.appendChild(document.createTextNode(' minute ration for '));
  rationInfo.appendChild(el('span', 'lockd-site-name', hostname));
  rationInfo.appendChild(document.createTextNode(' has been used.'));
  rationScreen.appendChild(rationInfo);
  
  const overtimeSliderContainer = el('div', 'lockd-slider-container');
  const overtimeSliderValue = el('div', 'lockd-slider-value overtime');
  const overtimeValueSpan = el('span', 'lockd-overtime-value', '5');
  overtimeSliderValue.appendChild(overtimeValueSpan);
  overtimeSliderValue.appendChild(document.createTextNode(' min'));
  overtimeSliderContainer.appendChild(overtimeSliderValue);
  
  const overtimeLabels = el('div', 'lockd-slider-labels');
  overtimeLabels.appendChild(el('span', 'lockd-overtime-slider-min', '1 min'));
  overtimeLabels.appendChild(el('span', 'lockd-overtime-slider-max', '60 min'));
  overtimeSliderContainer.appendChild(overtimeLabels);
  
  const overtimeSlider = document.createElement('input');
  overtimeSlider.type = 'range';
  overtimeSlider.className = 'lockd-slider lockd-overtime-slider';
  overtimeSlider.min = '1';
  overtimeSlider.max = '60';
  overtimeSlider.value = '5';
  overtimeSliderContainer.appendChild(overtimeSlider);
  rationScreen.appendChild(overtimeSliderContainer);
  
  const presets = el('div', 'lockd-presets');
  const presetValues = [1, 5, 10, 15, 30];
  presetValues.forEach(mins => {
    const presetBtn = btn('lockd-preset-btn' + (mins === 5 ? ' active' : ''), 'minutes', mins.toString(), `${mins}m`);
    presets.appendChild(presetBtn);
  });
  rationScreen.appendChild(presets);
  
  const rationButtons = el('div', 'lockd-buttons');
  rationButtons.appendChild(btn('lockd-btn lockd-btn-back lockd-nav-btn', 'action', 'navigate-away', 'Go Back'));
  rationButtons.appendChild(btn('lockd-btn lockd-btn-overtime', 'action', 'add-overtime', 'Add Time'));
  rationScreen.appendChild(rationButtons);
  container.appendChild(rationScreen);
  
  // === Feelings Screen ===
  const feelingsScreen = el('div', 'lockd-screen lockd-feelings-screen');
  
  const feelingsQuestion = el('div', 'lockd-feelings-question');
  feelingsQuestion.appendChild(document.createTextNode('How do you feel after spending '));
  feelingsQuestion.appendChild(el('span', 'lockd-feelings-duration', '15'));
  feelingsQuestion.appendChild(document.createTextNode(' minutes on '));
  feelingsQuestion.appendChild(el('span', 'lockd-feelings-site', hostname));
  feelingsQuestion.appendChild(document.createTextNode('?'));
  feelingsScreen.appendChild(feelingsQuestion);
  
  const feelingsButtons = el('div', 'lockd-feelings-buttons');
  feelingsButtons.appendChild(btn('lockd-feeling-btn', 'feeling', 'positive', 'Worth it'));
  feelingsButtons.appendChild(btn('lockd-feeling-btn', 'feeling', 'neutral', 'Meh'));
  feelingsButtons.appendChild(btn('lockd-feeling-btn', 'feeling', 'negative', 'Regret'));
  feelingsScreen.appendChild(feelingsButtons);
  container.appendChild(feelingsScreen);
  
  // === Feelings Response Screen ===
  const feelingsResponseScreen = el('div', 'lockd-screen lockd-feelings-response-screen');
  feelingsResponseScreen.appendChild(el('div', 'lockd-feelings-response'));
  const feelingsResponseButtons = el('div', 'lockd-buttons');
  feelingsResponseButtons.appendChild(btn('lockd-btn lockd-btn-confirm', 'action', 'feelings-continue', 'Continue'));
  feelingsResponseScreen.appendChild(feelingsResponseButtons);
  container.appendChild(feelingsResponseScreen);
  
  // === Blocked Screen ===
  const blockedScreen = el('div', 'lockd-screen lockd-blocked-screen');
  blockedScreen.appendChild(el('div', 'lockd-blocked-text', 'ACCESS BLOCKED'));
  blockedScreen.appendChild(el('div', 'lockd-blocked-reason', 'This site has been completely blocked.'));
  const blockedButtons = el('div', 'lockd-buttons');
  blockedButtons.appendChild(btn('lockd-btn lockd-btn-back lockd-nav-btn', 'action', 'navigate-away', 'Go Back'));
  blockedScreen.appendChild(blockedButtons);
  container.appendChild(blockedScreen);
  
  // Append container to overlay
  overlay.appendChild(container);
  
  // Add event listeners
  setupEventListeners();
  
  return overlay;
}

function setupEventListeners() {
  if (!overlay) return;
  
  // Button clicks
  overlay.addEventListener('click', async (e) => {
    const action = e.target.dataset?.action;
    const feeling = e.target.dataset?.feeling;
    const minutes = e.target.dataset?.minutes;
    
    if (action) {
      await handleAction(action);
    } else if (feeling) {
      await handleFeeling(feeling);
    } else if (minutes) {
      handlePresetClick(parseInt(minutes));
    }
  });
  
  // Duration slider
  const durationSlider = overlay.querySelector('.lockd-duration-slider');
  if (durationSlider) {
    durationSlider.addEventListener('input', () => {
      overlay.querySelector('.lockd-duration-value').textContent = durationSlider.value;
    });
  }
  
  // Overtime slider
  const overtimeSlider = overlay.querySelector('.lockd-overtime-slider');
  if (overtimeSlider) {
    overtimeSlider.addEventListener('input', () => {
      overlay.querySelector('.lockd-overtime-value').textContent = overtimeSlider.value;
      updatePresetButtons(parseInt(overtimeSlider.value));
    });
  }
}

function updatePresetButtons(value) {
  const presets = overlay.querySelectorAll('.lockd-preset-btn');
  presets.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.minutes) === value);
  });
}

function handlePresetClick(minutes) {
  const slider = overlay.querySelector('.lockd-overtime-slider');
  if (slider) {
    const min = parseInt(slider.min);
    const max = parseInt(slider.max);
    const clamped = Math.max(min, Math.min(max, minutes));
    slider.value = clamped;
    overlay.querySelector('.lockd-overtime-value').textContent = clamped;
    updatePresetButtons(clamped);
  }
}

async function handleAction(action) {
  switch (action) {
    case 'work':
      await grantPassAndClose('work', config.workDuration || 30);
      break;
      
    case 'private':
      showScreen('waiting');
      startWaitingCountdown();
      break;
      
    case 'back':
      showScreen('choose');
      break;
      
    case 'confirm-private':
      const duration = parseInt(overlay.querySelector('.lockd-duration-slider').value);
      await grantPassAndClose('private', duration);
      break;
      
    case 'add-overtime':
      const overtimeMinutes = parseInt(overlay.querySelector('.lockd-overtime-slider').value);
      await grantOvertimeAndClose(overtimeMinutes);
      break;
      
    case 'navigate-away':
      if (canGoBack) {
        // Try to go back, but set a fallback in case it doesn't work
        const currentUrl = window.location.href;
        window.history.back();
        
        // If we're still on the same page after a short delay, close the tab
        setTimeout(async () => {
          if (window.location.href === currentUrl) {
            try {
              await browser.runtime.sendMessage({ action: 'closeCurrentTab' });
            } catch (e) {
              window.close();
            }
          }
        }, 100);
      } else {
        // Ask background to close this tab
        try {
          await browser.runtime.sendMessage({ action: 'closeCurrentTab' });
        } catch (e) {
          // Fallback: try to close directly (may not work in all contexts)
          window.close();
        }
      }
      break;
      
    case 'feelings-continue':
      // Show ration-expired screen after feelings
      setupRationExpiredScreen();
      showScreen('ration-expired');
      break;
  }
}

async function handleFeeling(feeling) {
  currentFeeling = feeling;
  
  // Log the feeling
  try {
    await browser.runtime.sendMessage({
      action: 'logFeeling',
      domain: siteConfig.domain,
      feeling: feeling,
      durationMinutes: parseInt(overlay.querySelector('.lockd-feelings-duration')?.textContent) || 0
    });
  } catch (e) {
    console.error('[LOCKD] Failed to log feeling:', e);
  }
  
  // Show response
  const responseText = overlay.querySelector('.lockd-feelings-response');
  if (responseText) {
    responseText.textContent = FEELINGS_RESPONSES[feeling] || '';
  }
  
  showScreen('feelings-response');
}

function startWaitingCountdown() {
  let seconds = config.privateDelay || 15;
  const timerEl = overlay.querySelector('.lockd-timer');
  timerEl.textContent = seconds;
  
  const interval = setInterval(() => {
    seconds--;
    timerEl.textContent = seconds;
    
    if (seconds <= 0) {
      clearInterval(interval);
      showScreen('duration');
    }
  }, 1000);
}

async function grantPassAndClose(type, duration) {
  try {
    await browser.runtime.sendMessage({
      action: 'grantPass',
      domain: siteConfig.domain,
      type,
      duration
    });
    
    removeOverlay();
  } catch (e) {
    console.error('[LOCKD] Failed to grant pass:', e);
  }
}

async function grantOvertimeAndClose(minutes) {
  try {
    await browser.runtime.sendMessage({
      action: 'grantOvertime',
      domain: siteConfig.domain,
      minutes: minutes
    });
    
    removeOverlay();
  } catch (e) {
    console.error('[LOCKD] Failed to grant overtime:', e);
  }
}

function showScreen(screenName) {
  const screens = overlay.querySelectorAll('.lockd-screen');
  screens.forEach(screen => screen.classList.remove('active'));
  
  const target = overlay.querySelector(`.lockd-${screenName}-screen`);
  if (target) {
    target.classList.add('active');
  }
}

function setupChooseScreen() {
  const workBtn = overlay.querySelector('.lockd-btn-work');
  const privateBtn = overlay.querySelector('.lockd-btn-private');
  const workNotice = overlay.querySelector('.lockd-work-only');
  const privateNotice = overlay.querySelector('.lockd-private-only');
  
  // Configure button visibility
  if (!siteConfig.work) {
    workBtn.classList.add('hidden');
    workNotice.classList.add('hidden');
    privateNotice.classList.remove('hidden');
  }
  
  if (!siteConfig.private) {
    privateBtn.classList.add('hidden');
    privateNotice.classList.add('hidden');
    workNotice.classList.remove('hidden');
  }
  
  // Set slider ranges
  const durationSlider = overlay.querySelector('.lockd-duration-slider');
  const min = config.privateDurationMin || 5;
  const max = config.privateDurationMax || 30;
  const def = config.privateDurationDefault || 15;
  
  durationSlider.min = min;
  durationSlider.max = max;
  durationSlider.value = def;
  overlay.querySelector('.lockd-duration-value').textContent = def;
  overlay.querySelector('.lockd-slider-min').textContent = `${min} min`;
  overlay.querySelector('.lockd-slider-max').textContent = `${max} min`;
}

function setupRationExpiredScreen() {
  const rationMinutesEl = overlay.querySelector('.lockd-ration-minutes');
  const siteNameEl = overlay.querySelector('.lockd-site-name');
  
  if (rationMinutesEl) {
    rationMinutesEl.textContent = siteConfig.rationMinutes || 5;
  }
  if (siteNameEl) {
    siteNameEl.textContent = siteConfig.name || window.location.hostname.replace(/^www\./, '');
  }
  
  // Set overtime slider range
  const overtimeSlider = overlay.querySelector('.lockd-overtime-slider');
  const min = config.extraTimeMin || 1;
  const max = config.extraTimeMax || 60;
  const def = config.extraTimeDefault || 5;
  
  overtimeSlider.min = min;
  overtimeSlider.max = max;
  overtimeSlider.value = def;
  overlay.querySelector('.lockd-overtime-value').textContent = def;
  overlay.querySelector('.lockd-overtime-slider-min').textContent = `${min} min`;
  overlay.querySelector('.lockd-overtime-slider-max').textContent = `${max} min`;
}

function setupFeelingsScreen(passDuration) {
  const durationEl = overlay.querySelector('.lockd-feelings-duration');
  const siteEl = overlay.querySelector('.lockd-feelings-site');
  
  if (durationEl) {
    durationEl.textContent = passDuration || '15';
  }
  if (siteEl) {
    siteEl.textContent = siteConfig.name || window.location.hostname.replace(/^www\./, '');
  }
}

function showOverlay(mode, options = {}) {
  currentMode = mode;
  
  // Create overlay if not exists
  if (!overlay) {
    createOverlay();
  }
  
  // Prevent scrolling on the page behind the overlay
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  
  // Check if we can go back
  // history.length is unreliable (often > 1 even for new tabs)
  // Better signals: document.referrer being empty means likely no previous page
  const hasReferrer = !!document.referrer;
  const hasHistory = window.history.length > 1;
  
  // Check if referrer is from the same site (would also be blocked)
  referrerWouldBeBlocked = checkReferrerWouldBeBlocked();
  
  // Can only meaningfully go back if there's a referrer, history, AND it wouldn't be blocked
  // No referrer = likely new tab or direct navigation = nothing to go back to
  canGoBack = hasReferrer && hasHistory && !referrerWouldBeBlocked;
  
  // Update navigation buttons text based on whether we can go back
  updateNavigationButtons();
  
  // Pause all media (videos, audio) aggressively
  startMediaPausing();
  
  // Setup based on mode
  switch (mode) {
    case 'choose':
      setupChooseScreen();
      showScreen('choose');
      break;
      
    case 'ration-expired':
      setupRationExpiredScreen();
      showScreen('ration-expired');
      break;
      
    case 'feelings':
      setupFeelingsScreen(options.passDuration);
      showScreen('feelings');
      break;
      
    case 'blocked':
      showScreen('blocked');
      break;
  }
  
  // Add to page
  if (!document.body.contains(overlay)) {
    document.body.appendChild(overlay);
  }
}

function updateNavigationButtons() {
  if (!overlay) return;
  
  const navButtons = overlay.querySelectorAll('.lockd-nav-btn');
  navButtons.forEach(btn => {
    if (canGoBack) {
      btn.textContent = 'Go Back';
    } else {
      btn.textContent = 'Exit';
    }
  });
}

function removeOverlay() {
  // Stop the media pausing interval and unmute
  stopMediaPausing();
  
  // Restore scrolling on the page
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
  overlay = null;
}

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showBlockOverlay') {
    config = message.config;
    siteConfig = message.siteConfig;
    showOverlay(message.mode, message.options || {});
    sendResponse({ success: true });
  } else if (message.action === 'removeBlockOverlay') {
    removeOverlay();
    sendResponse({ success: true });
  }
  return true;
});

// Check if we should show overlay on page load (in case background didn't catch it)
async function checkOnLoad() {
  try {
    const hostname = window.location.hostname.replace(/^www\./, '');
    
    // Get site config
    siteConfig = await browser.runtime.sendMessage({ 
      action: 'getSiteConfig', 
      hostname: hostname 
    });
    
    if (!siteConfig) return;
    
    // Get general config
    config = await browser.runtime.sendMessage({ action: 'getConfig' });
    
    if (!config || !config.enabled) return;
    
    // Check if completely blocked
    if (siteConfig.blocked) {
      showOverlay('blocked');
      return;
    }
    
    // Check for active pass
    const hasPass = await browser.runtime.sendMessage({ 
      action: 'getPass', 
      domain: siteConfig.domain 
    });
    
    if (hasPass) return;
    
    // Check ration mode
    if (siteConfig.ration) {
      const usage = await browser.runtime.sendMessage({ 
        action: 'getRationUsage', 
        domain: siteConfig.domain 
      });
      
      if (usage && usage.isExhausted) {
        showOverlay('ration-expired');
        return;
      }
      
      // Has budget - don't block
      return;
    }
    
    // Standard pass mode - show choose
    showOverlay('choose');
    
  } catch (e) {
    console.error('[LOCKD] Error checking on load:', e);
  }
}

// Don't auto-check on load - let background script handle it
// This avoids double-blocking issues
// checkOnLoad();

} // End of guard block
