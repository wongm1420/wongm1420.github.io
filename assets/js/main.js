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
    let res = await fetch(dataUrl(path), isPreview() ? { cache: 'no-store' } : undefined);
    // Preview: a file not on the draft branch yet falls back to the published copy
    if (!res.ok && isPreview()) res = await fetch(path);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

// ── ICONS (inline SVG, keyed by "icon" in resume.json) ──
const ICONS = {
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  education: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2.1.7 3.5 2.6 3.5 5.6"/>',
  rocket: '<path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2M12 15l-3-3a22 22 0 0 1 8-9 12 12 0 0 1 4 .1 12 12 0 0 1 .1 4 22 22 0 0 1-9 8z"/><circle cx="15" cy="9" r="1.5"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h13"/>',
  badge: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14.5-1.5 6.5 5-3 5 3-1.5-6.5"/>',
  heart: '<path d="M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'
};

function iconSvg(name) {
  const body = ICONS[name];
  return body
    ? `<svg class="icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
    : '';
}

function sectionTitleHtml(section) {
  return `<h2 class="section-title">${iconSvg(section.icon)}<span>${section.sectionTitle}</span></h2>`;
}

function blockHeadingHtml(block) {
  return `<h3 class="block-heading">${iconSvg(block.icon)}<span>${block.heading}</span></h3>`;
}

// Entries for the Resume dropdown in the header: sub-blocks of the main
// resume section first, then every other resume section.
function resumeNavItems(resume) {
  const items = [];
  (resume.sections || []).forEach(s => {
    if (s.type === 'resume') {
      (s.blocks || []).forEach(b => b.id && items.push({ id: b.id, label: b.heading }));
    } else {
      items.push({ id: s.id, label: s.sectionTitle });
    }
  });
  return items;
}

// ── HEADER + FOOTER (every page) ──
function renderChrome(site, resume) {
  if (!site) return;
  const current = location.pathname.split('/').pop() || 'index.html';

  const header = document.getElementById('header-mount');
  if (header) {
    const subItems = resume ? resumeNavItems(resume) : [];
    const navHtml = (site.nav || []).map(n => {
      const link = `<a href="${n.href}"${n.href === current ? ' aria-current="page"' : ''}>${n.label}</a>`;
      if (n.href !== 'resume.html' || !subItems.length) return `<li>${link}</li>`;
      const sub = subItems.map(i => `<li><a href="resume.html#${i.id}">${i.label}</a></li>`).join('');
      return `<li class="has-sub">${link}<button class="sub-toggle" aria-expanded="false" aria-label="Show resume sections"></button><ul class="subnav">${sub}</ul></li>`;
    }).join('');
    header.innerHTML = `<div class="header-inner">
      <a class="brand" href="index.html">${site.name}</a>
      <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="site-nav">Menu</button>
      <nav class="nav" id="site-nav" aria-label="Main"><ul class="nav-list">${navHtml}</ul></nav>
    </div>`;
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('site-nav');
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    header.querySelectorAll('.sub-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const open = btn.parentElement.classList.toggle('sub-open');
        btn.setAttribute('aria-expanded', String(open));
      });
    });
  }

  const footer = document.getElementById('footer-mount');
  if (footer) {
    const links = (site.contactLinks || []).filter(c => c.url).map(c => {
      const external = c.url.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
      return `<li><a href="${c.url}"${external}>${c.label}</a></li>`;
    }).join('');
    footer.innerHTML = `<div class="footer-inner">
      <span>&copy; ${new Date().getFullYear()} ${site.name} &middot; Hong Kong</span>
      <ul class="footer-links">${links}</ul>
    </div>`;
  }
}

// ── HOME ──
function renderPreviewCard(item) {
  const img = item.image ? `<img class="preview-card-img" src="${item.image}" alt="${item.imageAlt || ''}" loading="lazy" decoding="async" />` : '';
  return `<a class="preview-card" href="${item.link}">${img}<div class="preview-card-body"><div class="preview-card-org">${item.org}</div><h3>${item.title}</h3><p>${item.body}</p><span class="read-more">Read the full story &rarr;</span></div></a>`;
}

function renderGalleryItem(item) {
  return `<button type="button" class="gallery-item" onclick="openLightbox(this)" aria-label="Enlarge photo: ${item.alt}"><img src="${item.src}" alt="${item.alt}" loading="lazy" decoding="async" /><span class="gallery-caption">${item.caption}</span></button>`;
}

function renderHomeBlock(block) {
  switch (block.type) {
    case 'hero':
      return `<section class="hero" aria-labelledby="hero-title"><div>
          ${block.eyebrow ? `<p class="hero-eyebrow">${block.eyebrow}</p>` : ''}
          <h1 id="hero-title">${block.headline}</h1>
          ${block.lede ? `<p class="hero-lede">${block.lede}</p>` : ''}
          <div class="hero-ctas"><a class="btn primary" href="projects.html">See my projects</a><a class="btn" href="contact.html">Get in touch</a></div>
        </div>${block.portrait ? `<div class="hero-portrait"><img src="${block.portrait}" alt="${block.portraitAlt || ''}" width="800" height="1000" /></div>` : ''}</section>`;
    case 'intro':
      return `<section id="about"><p class="section-title">${block.sectionTitle}</p><div class="body-copy">${(block.paragraphs || []).map(p => `<p>${p}</p>`).join('')}</div></section>`;
    case 'photo':
      return `<div class="feature-photo"><img src="${block.src}" alt="${block.alt}" loading="lazy" decoding="async"></div>`;
    case 'projectPreview':
      return `<section id="project-preview"><p class="section-title">${block.sectionTitle}</p><div class="preview-grid">${(block.items || []).map(renderPreviewCard).join('')}</div></section>`;
    case 'recentPosts':
      return `<section id="recent-posts" hidden><p class="section-title">${block.sectionTitle}</p><ul class="recent-posts-list" id="recent-posts-list"></ul></section>`;
    case 'gallery':
      return `<section id="gallery"><p class="section-title">${block.sectionTitle}</p><div class="gallery-grid">${(block.items || []).map(renderGalleryItem).join('')}</div></section>
        <div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" onclick="closeLightbox()">
          <button type="button" class="lightbox-close" id="lightbox-close" aria-label="Close photo" onclick="closeLightbox()">&#x2715;</button>
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
  const hasHero = (home.blocks || []).some(b => b.type === 'hero');
  mount.innerHTML = (hasHero ? '' : `<div class="page-header"><h1>${home.pageTitle || 'Home'}</h1></div>`) +
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
  const companyHtml = item.companyLink
    ? `<a href="${item.companyLink}" target="_blank" rel="noopener">${item.company}</a>`
    : item.company;
  return `<div class="resume-item">
    <div class="resume-content">
      <h4>${titleHtml}</h4>
      <div class="company">${companyHtml}</div>
      ${oneLiner}
      ${bullets}
    </div>
    <span class="resume-date">${item.dateRange}</span>
  </div>`;
}

function renderResumeSection(section) {
  switch (section.type) {
    case 'resume':
      return `<section id="${section.id}">${sectionTitleHtml(section)}` +
        (section.blocks || []).map(b => `<div class="resume-block"${b.id ? ` id="${b.id}"` : ''}>${blockHeadingHtml(b)}${(b.items || []).map(renderResumeItem).join('')}</div>`).join('') +
        `</section>`;
    case 'projectsSummary':
      return `<section id="${section.id}">${sectionTitleHtml(section)}
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
      return `<section id="${section.id}">${sectionTitleHtml(section)}
        ${(section.groups || []).map(g => `
          <div class="resume-block">${blockHeadingHtml(g)}
            <ul class="awards-list">${(g.items || []).map(a => `<li><span class="award-dot"></span><div>${a.text}<span class="award-org">${a.org}</span></div></li>`).join('')}</ul>
          </div>`).join('')}
      </section>`;
    case 'publications':
      return `<section id="${section.id}">${sectionTitleHtml(section)}
        ${(section.items || []).map(pub => `
          <div class="pub-card">
            <div class="pub-meta">${(pub.meta || []).map(m => `<span>${m}</span>`).join('')}</div>
            <h3>${pub.title}</h3>
            <p>${pub.body}</p>
            <div class="pub-links">${(pub.links || []).map(l => `<a href="${l.url}" target="_blank" rel="noopener" class="pub-link ${l.style}">${l.label}</a>`).join('')}</div>
          </div>`).join('')}
      </section>`;
    case 'qualifications':
      return `<section id="${section.id}">${sectionTitleHtml(section)}
        <ul class="awards-list">${(section.items || []).map(a => `<li><span class="award-dot"></span><div>${a.text}<span class="award-org">${a.org}</span></div></li>`).join('')}</ul>
      </section>`;
    case 'volunteering':
      return `<section id="${section.id}">${sectionTitleHtml(section)}
        <div class="resume-block">${(section.items || []).map(renderResumeItem).join('')}</div>
      </section>`;
    case 'photography':
      return `<section id="${section.id}">${sectionTitleHtml(section)}
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
    `<a href="#${s.id}">${s.sectionTitle}</a>`
  ).join('');

  mount.innerHTML = `
    <div class="page-header"><h1>${resume.pageTitle || 'Resume'}</h1></div>
    <nav class="section-nav" id="sectionNav" aria-label="Resume sections"><div class="section-nav-menu">${jumpNavHtml}</div></nav>
    ${(resume.sections || []).map(renderResumeSection).join('')}
  `;
}

// ── PROJECTS ──
function renderCaseStudy(item) {
  const img = item.image ? `<img class="case-study-img" src="${item.image}" alt="${item.imageAlt || ''}" loading="lazy" decoding="async" />` : '';
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

// ── SPEAKING ──
function renderSpeakingCard(item) {
  const photo = item.image ? `<div class="speaking-media"><button type="button" class="speaking-photo" onclick="openLightbox(this)" aria-label="Enlarge photo: ${item.imageAlt || item.title}"><img src="${item.image}" alt="${item.imageAlt || ''}" loading="lazy" decoding="async" /></button></div>` : '';
  const linkList = (item.links || []).filter(l => l.url && l.label).slice(0, 3);
  const links = linkList.length ? `
        <div class="speaking-links">${linkList.map(l => `<a href="${l.url}" target="_blank" rel="noopener" class="speaking-link">${l.label}</a>`).join('')}</div>` : '';
  return `<li id="${item.id}"><article class="speaking-card${item.image ? ' has-img' : ''}">
      ${photo}
      <div class="speaking-body">
        <div class="speaking-date">${item.date}</div>
        <h2>${item.title}</h2>
        <p class="speaking-host">${item.host}</p>
        <dl class="speaking-facts">
          <div><dt>Role</dt><dd>${item.role}</dd></div>
          <div><dt>Audience</dt><dd>${item.audience}</dd></div>
        </dl>
        <p class="speaking-summary">${item.summary}</p>${links}
      </div>
    </article></li>`;
}

async function renderSpeakingPage() {
  const mount = document.getElementById('page-mount');
  if (!mount) return;
  const data = await fetchJSON('assets/data/speaking.json');
  if (!data) return;
  mount.innerHTML = `
    <div class="page-header"><h1>${data.pageTitle || 'Speaking'}</h1>${data.subhead ? `<p class="subhead">${data.subhead}</p>` : ''}</div>
    <ul class="speaking-list">${(data.items || []).map(renderSpeakingCard).join('')}</ul>
    <div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" onclick="closeLightbox()">
      <button type="button" class="lightbox-close" id="lightbox-close" aria-label="Close photo" onclick="closeLightbox()">&#x2715;</button>
      <img id="lightbox-img" src="" alt="" />
      <div class="lightbox-caption" id="lightbox-caption"></div>
    </div>
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
  lightboxCaption.textContent = caption ? caption.textContent : img.alt;
  lastFocus = el;
  document.getElementById('lightbox').classList.add('active');
  document.getElementById('lightbox-close').focus();
}
let lastFocus = null;
function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  if (!lightbox || !lightbox.classList.contains('active')) return;
  lightbox.classList.remove('active');
  if (lastFocus) lastFocus.focus();
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

async function renderPage() {
  const [site, resume] = await Promise.all([
    fetchJSON('assets/data/site.json'),
    fetchJSON('assets/data/resume.json')
  ]);
  renderChrome(site, resume);

  const page = document.body.dataset.page;
  if (page === 'home') await renderHomePage();
  else if (page === 'resume') await renderResumePage();
  else if (page === 'projects') await renderProjectsPage();
  else if (page === 'speaking') await renderSpeakingPage();
  else if (page === 'contact') await renderContactPage();
  else if (page === 'writing') await renderWritingPage();
}

document.addEventListener('DOMContentLoaded', renderPage);
