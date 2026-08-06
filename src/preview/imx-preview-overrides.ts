export const previewOverridesCss = String.raw`:root {
  --preview-page-bg: #fbfaf7;
  --floating-action-edge: 2rem;
  --floating-action-toggle-size: 50px;
  --floating-action-comment-size: var(--floating-action-toggle-size);
  color-scheme: light;
  background: var(--preview-page-bg);
}

@media (max-width: 768px) {
  :root {
    --floating-action-edge: 1rem;
    --floating-action-toggle-size: 46px;
    --floating-action-comment-size: var(--floating-action-toggle-size);
  }
}

:root[data-theme='dark'] {
  --preview-page-bg: #171716;
  color-scheme: dark;
}

html,
body.is-article-page,
.article-page,
.article-page .layout-with-sidebar,
.article-page .main-content {
  background: var(--preview-page-bg);
}

html {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

body {
  min-height: 100%;
}

.toc-toggle-control {
  display: contents;
}

.toc-toggle-input {
  position: fixed;
  right: var(--floating-action-edge);
  bottom: 2rem;
  z-index: 1000;
  width: var(--floating-action-toggle-size);
  height: var(--floating-action-toggle-size);
  margin: 0;
  cursor: pointer;
  opacity: 0;
}

.toc-toggle-icon-close {
  display: none;
}

.toc-toggle-input:focus-visible + .sidebar-toggle {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

@media (min-width: 769px) {
  .article-page:has(.toc-toggle-input:checked) .layout-with-sidebar {
    grid-template-columns: minmax(0, var(--article-measure));
    width: min(var(--article-measure), calc(100vw - 3rem));
    gap: 0;
  }

  .article-page:has(.toc-toggle-input:checked) .sidebar {
    display: none;
  }

  .toc-toggle-input:not(:checked) + .sidebar-toggle .toc-toggle-icon-menu,
  .toc-toggle-input:checked + .sidebar-toggle .toc-toggle-icon-close {
    display: none;
  }

  .toc-toggle-input:not(:checked) + .sidebar-toggle .toc-toggle-icon-close,
  .toc-toggle-input:checked + .sidebar-toggle .toc-toggle-icon-menu {
    display: block;
  }
}

@media (max-width: 768px) {
  .article-page .article-tools:has(.toc-toggle-input:checked) {
    border-color: var(--article-soft-line);
    background: rgba(251, 250, 247, 0.92);
    backdrop-filter: blur(18px) saturate(150%);
    -webkit-backdrop-filter: blur(18px) saturate(150%);
    box-shadow: 0 18px 44px rgba(75, 64, 52, 0.14);
  }

  :root[data-theme='dark'] .article-page .article-tools:has(.toc-toggle-input:checked) {
    background: rgba(23, 23, 22, 0.94);
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.32);
  }

  .article-page .article-tools:has(.toc-toggle-input:checked) .sidebar {
    transform: translateX(0);
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  .article-page .article-tools-actions .toc-toggle-input {
    position: absolute;
    right: 0;
    bottom: 0;
  }

  .toc-toggle-input:checked + .sidebar-toggle {
    background: rgba(var(--article-accent-rgb), 0.1);
    color: var(--article-ink);
  }

  .toc-toggle-input:checked + .sidebar-toggle .toc-toggle-icon-menu,
  .toc-toggle-input:not(:checked) + .sidebar-toggle .toc-toggle-icon-close {
    display: none;
  }

  .toc-toggle-input:checked + .sidebar-toggle .toc-toggle-icon-close,
  .toc-toggle-input:not(:checked) + .sidebar-toggle .toc-toggle-icon-menu {
    display: block;
  }
}

.article-page {
  color: var(--article-ink);
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
`
