const browser = globalThis.browser || globalThis.chrome;

let config = null;
let originalConfig = null;
let hasChanges = false;
let expandedSiteIndex = null; // Track which site is expanded

const sitesListEl = document.getElementById('sites-list');
const saveBar = document.getElementById('save-bar');
const toast = document.getElementById('toast');
const versionEl = document.getElementById('version');

const newSiteDomain = document.getElementById('new-site-domain');
const newSiteName = document.getElementById('new-site-name');
const newSiteMatch = document.getElementById('new-site-match');
const btnAddSite = document.getElementById('btn-add-site');

const workDuration = document.getElementById('work-duration');
const privateDelay = document.getElementById('private-delay');
const privateDurationMin = document.getElementById('private-duration-min');
const privateDurationDefault = document.getElementById('private-duration-default');
const privateDurationMax = document.getElementById('private-duration-max');
const extraTimeMin = document.getElementById('extra-time-min');
const extraTimeDefault = document.getElementById('extra-time-default');
const extraTimeMax = document.getElementById('extra-time-max');

const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const btnReset = document.getElementById('btn-reset');
const btnAnalytics = document.getElementById('btn-analytics');
const btnClearAnalytics = document.getElementById('btn-clear-analytics');
const toggleTrackAll = document.getElementById('toggle-track-all');

function createCheckIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', '#07060B');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'square');
  
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '2,6 5,9 10,3');
  
  svg.appendChild(polyline);
  return svg;
}

async function init() {
  config = await browser.runtime.sendMessage({ action: 'getConfig' });
  originalConfig = JSON.parse(JSON.stringify(config));
  
  const version = await browser.runtime.sendMessage({ action: 'getVersion' });
  if (version && versionEl) {
    versionEl.textContent = `v${version}`;
  }
  
  renderSites();
  renderSettings();
}

function getSiteMode(site) {
  if (site.blocked) return 'block';
  if (site.ration) return 'ration';
  return 'pass';
}

function getModeBadgeText(site) {
  const mode = getSiteMode(site);
  if (mode === 'ration') {
    return `Ration ${site.rationMinutes || 5}m`;
  }
  if (mode === 'block') {
    return 'Blocked';
  }
  // Show Work/Private status for Pass mode
  const hasWork = site.work;
  const hasPrivate = site.private;
  if (hasWork && hasPrivate) {
    return 'Pass (W+P)';
  } else if (hasWork) {
    return 'Pass (W)';
  } else if (hasPrivate) {
    return 'Pass (P)';
  }
  return 'Pass';
}

function getFaviconUrl(domain) {
  // Use DuckDuckGo's favicon service for privacy
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
}

function renderSites() {
  while (sitesListEl.firstChild) {
    sitesListEl.removeChild(sitesListEl.firstChild);
  }
  
  config.sites.forEach((site, index) => {
    const item = document.createElement('div');
    item.className = 'site-item';
    
    // Restore expanded state if this was the expanded item
    if (expandedSiteIndex === index) {
      item.classList.add('expanded');
    }
    
    // Site header (clickable to expand)
    const header = document.createElement('div');
    header.className = 'site-header';
    
    // Favicon
    const favicon = document.createElement('div');
    favicon.className = 'site-favicon';
    const faviconImg = document.createElement('img');
    faviconImg.src = getFaviconUrl(site.domain);
    faviconImg.alt = '';
    faviconImg.onerror = () => { faviconImg.style.display = 'none'; };
    favicon.appendChild(faviconImg);
    header.appendChild(favicon);
    
    // Site info
    const siteInfo = document.createElement('div');
    siteInfo.className = 'site-info';
    
    const domainEl = document.createElement('div');
    domainEl.className = 'site-domain';
    domainEl.textContent = site.domain;
    siteInfo.appendChild(domainEl);
    
    if (site.name && site.name !== site.domain) {
      const nameEl = document.createElement('div');
      nameEl.className = 'site-name';
      nameEl.textContent = site.name;
      siteInfo.appendChild(nameEl);
    }
    header.appendChild(siteInfo);
    
    // Mode badge
    const modeBadge = document.createElement('div');
    modeBadge.className = `site-mode-badge ${getSiteMode(site)}`;
    modeBadge.textContent = getModeBadgeText(site);
    header.appendChild(modeBadge);
    
    // Expand indicator
    const expandIcon = document.createElement('div');
    expandIcon.className = 'site-expand';
    expandIcon.textContent = '▼';
    header.appendChild(expandIcon);
    
    // Toggle expand on header click
    header.addEventListener('click', () => {
      const isExpanding = !item.classList.contains('expanded');
      
      // Collapse all other items
      document.querySelectorAll('.site-item.expanded').forEach(el => {
        el.classList.remove('expanded');
      });
      
      if (isExpanding) {
        item.classList.add('expanded');
        expandedSiteIndex = index;
      } else {
        expandedSiteIndex = null;
      }
    });
    
    item.appendChild(header);
    
    // Site details (expandable)
    const details = document.createElement('div');
    details.className = 'site-details';
    
    // Mode selector row
    const modeRow = document.createElement('div');
    modeRow.className = 'site-detail-row';
    
    const modeLabel = document.createElement('div');
    modeLabel.className = 'site-detail-label';
    modeLabel.textContent = 'Mode';
    modeRow.appendChild(modeLabel);
    
    const segmented = document.createElement('div');
    segmented.className = 'segmented-control';
    
    ['pass', 'ration', 'block'].forEach(mode => {
      const btn = document.createElement('button');
      btn.className = 'segment';
      btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      
      const currentMode = getSiteMode(site);
      if (currentMode === mode) {
        btn.classList.add('active', mode);
      }
      
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Preserve expanded state
        expandedSiteIndex = index;
        
        // Update site config based on mode
        if (mode === 'pass') {
          config.sites[index].blocked = false;
          config.sites[index].ration = false;
        } else if (mode === 'ration') {
          config.sites[index].blocked = false;
          config.sites[index].ration = true;
          // Ensure work/private are set if ration is enabled
          if (!config.sites[index].work && !config.sites[index].private) {
            config.sites[index].work = true;
            config.sites[index].private = true;
          }
        } else if (mode === 'block') {
          config.sites[index].blocked = true;
          config.sites[index].ration = false;
        }
        
        renderSites();
        markChanged();
      });
      
      segmented.appendChild(btn);
    });
    
    modeRow.appendChild(segmented);
    details.appendChild(modeRow);
    
    // Ration settings (only visible when ration mode)
    const rationSettings = document.createElement('div');
    rationSettings.className = 'ration-settings';
    if (site.ration) {
      rationSettings.classList.add('visible');
    }
    
    // Daily budget
    const budgetDiv = document.createElement('div');
    budgetDiv.className = 'ration-budget';
    
    const budgetLabel = document.createElement('span');
    budgetLabel.textContent = 'Daily budget:';
    budgetDiv.appendChild(budgetLabel);
    
    const budgetInput = document.createElement('input');
    budgetInput.type = 'number';
    budgetInput.min = '1';
    budgetInput.max = '480';
    budgetInput.value = site.rationMinutes || 5;
    budgetInput.addEventListener('change', (e) => {
      e.stopPropagation();
      const value = parseInt(budgetInput.value);
      // Ensure value is within valid range (1-480 minutes)
      config.sites[index].rationMinutes = (value > 0 && value <= 480) ? value : 5;
      renderSites();
      markChanged();
    });
    budgetInput.addEventListener('click', (e) => e.stopPropagation());
    budgetDiv.appendChild(budgetInput);
    
    const budgetUnit = document.createElement('span');
    budgetUnit.textContent = 'min/day';
    budgetDiv.appendChild(budgetUnit);
    
    rationSettings.appendChild(budgetDiv);
    
    // Ask feelings checkbox
    const feelingsDiv = document.createElement('div');
    feelingsDiv.className = 'ration-budget';
    feelingsDiv.style.marginBottom = '12px';
    
    const feelingsGroup = createCheckboxGroup('Ask how I feel', site.askFeelings !== false, index, 'askFeelings');
    feelingsDiv.appendChild(feelingsGroup);
    
    const feelingsHint = document.createElement('span');
    feelingsHint.style.marginLeft = '8px';
    feelingsHint.style.fontSize = '11px';
    feelingsHint.style.color = 'var(--base04)';
    feelingsHint.textContent = 'after overtime expires';
    feelingsDiv.appendChild(feelingsHint);
    
    rationSettings.appendChild(feelingsDiv);
    details.appendChild(rationSettings);
    
    // Pass mode - work/private checkboxes
    if (!site.ration && !site.blocked) {
      const passSettings = document.createElement('div');
      passSettings.className = 'site-detail-row';
      passSettings.style.marginTop = '12px';
      
      const passLabel = document.createElement('div');
      passLabel.className = 'site-detail-label';
      passLabel.textContent = 'Access options';
      passSettings.appendChild(passLabel);
      
      const passOptions = document.createElement('div');
      passOptions.className = 'site-options';
      
      const passWorkGroup = createCheckboxGroup('Work', site.work, index, 'work');
      passOptions.appendChild(passWorkGroup);
      
      const passPrivateGroup = createCheckboxGroup('Private', site.private, index, 'private');
      passOptions.appendChild(passPrivateGroup);
      
      passSettings.appendChild(passOptions);
      details.appendChild(passSettings);
    }
    
    // Match mode row
    const matchRow = document.createElement('div');
    matchRow.className = 'site-detail-row';
    matchRow.style.marginTop = '12px';
    
    const matchLabel = document.createElement('div');
    matchLabel.className = 'site-detail-label';
    matchLabel.textContent = 'Match mode';
    matchRow.appendChild(matchLabel);
    
    const matchSelect = document.createElement('select');
    matchSelect.addEventListener('click', (e) => e.stopPropagation());
    
    const optBase = document.createElement('option');
    optBase.value = 'base';
    optBase.textContent = 'Base Domain';
    matchSelect.appendChild(optBase);
    
    const optExact = document.createElement('option');
    optExact.value = 'exact';
    optExact.textContent = 'Exact';
    matchSelect.appendChild(optExact);
    
    const optRegex = document.createElement('option');
    optRegex.value = 'regex';
    optRegex.textContent = 'Regex';
    matchSelect.appendChild(optRegex);
    
    matchSelect.value = site.match || 'base';
    matchSelect.addEventListener('change', (e) => {
      e.stopPropagation();
      config.sites[index].match = matchSelect.value;
      markChanged();
    });
    matchRow.appendChild(matchSelect);
    details.appendChild(matchRow);
    
    // Remove button row
    const removeRow = document.createElement('div');
    removeRow.className = 'site-detail-row';
    removeRow.style.marginTop = '16px';
    removeRow.style.paddingTop = '16px';
    removeRow.style.borderTop = '1px solid var(--base02)';
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'danger';
    removeBtn.style.fontSize = '11px';
    removeBtn.style.padding = '8px 16px';
    removeBtn.textContent = 'Remove site';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      config.sites.splice(index, 1);
      expandedSiteIndex = null; // Reset expanded state when removing
      renderSites();
      markChanged();
    });
    removeRow.appendChild(removeBtn);
    details.appendChild(removeRow);
    
    item.appendChild(details);
    sitesListEl.appendChild(item);
  });
}

function createCheckboxGroup(label, checked, index, field) {
  const group = document.createElement('div');
  group.className = 'checkbox-group';
  
  const checkbox = document.createElement('div');
  checkbox.className = 'checkbox';
  if (checked) {
    checkbox.classList.add('checked');
  }
  checkbox.appendChild(createCheckIcon());
  
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    config.sites[index][field] = !config.sites[index][field];
    
    // Only apply mutual exclusion if it's a blocked checkbox
    if (field === 'blocked' && config.sites[index].blocked) {
      config.sites[index].work = false;
      config.sites[index].private = false;
      config.sites[index].ration = false;
    }
    
    renderSites();
    markChanged();
  });
  
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.addEventListener('click', (e) => e.stopPropagation());
  
  group.appendChild(checkbox);
  group.appendChild(labelEl);
  
  return group;
}

function renderSettings() {
  workDuration.value = config.workDuration || 60;
  privateDelay.value = config.privateDelay || 15;
  privateDurationMin.value = config.privateDurationMin || 5;
  privateDurationDefault.value = config.privateDurationDefault || 15;
  privateDurationMax.value = config.privateDurationMax || 30;
  extraTimeMin.value = config.extraTimeMin || 1;
  extraTimeDefault.value = config.extraTimeDefault || 5;
  extraTimeMax.value = config.extraTimeMax || 60;
  
  // Analytics toggle
  if (config.trackAllBrowsing) {
    toggleTrackAll.classList.add('active');
  } else {
    toggleTrackAll.classList.remove('active');
  }
}

function markChanged() {
  hasChanges = true;
  saveBar.classList.add('visible');
}

function clearChanges() {
  hasChanges = false;
  saveBar.classList.remove('visible');
}

function validateConfig() {
  const min = parseInt(privateDurationMin.value);
  const def = parseInt(privateDurationDefault.value);
  const max = parseInt(privateDurationMax.value);
  
  if (min > max) {
    showToast('Private pass: Min cannot be greater than max', true);
    return false;
  }
  
  if (def < min || def > max) {
    showToast('Private pass: Default must be between min and max', true);
    return false;
  }
  
  // Validate extra time range
  const etMin = parseInt(extraTimeMin.value);
  const etDef = parseInt(extraTimeDefault.value);
  const etMax = parseInt(extraTimeMax.value);
  
  if (etMin > etMax) {
    showToast('Extra time: Min cannot be greater than max', true);
    return false;
  }
  
  if (etDef < etMin || etDef > etMax) {
    showToast('Extra time: Default must be between min and max', true);
    return false;
  }
  
  for (const site of config.sites) {
    if (site.match === 'regex') {
      try {
        new RegExp(site.domain);
      } catch (e) {
        showToast(`Invalid regex: ${site.domain}`, true);
        return false;
      }
    }
  }
  
  return true;
}

function updateConfigFromInputs() {
  config.workDuration = parseInt(workDuration.value) || 60;
  config.privateDelay = parseInt(privateDelay.value) || 15;
  config.privateDurationMin = parseInt(privateDurationMin.value) || 5;
  config.privateDurationDefault = parseInt(privateDurationDefault.value) || 15;
  config.privateDurationMax = parseInt(privateDurationMax.value) || 30;
  config.extraTimeMin = parseInt(extraTimeMin.value) || 1;
  config.extraTimeDefault = parseInt(extraTimeDefault.value) || 5;
  config.extraTimeMax = parseInt(extraTimeMax.value) || 60;
}

[workDuration, privateDelay, privateDurationMin, privateDurationDefault, privateDurationMax, extraTimeMin, extraTimeDefault, extraTimeMax].forEach(input => {
  input.addEventListener('change', () => {
    updateConfigFromInputs();
    markChanged();
  });
});

btnAddSite.addEventListener('click', () => {
  const domain = newSiteDomain.value.trim();
  const name = newSiteName.value.trim();
  const match = newSiteMatch.value;
  
  if (!domain) return;
  
  let cleanDomain = domain;
  if (match !== 'regex') {
    cleanDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');
  }
  
  if (config.sites.find(s => s.domain === cleanDomain)) {
    showToast('Site already exists', true);
    return;
  }
  
  if (match === 'regex') {
    try {
      new RegExp(cleanDomain);
    } catch (e) {
      showToast('Invalid regex pattern', true);
      return;
    }
  }
  
  config.sites.push({
    domain: cleanDomain,
    name: name || cleanDomain,
    work: true,
    private: true,
    blocked: false,
    match: match,
    ration: false,
    rationMinutes: 5,
    askFeelings: true
  });
  
  newSiteDomain.value = '';
  newSiteName.value = '';
  newSiteMatch.value = 'base';
  
  renderSites();
  markChanged();
});

btnSave.addEventListener('click', async () => {
  if (!validateConfig()) return;
  
  await browser.runtime.sendMessage({ action: 'saveConfig', config });
  originalConfig = JSON.parse(JSON.stringify(config));
  clearChanges();
  showToast('Settings saved');
});

btnCancel.addEventListener('click', () => {
  config = JSON.parse(JSON.stringify(originalConfig));
  renderSites();
  renderSettings();
  clearChanges();
});

btnReset.addEventListener('click', async () => {
  if (!confirm('Reset all settings to defaults?')) return;
  
  await browser.storage.local.remove(['config']);
  config = await browser.runtime.sendMessage({ action: 'getConfig' });
  originalConfig = JSON.parse(JSON.stringify(config));
  
  renderSites();
  renderSettings();
  clearChanges();
  showToast('Reset to defaults');
});

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  
  setTimeout(() => {
    toast.classList.remove('visible');
  }, 2000);
}

window.addEventListener('beforeunload', (e) => {
  if (hasChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

btnAnalytics.addEventListener('click', () => {
  window.location.href = browser.runtime.getURL('analytics/analytics.html');
});

btnClearAnalytics.addEventListener('click', async () => {
  if (!confirm('Clear all analytics data? This cannot be undone.')) return;
  
  await browser.runtime.sendMessage({ action: 'clearAnalytics' });
  showToast('Analytics data cleared');
});

toggleTrackAll.addEventListener('click', () => {
  config.trackAllBrowsing = !config.trackAllBrowsing;
  renderSettings();
  markChanged();
});

init();
