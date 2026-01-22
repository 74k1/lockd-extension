const browser = globalThis.browser || globalThis.chrome;

const DEFAULT_SITES = [
  { domain: 'x.com', name: 'X / Twitter', work: true, private: true, blocked: false, match: 'base', ration: true, rationMinutes: 15, askFeelings: false },
  { domain: 'twitter.com', name: 'Twitter', work: true, private: true, blocked: false, match: 'base', ration: true, rationMinutes: 15, askFeelings: false },
  { domain: 'facebook.com', name: 'Facebook', work: false, private: true, blocked: false, match: 'base', ration: false, rationMinutes: 5, askFeelings: false },
  { domain: 'instagram.com', name: 'Instagram', work: false, private: true, blocked: false, match: 'base', ration: false, rationMinutes: 5, askFeelings: false },
  { domain: 'reddit.com', name: 'Reddit', work: true, private: true, blocked: false, match: 'base', ration: true, rationMinutes: 15, askFeelings: false },
  { domain: 'youtube.com', name: 'YouTube', work: true, private: true, blocked: false, match: 'exact', ration: true, rationMinutes: 30, askFeelings: false },
  { domain: 'tiktok.com', name: 'TikTok', work: false, private: true, blocked: false, match: 'base', ration: true, rationMinutes: 3, askFeelings: false },
  { domain: 'snapchat.com', name: 'Snapchat', work: false, private: true, blocked: false, match: 'base', ration: false, rationMinutes: 5, askFeelings: false },
  { domain: 'linkedin.com', name: 'LinkedIn', work: true, private: false, blocked: false, match: 'base', ration: true, rationMinutes: 5, askFeelings: false },
  { domain: 'discord.com', name: 'Discord', work: true, private: true, blocked: false, match: 'base', ration: false, rationMinutes: 5, askFeelings: false },
  { domain: 'twitch.tv', name: 'Twitch', work: false, private: true, blocked: false, match: 'base', ration: false, rationMinutes: 5, askFeelings: false },
];

const DEFAULT_CONFIG = {
  sites: DEFAULT_SITES,
  workDuration: 30,
  privateDelay: 15,
  privateDurationMin: 5,
  privateDurationMax: 30,
  privateDurationDefault: 15,
  // Extra time settings for ration mode
  extraTimeMin: 1,
  extraTimeMax: 60,
  extraTimeDefault: 5,
  enabled: true,
  // Analytics settings
  trackAllBrowsing: false, // When true, track time on ALL sites, not just configured ones
};

// Analytics data retention period (days)
const ANALYTICS_RETENTION_DAYS = 90;

// Domain aliases - map multiple domains to a single canonical domain for analytics
const DOMAIN_ALIASES = {
  '4channel.org': '4chan.org',
  // Future: 'mobile.twitter.com': 'x.com', etc.
};

// Sites that have meaningful path segments worth tracking
// Only these sites will have path-level analytics (subreddits, boards, channels, etc.)
const SITES_WITH_PATHS = {
  'reddit.com': true,       // r/subreddit
  '4chan.org': true,        // /g/, /v/, etc.
  '4channel.org': true,     // same as 4chan
  'youtube.com': true,      // channels, @handles
  'twitch.tv': true,        // /channelname
  'github.com': true,       // /org/repo
  'stackoverflow.com': true, // /questions, /tags
  'medium.com': true,       // /@author, /publications
  'substack.com': true,     // /p/post-name
  'tumblr.com': true,       // /tagged, /blog
  'pinterest.com': true,    // /pin, /board
  // Atlassian products - project/board level tracking
  'atlassian.net': true,    // /wiki, /jira, /browse
  'trello.com': true,       // /b/boardname
  'bitbucket.org': true,    // /org/repo
};

// Normalize domain through alias mapping
function normalizeDomain(hostname) {
  const domain = hostname.replace(/^www\./, '');
  return DOMAIN_ALIASES[domain] || domain;
}

let activePasses = {};
let rationUsage = {};      // { [domain]: { date: 'YYYY-MM-DD', usedSeconds: number } }
let rationOvertime = {};   // { [domain]: { expiresAt: number, grantedMinutes: number } }
let feelingsLog = [];      // [{ domain, feeling, timestamp, durationMinutes }]
let analyticsHistory = {}; // { [date]: { [domain]: { hours: {}, paths: {}, totalSeconds, overtimeSeconds, feelings: [], blocks } } }
let isInitialized = false;

// Ration tracking state
let activeRationTab = null;        // { tabId, domain, hostname, url } - currently active tab on a rationed site
let rationTrackingInterval = null; // 1-second interval for time accumulation
let rationStorageInterval = null;  // 15-second interval for persisting to storage
let unsavedRationSeconds = {};     // { [domain]: seconds } - in-memory tracking between saves
let rationExhaustedHandled = {};   // { [domain]: true } - track if we've already handled exhaustion for this domain today
let isTrackingRationTime = false;  // Guard flag to prevent overlapping trackRationTime calls

// All-browsing analytics tracking state (separate from ration tracking)
let activeAnalyticsTab = null;     // { tabId, domain, hostname, url } - currently active tab for analytics
let analyticsTrackingInterval = null; // 1-second interval for analytics time accumulation
let unsavedAnalyticsSeconds = {};  // { [domain]: { seconds, url } } - in-memory tracking between saves
let isTrackingAnalyticsTime = false; // Guard flag to prevent overlapping trackAnalyticsTime calls

async function ensureInitialized() {
  if (isInitialized) return;
  
  const stored = await browser.storage.local.get(['config', 'passes', 'rationUsage', 'rationOvertime', 'feelingsLog', 'analyticsHistory']);
  
  if (!stored.config) {
    await browser.storage.local.set({ config: DEFAULT_CONFIG });
  }
  
  if (stored.passes) {
    activePasses = stored.passes;
  }
  
  if (stored.rationUsage) {
    rationUsage = stored.rationUsage;
  }
  
  if (stored.rationOvertime) {
    rationOvertime = stored.rationOvertime;
  }
  
  if (stored.feelingsLog) {
    feelingsLog = stored.feelingsLog;
  }
  
  if (stored.analyticsHistory) {
    analyticsHistory = stored.analyticsHistory;
  }
  
  cleanExpiredOvertime();
  cleanExpiredAnalytics();
  
  cleanExpiredPasses();
  cleanExpiredRationUsage();
  setupMidnightReset();
  startRationTracking();
  
  isInitialized = true;
  console.log('[LOCKD] Initialized');
}

browser.runtime.onInstalled.addListener(async () => {
  isInitialized = false;
  await ensureInitialized();
});

browser.runtime.onStartup.addListener(async () => {
  isInitialized = false;
  await ensureInitialized();
});

function cleanExpiredPasses() {
  const now = Date.now();
  let changed = false;
  
  for (const domain in activePasses) {
    if (activePasses[domain].expiresAt < now) {
      delete activePasses[domain];
      changed = true;
    }
  }
  
  if (changed) {
    browser.storage.local.set({ passes: activePasses });
  }
}

// Get today's date as ISO string (YYYY-MM-DD)
function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

// Get current hour (0-23)
function getCurrentHour() {
  return new Date().getHours();
}

// Extract the relevant path segment from a URL for analytics
// Only returns meaningful paths for sites in SITES_WITH_PATHS
function extractPathSegment(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    
    // Check if this site should have path tracking
    const shouldTrackPaths = Object.keys(SITES_WITH_PATHS).some(site => 
      hostname === site || hostname.endsWith('.' + site)
    );
    
    if (!shouldTrackPaths) {
      return null; // No path tracking for this site
    }
    
    // Special handling for Reddit: r/subreddit
    if (hostname.includes('reddit.com') && pathParts[0] === 'r' && pathParts[1]) {
      return `r/${pathParts[1]}`;
    }
    
    // Special handling for YouTube
    if (hostname.includes('youtube.com')) {
      if (pathParts[0] === 'channel' && pathParts[1]) {
        return `channel/${pathParts[1]}`;
      }
      if (pathParts[0] === 'c' && pathParts[1]) {
        return `c/${pathParts[1]}`;
      }
      if (pathParts[0] && pathParts[0].startsWith('@')) {
        return pathParts[0];
      }
      return pathParts[0] || null;
    }
    
    // Special handling for 4chan/4channel: board names (/g/, /v/, /pol/, etc.)
    if (hostname.includes('4chan.org') || hostname.includes('4channel.org')) {
      if (pathParts[0]) {
        return pathParts[0]; // Just the board name
      }
      return null;
    }
    
    // Special handling for Twitch: channel names
    if (hostname.includes('twitch.tv')) {
      // Exclude non-channel paths
      const nonChannelPaths = ['directory', 'videos', 'settings', 'subscriptions', 'inventory', 'wallet', 'drops'];
      if (pathParts[0] && !nonChannelPaths.includes(pathParts[0])) {
        return pathParts[0]; // Channel name
      }
      return null;
    }
    
    // Special handling for GitHub: org/repo
    if (hostname.includes('github.com')) {
      if (pathParts[0] && pathParts[1]) {
        return `${pathParts[0]}/${pathParts[1]}`;
      }
      return pathParts[0] || null;
    }
    
    // Default for other tracked sites: first path segment
    return pathParts[0] || null;
  } catch (e) {
    return null;
  }
}

/**
 * Ensure analytics entry exists for a domain on a given date
 * @param {string} domain - The domain to track
 * @param {string} [date] - Date string (YYYY-MM-DD), defaults to today
 * @returns {Object} The analytics entry for the domain
 */
function ensureAnalyticsEntry(domain, date = getTodayString()) {
  if (!analyticsHistory[date]) {
    analyticsHistory[date] = {};
  }
  
  if (!analyticsHistory[date][domain]) {
    analyticsHistory[date][domain] = {
      hours: {},
      paths: {},
      totalSeconds: 0,
      overtimeSeconds: 0,
      feelings: [],
      blocks: 0
    };
  }
  
  return analyticsHistory[date][domain];
}

/**
 * Clean up analytics data older than retention period
 */
function cleanExpiredAnalytics() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ANALYTICS_RETENTION_DAYS);
  const cutoffString = cutoffDate.toISOString().split('T')[0];
  
  let cleaned = 0;
  for (const date of Object.keys(analyticsHistory)) {
    if (date < cutoffString) {
      delete analyticsHistory[date];
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    browser.storage.local.set({ analyticsHistory });
    console.log(`[LOCKD] Cleaned ${cleaned} old analytics entries (older than ${ANALYTICS_RETENTION_DAYS} days)`);
  }
}

// Update analytics history for a domain
function updateAnalytics(domain, url, seconds) {
  const hour = getCurrentHour();
  const path = extractPathSegment(url);
  const normalizedDomain = normalizeDomain(domain);
  const entry = ensureAnalyticsEntry(normalizedDomain);
  
  // Update hourly tracking
  entry.hours[hour] = (entry.hours[hour] || 0) + seconds;
  
  // Update path tracking (only if path is meaningful)
  if (path) {
    entry.paths[path] = (entry.paths[path] || 0) + seconds;
  }
  
  // Update total
  entry.totalSeconds += seconds;
}

// Save analytics to storage (called periodically)
async function saveAnalyticsToStorage() {
  await browser.storage.local.set({ analyticsHistory });
}

// Record a block event in analytics
function recordBlockEvent(domain) {
  ensureAnalyticsEntry(normalizeDomain(domain)).blocks++;
}

// Record overtime in analytics
function recordOvertimeInAnalytics(domain, seconds) {
  ensureAnalyticsEntry(normalizeDomain(domain)).overtimeSeconds += seconds;
}

// Record feeling in analytics
function recordFeelingInAnalytics(domain, feeling) {
  ensureAnalyticsEntry(normalizeDomain(domain)).feelings.push(feeling);
}

// Clean up ration usage entries from previous days
function cleanExpiredRationUsage() {
  const today = getTodayString();
  let changed = false;
  
  for (const domain in rationUsage) {
    if (rationUsage[domain].date !== today) {
      rationUsage[domain] = { date: today, usedSeconds: 0 };
      changed = true;
    }
  }
  
  if (changed) {
    browser.storage.local.set({ rationUsage });
    console.log('[LOCKD] Reset ration usage for new day');
  }
}

// Setup midnight reset alarm
function setupMidnightReset() {
  // Calculate ms until next midnight
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  // Create alarm for midnight
  browser.alarms.create('midnight-reset', {
    when: Date.now() + msUntilMidnight,
    periodInMinutes: 24 * 60 // Repeat daily
  });
  
  console.log(`[LOCKD] Midnight reset scheduled in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`);
}

// Get ration usage for a domain (returns { usedSeconds, budgetSeconds, remaining })
function getRationStatus(domain, site) {
  const today = getTodayString();
  const usage = rationUsage[domain];
  const usedSeconds = (usage && usage.date === today) ? usage.usedSeconds : 0;
  const budgetSeconds = (site.rationMinutes || 5) * 60;
  
  // Get overtime granted today
  const overtime = rationOvertime[domain];
  const overtimeSeconds = overtime ? overtime.grantedMinutes * 60 : 0;
  const totalBudgetSeconds = budgetSeconds + overtimeSeconds;
  
  return {
    usedSeconds,
    budgetSeconds,
    overtimeSeconds,
    totalBudgetSeconds,
    remainingSeconds: Math.max(0, totalBudgetSeconds - usedSeconds),
    isExhausted: usedSeconds >= totalBudgetSeconds
  };
}

// Check if a rationed site has budget remaining
async function hasRationBudget(hostname) {
  const site = await getSiteConfig(hostname);
  if (!site || !site.ration) return false;
  
  const status = getRationStatus(site.domain, site);
  return !status.isExhausted;
}

// Increment ration usage for a domain (in-memory only)
function incrementRationUsageInMemory(domain, seconds = 1) {
  const today = getTodayString();
  
  if (!rationUsage[domain] || rationUsage[domain].date !== today) {
    rationUsage[domain] = { date: today, usedSeconds: 0 };
  }
  
  rationUsage[domain].usedSeconds += seconds;
  
  // Track unsaved seconds
  if (!unsavedRationSeconds[domain]) {
    unsavedRationSeconds[domain] = 0;
  }
  unsavedRationSeconds[domain] += seconds;
  
  return rationUsage[domain].usedSeconds;
}

// Save ration usage to storage
async function saveRationUsageToStorage() {
  if (Object.keys(unsavedRationSeconds).length === 0) return;
  
  await browser.storage.local.set({ rationUsage });
  
  // Also save analytics
  await saveAnalyticsToStorage();
  
  // Log which domains were saved
  for (const [domain, seconds] of Object.entries(unsavedRationSeconds)) {
    if (seconds > 0) {
      console.log(`[LOCKD] Saved ration: ${domain} = ${rationUsage[domain]?.usedSeconds || 0}s (+${seconds}s)`);
    }
  }
  
  unsavedRationSeconds = {};
}

// Start ration time tracking
function startRationTracking() {
  // Track active tab changes
  browser.tabs.onActivated.addListener(handleTabActivated);
  browser.tabs.onUpdated.addListener(handleTabUpdated);
  
  if (browser.windows && browser.windows.onFocusChanged) {
    browser.windows.onFocusChanged.addListener(handleWindowFocusChanged);
  }
  
  // Clear existing intervals
  if (rationTrackingInterval) {
    clearInterval(rationTrackingInterval);
  }
  if (rationStorageInterval) {
    clearInterval(rationStorageInterval);
  }
  
  // Start the 1-second tracking interval (in-memory)
  rationTrackingInterval = setInterval(() => {
    trackRationTime();
  }, 1000); // Every 1 second
  
  // Start the 15-second storage save interval
  rationStorageInterval = setInterval(async () => {
    await saveRationUsageToStorage();
    await saveAnalyticsSecondsToStorage(); // Also save all-browsing analytics
  }, 15000); // Every 15 seconds
  
  // Start analytics tracking for all browsing
  startAnalyticsTracking();
  
  console.log('[LOCKD] Ration tracking started (1s tracking, 15s saves)');
  
  // Initialize tracking for current active tab
  initializeActiveTab();
}

// Initialize tracking for whatever tab is currently active
async function initializeActiveTab() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && tabs[0].id) {
      await updateActiveRationTab(tabs[0].id);
      await updateActiveAnalyticsTab(tabs[0].id);
    }
  } catch (e) {
    console.error('[LOCKD] Error initializing active tab:', e);
  }
}

// Handle tab activation
async function handleTabActivated(activeInfo) {
  await updateActiveRationTab(activeInfo.tabId);
  await updateActiveAnalyticsTab(activeInfo.tabId);
}

// Handle tab URL changes
async function handleTabUpdated(tabId, changeInfo, tab) {
  // Update tracking when URL changes on active tab
  if (changeInfo.url) {
    // Check if this is the currently active tab
    try {
      const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0 && activeTabs[0].id === tabId) {
        await updateActiveRationTab(tabId);
        await updateActiveAnalyticsTab(tabId);
      }
    } catch (e) {
      // Ignore errors
    }
  }
}

// Handle window focus changes
async function handleWindowFocusChanged(windowId) {
  if (windowId === browser.windows.WINDOW_ID_NONE) {
    // Browser lost focus, stop tracking
    activeRationTab = null;
    activeAnalyticsTab = null;
    console.log('[LOCKD] Window unfocused, pausing tracking');
    return;
  }
  
  // Get active tab in focused window
  try {
    const tabs = await browser.tabs.query({ active: true, windowId });
    if (tabs.length > 0) {
      await updateActiveRationTab(tabs[0].id);
      await updateActiveAnalyticsTab(tabs[0].id);
    }
  } catch (e) {
    console.error('[LOCKD] Error getting active tab:', e);
  }
}

// Update which rationed site is currently active
async function updateActiveRationTab(tabId) {
  await ensureInitialized();
  
  try {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url) {
      activeRationTab = null;
      return;
    }
    
    const url = new URL(tab.url);
    const hostname = url.hostname.replace(/^www\./, '');
    
    const site = await getSiteConfig(hostname);
    
    if (site && site.ration && !site.blocked) {
      // Check if has active pass (don't track ration if using a pass)
      const hasPass = await hasActivePass(hostname);
      if (!hasPass) {
        activeRationTab = { tabId, domain: site.domain, hostname, url: tab.url };
        console.log(`[LOCKD] Tracking ration: ${site.domain}`);
        return;
      }
    }
    
    activeRationTab = null;
  } catch (e) {
    activeRationTab = null;
  }
}

// Track ration time (called every 1 second)
function trackRationTime() {
  if (!activeRationTab) return;
  if (!isInitialized) return;
  if (isTrackingRationTime) return; // Prevent overlapping calls
  
  isTrackingRationTime = true;
  const { tabId, domain, url } = activeRationTab;
  
  // Get site config from in-memory config cache
  browser.storage.local.get(['config']).then(stored => {
    const config = stored.config || DEFAULT_CONFIG;
    
    if (!config.enabled) {
      isTrackingRationTime = false;
      return;
    }
    
    const site = config.sites.find(s => s.domain === domain);
    if (!site || !site.ration) {
      activeRationTab = null;
      isTrackingRationTime = false;
      return;
    }
    
    // Increment usage in memory (1 second)
    const usedSeconds = incrementRationUsageInMemory(domain, 1);
    
    // Update analytics
    if (url) {
      updateAnalytics(domain, url, 1);
    }
    
    // Get total budget including overtime
    const status = getRationStatus(domain, site);
    
    // Check if total budget exhausted (base + overtime)
    if (status.isExhausted) {
      // Save to storage immediately when exhausted
      saveRationUsageToStorage();
      
      // Don't redirect again if we've already handled this exhaustion
      if (rationExhaustedHandled[domain]) {
        isTrackingRationTime = false;
        return;
      }
      
      console.log(`[LOCKD] Ration exhausted: ${domain} (used ${usedSeconds}s of ${status.totalBudgetSeconds}s)`);
      activeRationTab = null;
      rationExhaustedHandled[domain] = true;
      
      // Check if we should ask feelings
      const askFeelings = site.askFeelings !== false;
      
      // Get the tab and redirect
      browser.tabs.get(tabId).then(tab => {
        if (tab && tab.url) {
          if (askFeelings) {
            // Show feelings screen first
            showBlockOverlay(tabId, tab.url, site, 'feelings', {
              passDuration: site.rationMinutes
            });
          } else {
            // Go directly to ration-expired screen
            showBlockOverlay(tabId, tab.url, site, 'ration-expired', {
              rationMinutes: site.rationMinutes
            });
          }
        }
      }).catch(() => {
        // Tab doesn't exist anymore
      }).finally(() => {
        isTrackingRationTime = false;
      });
      return;
    }
    
    isTrackingRationTime = false;
  }).catch(e => {
    console.error('[LOCKD] Error in trackRationTime:', e);
    isTrackingRationTime = false;
  });
}

// Track analytics time for ALL browsing (called every 1 second when trackAllBrowsing is enabled)
function trackAnalyticsTime() {
  if (!activeAnalyticsTab) return;
  if (!isInitialized) return;
  if (isTrackingAnalyticsTime) return; // Prevent overlapping calls
  
  isTrackingAnalyticsTime = true;
  const { domain, url } = activeAnalyticsTab;
  
  // Get config to check if trackAllBrowsing is enabled
  browser.storage.local.get(['config']).then(stored => {
    const config = stored.config || DEFAULT_CONFIG;
    
    if (!config.trackAllBrowsing) {
      isTrackingAnalyticsTime = false;
      return;
    }
    
    // Update analytics (1 second)
    const normalizedDomain = normalizeDomain(domain);
    updateAnalytics(normalizedDomain, url, 1);
    
    // Track unsaved seconds for batch saving
    if (!unsavedAnalyticsSeconds[normalizedDomain]) {
      unsavedAnalyticsSeconds[normalizedDomain] = { seconds: 0, url };
    }
    unsavedAnalyticsSeconds[normalizedDomain].seconds++;
    unsavedAnalyticsSeconds[normalizedDomain].url = url;
    
    isTrackingAnalyticsTime = false;
  }).catch(e => {
    console.error('[LOCKD] Error in trackAnalyticsTime:', e);
    isTrackingAnalyticsTime = false;
  });
}

// Update active analytics tab (for all-browsing tracking)
async function updateActiveAnalyticsTab(tabId) {
  await ensureInitialized();
  
  try {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url) {
      activeAnalyticsTab = null;
      return;
    }
    
    // Skip extension pages, chrome:// urls, etc.
    if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) {
      activeAnalyticsTab = null;
      return;
    }
    
    const url = new URL(tab.url);
    const hostname = url.hostname.replace(/^www\./, '');
    const normalizedDomain = normalizeDomain(hostname);
    
    activeAnalyticsTab = { tabId, domain: normalizedDomain, hostname, url: tab.url };
  } catch (e) {
    activeAnalyticsTab = null;
  }
}

// Start analytics tracking for all browsing
function startAnalyticsTracking() {
  // Clear existing interval
  if (analyticsTrackingInterval) {
    clearInterval(analyticsTrackingInterval);
  }
  
  // Start the 1-second tracking interval
  analyticsTrackingInterval = setInterval(() => {
    trackAnalyticsTime();
  }, 1000);
  
  console.log('[LOCKD] All-browsing analytics tracking started');
}

// Save analytics seconds to storage (called by the existing storage interval)
async function saveAnalyticsSecondsToStorage() {
  if (Object.keys(unsavedAnalyticsSeconds).length === 0) return;
  
  // Log which domains were tracked
  for (const [domain, data] of Object.entries(unsavedAnalyticsSeconds)) {
    if (data.seconds > 0) {
      console.log(`[LOCKD] Analytics saved: ${domain} +${data.seconds}s`);
    }
  }
  
  unsavedAnalyticsSeconds = {};
  await saveAnalyticsToStorage();
}

// Log a feeling after overtime expires
async function logFeeling(domain, feeling, durationMinutes) {
  feelingsLog.push({
    domain,
    feeling, // 'neutral' | 'positive' | 'negative'
    timestamp: Date.now(),
    durationMinutes
  });
  
  // Keep only last 100 entries to prevent unbounded growth
  if (feelingsLog.length > 100) {
    feelingsLog = feelingsLog.slice(-100);
  }
  
  // Record in analytics
  recordFeelingInAnalytics(domain, feeling);
  
  await browser.storage.local.set({ feelingsLog });
  await saveAnalyticsToStorage();
  console.log(`[LOCKD] Feeling logged: ${domain} - ${feeling}`);
}

// Clean up expired overtime entries (only called at midnight to fully reset)
function cleanExpiredOvertime() {
  // Don't auto-delete expired overtime - we keep grantedMinutes for accumulation
  // This function is now only used at midnight to fully clear everything
}

// Grant overtime for a rationed site (adds to daily budget, no timer)
async function grantOvertime(domain, minutes) {
  await ensureInitialized();
  
  const existing = rationOvertime[domain];
  const totalGrantedMinutes = (existing?.grantedMinutes || 0) + minutes;
  
  console.log(`[LOCKD] Overtime added: ${domain} +${minutes}m (total budget now: base + ${totalGrantedMinutes}m overtime)`);
  
  rationOvertime[domain] = {
    grantedMinutes: totalGrantedMinutes
  };
  
  // Clear the exhausted flag so user can continue using their budget
  delete rationExhaustedHandled[domain];
  
  await browser.storage.local.set({ rationOvertime });
}

// Get overtime status for a domain
// Returns grantedMinutes if any overtime was granted today
function getOvertimeStatus(domain) {
  const overtime = rationOvertime[domain];
  if (!overtime || !overtime.grantedMinutes) {
    return null;
  }
  
  return {
    grantedMinutes: overtime.grantedMinutes
  };
}

function hostnameMatchesSite(hostname, site) {
  const mode = site.match || 'base';
  
  switch (mode) {
    case 'exact':
      return hostname === site.domain;
    
    case 'regex':
      try {
        const regex = new RegExp(site.domain);
        return regex.test(hostname);
      } catch (e) {
        console.error(`[LOCKD] Invalid regex: ${site.domain}`, e);
        return false;
      }
    
    case 'base':
    default:
      return hostname === site.domain || hostname.endsWith('.' + site.domain);
  }
}

async function getSiteConfig(hostname) {
  await ensureInitialized();
  const stored = await browser.storage.local.get(['config']);
  const config = stored.config || DEFAULT_CONFIG;
  
  for (const site of config.sites) {
    if (hostnameMatchesSite(hostname, site)) {
      return site;
    }
  }
  
  return null;
}

async function hasActivePass(hostname) {
  await ensureInitialized();
  cleanExpiredPasses();
  
  const site = await getSiteConfig(hostname);
  if (!site) return false;
  
  const pass = activePasses[site.domain];
  if (pass && pass.expiresAt > Date.now()) {
    return true;
  }
  
  return false;
}

async function grantPass(domain, type, durationMinutes) {
  await ensureInitialized();
  
  const expiresAt = Date.now() + (durationMinutes * 60 * 1000);
  
  activePasses[domain] = {
    type,
    expiresAt,
    grantedAt: Date.now(),
  };
  
  await browser.storage.local.set({ passes: activePasses });
  
  browser.alarms.create(`pass-${domain}`, {
    when: expiresAt
  });
  
  console.log(`[LOCKD] Pass granted: ${domain} (${type}) for ${durationMinutes} minutes`);
}

// Inject the blocker overlay into a tab
async function showBlockOverlay(tabId, originalUrl, siteConfig, mode, extraParams = {}) {
  // Record block event in analytics
  recordBlockEvent(siteConfig.domain);
  saveAnalyticsToStorage();
  
  // Get config for the overlay
  const stored = await browser.storage.local.get(['config']);
  const config = stored.config || DEFAULT_CONFIG;
  
  try {
    // First, inject the CSS
    await browser.scripting.insertCSS({
      target: { tabId },
      files: ['content/blocker.css']
    });
    
    // Then inject the JS
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['content/blocker.js']
    });
    
    // Send message to show overlay
    await browser.tabs.sendMessage(tabId, {
      action: 'showBlockOverlay',
      mode: mode,
      config: config,
      siteConfig: siteConfig,
      options: extraParams
    });
    
    console.log(`[LOCKD] Overlay shown: ${siteConfig.domain} (${mode})`);
  } catch (e) {
    console.error('[LOCKD] Failed to inject overlay, falling back to redirect:', e);
    // Fallback to redirect if injection fails (e.g., on extension pages)
    redirectToBlockedPage(tabId, originalUrl, siteConfig, mode, extraParams);
  }
}

// Fallback: redirect to blocked page (used when overlay injection fails)
function redirectToBlockedPage(tabId, originalUrl, siteConfig, mode, extraParams = {}) {
  let url = `blocked/blocked.html?` +
    `url=${encodeURIComponent(originalUrl)}` +
    `&domain=${encodeURIComponent(siteConfig.domain)}` +
    `&mode=${mode}`;
  
  // Add extra params (e.g., rationMinutes, passDuration)
  for (const [key, value] of Object.entries(extraParams)) {
    url += `&${key}=${encodeURIComponent(value)}`;
  }
  
  const blockedUrl = browser.runtime.getURL(url);
  browser.tabs.update(tabId, { url: blockedUrl });
}

async function checkTabsForExpiredPasses(expiredDomain) {
  await ensureInitialized();
  const stored = await browser.storage.local.get(['config']);
  const config = stored.config || DEFAULT_CONFIG;
  
  if (!config.enabled) return;
  
  try {
    const tabs = await browser.tabs.query({});
    
    for (const tab of tabs) {
      if (!tab.url) continue;
      
      try {
        const url = new URL(tab.url);
        const hostname = url.hostname.replace(/^www\./, '');
        
        const site = await getSiteConfig(hostname);
        if (!site) continue;
        
        const hasPass = await hasActivePass(hostname);
        if (site.domain === expiredDomain && !hasPass) {
          console.log(`[LOCKD] Pass expired, redirecting tab ${tab.id} from ${hostname}`);
          
          // For rationed sites with exhausted budget, show ration-expired
          if (site.ration) {
            const status = getRationStatus(site.domain, site);
            if (status.isExhausted) {
              showBlockOverlay(tab.id, tab.url, site, 'ration-expired', {
                rationMinutes: site.rationMinutes
              });
              continue;
            }
          }
          
          showBlockOverlay(tab.id, tab.url, site, 'choose');
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }
  } catch (e) {
    console.error('[LOCKD] Error checking tabs:', e);
  }
}

if (browser.webNavigation && browser.webNavigation.onBeforeNavigate) {
  browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;
    
    await ensureInitialized();
    const stored = await browser.storage.local.get(['config']);
    const config = stored.config || DEFAULT_CONFIG;
    
    if (!config.enabled) return;
    
    try {
      const url = new URL(details.url);
      const hostname = url.hostname.replace(/^www\./, '');
      
      const site = await getSiteConfig(hostname);
      if (!site) return;
      
      // Completely blocked - no access ever
      if (site.blocked) {
        showBlockOverlay(details.tabId, details.url, site, 'blocked');
        return;
      }
      
      // Has active pass - allow
      const hasPass = await hasActivePass(hostname);
      if (hasPass) {
        return;
      }
      
      // Ration mode - check budget (includes base + overtime)
      if (site.ration) {
        const status = getRationStatus(site.domain, site);
        
        if (!status.isExhausted) {
          // Budget remaining - allow access and start tracking immediately
          activeRationTab = { tabId: details.tabId, domain: site.domain, hostname };
          return;
        }
        
        // Budget exhausted - show ration-expired screen
        showBlockOverlay(details.tabId, details.url, site, 'ration-expired', {
          rationMinutes: site.rationMinutes
        });
        return;
      }
      
      // Standard pass mode - show choose screen
      showBlockOverlay(details.tabId, details.url, site, 'choose');
      
    } catch (e) {
      console.error('[LOCKD] Error:', e);
    }
  }, {
    url: [{ schemes: ['http', 'https'] }]
  });
} else {
  console.log('[LOCKD] webNavigation not available, using tabs.onUpdated fallback');
  
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'loading' || !changeInfo.url) return;
    
    await ensureInitialized();
    const stored = await browser.storage.local.get(['config']);
    const config = stored.config || DEFAULT_CONFIG;
    
    if (!config.enabled) return;
    
    try {
      const url = new URL(changeInfo.url);
      const hostname = url.hostname.replace(/^www\./, '');
      
      const site = await getSiteConfig(hostname);
      if (!site) return;
      
      if (changeInfo.url.includes(browser.runtime.id)) return;
      
      // Completely blocked - no access ever
      if (site.blocked) {
        showBlockOverlay(tabId, changeInfo.url, site, 'blocked');
        return;
      }
      
      // Has active pass - allow
      const hasPass = await hasActivePass(hostname);
      if (hasPass) {
        return;
      }
      
      // Ration mode - check budget (includes base + overtime)
      if (site.ration) {
        const status = getRationStatus(site.domain, site);
        
        if (!status.isExhausted) {
          // Budget remaining - allow access and start tracking immediately
          console.log(`[LOCKD] Ration access: ${site.domain} (${Math.floor(status.remainingSeconds / 60)}min ${status.remainingSeconds % 60}s left)`);
          activeRationTab = { tabId, domain: site.domain, hostname };
          return;
        }
        
        // Budget exhausted - show ration-expired screen
        showBlockOverlay(tabId, changeInfo.url, site, 'ration-expired', {
          rationMinutes: site.rationMinutes
        });
        return;
      }
      
      // Standard pass mode - show choose screen
      showBlockOverlay(tabId, changeInfo.url, site, 'choose');
      
    } catch (e) {
      console.error('[LOCKD] Error:', e);
    }
  });
}

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'midnight-reset') {
    console.log('[LOCKD] Midnight reset triggered');
    cleanExpiredRationUsage();
    rationExhaustedHandled = {}; // Reset exhausted flags for new day
    rationOvertime = {}; // Clear all overtime for new day
    browser.storage.local.set({ rationOvertime });
    return;
  }
  
  if (alarm.name.startsWith('pass-')) {
    const domain = alarm.name.replace('pass-', '');
    
    await ensureInitialized();
    
    // Get pass info before deleting
    const pass = activePasses[domain];
    const passDuration = pass ? Math.round((pass.expiresAt - pass.grantedAt) / 60000) : 0;
    
    console.log(`[LOCKD] Pass expired: ${domain}, type: ${pass?.type}`);
    
    delete activePasses[domain];
    await browser.storage.local.set({ passes: activePasses });
    
    // For pass mode sites, just redirect to choose screen
    await checkTabsForExpiredPasses(domain);
    return;
  }
});



browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(e => {
    console.error('[LOCKD] Message handler error:', e);
    sendResponse({ error: e.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  await ensureInitialized();
  
  switch (message.action) {
    case 'getConfig':
      const storedConfig = await browser.storage.local.get(['config']);
      return storedConfig.config || DEFAULT_CONFIG;
    
    case 'saveConfig':
      await browser.storage.local.set({ config: message.config });
      return { success: true };
    
    case 'getSiteConfig':
      return await getSiteConfig(message.hostname);
    
    case 'grantPass':
      await grantPass(message.domain, message.type, message.duration);
      return { success: true };
    
    case 'grantOvertime':
      await grantOvertime(message.domain, message.minutes);
      return { success: true };
    
    case 'getOvertimeStatus':
      cleanExpiredOvertime();
      if (message.domain) {
        return getOvertimeStatus(message.domain);
      }
      // Return all overtime statuses
      const allOvertime = {};
      for (const domain in rationOvertime) {
        const status = getOvertimeStatus(domain);
        if (status) {
          allOvertime[domain] = status;
        }
      }
      return allOvertime;
    
    case 'getPass':
      cleanExpiredPasses();
      return activePasses[message.domain] || null;
    
    case 'getAllPasses':
      cleanExpiredPasses();
      return { ...activePasses };
    
    case 'revokePass':
      delete activePasses[message.domain];
      await browser.storage.local.set({ passes: activePasses });
      browser.alarms.clear(`pass-${message.domain}`);
      await checkTabsForExpiredPasses(message.domain);
      return { success: true };
    
    case 'revokeAllPasses':
      for (const domain in activePasses) {
        browser.alarms.clear(`pass-${domain}`);
      }
      const domains = Object.keys(activePasses);
      activePasses = {};
      await browser.storage.local.set({ passes: activePasses });
      for (const domain of domains) {
        await checkTabsForExpiredPasses(domain);
      }
      return { success: true };
    
    case 'getVersion':
      const manifest = browser.runtime.getManifest();
      return manifest.version;
    
    case 'getRationUsage':
      cleanExpiredRationUsage();
      if (message.domain) {
        const site = await getSiteConfig(message.domain);
        if (site && site.ration) {
          return getRationStatus(site.domain, site);
        }
        return null;
      }
      // Return all ration usage
      const allUsage = {};
      const storedConfigForRation = await browser.storage.local.get(['config']);
      const configForRation = storedConfigForRation.config || DEFAULT_CONFIG;
      for (const site of configForRation.sites) {
        if (site.ration) {
          allUsage[site.domain] = getRationStatus(site.domain, site);
        }
      }
      return allUsage;
    
    case 'logFeeling':
      await logFeeling(message.domain, message.feeling, message.durationMinutes || 0);
      return { success: true };
    
    case 'closeCurrentTab':
      if (sender.tab && sender.tab.id) {
        try {
          await browser.tabs.remove(sender.tab.id);
          return { success: true };
        } catch (e) {
          console.error('[LOCKD] Failed to close tab:', e);
          return { success: false, error: e.message };
        }
      }
      return { success: false, error: 'No tab to close' };
    
    case 'getFeelings':
      if (message.domain) {
        return feelingsLog.filter(f => f.domain === message.domain);
      }
      return [...feelingsLog];
    
    case 'getUsageStats':
      // Get aggregated stats for popup/options
      const stats = {
        rationUsage: {},
        overtime: {},
        feelingsSummary: {}
      };
      
      // Debug: log current in-memory state
      console.log('[LOCKD] getUsageStats - rationUsage:', JSON.stringify(rationUsage));
      console.log('[LOCKD] getUsageStats - rationOvertime:', JSON.stringify(rationOvertime));
      
      // Ration usage
      const storedConfigForStats = await browser.storage.local.get(['config']);
      const configForStats = storedConfigForStats.config || DEFAULT_CONFIG;
      for (const site of configForStats.sites) {
        if (site.ration) {
          stats.rationUsage[site.domain] = {
            ...getRationStatus(site.domain, site),
            name: site.name
          };
          // Include overtime status if any overtime was granted today
          const overtimeStatus = getOvertimeStatus(site.domain);
          if (overtimeStatus) {
            stats.overtime[site.domain] = {
              ...overtimeStatus,
              name: site.name
            };
          }
        }
      }
      
      // Feelings summary (last 7 days)
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const recentFeelings = feelingsLog.filter(f => f.timestamp > weekAgo);
      
      for (const feeling of recentFeelings) {
        if (!stats.feelingsSummary[feeling.domain]) {
          stats.feelingsSummary[feeling.domain] = { neutral: 0, positive: 0, negative: 0 };
        }
        stats.feelingsSummary[feeling.domain][feeling.feeling]++;
      }
      
      return stats;
    
    case 'getAnalytics':
      // Get analytics data for a date range
      // message: { startDate?: string, endDate?: string }
      const analyticsStartDate = message.startDate || null;
      const analyticsEndDate = message.endDate || getTodayString();
      
      const filteredAnalytics = {};
      for (const [date, data] of Object.entries(analyticsHistory)) {
        if (analyticsStartDate && date < analyticsStartDate) continue;
        if (analyticsEndDate && date > analyticsEndDate) continue;
        filteredAnalytics[date] = data;
      }
      
      return filteredAnalytics;
    
    case 'getAnalyticsSummary':
      // Get aggregated analytics summary
      // message: { days?: number } - defaults to 30
      const summaryDays = message.days || 30;
      const summaryEndDate = new Date();
      const summaryStartDate = new Date();
      summaryStartDate.setDate(summaryStartDate.getDate() - summaryDays);
      
      const summary = {
        totalSeconds: 0,
        byDomain: {},      // { [domain]: { totalSeconds, paths: {}, hourlyAvg: {} } }
        byDate: {},        // { [date]: totalSeconds }
        peakHours: {},     // { [hour]: totalSeconds }
        feelings: { positive: 0, neutral: 0, negative: 0 },
        totalBlocks: 0
      };
      
      for (const [date, domains] of Object.entries(analyticsHistory)) {
        const dateObj = new Date(date);
        if (dateObj < summaryStartDate || dateObj > summaryEndDate) continue;
        
        summary.byDate[date] = 0;
        
        for (const [domain, data] of Object.entries(domains)) {
          // Initialize domain summary
          if (!summary.byDomain[domain]) {
            summary.byDomain[domain] = {
              totalSeconds: 0,
              paths: {},
              hours: {}
            };
          }
          
          // Aggregate totals
          summary.totalSeconds += data.totalSeconds;
          summary.byDate[date] += data.totalSeconds;
          summary.byDomain[domain].totalSeconds += data.totalSeconds;
          summary.totalBlocks += data.blocks || 0;
          
          // Aggregate paths
          for (const [path, seconds] of Object.entries(data.paths || {})) {
            summary.byDomain[domain].paths[path] = 
              (summary.byDomain[domain].paths[path] || 0) + seconds;
          }
          
          // Aggregate hourly data
          for (const [hour, seconds] of Object.entries(data.hours || {})) {
            summary.byDomain[domain].hours[hour] = 
              (summary.byDomain[domain].hours[hour] || 0) + seconds;
            summary.peakHours[hour] = (summary.peakHours[hour] || 0) + seconds;
          }
          
          // Aggregate feelings
          for (const feeling of (data.feelings || [])) {
            if (summary.feelings[feeling] !== undefined) {
              summary.feelings[feeling]++;
            }
          }
        }
      }
      
      return summary;
    
    case 'clearAnalytics':
      analyticsHistory = {};
      await browser.storage.local.set({ analyticsHistory });
      return { success: true };
    
    default:
      return { error: 'Unknown action' };
  }
}
