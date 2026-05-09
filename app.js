/* ============================================
   SCOUT INTELLIGENCE — app.js
   Alan Correa · Analista & Scout
   ============================================ */

const SHEET_ID = '1qjZVOaJpJRJsti13gEOPuywp2Kmq5Fpi3qVGobBYq64';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
const STATS_KEY = 'scout_stats_v1';

let allPlayers = [];
let selectedPlayerIdx = null;
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
    allPlayers = rows.filter(r => {
      const jugador = getField(r, 'jugador', 'nombre');
      return jugador && jugador.toString().trim() !== '';
    });
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

function setStatus(state) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  dot.className = 'status-dot';
  if (state === 'loading') { text.textContent = 'Conectando...'; }
  if (state === 'live') { dot.classList.add('live'); text.textContent = `${allPlayers.length} jugadores`; }
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
  const total = allPlayers.length;
  if (total === 0) {
    document.getElementById('metricsGrid').innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📋</div><p>No hay visorias cargadas todavía. Completá el form para ver los datos acá.</p></div>`;
    return;
  }

  const conNivel = allPlayers.filter(p => {
    const v = getField(p, 'nivel para', 'nivel para el').toLowerCase();
    return v === 'sí' || v === 'si';
  }).length;

  const niveles = allPlayers
    .map(p => parseFloat(getField(p, 'habilidad general', 'nivel general')))
    .filter(n => !isNaN(n));
  const prom = niveles.length ? (niveles.reduce((a, b) => a + b, 0) / niveles.length).toFixed(1) : '—';
  const posSet = new Set(allPlayers.map(p => getField(p, 'posición', 'posicion')).filter(Boolean));

  document.getElementById('metricsGrid').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Jugadores visoriados</div>
      <div class="metric-value">${total}</div>
      <div class="metric-sub">en la base de datos</div>
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
  // Posición chart
  const posCounts = {};
  allPlayers.forEach(p => {
    const pos = getField(p, 'posición', 'posicion') || 'Sin datos';
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
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#9898a8', font: { size: 11, family: 'DM Mono' }, padding: 8, boxWidth: 10 } }
        }
      }
    });
  }

  // Nivel chart
  const nivCounts = {};
  allPlayers.forEach(p => {
    const n = getField(p, 'habilidad general', 'nivel general');
    if (n) nivCounts[n] = (nivCounts[n] || 0) + 1;
  });
  const nivLabels = Object.keys(nivCounts).sort((a, b) => parseFloat(a) - parseFloat(b));

  if (charts.niv) charts.niv.destroy();
  const nivCtx = document.getElementById('nivChart');
  if (nivCtx) {
    charts.niv = new Chart(nivCtx, {
      type: 'bar',
      data: {
        labels: nivLabels,
        datasets: [{
          data: nivLabels.map(l => nivCounts[l]),
          backgroundColor: '#c8f04a',
          borderRadius: 3,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
  const recientes = [...allPlayers].slice(-8).reverse();
  document.getElementById('recentList').innerHTML = recientes.map(p => {
    const nombre = getField(p, 'jugador', 'nombre');
    const pos = getField(p, 'posición', 'posicion');
    const club = getField(p, 'equipo', 'club');
    const nv = getField(p, 'nivel para', 'nivel para el');
    const nivel = getField(p, 'habilidad general', 'nivel general');
    return `
      <div class="table-row">
        <span class="table-row-left">${nombre}${pos ? ' · ' + pos : ''}${club ? ' · ' + club : ''}</span>
        <div style="display:flex;align-items:center;gap:8px">
          ${nivel ? `<span style="font-family:var(--font-mono);font-size:12px;color:var(--accent)">${nivel}</span>` : ''}
          ${badgeFromNivel(nv)}
        </div>
      </div>`;
  }).join('');
}

// ============================================
// PLAYERS
// ============================================

function populateFilters() {
  const posSet = [...new Set(allPlayers.map(p => getField(p, 'posición', 'posicion')).filter(Boolean))].sort();
  const rolSet = [...new Set(allPlayers.map(p => getField(p, 'rol')).filter(Boolean))].sort();

  const fPos = document.getElementById('fPos');
  const fRol = document.getElementById('fRol');
  fPos.innerHTML = '<option value="">Todas las posiciones</option>';
  fRol.innerHTML = '<option value="">Todos los roles</option>';
  posSet.forEach(v => fPos.innerHTML += `<option value="${v}">${v}</option>`);
  rolSet.forEach(v => fRol.innerHTML += `<option value="${v}">${v}</option>`);

  fPos.addEventListener('change', renderPlayers);
  fRol.addEventListener('change', renderPlayers);
  document.getElementById('fNivel').addEventListener('change', renderPlayers);
}

function renderPlayers() {
  const fPos = document.getElementById('fPos').value;
  const fRol = document.getElementById('fRol').value;
  const fNivel = document.getElementById('fNivel').value;

  const filtered = allPlayers.filter(p => {
    const pos = getField(p, 'posición', 'posicion');
    const rol = getField(p, 'rol');
    const nv = getField(p, 'nivel para', 'nivel para el').toLowerCase();
    if (fPos && pos !== fPos) return false;
    if (fRol && rol !== fRol) return false;
    if (fNivel === 'si' && nv !== 'sí' && nv !== 'si') return false;
    if (fNivel === 'no' && (nv === 'sí' || nv === 'si')) return false;
    return true;
  });

  document.getElementById('resultsCount').textContent = `${filtered.length} jugadores`;

  const grid = document.getElementById('playersGrid');
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔍</div><p>No hay jugadores con esos filtros.</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const idx = allPlayers.indexOf(p);
    const nombre = getField(p, 'jugador', 'nombre');
    const pos = getField(p, 'posición', 'posicion');
    const rol = getField(p, 'rol');
    const equipo = getField(p, 'equipo', 'club');
    const edad = getField(p, 'edad');
    const nv = getField(p, 'nivel para', 'nivel para el');
    const nivel = getField(p, 'habilidad general', 'nivel general');
    return `
      <div class="player-card ${selectedPlayerIdx === idx ? 'selected' : ''}" onclick="selectPlayer(${idx})">
        <div class="player-avatar">${initials(nombre)}</div>
        <div class="player-name">${nombre || '—'}</div>
        <div class="player-pos">${pos}${rol ? ' · ' + rol : ''}</div>
        <div class="player-club">${equipo}${edad ? ' · ' + edad + ' años' : ''}</div>
        ${nivel ? `<div class="player-level">${nivel}<span class="player-level-label"> / 10</span></div>` : ''}
        <div style="margin-top:6px">${badgeFromNivel(nv)}</div>
      </div>`;
  }).join('');
}

function selectPlayer(idx) {
  selectedPlayerIdx = idx;
  renderPlayers();
  renderDetail();
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === 'detail');
  });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-detail').classList.add('active');
}

// ============================================
// DETAIL
// ============================================

function renderDetail() {
  const p = allPlayers[selectedPlayerIdx];
  if (!p) return;

  const nombre = getField(p, 'jugador', 'nombre');
  const pos = getField(p, 'posición', 'posicion');
  const rol = getField(p, 'rol');
  const equipo = getField(p, 'equipo', 'club');
  const edad = getField(p, 'edad');
  const nac = getField(p, 'nacionalidad');
  const torneo = getField(p, 'torneo', 'nombre del torneo');
  const esquema = getField(p, 'esquema');
  const tiempo = getField(p, 'tiempo');
  const valoracion = getField(p, 'valoración', 'valoracion');
  const ngh = parseFloat(getField(p, 'habilidad general', 'nivel general')) || null;
  const ngp = parseFloat(getField(p, 'habilidad potencial', 'nivel potencial')) || null;
  const nv = getField(p, 'nivel para', 'nivel para el');
  const seguir = getField(p, 'seguir', 'argumentos');
  const scout = getField(p, 'scout');
  const otec = getField(p, 'técnicas ofensivas', 'tecnicas ofensivas', 'técnicas (ofensivas');
  const dtec = getField(p, 'técnicas defensivas', 'tecnicas defensivas');
  const otac = getField(p, 'tácticas ofensivas', 'tacticas ofensivas', 'tácticas (ofensivas');
  const dtac = getField(p, 'tácticas defensivas', 'tacticas defensivas');
  const fis = getField(p, 'físicas', 'fisicas');
  const men = getField(p, 'mentales', 'actitudinales');
  const desc = getField(p, 'descripción general', 'descripcion general');
  const extra = getField(p, 'comentario extra', 'extra');
  const motivos = getField(p, 'motivos');

  const infoRows = [
    ['Scout', scout], ['Edad', edad ? edad + ' años' : ''], ['Nacionalidad', nac],
    ['Equipo', equipo], ['Torneo', torneo], ['Esquema', esquema],
    ['Tiempo de juego', tiempo ? tiempo + ' min' : ''], ['Valoración partido', valoracion ? valoracion + ' / 10' : ''],
    ['Nivel general', ngh ? ngh + ' / 10' : ''], ['Nivel potencial', ngp ? ngp + ' / 10' : ''],
    ['Seguir observando', seguir],
  ].filter(([, v]) => v);

  const obsItems = [
    ['Obs. técnicas ofensivas', otec], ['Obs. técnicas defensivas', dtec],
    ['Obs. tácticas ofensivas', otac], ['Obs. tácticas defensivas', dtac],
    ['Obs. físicas', fis], ['Obs. mentales / actitudinales', men],
  ].filter(([, v]) => v);

  document.getElementById('detailContent').innerHTML = `
    <div class="detail-header">
      <div class="detail-avatar">${initials(nombre)}</div>
      <div class="detail-info">
        <div class="detail-name">${nombre || '—'}</div>
        <div class="detail-meta">${[pos, rol, equipo].filter(Boolean).join(' · ')}</div>
      </div>
      <div>${badgeFromNivel(nv)}</div>
    </div>

    <div class="detail-grid">
      <div class="detail-card">
        <div class="detail-card-title">Información general</div>
        ${infoRows.map(([l, v]) => `<div class="detail-row"><span class="detail-row-label">${l}</span><span class="detail-row-value">${v}</span></div>`).join('')}
      </div>
      <div class="detail-card">
        <div class="detail-card-title">Métricas de rendimiento</div>
        ${ngh !== null ? barHTML('Nivel general', ngh, 10, '#c8f04a') : ''}
        ${ngp !== null ? barHTML('Nivel potencial', ngp, 10, '#4af0c8') : ''}
        ${valoracion ? barHTML('Valoración partido', parseFloat(valoracion), 10, '#4a90f0') : ''}
        ${!ngh && !ngp && !valoracion ? '<div style="color:var(--text-3);font-size:13px">Sin métricas numéricas disponibles.</div>' : ''}
      </div>
    </div>

    ${desc ? `
    <div class="obs-block" style="margin-bottom:12px">
      <div class="obs-title">Descripción del jugador</div>
      <div class="obs-item-text">${desc}</div>
    </div>` : ''}

    ${obsItems.length ? `
    <div class="obs-block">
      <div class="obs-title">Observaciones</div>
      ${obsItems.map(([l, v]) => `
        <div class="obs-item">
          <div class="obs-item-label">${l}</div>
          <div class="obs-item-text">${v}</div>
        </div>`).join('')}
    </div>` : ''}

    ${extra || motivos ? `
    <div class="obs-block" style="margin-top:12px">
      <div class="obs-title">Notas adicionales</div>
      ${extra ? `<div class="obs-item"><div class="obs-item-label">Comentario extra</div><div class="obs-item-text">${extra}</div></div>` : ''}
      ${motivos ? `<div class="obs-item"><div class="obs-item-label">Motivos</div><div class="obs-item-text">${motivos}</div></div>` : ''}
    </div>` : ''}
  `;
}

// ============================================
// SIMILARITY
// ============================================

function populateSimSelect() {
  const sel = document.getElementById('simSelect');
  sel.innerHTML = '<option value="">— Elegí un jugador de referencia —</option>';
  allPlayers.forEach((p, i) => {
    const nombre = getField(p, 'jugador', 'nombre');
    const pos = getField(p, 'posición', 'posicion');
    sel.innerHTML += `<option value="${i}">${nombre} — ${pos}</option>`;
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

  const ngh_a = parseFloat(getField(a, 'habilidad general', 'nivel general')) || 0;
  const ngh_b = parseFloat(getField(b, 'habilidad general', 'nivel general')) || 0;
  const ngp_a = parseFloat(getField(a, 'habilidad potencial', 'nivel potencial')) || 0;
  const ngp_b = parseFloat(getField(b, 'habilidad potencial', 'nivel potencial')) || 0;
  const val_a = parseFloat(getField(a, 'valoración', 'valoracion')) || 0;
  const val_b = parseFloat(getField(b, 'valoración', 'valoracion')) || 0;

  const numScore = 1 - Math.sqrt(
    Math.pow((ngh_a - ngh_b) / 10, 2) +
    Math.pow((ngp_a - ngp_b) / 10, 2) +
    Math.pow((val_a - val_b) / 10, 2)
  ) / Math.sqrt(3);

  const desc_a = getField(a, 'descripción general', 'descripcion general').toLowerCase();
  const desc_b = getField(b, 'descripción general', 'descripcion general').toLowerCase();
  const words_a = new Set(desc_a.split(/\s+/).filter(w => w.length > 3));
  const words_b = new Set(desc_b.split(/\s+/).filter(w => w.length > 3));
  const intersection = [...words_a].filter(w => words_b.has(w)).length;
  const union = new Set([...words_a, ...words_b]).size;
  const textScore = union > 0 ? intersection / union : 0;

  const posBonus = getField(a, 'posición', 'posicion') === getField(b, 'posición', 'posicion') ? 0.05 : 0;

  return Math.min(1, numScore * wStats + textScore * wText + posBonus);
}

function renderSimilarity() {
  const idx = parseInt(document.getElementById('simSelect').value);
  const wStats = parseInt(document.getElementById('wStats').value) / 100;
  const res = document.getElementById('simResults');

  if (isNaN(idx)) { res.innerHTML = ''; return; }

  const ref = allPlayers[idx];
  const scored = allPlayers
    .map((p, i) => ({ p, i, s: simScore(ref, p, wStats) }))
    .filter(x => x.i !== idx)
    .sort((a, b) => b.s - a.s)
    .slice(0, 6);

  const nombre = getField(ref, 'jugador', 'nombre');

  res.innerHTML = `
    <div class="detail-card">
      <div class="detail-card-title">Más similares a ${nombre}</div>
      <div class="sim-list">
        ${scored.map(({ p, i, s }) => {
          const n = getField(p, 'jugador', 'nombre');
          const pos = getField(p, 'posición', 'posicion');
          const eq = getField(p, 'equipo', 'club');
          const nv = getField(p, 'habilidad general', 'nivel general');
          const pct = Math.round(s * 100);
          return `
            <div class="sim-item" onclick="selectPlayer(${i})">
              <div class="sim-avatar">${initials(n)}</div>
              <div>
                <div class="sim-name">${n}</div>
                <div class="sim-meta">${[pos, eq].filter(Boolean).join(' · ')}${nv ? ' · Nivel ' + nv : ''}</div>
              </div>
              <div style="text-align:right">
                <div class="sim-score">${pct}%</div>
                <div class="sim-score-label">similitud</div>
              </div>
            </div>`;
        }).join('')}
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
    id: Date.now(),
    jugador: nombre,
    partido: partido || '—',
    fecha: new Date().toLocaleDateString('es-AR'),
    goles: getStatVal('s-goles'),
    asistencias: getStatVal('s-asist'),
    remates: getStatVal('s-remates'),
    xg: getStatVal('s-xg'),
    regates: getStatVal('s-regates'),
    ocasiones: getStatVal('s-ocasiones'),
    pases: getStatVal('s-pases'),
    precision: getStatVal('s-precision'),
    duelos: getStatVal('s-duelos'),
    recuperaciones: getStatVal('s-recup'),
    intercepciones: getStatVal('s-interc'),
    despejes: getStatVal('s-despejes'),
    rating: getStatVal('s-rating'),
    minutos: getStatVal('s-minutos'),
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
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>${nombre ? `No hay estadísticas guardadas para "${nombre}".` : 'Ingresá un nombre de jugador arriba.'}</p></div>`;
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
    </div>
  `;
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
    </div>
  `).join('');
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

function badgeFromNivel(val) {
  if (!val) return '';
  const v = val.toString().toLowerCase();
  if (v === 'sí' || v === 'si') return '<span class="badge badge-green">Con nivel</span>';
  return '<span class="badge badge-amber">Sin nivel</span>';
}

function barHTML(label, val, max, color, unit = '') {
  if (val === null || val === undefined) return '';
  const pct = Math.min(100, (val / max) * 100).toFixed(1);
  const display = typeof val === 'number' ? parseFloat(val.toFixed(1)) + unit : val + unit;
  return `
    <div class="bar-group">
      <div class="bar-header"><span>${label}</span><span>${display}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
}
