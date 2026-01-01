// LOCKD - Popup Script

const browser = globalThis.browser || globalThis.chrome;

const statusEl = document.getElementById('status');
const toggleEl = document.getElementById('toggle-enabled');
const passesListEl = document.getElementById('passes-list');
const btnRevokeAll = document.getElementById('btn-revoke-all');
const btnSettings = document.getElementById('btn-settings');

let config = null;

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
  
  if (!passes || Object.keys(passes).length === 0) {
    passesListEl.innerHTML = '<div class="no-passes">No active passes</div>';
    return;
  }
  
  passesListEl.innerHTML = '';
  
  for (const [domain, pass] of Object.entries(passes)) {
    const remaining = Math.max(0, Math.ceil((pass.expiresAt - Date.now()) / 60000));
    
    const item = document.createElement('div');
    item.className = 'pass-item';
    item.innerHTML = `
      <div class="pass-domain">${domain}</div>
      <div class="pass-info">
        <span class="tag ${pass.type}">${pass.type}</span>
        <span class="pass-time">${remaining}m</span>
        <button class="pass-revoke" data-domain="${domain}">✕</button>
      </div>
    `;
    
    passesListEl.appendChild(item);
  }
  
  document.querySelectorAll('.pass-revoke').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const domain = e.target.dataset.domain;
      await browser.runtime.sendMessage({ action: 'revokePass', domain });
      loadPasses();
    });
  });
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
