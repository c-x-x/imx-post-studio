export const previewOverridesCss = String.raw`:root {
  --preview-page-bg: #fbfaf7;
  color-scheme: light;
  background: var(--preview-page-bg);
}

:root[data-theme='dark'] {
  --preview-page-bg: #151513;
  --article-ink: #e3dcd2;
  --article-ink-strong: #f5f0e8;
  --article-ink-secondary: #d8d0c5;
  --article-ink-muted: #b7aea2;
  --preview-toc-ink: #c8bfb3;
  --color-accent: #d8b98a;
  --color-bg-card: #22211e;
  --color-bg-soft: #201f1c;
  color-scheme: dark;
}

html,
body,
.article-page,
.article-page .layout-with-sidebar,
.article-page .main-content {
  background: var(--preview-page-bg);
}

body {
  min-height: 100%;
}

.article-page {
  color: var(--article-ink);
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

:root[data-theme='dark'] .article-page .article-title,
:root[data-theme='dark'] .article-page .article-content h1,
:root[data-theme='dark'] .article-page .article-content h2,
:root[data-theme='dark'] .article-page .article-content h3,
:root[data-theme='dark'] .article-page .article-content strong {
  color: var(--article-ink-strong);
}

:root[data-theme='dark'] .article-page .article-content,
:root[data-theme='dark'] .article-page .article-content p,
:root[data-theme='dark'] .article-page .article-content li {
  color: var(--article-ink);
}

:root[data-theme='dark'] .article-page .article-meta,
:root[data-theme='dark'] .article-page .article-tags {
  color: var(--article-ink-muted);
}

:root[data-theme='dark'] .article-page .toc a {
  color: var(--preview-toc-ink);
  opacity: 1;
}

:root[data-theme='dark'] .article-page blockquote {
  color: var(--article-ink-secondary);
  background: #22211e;
}

:root[data-theme='dark'] .article-page pre,
:root[data-theme='dark'] .article-page code {
  background: #201f1c;
}`
