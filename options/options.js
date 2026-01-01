// LOCKD - Options Script

const browser = globalThis.browser || globalThis.chrome;

let config = null;
let originalConfig = null;
let hasChanges = false;

const sitesListEl = document.getElementById('sites-list');
const saveBar = document.getElementById('save-bar');
const toast = document.getElementById('toast');

const newSiteDomain = document.getElementById('new-site-domain');
const newSiteName = document.getElementById('new-site-name');
const btnAddSite = document.getElementById('btn-add-site');

const workDuration = document.getElementById('work-duration');
const privateDelay = document.getElementById('private-delay');
const privateDurationMin = document.getElementById('private-duration-min');
const privateDurationDefault = document.getElementById('private-duration-default');
const privateDurationMax = document.getElementById('private-duration-max');

const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const btnReset = document.getElementById('btn-reset');

// SVG icons
const checkIcon = `<svg viewBox="0 0 12 12" fill="none" stroke="#07060B" stroke-width="2" stroke-linecap="square"><polyline points="2,6 5,9 10,3"></polyline></svg>`;
const xIcon = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><line x1="3" y1="3" x2="11" y2="11"></line><line x1="11" y1="3" x2="3" y2="11"></line></svg>`;

async function init() {
  config = await browser.runtime.sendMessage({ action: 'getConfig' });
  originalConfig = JSON.parse(JSON.stringify(config));
  
  renderSites();
  renderSettings();
}

function renderSites() {
  sitesListEl.innerHTML = '';
  
  config.sites.forEach((site, index) => {
    const item = document.createElement('div');
    item.className = 'site-item';
    item.innerHTML = `
      <div class="site-info">
        <div class="site-domain">${site.domain}</div>
        ${site.name && site.name !== site.domain ? `<div class="site-name">${site.name}</div>` : ''}
      </div>
      <div class="site-options">
        <div class="checkbox-group">
          <div class="checkbox ${site.work ? 'checked' : ''}" data-index="${index}" data-field="work">${checkIcon}</div>
          <label>Work</label>
        </div>
        <div class="checkbox-group">
          <div class="checkbox ${site.private ? 'checked' : ''}" data-index="${index}" data-field="private">${checkIcon}</div>
          <label>Private</label>
        </div>
        <div class="checkbox-group">
          <div class="checkbox ${site.blocked ? 'checked blocked' : ''}" data-index="${index}" data-field="blocked">${checkIcon}</div>
          <label>Block</label>
        </div>
        <button class="site-remove" data-index="${index}">${xIcon}</button>
      </div>
    `;
    
    sitesListEl.appendChild(item);
  });
  
  document.querySelectorAll('.checkbox').forEach(cb => {
    cb.addEventListener('click', () => {
      const index = parseInt(cb.dataset.index);
      const field = cb.dataset.field;
      
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
  });
  
  document.querySelectorAll('.site-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      config.sites.splice(index, 1);
      renderSites();
      markChanged();
    });
  });
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
  
  return true;
}

function updateConfigFromInputs() {
  config.workDuration = parseInt(workDuration.value) || 60;
  config.privateDelay = parseInt(privateDelay.value) || 15;
  config.privateDurationMin = parseInt(privateDurationMin.value) || 5;
  config.privateDurationDefault = parseInt(privateDurationDefault.value) || 15;
  config.privateDurationMax = parseInt(privateDurationMax.value) || 30;
}

// Setting inputs
[workDuration, privateDelay, privateDurationMin, privateDurationDefault, privateDurationMax].forEach(input => {
  input.addEventListener('change', () => {
    updateConfigFromInputs();
    markChanged();
  });
});

btnAddSite.addEventListener('click', () => {
  const domain = newSiteDomain.value.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');
  const name = newSiteName.value.trim();
  
  if (!domain) return;
  
  if (config.sites.find(s => s.domain === domain)) {
    showToast('Site already exists', true);
    return;
  }
  
  config.sites.push({
    domain,
    name: name || domain,
    work: true,
    private: true,
    blocked: false
  });
  
  newSiteDomain.value = '';
  newSiteName.value = '';
  
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
