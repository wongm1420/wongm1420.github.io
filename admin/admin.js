// ============================================================
// Site Admin: edits assets/data/*.json via the GitHub API.
// All edits land on a `draft` branch first; Publish fast-forwards
// `main` to match it. See Phase 2 of the project plan for the design.
// ============================================================

const REPO = 'wongm1420/wongm1420.github.io';
const DRAFT_BRANCH = 'draft';
const MAIN_BRANCH = 'main';
const API = 'https://api.github.com';

// ── GitHub API wrapper ──
function getToken() { return localStorage.getItem('gh_pat') || ''; }
function setToken(t) { localStorage.setItem('gh_pat', t); }
function clearToken() { localStorage.removeItem('gh_pat'); }

async function ghRequest(path, method = 'GET', body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${method} ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return true;
  return res.json();
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(str) {
  return decodeURIComponent(escape(atob(str)));
}

async function ghGetFile(path, ref) {
  return ghRequest(`/repos/${REPO}/contents/${path}?ref=${encodeURIComponent(ref)}`);
}

async function ghGetJSON(path, ref) {
  const file = await ghGetFile(path, ref);
  if (!file) return null;
  return JSON.parse(base64ToUtf8(file.content));
}

async function ghPutFile(path, contentBase64, message, branch, sha) {
  return ghRequest(`/repos/${REPO}/contents/${path}`, 'PUT', {
    message, content: contentBase64, branch, sha: sha || undefined
  });
}

async function ghGetRef(branch) {
  return ghRequest(`/repos/${REPO}/git/ref/heads/${branch}`);
}

async function ghCreateRef(branch, sha) {
  return ghRequest(`/repos/${REPO}/git/refs`, 'POST', { ref: `refs/heads/${branch}`, sha });
}

async function ghUpdateRef(branch, sha, force) {
  return ghRequest(`/repos/${REPO}/git/refs/heads/${branch}`, 'PATCH', { sha, force: !!force });
}

async function ghCompare(base, head) {
  return ghRequest(`/repos/${REPO}/compare/${base}...${head}`);
}

// ── Draft branch lifecycle ──
async function ensureDraftBranch() {
  const draftRef = await ghGetRef(DRAFT_BRANCH);
  if (draftRef) return draftRef;
  const mainRef = await ghGetRef(MAIN_BRANCH);
  if (!mainRef) throw new Error('main branch not found');
  return ghCreateRef(DRAFT_BRANCH, mainRef.object.sha);
}

async function getDraftStatus() {
  const draftRef = await ghGetRef(DRAFT_BRANCH);
  if (!draftRef) return { exists: false, changedFiles: [] };
  const cmp = await ghCompare(MAIN_BRANCH, DRAFT_BRANCH);
  return { exists: true, changedFiles: (cmp && cmp.files) || [] };
}

async function publishDraft() {
  const draftRef = await ghGetRef(DRAFT_BRANCH);
  if (!draftRef) throw new Error('No draft to publish.');
  await ghUpdateRef(MAIN_BRANCH, draftRef.object.sha, false);
}

async function discardDraft() {
  const mainRef = await ghGetRef(MAIN_BRANCH);
  if (!mainRef) throw new Error('main branch not found');
  await ghUpdateRef(DRAFT_BRANCH, mainRef.object.sha, true);
}

// ── Save a content file to the draft branch ──
async function saveJSON(path, dataObj, message) {
  await ensureDraftBranch();
  const current = await ghGetFile(path, DRAFT_BRANCH);
  const content = utf8ToBase64(JSON.stringify(dataObj, null, 2) + '\n');
  await ghPutFile(path, content, message, DRAFT_BRANCH, current ? current.sha : undefined);
  await refreshDraftStatus();
}

// ── Image upload: client-side resize + commit to draft branch ──
function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function resizeImage(file, maxDim = 2000, quality = 0.82) {
  const img = await fileToImage(file);
  let { width, height } = img;
  if (Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function sanitizeFilename(name) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/-+/g, '-');
}

async function uploadImage(file, onProgress) {
  if (onProgress) onProgress('Resizing…');
  const blob = await resizeImage(file);
  const base64 = await blobToBase64(blob);
  const ext = 'jpg';
  const base = sanitizeFilename(file.name.replace(/\.[^.]+$/, ''));
  const path = `assets/images/uploads/${Date.now()}-${base}.${ext}`;
  if (onProgress) onProgress('Uploading…');
  await ensureDraftBranch();
  await ghPutFile(path, base64, `Upload image ${path}`, DRAFT_BRANCH);
  await refreshDraftStatus();
  return path;
}

// ── Tiny DOM builder ──
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

// ── Generic field renderers. Each mutates `obj[field.key]` in place. ──
function renderTextField(obj, field) {
  const input = el('input', {
    type: 'text', value: obj[field.key] || '',
    oninput: e => { obj[field.key] = e.target.value; }
  });
  return el('div', { class: 'field' }, [el('label', {}, field.label), input]);
}

function renderTextareaField(obj, field) {
  const textarea = el('textarea', { oninput: e => { obj[field.key] = e.target.value; } });
  textarea.value = obj[field.key] || '';
  return el('div', { class: 'field' }, [el('label', {}, field.label), textarea]);
}

function renderImageField(obj, field) {
  const preview = el('img', { src: obj[field.key] || '', alt: '' });
  const pathLabel = el('span', { class: 'image-path' }, obj[field.key] || '(none)');
  const fileInput = el('input', { type: 'file', accept: 'image/*' });
  const status = el('span', { class: 'hint' }, '');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    status.textContent = 'Resizing…';
    try {
      const path = await uploadImage(file, msg => { status.textContent = msg; });
      obj[field.key] = path;
      preview.src = path;
      pathLabel.textContent = path;
      status.textContent = 'Uploaded to draft.';
    } catch (err) {
      status.textContent = 'Upload failed: ' + err.message;
    }
  });
  return el('div', { class: 'field' }, [
    el('label', {}, field.label),
    el('div', { class: 'image-field' }, [preview, el('div', {}, [pathLabel, el('br'), fileInput, status])])
  ]);
}

function renderUrlField(obj, field) {
  const input = el('input', {
    type: 'text', value: obj[field.key] || '', placeholder: 'https://…',
    oninput: e => { obj[field.key] = e.target.value || (field.optional ? null : ''); }
  });
  return el('div', { class: 'field' }, [el('label', {}, field.label), input]);
}

function renderStringListField(obj, field) {
  if (!Array.isArray(obj[field.key])) obj[field.key] = [];
  const rows = el('div', {});
  function redraw() {
    rows.innerHTML = '';
    obj[field.key].forEach((val, i) => {
      const textarea = el('textarea', {
        oninput: e => { obj[field.key][i] = e.target.value; }
      });
      textarea.value = val;
      const removeBtn = el('button', {
        class: 'btn btn-ghost btn-small', type: 'button',
        onclick: () => { obj[field.key].splice(i, 1); redraw(); }
      }, 'Remove');
      rows.appendChild(el('div', { class: 'string-list-row' }, [textarea, removeBtn]));
    });
  }
  redraw();
  const addBtn = el('button', {
    class: 'btn btn-secondary btn-small add-row', type: 'button',
    onclick: () => { obj[field.key].push(''); redraw(); }
  }, '+ Add paragraph');
  return el('div', { class: 'field' }, [el('label', {}, field.label), rows, addBtn]);
}

function renderItemFields(itemObj, itemFields) {
  return itemFields.map(f => renderField(itemObj, f));
}

function renderFieldByType(obj, field) {
  switch (field.type) {
    case 'text': return renderTextField(obj, field);
    case 'textarea': return renderTextareaField(obj, field);
    case 'url': return renderUrlField(obj, field);
    case 'image': return renderImageField(obj, field);
    case 'stringList': return renderStringListField(obj, field);
    case 'list': return renderListField(obj, field);
    default: return el('div', {}, `Unsupported field type: ${field.type}`);
  }
}

function emptyItemFromFields(itemFields) {
  const item = {};
  itemFields.forEach(f => {
    if (f.type === 'stringList') item[f.key] = [];
    else if (f.type === 'list') item[f.key] = [];
    else item[f.key] = f.optional ? null : '';
  });
  return item;
}

function renderListField(obj, field) {
  if (!Array.isArray(obj[field.key])) obj[field.key] = [];
  const container = el('div', {});
  function redraw() {
    container.innerHTML = '';
    obj[field.key].forEach((item, i) => {
      const controls = el('div', { class: 'list-controls' }, [
        i > 0 ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => { swap(obj[field.key], i, i - 1); redraw(); } }, '↑') : null,
        i < obj[field.key].length - 1 ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => { swap(obj[field.key], i, i + 1); redraw(); } }, '↓') : null,
        el('button', { class: 'btn btn-danger-outline btn-small', type: 'button', onclick: () => { obj[field.key].splice(i, 1); redraw(); } }, 'Remove')
      ]);
      const block = el('div', { class: 'list-block' }, [
        el('div', { class: 'list-block-header' }, [el('strong', {}, `${field.itemLabel || 'Item'} ${i + 1}`), controls]),
        ...renderItemFields(item, field.itemFields)
      ]);
      container.appendChild(block);
    });
  }
  redraw();
  const addBtn = el('button', {
    class: 'btn btn-secondary add-row', type: 'button',
    onclick: () => { obj[field.key].push(emptyItemFromFields(field.itemFields)); redraw(); }
  }, `+ Add ${field.itemLabel || 'item'}`);
  return el('div', { class: 'field' }, [el('label', {}, field.label), container, addBtn]);
}

function swap(arr, i, j) { const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }

// A "block list" is like a list, but each item can be one of several typed shapes
// (used for Home's ordered sections and Resume's ordered sections). This is what
// lets the dashboard add/remove/reorder whole sections, not just entries within one.
function renderBlockListField(obj, field) {
  if (!Array.isArray(obj[field.key])) obj[field.key] = [];
  const container = el('div', {});
  function redraw() {
    container.innerHTML = '';
    obj[field.key].forEach((block, i) => {
      const typeFields = field.blockTypes[block.type] || [];
      const controls = el('div', { class: 'list-controls' }, [
        i > 0 ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => { swap(obj[field.key], i, i - 1); redraw(); } }, '↑') : null,
        i < obj[field.key].length - 1 ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => { swap(obj[field.key], i, i + 1); redraw(); } }, '↓') : null,
        el('button', { class: 'btn btn-danger-outline btn-small', type: 'button', onclick: () => { obj[field.key].splice(i, 1); redraw(); } }, 'Remove section')
      ]);
      container.appendChild(el('div', { class: 'list-block' }, [
        el('div', { class: 'list-block-header' }, [el('span', { class: 'type-badge' }, block.type), controls]),
        ...renderItemFields(block, typeFields)
      ]));
    });
  }
  redraw();
  const typeSelect = el('select', {}, Object.keys(field.blockTypes).map(t => el('option', { value: t }, t)));
  const addBtn = el('button', {
    class: 'btn btn-secondary add-row', type: 'button',
    onclick: () => {
      const type = typeSelect.value;
      const newBlock = { type, id: `${type}-${Date.now().toString(36)}`, ...emptyItemFromFields(field.blockTypes[type]) };
      obj[field.key].push(newBlock);
      redraw();
    }
  }, '+ Add section');
  return el('div', { class: 'field' }, [el('label', {}, field.label), container, el('div', { class: 'add-row' }, [typeSelect, addBtn])]);
}
function renderField(obj, field) {
  if (field.type === 'blockList') return renderBlockListField(obj, field);
  return renderFieldByType(obj, field);
}

// ── Reusable sub-schema for {label, url} links ──
const LINK_ITEM_FIELDS = [
  { key: 'label', label: 'Label', type: 'text' },
  { key: 'url', label: 'URL', type: 'url' }
];

// ── Content schemas ──
const SCHEMAS = {
  site: {
    label: 'Site chrome', file: 'assets/data/site.json',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'tagline', label: 'Tagline', type: 'text' },
      { key: 'headshot', label: 'Headshot photo', type: 'image' },
      { key: 'contactLinks', label: 'Sidebar contact links', type: 'list', itemLabel: 'link', itemFields: [
        { key: 'icon', label: 'Icon (emoji or short text)', type: 'text' },
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'url', label: 'URL (leave blank to show as plain text, not a link)', type: 'url', optional: true }
      ]},
      { key: 'nav', label: 'Navigation menu', type: 'list', itemLabel: 'nav item', itemFields: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'href', label: 'Page file (e.g. index.html)', type: 'text' }
      ]}
    ]
  },
  home: {
    label: 'Home', file: 'assets/data/home.json',
    fields: [
      { key: 'pageTitle', label: 'Page header', type: 'text' },
      { key: 'blocks', label: 'Sections (in order)', type: 'blockList', blockTypes: {
        intro: [
          { key: 'sectionTitle', label: 'Section title', type: 'text' },
          { key: 'paragraphs', label: 'Paragraphs', type: 'stringList' }
        ],
        photo: [
          { key: 'src', label: 'Photo', type: 'image' },
          { key: 'alt', label: 'Alt text', type: 'text' }
        ],
        projectPreview: [
          { key: 'sectionTitle', label: 'Section title', type: 'text' },
          { key: 'items', label: 'Preview cards', type: 'list', itemLabel: 'card', itemFields: [
            { key: 'org', label: 'Org / label', type: 'text' },
            { key: 'title', label: 'Title', type: 'text' },
            { key: 'body', label: 'Body', type: 'textarea' },
            { key: 'image', label: 'Photo (optional)', type: 'image', optional: true },
            { key: 'imageAlt', label: 'Photo alt text', type: 'text', optional: true },
            { key: 'link', label: 'Link (e.g. projects.html#zester)', type: 'text' }
          ]}
        ],
        recentPosts: [
          { key: 'sectionTitle', label: 'Section title', type: 'text' }
        ],
        gallery: [
          { key: 'sectionTitle', label: 'Section title', type: 'text' },
          { key: 'items', label: 'Photos', type: 'list', itemLabel: 'photo', itemFields: [
            { key: 'src', label: 'Photo', type: 'image' },
            { key: 'alt', label: 'Alt text', type: 'text' },
            { key: 'caption', label: 'Caption', type: 'text' }
          ]}
        ]
      }}
    ]
  },
  resume: {
    label: 'Resume', file: 'assets/data/resume.json',
    fields: [
      { key: 'pageTitle', label: 'Page header', type: 'text' },
      { key: 'sections', label: 'Sections (in order)', type: 'blockList', blockTypes: {
        resume: [
          { key: 'sectionTitle', label: 'Section title', type: 'text' },
          { key: 'blocks', label: 'Sub-sections (Education, Experience, …)', type: 'list', itemLabel: 'sub-section', itemFields: [
            { key: 'heading', label: 'Heading', type: 'text' },
            { key: 'items', label: 'Entries', type: 'list', itemLabel: 'entry', itemFields: [
              { key: 'dateRange', label: 'Dates', type: 'text' },
              { key: 'title', label: 'Title', type: 'text' },
              { key: 'titleLink', label: 'Title link (optional)', type: 'url', optional: true },
              { key: 'company', label: 'Company / school', type: 'text' },
              { key: 'oneLiner', label: 'One-liner (optional)', type: 'textarea', optional: true },
              { key: 'bullets', label: 'Bullets', type: 'stringList' }
            ]}
          ]}
        ],
        projectsSummary: [
          { key: 'sectionTitle', label: 'Section title', type: 'text' },
          { key: 'note', label: 'Note (below the title)', type: 'text' },
          { key: 'items', label: 'Projects', type: 'list', itemLabel: 'project', itemFields: [
            { key: 'dateRange', label: 'Dates', type: 'text' },
            { key: 'org', label: 'Org', type: 'text' },
            { key: 'title', label: 'Title', type: 'text' },
            { key: 'role', label: 'Role', type: 'text' },
            { key: 'body', label: 'Body', type: 'textarea' },
            { key: 'bullets', label: 'Bullets', type: 'stringList' }
          ]}
        ],
        awards: [
          { key: 'sectionTitle', label: 'Section title', type: 'text' },
          { key: 'groups', label: 'Groups', type: 'list', itemLabel: 'group', itemFields: [
            { key: 'heading', label: 'Group heading', type: 'text' },
            { key: 'items', label: 'Awards', type: 'list', itemLabel: 'award', itemFields: [
              { key: 'text', label: 'Award text', type: 'text' },
              { key: 'org', label: 'Org / date', type: 'text' }
            ]}
          ]}
        ],
        publications: [
          { key: 'sectionTitle', label: 'Section title', type: 'text' },
          { key: 'items', label: 'Publications', type: 'list', itemLabel: 'publication', itemFields: [
            { key: 'meta', label: 'Meta line items', type: 'stringList' },
            { key: 'title', label: 'Title', type: 'text' },
            { key: 'body', label: 'Body', type: 'textarea' },
            { key: 'links', label: 'Links', type: 'list', itemLabel: 'link', itemFields: [
              { key: 'label', label: 'Label', type: 'text' },
              { key: 'url', label: 'URL', type: 'url' },
              { key: 'style', label: 'Style (primary or secondary)', type: 'text' }
            ]}
          ]}
        ],
        qualifications: [
          { key: 'sectionTitle', label: 'Section title', type: 'text' },
          { key: 'items', label: 'Qualifications', type: 'list', itemLabel: 'qualification', itemFields: [
            { key: 'text', label: 'Text', type: 'text' },
            { key: 'org', label: 'Org / date', type: 'text' }
          ]}
        ],
        volunteering: [
          { key: 'sectionTitle', label: 'Section title', type: 'text' },
          { key: 'items', label: 'Entries', type: 'list', itemLabel: 'entry', itemFields: [
            { key: 'dateRange', label: 'Dates', type: 'text' },
            { key: 'title', label: 'Title', type: 'text' },
            { key: 'company', label: 'Organisation', type: 'text' },
            { key: 'oneLiner', label: 'One-liner (optional)', type: 'textarea', optional: true },
            { key: 'bullets', label: 'Bullets', type: 'stringList' }
          ]}
        ],
        photography: [
          { key: 'sectionTitle', label: 'Section title', type: 'text' },
          { key: 'heading', label: 'Heading', type: 'text' },
          { key: 'body', label: 'Body', type: 'textarea' },
          { key: 'links', label: 'Links', type: 'list', itemLabel: 'link', itemFields: LINK_ITEM_FIELDS }
        ]
      }}
    ]
  },
  projects: {
    label: 'Projects', file: 'assets/data/projects.json',
    fields: [
      { key: 'pageTitle', label: 'Page header', type: 'text' },
      { key: 'subhead', label: 'Subheading', type: 'text' },
      { key: 'items', label: 'Case studies', type: 'list', itemLabel: 'project', itemFields: [
        { key: 'id', label: 'ID (used in links, e.g. zester)', type: 'text' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'dateRange', label: 'Dates', type: 'text' },
        { key: 'org', label: 'Org', type: 'text' },
        { key: 'role', label: 'Role', type: 'text' },
        { key: 'image', label: 'Photo (optional)', type: 'image', optional: true },
        { key: 'imageAlt', label: 'Photo alt text', type: 'text', optional: true },
        { key: 'fields', label: 'Case study fields', type: 'list', itemLabel: 'field', itemFields: [
          { key: 'label', label: 'Field label (e.g. "What it was")', type: 'text' },
          { key: 'body', label: 'Body', type: 'textarea' }
        ]},
        { key: 'links', label: 'External links', type: 'list', itemLabel: 'link', itemFields: LINK_ITEM_FIELDS }
      ]}
    ]
  },
  contact: {
    label: 'Contact', file: 'assets/data/contact.json',
    fields: [
      { key: 'pageTitle', label: 'Page header', type: 'text' },
      { key: 'subhead', label: 'Subheading', type: 'text' },
      { key: 'links', label: 'Links', type: 'list', itemLabel: 'link', itemFields: [
        { key: 'icon', label: 'Icon (emoji or short text)', type: 'text' },
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'url', label: 'URL', type: 'url' }
      ]}
    ]
  },
  writing: {
    label: 'Writing', file: 'assets/data/posts.json',
    fields: [
      { key: 'pageTitle', label: 'Page header', type: 'text' },
      { key: 'essaysSectionTitle', label: '"Writing" section title', type: 'text' },
      { key: 'linkedinSectionTitle', label: '"From LinkedIn" section title', type: 'text' },
      { key: 'essays', label: 'Your own posts', type: 'list', itemLabel: 'post', itemFields: [
        { key: 'id', label: 'ID (used in links)', type: 'text' },
        { key: 'date', label: 'Date (e.g. "June 2026")', type: 'text' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'body', label: 'Body', type: 'textarea' }
      ]},
      { key: 'linkedin', label: 'LinkedIn posts', type: 'list', itemLabel: 'post', itemFields: [
        { key: 'id', label: 'ID (used in links)', type: 'text' },
        { key: 'date', label: 'Date (e.g. "June 2026")', type: 'text' },
        { key: 'caption', label: 'Caption', type: 'text' },
        { key: 'embedHtml', label: 'LinkedIn embed code (from "Embed this post")', type: 'textarea' }
      ]}
    ]
  }
};

// ── Tabs / page load-save flow ──
let activeTab = 'home';

async function loadTab(tabKey) {
  activeTab = tabKey;
  document.querySelectorAll('#app-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabKey));

  const schema = SCHEMAS[tabKey];
  const main = document.getElementById('app-main');
  main.innerHTML = '';
  main.appendChild(el('p', { class: 'loading' }, 'Loading…'));

  await ensureDraftBranch();
  const data = await ghGetJSON(schema.file, DRAFT_BRANCH);
  if (data === null) {
    main.innerHTML = '';
    main.appendChild(el('p', { class: 'error-text' }, `Could not load ${schema.file}.`));
    return;
  }

  main.innerHTML = '';
  const card = el('div', { class: 'section-card' }, [
    el('h2', {}, schema.label),
    ...schema.fields.map(f => renderField(data, f))
  ]);

  const status = el('span', { class: 'save-status' }, '');
  const saveBtn = el('button', {
    class: 'btn btn-primary', type: 'button',
    onclick: async () => {
      saveBtn.disabled = true;
      status.textContent = 'Saving to draft…';
      status.classList.remove('ok');
      try {
        await saveJSON(schema.file, data, `Edit ${schema.label} via admin`);
        status.textContent = 'Saved to draft.';
        status.classList.add('ok');
      } catch (err) {
        status.textContent = 'Save failed: ' + err.message;
      } finally {
        saveBtn.disabled = false;
      }
    }
  }, 'Save to draft');

  main.appendChild(card);
  main.appendChild(el('div', { class: 'save-bar' }, [saveBtn, status]));
}

function buildNav() {
  const nav = document.getElementById('app-nav');
  nav.innerHTML = '';
  Object.entries(SCHEMAS).forEach(([key, schema]) => {
    nav.appendChild(el('button', { 'data-tab': key, onclick: () => loadTab(key) }, schema.label));
  });
}

// ── Draft status bar + publish/discard/preview ──
async function refreshDraftStatus() {
  const statusEl = document.getElementById('draft-status');
  statusEl.textContent = 'checking draft…';
  try {
    const status = await getDraftStatus();
    if (!status.exists || status.changedFiles.length === 0) {
      statusEl.textContent = 'No pending changes';
      statusEl.classList.remove('dirty');
    } else {
      statusEl.textContent = `${status.changedFiles.length} file(s) changed, not yet published`;
      statusEl.classList.add('dirty');
    }
  } catch (err) {
    statusEl.textContent = 'Could not check draft status';
  }
}

function wireHeaderButtons() {
  document.getElementById('btn-preview').addEventListener('click', () => {
    const page = { home: 'index.html', resume: 'resume.html', projects: 'projects.html', contact: 'contact.html', writing: 'writing.html', site: 'index.html' }[activeTab] || 'index.html';
    window.open(`../${page}?preview=draft`, '_blank');
  });

  document.getElementById('btn-publish').addEventListener('click', async () => {
    if (!confirm('Publish the draft? This makes every staged change live on wongm1420.github.io.')) return;
    try {
      await publishDraft();
      await refreshDraftStatus();
      alert('Published. Give GitHub Pages a minute to redeploy.');
    } catch (err) {
      alert('Publish failed: ' + err.message);
    }
  });

  document.getElementById('btn-discard').addEventListener('click', async () => {
    if (!confirm('Discard the draft? This throws away every unpublished change.')) return;
    try {
      await discardDraft();
      await refreshDraftStatus();
      if (activeTab) loadTab(activeTab);
      alert('Draft discarded.');
    } catch (err) {
      alert('Discard failed: ' + err.message);
    }
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    clearToken();
    location.reload();
  });
}

// ── Auth / bootstrap ──
async function tryLogin(token) {
  setToken(token);
  try {
    const me = await ghRequest(`/repos/${REPO}`);
    if (!me) throw new Error('Repo not found or token lacks access.');
  } catch (err) {
    clearToken();
    throw err;
  }
}

async function boot() {
  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('app');
  const existingToken = getToken();

  if (existingToken) {
    loginScreen.hidden = true;
    app.hidden = false;
    buildNav();
    wireHeaderButtons();
    await refreshDraftStatus();
    await loadTab('home');
    document.querySelector('#app-nav button[data-tab="home"]').classList.add('active');
    return;
  }

  document.getElementById('token-submit').addEventListener('click', async () => {
    const input = document.getElementById('token-input');
    const errorEl = document.getElementById('login-error');
    errorEl.hidden = true;
    try {
      await tryLogin(input.value.trim());
      location.reload();
    } catch (err) {
      errorEl.textContent = 'Could not authenticate: ' + err.message;
      errorEl.hidden = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', boot);
