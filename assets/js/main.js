/**
 * Data-driven rendering for the whole site.
 * Every page fetches JSON from assets/data/*.json and renders itself from it —
 * the same pattern originally used just for the Writing page's posts.json,
 * now used everywhere so the admin dashboard (see /admin) can add, remove,
 * and reorder whole sections just by editing arrays, no HTML edits needed.
 *
 * Preview mode: append ?preview=draft to any page URL and every fetch below
 * pulls from the `draft` branch on GitHub instead of the local file, so the
 * admin's "Preview draft" button can show real pending edits before publish.
 */

const REPO = 'wongm1420/wongm1420.github.io';
const DRAFT_BRANCH = 'draft';

function isPreview() {
  return new URLSearchParams(location.search).get('preview') === 'draft';
}

function dataUrl(path) {
  if (isPreview()) {
    return `https://raw.githubusercontent.com/${REPO}/${DRAFT_BRANCH}/${path}?_=${Date.now()}`;
  }
  return path;
}

async function fetchJSON(path) {
  try {
    const res = await fetch(dataUrl(path), isPreview() ? { cache: 'no-store' } : undefined);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

// ── SIDEBAR (every page) ──
function renderSidebar(site) {
  const mount = document.getElementById('sidebar-mount');
  if (!mount || !site) return;
  const current = location.pathname.split('/').pop() || 'index.html';

  const contactHtml = (site.contactLinks || []).map(c => {
    if (c.url) {
      const external = c.url.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
      return `<li><a href="${c.url}"${external}><span class="icon">${c.icon}</span>${c.label}</a></li>`;
    }
    return `<li><span class="static"><span class="icon">${c.icon}</span>${c.label}</span></li>`;
  }).join('');

  const navHtml = (site.nav || []).map(n =>
    `<li><a href="${n.href}"${n.href === current ? ' class="active"' : ''}>${n.label}</a></li>`
  ).join('');

  mount.innerHTML = `
    <img src="${site.headshot}" alt="${site.name}" class="sidebar-photo" />
    <h1>${site.name}</h1>
    <p class="tagline">${site.tagline}</p>
    <ul class="contact-list">${contactHtml}</ul>
    <nav class="sidebar-nav"><ul>${navHtml}</ul></nav>
  `;
}

// ── HOME ──
function renderPreviewCard(item) {
  const img = item.image ? `<img class="preview-card-img" src="${item.image}" alt="${item.imageAlt || ''}" />` : '';
  return `<a class="preview-card" href="${item.link}">${img}<div class="preview-card-body"><div class="preview-card-org">${item.org}</div><h3>${item.title}</h3><p>${item.body}</p><span class="read-more">Read the full story &rarr;</span></div></a>`;
}

function renderGalleryItem(item) {
  return `<div class="gallery-item" onclick="openLightbox(this)"><img src="${item.src}" alt="${item.alt}" /><div class="gallery-caption">${item.caption}</div></div>`;
}

function renderHomeBlock(block) {
  switch (block.type) {
    case 'intro':
      return `<section id="about"><p class="section-title">${block.sectionTitle}</p><div class="body-copy">${(block.paragraphs || []).map(p => `<p>${p}</p>`).join('')}</div></section>`;
    case 'photo':
      return `<div class="feature-photo"><img src="${block.src}" alt="${block.alt}"></div>`;
    case 'projectPreview':
      return `<section id="project-preview"><p class="section-title">${block.sectionTitle}</p><div class="preview-grid">${(block.items || []).map(renderPreviewCard).join('')}</div></section>`;
    case 'recentPosts':
      return `<section id="recent-posts" hidden><p class="section-title">${block.sectionTitle}</p><ul class="recent-posts-list" id="recent-posts-list"></ul></section>`;
    case 'gallery':
      return `<section id="gallery"><p class="section-title">${block.sectionTitle}</p><div class="gallery-grid">${(block.items || []).map(renderGalleryItem).join('')}</div></section>
        <div class="lightbox" id="lightbox" onclick="closeLightbox()">
          <button class="lightbox-close" onclick="closeLightbox()">&#x2715;</button>
          <img id="lightbox-img" src="" alt="" />
          <div class="lightbox-caption" id="lightbox-caption"></div>
        </div>`;
    default:
      return '';
  }
}

async function renderHomePage() {
  const mount = document.getElementById('page-mount');
  if (!mount) return;
  const home = await fetchJSON('assets/data/home.json');
  if (!home) return;
  mount.innerHTML = `<div class="page-header"><h1>${home.pageTitle || 'Home'}</h1></div>` +
    (home.blocks || []).map(renderHomeBlock).join('');
  await renderRecentPosts();
}

// ── RESUME ──
function renderResumeItem(item) {
  const titleHtml = item.titleLink
    ? `<a href="${item.titleLink}" target="_blank" rel="noopener">${item.title}</a>`
    : item.title;
  const bullets = (item.bullets || []).length
    ? `<ul>${item.bullets.map(b => `<li>${b}</li>`).join('')}</ul>` : '';
  const oneLiner = item.oneLiner ? `<p class="one-liner">${item.oneLiner}</p>` : '';
  return `<div class="resume-item">
    <span class="resume-date">${item.dateRange}</span>
    <div class="resume-content">
      <h4>${titleHtml}</h4>
      <div class="company">${item.company}</div>
      ${oneLiner}
      ${bullets}
    </div>
  </div>`;
}

function renderResumeSection(section) {
  switch (section.type) {
    case 'resume':
      return `<section id="${section.id}"><p class="section-title">${section.sectionTitle}</p>` +
        (section.blocks || []).map(b => `<div class="resume-block"><h3>${b.heading}</h3>${(b.items || []).map(renderResumeItem).join('')}</div>`).join('') +
        `</section>`;
    case 'projectsSummary':
      return `<section id="${section.id}"><p class="section-title">${section.sectionTitle}</p>
        ${section.note ? `<p style="font-size:0.85rem; color:var(--muted); margin-bottom:20px;">${section.note}</p>` : ''}
        ${(section.items || []).map(p => `
          <div class="project-card">
            <div class="project-meta"><span class="project-date">${p.dateRange}</span><span>${p.org}</span></div>
            <h3>${p.title}</h3>
            <div class="project-org">${p.role}</div>
            <p>${p.body}</p>
            <ul>${(p.bullets || []).map(b => `<li>${b}</li>`).join('')}</ul>
          </div>`).join('')}
      </section>`;
    case 'awards':
      return `<section id="${section.id}"><p class="section-title">${section.sectionTitle}</p>
        ${(section.groups || []).map(g => `
          <div class="resume-block"><h3>${g.heading}</h3>
            <ul class="awards-list">${(g.items || []).map(a => `<li><span class="award-dot"></span><div>${a.text}<span class="award-org">${a.org}</span></div></li>`).join('')}</ul>
          </div>`).join('')}
      </section>`;
    case 'publications':
      return `<section id="${section.id}"><p class="section-title">${section.sectionTitle}</p>
        ${(section.items || []).map(pub => `
          <div class="pub-card">
            <div class="pub-meta">${(pub.meta || []).map(m => `<span>${m}</span>`).join('')}</div>
            <h3>${pub.title}</h3>
            <p>${pub.body}</p>
            <div class="pub-links">${(pub.links || []).map(l => `<a href="${l.url}" target="_blank" rel="noopener" class="pub-link ${l.style}">${l.label}</a>`).join('')}</div>
          </div>`).join('')}
      </section>`;
    case 'qualifications':
      return `<section id="${section.id}"><p class="section-title">${section.sectionTitle}</p>
        <ul class="awards-list">${(section.items || []).map(a => `<li><span class="award-dot"></span><div>${a.text}<span class="award-org">${a.org}</span></div></li>`).join('')}</ul>
      </section>`;
    case 'volunteering':
      return `<section id="${section.id}"><p class="section-title">${section.sectionTitle}</p>
        <div class="resume-block">${(section.items || []).map(renderResumeItem).join('')}</div>
      </section>`;
    case 'photography':
      return `<section id="${section.id}"><p class="section-title">${section.sectionTitle}</p>
        <div class="photo-section">
          <div><h3>${section.heading}</h3><p>${section.body}</p></div>
          <div>${(section.links || []).map(l => `<a href="${l.url}" target="_blank" rel="noopener" class="photo-link">${l.label}</a>`).join(' ')}</div>
        </div>
      </section>`;
    default:
      return '';
  }
}

async function renderResumePage() {
  const mount = document.getElementById('page-mount');
  if (!mount) return;
  const resume = await fetchJSON('assets/data/resume.json');
  if (!resume) return;

  const jumpNavHtml = (resume.sections || []).map(s =>
    `<a href="#${s.id}" onclick="document.getElementById('sectionNav').classList.remove('open')">${s.sectionTitle}</a>`
  ).join('');

  mount.innerHTML = `
    <div class="page-header"><h1>${resume.pageTitle || 'Resume'}</h1></div>
    <div class="section-nav" id="sectionNav">
      <button class="section-nav-btn" onclick="document.getElementById('sectionNav').classList.toggle('open')">
        Jump to section <span class="chevron">&#9662;</span>
      </button>
      <div class="section-nav-menu">${jumpNavHtml}</div>
    </div>
    ${(resume.sections || []).map(renderResumeSection).join('')}
  `;
}

// ── PROJECTS ──
function renderCaseStudy(item) {
  const img = item.image ? `<img class="case-study-img" src="${item.image}" alt="${item.imageAlt || ''}" />` : '';
  return `<section id="${item.id}">
    <article class="case-study">
      ${img}
      <div class="case-study-body">
        <div class="case-study-meta">${item.dateRange} <span class="dot">&middot;</span> ${item.org}</div>
        <h2>${item.title}</h2>
        <div class="role">${item.role}</div>
        <div class="case-study-grid">
          ${(item.fields || []).map(f => `<div class="case-study-field"><h4>${f.label}</h4><p>${f.body}</p></div>`).join('')}
        </div>
      </div>
    </article>
  </section>`;
}

async function renderProjectsPage() {
  const mount = document.getElementById('page-mount');
  if (!mount) return;
  const data = await fetchJSON('assets/data/projects.json');
  if (!data) return;
  mount.innerHTML = `
    <div class="page-header"><h1>${data.pageTitle || 'Projects'}</h1>${data.subhead ? `<p class="subhead">${data.subhead}</p>` : ''}</div>
    ${(data.items || []).map(renderCaseStudy).join('')}
  `;
}

// ── CONTACT ──
async function renderContactPage() {
  const mount = document.getElementById('page-mount');
  if (!mount) return;
  const data = await fetchJSON('assets/data/contact.json');
  if (!data) return;
  mount.innerHTML = `
    <div class="page-header"><h1>${data.pageTitle || 'Contact'}</h1>${data.subhead ? `<p class="subhead">${data.subhead}</p>` : ''}</div>
    <section id="contact-links">
      <ul class="contact-page-list">
        ${(data.links || []).map(l => `<li><a href="${l.url}"><span class="icon">${l.icon}</span>${l.label}</a></li>`).join('')}
      </ul>
    </section>
  `;
}

// Photo gallery lightbox (Home)
function openLightbox(el) {
  const img = el.querySelector('img');
  const caption = el.querySelector('.gallery-caption');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCaption = document.getElementById('lightbox-caption');
  if (!lightboxImg) return;
  lightboxImg.src = img.src;
  lightboxImg.alt = img.alt;
  lightboxCaption.textContent = caption ? caption.textContent : '';
  document.getElementById('lightbox').classList.add('active');
}
function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  if (lightbox) lightbox.classList.remove('active');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

/**
 * assets/data/posts.json schema:
 * {
 *   "pageTitle": "Writing", "essaysSectionTitle": "...", "linkedinSectionTitle": "...",
 *   "essays": [ { "id": "slug", "date": "Month YYYY", "title": "...", "body": "..." } ],
 *   "linkedin": [ { "id": "slug", "date": "Month YYYY", "caption": "one line on what the post is about",
 *     "embedHtml": "<iframe ...>...</iframe>" } ]
 * }
 * To add a new LinkedIn post: open the post on LinkedIn, use "..." menu -> Embed this post,
 * copy the generated iframe, and paste it as embedHtml in a new object (newest first).
 * Both arrays render newest-first as given — no sorting is applied.
 * (In practice, edit this through /admin rather than by hand.)
 */
async function loadPosts() {
  return fetchJSON('assets/data/posts.json');
}

// Home page: recent posts strip (up to 3 latest LinkedIn posts)
async function renderRecentPosts() {
  const section = document.getElementById('recent-posts');
  const list = document.getElementById('recent-posts-list');
  if (!section || !list) return;

  const data = await loadPosts();
  const posts = (data && data.linkedin) || [];

  if (posts.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  list.innerHTML = posts.slice(0, 3).map(post => `
    <li><a href="writing.html#${post.id}"><span>${post.caption}</span><span class="post-date">${post.date}</span></a></li>
  `).join('');
}

// Writing page: essays + LinkedIn embeds
async function renderWritingPage() {
  const mount = document.getElementById('page-mount');
  if (!mount) return;

  const data = await loadPosts();
  if (!data) return;
  const essays = data.essays || [];
  const linkedin = data.linkedin || [];

  mount.innerHTML = `
    <div class="page-header"><h1>${data.pageTitle || 'Writing'}</h1></div>
    <section id="essays">
      <p class="section-title">${data.essaysSectionTitle || 'Writing'}</p>
      <div id="essays-list">
        ${essays.length
          ? essays.map(e => `<article class="essay-card" id="${e.id}"><p class="essay-date">${e.date}</p><h3>${e.title}</h3><p>${e.body}</p></article>`).join('')
          : '<p class="empty-state">New posts coming soon.</p>'}
      </div>
    </section>
    <section id="from-linkedin">
      <p class="section-title">${data.linkedinSectionTitle || 'From LinkedIn'}</p>
      <div class="linkedin-grid" id="linkedin-grid">
        ${linkedin.length
          ? linkedin.map(p => `<div class="linkedin-embed-card" id="${p.id}">${p.embedHtml}<p class="embed-caption">${p.caption}</p></div>`).join('')
          : '<p class="empty-state">Nothing shared yet. Check back soon.</p>'}
      </div>
    </section>
  `;
}

// Resume section-jump dropdown: close when clicking outside it
document.addEventListener('click', e => {
  const nav = document.getElementById('sectionNav');
  if (nav && !nav.contains(e.target)) nav.classList.remove('open');
});

async function renderPage() {
  const site = await fetchJSON('assets/data/site.json');
  renderSidebar(site);

  const page = document.body.dataset.page;
  if (page === 'home') await renderHomePage();
  else if (page === 'resume') await renderResumePage();
  else if (page === 'projects') await renderProjectsPage();
  else if (page === 'contact') await renderContactPage();
  else if (page === 'writing') await renderWritingPage();
}

document.addEventListener('DOMContentLoaded', renderPage);
