// LOCKD - Background Script
// Compatible with both Chrome (MV3 service worker) and Firefox (MV3 scripts)

const browser = globalThis.browser || globalThis.chrome;

const DEFAULT_SITES = [
  { domain: 'discord.com', name: 'Discord', work: true, private: true, blocked: false },
  { domain: 'facebook.com', name: 'Facebook', work: false, private: true, blocked: false },
  { domain: 'instagram.com', name: 'Instagram', work: false, private: true, blocked: false },
  { domain: 'linkedin.com', name: 'LinkedIn', work: true, private: false, blocked: false },
  { domain: 'reddit.com', name: 'Reddit', work: true, private: true, blocked: false },
  { domain: 'snapchat.com', name: 'Snapchat', work: false, private: true, blocked: false },
  { domain: 'tiktok.com', name: 'TikTok', work: false, private: true, blocked: false },
  { domain: 'twitch.tv', name: 'Twitch', work: false, private: true, blocked: false },
  { domain: 'x.com', name: 'X / Twitter', work: true, private: true, blocked: false },
  { domain: 'youtube.com', name: 'YouTube', work: true, private: true, blocked: false },
];

const DEFAULT_CONFIG = {
  sites: DEFAULT_SITES,
  workDuration: 30,
  privateDelay: 15,
  privateDurationMin: 5,
  privateDurationMax: 30,
  privateDurationDefault: 15,
  enabled: true,
};

let activePasses = {};

// Initialize extension
async function initialize() {
  const stored = await browser.storage.local.get(['config', 'passes']);
  
  if (!stored.config) {
    await browser.storage.local.set({ config: DEFAULT_CONFIG });
  } else {
    // Migrate old config if needed
    let needsUpdate = false;
    const config = stored.config;
    
    if (config.privateDurationMin === undefined) {
      config.privateDurationMin = 5;
      needsUpdate = true;
    }
    if (config.privateDurationMax === undefined) {
      config.privateDurationMax = config.privateDuration || 30;
      needsUpdate = true;
    }
    if (config.privateDurationDefault === undefined) {
      config.privateDurationDefault = config.privateDuration || 15;
      needsUpdate = true;
    }
    // Remove old field
    if (config.privateDuration !== undefined) {
      delete config.privateDuration;
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      await browser.storage.local.set({ config });
    }
  }
  
  if (stored.passes) {
    activePasses = stored.passes;
    cleanExpiredPasses();
  }
  
  console.log('[LOCKD] Initialized');
}

// Run on install
browser.runtime.onInstalled.addListener(initialize);

// Run on startup (for Firefox persistent background)
browser.runtime.onStartup.addListener(async () => {
  const stored = await browser.storage.local.get(['passes']);
  if (stored.passes) {
    activePasses = stored.passes;
    cleanExpiredPasses();
  }
});

// Also initialize immediately for service worker wake-ups
initialize();

// Clean expired passes
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

// Check if domain has active pass
function hasActivePass(domain) {
  cleanExpiredPasses();
  
  const pass = activePasses[domain];
  if (!pass) return false;
  
  return pass.expiresAt > Date.now();
}

// Get site config for domain
async function getSiteConfig(domain) {
  const stored = await browser.storage.local.get(['config']);
  const config = stored.config || DEFAULT_CONFIG;
  
  const site = config.sites.find(s => {
    return domain === s.domain || domain.endsWith('.' + s.domain);
  });
  
  return site;
}

// Grant pass for domain
async function grantPass(domain, type, durationMinutes) {
  const expiresAt = Date.now() + (durationMinutes * 60 * 1000);
  
  activePasses[domain] = {
    type,
    expiresAt,
    grantedAt: Date.now(),
  };
  
  await browser.storage.local.set({ passes: activePasses });
  
  // Set alarm to check tabs when pass expires
  browser.alarms.create(`pass-${domain}`, {
    when: expiresAt
  });
  
  console.log(`[LOCKD] Pass granted: ${domain} (${type}) for ${durationMinutes} minutes`);
}

// Redirect to blocked page
function redirectToBlocked(tabId, domain, mode) {
  const blockedUrl = browser.runtime.getURL(
    `blocked/blocked.html?domain=${encodeURIComponent(domain)}&mode=${mode}`
  );
  
  browser.tabs.update(tabId, { url: blockedUrl });
}

// Check all tabs for expired passes and redirect if needed
async function checkTabsForExpiredPasses(expiredDomain) {
  const stored = await browser.storage.local.get(['config']);
  const config = stored.config || DEFAULT_CONFIG;
  
  if (!config.enabled) return;
  
  try {
    const tabs = await browser.tabs.query({});
    
    for (const tab of tabs) {
      if (!tab.url) continue;
      
      try {
        const url = new URL(tab.url);
        const domain = url.hostname.replace(/^www\./, '');
        
        // Check if this tab is on the expired domain
        const site = await getSiteConfig(domain);
        if (!site) continue;
        
        // If domain matches and no active pass, redirect
        if (site.domain === expiredDomain && !hasActivePass(site.domain)) {
          console.log(`[LOCKD] Pass expired, redirecting tab ${tab.id} from ${domain}`);
          redirectToBlocked(tab.id, site.domain, 'choose');
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }
  } catch (e) {
    console.error('[LOCKD] Error checking tabs:', e);
  }
}

// Handle navigation
if (browser.webNavigation && browser.webNavigation.onBeforeNavigate) {
  browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;
    
    const stored = await browser.storage.local.get(['config']);
    const config = stored.config || DEFAULT_CONFIG;
    
    if (!config.enabled) return;
    
    try {
      const url = new URL(details.url);
      const domain = url.hostname.replace(/^www\./, '');
      
      const site = await getSiteConfig(domain);
      if (!site) return;
      
      if (site.blocked) {
        redirectToBlocked(details.tabId, domain, 'blocked');
        return;
      }
      
      if (hasActivePass(site.domain)) {
        return;
      }
      
      redirectToBlocked(details.tabId, site.domain, 'choose');
      
    } catch (e) {
      console.error('[LOCKD] Error:', e);
    }
  }, {
    url: [{ schemes: ['http', 'https'] }]
  });
} else {
  // Fallback: use tabs.onUpdated for browsers without webNavigation
  console.log('[LOCKD] webNavigation not available, using tabs.onUpdated fallback');
  
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'loading' || !changeInfo.url) return;
    
    const stored = await browser.storage.local.get(['config']);
    const config = stored.config || DEFAULT_CONFIG;
    
    if (!config.enabled) return;
    
    try {
      const url = new URL(changeInfo.url);
      const domain = url.hostname.replace(/^www\./, '');
      
      const site = await getSiteConfig(domain);
      if (!site) return;
      
      // Don't redirect if already on blocked page
      if (changeInfo.url.includes(browser.runtime.id)) return;
      
      if (site.blocked) {
        redirectToBlocked(tabId, domain, 'blocked');
        return;
      }
      
      if (hasActivePass(site.domain)) {
        return;
      }
      
      redirectToBlocked(tabId, site.domain, 'choose');
      
    } catch (e) {
      console.error('[LOCKD] Error:', e);
    }
  });
}

// Handle alarm (pass expired)
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('pass-')) {
    const domain = alarm.name.replace('pass-', '');
    
    // Remove the pass
    delete activePasses[domain];
    await browser.storage.local.set({ passes: activePasses });
    
    console.log(`[LOCKD] Pass expired: ${domain}`);
    
    // Check all tabs and redirect any that are on this domain
    await checkTabsForExpiredPasses(domain);
  }
});

// Message handling
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'getConfig':
      const stored = await browser.storage.local.get(['config']);
      return stored.config || DEFAULT_CONFIG;
    
    case 'saveConfig':
      await browser.storage.local.set({ config: message.config });
      return { success: true };
    
    case 'getSiteConfig':
      return await getSiteConfig(message.domain);
    
    case 'grantPass':
      await grantPass(message.domain, message.type, message.duration);
      return { success: true };
    
    case 'getPass':
      cleanExpiredPasses();
      return activePasses[message.domain] || null;
    
    case 'getAllPasses':
      cleanExpiredPasses();
      return activePasses;
    
    case 'revokePass':
      delete activePasses[message.domain];
      await browser.storage.local.set({ passes: activePasses });
      // Also cancel the alarm
      browser.alarms.clear(`pass-${message.domain}`);
      // Check tabs immediately
      await checkTabsForExpiredPasses(message.domain);
      return { success: true };
    
    case 'revokeAllPasses':
      // Cancel all pass alarms
      for (const domain in activePasses) {
        browser.alarms.clear(`pass-${domain}`);
      }
      const domains = Object.keys(activePasses);
      activePasses = {};
      await browser.storage.local.set({ passes: activePasses });
      // Check tabs for all previously active domains
      for (const domain of domains) {
        await checkTabsForExpiredPasses(domain);
      }
      return { success: true };
    
    default:
      return { error: 'Unknown action' };
  }
}
