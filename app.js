/**
 * Busy Island — app.js
 */

/* ══════════════════════════════════════
   NAVIGATION
══════════════════════════════════════ */

function navigateTo(targetId, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(targetId);
  if (target) target.classList.add('active');
  if (btn && btn.classList.contains('btn-main')) {
    btn.classList.add('active');
    setTimeout(() => btn.classList.remove('active'), 300);
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ══════════════════════════════════════
   CAT DODGE
══════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  const cat = document.querySelector('.cat-img');
  let dodging = false;

  cat.addEventListener('click', () => {
    if (dodging) return;
    dodging = true;
    const direction = Math.random() < 0.5 ? -7 : 7;
    cat.style.transform = `translateX(${direction}%)`;
    setTimeout(() => {
      cat.style.transform = 'translateX(0)';
      setTimeout(() => { dodging = false; }, 150);
    }, 1000);
  });

  // Day toggle label highlighting + auto-reset
  const dayToggle = document.getElementById('day-toggle');
  if (dayToggle) {
    updateToggleLabels(dayToggle.checked);
    dayToggle.addEventListener('change', () => {
      updateToggleLabels(dayToggle.checked);
      resetGame();
    });
  }

  // Set defaults on first load
  document.getElementById('line-select').value = 'MRT';
  document.getElementById('day-toggle').checked = false;

  updateToggleLabels(false);

  const lineSelect = document.getElementById('line-select');
  if (lineSelect) {
    lineSelect.addEventListener('change', resetGame);
  }

  updateBrowseToggleLabels(false);
  updateFixedStationUI();

  ensureDataLoaded().catch(() => {
    // fail silently here; explicit actions already show alerts
  });
});

function updateToggleLabels(isWeekends) {
  document.getElementById('label-weekdays').classList.toggle('active-label', !isWeekends);
  document.getElementById('label-weekends').classList.toggle('active-label', isWeekends);
}

/* ══════════════════════════════════════
   MINI GAME
══════════════════════════════════════ */

const LINE_COLORS = {
  EWL:   '#009645',
  NSL:   '#D42E1B',
  NEL:   '#9D26B3',
  CCL:   '#FA9E0D',
  DTL:   '#0059A9',
  TEL:   '#9B5A1F',
  PGLRT: '#748477',
  SKLRT: '#748477',
  BPLRT: '#748477',
};

const MRT_LINES  = ['EWL', 'NSL', 'NEL', 'CCL', 'DTL', 'TEL'];
const LRT_LINES  = ['PGLRT', 'SKLRT', 'BPLRT'];
const ALL_LINES  = [...MRT_LINES, ...LRT_LINES];

let dataWeekdays = [];
let dataWeekends = [];
let gamePool     = [];
let questions    = [];
let currentQ     = 0;
let scoreCorrect = 0;
let scoreWrong   = 0;
let answered     = false;

let fixedStationName = '';
let fixedStationModalBound = false;

/* ── CSV loader ── */
async function loadCSV(path) {
  const res  = await fetch(path);
  const text = await res.text();
  const rows = text.trim().split('\n');
  let headers = parseCSVRow(rows[0]).map(h => h.trim().replace(/^"|"$/g, ''));

  // R's write.csv prepends an unnamed index column (empty or quoted empty string)
  const hasIndexCol = headers[0] === '' || headers[0] === '""';
  if (hasIndexCol) headers = headers.slice(1);

  const numericCols = new Set(['EWL','NSL','NEL','CCL','DTL','PGLRT','SKLRT','BPLRT','TEL',
                                'total_in','total_out','total_sum']);
  return rows.slice(1).map(row => {
    let vals = parseCSVRow(row);
    if (hasIndexCol) vals = vals.slice(1);
    const obj = {};
    headers.forEach((h, i) => {
      const v = (vals[i] !== undefined ? vals[i].trim() : '').replace(/^"|"$/g, '');
      obj[h] = numericCols.has(h) ? (parseFloat(v) || 0) : v;
    });
    return obj;
  });
}

function parseCSVRow(row) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

/* ── Filter pool by dropdown selection ── */
function filterPool(data, selection) {
  if (selection === 'MRT')  return data.filter(r => MRT_LINES.some(l => r[l] === 1));
  if (selection === 'LRT')  return data.filter(r => LRT_LINES.some(l => r[l] === 1));
  return data.filter(r => r[selection] === 1);
}

/* ── Build linear gradient for line band ── */
function buildBandGradient(row) {
  const active = ALL_LINES.filter(l => row[l] === 1);
  if (active.length === 0) return '#ccc';
  const pct = 100 / active.length;
  const stops = active.map((l, i) =>
    `${LINE_COLORS[l]} ${i * pct}% ${(i + 1) * pct}%`
  );
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/* ── Generate 10 questions with no repeated stations ── */
function generateQuestions(pool, fixedStation = null) {
  if (!fixedStation) {
    const qs = [];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);

    if (shuffled.length >= 20) {
      let idx = 0;
      while (qs.length < 10 && idx + 1 < shuffled.length) {
        const a = shuffled[idx];
        const b = shuffled[idx + 1];
        idx += 2;

        if (a.stn_name === b.stn_name) continue;
        qs.push([a, b]);
      }
    }

    if (qs.length < 10) {
      const extended = [];
      while (extended.length < 40) {
        extended.push(...pool.sort(() => Math.random() - 0.5));
      }

      let idx = 0;
      while (qs.length < 10 && idx < 200) {
        const a = extended[idx % extended.length];
        const b = extended[(idx + 1) % extended.length];
        idx++;

        if (!a || !b || a.stn_name === b.stn_name) continue;
        qs.push([a, b]);
      }
    }

    return qs.slice(0, 10);
  }

  const opponents = pool.filter(r => r.stn_name !== fixedStation.stn_name);

  if (opponents.length === 0) return [];

  const shuffledOpponents = [...opponents].sort(() => Math.random() - 0.5);
  const qs = [];

  for (let i = 0; i < 10; i++) {
    const opponent = shuffledOpponents[i % shuffledOpponents.length];
    qs.push(
      Math.random() < 0.5
        ? [fixedStation, opponent]
        : [opponent, fixedStation]
    );
  }

  return qs;
}

/* ── START GAME ── */
async function startGame() {
  // if (dataWeekdays.length === 0) {
  //   try {
  //     dataWeekdays = await loadCSV('./data/summary_weekdays.csv');
  //     dataWeekends = await loadCSV('./data/summary_weekends.csv');
  //   } catch(e) {
  //     alert('Could not load data files. Please ensure summary_weekdays.csv and summary_weekends.csv are in the ./data/ folder.');
  //     return;
  //   }
  // }

  try {
    await ensureDataLoaded();
  } catch (e) {
    alert('Could not load data files. Please ensure summary_weekdays.csv and summary_weekends.csv are in the ./data/ folder.');
    return;
  }

  const isWeekends = document.getElementById('day-toggle').checked;
  const selection  = document.getElementById('line-select').value;
  const data       = isWeekends ? dataWeekends : dataWeekdays;
  gamePool         = filterPool(data, selection);

  if (gamePool.length < 2) {
    alert('Not enough stations for the selected filter. Please choose a different line.');
    return;
  }

  const fixedStation = fixedStationName
    ? gamePool.find(r => r.stn_name === fixedStationName)
    : null;

  if (fixedStationName && !fixedStation) {
    alert('The fixed station is not available for the current line filter. Please clear it or choose another one.');
    return;
  }

  questions = generateQuestions(gamePool, fixedStation);

  if (questions.length < 10) {
    alert('Not enough stations to generate 10 questions for the current filter. Please choose a broader line selection or clear the fixed station.');
    return;
  }

  currentQ     = 0;
  scoreCorrect = 0;
  scoreWrong   = 0;

  document.getElementById('score-correct').textContent   = 0;
  document.getElementById('score-wrong').textContent     = 0;
  document.getElementById('scoreboard').style.display    = 'flex';
  document.getElementById('question-area').style.display = 'flex';

  renderQuestion();
}

/* ── Render current question ── */
function renderQuestion() {
  answered = false;
  const [left, right] = questions[currentQ];

  // document.getElementById('question-label').textContent = `Question ${currentQ + 1} of 10`;

  document.getElementById('band-left').style.background  = buildBandGradient(left);
  document.getElementById('band-right').style.background = buildBandGradient(right);

  document.getElementById('name-left').textContent  = left.stn_name;
  document.getElementById('name-right').textContent = right.stn_name;

  const btnL = document.getElementById('btn-left');
  const btnR = document.getElementById('btn-right');
  btnL.className = 'station-btn';
  btnR.className = 'station-btn';
  btnL.disabled  = false;
  btnR.disabled  = false;

  document.getElementById('result-feedback').style.display = 'none';
  document.getElementById('btn-next').style.display        = 'none';
}

/* ── Handle answer selection ── */
function selectAnswer(choice) {
  if (answered) return;
  answered = true;

  const [left, right] = questions[currentQ];
  const correctIdx = left.total_sum >= right.total_sum ? 0 : 1;
  const isCorrect  = (choice === correctIdx);

  const btnL = document.getElementById('btn-left');
  const btnR = document.getElementById('btn-right');
  btnL.disabled = true;
  btnR.disabled = true;

  if (choice === 0) btnL.classList.add(isCorrect ? 'correct-pick' : 'wrong-pick');
  else              btnR.classList.add(isCorrect ? 'correct-pick' : 'wrong-pick');

  // Always highlight the correct one
  if (correctIdx === 0) btnL.classList.add('correct-pick');
  else                  btnR.classList.add('correct-pick');

  if (isCorrect) {
    scoreCorrect++;
    document.getElementById('score-correct').textContent = scoreCorrect;
  } else {
    scoreWrong++;
    document.getElementById('score-wrong').textContent = scoreWrong;
  }

  const winner = correctIdx === 0 ? left : right;
  const loser  = correctIdx === 0 ? right : left;

  const feedback = document.getElementById('result-feedback');
  feedback.style.display = 'block';
  feedback.innerHTML = `
    <div class="result-verdict ${isCorrect ? 'correct' : 'wrong'}">
      ${isCorrect ? '✓ Correct!' : '✗ Wrong!'}
    </div>
    <strong>${winner.stn_name}</strong> has ${winner.total_sum.toLocaleString()} passengers daily,
    which is more than <strong>${loser.stn_name}</strong> which has ${loser.total_sum.toLocaleString()} passengers daily.
  `;

  const btnNext = document.getElementById('btn-next');
  btnNext.style.display = 'block';
  btnNext.textContent   = currentQ < 9 ? 'Next Question' : `Game Over — You scored ${scoreCorrect}/10! Play again?`;
}

/* ── Next question ── */
function nextQuestion() {
  if (currentQ < 9) {
    currentQ++;
    renderQuestion();
  } else {
    resetGame();
  }
}

/* ── Reset (preserves dropdown and toggle state) ── */
function resetGame() {
  questions    = [];
  currentQ     = 0;
  scoreCorrect = 0;
  scoreWrong   = 0;
  answered     = false;

  document.getElementById('scoreboard').style.display    = 'none';
  document.getElementById('question-area').style.display = 'none';
  document.getElementById('score-correct').textContent   = '0';
  document.getElementById('score-wrong').textContent     = '0';
}

function getCurrentGameData() {
  const isWeekends = document.getElementById('day-toggle').checked;
  return isWeekends ? dataWeekends : dataWeekdays;
}

function getCurrentGamePool() {
  const selection = document.getElementById('line-select').value;
  return filterPool(getCurrentGameData(), selection);
}

function updateFixedStationUI() {
  const indicator = document.getElementById('fixed-station-indicator');
  const currentEl = document.getElementById('fixed-station-current');
  const hasFixed = !!fixedStationName;

  if (indicator) {
    indicator.style.display = hasFixed ? 'block' : 'none';
    indicator.innerHTML = hasFixed
      ? `Fixed station: <span class="fixed-station-link" onclick="openCustomiseModal()">${fixedStationName}</span>.`
      : '';
  }

  if (currentEl) {
    currentEl.textContent = hasFixed
      ? `Current fixed station: ${fixedStationName}`
      : 'No station fixed.';
  }
}

function renderFixedStationSuggestions(matches) {
  const list = document.getElementById('fixed-station-suggestions');
  list.innerHTML = '';

  if (!matches.length) {
    list.classList.remove('open');
    return;
  }

  matches.forEach(name => {
    const li = document.createElement('li');
    li.textContent = name;

    li.addEventListener('click', () => {
      fixedStationName = name;
      document.getElementById('fixed-station-search').value = name;
      list.classList.remove('open');
      list.innerHTML = '';
      updateFixedStationUI();
      resetGame();
    });

    list.appendChild(li);
  });

  list.classList.add('open');
}

function bindCustomiseModal() {
  if (fixedStationModalBound) return;
  fixedStationModalBound = true;

  const searchInput = document.getElementById('fixed-station-search');
  const modal = document.getElementById('customise-modal');
  const lineSelect = document.getElementById('line-select');
  const dayToggle = document.getElementById('day-toggle');

  searchInput.addEventListener('input', async () => {
    try {
      await ensureDataLoaded();
    } catch (e) {
      renderFixedStationSuggestions([]);
      return;
    }

    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
      renderFixedStationSuggestions([]);
      return;
    }

    const matches = [...new Set(getCurrentGamePool().map(r => r.stn_name))]
      .filter(name => name.toLowerCase().includes(query))
      .slice(0, 10);

    renderFixedStationSuggestions(matches);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeCustomiseModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      closeCustomiseModal();
    }
  });

  [lineSelect, dayToggle].forEach(el => {
    el.addEventListener('change', () => {
      if (!fixedStationName) return;

      const available = getCurrentGamePool().some(r => r.stn_name === fixedStationName);
      if (!available) {
        fixedStationName = '';
        const input = document.getElementById('fixed-station-search');
        if (input) input.value = '';
        updateFixedStationUI();
      }
    });
  });
}

async function openCustomiseModal() {
  bindCustomiseModal();

  try {
    await ensureDataLoaded();
  } catch (e) {
    alert('Could not load station data for customisation.');
    return;
  }

  const modal = document.getElementById('customise-modal');
  const input = document.getElementById('fixed-station-search');

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  input.value = fixedStationName || '';
  updateFixedStationUI();
  renderFixedStationSuggestions([]);

  setTimeout(() => input.focus(), 0);
}

function closeCustomiseModal() {
  const modal = document.getElementById('customise-modal');
  const list = document.getElementById('fixed-station-suggestions');

  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  list.classList.remove('open');
  list.innerHTML = '';
}

function clearFixedStation() {
  fixedStationName = '';
  const input = document.getElementById('fixed-station-search');
  if (input) input.value = '';

  updateFixedStationUI();
  renderFixedStationSuggestions([]);
  resetGame();
}

async function restartGame() {
  resetGame();
  await startGame();
}

/* ══════════════════════════════════════
   BROWSE BY STATION
══════════════════════════════════════ */

const LINE_LABELS = {
  EWL: 'East-West Line', NSL: 'North-South Line', NEL: 'North East Line',
  CCL: 'Circle Line', DTL: 'Downtown Line', TEL: 'Thomson-East Coast Line',
  PGLRT: 'Punggol LRT', SKLRT: 'Sengkang LRT', BPLRT: 'Bukit Panjang LRT',
};

let browseDebounceTimer = null;

function initBrowse() {
  const browseToggle = document.getElementById('browse-day-toggle');
  const searchInput  = document.getElementById('browse-search');
  const suggestions  = document.getElementById('search-suggestions');

  // Reset toggle to weekdays on each visit
  browseToggle.checked = false;
  updateBrowseToggleLabels(false);

  // Remove old listeners by cloning elements
  const newToggle = browseToggle.cloneNode(true);
  browseToggle.parentNode.replaceChild(newToggle, browseToggle);
  const newInput = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(newInput, searchInput);

  newToggle.addEventListener('change', () => {
    updateBrowseToggleLabels(newToggle.checked);
    const cardName = document.getElementById('station-card-name').textContent;
    if (cardName) renderStationCard(cardName);
  });

  newInput.addEventListener('input', () => {
    clearTimeout(browseDebounceTimer);
    browseDebounceTimer = setTimeout(() => {
      const query = newInput.value.trim().toLowerCase();
      if (query.length === 0) { closeSuggestions(); return; }
      const data = getBrowseData();
      if (!data.length) return;
      const matches = [...new Set(data.map(r => r.stn_name))]
        .filter(name => name.toLowerCase().includes(query))
        .slice(0, 10);
      renderSuggestions(matches, newInput, suggestions);
    }, 250);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) closeSuggestions();
  });
}

function updateBrowseToggleLabels(isWeekends) {
  document.getElementById('browse-label-weekdays').classList.toggle('active-label', !isWeekends);
  document.getElementById('browse-label-weekends').classList.toggle('active-label', isWeekends);
}

function getBrowseData() {
  const isWeekends = document.getElementById('browse-day-toggle').checked;
  return isWeekends ? dataWeekends : dataWeekdays;
}

function renderSuggestions(matches, input, list) {
  list.innerHTML = '';
  if (matches.length === 0) { closeSuggestions(); return; }
  matches.forEach(name => {
    const li = document.createElement('li');
    li.textContent = name;
    li.addEventListener('click', () => {
      input.value = name;
      closeSuggestions();
      renderStationCard(name);
    });
    list.appendChild(li);
  });
  list.classList.add('open');
}

function closeSuggestions() {
  const list = document.getElementById('search-suggestions');
  list.classList.remove('open');
  list.innerHTML = '';
}

function renderStationCard(stnName) {
  const data = getBrowseData();
  const row  = data.find(r => r.stn_name === stnName);
  if (!row) return;

  const isWeekends = document.getElementById('browse-day-toggle').checked;

  document.getElementById('station-card-name').textContent    = stnName;
  document.getElementById('station-card-daytype').textContent = isWeekends ? 'Weekends / Public Holidays' : 'Weekdays';
  document.getElementById('stat-tapin').textContent           = row.total_in.toLocaleString();
  document.getElementById('stat-tapout').textContent          = row.total_out.toLocaleString();
  document.getElementById('stat-total').textContent           = row.total_sum.toLocaleString();

  document.getElementById('station-card-band').style.background = buildBandGradient(row);

  const pillsEl = document.getElementById('station-card-lines');
  pillsEl.innerHTML = '';
  ALL_LINES.filter(l => row[l] === 1).forEach(l => {
    const pill = document.createElement('span');
    pill.className        = 'line-pill';
    pill.textContent      = LINE_LABELS[l] || l;
    pill.style.background = LINE_COLORS[l] || '#999';
    pillsEl.appendChild(pill);
  });

  document.getElementById('station-card').style.display = 'block';

   // ── Line ranks ──
  const ranksEl = document.getElementById('station-card-ranks');
  ranksEl.innerHTML = '';
  const activeLines = ALL_LINES.filter(l => row[l] === 1);
  activeLines.forEach(l => {
    // All stations on this line, sorted descending by total_sum
    const lineStations = data
      .filter(r => r[l] === 1)
      .sort((a, b) => b.total_sum - a.total_sum);
    const rank  = lineStations.findIndex(r => r.stn_name === stnName) + 1;
    const total = lineStations.length;

    const rankRow = document.createElement('div');
    rankRow.className = 'rank-row';

    const dot = document.createElement('span');
    dot.className  = 'rank-dot';
    dot.style.background = LINE_COLORS[l] || '#999';

    rankRow.innerHTML = `
      <span class="rank-dot" style="background:${LINE_COLORS[l] || '#999'}"></span>
      Rank <span class="rank-number">${rank}</span> out of <span class="rank-number">${total}</span> for the ${LINE_LABELS[l] || l}
    `;
    ranksEl.appendChild(rankRow);
  });
}

async function ensureDataLoaded() {
  if (dataWeekdays.length === 0) {
    try {
      dataWeekdays = await loadCSV('./data/summary_weekdays.csv');
      dataWeekends = await loadCSV('./data/summary_weekends.csv');
    } catch(e) {
      alert('Could not load data files.');
    }
  }
}
/* ══════════════════════════════════════
   BROWSE BY LINE
══════════════════════════════════════ */

let lineTableAscending = false; // default: descending (rank 1 first)

function initBrowseLine() {
  const toggle   = document.getElementById('bline-day-toggle');
  const selectEl = document.getElementById('bline-select');

  // Reset on each visit
  toggle.checked  = false;
  selectEl.value  = '';
  lineTableAscending = false;
  updateBlineToggleLabels(false);
  document.getElementById('line-table-wrap').style.display = 'none';

  // Clone to remove stale listeners
  const newToggle = toggle.cloneNode(true);
  toggle.parentNode.replaceChild(newToggle, toggle);
  const newSelect = selectEl.cloneNode(true);
  selectEl.parentNode.replaceChild(newSelect, selectEl);

  newToggle.addEventListener('change', () => {
    updateBlineToggleLabels(newToggle.checked);
    const key = document.getElementById('bline-select').value;
    if (key) renderLineTable(key);
  });

  newSelect.addEventListener('change', () => {
    const key = newSelect.value;
    lineTableAscending = false;
    if (key) renderLineTable(key);
    else document.getElementById('line-table-wrap').style.display = 'none';
  });
}

function updateBlineToggleLabels(isWeekends) {
  document.getElementById('bline-label-weekdays').classList.toggle('active-label', !isWeekends);
  document.getElementById('bline-label-weekends').classList.toggle('active-label', isWeekends);
}

function renderLineTable(lineKey) {
  const isWeekends = document.getElementById('bline-day-toggle').checked;
  const data       = isWeekends ? dataWeekends : dataWeekdays;
  const lineLabel  = LINE_LABELS[lineKey] || lineKey;
  const color      = LINE_COLORS[lineKey] || '#999';

  // Sort descending by total_sum (canonical ranking order)
  const stations = data
    .filter(r => r[lineKey] === 1)
    .sort((a, b) => b.total_sum - a.total_sum);

  // Header: colour band swatch + line name only
  const headerEl = document.getElementById('line-table-header');
  // Preserve the btn-flip, update only the label content
  const flipBtn = document.getElementById('btn-flip');
  headerEl.innerHTML = `
  <div class="line-table-header-left">
    <span class="line-table-header-band" style="background:${color};"></span>
    <span class="line-table-header-label">${lineLabel}</span>
  </div>`;
  headerEl.appendChild(flipBtn);

  // Render rows respecting current flip state
  renderLineRows(stations);

  const wrap = document.getElementById('line-table-wrap');
  wrap.dataset.lineKey = lineKey;
  wrap.style.display   = 'flex';
}

function renderLineRows(stations) {
  const tbody = document.getElementById('line-table-body');
  tbody.innerHTML = '';

  const ordered = lineTableAscending ? [...stations].reverse() : stations;

  ordered.forEach((row, i) => {
    // Rank is always relative to descending order
    const rank = lineTableAscending ? stations.length - i : i + 1;
    const tr   = document.createElement('tr');
    tr.innerHTML = `
      <td class="${rank <= 3 ? 'rank-top' : ''}">${rank}</td>
      <td>${row.stn_name}</td>
      <td>${row.total_sum.toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

function flipLineTable() {
  lineTableAscending = !lineTableAscending;
  const key = document.getElementById('line-table-wrap').dataset.lineKey;
  if (!key) return;

  const isWeekends = document.getElementById('bline-day-toggle').checked;
  const data       = isWeekends ? dataWeekends : dataWeekdays;
  const stations   = data
    .filter(r => r[key] === 1)
    .sort((a, b) => b.total_sum - a.total_sum);

  renderLineRows(stations);
}

/* ══════════════════════════════════════
   MULTIPLAYER
══════════════════════════════════════ */

// ── State ──
let mp = {
  roomCode:    null,
  playerId:    null,
  isHost:      false,
  username:    '',
  lineSelect:  'MRT',
  isWeekends:  false,
  questions:   [],   // array of {left, right} (station objects) - only host generates
  currentQ:    0,
  correct:     0,
  wrong:       0,
  answered:    false,
  listeners:   [],   // {ref, fn} pairs to detach on leave
  finished:    false,
};

// Generate a random 5-digit room code
function mpGenCode() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

// Generate a unique player id
function mpGenPlayerId() {
  return 'p' + Date.now() + Math.random().toString(36).slice(2, 7);
}

// ── Section toggles ──
function mpShowSection(id) {
  ['mp-lobby','mp-create','mp-join','mp-waiting','mp-ingame','mp-waiting-results','mp-leaderboard']
    .forEach(s => {
      const el = document.getElementById(s);
      if (el) el.style.display = (s === id) ? 'flex' : 'none';
    });
}

function mpShowLobby()  { mpShowSection('mp-lobby'); }
function mpShowCreate() { mpShowSection('mp-create'); }
function mpShowJoin()   { mpShowSection('mp-join'); document.getElementById('mp-join-error').style.display='none'; }

function initMultiplayer() {
  mpShowLobby();
  // Reset toggle labels
  document.getElementById('mp-label-weekdays').classList.add('active-label');
  document.getElementById('mp-label-weekends').classList.remove('active-label');
  document.getElementById('mp-day-toggle').checked = false;
  document.getElementById('mp-line-select').value = 'MRT';

  const mpDayToggle = document.getElementById('mp-day-toggle');
  mpDayToggle.onchange = () => {
    document.getElementById('mp-label-weekdays').classList.toggle('active-label', !mpDayToggle.checked);
    document.getElementById('mp-label-weekends').classList.toggle('active-label', mpDayToggle.checked);
  };
}

// ── Helpers to wait for Firebase ──
function mpWithDB(fn) {
  if (window._mpFirebaseReady) { fn(); return; }
  document.addEventListener('firebase-ready', fn, { once: true });
}

function mpDbRef(path) {
  return window._mpRef(window._mpDB, path);
}

// ── Attach a realtime listener and track for cleanup ──
function mpListen(path, callback) {
  const r = mpDbRef(path);
  const unsub = window._mpOnValue(r, callback);
  mp.listeners.push({ ref: r, fn: unsub });
}

// ── Detach all listeners ──
function mpDetachAll() {
  mp.listeners.forEach(({ ref: r, fn }) => {
    try { window._mpOff(r, 'value', fn); } catch(e) {}
  });
  mp.listeners = [];
}

// ── Leave / cleanup ──
async function mpLeaveRoom() {
  mpDetachAll();
  if (!mp.roomCode) return;

  try {
    const db = window._mpDB;
    if (mp.isHost) {
      // Remove entire room if host leaves
      await window._mpRemove(mpDbRef(`rooms/${mp.roomCode}`));
    } else {
      // Remove just this player
      await window._mpRemove(mpDbRef(`rooms/${mp.roomCode}/players/${mp.playerId}`));
    }
  } catch(e) {}

  mp.roomCode  = null;
  mp.playerId  = null;
  mp.isHost    = false;
  mp.questions = [];
}

// ── CREATE ROOM ──
async function mpCreateRoom() {
  const username = document.getElementById('mp-create-username').value.trim();
  if (!username) { alert('Please enter your name.'); return; }

  const lineSelect = document.getElementById('mp-line-select').value;
  const isWeekends = document.getElementById('mp-day-toggle').checked;

  try {
    await ensureDataLoaded();
  } catch(e) {
    alert('Could not load station data. Please try again.');
    return;
  }

  const code     = mpGenCode();
  const playerId = mpGenPlayerId();

  mp.roomCode   = code;
  mp.playerId   = playerId;
  mp.isHost     = true;
  mp.username   = username;
  mp.lineSelect = lineSelect;
  mp.isWeekends = isWeekends;

  mpWithDB(async () => {
    const roomData = {
      code,
      host: playerId,
      status: 'waiting',  // waiting | playing | finished
      lineSelect,
      isWeekends,
      questions: null,
      players: {
        [playerId]: { name: username, isHost: true, correct: 0, wrong: 0, finished: false }
      }
    };

    await window._mpSet(mpDbRef(`rooms/${code}`), roomData);

    // Show waiting room
    mpShowWaiting(true);

    // Listen for state changes
    mpListenRoom();
  });
}

// ── JOIN ROOM ──
async function mpJoinRoom() {
  const username = document.getElementById('mp-join-username').value.trim();
  const code     = document.getElementById('mp-join-code').value.trim();
  const errEl    = document.getElementById('mp-join-error');
  const joinBtn  = document.getElementById('mp-join-btn');

  errEl.style.display = 'none';
  if (!username) { errEl.textContent='Please enter your name.'; errEl.style.display='block'; return; }
  if (!/^\d{5}$/.test(code)) { errEl.textContent='Please enter a valid 5-digit code.'; errEl.style.display='block'; return; }

  joinBtn.disabled = true;
  joinBtn.textContent = 'Joining…';

  try {
    await ensureDataLoaded();
  } catch(e) {
    errEl.textContent = 'Could not load station data.';
    errEl.style.display = 'block';
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join Room';
    return;
  }

  mpWithDB(async () => {
    try {
      const snap = await window._mpGet(mpDbRef(`rooms/${code}`));
      if (!snap.exists()) {
        errEl.textContent = 'Room not found. Check the code and try again.';
        errEl.style.display = 'block';
        joinBtn.disabled = false;
        joinBtn.textContent = 'Join Room';
        return;
      }

      const roomData = snap.val();
      if (roomData.status !== 'waiting') {
        errEl.textContent = 'This room\'s game has already started.';
        errEl.style.display = 'block';
        joinBtn.disabled = false;
        joinBtn.textContent = 'Join Room';
        return;
      }

      const playerId = mpGenPlayerId();
      mp.roomCode   = code;
      mp.playerId   = playerId;
      mp.isHost     = false;
      mp.username   = username;
      mp.lineSelect = roomData.lineSelect;
      mp.isWeekends = roomData.isWeekends;

      await window._mpUpdate(mpDbRef(`rooms/${code}/players/${playerId}`), {
        name: username, isHost: false, correct: 0, wrong: 0, finished: false
      });

      joinBtn.disabled = false;
      joinBtn.textContent = 'Join Room';

      mpShowWaiting(false);
      mpListenRoom();

    } catch(e) {
      errEl.textContent = 'Connection error. Please try again.';
      errEl.style.display = 'block';
      joinBtn.disabled = false;
      joinBtn.textContent = 'Join Room';
    }
  });
}

// ── Show waiting room ──
function mpShowWaiting(isHost) {
  mpShowSection('mp-waiting');

  document.getElementById('mp-room-code-display').textContent = mp.roomCode;
  document.getElementById('mp-waiting-title').textContent     = isHost ? 'Your Room' : 'Waiting Room';

  const LINE_LABEL_MAP = {
    MRT: 'All MRT Lines', LRT: 'All LRT Lines',
    EWL: 'East-West Line', NSL: 'North-South Line', NEL: 'North East Line',
    CCL: 'Circle Line', DTL: 'Downtown Line', TEL: 'Thomson-East Coast Line',
    PGLRT: 'Punggol LRT', SKLRT: 'Sengkang LRT', BPLRT: 'Bukit Panjang LRT',
  };
  document.getElementById('mp-settings-summary').textContent =
    `${LINE_LABEL_MAP[mp.lineSelect] || mp.lineSelect} · ${mp.isWeekends ? 'Weekends / PH' : 'Weekdays'}`;

  document.getElementById('mp-host-controls').style.display    = isHost ? 'block' : 'none';
  document.getElementById('mp-guest-waiting-msg').style.display = isHost ? 'none' : 'block';
}

// ── Copy room code ──
function mpCopyCode() {
  navigator.clipboard.writeText(mp.roomCode).then(() => {
    const icon = document.getElementById('mp-copy-icon');
    icon.textContent = '✓';
    setTimeout(() => { icon.textContent = '⎘'; }, 1500);
  });
}

// ── Listen to room changes ──
function mpListenRoom() {
  mpListen(`rooms/${mp.roomCode}`, (snap) => {
    if (!snap.exists()) {
      // Room was deleted (host left)
      mpDetachAll();
      alert('The host has closed the room.');
      mpLeaveRoom();
      navigateTo('page-home', null);
      return;
    }

    const room = snap.val();
    const players = room.players || {};

    // Update player list in waiting room
    mpRenderPlayers(players);

    // Update progress panel if we're on the waiting-for-results screen
    const currentSection = [...document.querySelectorAll('.mp-section')]
      .find(el => el.style.display === 'flex');

    if (room.status === 'playing' && room.questions) {
      if (currentSection && currentSection.id === 'mp-waiting') {
        mpStartGameFromRoom(room);
      } else if (currentSection && currentSection.id === 'mp-waiting-results') {
        mpRenderProgressList(players);
      }
    }

    if (room.status === 'finished') {
      if (currentSection && currentSection.id !== 'mp-leaderboard') {
        mpShowFinalLeaderboard(players);
      }
    }
  });
}

// ── Render players list ──
function mpRenderPlayers(players) {
  const list = document.getElementById('mp-players-list');
  if (!list) return;
  list.innerHTML = '';

  Object.entries(players).forEach(([id, p]) => {
    const li = document.createElement('li');
    const isYou  = id === mp.playerId;
    const isHost = p.isHost;

    li.innerHTML = `
      <span class="mp-player-dot"></span>
      <span>${p.name}</span>
      ${isHost ? '<span class="mp-player-host-tag">HOST</span>' : ''}
      ${isYou && !isHost ? '<span class="mp-player-you-tag">YOU</span>' : ''}
      ${isYou && isHost  ? '<span class="mp-player-you-tag">YOU</span>' : ''}
    `;
    list.appendChild(li);
  });
}

// ── Host: start game ──
async function mpHostStartGame() {
  const data = mp.isWeekends ? dataWeekends : dataWeekdays;
  const pool = filterPool(data, mp.lineSelect);

  if (pool.length < 2) {
    alert('Not enough stations for this line filter.');
    return;
  }

  const qs = generateQuestions(pool);
  if (qs.length < 10) {
    alert('Not enough stations to generate 10 questions.');
    return;
  }

  // Store questions as indices into the pool for all players to use
  // Since all clients have the same CSV data, store station names
  const storedQs = qs.map(([a, b]) => ({ a: a.stn_name, b: b.stn_name }));

  mp.questions = qs;

  const btn = document.getElementById('mp-start-game-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }

  await window._mpUpdate(mpDbRef(`rooms/${mp.roomCode}`), {
    status: 'playing',
    questions: storedQs
  });
}

// ── All players: start game from room data ──
function mpStartGameFromRoom(room) {
  const data = mp.isWeekends ? dataWeekends : dataWeekdays;
  const pool = filterPool(data, mp.lineSelect);
  const stationMap = {};
  pool.forEach(r => { stationMap[r.stn_name] = r; });

  // Reconstruct question pairs from stored names
  const storedQs = room.questions;
  mp.questions = Object.values(storedQs).map(q => {
    const a = stationMap[q.a];
    const b = stationMap[q.b];
    return [a, b];
  }).filter(([a, b]) => a && b);

  mp.currentQ = 0;
  mp.correct  = 0;
  mp.wrong    = 0;
  mp.answered = false;
  mp.finished = false;

  mpShowSection('mp-ingame');
  mpRenderQuestion();
}

// ── Render current multiplayer question ──
function mpRenderQuestion() {
  if (!mp.questions[mp.currentQ]) return;
  const [left, right] = mp.questions[mp.currentQ];
  mp.answered = false;

  document.getElementById('mp-q-counter').textContent = `Q ${mp.currentQ + 1} / 10`;
  document.getElementById('mp-band-left').style.background  = buildBandGradient(left);
  document.getElementById('mp-band-right').style.background = buildBandGradient(right);
  document.getElementById('mp-name-left').textContent  = left.stn_name;
  document.getElementById('mp-name-right').textContent = right.stn_name;

  const btnL = document.getElementById('mp-btn-left');
  const btnR = document.getElementById('mp-btn-right');
  btnL.className = 'station-btn'; btnL.disabled = false;
  btnR.className = 'station-btn'; btnR.disabled = false;

  document.getElementById('mp-result-feedback').style.display = 'none';
  document.getElementById('mp-btn-next').style.display        = 'none';

  document.getElementById('mp-score-correct').textContent = mp.correct;
  document.getElementById('mp-score-wrong').textContent   = mp.wrong;
}

// ── Select answer ──
async function mpSelectAnswer(choice) {
  if (mp.answered) return;
  mp.answered = true;

  const [left, right] = mp.questions[mp.currentQ];
  const correctIdx = left.total_sum >= right.total_sum ? 0 : 1;
  const isCorrect  = (choice === correctIdx);

  const btnL = document.getElementById('mp-btn-left');
  const btnR = document.getElementById('mp-btn-right');
  btnL.disabled = true; btnR.disabled = true;

  if (choice === 0) btnL.classList.add(isCorrect ? 'correct-pick' : 'wrong-pick');
  else              btnR.classList.add(isCorrect ? 'correct-pick' : 'wrong-pick');
  if (correctIdx === 0) btnL.classList.add('correct-pick');
  else                  btnR.classList.add('correct-pick');

  if (isCorrect) mp.correct++; else mp.wrong++;

  document.getElementById('mp-score-correct').textContent = mp.correct;
  document.getElementById('mp-score-wrong').textContent   = mp.wrong;

  const winner = correctIdx === 0 ? left : right;
  const loser  = correctIdx === 0 ? right : left;
  const feedback = document.getElementById('mp-result-feedback');
  feedback.style.display = 'block';
  feedback.innerHTML = `
    <div class="result-verdict ${isCorrect ? 'correct' : 'wrong'}">
      ${isCorrect ? '✓ Correct!' : '✗ Wrong!'}
    </div>
    <strong>${winner.stn_name}</strong> has ${winner.total_sum.toLocaleString()} passengers daily,
    which is more than <strong>${loser.stn_name}</strong> which has ${loser.total_sum.toLocaleString()} passengers daily.
  `;

  const isLast = mp.currentQ >= 9;
  const btnNext = document.getElementById('mp-btn-next');
  btnNext.style.display = 'block';
  btnNext.textContent   = isLast ? 'Finish' : 'Next Question';

  // Push running score to Firebase
  await window._mpUpdate(mpDbRef(`rooms/${mp.roomCode}/players/${mp.playerId}`), {
    correct: mp.correct, wrong: mp.wrong, finished: isLast
  });
}

// ── Next question ──
async function mpNextQuestion() {
  if (mp.currentQ < 9) {
    mp.currentQ++;
    mpRenderQuestion();
  } else {
    // Finished all questions — push final score and mark self done
    mp.finished = true;
    await window._mpUpdate(mpDbRef(`rooms/${mp.roomCode}/players/${mp.playerId}`), {
      correct: mp.correct, wrong: mp.wrong, finished: true
    });

    // Check if all players are now finished; any player can flip status to 'finished'
    const snap = await window._mpGet(mpDbRef(`rooms/${mp.roomCode}/players`));
    const players = snap.val() || {};
    const allDone = Object.values(players).every(p => p.finished);

    if (allDone) {
      await window._mpUpdate(mpDbRef(`rooms/${mp.roomCode}`), { status: 'finished' });
      mpShowFinalLeaderboard(players);
    } else {
      // Show waiting screen until others finish (listener will fire mpShowFinalLeaderboard)
      mpShowSection('mp-waiting-results');
      document.getElementById('mp-your-final-score').textContent = `${mp.correct} / 10`;
      mpRenderProgressList(players);
    }
  }
}

// ── Render progress list on the waiting-for-results screen ──
function mpRenderProgressList(players) {
  const list = document.getElementById('mp-progress-list');
  if (!list) return;
  list.innerHTML = '';

  Object.entries(players).forEach(([id, p]) => {
    const isYou = id === mp.playerId;
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="mp-player-dot" style="background:${p.finished ? '#2e7d32' : '#ccc'}"></span>
      <span>${p.name}${isYou ? ' (you)' : ''}</span>
      ${p.finished
        ? '<span class="mp-player-host-tag" style="background:#2e7d32;">DONE</span>'
        : '<span class="mp-player-you-tag" style="color:#aaa;border-color:#ddd;">playing…</span>'}
    `;
    list.appendChild(li);
  });
}

// ── Show final leaderboard ──
function mpShowFinalLeaderboard(players) {
  mpDetachAll();
  mpShowSection('mp-leaderboard');

  const sorted = Object.entries(players)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => b.correct - a.correct || a.wrong - b.wrong);

  const tbody = document.getElementById('mp-lb-body');
  tbody.innerHTML = '';

  const medals = ['🥇', '🥈', '🥉'];

  sorted.forEach((p, i) => {
    const isYou = p.id === mp.playerId;
    const tr = document.createElement('tr');
    if (isYou) tr.classList.add('mp-lb-you');
    tr.innerHTML = `
      <td class="${i < 3 ? 'lb-top' : ''}">
        ${i < 3 ? `<span class="mp-lb-medal">${medals[i]}</span>` : i + 1}
      </td>
      <td>${p.name}${isYou ? ' <span style="font-size:0.7rem;color:var(--color-gold);font-weight:700;">YOU</span>' : ''}</td>
      <td>${p.correct} / 10</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Play again (host only — resets room back to waiting) ──
async function mpPlayAgain() {
  if (!mp.roomCode) return;

  const snap = await window._mpGet(mpDbRef(`rooms/${mp.roomCode}`));
  if (!snap.exists()) { mpLeaveAndHome(); return; }

  if (mp.isHost) {
    // Reset scores, keep players
    const playerSnap = await window._mpGet(mpDbRef(`rooms/${mp.roomCode}/players`));
    const players = playerSnap.val() || {};
    const resetPlayers = {};
    Object.keys(players).forEach(id => {
      resetPlayers[id] = { ...players[id], correct: 0, wrong: 0, finished: false };
    });

    await window._mpUpdate(mpDbRef(`rooms/${mp.roomCode}`), {
      status: 'waiting',
      questions: null,
      players: resetPlayers
    });

    mp.correct = 0; mp.wrong = 0; mp.currentQ = 0; mp.finished = false;
    mpShowWaiting(true);
    mpListenRoom();
  } else {
    // Guest: reset own score and go back to waiting
    await window._mpUpdate(mpDbRef(`rooms/${mp.roomCode}/players/${mp.playerId}`), {
      correct: 0, wrong: 0, finished: false
    });
    mp.correct = 0; mp.wrong = 0; mp.currentQ = 0; mp.finished = false;
    mpShowWaiting(false);
    mpListenRoom();
  }
}

// ── Leave room and go home ──
async function mpLeaveAndHome() {
  await mpLeaveRoom();
  navigateTo('page-home', null);
  mpShowLobby();
}
