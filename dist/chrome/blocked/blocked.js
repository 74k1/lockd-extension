const browser = globalThis.browser || globalThis.chrome;

const params = new URLSearchParams(window.location.search);
const originalUrl = params.get('url');
const domain = params.get('domain');
const mode = params.get('mode');
const rationMinutes = params.get('rationMinutes');
const passDuration = params.get('passDuration');

let siteConfig = null;
let config = null;
let originalHostname = '';
let waitingCountdownInterval = null; // Countdown interval for private waiting screen

// DOM Elements
const domainEl = document.getElementById('domain');
const chooseScreen = document.getElementById('choose-screen');
const waitingScreen = document.getElementById('waiting-screen');
const durationScreen = document.getElementById('duration-screen');
const blockedScreen = document.getElementById('blocked-screen');
const rationExpiredScreen = document.getElementById('ration-expired-screen');
const feelingsScreen = document.getElementById('feelings-screen');
const feelingsResponseScreen = document.getElementById('feelings-response-screen');

const workOnlyNotice = document.getElementById('work-only-notice');
const privateOnlyNotice = document.getElementById('private-only-notice');
const motivationalText = document.getElementById('motivational-text');
const sliderMinLabel = document.getElementById('slider-min-label');
const sliderMaxLabel = document.getElementById('slider-max-label');

const btnWork = document.getElementById('btn-work');
const btnPrivate = document.getElementById('btn-private');
const btnConfirm = document.getElementById('btn-confirm');
const btnBack = document.getElementById('btn-back');

// Ration expired elements
const rationMinutesEl = document.getElementById('ration-minutes');
const rationSiteNameEl = document.getElementById('ration-site-name');
const extraTimeSlider = document.getElementById('extra-time-slider');
const extraTimeValue = document.getElementById('extra-time-value');
const extraSliderMinLabel = document.getElementById('extra-slider-min-label');
const extraSliderMaxLabel = document.getElementById('extra-slider-max-label');
const btnAddTime = document.getElementById('btn-add-time');

// Feelings elements
const feelingsDurationEl = document.getElementById('feelings-duration');
const feelingsSiteNameEl = document.getElementById('feelings-site-name');
const feelingsResponseText = document.getElementById('feelings-response-text');
const btnFeelingsContinue = document.getElementById('btn-feelings-continue');

const waitingTimer = document.getElementById('waiting-timer');
const durationSlider = document.getElementById('duration-slider');
const durationValue = document.getElementById('duration-value');

// Feelings response messages
const FEELINGS_RESPONSES = {
  neutral: "You gained nothing. You lost nothing. Except time.",
  positive: "Congrats. You beat the algorithm. (This time.)",
  negative: "Shocker. Maybe remember this next time."
};

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

function getRandomLine() {
  return motivationalLines[Math.floor(Math.random() * motivationalLines.length)];
}

function showScreen(screenId) {
  chooseScreen.classList.remove('active');
  waitingScreen.classList.remove('active');
  durationScreen.classList.remove('active');
  blockedScreen.classList.remove('active');
  rationExpiredScreen.classList.remove('active');
  feelingsScreen.classList.remove('active');
  feelingsResponseScreen.classList.remove('active');
  
  const screen = document.getElementById(`${screenId}-screen`);
  if (screen) {
    screen.classList.add('active');
  }
}

async function init() {
  // Parse original URL to get hostname for display
  try {
    const urlObj = new URL(originalUrl);
    originalHostname = urlObj.hostname.replace(/^www\./, '');
  } catch (e) {
    originalHostname = domain || 'Unknown';
  }
  
  // Display the actual hostname (e.g., music.youtube.com)
  domainEl.textContent = originalHostname;
  
  // Set random motivational line
  if (motivationalText) {
    motivationalText.textContent = getRandomLine();
  }
  
  // Get config from background
  try {
    config = await browser.runtime.sendMessage({ action: 'getConfig' });
    siteConfig = await browser.runtime.sendMessage({ action: 'getSiteConfig', hostname: originalHostname });
  } catch (e) {
    console.error('[LOCKD] Failed to get config:', e);
    return;
  }
  
  if (!siteConfig) {
    // Site not configured, go back to original URL
    if (originalUrl) {
      window.location.href = originalUrl;
    } else {
      window.history.back();
    }
    return;
  }
  
  // Set slider range from config
  const min = config.privateDurationMin || 5;
  const max = config.privateDurationMax || 30;
  const def = config.privateDurationDefault || 15;
  
  if (durationSlider) {
    durationSlider.min = min;
    durationSlider.max = max;
    durationSlider.value = def;
    durationValue.textContent = def;
  }
  
  if (sliderMinLabel) sliderMinLabel.textContent = `${min} min`;
  if (sliderMaxLabel) sliderMaxLabel.textContent = `${max} min`;
  
  // Check if completely blocked
  if (mode === 'blocked' || siteConfig.blocked) {
    showScreen('blocked');
    return;
  }
  
  // Handle feelings screen (after private pass expires on rationed site)
  if (mode === 'feelings') {
    setupFeelingsScreen();
    showScreen('feelings');
    return;
  }
  
  // Handle ration expired screen
  if (mode === 'ration-expired') {
    setupRationExpiredScreen();
    showScreen('ration-expired');
    return;
  }
  
  // Configure button visibility based on site settings
  if (!siteConfig.work) {
    btnWork.classList.add('hidden');
    workOnlyNotice.classList.add('hidden');
    privateOnlyNotice.classList.remove('hidden');
  }
  
  if (!siteConfig.private) {
    btnPrivate.classList.add('hidden');
    privateOnlyNotice.classList.add('hidden');
    workOnlyNotice.classList.remove('hidden');
  }
  
  // Show choose screen
  showScreen('choose');
}

function setupRationExpiredScreen() {
  // Set ration minutes
  if (rationMinutesEl) {
    rationMinutesEl.textContent = rationMinutes || siteConfig.rationMinutes || '5';
  }
  
  // Set site name
  if (rationSiteNameEl) {
    rationSiteNameEl.textContent = siteConfig.name || originalHostname;
  }
  
  // Set extra time slider range from config
  const min = config.extraTimeMin || 1;
  const max = config.extraTimeMax || 60;
  const def = config.extraTimeDefault || 5;
  
  if (extraTimeSlider) {
    extraTimeSlider.min = min;
    extraTimeSlider.max = max;
    extraTimeSlider.value = def;
    extraTimeValue.textContent = def;
  }
  
  if (extraSliderMinLabel) extraSliderMinLabel.textContent = `${min} min`;
  if (extraSliderMaxLabel) extraSliderMaxLabel.textContent = `${max} min`;
}

function setupFeelingsScreen() {
  // Set duration
  if (feelingsDurationEl) {
    feelingsDurationEl.textContent = passDuration || '15';
  }
  
  // Set site name
  if (feelingsSiteNameEl) {
    feelingsSiteNameEl.textContent = siteConfig.name || originalHostname;
  }
}

// Work button - instant access
btnWork.addEventListener('click', async () => {
  if (!config || !siteConfig || !siteConfig.work) return;
  
  const duration = config.workDuration || 60;
  await grantAccessAndRedirect('work', duration);
});

// Private button - start waiting countdown
btnPrivate.addEventListener('click', () => {
  if (!config || !siteConfig || !siteConfig.private) return;
  
  startWaitingCountdown();
});

function startWaitingCountdown() {
  // Clear any existing countdown
  if (waitingCountdownInterval) {
    clearInterval(waitingCountdownInterval);
    waitingCountdownInterval = null;
  }
  
  showScreen('waiting');
  
  let seconds = config.privateDelay || 15;
  waitingTimer.textContent = seconds;
  
  waitingCountdownInterval = setInterval(() => {
    seconds--;
    waitingTimer.textContent = seconds;
    
    if (seconds <= 0) {
      clearInterval(waitingCountdownInterval);
      waitingCountdownInterval = null;
      showScreen('duration');
    }
  }, 1000);
}

// Duration slider
if (durationSlider) {
  durationSlider.addEventListener('input', () => {
    durationValue.textContent = durationSlider.value;
  });
}

// Confirm duration button
btnConfirm.addEventListener('click', async () => {
  const duration = parseInt(durationSlider.value);
  await grantAccessAndRedirect('private', duration);
});

async function grantAccessAndRedirect(type, duration) {
  try {
    // Grant pass for the base domain (from site config)
    // This allows all subdomains to work
    await browser.runtime.sendMessage({
      action: 'grantPass',
      domain: siteConfig.domain,
      type,
      duration
    });
    
    // Redirect to original URL (preserving full path, query, subdomain, etc.)
    if (originalUrl) {
      window.location.href = originalUrl;
    } else {
      // Fallback to just the hostname
      window.location.href = `https://${originalHostname}`;
    }
  } catch (e) {
    console.error('[LOCKD] Failed to grant pass:', e);
  }
}

// Back button
btnBack.addEventListener('click', () => {
  if (waitingCountdownInterval) {
    clearInterval(waitingCountdownInterval);
    waitingCountdownInterval = null;
  }
  window.history.back();
});

// Extra time slider
if (extraTimeSlider) {
  extraTimeSlider.addEventListener('input', () => {
    extraTimeValue.textContent = extraTimeSlider.value;
    // Clear active state from preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.minutes === extraTimeSlider.value) {
        btn.classList.add('active');
      }
    });
  });
}

// Preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const minutes = parseInt(btn.dataset.minutes);
    if (extraTimeSlider) {
      // Clamp to slider range
      const min = parseInt(extraTimeSlider.min);
      const max = parseInt(extraTimeSlider.max);
      const clampedMinutes = Math.max(min, Math.min(max, minutes));
      
      extraTimeSlider.value = clampedMinutes;
      extraTimeValue.textContent = clampedMinutes;
    }
    // Update active state
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Add Time button
if (btnAddTime) {
  btnAddTime.addEventListener('click', async () => {
    const minutes = parseInt(extraTimeSlider?.value) || 5;
    
    try {
      console.log(`[LOCKD] Granting overtime: ${siteConfig.domain} for ${minutes} minutes`);
      const result = await browser.runtime.sendMessage({
        action: 'grantOvertime',
        domain: siteConfig.domain,
        minutes: minutes
      });
      console.log('[LOCKD] Overtime grant result:', result);
      
      // Small delay to ensure storage is synced
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Redirect to original URL
      const redirectUrl = originalUrl || `https://${originalHostname}`;
      console.log('[LOCKD] Redirecting to:', redirectUrl);
      window.location.href = redirectUrl;
    } catch (e) {
      console.error('[LOCKD] Failed to grant overtime:', e);
    }
  });
}

// Feelings buttons
document.querySelectorAll('.feeling-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const feeling = btn.dataset.feeling;
    
    // Log the feeling
    try {
      await browser.runtime.sendMessage({
        action: 'logFeeling',
        domain: siteConfig.domain,
        feeling: feeling,
        durationMinutes: parseInt(passDuration) || 0
      });
    } catch (e) {
      console.error('[LOCKD] Failed to log feeling:', e);
    }
    
    // Show response
    if (feelingsResponseText) {
      feelingsResponseText.textContent = FEELINGS_RESPONSES[feeling] || '';
    }
    
    showScreen('feelings-response');
  });
});

// Feelings continue button
if (btnFeelingsContinue) {
  btnFeelingsContinue.addEventListener('click', () => {
    // After feelings, show the ration-expired screen to offer work/private
    setupRationExpiredScreen();
    showScreen('ration-expired');
  });
}

// Initialize
init();
