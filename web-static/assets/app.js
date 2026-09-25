// P2Pool eCash dashboard. Reads the node's JSON API on the same origin.
'use strict';

(() => {
  const REFRESH_MS = 30000;
  const $ = (id) => document.getElementById(id);

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const SI = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z'];
  function hashrate(v, base = 'H/s') {
    if (v == null || !isFinite(v)) return '–';
    let i = 0;
    while (Math.abs(v) >= 1000 && i < SI.length - 1) {
      v /= 1000;
      i++;
    }
    return `${v.toFixed(v >= 100 ? 1 : 2)} ${SI[i]}${base}`;
  }
  const compact = (v) => hashrate(v, '').trim();

  function num(v, digits = 2) {
    if (v == null || !isFinite(v)) return '–';
    return v.toLocaleString('en', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  const pct = (v, digits = 1) => (v == null || !isFinite(v) ? '–' : `${num(v * 100, digits)} %`);

  function duration(s) {
    if (s == null || !isFinite(s)) return '–';
    if (s < 90) return `${Math.round(s)} s`;
    if (s < 5400) return `${Math.round(s / 60)} min`;
    if (s < 172800) return `${num(s / 3600, 1)} h`;
    if (s < 60 * 86400) return `${num(s / 86400, 1)} days`;
    return `${num(s / (365.25 * 86400), 1)} years`;
  }
  function ago(ts) {
    const s = Math.max(0, Date.now() / 1000 - ts);
    return s < 60 ? 'just now' : `${duration(s)} ago`;
  }
  const short = (h, n = 10) => (h && h.length > 2 * n ? `${h.slice(0, n)}…${h.slice(-n)}` : h);

  // Amounts from the API are in sats * 1e-8 regardless of coin.
  let info = { symbol: 'XEC', sats_per_coin: 100, address_explorer_url_prefix: '', block_explorer_url_prefix: '' };
  const coins = (v) => (v * 1e8) / info.sats_per_coin;
  const amount = (v) => (v == null ? '–' : `${num(coins(v), 2)} ${esc(info.symbol)}`);
  // Full address on wide screens, shortened on phones (CSS toggles .a-full / .a-short).
  const addrText = (a) => `<span class="a-full">${esc(a)}</span><span class="a-short">${esc(short(a.replace(/^ecash:/, ''), 6))}</span>`;
  const addrLink = (a) =>
    info.address_explorer_url_prefix
      ? `<a class="addr" href="${esc(info.address_explorer_url_prefix + a)}" title="${esc(a)}" rel="noopener">${addrText(a)}</a>`
      : `<span class="addr" title="${esc(a)}">${addrText(a)}</span>`;

  async function get(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }

  addEventListener('themechange', () => drawChart());

  // ---------- nav highlight ----------
  const navLinks = [...document.querySelectorAll('.nav a[href^="#"]')];
  const sections = navLinks.map((a) => document.querySelector(a.getAttribute('href')));
  const onScroll = () => {
    let current = 0;
    sections.forEach((s, i) => {
      if (s && s.getBoundingClientRect().top < 120) current = i;
    });
    navLinks.forEach((a, i) => (i === current ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  };
  addEventListener('scroll', onScroll, { passive: true });

  $('c-url').textContent = `stratum+tcp://${location.hostname}:${location.port || (location.protocol === 'https:' ? 443 : 80)}`;

  // ---------- stats ----------
  let myAddress = '';
  try {
    myAddress = localStorage.getItem('p2pool-address') || '';
  } catch {}
  $('p-search').value = myAddress;

  let payouts = null;
  let lastUpdate = null;

  function setText(id, text) {
    $(id).textContent = text;
  }

  function renderAlerts(errors, warnings) {
    const out = [];
    for (const e of errors) out.push(`<div class="error-box">${esc(e)}</div>`);
    for (const w of warnings || []) out.push(`<div class="warn-box"><b>Warning:</b> ${esc(w)}</div>`);
    $('alerts').innerHTML = out.join('');
  }

  function renderStats(global, local, fee) {
    if (!global || !local) {
      const msg = 'Waiting for the share chain (needs at least 10 shares)';
      ['s-pool-sub', 's-net-sub'].forEach((id) => setText(id, msg));
      return;
    }
    setText('s-pool', hashrate(global.pool_hash_rate));
    setText('s-pool-sub', `Stale ${pct(global.pool_stale_prop)} · last hour`);
    setText('s-net', hashrate(global.network_hashrate));
    const poolShare = global.pool_hash_rate / global.network_hashrate;
    setText('s-net-sub', `Pool share ${pct(poolShare, poolShare < 0.01 ? 3 : 2)} · difficulty ${compact(global.network_block_difficulty)}`);
    const ttb = local.attempts_to_block / global.pool_hash_rate;
    setText('s-ttb', duration(ttb));
    setText('s-ttb-sub', `≈ ${num(86400 / ttb, 2)} blocks per day`);

    const miners = local.block_value_miners ?? local.block_value;
    setText('s-reward', `${num(coins(miners), 0)} ${info.symbol}`);
    const parts = (local.reserved_outputs || []).map((o) => {
      const label = o.address === 'ecash:prfhcnyqnl5cgrnmlfmms675w93ld7mvvqd0y8lz07' ? 'miner fund' : 'staking';
      return `${num(coins(o.value), 0)} ${label}`;
    });
    setText('s-reward-sub', `of ${num(coins(local.block_value), 0)} ${info.symbol}${parts.length ? ` · ${parts.join(' · ')}` : ''}`);
    if (local.block_value > 0) {
      const split = $('s-split');
      const share = miners / local.block_value;
      split.hidden = false;
      split.title = `${pct(share, 0)} to miners, ${pct(1 - share, 0)} miner fund and staking reward`;
      split.children[0].style.width = `${share * 100}%`;
      split.children[1].style.width = `${(1 - share) * 100}%`;
    }

    setText('s-sdiff', compact(global.min_difficulty));
    setText('s-sdiff-sub', `One share ≈ ${duration(local.attempts_to_share / global.pool_hash_rate)} of pool work`);

    const peers = local.peers.incoming + local.peers.outgoing;
    setText('s-node', `${peers} peer${peers === 1 ? '' : 's'}`);
    setText('s-node-sub', `${local.peers.outgoing} out · ${local.peers.incoming} in · up ${duration(local.uptime)}`);
    setText('c-fee', fee ? `${num(fee, 1)} %` : 'none');
    setText('version', local.version ? `v${local.version}` : '');
  }

  function renderPayouts() {
    const body = $('p-body');
    if (!payouts) return;
    const entries = Object.entries(payouts).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    setText('p-sub', entries.length ? `${entries.length} address${entries.length === 1 ? '' : 'es'}` : '');
    setText('p-foot', total ? `Total ${num(coins(total), 2)} ${info.symbol}` : '');
    if (!entries.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty">No shares in the PPLNS window yet.</td></tr>';
      return;
    }
    const q = $('p-search').value.trim().toLowerCase();
    const max = entries[0][1];
    const rows = [];
    entries.forEach(([addr, v], i) => {
      if (q && !addr.toLowerCase().includes(q)) return;
      const mine = q && addr.toLowerCase() === q;
      rows.push(
        `<tr${mine ? ' class="mine"' : ''}><td class="rank">${i + 1}</td><td class="l">${addrLink(addr)}</td>` +
          `<td>${pct(v / total, 2)}<span class="share-bar"><i style="width:${(v / max) * 100}%"></i></span></td>` +
          `<td class="num-strong">${amount(v)}</td></tr>`,
      );
    });
    body.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="4" class="empty">This address has no shares in the current PPLNS window.</td></tr>';
  }

  $('p-search').addEventListener('input', () => {
    try {
      localStorage.setItem('p2pool-address', $('p-search').value.trim());
    } catch {}
    renderPayouts();
  });

  function renderMiners(local) {
    const body = $('m-body');
    const rates = (local && local.miner_hash_rates) || {};
    const dead = (local && local.miner_dead_hash_rates) || {};
    const diffs = (local && local.miner_last_difficulties) || {};
    const names = Object.keys(rates).sort((a, b) => rates[b] - rates[a]);
    if (!names.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty">No miners connected to this node right now.</td></tr>';
      return;
    }
    const addrOf = (n) => n.split(/[._/+]/)[0];
    body.innerHTML = names
      .map((n) => {
        const worker = n.slice(addrOf(n).length);
        const rej = rates[n] ? (dead[n] || 0) / rates[n] : 0;
        return (
          `<tr><td class="l">${addrLink(addrOf(n))}${worker ? ` <span class="pill">${esc(worker.replace(/^[._]/, ''))}</span>` : ''}</td>` +
          `<td class="num-strong">${hashrate(rates[n])}</td><td class="${rej > 0.05 ? 'neg' : ''}">${pct(rej)}</td>` +
          `<td class="hide-sm">${diffs[addrOf(n)] != null ? compact(diffs[addrOf(n)]) : '–'}</td></tr>`
        );
      })
      .join('');
  }

  function renderBlocks(blocks) {
    const body = $('b-body');
    if (!blocks.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty">No blocks found in the current share chain yet.</td></tr>';
      return;
    }
    body.innerHTML = blocks
      .map(
        (b) =>
          `<tr><td class="l num-strong">${esc(b.number)}</td><td class="l" title="${esc(new Date(b.ts * 1000).toLocaleString())}">${ago(b.ts)}</td>` +
          `<td class="l"><a class="addr" href="${esc(info.block_explorer_url_prefix + b.hash)}" rel="noopener">${esc(short(b.hash, 12))}</a></td>` +
          `<td class="hide-sm"><a class="addr" href="share.html#${esc(b.share)}">${esc(b.share.slice(-8))}</a></td></tr>`,
      )
      .join('');
  }

  function setNodeStatus(ok, text) {
    $('node-dot').className = `dot ${ok ? 'online' : 'offline'}`;
    setText('node-status', text);
  }

  function renderUpdated() {
    if (lastUpdate) setText('updated', `Updated ${ago(lastUpdate / 1000)}`);
  }
  setInterval(renderUpdated, 10000);

  async function refresh() {
    const settled = await Promise.allSettled([
      get('/web/currency_info'),
      get('/global_stats'),
      get('/local_stats'),
      get('/current_payouts'),
      get('/recent_blocks'),
      get('/fee'),
    ]);
    const [ci, gs, ls, cp, rb, fee] = settled.map((r) => (r.status === 'fulfilled' ? r.value : undefined));
    const failed = settled.filter((r) => r.status === 'rejected');
    if (ci) info = ci;
    if (failed.length === settled.length) {
      setNodeStatus(false, 'Offline');
      renderAlerts(['Could not reach the P2Pool node API. Retrying…'], []);
      return;
    }
    setNodeStatus(true, 'Online');
    renderAlerts(failed.length ? [`Some data could not be loaded (${failed.map((r) => r.reason.message).join(', ')}).`] : [], ls && ls.warnings);
    renderStats(gs, ls, fee);
    if (cp) {
      payouts = cp;
      renderPayouts();
    }
    renderMiners(ls);
    if (rb) renderBlocks(rb);
    lastUpdate = Date.now();
    renderUpdated();
  }

  // ---------- chart ----------
  const chartState = { source: 'pool', range: 'last_day', points: [] };
  const RANGE_LABEL = { last_hour: 'last hour', last_day: 'last 24 hours', last_week: 'last 7 days', last_month: 'last 30 days' };

  function bindSeg(id, key) {
    const seg = $(id);
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      chartState[key] = b.dataset.v;
      loadChart();
    });
  }
  bindSeg('chart-source', 'source');
  bindSeg('chart-range', 'range');

  async function loadChart() {
    const stream = chartState.source === 'pool' ? 'pool_rates' : 'local_hash_rate';
    setText('chart-title', chartState.source === 'pool' ? 'Pool hashrate' : 'Hashrate of miners on this node');
    setText('chart-sub', RANGE_LABEL[chartState.range]);
    try {
      const data = await get(`/web/graph_data/${stream}/${chartState.range}`);
      // [center time, value, bin width, default]; pool_rates values are {good, orphan, doa}
      chartState.points = data
        .map(([t, v]) => [t, v == null ? null : typeof v === 'object' ? Object.values(v).reduce((s, x) => s + x, 0) : v])
        .filter(([, v]) => v != null)
        .sort((a, b) => a[0] - b[0]);
    } catch {
      chartState.points = [];
    }
    drawChart();
    $('chart-table').innerHTML = chartState.points
      .slice()
      .reverse()
      .map(([t, v]) => `<tr><td>${esc(new Date(t * 1000).toLocaleString())}</td><td>${hashrate(v)}</td></tr>`)
      .join('');
  }

  function niceStep(max, ticks) {
    const raw = max / ticks;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  function timeLabel(t, span) {
    const d = new Date(t * 1000);
    if (span <= 2 * 86400) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }

  function drawChart() {
    const el = $('chart');
    const pts = chartState.points;
    if (!pts.length) {
      el.innerHTML = '<div class="msg">No hashrate data for this range yet.</div>';
      return;
    }
    const W = el.clientWidth;
    const H = el.clientHeight;
    const m = { top: 12, right: 92, bottom: 24, left: 70 };
    const iw = Math.max(10, W - m.left - m.right);
    const ih = Math.max(10, H - m.top - m.bottom);
    const t0 = pts[0][0];
    const t1 = pts[pts.length - 1][0];
    const span = Math.max(1, t1 - t0);
    const vmax = Math.max(...pts.map((p) => p[1])) || 1;
    const step = niceStep(vmax, 4);
    const ymax = Math.ceil(vmax / step) * step;
    const x = (t) => m.left + ((t - t0) / span) * iw;
    const y = (v) => m.top + ih - (v / ymax) * ih;

    let grid = '';
    for (let v = 0; v <= ymax + step / 2; v += step) {
      grid += `<line class="${v === 0 ? 'baseline' : 'gridline'}" x1="${m.left}" x2="${m.left + iw}" y1="${y(v)}" y2="${y(v)}"/>`;
      grid += `<text x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end">${hashrate(v)}</text>`;
    }
    const xticks = Math.max(2, Math.min(6, Math.floor(iw / 110)));
    for (let i = 0; i <= xticks; i++) {
      const t = t0 + (span * i) / xticks;
      grid += `<text x="${x(t)}" y="${m.top + ih + 17}" text-anchor="${i === 0 ? 'start' : i === xticks ? 'end' : 'middle'}">${esc(timeLabel(t, span))}</text>`;
    }

    const path = pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const area = `${path}L${x(t1).toFixed(1)},${y(0)}L${x(t0).toFixed(1)},${y(0)}Z`;
    const [lt, lv] = pts[pts.length - 1];

    el.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="axis">${grid}</g>` +
      `<path class="area" d="${area}"/><path class="line" d="${path}"/>` +
      `<circle class="end-dot" cx="${x(lt)}" cy="${y(lv)}" r="4"/>` +
      `<text class="end-label" x="${x(lt) + 10}" y="${y(lv) + 4}">${hashrate(lv)}</text>` +
      `<g class="hover" visibility="hidden"><line class="crosshair" y1="${m.top}" y2="${m.top + ih}"/><circle class="hover-dot" r="4"/></g>` +
      `<rect x="${m.left}" y="${m.top}" width="${iw}" height="${ih}" fill="transparent" class="hit"/></svg>` +
      '<div class="tooltip" hidden></div>';

    const svg = el.querySelector('svg');
    const hover = svg.querySelector('.hover');
    const tip = el.querySelector('.tooltip');
    const hit = svg.querySelector('.hit');
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const t = t0 + ((e.clientX - r.left - m.left) / iw) * span;
      let best = pts[0];
      for (const p of pts) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
      const px = x(best[0]);
      const py = y(best[1]);
      hover.setAttribute('visibility', 'visible');
      hover.querySelector('line').setAttribute('x1', px);
      hover.querySelector('line').setAttribute('x2', px);
      hover.querySelector('circle').setAttribute('cx', px);
      hover.querySelector('circle').setAttribute('cy', py);
      tip.hidden = false;
      tip.style.left = `${Math.min(Math.max(px, 70), W - 70)}px`;
      tip.style.top = `${py}px`;
      tip.innerHTML = `<div class="t">${esc(new Date(best[0] * 1000).toLocaleString())}</div><div class="v"><span class="key"></span>${hashrate(best[1])}</div>`;
    });
    hit.addEventListener('pointerleave', () => {
      hover.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    });
  }

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawChart, 150);
  });

  refresh();
  loadChart();
  setInterval(refresh, REFRESH_MS);
  setInterval(loadChart, 5 * REFRESH_MS);
})();
