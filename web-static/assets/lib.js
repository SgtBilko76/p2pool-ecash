// Helpers shared by the dashboard pages: number formatting and the hashrate chart.
'use strict';

const P2P = (() => {
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

  /** Draw an area chart of [[unix time, hashrate], ...] into `el` (a .chart element). */
  function drawHashrateChart(el, pts) {
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


  return { esc, hashrate, compact, num, pct, duration, ago, short, drawHashrateChart };
})();
