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
    const direction = Math.random() < 0.5 ? -3 : 3;
    cat.style.transform = `translateX(${direction}%)`;
    setTimeout(() => {
      cat.style.transform = 'translateX(0)';
      setTimeout(() => { dodging = false; }, 150);
    }, 3000);
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
function generateQuestions(pool) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const qs = [];
  if (shuffled.length >= 20) {
    for (let i = 0; i < 10; i++) {
      qs.push([shuffled[i * 2], shuffled[i * 2 + 1]]);
    }
  } else {
    // Pool too small: shuffle and cycle, ensuring left !== right within each pair
    const extended = [];
    while (extended.length < 20) extended.push(...shuffled.sort(() => Math.random() - 0.5));
    let idx = 0;
    while (qs.length < 10) {
      const a = extended[idx % extended.length];
      const b = extended[(idx + 1) % extended.length];
      if (a.stn_name !== b.stn_name) qs.push([a, b]);
      idx++;
    }
  }
  return qs;
}

/* ── START GAME ── */
async function startGame() {
  if (dataWeekdays.length === 0) {
    try {
      dataWeekdays = await loadCSV('./data/summary_weekdays.csv');
      dataWeekends = await loadCSV('./data/summary_weekends.csv');
    } catch(e) {
      alert('Could not load data files. Please ensure summary_weekdays.csv and summary_weekends.csv are in the ./data/ folder.');
      return;
    }
  }

  const isWeekends = document.getElementById('day-toggle').checked;
  const selection  = document.getElementById('line-select').value;
  const data       = isWeekends ? dataWeekends : dataWeekdays;
  gamePool         = filterPool(data, selection);

  if (gamePool.length < 2) {
    alert('Not enough stations for the selected filter. Please choose a different line.');
    return;
  }

  questions    = generateQuestions(gamePool);
  currentQ     = 0;
  scoreCorrect = 0;
  scoreWrong   = 0;

  document.getElementById('score-correct').textContent  = 0;
  document.getElementById('score-wrong').textContent    = 0;
  document.getElementById('scoreboard').style.display   = 'flex';
  document.getElementById('question-area').style.display = 'flex';

  renderQuestion();
}

/* ── Render current question ── */
function renderQuestion() {
  answered = false;
  const [left, right] = questions[currentQ];

  document.getElementById('question-label').textContent = `Question ${currentQ + 1} of 10`;

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