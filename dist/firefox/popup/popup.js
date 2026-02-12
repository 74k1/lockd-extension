const browser = globalThis.browser || globalThis.chrome;

const statusEl = document.getElementById('status');
const toggleEl = document.getElementById('toggle-enabled');
const passesListEl = document.getElementById('passes-list');
const rationListEl = document.getElementById('ration-list');
const btnRevokeAll = document.getElementById('btn-revoke-all');
const btnSettings = document.getElementById('btn-settings');
const btnAnalytics = document.getElementById('btn-analytics');
const versionEl = document.getElementById('version');
const rationCountEl = document.getElementById('ration-count');
const passCountEl = document.getElementById('pass-count');

// Tab elements
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');

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
      loadRationStatus();
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

// Tab switching
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;
    
    // Update tab buttons
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Update panels
    panels.forEach(panel => {
      panel.classList.remove('active');
      if (panel.id === `panel-${targetTab}`) {
        panel.classList.add('active');
      }
    });
  });
});

async function loadPasses() {
  try {
    const passes = await browser.runtime.sendMessage({ action: 'getAllPasses' });
    
    while (passesListEl.firstChild) {
      passesListEl.removeChild(passesListEl.firstChild);
    }
    
    const passEntries = passes ? Object.entries(passes) : [];
    passCountEl.textContent = passEntries.length;
    
    if (passEntries.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'empty-state';
      emptyEl.textContent = 'No active passes';
      passesListEl.appendChild(emptyEl);
      return;
    }
    
    for (const [domain, pass] of passEntries) {
      const remaining = Math.max(0, Math.ceil((pass.expiresAt - Date.now()) / 60000));
      
      const item = document.createElement('div');
      item.className = 'list-item';
      
      const domainEl = document.createElement('div');
      domainEl.className = 'item-domain';
      domainEl.textContent = domain;
      
      const infoEl = document.createElement('div');
      infoEl.className = 'item-info';
      
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
  } catch (e) {
    console.error('[LOCKD] Load passes error:', e);
  }
}

async function loadRationStatus() {
  try {
    const stats = await browser.runtime.sendMessage({ action: 'getUsageStats' });
    
    while (rationListEl.firstChild) {
      rationListEl.removeChild(rationListEl.firstChild);
    }
    
    const rationUsage = stats.rationUsage || {};
    const overtime = stats.overtime || {};
    const domains = Object.keys(rationUsage);
    
    rationCountEl.textContent = domains.length;
    
    if (domains.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'empty-state';
      emptyEl.textContent = 'No rationed sites configured';
      rationListEl.appendChild(emptyEl);
      return;
    }
    
    for (const domain of domains) {
      const usage = rationUsage[domain];
      const usedSeconds = usage.usedSeconds;
      const budgetSeconds = usage.budgetSeconds;
      const usedMinutes = Math.floor(usedSeconds / 60);
      const budgetMinutes = Math.floor(budgetSeconds / 60);
      
      // Get overtime info
      const domainOvertime = overtime[domain];
      const overtimeMinutes = domainOvertime ? domainOvertime.grantedMinutes : 0;
      
      // Calculate display values - use total budget including all overtime granted today
      const totalBudgetMinutes = budgetMinutes + overtimeMinutes;
      const totalBudgetSeconds = totalBudgetMinutes * 60;
      const percentage = totalBudgetSeconds > 0 
        ? Math.min(100, (usedSeconds / totalBudgetSeconds) * 100)
        : 100;
      
      // For split bar: purple portion is base budget, yellow is overtime used
      const basePortion = totalBudgetSeconds > 0
        ? (budgetSeconds / totalBudgetSeconds) * 100
        : 100;
      
      const item = document.createElement('div');
      item.className = 'list-item';
      
      // Build tooltip with detailed info
      const tooltipLines = [
        `Used: ${usedSeconds}s / ${totalBudgetSeconds}s total`,
        `Base: ${budgetSeconds}s (${budgetMinutes}m)`,
      ];
      if (overtimeMinutes > 0) {
        tooltipLines.push(`Overtime: +${overtimeMinutes}m`);
      }
      tooltipLines.push(`${percentage.toFixed(1)}% used`);
      item.title = tooltipLines.join('\n');
      
      const domainEl = document.createElement('div');
      domainEl.className = 'item-domain';
      domainEl.textContent = usage.name || domain;
      
      const infoEl = document.createElement('div');
      infoEl.className = 'item-info';
      
      const usageEl = document.createElement('span');
      usageEl.className = 'ration-usage';
      if (overtimeMinutes > 0) {
        // Show used in normal color, total in yellow (since overtime was used)
        usageEl.textContent = `${usedMinutes}/`;
        const totalSpan = document.createElement('span');
        totalSpan.style.color = 'var(--base0A)';
        totalSpan.textContent = `${totalBudgetMinutes}m`;
        usageEl.appendChild(totalSpan);
      } else {
        usageEl.textContent = `${usedMinutes}/${totalBudgetMinutes}m`;
      }
      
      const barEl = document.createElement('div');
      barEl.className = 'ration-bar';
      
      // Check if fully exhausted (used all base + overtime)
      const isFullyExhausted = usedSeconds >= totalBudgetSeconds && totalBudgetSeconds > 0;
      
      if (overtimeMinutes > 0) {
        // Split bar: purple (base) + yellow (overtime used)
        // Purple portion (base budget used)
        const baseFillEl = document.createElement('div');
        baseFillEl.className = 'ration-bar-fill';
        if (isFullyExhausted) {
          baseFillEl.classList.add('exhausted');
        }
        baseFillEl.style.width = `${Math.min(percentage, basePortion)}%`;
        barEl.appendChild(baseFillEl);
        
        // Yellow portion (overtime used) - only show used portion
        if (percentage > basePortion) {
          const overtimeFillEl = document.createElement('div');
          overtimeFillEl.className = 'ration-bar-fill overtime';
          if (isFullyExhausted) {
            overtimeFillEl.classList.add('exhausted');
          }
          overtimeFillEl.style.width = `${percentage - basePortion}%`;
          barEl.appendChild(overtimeFillEl);
        }
      } else {
        // No overtime - single bar
        const fillEl = document.createElement('div');
        fillEl.className = 'ration-bar-fill';
        if (isFullyExhausted) {
          fillEl.classList.add('exhausted');
        }
        fillEl.style.width = `${percentage}%`;
        barEl.appendChild(fillEl);
      }
      
      infoEl.appendChild(usageEl);
      infoEl.appendChild(barEl);
      
      item.appendChild(domainEl);
      item.appendChild(infoEl);
      
      rationListEl.appendChild(item);
    }
  } catch (e) {
    console.error('[LOCKD] Load ration status error:', e);
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

btnAnalytics.addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('analytics/analytics.html') });
});

btnSettings.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

init();

// Refresh passes every 30 seconds
setInterval(loadPasses, 30000);

// Refresh ration status every 5 seconds for near real-time updates
setInterval(loadRationStatus, 5000);
