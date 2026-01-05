const browser = globalThis.browser || globalThis.chrome;

const DEFAULT_SITES = [
  { domain: 'x.com', name: 'X / Twitter', work: true, private: true, blocked: false },
  { domain: 'twitter.com', name: 'Twitter', work: true, private: true, blocked: false },
  { domain: 'facebook.com', name: 'Facebook', work: false, private: true, blocked: false },
  { domain: 'instagram.com', name: 'Instagram', work: false, private: true, blocked: false },
  { domain: 'reddit.com', name: 'Reddit', work: true, private: true, blocked: false },
  { domain: 'youtube.com', name: 'YouTube', work: true, private: true, blocked: false },
  { domain: 'tiktok.com', name: 'TikTok', work: false, private: true, blocked: false },
  { domain: 'snapchat.com', name: 'Snapchat', work: false, private: true, blocked: false },
  { domain: 'linkedin.com', name: 'LinkedIn', work: true, private: false, blocked: false },
  { domain: 'discord.com', name: 'Discord', work: true, private: true, blocked: false },
  { domain: 'twitch.tv', name: 'Twitch', work: false, private: true, blocked: false },
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
let isInitialized = false;

// Ensure we have loaded state from storage
async function ensureInitialized() {
  if (isInitialized) return;
  
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
  }
  
  cleanExpiredPasses();
  isInitialized = true;
  console.log('[LOCKD] Initialized');
}

// Initialize on install
browser.runtime.onInstalled.addListener(async () => {
  isInitialized = false;
  await ensureInitialized();
});

// Initialize on startup
browser.runtime.onStartup.addListener(async () => {
  isInitialized = false;
  await ensureInitialized();
});

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
async function hasActivePass(hostname) {
  await ensureInitialized();
  cleanExpiredPasses();
  
  // Check exact hostname first
  if (activePasses[hostname] && activePasses[hostname].expiresAt > Date.now()) {
    return true;
  }
  
  // Check base domain
  const baseDomain = getBaseDomain(hostname);
  if (baseDomain !== hostname && activePasses[baseDomain] && activePasses[baseDomain].expiresAt > Date.now()) {
    return true;
  }
  
  return false;
}

// Get the base domain from a hostname
function getBaseDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length > 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

// Get site config for domain
async function getSiteConfig(hostname) {
  await ensureInitialized();
  const stored = await browser.storage.local.get(['config']);
  const config = stored.config || DEFAULT_CONFIG;
  
  // Try exact match first
  let site = config.sites.find(s => hostname === s.domain);
  
  // Try subdomain match
  if (!site) {
    site = config.sites.find(s => hostname.endsWith('.' + s.domain));
  }
  
  return site;
}

// Grant pass for domain
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

// Redirect to blocked page
function redirectToBlocked(tabId, originalUrl, siteConfig, mode) {
  const blockedUrl = browser.runtime.getURL(
    `blocked/blocked.html?` +
    `url=${encodeURIComponent(originalUrl)}` +
    `&domain=${encodeURIComponent(siteConfig.domain)}` +
    `&mode=${mode}`
  );
  
  browser.tabs.update(tabId, { url: blockedUrl });
}

// Check all tabs for expired passes
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
          redirectToBlocked(tab.id, tab.url, site, 'choose');
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
    
    await ensureInitialized();
    const stored = await browser.storage.local.get(['config']);
    const config = stored.config || DEFAULT_CONFIG;
    
    if (!config.enabled) return;
    
    try {
      const url = new URL(details.url);
      const hostname = url.hostname.replace(/^www\./, '');
      
      const site = await getSiteConfig(hostname);
      if (!site) return;
      
      if (site.blocked) {
        redirectToBlocked(details.tabId, details.url, site, 'blocked');
        return;
      }
      
      const hasPass = await hasActivePass(hostname);
      if (hasPass) {
        return;
      }
      
      redirectToBlocked(details.tabId, details.url, site, 'choose');
      
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
      
      if (site.blocked) {
        redirectToBlocked(tabId, changeInfo.url, site, 'blocked');
        return;
      }
      
      const hasPass = await hasActivePass(hostname);
      if (hasPass) {
        return;
      }
      
      redirectToBlocked(tabId, changeInfo.url, site, 'choose');
      
    } catch (e) {
      console.error('[LOCKD] Error:', e);
    }
  });
}

// Handle alarm (pass expired)
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('pass-')) {
    const domain = alarm.name.replace('pass-', '');
    
    await ensureInitialized();
    delete activePasses[domain];
    await browser.storage.local.set({ passes: activePasses });
    
    console.log(`[LOCKD] Pass expired: ${domain}`);
    
    await checkTabsForExpiredPasses(domain);
  }
});

// Message handling
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
    
    default:
      return { error: 'Unknown action' };
  }
}
