// LOCKD Content Script - Overlay Blocker
// Injects blocking overlay instead of navigating away

const browser = globalThis.browser || globalThis.chrome;

// State
let overlay = null;
let config = null;
let siteConfig = null;
let currentMode = null;
let originalUrl = window.location.href;
let currentFeeling = null;
let canGoBack = false; // Whether there's history to go back to

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

// Pause all videos on the page
function pauseVideos() {
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    try {
      if (!video.paused) {
        video.pause();
      }
    } catch (e) {
      // Ignore errors
    }
  });
}

// Create the overlay element
function createOverlay() {
  if (overlay) return overlay;
  
  overlay = document.createElement('div');
  overlay.id = 'lockd-overlay';
  
  const hostname = window.location.hostname.replace(/^www\./, '');
  
  overlay.innerHTML = `
    <div class="lockd-container">
      <div class="lockd-logo">LOCKD</div>
      <div class="lockd-domain">${hostname}</div>
      
      <!-- Choose Screen -->
      <div class="lockd-screen lockd-choose-screen">
        <div class="lockd-motivational">${getRandomLine()}</div>
        <div class="lockd-notice lockd-work-only hidden">Work access only for this site</div>
        <div class="lockd-notice lockd-private-only hidden">Private access only for this site</div>
        <div class="lockd-buttons">
          <button class="lockd-btn lockd-btn-work" data-action="work">Work</button>
          <button class="lockd-btn lockd-btn-private" data-action="private">Private</button>
        </div>
      </div>
      
      <!-- Waiting Screen -->
      <div class="lockd-screen lockd-waiting-screen">
        <div class="lockd-timer">15</div>
        <div class="lockd-waiting-text">Patience is a virtue...</div>
      </div>
      
      <!-- Duration Screen -->
      <div class="lockd-screen lockd-duration-screen">
        <div class="lockd-slider-container">
          <div class="lockd-slider-value private"><span class="lockd-duration-value">15</span> min</div>
          <div class="lockd-slider-labels">
            <span class="lockd-slider-min">5 min</span>
            <span class="lockd-slider-max">30 min</span>
          </div>
          <input type="range" class="lockd-slider lockd-duration-slider" min="5" max="30" value="15">
        </div>
        <div class="lockd-buttons">
          <button class="lockd-btn lockd-btn-back" data-action="back">Back</button>
          <button class="lockd-btn lockd-btn-confirm" data-action="confirm-private">Confirm</button>
        </div>
      </div>
      
      <!-- Ration Expired Screen -->
      <div class="lockd-screen lockd-ration-expired-screen">
        <div class="lockd-ration-info">
          Your <span class="lockd-ration-minutes">5</span> minute ration for <span class="lockd-site-name">${hostname}</span> has been used.
        </div>
        <div class="lockd-slider-container">
          <div class="lockd-slider-value overtime"><span class="lockd-overtime-value">5</span> min</div>
          <div class="lockd-slider-labels">
            <span class="lockd-overtime-slider-min">1 min</span>
            <span class="lockd-overtime-slider-max">60 min</span>
          </div>
          <input type="range" class="lockd-slider lockd-overtime-slider" min="1" max="60" value="5">
        </div>
        <div class="lockd-presets">
          <button class="lockd-preset-btn" data-minutes="1">1m</button>
          <button class="lockd-preset-btn active" data-minutes="5">5m</button>
          <button class="lockd-preset-btn" data-minutes="10">10m</button>
          <button class="lockd-preset-btn" data-minutes="15">15m</button>
          <button class="lockd-preset-btn" data-minutes="30">30m</button>
        </div>
        <div class="lockd-buttons">
          <button class="lockd-btn lockd-btn-back lockd-nav-btn" data-action="navigate-away">Go Back</button>
          <button class="lockd-btn lockd-btn-overtime" data-action="add-overtime">Add Time</button>
        </div>
      </div>
      
      <!-- Feelings Screen -->
      <div class="lockd-screen lockd-feelings-screen">
        <div class="lockd-feelings-question">How do you feel after spending <span class="lockd-feelings-duration">15</span> minutes on <span class="lockd-feelings-site">${hostname}</span>?</div>
        <div class="lockd-feelings-buttons">
          <button class="lockd-feeling-btn" data-feeling="positive">Worth it</button>
          <button class="lockd-feeling-btn" data-feeling="neutral">Meh</button>
          <button class="lockd-feeling-btn" data-feeling="negative">Regret</button>
        </div>
      </div>
      
      <!-- Feelings Response Screen -->
      <div class="lockd-screen lockd-feelings-response-screen">
        <div class="lockd-feelings-response"></div>
        <div class="lockd-buttons">
          <button class="lockd-btn lockd-btn-confirm" data-action="feelings-continue">Continue</button>
        </div>
      </div>
      
      <!-- Blocked Screen -->
      <div class="lockd-screen lockd-blocked-screen">
        <div class="lockd-blocked-text">ACCESS BLOCKED</div>
        <div class="lockd-blocked-reason">This site has been completely blocked.</div>
        <div class="lockd-buttons">
          <button class="lockd-btn lockd-btn-back lockd-nav-btn" data-action="navigate-away">Go Back</button>
        </div>
      </div>
    </div>
  `;
  
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
        window.history.back();
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
  
  // Check if we can go back (history length > 1 means there's a previous page)
  // Also check if we came from a different origin
  canGoBack = window.history.length > 1;
  
  // Update navigation buttons text based on whether we can go back
  updateNavigationButtons();
  
  // Pause videos
  pauseVideos();
  
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
      btn.textContent = 'Close Tab';
    }
  });
}

function removeOverlay() {
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
