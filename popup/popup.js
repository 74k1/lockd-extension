const browser = globalThis.browser || globalThis.chrome;

const statusEl = document.getElementById('status');
const toggleEl = document.getElementById('toggle-enabled');
const passesListEl = document.getElementById('passes-list');
const btnRevokeAll = document.getElementById('btn-revoke-all');
const btnSettings = document.getElementById('btn-settings');

let config = null;

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

async function init() {
  config = await browser.runtime.sendMessage({ action: 'getConfig' });
  
  updateStatus();
  loadPasses();
}

function updateStatus() {
  if (config.enabled) {
    statusEl.textContent = 'ACTIVE';
    statusEl.className = 'status enabled';
    toggleEl.classList.add('active');
  } else {
    statusEl.textContent = 'DISABLED';
    statusEl.className = 'status disabled';
    toggleEl.classList.remove('active');
  }
}

async function loadPasses() {
  const passes = await browser.runtime.sendMessage({ action: 'getAllPasses' });
  
  // Clear existing content
  while (passesListEl.firstChild) {
    passesListEl.removeChild(passesListEl.firstChild);
  }
  
  if (!passes || Object.keys(passes).length === 0) {
    const noPassesEl = document.createElement('div');
    noPassesEl.className = 'no-passes';
    noPassesEl.textContent = 'No active passes';
    passesListEl.appendChild(noPassesEl);
    return;
  }
  
  for (const [domain, pass] of Object.entries(passes)) {
    const remaining = Math.max(0, Math.ceil((pass.expiresAt - Date.now()) / 60000));
    
    const item = document.createElement('div');
    item.className = 'pass-item';
    
    const domainEl = document.createElement('div');
    domainEl.className = 'pass-domain';
    domainEl.textContent = domain;
    
    const infoEl = document.createElement('div');
    infoEl.className = 'pass-info';
    
    const tagEl = document.createElement('span');
    tagEl.className = `tag ${pass.type}`;
    tagEl.textContent = pass.type;
    
    const timeEl = document.createElement('span');
    timeEl.className = 'pass-time';
    timeEl.textContent = `${remaining}m`;
    
    const revokeBtn = document.createElement('button');
    revokeBtn.className = 'pass-revoke';
    revokeBtn.dataset.domain = domain;
    revokeBtn.appendChild(createXIcon());
    revokeBtn.addEventListener('click', async () => {
      await browser.runtime.sendMessage({ action: 'revokePass', domain });
      loadPasses();
    });
    
    infoEl.appendChild(tagEl);
    infoEl.appendChild(timeEl);
    infoEl.appendChild(revokeBtn);
    
    item.appendChild(domainEl);
    item.appendChild(infoEl);
    
    passesListEl.appendChild(item);
  }
}

toggleEl.addEventListener('click', async () => {
  config.enabled = !config.enabled;
  await browser.runtime.sendMessage({ action: 'saveConfig', config });
  updateStatus();
});

btnRevokeAll.addEventListener('click', async () => {
  await browser.runtime.sendMessage({ action: 'revokeAllPasses' });
  loadPasses();
});

btnSettings.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

init();

setInterval(loadPasses, 30000);
