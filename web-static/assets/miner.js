// Miner status page: miner.html#<address>. Reads the node's JSON API on the same origin.
'use strict';

(() => {
  const REFRESH_MS = 30000;
  const { esc, hashrate, compact, num, pct, duration, ago } = P2P;
  const $ = (id) => document.getElementById(id);
  const setText = (id, text) => ($(id).textContent = text);

  let info = { symbol: 'XEC', sats_per_coin: 100, address_explorer_url_prefix: '' };
  const coins = (v) => (v * 1e8) / info.sats_per_coin;
  const xec = (c) => `${num(c, Math.abs(c) >= 1000 ? 0 : 2)} ${info.symbol}`;

  // Stratum usernames are "<address>[.|_|/|+]<worker>"; addresses may be given with or without "ecash:".
  const addrOf = (name) => name.split(/[._/+]/)[0];
  const norm = (a) => String(a).trim().toLowerCase().replace(/^ecash:/, '');
  const VALID = /^[a-z0-9:]{20,80}$/i;

  let address = '';
  let range = 'last_day';
  let lastUpdate = null;

  async function get(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }

  /* ---------- address from the URL ---------- */

  function readAddress() {
    let a = '';
    try {
      a = decodeURIComponent(location.hash.slice(1));
    } catch {}
    if (!a) {
      try {
        a = localStorage.getItem('p2pool-address') || '';
      } catch {}
    }
    return a.trim();
  }

  function showAddress() {
    $('addr-input').value = address;
    const valid = VALID.test(address);
    $('addr-line').hidden = !valid;
    $('content').hidden = !valid;
    if (address && !valid) renderAlerts(['This does not look like an eCash address.']);
    if (!valid) return false;
    setText('addr', address);
    document.title = `Miner ${address.replace(/^ecash:/, '').slice(0, 8)}… – eCash (XEC) P2Pool`;
    try {
      localStorage.setItem('p2pool-address', address);
    } catch {}
    return true;
  }

  $('find').addEventListener('submit', (e) => {
    e.preventDefault();
    const a = $('addr-input').value.trim();
    if (a) location.hash = encodeURIComponent(a);
  });

  addEventListener('hashchange', () => {
    address = readAddress();
    renderAlerts([]);
    if (showAddress()) {
      refresh();
      loadChart();
    }
  });

  /* ---------- rendering ---------- */

  function renderAlerts(errors, notes = []) {
    $('alerts').innerHTML =
      errors.map((e) => `<div class="error-box">${esc(e)}</div>`).join('') + notes.map((n) => `<div class="warn-box">${esc(n)}</div>`).join('');
  }

  function setNodeStatus(ok, text) {
    $('node-dot').className = `dot ${ok ? 'online' : 'offline'}`;
    setText('node-status', text);
  }

  function renderUpdated() {
    if (lastUpdate) setText('updated', `Updated ${ago(lastUpdate / 1000)}`);
  }
  setInterval(renderUpdated, 10000);

  function render(global, local, payouts) {
    const me = norm(address);
    const rates = (local && local.miner_hash_rates) || {};
    const dead = (local && local.miner_dead_hash_rates) || {};
    const diffs = (local && local.miner_last_difficulties) || {};

    // Workers of this address connected to this node
    const workers = Object.keys(rates)
      .filter((n) => norm(addrOf(n)) === me)
      .map((n) => ({ name: n.slice(addrOf(n).length).replace(/^[._/+]/, '') || 'default', rate: rates[n], dead: dead[n] || 0 }))
      .sort((a, b) => b.rate - a.rate);
    const rate = workers.reduce((s, w) => s + w.rate, 0);
    const deadRate = workers.reduce((s, w) => s + w.dead, 0);

    setText('s-rate', workers.length ? hashrate(rate) : 'Not connected');
    setText('s-rate-sub', workers.length ? `${workers.length} worker${workers.length === 1 ? '' : 's'} · last 10 minutes` : 'to this node right now');
    setText('s-rej', workers.length ? pct(rate ? deadRate / rate : 0) : '–');
    $('s-rej').className = `val${rate && deadRate / rate > 0.05 ? ' neg' : ''}`;

    const diffKey = Object.keys(diffs).find((k) => norm(k) === me);
    setText('s-diff', diffKey ? compact(diffs[diffKey]) : '–');

    $('w-body').innerHTML = workers.length
      ? workers
          .map(
            (w) =>
              `<tr><td class="l"><span class="pill">${esc(w.name)}</span></td><td class="num-strong">${hashrate(w.rate)}</td>` +
              `<td class="${w.rate && w.dead / w.rate > 0.05 ? 'neg' : ''}">${pct(w.rate ? w.dead / w.rate : 0)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="3" class="empty">No workers of this address are connected to this node right now.</td></tr>';

    // Payout share in the current PPLNS window
    const entries = Object.entries(payouts || {});
    const total = entries.reduce((s, [, v]) => s + v, 0);
    const mine = entries.find(([a]) => norm(a) === me);
    const value = mine ? mine[1] : 0;
    const rank = mine ? entries.filter(([, v]) => v > value).length + 1 : null;
    setText('s-share', total ? pct(value / total, 2) : '–');
    setText('s-share-sub', rank ? `rank ${rank} of ${entries.length} addresses` : 'no shares in the window yet');
    setText('s-payout', xec(coins(value)));
    const blockValue = local && (local.block_value_miners ?? local.block_value);
    setText('s-payout-sub', blockValue ? `of ${num(coins(blockValue), 0)} ${info.symbol} to miners` : ' ');

    if (global && local && global.pool_hash_rate && local.attempts_to_block) {
      const secondsPerBlock = local.attempts_to_block / global.pool_hash_rate;
      const blocksPerDay = 86400 / secondsPerBlock;
      setText('s-day', `≈ ${xec(coins(value) * blocksPerDay)}`);
      setText('s-day-sub', blocksPerDay >= 1 ? `pool finds ≈ ${num(blocksPerDay, 1)} blocks per day` : `pool finds a block about every ${duration(secondsPerBlock)}`);
    }

    const explorer = $('explorer');
    if (info.address_explorer_url_prefix) {
      explorer.href = info.address_explorer_url_prefix + (mine ? mine[0] : address);
      explorer.hidden = false;
    }

    renderAlerts(
      [],
      !workers.length && !mine ? ['This address is not connected to this node and has no shares in the current PPLNS window. Check the address, or start mining with it as your stratum username.'] : [],
    );
    setText('version', local && local.version ? `v${local.version}` : '');
  }

  async function refresh() {
    if (!VALID.test(address)) return;
    const settled = await Promise.allSettled([get('/web/currency_info'), get('/global_stats'), get('/local_stats'), get('/current_payouts')]);
    const [ci, gs, ls, cp] = settled.map((r) => (r.status === 'fulfilled' ? r.value : undefined));
    if (settled.every((r) => r.status === 'rejected')) {
      setNodeStatus(false, 'Offline');
      renderAlerts(['Could not reach the P2Pool node API. Retrying…']);
      return;
    }
    if (ci) info = ci;
    setNodeStatus(true, 'Online');
    render(gs, ls, cp);
    lastUpdate = Date.now();
    renderUpdated();
  }

  /* ---------- chart ---------- */

  const RANGE_LABEL = { last_hour: 'last hour', last_day: 'last 24 hours', last_week: 'last 7 days', last_month: 'last 30 days' };
  let points = [];

  $('chart-range').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $('chart-range').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    range = b.dataset.v;
    loadChart();
  });

  function drawChart() {
    const el = $('chart');
    if (!points.some(([, v]) => v > 0)) {
      el.innerHTML = '<div class="msg">No hashrate recorded for this miner in this range.</div>';
      return;
    }
    P2P.drawHashrateChart(el, points);
  }

  async function loadChart() {
    if (!VALID.test(address)) return;
    setText('chart-sub', RANGE_LABEL[range]);
    const me = norm(address);
    try {
      // [center time, {username: hashrate}, bin width, default]
      const data = await get(`/web/graph_data/miner_hash_rates/${range}`);
      points = data
        .map(([t, v]) => [t, Object.entries(v || {}).reduce((s, [n, r]) => (norm(addrOf(n)) === me ? s + r : s), 0)])
        .sort((a, b) => a[0] - b[0]);
    } catch {
      points = [];
    }
    drawChart();
  }

  addEventListener('themechange', drawChart);
  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawChart, 150);
  });

  address = readAddress();
  if (showAddress()) {
    if (!location.hash) history.replaceState(null, '', `#${encodeURIComponent(address)}`);
    refresh();
    loadChart();
  } else {
    $('addr-input').focus();
  }
  setInterval(refresh, REFRESH_MS);
  setInterval(loadChart, 5 * REFRESH_MS);
})();
