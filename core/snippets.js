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
    name: 'ヒーロー表紙',
    desc: '全面メディア＋パネル (layout-hero)',
    html: [
      '<section class="slide layout-hero" data-page-number="off">',
      '  <div class="media">',
      '    <img src="" alt="cover background">',
      '  </div>',
      '  <div class="body">',
      '    <div class="hero-panel">',
      '      <div class="kicker">Kicker</div>',
      '      <h1>Deck title</h1>',
      '      <p class="subtitle">Subtitle / speaker / date</p>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: '左右分割',
    desc: 'メディア半分＋テキスト半分 (layout-split)',
    html: [
      '<section class="slide layout-split">',
      '  <div class="media">',
      '    <img src="" alt="side image">',
      '  </div>',
      '  <div class="body">',
      '    <div class="kicker">Kicker</div>',
      '    <h2>Slide title</h2>',
      '    <p class="subtitle">One supporting line.</p>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: 'メッセージ',
    desc: '主張ひとつを大きく (layout-message)',
    html: [
      '<section class="slide layout-message">',
      '  <div class="kicker">Kicker</div>',
      '  <h2>The one claim this slide exists to make.</h2>',
      '  <p class="support">A quieter sentence that backs it up.</p>',
      '</section>'
    ].join('\n')
  },
  {
    name: 'アジェンダ',
    desc: '番号付きの目次・本日の流れ (.agenda)',
    html: [
      '<section class="slide layout-std">',
      '  <header class="slide-head">',
      '    <div class="kicker">Agenda</div>',
      '    <h2>本日の流れ</h2>',
      '  </header>',
      '  <div class="body">',
      '    <ol class="agenda">',
      '      <li><h3>First topic</h3><p>One-line preview.</p></li>',
      '      <li><h3>Second topic</h3><p>One-line preview.</p></li>',
      '      <li><h3>Third topic</h3><p>One-line preview.</p></li>',
      '    </ol>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: 'プロセス',
    desc: '矢印でつなぐステップ (.flow)',
    html: [
      '<section class="slide layout-std">',
      '  <header class="slide-head">',
      '    <h2>How it works</h2>',
      '  </header>',
      '  <div class="body" style="justify-content: center;">',
      '    <ol class="flow">',
      '      <li><h3>Ask</h3><p class="small">What happens first.</p></li>',
      '      <li><h3>Build</h3><p class="small">Then this.</p></li>',
      '      <li><h3>Check</h3><p class="small">Then this.</p></li>',
      '      <li><h3>Ship</h3><p class="small">And finally.</p></li>',
      '    </ol>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: '年表',
    desc: '横に流れるマイルストーン (.timeline)',
    html: [
      '<section class="slide layout-std">',
      '  <header class="slide-head">',
      '    <h2>History</h2>',
      '  </header>',
      '  <div class="body" style="justify-content: center;">',
      '    <ol class="timeline">',
      '      <li><div class="when">2019</div><h3>Founded</h3><p class="small">What happened.</p></li>',
      '      <li><div class="when">2022</div><h3>Grew</h3><p class="small">What happened.</p></li>',
      '      <li><div class="when">2026</div><h3>Now</h3><p class="small">Where we are.</p></li>',
      '    </ol>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: 'メンバー',
    desc: '顔写真＋名前＋ひとこと (.people)',
    html: [
      '<section class="slide layout-std">',
      '  <header class="slide-head">',
      '    <h2>Team</h2>',
      '  </header>',
      '  <div class="body" style="justify-content: center;">',
      '    <div class="people">',
      '      <div class="person"><div class="avatar"></div><h3>Name</h3><div class="role">ROLE</div><p>One line about them.</p></div>',
      '      <div class="person"><div class="avatar"></div><h3>Name</h3><div class="role">ROLE</div><p>One line about them.</p></div>',
      '      <div class="person"><div class="avatar"></div><h3>Name</h3><div class="role">ROLE</div><p>One line about them.</p></div>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: '概要表',
    desc: 'ラベル＋値の定義リスト (.spec)',
    html: [
      '<section class="slide layout-two-col">',
      '  <header class="slide-head">',
      '    <div class="kicker">Overview</div>',
      '    <h2>会社概要</h2>',
      '  </header>',
      '  <div class="body">',
      '    <div class="col is-wide">',
      '      <dl class="spec">',
      '        <dt>会社名</dt><dd>株式会社◯◯</dd>',
      '        <dt>設立</dt><dd>2020年4月</dd>',
      '        <dt>所在地</dt><dd>東京都◯◯区</dd>',
      '        <dt>事業内容</dt><dd>◯◯の開発・運用</dd>',
      '      </dl>',
      '    </div>',
      '    <div class="col">',
      '      <figure><img src="" alt="" style="background: var(--hs-surface); min-height: 420px; border-radius: var(--hs-radius);"></figure>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: 'マトリクス',
    desc: '2×2の整理図 (.matrix + .axis)',
    html: [
      '<section class="slide layout-std">',
      '  <header class="slide-head">',
      '    <h2>Where things sit</h2>',
      '  </header>',
      '  <div class="body">',
      '    <div class="matrix">',
      '      <span class="axis is-top">HIGH IMPACT</span>',
      '      <span class="axis is-bottom">LOW IMPACT</span>',
      '      <span class="axis is-left">HARD</span>',
      '      <span class="axis is-right">EASY</span>',
      '      <div class="card"><h3>Quadrant</h3><p class="small">Point.</p></div>',
      '      <div class="card is-accent"><h3>Quadrant</h3><p class="small">Point.</p></div>',
      '      <div class="card"><h3>Quadrant</h3><p class="small">Point.</p></div>',
      '      <div class="card"><h3>Quadrant</h3><p class="small">Point.</p></div>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: '結論バンド',
    desc: '本文＋下端の結論帯 (.takeaway)',
    html: [
      '<section class="slide layout-std">',
      '  <header class="slide-head">',
      '    <h2>The evidence</h2>',
      '  </header>',
      '  <div class="body">',
      '    <p>Body content that builds the case.</p>',
      '    <div class="takeaway">したがって、◯◯である — the one line to remember.</div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: '料金プラン',
    desc: '3枠の料金・推奨ハイライト (.plans)',
    html: [
      '<section class="slide layout-std">',
      '  <header class="slide-head">',
      '    <h2>Plans</h2>',
      '  </header>',
      '  <div class="body">',
      '    <div class="plans">',
      '      <div class="plan"><h3>Light</h3><div class="price">¥0,000</div><div class="per">per month</div><ul><li>Feature</li></ul></div>',
      '      <div class="plan is-featured"><div class="flag">RECOMMENDED</div><h3>Standard</h3><div class="price">¥0,000</div><div class="per">per month</div><ul><li>Feature</li></ul></div>',
      '      <div class="plan"><h3>Pro</h3><div class="price">¥0,000</div><div class="per">per month</div><ul><li>Feature</li></ul></div>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: '工程表',
    desc: '期間×担当のバーチャート (.gantt)',
    html: [
      '<section class="slide layout-std">',
      '  <header class="slide-head">',
      '    <h2>Schedule</h2>',
      '  </header>',
      '  <div class="body">',
      '    <div class="gantt" style="--gantt-cols: 6;">',
      '      <span class="label"></span>',
      '      <span class="tick">M1</span><span class="tick">M2</span><span class="tick">M3</span><span class="tick">M4</span><span class="tick">M5</span><span class="tick">M6</span>',
      '      <span class="label">Phase 1</span>',
      '      <div class="bar" style="grid-column: 2 / 4;">design</div>',
      '      <span class="label">Phase 2</span>',
      '      <div class="bar" style="grid-column: 3 / 6;">build</div>',
      '      <span class="label">Phase 3</span>',
      '      <div class="bar is-alt" style="grid-column: 5 / 8;">rollout</div>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: 'ファネル',
    desc: '絞り込みの段階図 (.funnel)',
    html: [
      '<section class="slide layout-std">',
      '  <header class="slide-head">',
      '    <h2>Conversion</h2>',
      '  </header>',
      '  <div class="body">',
      '    <ol class="funnel">',
      '      <li>Stage <span class="n">0,000</span></li>',
      '      <li>Stage <span class="n">0,000</span></li>',
      '      <li>Stage <span class="n">000</span></li>',
      '      <li>Stage <span class="n">00</span></li>',
      '    </ol>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: 'Do/Don\'t',
    desc: '✓と✕の対比リスト (.checklist)',
    html: [
      '<section class="slide layout-two-col">',
      '  <header class="slide-head">',
      '    <h2>Do this, not that</h2>',
      '  </header>',
      '  <div class="body">',
      '    <div class="col">',
      '      <ul class="checklist">',
      '        <li>Good practice</li>',
      '        <li>Good practice</li>',
      '      </ul>',
      '    </div>',
      '    <div class="col">',
      '      <ul class="checklist">',
      '        <li class="is-no">Anti-pattern</li>',
      '        <li class="is-no">Anti-pattern</li>',
      '      </ul>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: 'ギャラリー',
    desc: '写真をそろえて並べる (.gallery)',
    html: [
      '<section class="slide layout-std">',
      '  <header class="slide-head">',
      '    <h2>Photos</h2>',
      '  </header>',
      '  <div class="body">',
      '    <div class="gallery">',
      '      <figure><img src="" alt=""><figcaption>Caption.</figcaption></figure>',
      '      <figure><img src="" alt=""><figcaption>Caption.</figcaption></figure>',
      '      <figure><img src="" alt=""><figcaption>Caption.</figcaption></figure>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n')
  },
  {
    name: '組織図',
    desc: '1段の体制図 (.tree)',
    html: [
      '<section class="slide layout-std">',
      '  <header class="slide-head">',
      '    <h2>Team structure</h2>',
      '  </header>',
      '  <div class="body">',
      '    <div class="tree">',
      '      <div class="node">Lead<span class="small">name</span></div>',
      '      <div class="stem"></div>',
      '      <ul>',
      '        <li><div class="node">Group A<span class="small">n people</span></div></li>',
      '        <li><div class="node">Group B<span class="small">n people</span></div></li>',
      '        <li><div class="node">Group C<span class="small">n people</span></div></li>',
      '      </ul>',
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
