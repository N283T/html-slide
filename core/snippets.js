/* Starter markup for every layout — what the "add slide" gallery
 * inserts. Deliberately minimal: real content replaces the
 * placeholders, and the layout CSS does the rest. */
window.HSSnippets = [
  {
    name: '標準',
    desc: '見出し＋自由な本文 (layout-std)',
    html: [
      '<section class="slide layout-std">',
      '  <header class="slide-head">',
      '    <div class="kicker">Kicker</div>',
      '    <h2>Slide title</h2>',
      '  </header>',
      '  <div class="body">',
      '    <p>Body text.</p>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: 'セクション区切り',
    desc: '章の切り替わりに一呼吸 (layout-section)',
    html: [
      '<section class="slide layout-section">',
      '  <div class="kicker">Part N</div>',
      '  <h2>Section title</h2>',
      '  <p class="subtitle">One line that sets up the chapter.</p>',
      '</section>'
    ].join('\n')
  },
  {
    name: '2カラム',
    desc: 'テキストと図を横並びに (layout-two-col)',
    html: [
      '<section class="slide layout-two-col">',
      '  <header class="slide-head">',
      '    <h2>Slide title</h2>',
      '  </header>',
      '  <div class="body">',
      '    <div class="col">',
      '      <p>Left column.</p>',
      '    </div>',
      '    <div class="col">',
      '      <p>Right column.</p>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: '図メイン',
    desc: '大きな図＋読み解きの説明 (layout-figure)',
    html: [
      '<section class="slide layout-figure">',
      '  <header class="slide-head">',
      '    <h2>Slide title</h2>',
      '  </header>',
      '  <div class="body">',
      '    <figure>',
      '      <img src="" alt="figure placeholder" style="background: var(--hs-surface); min-height: 480px; border-radius: var(--hs-radius);">',
      '      <figcaption>Caption.</figcaption>',
      '    </figure>',
      '    <div class="aside">',
      '      <p>What to look at, and what it means.</p>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: '比較',
    desc: 'ビフォー/アフター、提案/従来 (layout-compare)',
    html: [
      '<section class="slide layout-compare">',
      '  <header class="slide-head">',
      '    <h2>Slide title</h2>',
      '  </header>',
      '  <div class="body">',
      '    <div class="panel">',
      '      <h3>Option A</h3>',
      '      <ul><li>Point</li></ul>',
      '    </div>',
      '    <div class="vs">VS</div>',
      '    <div class="panel is-accent">',
      '      <h3>Option B</h3>',
      '      <ul><li>Point</li></ul>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: 'カード',
    desc: '並列する2〜3個のポイント (layout-cards)',
    html: [
      '<section class="slide layout-cards">',
      '  <header class="slide-head">',
      '    <h2>Slide title</h2>',
      '  </header>',
      '  <div class="body">',
      '    <div class="card"><h3>One</h3><p class="small">Support.</p></div>',
      '    <div class="card"><h3>Two</h3><p class="small">Support.</p></div>',
      '    <div class="card"><h3>Three</h3><p class="small">Support.</p></div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: 'チャート',
    desc: '組み込みの bar/line/donut チャート',
    html: [
      '<section class="slide layout-figure">',
      '  <header class="slide-head">',
      '    <h2>Slide title</h2>',
      '  </header>',
      '  <div class="body">',
      '    <figure>',
      '      <div data-chart=\'{"type": "bar", "labels": ["A", "B", "C", "D"], "series": [{"name": "value", "data": [12, 28, 19, 34]}]}\'></div>',
      '      <figcaption>Caption.</figcaption>',
      '    </figure>',
      '    <div class="aside">',
      '      <p>Read the chart for the audience.</p>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: '引用',
    desc: 'ひとつの引用を中央に (layout-quote)',
    html: [
      '<section class="slide layout-quote">',
      '  <blockquote>The quote.</blockquote>',
      '  <p class="attribution">— attribution</p>',
      '</section>'
    ].join('\n')
  },
  {
    name: '数字で主張',
    desc: '大きな数字で1つの主張 (stat)',
    html: [
      '<section class="slide layout-std">',
      '  <header class="slide-head">',
      '    <h2>The claim</h2>',
      '  </header>',
      '  <div class="body">',
      '    <div style="display: flex; gap: 120px; margin-top: 40px;">',
      '      <div class="stat"><div class="stat-value">42%</div><div class="stat-label">what it measures</div></div>',
      '      <div class="stat"><div class="stat-value">3.1×</div><div class="stat-label">what it measures</div></div>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: 'エンド',
    desc: '締めのスライド (layout-end)',
    html: [
      '<section class="slide layout-end" data-page-number="off">',
      '  <h2>Thank you</h2>',
      '  <p class="subtitle">contact / links</p>',
      '</section>'
    ].join('\n')
  }
];
