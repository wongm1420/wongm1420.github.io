// Section-jump dropdown (resume.html)
document.addEventListener('click', e => {
  const nav = document.getElementById('sectionNav');
  if (nav && !nav.contains(e.target)) nav.classList.remove('open');
});

// Photo gallery lightbox (index.html)
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
 *   "essays": [
 *     { "id": "slug", "date": "Month YYYY", "title": "...", "body": "..." }
 *   ],
 *   "linkedin": [
 *     { "id": "slug", "date": "Month YYYY", "caption": "one line on what the post is about",
 *       "embedHtml": "<iframe ...>...</iframe>" }
 *   ]
 * }
 * To add a new LinkedIn post: open the post on LinkedIn, use "..." menu -> Embed this post,
 * copy the generated iframe, and paste it as embedHtml in a new object (newest first).
 * Both arrays render newest-first as given — no sorting is applied.
 */
async function loadPosts() {
  try {
    const res = await fetch('assets/data/posts.json');
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
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

  list.innerHTML = posts.slice(0, 3).map(post => `
    <li><a href="writing.html#${post.id}"><span>${post.caption}</span><span class="post-date">${post.date}</span></a></li>
  `).join('');
}

// Writing page: essays + LinkedIn embeds
async function renderWritingPage() {
  const essaysList = document.getElementById('essays-list');
  const linkedinGrid = document.getElementById('linkedin-grid');
  if (!essaysList && !linkedinGrid) return;

  const data = await loadPosts();
  const essays = (data && data.essays) || [];
  const linkedin = (data && data.linkedin) || [];

  if (essaysList) {
    essaysList.innerHTML = essays.length
      ? essays.map(e => `
        <article class="essay-card" id="${e.id}">
          <p class="essay-date">${e.date}</p>
          <h3>${e.title}</h3>
          <p>${e.body}</p>
        </article>
      `).join('')
      : '<p class="empty-state">New posts coming soon.</p>';
  }

  if (linkedinGrid) {
    linkedinGrid.innerHTML = linkedin.length
      ? linkedin.map(p => `
        <div class="linkedin-embed-card" id="${p.id}">
          ${p.embedHtml}
          <p class="embed-caption">${p.caption}</p>
        </div>
      `).join('')
      : '<p class="empty-state">Nothing shared yet. Check back soon.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderRecentPosts();
  renderWritingPage();
});
