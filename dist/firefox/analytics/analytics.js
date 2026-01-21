const browser = globalThis.browser || globalThis.chrome;

console.log('[LOCKD Analytics] Script loaded, browser:', browser ? 'available' : 'NOT available');

// Site colors from palette (8 distinct colors, no grays/black/white)
const SITE_COLORS = [
  'var(--base0D)', // blue
  'var(--base0E)', // purple
  'var(--base0B)', // green
  'var(--base09)', // orange
  'var(--base0C)', // cyan
  'var(--base08)', // red
  'var(--base0A)', // yellow
  'var(--base0F)', // brown/magenta
];

// Maximum number of sites to show with distinct colors (rest go to "Others")
const MAX_COLORED_SITES = SITE_COLORS.length;

// State
let analyticsData = {};
let siteColorMap = {};

// DOM Elements
const tooltip = document.getElementById('tooltip');
const heatmapEl = document.getElementById('heatmap');
const heatmapMonthsEl = document.getElementById('heatmap-months');
const trendChartEl = document.getElementById('trend-chart');
const trendLegendEl = document.getElementById('trend-legend');
const sitesListEl = document.getElementById('sites-list');
const peakHoursEl = document.getElementById('peak-hours');
const peakSummaryEl = document.getElementById('peak-summary');
const feelingsBarsEl = document.getElementById('feelings-bars');

// Controls
const globalRangeSelect = document.getElementById('global-range');
const heatmapRangeSelect = document.getElementById('heatmap-range');
const heatmapYearSelect = document.getElementById('heatmap-year');

// Utility Functions
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatTimeShort(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function getDateString(date) {
  return date.toISOString().split('T')[0];
}

function getDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function getSiteColor(domain, index) {
  if (!siteColorMap[domain]) {
    siteColorMap[domain] = index % SITE_COLORS.length;
  }
  return SITE_COLORS[siteColorMap[domain]];
}

function getSiteColorClass(domain, index) {
  if (!siteColorMap[domain]) {
    siteColorMap[domain] = index % SITE_COLORS.length;
  }
  return `site-color-${siteColorMap[domain]}`;
}

// Tooltip handling
function showTooltip(e, content) {
  tooltip.innerHTML = content;
  tooltip.style.display = 'block';
  
  const x = e.clientX + 10;
  const y = e.clientY + 10;
  
  // Keep tooltip in viewport
  const rect = tooltip.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 20;
  const maxY = window.innerHeight - rect.height - 20;
  
  tooltip.style.left = Math.min(x, maxX) + 'px';
  tooltip.style.top = Math.min(y, maxY) + 'px';
}

function hideTooltip() {
  tooltip.style.display = 'none';
}

// Data Loading
async function loadAnalytics() {
  console.log('[LOCKD Analytics] loadAnalytics called');
  try {
    analyticsData = await browser.runtime.sendMessage({ action: 'getAnalytics' });
    console.log('[LOCKD Analytics] Got analytics data:', analyticsData);
    
    const version = await browser.runtime.sendMessage({ action: 'getVersion' });
    document.getElementById('version').textContent = `v${version}`;
    
    // Populate year selector with available years
    populateYearSelector();
    
    // Render all sections
    renderStats();
    renderHeatmap();
    renderTrend();
    renderTopSites();
    renderPeakHours();
    renderFeelings();
    console.log('[LOCKD Analytics] Rendering complete');
  } catch (e) {
    console.error('[LOCKD Analytics] Failed to load analytics:', e);
  }
}

function populateYearSelector() {
  const years = new Set();
  const currentYear = new Date().getFullYear();
  years.add(currentYear);
  
  for (const date of Object.keys(analyticsData)) {
    years.add(parseInt(date.split('-')[0]));
  }
  
  heatmapYearSelect.innerHTML = '';
  Array.from(years).sort((a, b) => b - a).forEach(year => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    heatmapYearSelect.appendChild(option);
  });
}

function getFilteredData(days) {
  if (days === 'all') {
    return analyticsData;
  }
  
  const startDate = getDateString(getDaysAgo(parseInt(days)));
  const filtered = {};
  
  for (const [date, data] of Object.entries(analyticsData)) {
    if (date >= startDate) {
      filtered[date] = data;
    }
  }
  
  return filtered;
}

// Get current global range value
function getGlobalRange() {
  return globalRangeSelect.value;
}

// Stats Summary
function renderStats() {
  const data = getFilteredData(getGlobalRange());
  
  let totalSeconds = 0;
  let totalBlocks = 0;
  const sites = new Set();
  let daysWithData = 0;
  
  for (const [date, domains] of Object.entries(data)) {
    let dayHasData = false;
    for (const [domain, info] of Object.entries(domains)) {
      totalSeconds += info.totalSeconds || 0;
      totalBlocks += info.blocks || 0;
      sites.add(domain);
      if (info.totalSeconds > 0) dayHasData = true;
    }
    if (dayHasData) daysWithData++;
  }
  
  const avgDaily = daysWithData > 0 ? Math.round(totalSeconds / daysWithData) : 0;
  
  document.getElementById('total-time').textContent = formatTime(totalSeconds);
  document.getElementById('total-sites').textContent = sites.size;
  document.getElementById('total-blocks').textContent = totalBlocks;
  document.getElementById('avg-daily').textContent = formatTime(avgDaily);
}

// Heatmap Rendering
function renderHeatmap() {
  const mode = heatmapRangeSelect.value;
  const selectedYear = parseInt(heatmapYearSelect.value);
  
  // Hide/show year selector based on mode
  heatmapYearSelect.style.display = mode === 'rolling' ? 'none' : 'block';
  
  heatmapEl.innerHTML = '';
  heatmapMonthsEl.innerHTML = '';
  
  let startDate, endDate;
  
  if (mode === 'rolling') {
    endDate = new Date();
    startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 12);
  } else {
    startDate = new Date(selectedYear, 0, 1);
    endDate = new Date(selectedYear, 11, 31);
  }
  
  // Get daily totals
  const dailyTotals = {};
  let maxTotal = 0;
  
  for (const [date, domains] of Object.entries(analyticsData)) {
    let total = 0;
    for (const info of Object.values(domains)) {
      total += info.totalSeconds || 0;
    }
    dailyTotals[date] = total;
    if (total > maxTotal) maxTotal = total;
  }
  
  // Create week columns
  const weeks = [];
  let currentDate = new Date(startDate);
  
  // Align to start of week (Sunday)
  while (currentDate.getDay() !== 0) {
    currentDate.setDate(currentDate.getDate() - 1);
  }
  
  while (currentDate <= endDate) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    weeks.push(week);
  }
  
  // Render month labels
  const monthLabels = [];
  let lastMonth = -1;
  
  weeks.forEach((week, weekIndex) => {
    const firstDay = week.find(d => d >= startDate && d <= endDate);
    if (firstDay) {
      const month = firstDay.getMonth();
      if (month !== lastMonth) {
        monthLabels.push({ month, weekIndex });
        lastMonth = month;
      }
    }
  });
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  monthLabels.forEach((label, i) => {
    const span = document.createElement('span');
    span.className = 'heatmap-month';
    span.textContent = monthNames[label.month];
    span.style.marginLeft = i === 0 ? '0' : `${(label.weekIndex - (monthLabels[i-1]?.weekIndex || 0) - 1) * 15}px`;
    heatmapMonthsEl.appendChild(span);
  });
  
  // Render day rows
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  for (let day = 0; day < 7; day++) {
    const row = document.createElement('div');
    row.className = 'heatmap-row';
    
    const label = document.createElement('div');
    label.className = 'heatmap-label';
    label.textContent = day % 2 === 1 ? dayLabels[day] : '';
    row.appendChild(label);
    
    weeks.forEach(week => {
      const date = week[day];
      const dateStr = getDateString(date);
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      
      if (date < startDate || date > endDate) {
        cell.style.visibility = 'hidden';
      } else {
        const total = dailyTotals[dateStr] || 0;
        const level = getHeatmapLevel(total, maxTotal);
        cell.setAttribute('data-level', level);
        
        cell.addEventListener('mouseenter', (e) => {
          showTooltip(e, `
            <div class="tooltip-date">${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
            <div class="tooltip-value">${formatTime(total)}</div>
          `);
        });
        cell.addEventListener('mousemove', (e) => showTooltip(e, tooltip.innerHTML));
        cell.addEventListener('mouseleave', hideTooltip);
      }
      
      row.appendChild(cell);
    });
    
    heatmapEl.appendChild(row);
  }
}

function getHeatmapLevel(value, max) {
  if (value === 0) return 0;
  if (max === 0) return 0;
  
  const ratio = value / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

// Daily Trend Rendering
function renderTrend() {
  const range = getGlobalRange();
  const days = range === 'all' ? 90 : parseInt(range); // Default to 90 for "all"
  
  trendChartEl.innerHTML = '';
  trendLegendEl.innerHTML = '';
  
  // Get data for date range
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(getDateString(getDaysAgo(i)));
  }
  
  // Get all domains and their totals
  const domainTotals = {};
  dates.forEach(date => {
    const dayData = analyticsData[date] || {};
    for (const [domain, info] of Object.entries(dayData)) {
      domainTotals[domain] = (domainTotals[domain] || 0) + (info.totalSeconds || 0);
    }
  });
  
  // Sort domains by total and take top MAX_COLORED_SITES
  const sortedDomains = Object.entries(domainTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_COLORED_SITES)
    .map(([domain]) => domain);
  
  // Assign colors
  sortedDomains.forEach((domain, i) => getSiteColor(domain, i));
  
  // Find max daily total for scaling
  let maxDayTotal = 0;
  dates.forEach(date => {
    const dayData = analyticsData[date] || {};
    let dayTotal = 0;
    for (const info of Object.values(dayData)) {
      dayTotal += info.totalSeconds || 0;
    }
    if (dayTotal > maxDayTotal) maxDayTotal = dayTotal;
  });
  
  // Render bars
  dates.forEach((date, i) => {
    const dayData = analyticsData[date] || {};
    
    const container = document.createElement('div');
    container.className = 'trend-bar-container';
    
    const bar = document.createElement('div');
    bar.className = 'trend-bar';
    
    let tooltipContent = `<div class="tooltip-date">${new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>`;
    
    sortedDomains.forEach((domain, di) => {
      const info = dayData[domain];
      const seconds = info?.totalSeconds || 0;
      
      if (seconds > 0) {
        const segment = document.createElement('div');
        segment.className = 'trend-bar-segment';
        segment.style.backgroundColor = getSiteColor(domain, di);
        segment.style.height = maxDayTotal > 0 ? `${(seconds / maxDayTotal) * 130}px` : '0';
        bar.appendChild(segment);
        
        tooltipContent += `<div style="color: ${getSiteColor(domain, di)}">${domain}: ${formatTime(seconds)}</div>`;
      }
    });
    
    // Add "other" domains
    let otherSeconds = 0;
    for (const [domain, info] of Object.entries(dayData)) {
      if (!sortedDomains.includes(domain)) {
        otherSeconds += info.totalSeconds || 0;
      }
    }
    
    if (otherSeconds > 0) {
      const segment = document.createElement('div');
      segment.className = 'trend-bar-segment';
      segment.style.backgroundColor = 'var(--base03)';
      segment.style.height = maxDayTotal > 0 ? `${(otherSeconds / maxDayTotal) * 130}px` : '0';
      bar.appendChild(segment);
      tooltipContent += `<div style="color: var(--base03)">Others: ${formatTime(otherSeconds)}</div>`;
    }
    
    bar.addEventListener('mouseenter', (e) => showTooltip(e, tooltipContent));
    bar.addEventListener('mousemove', (e) => showTooltip(e, tooltipContent));
    bar.addEventListener('mouseleave', hideTooltip);
    
    container.appendChild(bar);
    
    // Date label (show every few days depending on range)
    const showLabel = days <= 14 || i % Math.ceil(days / 10) === 0;
    if (showLabel) {
      const dateLabel = document.createElement('div');
      dateLabel.className = 'trend-date';
      dateLabel.textContent = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      container.appendChild(dateLabel);
    }
    
    trendChartEl.appendChild(container);
  });
  
  // Render legend
  sortedDomains.forEach((domain, i) => {
    const item = document.createElement('div');
    item.className = 'trend-legend-item';
    
    const color = document.createElement('div');
    color.className = `trend-legend-color trend-legend-color-${siteColorMap[domain]}`;
    
    const label = document.createElement('span');
    label.textContent = domain;
    
    item.appendChild(color);
    item.appendChild(label);
    trendLegendEl.appendChild(item);
  });
  
  // Add "Others" to legend if there are more sites than MAX_COLORED_SITES
  if (Object.keys(domainTotals).length > MAX_COLORED_SITES) {
    const item = document.createElement('div');
    item.className = 'trend-legend-item';
    
    const color = document.createElement('div');
    color.className = 'trend-legend-color';
    color.style.backgroundColor = 'var(--base03)';
    
    const label = document.createElement('span');
    label.textContent = 'Others';
    
    item.appendChild(color);
    item.appendChild(label);
    trendLegendEl.appendChild(item);
  }
}

// Top Sites Rendering
function renderTopSites() {
  const range = getGlobalRange();
  const data = getFilteredData(range);
  
  sitesListEl.innerHTML = '';
  
  // Aggregate data by domain
  const domainData = {};
  
  for (const domains of Object.values(data)) {
    for (const [domain, info] of Object.entries(domains)) {
      if (!domainData[domain]) {
        domainData[domain] = { totalSeconds: 0, paths: {} };
      }
      domainData[domain].totalSeconds += info.totalSeconds || 0;
      
      for (const [path, seconds] of Object.entries(info.paths || {})) {
        domainData[domain].paths[path] = (domainData[domain].paths[path] || 0) + seconds;
      }
    }
  }
  
  // Sort by total time
  const sortedDomains = Object.entries(domainData)
    .sort((a, b) => b[1].totalSeconds - a[1].totalSeconds);
  
  if (sortedDomains.length === 0) {
    sitesListEl.innerHTML = '<div class="no-data">No data yet. Start browsing to see your analytics!</div>';
    return;
  }
  
  // Split into top sites (with colors) and others
  const topSites = sortedDomains.slice(0, MAX_COLORED_SITES);
  const otherSites = sortedDomains.slice(MAX_COLORED_SITES);
  
  // Calculate "Others" aggregate
  let othersData = null;
  if (otherSites.length > 0) {
    othersData = {
      totalSeconds: otherSites.reduce((sum, [, d]) => sum + d.totalSeconds, 0),
      paths: {},
      sites: otherSites.map(([domain]) => domain)
    };
  }
  
  const maxSeconds = topSites[0][1].totalSeconds;
  const totalSeconds = sortedDomains.reduce((sum, [, d]) => sum + d.totalSeconds, 0);
  
  // Render top sites with colors
  topSites.forEach(([domain, info], index) => {
    const item = document.createElement('div');
    item.className = 'site-item';
    
    const header = document.createElement('div');
    header.className = 'site-header';
    
    const colorBox = document.createElement('div');
    colorBox.className = `site-color ${getSiteColorClass(domain, index)}`;
    
    const name = document.createElement('div');
    name.className = 'site-name';
    name.textContent = domain;
    
    const time = document.createElement('div');
    time.className = 'site-time';
    time.textContent = formatTime(info.totalSeconds);
    
    const barContainer = document.createElement('div');
    barContainer.className = 'site-bar-container';
    
    const bar = document.createElement('div');
    bar.className = `site-bar ${getSiteColorClass(domain, index)}`;
    bar.style.width = `${(info.totalSeconds / maxSeconds) * 100}%`;
    
    barContainer.appendChild(bar);
    
    const percent = document.createElement('div');
    percent.className = 'site-percent';
    percent.textContent = `${Math.round((info.totalSeconds / totalSeconds) * 100)}%`;
    
    const expand = document.createElement('div');
    expand.className = 'site-expand';
    expand.textContent = Object.keys(info.paths).length > 0 ? '▼' : '';
    
    header.appendChild(colorBox);
    header.appendChild(name);
    header.appendChild(time);
    header.appendChild(barContainer);
    header.appendChild(percent);
    header.appendChild(expand);
    
    // Paths
    const pathsContainer = document.createElement('div');
    pathsContainer.className = 'site-paths';
    
    const sortedPaths = Object.entries(info.paths)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    const maxPathSeconds = sortedPaths[0]?.[1] || 1;
    
    sortedPaths.forEach(([path, seconds]) => {
      const pathItem = document.createElement('div');
      pathItem.className = 'path-item';
      
      const pathName = document.createElement('div');
      pathName.className = 'path-name';
      pathName.textContent = `/${path}`;
      
      const pathTime = document.createElement('div');
      pathTime.className = 'path-time';
      pathTime.textContent = formatTime(seconds);
      
      const pathBarContainer = document.createElement('div');
      pathBarContainer.className = 'path-bar-container';
      
      const pathBar = document.createElement('div');
      pathBar.className = 'path-bar';
      pathBar.style.width = `${(seconds / maxPathSeconds) * 100}%`;
      
      pathBarContainer.appendChild(pathBar);
      
      pathItem.appendChild(pathName);
      pathItem.appendChild(pathTime);
      pathItem.appendChild(pathBarContainer);
      pathsContainer.appendChild(pathItem);
    });
    
    header.addEventListener('click', () => {
      if (Object.keys(info.paths).length > 0) {
        item.classList.toggle('expanded');
      }
    });
    
    item.appendChild(header);
    item.appendChild(pathsContainer);
    sitesListEl.appendChild(item);
  });
  
  // Render "Others" row if there are overflow sites
  if (othersData) {
    const item = document.createElement('div');
    item.className = 'site-item';
    
    const header = document.createElement('div');
    header.className = 'site-header';
    
    const colorBox = document.createElement('div');
    colorBox.className = 'site-color';
    colorBox.style.backgroundColor = 'var(--base03)';
    
    const name = document.createElement('div');
    name.className = 'site-name';
    name.textContent = `Others (${othersData.sites.length} sites)`;
    name.style.color = 'var(--base04)';
    
    const time = document.createElement('div');
    time.className = 'site-time';
    time.textContent = formatTime(othersData.totalSeconds);
    
    const barContainer = document.createElement('div');
    barContainer.className = 'site-bar-container';
    
    const bar = document.createElement('div');
    bar.className = 'site-bar';
    bar.style.backgroundColor = 'var(--base03)';
    bar.style.width = `${(othersData.totalSeconds / maxSeconds) * 100}%`;
    
    barContainer.appendChild(bar);
    
    const percent = document.createElement('div');
    percent.className = 'site-percent';
    percent.textContent = `${Math.round((othersData.totalSeconds / totalSeconds) * 100)}%`;
    
    const expand = document.createElement('div');
    expand.className = 'site-expand';
    expand.textContent = '▼';
    
    header.appendChild(colorBox);
    header.appendChild(name);
    header.appendChild(time);
    header.appendChild(barContainer);
    header.appendChild(percent);
    header.appendChild(expand);
    
    // List the individual sites in "Others"
    const pathsContainer = document.createElement('div');
    pathsContainer.className = 'site-paths';
    
    // Sort other sites by time and show them
    const sortedOthers = otherSites.sort((a, b) => b[1].totalSeconds - a[1].totalSeconds);
    const maxOtherSeconds = sortedOthers[0]?.[1].totalSeconds || 1;
    
    sortedOthers.forEach(([domain, info]) => {
      const pathItem = document.createElement('div');
      pathItem.className = 'path-item';
      
      const pathName = document.createElement('div');
      pathName.className = 'path-name';
      pathName.textContent = domain;
      
      const pathTime = document.createElement('div');
      pathTime.className = 'path-time';
      pathTime.textContent = formatTime(info.totalSeconds);
      
      const pathBarContainer = document.createElement('div');
      pathBarContainer.className = 'path-bar-container';
      
      const pathBar = document.createElement('div');
      pathBar.className = 'path-bar';
      pathBar.style.width = `${(info.totalSeconds / maxOtherSeconds) * 100}%`;
      
      pathBarContainer.appendChild(pathBar);
      
      pathItem.appendChild(pathName);
      pathItem.appendChild(pathTime);
      pathItem.appendChild(pathBarContainer);
      pathsContainer.appendChild(pathItem);
    });
    
    header.addEventListener('click', () => {
      item.classList.toggle('expanded');
    });
    
    item.appendChild(header);
    item.appendChild(pathsContainer);
    sitesListEl.appendChild(item);
  }
}

// Peak Hours Rendering
function renderPeakHours() {
  const range = getGlobalRange();
  const data = getFilteredData(range);
  
  peakHoursEl.innerHTML = '';
  
  // Aggregate hourly data
  const hourlyTotals = {};
  for (let h = 0; h < 24; h++) {
    hourlyTotals[h] = 0;
  }
  
  for (const domains of Object.values(data)) {
    for (const info of Object.values(domains)) {
      for (const [hour, seconds] of Object.entries(info.hours || {})) {
        hourlyTotals[parseInt(hour)] += seconds;
      }
    }
  }
  
  const maxHourly = Math.max(...Object.values(hourlyTotals));
  
  // Find peak hours
  const peakHour = Object.entries(hourlyTotals)
    .sort((a, b) => b[1] - a[1])[0];
  
  for (let h = 0; h < 24; h++) {
    const container = document.createElement('div');
    container.className = 'peak-hour';
    
    const bar = document.createElement('div');
    bar.className = 'peak-bar';
    bar.style.height = maxHourly > 0 ? `${(hourlyTotals[h] / maxHourly) * 60}px` : '0';
    
    bar.addEventListener('mouseenter', (e) => {
      showTooltip(e, `
        <div class="tooltip-date">${h.toString().padStart(2, '0')}:00 - ${(h + 1).toString().padStart(2, '0')}:00</div>
        <div class="tooltip-value">${formatTime(hourlyTotals[h])}</div>
      `);
    });
    bar.addEventListener('mousemove', (e) => showTooltip(e, tooltip.innerHTML));
    bar.addEventListener('mouseleave', hideTooltip);
    
    const label = document.createElement('div');
    label.className = 'peak-label';
    label.textContent = h % 3 === 0 ? `${h.toString().padStart(2, '0')}` : '';
    
    container.appendChild(bar);
    container.appendChild(label);
    peakHoursEl.appendChild(container);
  }
  
  // Summary
  if (peakHour && peakHour[1] > 0) {
    const h = parseInt(peakHour[0]);
    peakSummaryEl.innerHTML = `Most active: <strong>${h.toString().padStart(2, '0')}:00 - ${(h + 1).toString().padStart(2, '0')}:00</strong> (${formatTime(peakHour[1])} total)`;
  } else {
    peakSummaryEl.innerHTML = 'No data yet';
  }
}

// Feelings Rendering
function renderFeelings() {
  const range = getGlobalRange();
  const data = getFilteredData(range);
  
  feelingsBarsEl.innerHTML = '';
  
  // Aggregate feelings
  const feelings = { positive: 0, neutral: 0, negative: 0 };
  
  for (const domains of Object.values(data)) {
    for (const info of Object.values(domains)) {
      for (const feeling of (info.feelings || [])) {
        if (feelings[feeling] !== undefined) {
          feelings[feeling]++;
        }
      }
    }
  }
  
  const total = feelings.positive + feelings.neutral + feelings.negative;
  const max = Math.max(feelings.positive, feelings.neutral, feelings.negative, 1);
  
  const labels = {
    positive: 'Worth it',
    neutral: 'Meh',
    negative: 'Regret'
  };
  
  ['positive', 'neutral', 'negative'].forEach(type => {
    const row = document.createElement('div');
    row.className = 'feeling-row';
    
    const label = document.createElement('div');
    label.className = 'feeling-label';
    label.textContent = labels[type];
    
    const barContainer = document.createElement('div');
    barContainer.className = 'feeling-bar-container';
    
    const bar = document.createElement('div');
    bar.className = `feeling-bar ${type}`;
    bar.style.width = `${(feelings[type] / max) * 100}%`;
    
    barContainer.appendChild(bar);
    
    const count = document.createElement('div');
    count.className = 'feeling-count';
    const percent = total > 0 ? Math.round((feelings[type] / total) * 100) : 0;
    count.textContent = `${feelings[type]} (${percent}%)`;
    
    row.appendChild(label);
    row.appendChild(barContainer);
    row.appendChild(count);
    feelingsBarsEl.appendChild(row);
  });
  
  if (total === 0) {
    feelingsBarsEl.innerHTML = '<div class="no-data">No feelings recorded yet</div>';
  }
}

// Render all sections that use global range
function renderAllSections() {
  renderStats();
  renderTrend();
  renderTopSites();
  renderPeakHours();
  renderFeelings();
}

// Event Listeners
globalRangeSelect.addEventListener('change', renderAllSections);
heatmapRangeSelect.addEventListener('change', renderHeatmap);
heatmapYearSelect.addEventListener('change', renderHeatmap);

// Initialize
loadAnalytics();

// =============================================================================
// DEBUG: Mock data generator for screenshots
// Usage: Open console and run: LOCKD_DEBUG.generateMockData()
// To clear: LOCKD_DEBUG.clearMockData()
// =============================================================================
window.LOCKD_DEBUG = {
  generateMockData: async function(days = 90) {
    const sites = [
      { domain: 'reddit.com', weight: 1.0, paths: ['r/programming', 'r/webdev', 'r/javascript', 'r/linux', 'r/unixporn'] },
      { domain: 'youtube.com', weight: 0.85, paths: ['watch', '@veritasium', '@3blue1brown', 'shorts'] },
      { domain: '4chan.org', weight: 0.6, paths: ['g', 'wg', 'w', 'v'] },
      { domain: 'github.com', weight: 0.7, paths: ['torvalds/linux', 'microsoft/vscode', 'neovim/neovim'] },
      { domain: 'twitter.com', weight: 0.5, paths: [] },
      { domain: 'twitch.tv', weight: 0.45, paths: ['piratesoftware', 'theprimeagen', 'tsoding'] },
      { domain: 'news.ycombinator.com', weight: 0.55, paths: [] },
      { domain: 'stackoverflow.com', weight: 0.4, paths: ['questions', 'tags'] },
      { domain: 'discord.com', weight: 0.35, paths: [] },
      { domain: 'linkedin.com', weight: 0.15, paths: [] },
      { domain: 'medium.com', weight: 0.2, paths: [] },
      { domain: 'netflix.com', weight: 0.25, paths: [] },
    ];
    
    const mockData = {};
    const now = new Date();
    
    for (let d = 0; d < days; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];
      
      // Weekend vs weekday activity patterns
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const dayMultiplier = isWeekend ? 1.3 : 1.0;
      
      // Some random daily variation
      const dailyVariation = 0.5 + Math.random() * 1.0;
      
      mockData[dateStr] = {};
      
      sites.forEach(site => {
        // Not every site every day
        if (Math.random() > 0.7 + (site.weight * 0.3)) return;
        
        // Base seconds: 5-60 minutes, weighted by site importance
        const baseSeconds = Math.floor((300 + Math.random() * 3300) * site.weight * dayMultiplier * dailyVariation);
        
        // Generate hourly distribution (peak at 10-12, 14-16, 20-23)
        const hours = {};
        const peakHours = [10, 11, 14, 15, 20, 21, 22];
        let remainingSeconds = baseSeconds;
        
        // Distribute across 4-8 random hours
        const activeHours = Math.floor(4 + Math.random() * 5);
        for (let h = 0; h < activeHours && remainingSeconds > 0; h++) {
          let hour;
          if (Math.random() > 0.4) {
            // Pick from peak hours
            hour = peakHours[Math.floor(Math.random() * peakHours.length)];
          } else {
            // Random hour 8-23
            hour = Math.floor(8 + Math.random() * 16);
          }
          
          const hourSeconds = Math.floor(Math.random() * (remainingSeconds / 2)) + 60;
          hours[hour] = (hours[hour] || 0) + Math.min(hourSeconds, remainingSeconds);
          remainingSeconds -= hourSeconds;
        }
        
        // Generate paths for sites that have them
        const paths = {};
        if (site.paths.length > 0) {
          let pathSeconds = baseSeconds;
          const numPaths = Math.min(site.paths.length, Math.floor(1 + Math.random() * 3));
          for (let p = 0; p < numPaths && pathSeconds > 0; p++) {
            const path = site.paths[Math.floor(Math.random() * site.paths.length)];
            const seconds = Math.floor(pathSeconds * (0.3 + Math.random() * 0.5));
            paths[path] = (paths[path] || 0) + seconds;
            pathSeconds -= seconds;
          }
        }
        
        // Generate feelings (occasional)
        const feelings = [];
        if (Math.random() > 0.85) {
          const feelingTypes = ['positive', 'neutral', 'negative'];
          // Weight towards negative for "distraction" sites
          const weights = site.weight > 0.5 ? [0.2, 0.3, 0.5] : [0.4, 0.4, 0.2];
          const rand = Math.random();
          if (rand < weights[0]) feelings.push('positive');
          else if (rand < weights[0] + weights[1]) feelings.push('neutral');
          else feelings.push('negative');
        }
        
        mockData[dateStr][site.domain] = {
          hours,
          paths,
          totalSeconds: baseSeconds,
          overtimeSeconds: Math.random() > 0.9 ? Math.floor(Math.random() * 600) : 0,
          feelings,
          blocks: Math.random() > 0.8 ? Math.floor(Math.random() * 3) : 0
        };
      });
    }
    
    // Save to storage
    await browser.storage.local.set({ analyticsHistory: mockData });
    
    // Reload
    analyticsData = mockData;
    populateYearSelector();
    renderStats();
    renderHeatmap();
    renderTrend();
    renderTopSites();
    renderPeakHours();
    renderFeelings();
    
    console.log(`[LOCKD DEBUG] Generated ${days} days of mock data for ${sites.length} sites`);
    return mockData;
  },
  
  clearMockData: async function() {
    await browser.storage.local.remove('analyticsHistory');
    analyticsData = {};
    renderStats();
    renderHeatmap();
    renderTrend();
    renderTopSites();
    renderPeakHours();
    renderFeelings();
    console.log('[LOCKD DEBUG] Cleared all analytics data');
  }
};
