const browser = globalThis.browser || globalThis.chrome;

const DEFAULT_SITES = [
  { domain: 'x.com', name: 'X / Twitter', work: true, private: true, blocked: false, match: 'base' },
  { domain: 'twitter.com', name: 'Twitter', work: true, private: true, blocked: false, match: 'base' },
  { domain: 'facebook.com', name: 'Facebook', work: false, private: true, blocked: false, match: 'base' },
  { domain: 'instagram.com', name: 'Instagram', work: false, private: true, blocked: false, match: 'base' },
  { domain: 'reddit.com', name: 'Reddit', work: true, private: true, blocked: false, match: 'base' },
  { domain: 'youtube.com', name: 'YouTube', work: true, private: true, blocked: false, match: 'exact' },
  { domain: 'tiktok.com', name: 'TikTok', work: false, private: true, blocked: false, match: 'base' },
  { domain: 'snapchat.com', name: 'Snapchat', work: false, private: true, blocked: false, match: 'base' },
  { domain: 'linkedin.com', name: 'LinkedIn', work: true, private: false, blocked: false, match: 'base' },
  { domain: 'discord.com', name: 'Discord', work: true, private: true, blocked: false, match: 'base' },
  { domain: 'twitch.tv', name: 'Twitch', work: false, private: true, blocked: false, match: 'base' },
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

async function ensureInitialized() {
  if (isInitialized) return;
  
  const stored = await browser.storage.local.get(['config', 'passes']);
  
  if (!stored.config) {
    await browser.storage.local.set({ config: DEFAULT_CONFIG });
  }
  
  if (stored.passes) {
    activePasses = stored.passes;
  }
  
  cleanExpiredPasses();
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

function redirectToBlocked(tabId, originalUrl, siteConfig, mode) {
  const blockedUrl = browser.runtime.getURL(
    `blocked/blocked.html?` +
    `url=${encodeURIComponent(originalUrl)}` +
    `&domain=${encodeURIComponent(siteConfig.domain)}` +
    `&mode=${mode}`
  );
  
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
    
    case 'getVersion':
      const manifest = browser.runtime.getManifest();
      return manifest.version;
    
    default:
      return { error: 'Unknown action' };
  }
}
