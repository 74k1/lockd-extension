const browser = globalThis.browser || globalThis.chrome;

const statusEl = document.getElementById('status');
const toggleEl = document.getElementById('toggle-enabled');
const passesListEl = document.getElementById('passes-list');
const btnRevokeAll = document.getElementById('btn-revoke-all');
const btnSettings = document.getElementById('btn-settings');
const versionEl = document.getElementById('version');

let config = null;

async function init() {
  try {
    config = await browser.runtime.sendMessage({ action: 'getConfig' });
    const version = await browser.runtime.sendMessage({ action: 'getVersion' });
    
    if (version) {
      versionEl.textContent = `v${version}`;
    }
    
    if (config) {
      updateStatus();
      loadPasses();
    } else {
      console.error('[LOCKD] Failed to get config');
    }
  } catch (e) {
    console.error('[LOCKD] Init error:', e);
  }
}

function updateStatus() {
  if (config && config.enabled) {
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
  try {
    const passes = await browser.runtime.sendMessage({ action: 'getAllPasses' });
    
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
      revokeBtn.title = 'Revoke pass';
      
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
      revokeBtn.appendChild(svg);
      
      const domainToRevoke = domain;
      revokeBtn.addEventListener('click', async () => {
        await browser.runtime.sendMessage({ action: 'revokePass', domain: domainToRevoke });
        loadPasses();
      });
      
      infoEl.appendChild(tagEl);
      infoEl.appendChild(timeEl);
      infoEl.appendChild(revokeBtn);
      
      item.appendChild(domainEl);
      item.appendChild(infoEl);
      
      passesListEl.appendChild(item);
    }
  } catch (e) {
    console.error('[LOCKD] Load passes error:', e);
  }
}

toggleEl.addEventListener('click', async () => {
  if (!config) return;
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
