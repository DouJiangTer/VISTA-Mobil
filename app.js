/* Mobile Anchor Tasks — static annotation explorer.
   Routes:  #/            task index
            #/<task>      screen gallery
            #/<task>/<page>  screen detail with annotation overlays          */

const TYPES = ['navigate', 'click', 'input', 'toggle', 'scroll', 'other'];
const view = document.getElementById('view');
const crumbs = document.getElementById('crumbs');
const tooltip = document.getElementById('tooltip');

const cache = { index: null, tasks: {} };
const state = { filter: 'included', query: '', showIds: false };

/* ---------- utils ---------- */

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.setAttribute('style', v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (!kid) continue; // null / false / '' / 0 are "render nothing"
    n.append(kid instanceof Node ? kid : document.createTextNode(kid));
  }
  return n;
};

const typeColor = (t) => `var(--t-${TYPES.includes(t) ? t : 'other'})`;
const prettyName = (n) => n.replace(/_/g, ' ').replace(/\s+-\s+/g, ' · ');
const enc = (s) => encodeURIComponent(s);

async function loadIndex() {
  if (!cache.index) cache.index = await (await fetch('data/index.json')).json();
  return cache.index;
}

async function loadTask(id) {
  if (!cache.tasks[id]) {
    const t = await (await fetch(`data/${id}.json`)).json();
    t.byName = Object.fromEntries(t.pages.map((p, i) => [p.name, i]));
    // reverse navigation edges: target page -> [{from, ann}]
    t.inboundEdges = {};
    for (const p of t.pages) {
      for (const a of p.annotations) {
        const to = a.navigateTo && a.navigateTo.name;
        if (to == null) continue;
        (t.inboundEdges[to] ||= []).push({ from: p.name, ann: a });
      }
    }
    cache.tasks[id] = t;
  }
  return cache.tasks[id];
}

/* ---------- tooltip ---------- */

function tooltipContent(ann, task) {
  const color = typeColor(ann.type);
  const node = ann.node || {};
  const nav = ann.navigateTo;
  const navKnown = nav && task.byName[nav.name] !== undefined;

  const kv = (pairs) =>
    el('dl', { class: 'kv' },
      pairs.map(([k, v, cls]) => [
        el('dt', {}, k),
        el('dd', { class: cls || (v == null || v === '' ? 'null' : '') },
          v == null || v === '' ? 'null' : String(v)),
      ]));

  return [
    el('div', { class: 'tt-head' },
      el('span', { class: 'tt-type' }, ann.type),
      el('span', { class: 'tt-note' }, ann.note || '—'),
      el('span', { class: 'tt-id' }, `#${ann.id}`)),
    el('div', { class: 'tt-body' },
      kv([
        ['type', ann.type],
        ['subtype', ann.subtype],
        ['interactable', ann.interactable],
        ['navigateTo', nav ? nav.name : null, nav ? 'nav' : ''],
      ]),
      el('div', { class: 'tt-sec' },
        el('div', { class: 'tt-sec-title' }, 'node'),
        kv([
          ['id', node.id],
          ['name', node.name],
          ['type', node.type],
          ['depth', node.depth],
          ['size', node.w != null ? `${round(node.w)} × ${round(node.h)}` : null],
          ['xy', node.x != null ? `${round(node.x)}, ${round(node.y)}` : null],
        ])),
      ann.bbox && el('div', { class: 'tt-sec' },
        el('div', { class: 'tt-sec-title' }, 'bbox_png'),
        kv([
          ['x, y', `${ann.bbox.x}, ${ann.bbox.y}`],
          ['w, h', `${ann.bbox.w} × ${ann.bbox.h}`],
        ])),
      navKnown && el('div', { class: 'tt-hint' }, `Click to open → ${prettyName(nav.name)}`),
      nav && !navKnown && el('div', { class: 'tt-hint' }, `Target not in dataset: ${nav.name}`)),
  ].map((n) => (n instanceof Node ? n : null)).filter(Boolean).map((n) => {
    n.style.setProperty('--bx', color);
    return n;
  });
}

const round = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

function showTooltip(ann, task, evt) {
  tooltip.replaceChildren(...tooltipContent(ann, task));
  tooltip.style.setProperty('--bx', typeColor(ann.type));
  tooltip.hidden = false;
  moveTooltip(evt);
}

function moveTooltip(evt) {
  if (tooltip.hidden) return;
  const pad = 14;
  const r = tooltip.getBoundingClientRect();
  let x = evt.clientX + pad;
  let y = evt.clientY + pad;
  if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = Math.max(8, evt.clientY - r.height - pad);
  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${y}px`;
}

const hideTooltip = () => { tooltip.hidden = true; };

/* ---------- views ---------- */

async function renderIndex() {
  const idx = await loadIndex();
  crumbs.replaceChildren();

  const totals = idx.tasks.reduce(
    (a, t) => ({
      pages: a.pages + t.pages,
      included: a.included + t.included,
      annotations: a.annotations + t.annotations,
      navs: a.navs + (t.by_type.navigate || 0),
    }),
    { pages: 0, included: 0, annotations: 0, navs: 0 },
  );

  view.replaceChildren(
    el('div', { class: 'page-head' },
      el('h1', {}, 'Interaction annotations'),
      el('p', {},
        'Every screen below was extracted from a Figma mobile or web UI kit and hand-annotated with ' +
        'its interactive components. Open a screen to hover the highlighted regions and read the raw ' +
        'annotation fields, or click a navigation region to follow the edge to its target screen.')),

    el('div', { class: 'summary-row' },
      tile(idx.tasks.length, 'apps'),
      tile(totals.pages, 'annotated screens'),
      tile(totals.included, 'screens in dataset'),
      tile(totals.annotations, 'annotations'),
      tile(totals.navs, 'navigation edges')),

    el('div', { class: 'task-grid' },
      idx.tasks.map((t) =>
        el('a', { class: 'task-card', href: `#/${t.id}` },
          el('img', { src: `thumbs/${t.id}/${enc(t.cover)}.webp`, alt: '', loading: 'lazy' }),
          el('div', { class: 'task-card-body' },
            el('div', { class: 'task-id' },
              `task ${t.id}`,
              el('span', { class: `platform-badge platform-${t.platform}` }, t.platform)),
            el('h2', {}, t.name),
            el('div', { class: 'task-desc' }, t.description),
            el('div', { class: 'stats' },
              el('span', { class: 'pill' }, el('b', {}, String(t.pages)), ' screens'),
              el('span', { class: 'pill' }, el('b', {}, String(t.annotations)), ' annotations'),
              el('span', { class: 'pill' }, el('b', {}, String(t.by_type.navigate || 0)), ' nav edges')))))),
  );
}

const tile = (num, lbl) =>
  el('div', { class: 'stat-tile' },
    el('div', { class: 'num' }, num.toLocaleString()),
    el('div', { class: 'lbl' }, lbl));

async function renderGallery(taskId, isRoot = false) {
  const task = await loadTask(taskId);
  const meta = (cache.index.tasks || []).find((t) => t.id === taskId) || {};
  setCrumbs(isRoot ? [] : [['Tasks', '#/']], `${task.name} · task ${task.id}`);

  const grid = el('div', { class: 'gallery' });
  const note = el('span', { class: 'count-note' });

  const paint = () => {
    const q = state.query.trim().toLowerCase();
    const pages = task.pages.filter(
      (p) =>
        (state.filter === 'all' || p.included) &&
        (!q || p.name.toLowerCase().includes(q)),
    );
    note.textContent = `${pages.length} of ${task.pages.length} screens`;
    grid.replaceChildren(
      ...(pages.length
        ? pages.map((p) => shotCard(task, p))
        : [el('div', { class: 'empty' }, 'No screens match this filter.')]),
    );
  };

  const search = el('input', {
    type: 'search',
    placeholder: 'Filter screens by name…',
    value: state.query,
    oninput: (e) => { state.query = e.target.value; paint(); },
  });

  const seg = el('div', { class: 'seg' },
    ...[['included', 'In dataset'], ['all', 'All screens']].map(([k, label]) =>
      el('button', {
        'aria-pressed': String(state.filter === k),
        onclick: (e) => {
          state.filter = k;
          for (const b of e.target.parentNode.children) b.setAttribute('aria-pressed', String(b === e.target));
          paint();
        },
      }, label)));

  view.replaceChildren(
    el('div', { class: 'page-head' },
      el('h1', {}, task.name, el('span', { class: `platform-badge platform-${task.platform}` }, task.platform)),
      el('p', {},
        isRoot
          ? 'Every screen below was extracted from a Figma mobile or web UI kit and hand-annotated ' +
            'with its interactive components. Open a screen to hover the highlighted regions and read ' +
            'the raw annotation fields, or click a navigation region to follow the edge to its ' +
            'target screen.'
          : task.description)),
    isRoot && el('div', { class: 'summary-row' },
      tile(task.pages.length, 'annotated screens'),
      tile(meta.included ?? task.pages.filter((p) => p.included).length, 'screens in dataset'),
      tile(meta.annotations ?? 0, 'annotations'),
      tile(meta.by_type ? meta.by_type.navigate || 0 : 0, 'navigation edges')),
    el('div', { class: 'toolbar' }, search, seg, note),
    grid,
  );
  paint();
}

function shotCard(task, page) {
  const hots = page.annotations
    .filter((a) => a.bbox)
    .map((a) =>
      el('div', {
        class: 'hot',
        style: `left:${(a.bbox.x / page.w) * 100}%;top:${(a.bbox.y / page.h) * 100}%;` +
          `width:${(a.bbox.w / page.w) * 100}%;height:${(a.bbox.h / page.h) * 100}%;` +
          `border-color:${typeColor(a.type)};background:color-mix(in srgb, ${typeColor(a.type)} 16%, transparent)`,
      }));

  return el('a', { class: 'shot', href: `#/${task.id}/${enc(page.name)}` },
    el('div', { class: 'shot-img' },
      el('img', { src: `thumbs/${task.id}/${enc(page.name)}.webp`, alt: page.name, loading: 'lazy' }),
      hots),
    el('div', { class: 'shot-meta' },
      el('div', { class: 'shot-name', title: page.name }, prettyName(page.name)),
      el('div', { class: 'shot-sub' },
        `${page.annotations.length} annotations`,
        !page.included && el('span', { class: 'tag-excluded' }, 'excluded'))));
}

async function renderDetail(taskId, pageName) {
  const task = await loadTask(taskId);
  const i = task.byName[pageName];
  if (i === undefined) return renderMissing(task, pageName);

  const page = task.pages[i];
  setCrumbs(soloTask() ? [[task.name, '#/']] : [['Tasks', '#/'], [task.name, `#/${task.id}`]],
    prettyName(page.name));

  const boxes = [];
  const rows = [];

  const setActive = (idx, on) => {
    boxes[idx] && boxes[idx].classList.toggle('active', on);
    rows[idx] && rows[idx].classList.toggle('active', on);
  };

  const stage = el('div', {
    class: `stage${state.showIds ? ' show-ids' : ''}`,
    style: `--ar:${page.w / page.h}`,
  },
    el('img', { src: `screens/${task.id}/${enc(page.name)}.webp`, alt: page.name, width: page.w, height: page.h }));

  page.annotations.forEach((a, idx) => {
    if (!a.bbox) return;
    const nav = a.navigateTo && task.byName[a.navigateTo.name] !== undefined ? a.navigateTo.name : null;
    const box = el('div', {
      class: 'box',
      'data-nav': nav ? '1' : null,
      style: `--bx:${typeColor(a.type)};left:${(a.bbox.x / page.w) * 100}%;top:${(a.bbox.y / page.h) * 100}%;` +
        `width:${(a.bbox.w / page.w) * 100}%;height:${(a.bbox.h / page.h) * 100}%`,
      onmouseenter: (e) => { setActive(idx, true); showTooltip(a, task, e); },
      onmousemove: moveTooltip,
      onmouseleave: () => { setActive(idx, false); hideTooltip(); },
      onclick: () => { if (nav) { hideTooltip(); location.hash = `#/${task.id}/${enc(nav)}`; } },
    }, el('span', { class: 'tick' }, `#${a.id}`));
    boxes[idx] = box;
    stage.append(box);
  });

  const prev = task.pages[i - 1];
  const next = task.pages[i + 1];
  const go = (p) => () => { location.hash = `#/${task.id}/${enc(p.name)}`; };

  const idsBtn = el('button', {
    onclick: () => {
      state.showIds = !state.showIds;
      stage.classList.toggle('show-ids', state.showIds);
      idsBtn.textContent = state.showIds ? 'Hide ids' : 'Show ids';
    },
  }, state.showIds ? 'Hide ids' : 'Show ids');

  const stageWrap = el('div', { class: 'stage-wrap' },
    stage,
    el('div', { class: 'stage-tools' },
      el('div', { class: 'pager' },
        el('button', { onclick: prev && go(prev), disabled: !prev }, '← Prev'),
        el('button', { onclick: () => { location.hash = `#/${task.id}`; } }, 'Gallery'),
        el('button', { onclick: next && go(next), disabled: !next }, 'Next →')),
      idsBtn));

  const inbound = task.inboundEdges[page.name] || [];

  const side = el('div', { class: 'side' },
    el('div', { class: 'panel' },
      el('h3', {}, 'Screen'),
      el('div', { class: 'panel-body' },
        el('dl', { class: 'meta-list' },
          item('page_name', el('span', { class: 'mono' }, page.name)),
          item('in dataset', page.included ? 'yes' : 'no (excluded)'),
          item('png size', `${page.w} × ${page.h}`),
          page.figma_meta && item('figma frame',
            `${page.figma_meta.figma_w} × ${page.figma_meta.figma_h} @ (${page.figma_meta.origin_x}, ${page.figma_meta.origin_y})`),
          item('index', `${i + 1} / ${task.pages.length}`))),
      el('div', { class: 'legend' },
        TYPES.filter((t) => page.annotations.some((a) => a.type === t)).map((t) =>
          el('span', { class: 'lg' },
            el('span', { class: 'sw', style: `--c:${typeColor(t)}` }),
            `${t} (${page.annotations.filter((a) => a.type === t).length})`)))),

    el('div', { class: 'panel' },
      el('h3', {}, 'Annotations', el('span', { class: 'n' }, String(page.annotations.length))),
      el('div', { class: 'ann-list' },
        page.annotations.length
          ? page.annotations.map((a, idx) => {
            const nav = a.navigateTo && task.byName[a.navigateTo.name] !== undefined ? a.navigateTo.name : null;
            const row = el('div', {
              class: 'ann-row',
              style: `--bx:${typeColor(a.type)}`,
              onmouseenter: (e) => { setActive(idx, true); showTooltip(a, task, e); },
              onmousemove: moveTooltip,
              onmouseleave: () => { setActive(idx, false); hideTooltip(); },
              onclick: () => { if (nav) { hideTooltip(); location.hash = `#/${task.id}/${enc(nav)}`; } },
            },
              el('span', { class: 'ann-idx' }, `#${a.id}`),
              el('div', { class: 'ann-main' },
                el('div', { class: 'ann-note' }, a.note || '(no note)'),
                el('div', { class: 'ann-sub' },
                  a.type,
                  a.subtype && `· ${a.subtype}`,
                  a.navigateTo && el('span', { class: 'to' }, `→ ${prettyName(a.navigateTo.name)}`))));
            rows[idx] = row;
            return row;
          })
          : el('div', { class: 'empty' }, 'No annotations on this screen.'))),

    inbound.length && el('div', { class: 'panel' },
      el('h3', {}, 'Reached from', el('span', { class: 'n' }, String(inbound.length))),
      el('div', { class: 'inbound-list' },
        inbound.map((e) =>
          el('div', {
            class: 'inbound-row',
            onclick: () => { location.hash = `#/${task.id}/${enc(e.from)}`; },
          },
            el('span', {}, prettyName(e.from)),
            el('span', { class: 'via' }, e.ann.note || `#${e.ann.id}`))))),
  );

  view.replaceChildren(el('div', { class: 'detail' }, stageWrap, side));
  scrollTo({ top: 0 });
}

const item = (k, v) => [el('dt', {}, k), el('dd', {}, v)];

function renderMissing(task, pageName) {
  setCrumbs([['Tasks', '#/'], [task.name, `#/${task.id}`]], 'Not found');
  view.replaceChildren(
    el('div', { class: 'empty' },
      el('p', {}, `No screen named "${pageName}" in task ${task.id}.`),
      el('p', {}, el('a', { href: `#/${task.id}`, style: 'color:var(--accent)' }, '← Back to gallery'))));
}

function setCrumbs(trail, current) {
  crumbs.replaceChildren(
    ...trail.flatMap(([label, href]) => [
      el('a', { href }, label),
      el('span', { class: 'chev' }, '/'),
    ]),
    el('span', { class: 'cur', title: current }, current),
  );
}

/* ---------- routing ---------- */

/** With a single published task the task-index page is noise: land on its gallery. */
const soloTask = () => (cache.index && cache.index.tasks.length === 1 ? cache.index.tasks[0].id : null);

async function route() {
  hideTooltip();
  const parts = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  try {
    await loadIndex();
    if (parts.length === 0) {
      const solo = soloTask();
      if (solo) await renderGallery(solo, true);
      else await renderIndex();
    } else if (parts.length === 1) await renderGallery(parts[0], parts[0] === soloTask());
    else await renderDetail(parts[0], parts.slice(1).join('/'));
  } catch (err) {
    view.replaceChildren(
      el('div', { class: 'empty' },
        el('p', {}, 'Could not load that route.'),
        el('p', { class: 'mono' }, String(err)),
        el('p', {}, el('a', { href: '#/', style: 'color:var(--accent)' }, '← Back to tasks'))));
  }
}

addEventListener('hashchange', route);
addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  const btns = view.querySelectorAll('.pager button');
  if (e.key === 'ArrowLeft' && btns[0] && !btns[0].disabled) btns[0].click();
  if (e.key === 'ArrowRight' && btns[2] && !btns[2].disabled) btns[2].click();
  if (e.key === 'Escape' && btns[1]) btns[1].click();
});

/* ---------- theme ---------- */

const themeBtn = document.getElementById('theme-toggle');
const applyTheme = (t) => {
  document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === 'dark' ? '☾' : '☀';
};
applyTheme(
  localStorage.getItem('mat-theme') ||
  (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
);
themeBtn.onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('mat-theme', t);
  applyTheme(t);
};

route();
