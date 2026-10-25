'use strict';

/* Bhimlekha charts: small single-series SVG line charts, no library.
   One series per chart (one axis, never two), 2px line, 8px markers, recessive grid, colours from CSS variables
   so dark mode follows the theme. Tap or drag on a chart to read a value: the tooltip is wired by Charts.bind(). */

const Charts = (() => {
  const W = 340;
  const H = 170;
  const PAD = { l: 40, r: 12, t: 12, b: 26 };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function esc(t) {
    return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function shortDate(iso) {
    const [, m, d] = String(iso).split('-').map(Number);
    return m ? `${d} ${MONTHS[m - 1]}` : iso;
  }

  function niceStep(range) {
    const raw = range / 4;
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }

  function fmt(v, digits) {
    const r = Math.round(v * 10 ** digits) / 10 ** digits;
    return Number.isInteger(r) ? r.toLocaleString('en-IN') : r.toFixed(digits);
  }

  /**
   * points: [{ date: 'YYYY-MM-DD', y: number, label?: string }] oldest first.
   * opts: { title, unit, digits, id }
   */
  function line(points, opts = {}) {
    const unit = opts.unit || '';
    const digits = opts.digits ?? 1;
    if (!points.length) return `<p class="empty">No data yet.</p>`;
    const t = points.map((p) => Date.parse(p.date));
    const t0 = Math.min(...t);
    const t1 = Math.max(...t);
    let lo = Math.min(...points.map((p) => p.y));
    let hi = Math.max(...points.map((p) => p.y));
    if (hi === lo) {
      hi += Math.max(1, Math.abs(hi) * 0.05);
      lo -= Math.max(1, Math.abs(lo) * 0.05);
    }
    const step = niceStep(hi - lo);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const x = (ms) => PAD.l + (t1 === t0 ? (W - PAD.l - PAD.r) / 2 : ((ms - t0) / (t1 - t0)) * (W - PAD.l - PAD.r));
    const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

    const grid = [];
    for (let v = lo; v <= hi + step / 2; v += step) {
      grid.push(`<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" />`);
      grid.push(`<text class="axis" x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v, step < 1 ? 1 : 0))}</text>`);
    }
    // At most 4 date labels: first, last, and evenly between.
    const ticks = points.length <= 4 ? points : [0, 1, 2, 3].map((i) => points[Math.round((i * (points.length - 1)) / 3)]);
    const dates = [...new Set(ticks)].map(
      (p, i, arr) =>
        `<text class="axis" x="${x(Date.parse(p.date))}" y="${H - 6}" text-anchor="${arr.length > 1 && i === 0 ? 'start' : i === arr.length - 1 && arr.length > 1 ? 'end' : 'middle'}">${esc(shortDate(p.date))}</text>`,
    );
    const xy = points.map((p) => [x(Date.parse(p.date)), y(p.y)]);
    const path = xy.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
    const last = xy[xy.length - 1];
    const lastLabel = `${fmt(points[points.length - 1].y, digits)}${unit ? ' ' + unit : ''}`;
    const data = esc(
      JSON.stringify(points.map((p, i) => ({ x: xy[i][0], y: xy[i][1], t: `${shortDate(p.date)} · ${fmt(p.y, digits)}${unit ? ' ' + unit : ''}${p.label ? ' · ' + p.label : ''}` }))),
    );
    return `
      <figure class="chart" data-chart='${data}'>
        ${opts.title ? `<figcaption class="chart-title">${esc(opts.title)}</figcaption>` : ''}
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${opts.title || 'Chart'}: ${points.length} points, latest ${lastLabel}`)}">
          ${grid.join('')}
          ${xy.length > 1 ? `<path class="area" d="${path} L${xy[xy.length - 1][0].toFixed(1)},${H - PAD.b} L${xy[0][0].toFixed(1)},${H - PAD.b} Z" />` : ''}
          <path class="series" d="${path}" />
          ${xy.map(([a, b]) => `<circle class="dot" cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="4" />`).join('')}
          <text class="direct" x="${Math.min(last[0], W - PAD.r)}" y="${last[1] - PAD.t < 22 ? last[1] + 20 : last[1] - 10}" text-anchor="end">${esc(lastLabel)}</text>
          ${dates.join('')}
          <line class="cross" x1="0" x2="0" y1="${PAD.t}" y2="${H - PAD.b}" visibility="hidden" />
          <circle class="hover" r="6" visibility="hidden" />
        </svg>
        <div class="chart-tip" hidden></div>
      </figure>`;
  }

  /** Tap / drag anywhere on a chart: snap to the nearest point, show a crosshair and the value. */
  function bind(root) {
    const move = (e) => {
      const fig = e.target.closest?.('.chart');
      if (!fig) return;
      const svg = fig.querySelector('svg');
      const pts = JSON.parse(fig.dataset.chart || '[]');
      if (!pts.length) return;
      const box = svg.getBoundingClientRect();
      const sx = ((e.clientX - box.left) / box.width) * W;
      let best = pts[0];
      for (const p of pts) if (Math.abs(p.x - sx) < Math.abs(best.x - sx)) best = p;
      const cross = svg.querySelector('.cross');
      const dot = svg.querySelector('.hover');
      cross.setAttribute('x1', best.x);
      cross.setAttribute('x2', best.x);
      cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', best.x);
      dot.setAttribute('cy', best.y);
      dot.setAttribute('visibility', 'visible');
      const tip = fig.querySelector('.chart-tip');
      tip.textContent = best.t;
      tip.hidden = false;
      const left = (best.x / W) * box.width;
      tip.style.left = `${Math.min(Math.max(left, 70), box.width - 70)}px`;
    };
    root.addEventListener('pointerdown', move);
    root.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' || e.buttons) move(e);
    });
  }

  return { line, bind };
})();

if (typeof module !== 'undefined') module.exports = Charts;
