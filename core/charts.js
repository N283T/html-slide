/* Built-in charts: zero-dependency SVG rendering for the three shapes
 * a talk actually needs — bar, line, donut. Declared inline:
 *
 *   <div data-chart='{"type":"bar","labels":["A","B"],
 *                     "series":[{"name":"x","data":[1,2]}]}'></div>
 *
 * or, for larger data, a JSON <script> child:
 *
 *   <div data-chart><script type="application/json">{...}</script></div>
 *
 * Colors come from the active theme (accent, accent-2, then a derived
 * ramp), so charts restyle themselves when the theme changes.
 * Options: labels, series[{name,data}], unit, max, legend (bool),
 * value-labels via "values": true (bar only, default on). */
(function () {
  'use strict';

  const W = 900;
  const H = 480;
  const PAD = { top: 30, right: 24, bottom: 56, left: 24 };
  const FONT = 'var(--hs-font-mono, monospace)';

  function themeColors(el) {
    const cs = getComputedStyle(el);
    const get = function (name, fallback) {
      return (cs.getPropertyValue(name) || '').trim() || fallback;
    };
    return {
      accent: get('--hs-accent', '#0e63d6'),
      accent2: get('--hs-accent-2', '#d6336c'),
      muted: get('--hs-muted', '#888'),
      border: get('--hs-border', '#ccc'),
      fg: get('--hs-fg', '#222')
    };
  }

  function palette(c, n) {
    const base = [c.accent, c.accent2, c.muted, c.fg];
    const out = [];
    for (let i = 0; i < n; i++) out.push(base[i % base.length]);
    return out;
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function text(svg, x, y, str, size, fill, anchor, weight) {
    const t = svgEl('text', {
      x: x, y: y, 'font-size': size, fill: fill,
      'text-anchor': anchor || 'start', 'font-family': FONT
    });
    if (weight) t.setAttribute('font-weight', weight);
    t.textContent = str;
    svg.appendChild(t);
    return t;
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
      if (v <= m * mag) return m * mag;
    }
    return 10 * mag;
  }

  function grid(svg, c, top, bottom, left, right, max, unit) {
    for (let i = 0; i <= 4; i++) {
      const y = bottom - (bottom - top) * (i / 4);
      svg.appendChild(svgEl('line', {
        x1: left, y1: y, x2: right, y2: y,
        stroke: c.border, 'stroke-width': i === 0 ? 2 : 1,
        'stroke-dasharray': i === 0 ? 'none' : '3 6'
      }));
      if (i > 0) {
        const v = max * (i / 4);
        text(svg, left, y - 8, formatNum(v) + (unit || ''), 18, c.muted);
      }
    }
  }

  function formatNum(v) {
    if (Math.abs(v) >= 1000) return (v / 1000) + 'k';
    return Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 1 : 0);
  }

  function legend(svg, c, series, colors) {
    let x = PAD.left + 4;
    const y = 20;
    series.forEach(function (s, i) {
      svg.appendChild(svgEl('rect', {
        x: x, y: y - 12, width: 16, height: 16, rx: 4, fill: colors[i]
      }));
      const t = text(svg, x + 24, y + 2, s.name, 20, c.fg);
      x += 24 + (s.name.length * 12) + 32;
      void t;
    });
  }

  /* ---- bar ---- */

  function renderBar(svg, cfg, c) {
    const series = cfg.series;
    const colors = palette(c, series.length);
    const max = cfg.max || niceMax(Math.max.apply(null,
      series.flatMap(function (s) { return s.data; })));
    const left = PAD.left + 20;
    const right = W - PAD.right;
    const top = PAD.top + (series.length > 1 || cfg.legend ? 26 : 0);
    const bottom = H - PAD.bottom;
    grid(svg, c, top, bottom, left, right, max, cfg.unit);

    const n = cfg.labels.length;
    const groupW = (right - left) / n;
    const barW = Math.min(90, (groupW * 0.62) / series.length);

    cfg.labels.forEach(function (label, i) {
      const cx = left + groupW * (i + 0.5);
      series.forEach(function (s, k) {
        const v = s.data[i] || 0;
        const h = (bottom - top) * (v / max);
        const x = cx - (barW * series.length) / 2 + k * barW;
        svg.appendChild(svgEl('rect', {
          x: x + 2, y: bottom - h, width: barW - 4, height: Math.max(h, 2),
          rx: 8, fill: colors[k], opacity: cfg.highlight != null && cfg.highlight !== i ? 0.38 : 1
        }));
        if (cfg.values !== false && series.length === 1) {
          text(svg, cx, bottom - h - 12, formatNum(v) + (cfg.unit || ''),
            22, c.fg, 'middle', 700);
        }
      });
      text(svg, cx, bottom + 34, label, 21, c.muted, 'middle');
    });
    if (series.length > 1 || cfg.legend) legend(svg, c, series, colors);
  }

  /* ---- line ---- */

  function renderLine(svg, cfg, c) {
    const series = cfg.series;
    const colors = palette(c, series.length);
    const max = cfg.max || niceMax(Math.max.apply(null,
      series.flatMap(function (s) { return s.data; })));
    const left = PAD.left + 20;
    const right = W - PAD.right - 10;
    const top = PAD.top + (series.length > 1 || cfg.legend ? 26 : 0);
    const bottom = H - PAD.bottom;
    grid(svg, c, top, bottom, left, right, max, cfg.unit);

    const n = cfg.labels.length;
    const xAt = function (i) { return left + (right - left) * (n === 1 ? 0.5 : i / (n - 1)); };
    const yAt = function (v) { return bottom - (bottom - top) * (v / max); };

    series.forEach(function (s, k) {
      const pts = s.data.map(function (v, i) { return xAt(i) + ',' + yAt(v); });
      svg.appendChild(svgEl('polyline', {
        points: pts.join(' '), fill: 'none', stroke: colors[k],
        'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'stroke-dasharray': s.dashed ? '2 12' : 'none'
      }));
      s.data.forEach(function (v, i) {
        svg.appendChild(svgEl('circle', {
          cx: xAt(i), cy: yAt(v), r: 7, fill: colors[k]
        }));
      });
    });
    cfg.labels.forEach(function (label, i) {
      text(svg, xAt(i), bottom + 34, label, 21, c.muted, 'middle');
    });
    if (series.length > 1 || cfg.legend) legend(svg, c, series, colors);
  }

  /* ---- donut ---- */

  function renderDonut(svg, cfg, c) {
    const data = cfg.series[0].data;
    const colors = palette(c, data.length);
    const total = data.reduce(function (a, b) { return a + b; }, 0) || 1;
    const cx = W * 0.34;
    const cy = H / 2;
    const R = 170;
    const r = 108;
    let angle = -Math.PI / 2;

    data.forEach(function (v, i) {
      const frac = v / total;
      const a2 = angle + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      /* leave a hairline gap between segments */
      const g = 0.02;
      const p = function (rad, a) { return (cx + rad * Math.cos(a)) + ' ' + (cy + rad * Math.sin(a)); };
      const d = 'M ' + p(R, angle + g) +
        ' A ' + R + ' ' + R + ' 0 ' + large + ' 1 ' + p(R, a2 - g) +
        ' L ' + p(r, a2 - g) +
        ' A ' + r + ' ' + r + ' 0 ' + large + ' 0 ' + p(r, angle + g) + ' Z';
      svg.appendChild(svgEl('path', { d: d, fill: colors[i] }));
      angle = a2;
    });

    if (cfg.center) {
      text(svg, cx, cy - 2, cfg.center, 52, c.fg, 'middle', 800);
      if (cfg.centerLabel) text(svg, cx, cy + 40, cfg.centerLabel, 20, c.muted, 'middle');
    }

    let y = cy - (cfg.labels.length * 46) / 2 + 20;
    cfg.labels.forEach(function (label, i) {
      const x = W * 0.62;
      svg.appendChild(svgEl('rect', { x: x, y: y - 20, width: 22, height: 22, rx: 6, fill: colors[i] }));
      text(svg, x + 36, y - 2, label, 24, c.fg);
      text(svg, W - PAD.right, y - 2,
        formatNum(data[i]) + (cfg.unit || '') + ' · ' + Math.round(data[i] / total * 100) + '%',
        22, c.muted, 'end');
      y += 46;
    });
  }

  /* ---- mount ---- */

  const RENDERERS = { bar: renderBar, line: renderLine, donut: renderDonut };

  function mount(el) {
    let cfg;
    try {
      const inline = el.getAttribute('data-chart');
      const child = el.querySelector('script[type="application/json"]');
      cfg = JSON.parse(child ? child.textContent : inline);
    } catch (err) {
      el.textContent = 'chart config error: ' + err.message;
      return;
    }
    const render = RENDERERS[cfg.type];
    if (!render) {
      el.textContent = 'unknown chart type: ' + cfg.type;
      return;
    }
    el.querySelectorAll('svg').forEach(function (s) { s.remove(); });
    const svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      style: 'width: 100%; height: auto; display: block;'
    });
    render(svg, cfg, themeColors(el));
    el.appendChild(svg);
  }

  function mountAll() {
    document.querySelectorAll('[data-chart]').forEach(mount);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }

  window.HSCharts = { mountAll: mountAll, mount: mount };
})();
