// LOCKD - Blocked Page Script

const browser = globalThis.browser || globalThis.chrome;

const params = new URLSearchParams(window.location.search);
const domain = params.get('domain');
const mode = params.get('mode');

let siteConfig = null;
let config = null;

// DOM Elements
const domainEl = document.getElementById('domain');
const chooseScreen = document.getElementById('choose-screen');
const waitingScreen = document.getElementById('waiting-screen');
const durationScreen = document.getElementById('duration-screen');
const blockedScreen = document.getElementById('blocked-screen');
const workOnlyNotice = document.getElementById('work-only-notice');
const privateOnlyNotice = document.getElementById('private-only-notice');
const motivationalText = document.getElementById('motivational-text');
const sliderMinLabel = document.getElementById('slider-min-label');
const sliderMaxLabel = document.getElementById('slider-max-label');

const btnWork = document.getElementById('btn-work');
const btnPrivate = document.getElementById('btn-private');
const btnConfirm = document.getElementById('btn-confirm');
const btnBack = document.getElementById('btn-back');

const waitingTimer = document.getElementById('waiting-timer');
const durationSlider = document.getElementById('duration-slider');
const durationValue = document.getElementById('duration-value');

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
  // Hide all screens
  chooseScreen.classList.remove('active');
  waitingScreen.classList.remove('active');
  durationScreen.classList.remove('active');
  blockedScreen.classList.remove('active');
  
  // Show requested screen
  const screen = document.getElementById(`${screenId}-screen`);
  if (screen) {
    screen.classList.add('active');
  }
}

async function init() {
  // Set domain display
  domainEl.textContent = domain || 'Unknown';
  
  // Set random motivational line
  if (motivationalText) {
    motivationalText.textContent = getRandomLine();
  }
  
  // Get config from background
  try {
    config = await browser.runtime.sendMessage({ action: 'getConfig' });
    siteConfig = await browser.runtime.sendMessage({ action: 'getSiteConfig', domain });
  } catch (e) {
    console.error('[LOCKD] Failed to get config:', e);
    return;
  }
  
  if (!siteConfig) {
    // Site not configured, go back
    window.history.back();
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

// Work button - instant access
btnWork.addEventListener('click', async () => {
  if (!siteConfig || !siteConfig.work) return;
  
  const duration = config.workDuration || 60;
  await grantAccessAndRedirect('work', duration);
});

// Private button - start waiting countdown
btnPrivate.addEventListener('click', () => {
  if (!siteConfig || !siteConfig.private) return;
  
  startWaitingCountdown();
});

function startWaitingCountdown() {
  showScreen('waiting');
  
  let seconds = config.privateDelay || 15;
  waitingTimer.textContent = seconds;
  
  const interval = setInterval(() => {
    seconds--;
    waitingTimer.textContent = seconds;
    
    if (seconds <= 0) {
      clearInterval(interval);
      showScreen('duration');
    }
  }, 1000);
}

// Duration slider
durationSlider.addEventListener('input', () => {
  durationValue.textContent = durationSlider.value;
});

// Confirm duration button
btnConfirm.addEventListener('click', async () => {
  const duration = parseInt(durationSlider.value);
  await grantAccessAndRedirect('private', duration);
});

async function grantAccessAndRedirect(type, duration) {
  try {
    await browser.runtime.sendMessage({
      action: 'grantPass',
      domain: siteConfig.domain,
      type,
      duration
    });
    
    // Redirect immediately
    window.location.href = `https://${domain}`;
  } catch (e) {
    console.error('[LOCKD] Failed to grant pass:', e);
  }
}

// Back button
btnBack.addEventListener('click', () => {
  window.history.back();
});

// Initialize
init();
