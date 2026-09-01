export const studioPreviewBehaviorCss = String.raw`:root {
  --preview-page-bg: #fbfaf7;
  --floating-action-edge: 2rem;
  --floating-action-toggle-size: 50px;
  --floating-action-comment-size: var(--floating-action-toggle-size);
  color-scheme: light dark only;
  supported-color-schemes: light dark only;
  background: var(--preview-page-bg);
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
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
}

html,
body.is-article-page,
.article-page,
.article-page .layout-with-sidebar,
.article-page .main-content {
  background: var(--preview-page-bg);
}

* {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

*::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

body {
  min-height: 100%;
  overflow: visible;
}

.toc-toggle-control {
  display: contents;
}

.toc-toggle-input {
  position: fixed;
  right: var(--preview-floating-right, var(--floating-action-edge));
  bottom: var(--preview-floating-bottom, 2rem);
  z-index: 1000;
  width: var(--floating-action-toggle-size);
  height: var(--floating-action-toggle-size);
  margin: 0;
  cursor: pointer;
  opacity: 0;
}

.sidebar-toggle {
  right: var(--preview-floating-right, var(--floating-action-edge));
  bottom: var(--preview-floating-bottom, 2rem);
}

.toc-toggle-icon-close {
  display: none;
}

.toc-toggle-input:focus-visible + .sidebar-toggle {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

@media (min-width: 769px) {
  .article-page:has(.toc-toggle-input:checked) .article-header,
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

.preview-html[data-preview-viewport='mobile'] .article-page .article-header,
.preview-html[data-preview-viewport='mobile'] .article-page .layout-with-sidebar {
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  max-width: none;
}

.preview-html[data-preview-viewport='mobile'] .article-page .article-header {
  padding-inline: 1rem;
}

.preview-html[data-preview-viewport='mobile'] .article-page .layout-with-sidebar {
  display: grid;
  margin: 0 auto;
  padding-inline: 1rem;
}

.preview-html[data-preview-viewport='mobile'] .article-page .article-content {
  max-width: 100%;
}

.preview-html[data-preview-viewport='mobile'] .article-page .article-tools {
  --article-mobile-toc-max-height: calc(
    100dvh - 88px - 1.2rem - env(safe-area-inset-top)
  );
  position: fixed;
  top: auto;
  right: var(--floating-action-edge);
  bottom: 1.2rem;
  display: block;
  width: auto;
  min-width: min(280px, calc(100vw - 2 * var(--floating-action-edge)));
  max-width: min(350px, calc(100vw - 2 * var(--floating-action-edge)));
  height: auto;
  max-height: var(--article-mobile-toc-max-height);
  padding: 0;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 20px;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  pointer-events: none;
  z-index: 998;
}

.preview-html[data-preview-viewport='mobile'] .article-page .article-tools:has(.toc-toggle-input:checked),
.preview-html[data-preview-viewport='mobile'] .article-page .article-tools.is-toc-open {
  border-color: var(--article-soft-line);
  background: rgba(251, 250, 247, 0.92);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  box-shadow: 0 18px 44px rgba(75, 64, 52, 0.14);
}

.preview-html[data-theme='dark'][data-preview-viewport='mobile'] .article-page .article-tools:has(.toc-toggle-input:checked),
.preview-html[data-theme='dark'][data-preview-viewport='mobile'] .article-page .article-tools.is-toc-open {
  background: rgba(23, 23, 22, 0.94);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.32);
}

.preview-html[data-preview-viewport='mobile'] .article-page .article-tools-actions {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  pointer-events: auto;
}

.preview-html[data-preview-viewport='mobile'] .article-page .article-tools-actions .toc-toggle-input {
  position: absolute;
  right: 0;
  bottom: 0;
}

.preview-html[data-preview-viewport='mobile'] .article-page .article-tools-actions .comment-jump-btn,
.preview-html[data-preview-viewport='mobile'] .article-page .article-tools-actions .sidebar-toggle {
  position: static;
  width: var(--floating-action-toggle-size);
  height: var(--floating-action-toggle-size);
  flex: 0 0 var(--floating-action-toggle-size);
  border: 0;
  border-radius: 12px;
  background: var(--color-bg-card);
  box-shadow: none;
  transform: none;
}

.preview-html[data-preview-viewport='mobile'] .article-page .sidebar {
  position: static;
  width: 100%;
  max-width: none;
  height: auto;
  max-height: var(--article-mobile-toc-max-height);
  align-self: end;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  transform: translateX(14px);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.preview-html[data-preview-viewport='mobile'] .article-page .article-tools:has(.toc-toggle-input:checked) .sidebar,
.preview-html[data-preview-viewport='mobile'] .article-page .article-tools.is-toc-open .sidebar,
.preview-html[data-preview-viewport='mobile'] .article-page .sidebar.active {
  transform: translateX(0);
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.preview-html[data-preview-viewport='mobile'] .article-page .toc {
  position: static;
  height: auto;
  max-height: var(--article-mobile-toc-max-height);
  overflow-y: auto;
  scrollbar-width: none;
  -webkit-mask-image: none;
  mask-image: none;
  padding: 0.9rem;
  border-radius: 0;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
}

.preview-html[data-preview-viewport='mobile'] .article-page .article-tools.is-toc-open .toc,
.preview-html[data-preview-viewport='mobile'] .article-page .article-tools.is-toc-open .toc nav,
.preview-html[data-preview-viewport='mobile'] .article-page .article-tools.is-toc-open .toc ul,
.preview-html[data-preview-viewport='mobile'] .article-page .article-tools.is-toc-open .toc li,
.preview-html[data-preview-viewport='mobile'] .article-page .article-tools.is-toc-open .toc a {
  opacity: 1;
  visibility: visible;
}

.article-page {
  color: var(--article-ink);
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
`
