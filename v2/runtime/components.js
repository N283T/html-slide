/* html-slide runtime components: <hs-chart>, <hs-count> and code
 * highlighting.
 *
 * None of them writes into a slide's own DOM. Charts and counters draw
 * in a shadow root from the readable HTML they wrap, and highlighting
 * uses the CSS Custom Highlight API — so saving a slide never captures
 * rendered output or a half-finished animation. */
(function () {
  'use strict';

  const HS = window.HS;
  if (!HS || !window.customElements) return;

  const NS = 'http://www.w3.org/2000/svg';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function svg(tag, attrs, parent, text) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    if (text != null) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  }

  function niceTicks(min, max, target) {
    if (min === max) max = min + 1;
    const raw = (max - min) / (target || 5);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
    return { lo: lo, hi: hi, ticks: ticks };
  }

  function fmt(v) {
    if (v == null) return '';
    if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
    return String(Number(v.toFixed(2)));
  }

  /* Rough text width: full-width glyphs count 1em, the rest ~0.58em. */
  function textWidth(str, size) {
    let w = 0;
    for (const ch of String(str)) w += ch.charCodeAt(0) > 0x2e7f ? 1 : 0.58;
    return w * size;
  }

  const CHART_CSS =
    ':host{display:block}' +
    'svg{display:block;width:100%;height:100%;overflow:visible;font-family:var(--font-sans)}' +
    'text{fill:var(--muted);font-size:21px;letter-spacing:.01em}' +
    '.val{fill:var(--heading);font-weight:600;font-size:22px}' +
    '.cat{fill:var(--fg)}' +
    '.name{font-weight:600;font-size:22px}' +
    '.big{fill:var(--heading);font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:-.02em}' +
    '.grid{stroke:var(--line);stroke-width:1.5}' +
    '.axis{stroke:var(--heading);stroke-width:2}' +
    '.dim{opacity:.26}' +
    '.bar{transform-box:fill-box;transform-origin:50% 100%}' +
    '.hbar{transform-box:fill-box;transform-origin:0 50%}' +
    '.line{fill:none;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}' +
    '.play .bar{animation:grow .9s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0)*50ms)}' +
    '.play .hbar{animation:growx .9s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0)*60ms)}' +
    '.play .line{animation:draw 1.3s cubic-bezier(.5,0,.2,1) backwards}' +
    '.play .fade{animation:fade .5s ease both;animation-delay:calc(var(--i,0)*50ms + .35s)}' +
    '.play .arc{animation:fade .6s ease both;animation-delay:calc(var(--i,0)*110ms)}' +
    '@keyframes grow{from{transform:scaleY(0)}}' +
    '@keyframes growx{from{transform:scaleX(0)}}' +
    '@keyframes draw{from{stroke-dasharray:0 1.2}to{stroke-dasharray:1.2 0}}' +
    '@keyframes fade{from{opacity:0}}';

  const color = function (i) { return 'var(--c' + (i % 6 + 1) + ')'; };

  /* ================= <hs-chart> =================
   * <hs-chart type="bar" unit="%">
   *   <table>
   *     <tr><th></th><th>Q1</th><th>Q2</th></tr>
   *     <tr><th>ours</th><td>61</td><td>68</td></tr>
   *   </table>
   * </hs-chart>
   * type: bar | hbar | line | area | donut | scatter
   * A two-column table is one series of (label, value) rows. */
  class HSChart extends HTMLElement {
    static get observedAttributes() {
      return ['type', 'unit', 'max', 'min', 'stacked', 'highlight', 'values', 'center', 'trend', 'labels'];
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._frame = 0;
      this._wantPlay = false;
      this._resize = new ResizeObserver(() => this.schedule());
      this._mutate = new MutationObserver(() => this.schedule());
    }

    connectedCallback() {
      this._resize.observe(this);
      this._mutate.observe(this, { subtree: true, childList: true, characterData: true });
      this.schedule();
    }

    disconnectedCallback() {
      this._resize.disconnect();
      this._mutate.disconnect();
      cancelAnimationFrame(this._frame);
      this._frame = 0;
    }

    attributeChangedCallback() { this.schedule(); }

    schedule() {
      if (this._frame) return;
      this._frame = requestAnimationFrame(() => {
        this._frame = 0;
        this.render();
      });
    }

    play() {
      const el = this.shadowRoot.querySelector('svg');
      if (!el) { this._wantPlay = true; return; }
      el.classList.remove('play');
      void el.getBoundingClientRect();
      el.classList.add('play');
    }

    table() {
      const table = this.querySelector('table');
      if (!table) return null;
      const rows = Array.prototype.map.call(table.rows, function (r) {
        return Array.prototype.map.call(r.cells, function (c) { return c.textContent.trim(); });
      }).filter(function (r) { return r.length; });
      return rows.length ? rows : null;
    }

    static num(s) {
      const v = parseFloat(String(s).replace(/[,\s%]/g, ''));
      return isNaN(v) ? null : v;
    }

    data(rows) {
      const num = HSChart.num;
      const width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
      if (width <= 2) {
        const hasHead = num(rows[0][1]) == null;
        const body = hasHead ? rows.slice(1) : rows;
        return {
          cats: body.map(function (r) { return r[0]; }),
          series: [{ name: hasHead ? rows[0][1] || '' : '', data: body.map(function (r) { return num(r[1]); }) }]
        };
      }
      const cats = rows[0].slice(1);
      return {
        cats: cats,
        series: rows.slice(1).map(function (r) {
          return { name: r[0], data: cats.map(function (_, i) { return num(r[i + 1]); }) };
        })
      };
    }

    render() {
      const w = this.clientWidth;
      const h = this.clientHeight;
      if (w < 60 || h < 60) return;
      const rows = this.table();
      const style = document.createElement('style');
      style.textContent = CHART_CSS;
      const root = svg('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img' });
      if (rows) {
        const type = this.getAttribute('type') || 'bar';
        const opt = {
          unit: this.getAttribute('unit') || '',
          max: HSChart.num(this.getAttribute('max')),
          min: HSChart.num(this.getAttribute('min')),
          stacked: this.hasAttribute('stacked'),
          highlight: this.getAttribute('highlight'),
          values: this.getAttribute('values'),
          center: this.getAttribute('center'),
          trend: this.hasAttribute('trend'),
          labels: this.getAttribute('labels')
        };
        try {
          if (type === 'scatter') this.scatter(root, rows, w, h, opt);
          else if (type === 'donut') this.donut(root, this.data(rows), w, h, opt);
          else if (type === 'hbar') this.hbar(root, this.data(rows), w, h, opt);
          else if (type === 'line' || type === 'area') this.line(root, this.data(rows), w, h, opt, type === 'area');
          else this.bar(root, this.data(rows), w, h, opt);
        } catch (err) {
          svg('text', { x: 0, y: 30 }, root, 'chart error: ' + err.message);
        }
      }
      this.shadowRoot.replaceChildren(style, root);
      if (this._wantPlay) {
        this._wantPlay = false;
        this.play();
      }
    }

    legend(root, series, x, y) {
      let cx = x;
      series.forEach(function (s, i) {
        svg('rect', { x: cx, y: y - 15, width: 18, height: 18, rx: 4, style: 'fill:' + color(i) }, root);
        svg('text', { x: cx + 28, y: y, class: 'cat' }, root, s.name);
        cx += 28 + textWidth(s.name, 21) + 36;
      });
    }

    /* Shared y axis + horizontal gridlines. Returns the plot box. */
    frame(root, values, w, h, opt, extra) {
      extra = extra || {};
      const lo0 = opt.min != null ? opt.min : Math.min(0, Math.min.apply(null, values));
      const hi0 = opt.max != null ? opt.max : Math.max.apply(null, values);
      const t = niceTicks(lo0, hi0, h > 420 ? 5 : 4);
      if (opt.max != null) t.hi = opt.max;
      if (opt.min != null) t.lo = opt.min;
      const labels = t.ticks.filter(function (v) { return v >= t.lo && v <= t.hi; });
      const left = Math.max.apply(null, labels.map(function (v) { return textWidth(fmt(v) + opt.unit, 21); })) + 22;
      const box = {
        l: left,
        r: w - (extra.right || 12),
        t: extra.top || 30,
        b: h - 54,
        lo: t.lo,
        hi: t.hi
      };
      box.y = function (v) { return box.t + (box.hi - v) / (box.hi - box.lo) * (box.b - box.t); };
      labels.forEach(function (v) {
        const y = box.y(v);
        svg('line', { x1: box.l, x2: box.r, y1: y, y2: y, class: v === 0 ? 'axis' : 'grid' }, root);
        svg('text', { x: box.l - 14, y: y + 7, 'text-anchor': 'end' }, root, fmt(v) + opt.unit);
      });
      return box;
    }

    bar(root, d, w, h, opt) {
      const multi = d.series.length > 1;
      const totals = d.cats.map(function (_, i) {
        return d.series.reduce(function (sum, s) { return sum + (s.data[i] || 0); }, 0);
      });
      const all = opt.stacked ? totals : [].concat.apply([], d.series.map(function (s) { return s.data; }));
      const box = this.frame(root, all.filter(function (v) { return v != null; }), w, h, opt, { top: multi ? 64 : 34 });
      if (multi) this.legend(root, d.series, box.l, 24);
      const band = (box.r - box.l) / d.cats.length;
      const groupW = Math.min(band * 0.7, opt.stacked || !multi ? 150 : 150 * d.series.length);
      const barW = opt.stacked ? groupW : groupW / d.series.length;
      const showValues = opt.values !== 'off' && d.cats.length * (opt.stacked ? 1 : d.series.length) <= 16;
      const y0 = box.y(Math.max(box.lo, 0));
      d.cats.forEach(function (cat, ci) {
        const gx = box.l + band * ci + (band - groupW) / 2;
        let stackTop = 0;
        d.series.forEach(function (s, si) {
          const v = s.data[ci];
          if (v == null) return;
          const x = opt.stacked ? gx : gx + barW * si;
          const yTop = opt.stacked ? box.y(stackTop + v) : box.y(v);
          const yBase = opt.stacked ? box.y(stackTop) : y0;
          stackTop += v;
          const top = Math.min(yTop, yBase);
          const height = Math.max(1, Math.abs(yBase - yTop));
          const r = opt.stacked && si < d.series.length - 1 ? 0 : Math.min(8, barW / 4, height);
          const dim = opt.highlight && opt.highlight !== cat && opt.highlight !== s.name;
          const inner = opt.stacked ? barW : barW - (multi ? 6 : 0);
          svg('path', {
            d: 'M' + x + ',' + (top + height) + 'V' + (top + r) + 'q0,' + -r + ' ' + r + ',' + -r +
               'h' + (inner - 2 * r) + 'q' + r + ',0 ' + r + ',' + r + 'V' + (top + height) + 'z',
            class: 'bar' + (dim ? ' dim' : ''),
            style: 'fill:' + color(si) + ';--i:' + (ci + si * 0.4)
          }, root);
          if (showValues && !opt.stacked) {
            svg('text', {
              x: x + inner / 2, y: top - 12, 'text-anchor': 'middle',
              class: 'val fade' + (dim ? ' dim' : ''), style: '--i:' + (ci + 4)
            }, root, fmt(v) + opt.unit);
          }
        });
        if (showValues && opt.stacked) {
          svg('text', {
            x: gx + groupW / 2, y: box.y(totals[ci]) - 12, 'text-anchor': 'middle',
            class: 'val fade', style: '--i:' + (ci + 4)
          }, root, fmt(totals[ci]) + opt.unit);
        }
        svg('text', {
          x: box.l + band * ci + band / 2, y: box.b + 38, 'text-anchor': 'middle',
          class: 'cat' + (opt.highlight && opt.highlight !== cat && !multi ? ' dim' : '')
        }, root, cat);
      });
    }

    hbar(root, d, w, h, opt) {
      const s = d.series[0];
      const max = opt.max != null ? opt.max : Math.max.apply(null, s.data);
      const labelW = Math.min(w * 0.36, Math.max.apply(null, d.cats.map(function (c) { return textWidth(c, 23); })) + 24);
      const valueW = Math.max.apply(null, s.data.map(function (v) { return textWidth(fmt(v) + opt.unit, 22); })) + 18;
      const band = h / d.cats.length;
      const barH = Math.min(band * 0.62, 56);
      const plotW = w - labelW - valueW;
      d.cats.forEach(function (cat, i) {
        const v = s.data[i] || 0;
        const y = band * i + (band - barH) / 2;
        const len = Math.max(2, v / max * plotW);
        const dim = opt.highlight && opt.highlight !== cat;
        svg('text', {
          x: labelW - 20, y: y + barH / 2 + 8, 'text-anchor': 'end',
          class: 'cat' + (dim ? ' dim' : ''), style: 'font-size:23px'
        }, root, cat);
        svg('rect', {
          x: labelW, y: y, width: len, height: barH, rx: Math.min(8, barH / 3),
          class: 'hbar' + (dim ? ' dim' : ''),
          style: 'fill:' + (opt.highlight && !dim ? 'var(--c1)' : opt.highlight ? 'var(--c6)' : color(0)) + ';--i:' + i
        }, root);
        svg('text', {
          x: labelW + len + 14, y: y + barH / 2 + 8,
          class: 'val fade' + (dim ? ' dim' : ''), style: '--i:' + (i + 3)
        }, root, fmt(v) + opt.unit);
      });
    }

    line(root, d, w, h, opt, area) {
      const all = [].concat.apply([], d.series.map(function (s) { return s.data; }))
        .filter(function (v) { return v != null; });
      const named = d.series.some(function (s) { return s.name; });
      const right = named
        ? Math.max.apply(null, d.series.map(function (s) { return textWidth(s.name, 22); })) + 30
        : 24;
      const box = this.frame(root, all, w, h, opt, { right: right });
      const n = d.cats.length;
      const x = function (i) { return n === 1 ? (box.l + box.r) / 2 : box.l + 24 + (box.r - box.l - 48) * i / (n - 1); };
      const every = Math.ceil(n / Math.max(2, Math.floor((box.r - box.l) / 110)));
      d.cats.forEach(function (cat, i) {
        if (i % every && i !== n - 1) return;
        svg('text', { x: x(i), y: box.b + 38, 'text-anchor': 'middle', class: 'cat' }, root, cat);
      });
      const showValues = opt.values === 'on' || (opt.values !== 'off' && d.series.length === 1 && n <= 10);
      d.series.forEach(function (s, si) {
        const pts = [];
        s.data.forEach(function (v, i) { if (v != null) pts.push([x(i), box.y(v), v]); });
        if (!pts.length) return;
        const dim = opt.highlight && opt.highlight !== s.name;
        const path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('');
        if (area) {
          svg('path', {
            d: path + 'L' + pts[pts.length - 1][0] + ',' + box.y(Math.max(box.lo, 0)) + 'L' + pts[0][0] + ',' + box.y(Math.max(box.lo, 0)) + 'z',
            class: 'fade', style: 'fill:' + color(si) + ';opacity:.14;--i:2'
          }, root);
        }
        svg('path', {
          d: path, pathLength: 1, class: 'line' + (dim ? ' dim' : ''),
          style: 'stroke:' + color(si) + (dim ? ';stroke-width:3.5' : '')
        }, root);
        pts.forEach(function (p, i) {
          if (n > 24) return;
          svg('circle', {
            cx: p[0], cy: p[1], r: 7, class: 'fade' + (dim ? ' dim' : ''),
            style: 'fill:var(--bg);stroke:' + color(si) + ';stroke-width:4;--i:' + i
          }, root);
          if (showValues) {
            svg('text', {
              x: p[0], y: p[1] - 20, 'text-anchor': 'middle', class: 'val fade', style: '--i:' + (i + 2)
            }, root, fmt(p[2]) + opt.unit);
          }
        });
        if (s.name) {
          const last = pts[pts.length - 1];
          svg('text', {
            x: last[0] + 18, y: last[1] + 8, class: 'name fade' + (dim ? ' dim' : ''),
            style: 'fill:' + color(si) + ';--i:' + (n + 2)
          }, root, s.name);
        }
      });
    }

    donut(root, d, w, h, opt) {
      const s = d.series[0];
      const total = s.data.reduce(function (a, b) { return a + (b || 0); }, 0) || 1;
      const R = Math.min(h, w * 0.5) / 2 - 6;
      const thick = R * 0.3;
      const r = R - thick / 2;
      const cx = R + 6;
      const cy = h / 2;
      const C = 2 * Math.PI * r;
      let acc = 0;
      s.data.forEach(function (v, i) {
        const frac = (v || 0) / total;
        const dim = opt.highlight && opt.highlight !== d.cats[i];
        svg('circle', {
          cx: cx, cy: cy, r: r, fill: 'none', 'stroke-width': thick,
          'stroke-dasharray': Math.max(0, frac * C - 4) + ' ' + C,
          'stroke-dashoffset': -acc * C,
          transform: 'rotate(-90 ' + cx + ' ' + cy + ')',
          class: 'arc' + (dim ? ' dim' : ''),
          style: 'stroke:' + color(i) + ';--i:' + i
        }, root);
        acc += frac;
      });
      const center = opt.center != null ? opt.center : fmt(total) + opt.unit;
      svg('text', {
        x: cx, y: cy + R * 0.13, 'text-anchor': 'middle', class: 'big',
        style: 'font-size:' + Math.round(R * 0.4) + 'px'
      }, root, center);
      const lx = cx + R + 60;
      const rowH = Math.min(62, (h - 20) / d.cats.length);
      const top = cy - rowH * d.cats.length / 2;
      d.cats.forEach(function (cat, i) {
        const y = top + rowH * i + rowH / 2;
        const dim = opt.highlight && opt.highlight !== cat;
        const g = svg('g', { class: 'fade' + (dim ? ' dim' : ''), style: '--i:' + (i + 2) }, root);
        svg('rect', { x: lx, y: y - 11, width: 22, height: 22, rx: 5, style: 'fill:' + color(i) }, g);
        svg('text', { x: lx + 38, y: y + 8, class: 'cat', style: 'font-size:24px' }, g, cat);
        svg('text', { x: w - 4, y: y + 8, 'text-anchor': 'end', class: 'val', style: 'font-size:24px' }, g,
          fmt(s.data[i]) + opt.unit + '  ·  ' + Math.round((s.data[i] || 0) / total * 100) + '%');
      });
    }

    /* Rows of (label, x, y); the first row names the axes. */
    scatter(root, rows, w, h, opt) {
      const num = HSChart.num;
      const hasHead = num(rows[0][1]) == null;
      const head = hasHead ? rows[0] : ['', 'x', 'y'];
      const pts = (hasHead ? rows.slice(1) : rows).map(function (r) {
        return { label: r[0], x: num(r[1]), y: num(r[2]) };
      }).filter(function (p) { return p.x != null && p.y != null; });
      if (!pts.length) return;
      const xs = pts.map(function (p) { return p.x; });
      const ys = pts.map(function (p) { return p.y; });
      const box = this.frame(root, ys, w, h, {
        unit: '', min: opt.min != null ? opt.min : Math.min.apply(null, ys), max: opt.max
      }, { top: 44, right: 30 });
      const tx = niceTicks(Math.min.apply(null, xs), Math.max.apply(null, xs), 6);
      const x = function (v) { return box.l + (v - tx.lo) / (tx.hi - tx.lo) * (box.r - box.l); };
      tx.ticks.forEach(function (v) {
        svg('line', { x1: x(v), x2: x(v), y1: box.t, y2: box.b, class: 'grid' }, root);
        svg('text', { x: x(v), y: box.b + 38, 'text-anchor': 'middle' }, root, fmt(v));
      });
      svg('text', { x: box.r, y: box.b - 14, 'text-anchor': 'end', class: 'name' }, root, head[1] + ' →');
      svg('text', { x: box.l + 12, y: box.t - 16, class: 'name' }, root, '↑ ' + head[2]);
      if (opt.trend && pts.length > 2) {
        const n = pts.length;
        const mx = xs.reduce(function (a, b) { return a + b; }, 0) / n;
        const my = ys.reduce(function (a, b) { return a + b; }, 0) / n;
        let sxy = 0, sxx = 0, syy = 0;
        pts.forEach(function (p) {
          sxy += (p.x - mx) * (p.y - my);
          sxx += (p.x - mx) * (p.x - mx);
          syy += (p.y - my) * (p.y - my);
        });
        const slope = sxy / (sxx || 1);
        const icpt = my - slope * mx;
        const clampY = function (v) { return Math.max(box.t, Math.min(box.b, box.y(v))); };
        svg('path', {
          d: 'M' + x(tx.lo) + ',' + clampY(slope * tx.lo + icpt) + 'L' + x(tx.hi) + ',' + clampY(slope * tx.hi + icpt),
          pathLength: 1, class: 'line', style: 'stroke:var(--c2);stroke-width:3.5'
        }, root);
        svg('text', { x: box.r - 8, y: box.t + 26, 'text-anchor': 'end', class: 'val fade', style: '--i:8' }, root,
          'r = ' + (sxy / Math.sqrt((sxx * syy) || 1)).toFixed(2));
      }
      const showLabels = opt.labels === 'on' || (opt.labels !== 'off' && pts.length <= 12);
      pts.forEach(function (p, i) {
        const dim = opt.highlight && opt.highlight !== p.label;
        svg('circle', {
          cx: x(p.x), cy: box.y(p.y), r: opt.highlight && !dim ? 13 : 10,
          class: 'fade' + (dim ? ' dim' : ''), style: 'fill:var(--c1);opacity:.85;--i:' + i * 0.6
        }, root);
        if (showLabels && p.label) {
          svg('text', {
            x: x(p.x) + 16, y: box.y(p.y) + 7, class: 'cat fade' + (dim ? ' dim' : ''),
            style: 'font-size:19px;--i:' + (i * 0.6 + 3)
          }, root, p.label);
        }
      });
    }
  }

  /* ================= <hs-count> =================
   * <hs-count>3.4×</hs-count> counts up to the number in its text when
   * its slide is shown. The text itself never changes. */
  class HSCount extends HTMLElement {
    constructor() {
      super();
      this._out = document.createElement('span');
      this.attachShadow({ mode: 'open' }).appendChild(this._out);
      this._raf = 0;
      this._mutate = new MutationObserver(() => this.show(1));
    }

    connectedCallback() {
      this._mutate.observe(this, { subtree: true, childList: true, characterData: true });
      this.show(1);
    }

    disconnectedCallback() {
      this._mutate.disconnect();
      cancelAnimationFrame(this._raf);
    }

    show(t) {
      const text = this.textContent.trim();
      const m = text.match(/^([^]*?)(-?[\d,]*\.?\d+)([^]*)$/);
      if (!m) { this._out.textContent = text; return; }
      const digits = m[2].replace(/,/g, '');
      const decimals = (digits.split('.')[1] || '').length;
      let s = (parseFloat(digits) * t).toFixed(decimals);
      if (m[2].indexOf(',') >= 0) {
        s = Number(s).toLocaleString('en-US', {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals
        });
      }
      this._out.textContent = m[1] + s + m[3];
    }

    play() {
      cancelAnimationFrame(this._raf);
      const start = performance.now();
      const duration = Number(this.getAttribute('duration')) || 1200;
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        this.show(1 - Math.pow(1 - t, 4));
        if (t < 1) this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }
  }

  customElements.define('hs-chart', HSChart);
  customElements.define('hs-count', HSCount);

  function playIn(scope) {
    if (HS.isStatic || HS.state.mode === 'edit' || reducedMotion.matches) return;
    const targets = scope.matches && scope.matches('hs-chart, hs-count') ? [scope] : [];
    scope.querySelectorAll('hs-chart, hs-count').forEach(function (el) { targets.push(el); });
    targets.forEach(function (el) { el.play(); });
  }

  HS.on('slide', function () { if (HS.current) playIn(HS.current); });
  HS.on('change', function (e) {
    if (e.slideChanged || !HS.current) return;
    HS.stepsOf(HS.current).map.forEach(function (n, el) {
      if (n === HS.state.step) playIn(el);
    });
  });

  /* ================= code highlighting =================
   * <pre><code class="lang-py">…</code></pre> */

  if (!(window.CSS && CSS.highlights && window.Highlight)) return;

  const KINDS = ['kw', 'str', 'num', 'com', 'fn', 'type'];
  const sets = {};
  KINDS.forEach(function (k) {
    sets[k] = new Highlight();
    CSS.highlights.set('hs-' + k, sets[k]);
  });

  const words = function (s) { return new Set(s.split(' ')); };
  const KEYWORDS = {
    js: words('const let var function return if else for while do class extends new import from export default async await try catch finally throw typeof instanceof of in this null undefined true false switch case break continue yield static get set super delete void interface type enum implements readonly as'),
    py: words('def class return if elif else for while import from as with try except finally raise lambda yield pass break continue and or not in is None True False async await global nonlocal assert del self match case'),
    sh: words('if then else elif fi for do done while until case esac function in return export local readonly set unset source echo cd exit'),
    c: words('fn let mut const var pub use mod struct enum impl trait for while loop if else match return break continue in as where self Self true false null nil func package import type interface defer go chan map range switch case default class public private protected static final void int long float double char bool boolean string new this super try catch throw throws extends implements unsigned signed sizeof typedef auto template typename namespace using comptime error defer errdefer usize u8 u32 u64 i32 i64 f32 f64 async await'),
    sql: words('select from where and or not in is null as join left right inner outer full on group by order having limit offset insert into values update set delete create table index view drop alter add primary key foreign references distinct union all case when then else end with asc desc count sum avg min max')
  };
  const ALIAS = {
    javascript: 'js', ts: 'js', typescript: 'js', jsx: 'js', tsx: 'js', mjs: 'js',
    python: 'py', bash: 'sh', zsh: 'sh', shell: 'sh', console: 'sh',
    rust: 'c', rs: 'c', go: 'c', java: 'c', cpp: 'c', 'c++': 'c', zig: 'c', swift: 'c', kotlin: 'c', cs: 'c',
    yml: 'yaml', toml: 'yaml', ini: 'yaml', xml: 'html', svg: 'html'
  };

  const STRING = '"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'';
  const NUMBER = '\\b(?:0[xX][\\da-fA-F_]+|\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b';
  const IDENT = '[A-Za-z_$][\\w$]*';
  const build = function (comment, string) {
    return new RegExp('(' + comment + ')|(' + string + ')|(' + NUMBER + ')|(' + IDENT + ')', 'g');
  };
  const GRAMMAR = {
    js: build('\\/\\/[^\\n]*|\\/\\*[^]*?\\*\\/', STRING + '|`(?:\\\\.|[^`\\\\])*`'),
    c: build('\\/\\/[^\\n]*|\\/\\*[^]*?\\*\\/', STRING),
    py: build('#[^\\n]*', '"""[^]*?"""|\'\'\'[^]*?\'\'\'|' + STRING),
    sh: build('(?:^|(?<=\\s))#[^\\n]*', STRING),
    sql: build('--[^\\n]*', STRING),
    yaml: build('#[^\\n]*', STRING),
    json: build('(?!)', STRING)
  };

  function tokenize(text, lang) {
    lang = ALIAS[lang] || lang;
    const tokens = [];
    const push = function (start, end, kind) { tokens.push({ start: start, end: end, kind: kind }); };
    let m;

    if (lang === 'html') {
      const re = /(<!--[^]*?-->)|(<\/?[\w:-]+|\/?>)|([\w:-]+)(?==)|("[^"]*"|'[^']*')/g;
      while ((m = re.exec(text))) {
        push(m.index, re.lastIndex, m[1] ? 'com' : m[2] ? 'kw' : m[3] ? 'fn' : 'str');
      }
      return tokens;
    }
    if (lang === 'css') {
      const re = /(\/\*[^]*?\*\/)|("[^"]*"|'[^']*')|(@[\w-]+)|(#[\da-fA-F]{3,8}\b|-?\d[\d.]*(?:px|em|rem|%|s|ms|deg|fr|vh|vw)?)|([\w-]+)(?=\s*:)/g;
      while ((m = re.exec(text))) {
        push(m.index, re.lastIndex, m[1] ? 'com' : m[2] ? 'str' : m[3] ? 'kw' : m[4] ? 'num' : 'fn');
      }
      return tokens;
    }

    const re = GRAMMAR[lang] || GRAMMAR.c;
    const kw = KEYWORDS[lang === 'json' || lang === 'yaml' ? 'js' : lang] || KEYWORDS.c;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = re.lastIndex;
      if (m[1]) push(start, end, 'com');
      else if (m[2]) {
        const isKey = (lang === 'json' || lang === 'yaml') && /^\s*:/.test(text.slice(end, end + 4));
        push(start, end, isKey ? 'fn' : 'str');
      } else if (m[3]) push(start, end, 'num');
      else {
        const word = lang === 'sql' ? m[4].toLowerCase() : m[4];
        if (kw.has(word)) push(start, end, 'kw');
        else if (lang === 'yaml' && /^\s*:(\s|$)/.test(text.slice(end, end + 2))) push(start, end, 'fn');
        else if (text[end] === '(') push(start, end, 'fn');
        else if (/^[A-Z][a-z]/.test(word) && lang !== 'sh' && lang !== 'sql') push(start, end, 'type');
        else if (lang === 'sh' && text[start - 1] === '$') push(start - 1, end, 'type');
      }
      if (end === start) re.lastIndex++;
    }
    return tokens;
  }

  const known = new Map();   /* code element -> {text, ranges: [[kind, range]]} */

  function languageOf(code) {
    const pre = code.parentElement;
    const m = (code.className + ' ' + pre.className).match(/\blang(?:uage)?-([\w+#-]+)/);
    return m ? m[1].toLowerCase() : pre.getAttribute('data-lang');
  }

  function clear(entry) {
    entry.ranges.forEach(function (pair) { sets[pair[0]].delete(pair[1]); });
  }

  function highlight(code) {
    const text = code.textContent;
    const lang = languageOf(code);
    const old = known.get(code);
    if (old && old.text === text && old.lang === lang) return;
    if (old) clear(old);
    const entry = { text: text, lang: lang, ranges: [] };
    known.set(code, entry);
    if (!lang || lang === 'text' || lang === 'plain') return;

    const nodes = [];
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    let node, offset = 0;
    while ((node = walker.nextNode())) {
      nodes.push({ node: node, start: offset, end: offset + node.data.length });
      offset += node.data.length;
    }
    let cursor = 0;
    const locate = function (pos, atEnd) {
      while (cursor < nodes.length - 1 &&
             (atEnd ? nodes[cursor].end < pos : nodes[cursor].end <= pos)) cursor++;
      return nodes[cursor];
    };
    tokenize(text, lang).forEach(function (tok) {
      if (!nodes.length) return;
      const a = locate(tok.start, false);
      const ai = cursor;
      const b = locate(tok.end, true);
      const range = new Range();
      range.setStart(a.node, Math.min(a.node.data.length, tok.start - a.start));
      range.setEnd(b.node, Math.min(b.node.data.length, tok.end - b.start));
      cursor = ai;
      sets[tok.kind].add(range);
      entry.ranges.push([tok.kind, range]);
    });
  }

  function scan() {
    known.forEach(function (entry, code) {
      if (!code.isConnected) {
        clear(entry);
        known.delete(code);
      }
    });
    document.querySelectorAll('pre > code').forEach(highlight);
  }

  let scanTimer = 0;
  new MutationObserver(function () {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 120);
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
  scan();
})();
