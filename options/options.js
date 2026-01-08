const browser = globalThis.browser || globalThis.chrome;

let config = null;
let originalConfig = null;
let hasChanges = false;

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

const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const btnReset = document.getElementById('btn-reset');

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

function createXIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 14 14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'square');
  
  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '3');
  line1.setAttribute('y1', '3');
  line1.setAttribute('x2', '11');
  line1.setAttribute('y2', '11');
  
  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '11');
  line2.setAttribute('y1', '3');
  line2.setAttribute('x2', '3');
  line2.setAttribute('y2', '11');
  
  svg.appendChild(line1);
  svg.appendChild(line2);
  return svg;
}

function getMatchDisplayName(match) {
  switch (match) {
    case 'base': return 'Base Domain';
    case 'exact': return 'Exact';
    case 'regex': return 'Regex';
    default: return 'Base Domain';
  }
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

function renderSites() {
  while (sitesListEl.firstChild) {
    sitesListEl.removeChild(sitesListEl.firstChild);
  }
  
  config.sites.forEach((site, index) => {
    const item = document.createElement('div');
    item.className = 'site-item';
    
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
    
    const matchDiv = document.createElement('div');
    matchDiv.className = 'site-match';
    
    const matchSelect = document.createElement('select');
    
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
    matchSelect.addEventListener('change', () => {
      config.sites[index].match = matchSelect.value;
      markChanged();
    });
    matchDiv.appendChild(matchSelect);
    
    // Site options
    const siteOptions = document.createElement('div');
    siteOptions.className = 'site-options';
    
    const workGroup = createCheckboxGroup('Work', site.work, index, 'work');
    siteOptions.appendChild(workGroup);
    
    const privateGroup = createCheckboxGroup('Private', site.private, index, 'private');
    siteOptions.appendChild(privateGroup);
    
    const blockGroup = createCheckboxGroup('Block', site.blocked, index, 'blocked', true);
    siteOptions.appendChild(blockGroup);
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'site-remove';
    removeBtn.appendChild(createXIcon());
    removeBtn.addEventListener('click', () => {
      config.sites.splice(index, 1);
      renderSites();
      markChanged();
    });
    siteOptions.appendChild(removeBtn);
    
    item.appendChild(siteInfo);
    item.appendChild(matchDiv);
    item.appendChild(siteOptions);
    sitesListEl.appendChild(item);
  });
}

function createCheckboxGroup(label, checked, index, field, isBlocked = false) {
  const group = document.createElement('div');
  group.className = 'checkbox-group';
  
  const checkbox = document.createElement('div');
  checkbox.className = 'checkbox';
  if (checked) {
    checkbox.classList.add('checked');
    if (isBlocked) checkbox.classList.add('blocked');
  }
  checkbox.appendChild(createCheckIcon());
  
  checkbox.addEventListener('click', () => {
    config.sites[index][field] = !config.sites[index][field];
    
    if (field === 'blocked' && config.sites[index].blocked) {
      config.sites[index].work = false;
      config.sites[index].private = false;
    }
    
    if ((field === 'work' || field === 'private') && config.sites[index][field]) {
      config.sites[index].blocked = false;
    }
    
    renderSites();
    markChanged();
  });
  
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  
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
    showToast('Min cannot be greater than max', true);
    return false;
  }
  
  if (def < min || def > max) {
    showToast('Default must be between min and max', true);
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
}

[workDuration, privateDelay, privateDurationMin, privateDurationDefault, privateDurationMax].forEach(input => {
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
    match: match
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

init();
