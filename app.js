/* ============================================
   SCOUT INTELLIGENCE — app.js
   Alan Correa · Analista & Scout
   ============================================ */

const SHEET_ID = '1qjZVOaJpJRJsti13gEOPuywp2Kmq5Fpi3qVGobBYq64';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
const STATS_KEY = 'scout_stats_v1';

let allRows = [];       // todas las filas del sheet (una por visoria)
let playerGroups = [];  // jugadores agrupados (un objeto por jugador)
let selectedPlayerName = null;
let charts = {};

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  setupStatsTabs();
  loadData();
});

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('page-' + btn.dataset.page).classList.add('active');
      if (btn.dataset.page === 'stats') renderStatsView();
    });
  });
}

function setupStatsTabs() {
  document.querySelectorAll('.stats-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.stats-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('stab-' + tab.dataset.stab).classList.add('active');
      if (tab.dataset.stab === 'view') renderStatsView();
      if (tab.dataset.stab === 'history') renderStatsHistory();
    });
  });
}

// ============================================
// DATA LOADING
// ============================================

async function loadData() {
  setStatus('loading');
  try {
    const res = await fetch(SHEET_URL);
    const text = await res.text();
    const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
    const cols = json.table.cols.map(c => c.label);
    const rows = (json.table.rows || []).map(r => parseRow(r, cols));
    allRows = rows.filter(r => {
      const jugador = getField(r, 'jugador', 'nombre');
      return jugador && jugador.toString().trim() !== '';
    });
    playerGroups = groupByPlayer(allRows);
    setStatus('live');
    renderAll();
  } catch (e) {
    setStatus('error');
    console.error('Error cargando datos:', e);
    showError();
  }
}

function parseRow(row, headers) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row.c[i]?.v ?? ''; });
  return obj;
}

function getField(p, ...keys) {
  for (const k of keys) {
    const found = Object.keys(p).find(pk =>
      pk.toLowerCase().replace(/\s+/g, '').includes(k.toLowerCase().replace(/\s+/g, ''))
    );
    if (found && p[found] !== null && p[found] !== undefined && p[found] !== '') {
      return p[found].toString().trim();
    }
  }
  return '';
}

// ============================================
// GROUPING — agrupa visorias por nombre de jugador
// ============================================

function groupByPlayer(rows) {
  const map = {};
  rows.forEach(row => {
    const nombre = getField(row, 'jugador', 'nombre');
    const key = nombre.toLowerCase().trim();
    if (!map[key]) {
      map[key] = {
        nombre,
        visorias: [],
        // campos que tomamos de la visoria más reciente
        pos: '', rol: '', equipo: '', edad: '', nac: '',
        nivelGeneral: null, nivelPotencial: null,
        conNivel: false,
      };
    }
    map[key].visorias.push(row);
  });

  // Para cada jugador, tomamos la visoria más reciente como fuente de datos base
  return Object.values(map).map(pg => {
    const ultima = pg.visorias[pg.visorias.length - 1];
    pg.pos = getField(ultima, 'posición', 'posicion');
    pg.rol = getField(ultima, 'rol');
    pg.equipo = getField(ultima, 'equipo', 'club');
    pg.edad = getField(ultima, 'edad');
    pg.nac = getField(ultima, 'nacionalidad');

    // Nivel general: promedio de todas las visorias que tengan el campo
    const niveles = pg.visorias
      .map(v => parseFloat(getField(v, 'habilidad general', 'nivel general')))
      .filter(n => !isNaN(n));
    pg.nivelGeneral = niveles.length ? +(niveles.reduce((a, b) => a + b, 0) / niveles.length).toFixed(1) : null;

    const potenciales = pg.visorias
      .map(v => parseFloat(getField(v, 'habilidad potencial', 'nivel potencial')))
      .filter(n => !isNaN(n));
    pg.nivelPotencial = potenciales.length ? +(potenciales.reduce((a, b) => a + b, 0) / potenciales.length).toFixed(1) : null;

    // Con nivel: si al menos una visoria dice "Sí"
    pg.conNivel = pg.visorias.some(v => {
      const nv = getField(v, 'nivel para', 'nivel para el').toLowerCase();
      return nv === 'sí' || nv === 'si';
    });

    return pg;
  });
}

function setStatus(state) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  dot.className = 'status-dot';
  if (state === 'loading') { text.textContent = 'Conectando...'; }
  if (state === 'live') { dot.classList.add('live'); text.textContent = `${playerGroups.length} jugadores · ${allRows.length} visorias`; }
  if (state === 'error') { dot.classList.add('error'); text.textContent = 'Sin conexión'; }
}

function showError() {
  document.getElementById('metricsGrid').innerHTML = `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">⚠</div>
      <p>No se pudo conectar al Google Sheet. Verificá que esté compartido en modo lectura.</p>
    </div>`;
}

// ============================================
// RENDER ALL
// ============================================

function renderAll() {
  renderOverview();
  populateFilters();
  renderPlayers();
  populateSimSelect();
}

// ============================================
// OVERVIEW
// ============================================

function renderOverview() {
  const total = playerGroups.length;
  const totalVisorias = allRows.length;
  if (total === 0) {
    document.getElementById('metricsGrid').innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📋</div><p>No hay visorias cargadas todavía.</p></div>`;
    return;
  }

  const conNivel = playerGroups.filter(pg => pg.conNivel).length;
  const niveles = playerGroups.map(pg => pg.nivelGeneral).filter(n => n !== null);
  const prom = niveles.length ? (niveles.reduce((a, b) => a + b, 0) / niveles.length).toFixed(1) : '—';
  const posSet = new Set(playerGroups.map(pg => pg.pos).filter(Boolean));

  document.getElementById('metricsGrid').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Jugadores</div>
      <div class="metric-value">${total}</div>
      <div class="metric-sub">${totalVisorias} visorias en total</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Nivel promedio</div>
      <div class="metric-value metric-accent">${prom}</div>
      <div class="metric-sub">habilidad general</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Con nivel</div>
      <div class="metric-value">${conNivel}</div>
      <div class="metric-sub">aptos para captación</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Posiciones</div>
      <div class="metric-value">${posSet.size}</div>
      <div class="metric-sub">perfiles distintos</div>
    </div>
  `;

  renderOverviewCharts();
  renderRecentList();
}

function renderOverviewCharts() {
  const posCounts = {};
  playerGroups.forEach(pg => {
    const pos = pg.pos || 'Sin datos';
    posCounts[pos] = (posCounts[pos] || 0) + 1;
  });
  const posLabels = Object.keys(posCounts).sort((a, b) => posCounts[b] - posCounts[a]).slice(0, 10);
  const colors = ['#c8f04a','#4af0c8','#4a90f0','#f0c84a','#f04a90','#90f04a','#f0904a','#904af0','#4af090','#f04a4a'];

  if (charts.pos) charts.pos.destroy();
  const posCtx = document.getElementById('posChart');
  if (posCtx) {
    charts.pos = new Chart(posCtx, {
      type: 'doughnut',
      data: {
        labels: posLabels,
        datasets: [{ data: posLabels.map(l => posCounts[l]), backgroundColor: colors.slice(0, posLabels.length), borderWidth: 0, hoverOffset: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#9898a8', font: { size: 11, family: 'DM Mono' }, padding: 8, boxWidth: 10 } } }
      }
    });
  }

  const nivCounts = {};
  playerGroups.forEach(pg => {
    if (pg.nivelGeneral !== null) {
      const n = pg.nivelGeneral.toString();
      nivCounts[n] = (nivCounts[n] || 0) + 1;
    }
  });
  const nivLabels = Object.keys(nivCounts).sort((a, b) => parseFloat(a) - parseFloat(b));

  if (charts.niv) charts.niv.destroy();
  const nivCtx = document.getElementById('nivChart');
  if (nivCtx) {
    charts.niv = new Chart(nivCtx, {
      type: 'bar',
      data: {
        labels: nivLabels,
        datasets: [{ data: nivLabels.map(l => nivCounts[l]), backgroundColor: '#c8f04a', borderRadius: 3, borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: '#55555f', font: { size: 11 } }, grid: { color: '#2a2a35' } },
          x: { ticks: { color: '#55555f', font: { size: 11 }, maxRotation: 45 }, grid: { display: false } }
        }
      }
    });
  }
}

function renderRecentList() {
  const recientes = [...playerGroups].slice(-8).reverse();
  document.getElementById('recentList').innerHTML = recientes.map(pg => `
    <div class="table-row" style="cursor:pointer" onclick="selectPlayerByName('${pg.nombre.replace(/'/g,"\\'")}')">
      <span class="table-row-left">${pg.nombre}${pg.pos ? ' · ' + pg.pos : ''}${pg.equipo ? ' · ' + pg.equipo : ''}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;color:var(--text-3);font-family:var(--font-mono)">${pg.visorias.length} visoria${pg.visorias.length > 1 ? 's' : ''}</span>
        ${pg.nivelGeneral !== null ? `<span style="font-family:var(--font-mono);font-size:12px;color:var(--accent)">${pg.nivelGeneral}</span>` : ''}
        ${pg.conNivel ? '<span class="badge badge-green">Con nivel</span>' : ''}
      </div>
    </div>`).join('');
}

// ============================================
// PLAYERS — con barra de búsqueda y filtros
// ============================================

function populateFilters() {
  const posSet = [...new Set(playerGroups.map(pg => pg.pos).filter(Boolean))].sort();
  const rolSet = [...new Set(playerGroups.map(pg => pg.rol).filter(Boolean))].sort();

  const fPos = document.getElementById('fPos');
  const fRol = document.getElementById('fRol');
  fPos.innerHTML = '<option value="">Todas las posiciones</option>';
  fRol.innerHTML = '<option value="">Todos los roles</option>';
  posSet.forEach(v => fPos.innerHTML += `<option value="${v}">${v}</option>`);
  rolSet.forEach(v => fRol.innerHTML += `<option value="${v}">${v}</option>`);

  fPos.addEventListener('change', renderPlayers);
  fRol.addEventListener('change', renderPlayers);
  document.getElementById('fNivel').addEventListener('change', renderPlayers);

  // Búsqueda por nombre
  const searchInput = document.getElementById('searchPlayer');
  if (searchInput) searchInput.addEventListener('input', renderPlayers);
}

function renderPlayers() {
  const fPos = document.getElementById('fPos').value;
  const fRol = document.getElementById('fRol').value;
  const fNivel = document.getElementById('fNivel').value;
  const search = (document.getElementById('searchPlayer')?.value || '').toLowerCase().trim();

  const filtered = playerGroups.filter(pg => {
    if (fPos && pg.pos !== fPos) return false;
    if (fRol && pg.rol !== fRol) return false;
    if (fNivel === 'si' && !pg.conNivel) return false;
    if (fNivel === 'no' && pg.conNivel) return false;
    if (search && !pg.nombre.toLowerCase().includes(search)) return false;
    return true;
  });

  document.getElementById('resultsCount').textContent = `${filtered.length} jugador${filtered.length !== 1 ? 'es' : ''}`;

  const grid = document.getElementById('playersGrid');
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔍</div><p>No hay jugadores con esos filtros.</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(pg => `
    <div class="player-card ${selectedPlayerName === pg.nombre ? 'selected' : ''}" onclick="selectPlayerByName('${pg.nombre.replace(/'/g,"\\'")}')">
      <div class="player-avatar">${initials(pg.nombre)}</div>
      <div class="player-name">${pg.nombre}</div>
      <div class="player-pos">${pg.pos}${pg.rol ? ' · ' + pg.rol : ''}</div>
      <div class="player-club">${pg.equipo}${pg.edad ? ' · ' + pg.edad + ' años' : ''}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">
        ${pg.nivelGeneral !== null ? `<div class="player-level">${pg.nivelGeneral}<span class="player-level-label"> / 10</span></div>` : '<div></div>'}
        <span style="font-size:11px;color:var(--text-3);font-family:var(--font-mono)">${pg.visorias.length} visoria${pg.visorias.length > 1 ? 's' : ''}</span>
      </div>
      <div style="margin-top:6px">${pg.conNivel ? '<span class="badge badge-green">Con nivel</span>' : ''}</div>
    </div>`).join('');
}

function selectPlayerByName(nombre) {
  selectedPlayerName = nombre;
  renderPlayers();
  renderDetail();
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === 'detail'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-detail').classList.add('active');
}

// ============================================
// DETAIL — muestra todas las visorias del jugador
// ============================================

function renderDetail() {
  const pg = playerGroups.find(p => p.nombre === selectedPlayerName);
  if (!pg) return;

  const ultima = pg.visorias[pg.visorias.length - 1];
  const nv = pg.conNivel;
  const desc = pg.visorias.map(v => getField(v, 'descripción general', 'descripcion general')).filter(Boolean).pop() || '';

  // Valoraciones de todas las visorias
  const valoraciones = pg.visorias
    .map(v => parseFloat(getField(v, 'valoración', 'valoracion')))
    .filter(n => !isNaN(n));
  const valoracionProm = valoraciones.length ? (valoraciones.reduce((a, b) => a + b, 0) / valoraciones.length).toFixed(1) : null;

  document.getElementById('detailContent').innerHTML = `
    <div class="detail-header">
      <div class="detail-avatar">${initials(pg.nombre)}</div>
      <div class="detail-info">
        <div class="detail-name">${pg.nombre}</div>
        <div class="detail-meta">${[pg.pos, pg.rol, pg.equipo].filter(Boolean).join(' · ')}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        ${nv ? '<span class="badge badge-green">Con nivel</span>' : ''}
        <span style="font-size:12px;color:var(--text-3);font-family:var(--font-mono)">${pg.visorias.length} visoria${pg.visorias.length > 1 ? 's' : ''}</span>
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-card">
        <div class="detail-card-title">Información general</div>
        ${[['Edad', pg.edad ? pg.edad + ' años' : ''], ['Nacionalidad', pg.nac], ['Equipo', pg.equipo],
           ['Nivel general (prom.)', pg.nivelGeneral !== null ? pg.nivelGeneral + ' / 10' : ''],
           ['Nivel potencial (prom.)', pg.nivelPotencial !== null ? pg.nivelPotencial + ' / 10' : ''],
           ['Valoración (prom.)', valoracionProm ? valoracionProm + ' / 10' : ''],
        ].filter(([, v]) => v).map(([l, v]) => `
          <div class="detail-row">
            <span class="detail-row-label">${l}</span>
            <span class="detail-row-value">${v}</span>
          </div>`).join('')}
      </div>
      <div class="detail-card">
        <div class="detail-card-title">Métricas de rendimiento</div>
        ${pg.nivelGeneral !== null ? barHTML('Nivel general', pg.nivelGeneral, 10, '#c8f04a') : ''}
        ${pg.nivelPotencial !== null ? barHTML('Nivel potencial', pg.nivelPotencial, 10, '#4af0c8') : ''}
        ${valoracionProm ? barHTML('Valoración promedio', parseFloat(valoracionProm), 10, '#4a90f0') : ''}
      </div>
    </div>

    ${desc ? `
    <div class="obs-block" style="margin-bottom:12px">
      <div class="obs-title">Descripción del jugador</div>
      <div class="obs-item-text">${desc}</div>
    </div>` : ''}

    <div class="obs-block">
      <div class="obs-title">Historial de visorias</div>
      ${pg.visorias.map((v, i) => {
        const torneo = getField(v, 'torneo', 'nombre del torneo');
        const partido = getField(v, 'partido');
        const fecha = getField(v, 'fecha');
        const nivel = getField(v, 'habilidad general', 'nivel general');
        const valoracion = getField(v, 'valoración', 'valoracion');
        const otec = getField(v, 'técnicas ofensivas', 'tecnicas ofensivas', 'técnicas (ofensivas');
        const dtec = getField(v, 'técnicas defensivas', 'tecnicas defensivas');
        const otac = getField(v, 'tácticas ofensivas', 'tacticas ofensivas', 'tácticas (ofensivas');
        const dtac = getField(v, 'tácticas defensivas', 'tacticas defensivas');
        const fis = getField(v, 'físicas', 'fisicas');
        const men = getField(v, 'mentales', 'actitudinales');
        const extra = getField(v, 'comentario extra', 'extra');
        const obsItems = [
          ['Obs. técnicas ofensivas', otec], ['Obs. técnicas defensivas', dtec],
          ['Obs. tácticas ofensivas', otac], ['Obs. tácticas defensivas', dtac],
          ['Obs. físicas', fis], ['Obs. mentales / actitudinales', men],
        ].filter(([, v]) => v);
        return `
          <div class="obs-item">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div>
                <div class="obs-item-label">Visoria ${pg.visorias.length - i}${fecha ? ' · ' + fecha : ''}${torneo ? ' · ' + torneo : ''}</div>
                ${partido ? `<div style="font-size:12px;color:var(--text-3)">${partido}</div>` : ''}
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                ${nivel ? `<span style="font-family:var(--font-mono);font-size:13px;color:var(--accent)">${nivel}/10</span>` : ''}
                ${valoracion ? `<span style="font-size:12px;color:var(--text-3)">Val: ${valoracion}</span>` : ''}
              </div>
            </div>
            ${obsItems.map(([l, v]) => `
              <div style="margin-bottom:6px">
                <div style="font-size:11px;color:var(--accent);font-family:var(--font-mono);margin-bottom:2px">${l}</div>
                <div style="font-size:13px;color:var(--text-2);line-height:1.6">${v}</div>
              </div>`).join('')}
            ${extra ? `<div style="font-size:12px;color:var(--text-3);margin-top:4px;font-style:italic">${extra}</div>` : ''}
          </div>`;
      }).join('')}
    </div>
  `;
}

// ============================================
// SIMILARITY
// ============================================

function populateSimSelect() {
  const sel = document.getElementById('simSelect');
  sel.innerHTML = '<option value="">— Elegí un jugador de referencia —</option>';
  playerGroups.forEach((pg, i) => {
    sel.innerHTML += `<option value="${i}">${pg.nombre} — ${pg.pos}</option>`;
  });
  sel.addEventListener('change', renderSimilarity);
}

function updateWeights() {
  const wStats = parseInt(document.getElementById('wStats').value);
  document.getElementById('wStatsVal').textContent = wStats + '%';
  document.getElementById('wTextVal').textContent = (100 - wStats) + '%';
  renderSimilarity();
}

function simScore(a, b, wStats) {
  const wText = 1 - wStats;

  const numScore = 1 - Math.sqrt(
    Math.pow(((a.nivelGeneral || 0) - (b.nivelGeneral || 0)) / 10, 2) +
    Math.pow(((a.nivelPotencial || 0) - (b.nivelPotencial || 0)) / 10, 2)
  ) / Math.sqrt(2);

  // Similitud semántica por palabras clave en descripciones
  const descA = a.visorias.map(v => getField(v, 'descripción general', 'descripcion general')).join(' ').toLowerCase();
  const descB = b.visorias.map(v => getField(v, 'descripción general', 'descripcion general')).join(' ').toLowerCase();
  const wordsA = new Set(descA.split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(descB.split(/\s+/).filter(w => w.length > 3));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  const textScore = union > 0 ? intersection / union : 0;

  const posBonus = a.pos === b.pos ? 0.05 : 0;

  return Math.min(1, numScore * wStats + textScore * wText + posBonus);
}

function renderSimilarity() {
  const idx = parseInt(document.getElementById('simSelect').value);
  const wStats = parseInt(document.getElementById('wStats').value) / 100;
  const res = document.getElementById('simResults');
  if (isNaN(idx)) { res.innerHTML = ''; return; }

  const ref = playerGroups[idx];
  const scored = playerGroups
    .map((pg, i) => ({ pg, i, s: simScore(ref, pg, wStats) }))
    .filter(x => x.i !== idx)
    .sort((a, b) => b.s - a.s)
    .slice(0, 6);

  res.innerHTML = `
    <div class="detail-card">
      <div class="detail-card-title">Más similares a ${ref.nombre}</div>
      <div class="sim-list">
        ${scored.map(({ pg, i, s }) => `
          <div class="sim-item" onclick="selectPlayerByName('${pg.nombre.replace(/'/g,"\\'")}')">
            <div class="sim-avatar">${initials(pg.nombre)}</div>
            <div>
              <div class="sim-name">${pg.nombre}</div>
              <div class="sim-meta">${[pg.pos, pg.equipo].filter(Boolean).join(' · ')}${pg.nivelGeneral ? ' · Nivel ' + pg.nivelGeneral : ''}</div>
            </div>
            <div style="text-align:right">
              <div class="sim-score">${Math.round(s * 100)}%</div>
              <div class="sim-score-label">similitud</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ============================================
// STATS (Sofascore manual)
// ============================================

function getStatsStorage() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || '[]'); } catch { return []; }
}

function saveStatsStorage(data) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(data)); } catch (e) { console.warn('localStorage no disponible'); }
}

function getStatVal(id) {
  const v = document.getElementById(id).value;
  return v === '' ? null : parseFloat(v);
}

function guardarStats() {
  const nombre = document.getElementById('statsPlayer').value.trim();
  const partido = document.getElementById('statsMatch').value.trim();
  if (!nombre) { alert('Ingresá el nombre del jugador.'); return; }
  const entry = {
    id: Date.now(), jugador: nombre, partido: partido || '—',
    fecha: new Date().toLocaleDateString('es-AR'),
    goles: getStatVal('s-goles'), asistencias: getStatVal('s-asist'),
    remates: getStatVal('s-remates'), xg: getStatVal('s-xg'),
    regates: getStatVal('s-regates'), ocasiones: getStatVal('s-ocasiones'),
    pases: getStatVal('s-pases'), precision: getStatVal('s-precision'),
    duelos: getStatVal('s-duelos'), recuperaciones: getStatVal('s-recup'),
    intercepciones: getStatVal('s-interc'), despejes: getStatVal('s-despejes'),
    rating: getStatVal('s-rating'), minutos: getStatVal('s-minutos'),
  };
  const all = getStatsStorage();
  all.push(entry);
  saveStatsStorage(all);
  const badge = document.getElementById('savedBadge');
  badge.style.display = 'inline-block';
  setTimeout(() => badge.style.display = 'none', 2500);
}

function limpiarStats() {
  ['s-goles','s-asist','s-remates','s-xg','s-regates','s-ocasiones','s-pases','s-precision','s-duelos','s-recup','s-interc','s-despejes','s-rating','s-minutos'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

function renderStatsView() {
  const nombre = document.getElementById('statsPlayer').value.trim();
  const all = getStatsStorage();
  const registros = nombre ? all.filter(e => e.jugador.toLowerCase() === nombre.toLowerCase()) : all;
  const cont = document.getElementById('statsView');
  if (registros.length === 0) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>${nombre ? `No hay estadísticas para "${nombre}".` : 'Ingresá un nombre arriba.'}</p></div>`;
    return;
  }
  const avg = key => {
    const vals = registros.map(r => r[key]).filter(v => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const fmt = (v, dec = 1) => v !== null && v !== undefined ? parseFloat(v.toFixed(dec)) : '—';
  cont.innerHTML = `
    <div class="stats-metrics">
      <div class="stats-metric"><div class="stats-metric-label">Rating</div><div class="stats-metric-value">${fmt(avg('rating'))}</div></div>
      <div class="stats-metric"><div class="stats-metric-label">Goles</div><div class="stats-metric-value">${fmt(avg('goles'))}</div></div>
      <div class="stats-metric"><div class="stats-metric-label">Asistencias</div><div class="stats-metric-value">${fmt(avg('asistencias'))}</div></div>
      <div class="stats-metric"><div class="stats-metric-label">xG</div><div class="stats-metric-value">${fmt(avg('xg'), 2)}</div></div>
    </div>
    <div class="detail-grid">
      <div class="detail-card">
        <div class="detail-card-title">Acciones — ${registros.length} partido${registros.length > 1 ? 's' : ''}</div>
        ${barHTML('Precisión pase', avg('precision'), 100, '#c8f04a', '%')}
        ${barHTML('Duelos ganados', avg('duelos'), 100, '#4af0c8', '%')}
        ${barHTML('Recuperaciones', avg('recuperaciones'), 20, '#4a90f0')}
        ${barHTML('Intercepciones', avg('intercepciones'), 10, '#f0c84a')}
        ${barHTML('Despejes', avg('despejes'), 15, '#f04a90')}
      </div>
      <div class="detail-card">
        <div class="detail-card-title">Producción ofensiva</div>
        ${barHTML('Remates al arco', avg('remates'), 10, '#c8f04a')}
        ${barHTML('Regates completados', avg('regates'), 10, '#4af0c8')}
        ${barHTML('Ocasiones creadas', avg('ocasiones'), 8, '#4a90f0')}
        ${barHTML('Pases completados', avg('pases'), 80, '#f0c84a')}
      </div>
    </div>`;
}

function renderStatsHistory() {
  const all = getStatsStorage();
  const cont = document.getElementById('statsHistory');
  if (all.length === 0) {
    cont.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No hay estadísticas guardadas todavía.</p></div>';
    return;
  }
  cont.innerHTML = [...all].reverse().map(e => `
    <div class="history-card">
      <div class="history-header">
        <div>
          <div class="history-name">${e.jugador}</div>
          <div class="history-match">${e.partido} · ${e.fecha}</div>
        </div>
        ${e.rating !== null ? `<div class="history-rating">${e.rating}</div>` : ''}
      </div>
      <div class="history-stats">
        ${e.goles !== null ? `<span>Goles: <strong>${e.goles}</strong></span>` : ''}
        ${e.asistencias !== null ? `<span>Asist: <strong>${e.asistencias}</strong></span>` : ''}
        ${e.xg !== null ? `<span>xG: <strong>${e.xg}</strong></span>` : ''}
        ${e.precision !== null ? `<span>Pase: <strong>${e.precision}%</strong></span>` : ''}
        ${e.duelos !== null ? `<span>Duelos: <strong>${e.duelos}%</strong></span>` : ''}
        ${e.recuperaciones !== null ? `<span>Recup: <strong>${e.recuperaciones}</strong></span>` : ''}
        ${e.minutos !== null ? `<span>Min: <strong>${e.minutos}</strong></span>` : ''}
      </div>
      <button class="history-delete" onclick="eliminarStat(${e.id})">Eliminar registro</button>
    </div>`).join('');
}

function eliminarStat(id) {
  saveStatsStorage(getStatsStorage().filter(e => e.id !== id));
  renderStatsHistory();
}

// ============================================
// HELPERS
// ============================================

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function barHTML(label, val, max, color, unit = '') {
  if (val === null || val === undefined) return '';
  const pct = Math.min(100, (val / max) * 100).toFixed(1);
  const display = parseFloat(val.toFixed(1)) + unit;
  return `
    <div class="bar-group">
      <div class="bar-header"><span>${label}</span><span>${display}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
}
