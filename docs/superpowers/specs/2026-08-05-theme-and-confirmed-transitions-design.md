# Studio Theme and Confirmed Transitions Design

## Goal

Improve the Studio shell without changing its local-only storage model:

- replace the home hero title with “文字是时间里的不死鸟”;
- replace the non-interactive “本地处理” label with an application theme toggle outside the article workspace;
- make the Dock brand return to the home view;
- require an explicit save, discard, or cancel decision before returning home or creating a new article.

## Navigation and confirmation flow

`App` owns one accessible confirmation dialog and one pending intent: `home` or `new`.

When the article workspace is active, clicking the Dock home action, the Dock brand, or “新建文章” always opens the dialog, including for an untouched blank article. The dialog offers:

1. **保存到草稿库并继续** — persist the latest reducer snapshot, then execute the pending intent;
2. **不保存并继续** — execute the pending intent without writing the current snapshot;
3. **取消** — close the dialog and keep the current article unchanged.

Saving is revision-safe: if the draft changes while a save is pending, the newest snapshot is persisted before navigation. A save failure keeps the dialog and current article open and exposes the existing recovery path. Repeated clicks cannot start overlapping transitions.

Non-workspace navigation remains immediate. Opening the draft library and opening/importing another saved article keep the existing safe-transition behavior.

## Brand interaction

The IMX logo and “IMX Post Studio” title form one semantic button with an accessible name. It uses the same home intent as the Dock home item, so both entry points have identical save/discard/cancel behavior and focus recovery.

## Application theme

The Studio application theme is independent from the full-screen article preview theme.

- On first visit, use `prefers-color-scheme`.
- After a manual change, persist `light` or `dark` in `localStorage` and restore it before normal interaction.
- Apply the choice through `data-theme` on the document root.
- Show one icon button in the Dock actions area on the home and draft-library views.
- Do not show the application theme button in the article workspace; that position continues to contain only “预览文章”.
- The button label and title describe the action (“切换到深色主题” or “切换到浅色主题”), and its icon changes between sun and moon.

Dark mode covers the Studio background, Dock glass, cards, forms, editor, notifications, and dialogs. It does not alter the exported article or the preview iframe’s independent light/dark controls.

## Home copy

Replace only the home hero heading “为 IMX 写作，也只在本地处理” with “文字是时间里的不死鸟”. Supporting copy and project explanation remain unchanged.

## Components

- `App`: pending intent, confirmation orchestration, safe save/discard execution, and application-theme state.
- `ImxDock`: clickable brand and conditional theme/preview action.
- `TransitionConfirmDialog`: focused three-choice confirmation UI using `AccessibleDialog`.
- `theme-preference`: read, resolve, apply, toggle, and persist application theme without coupling it to preview rendering.

## Verification

Automated coverage must prove:

- the new hero text is rendered;
- the theme toggle appears only outside the workspace, changes `data-theme`, and persists the choice;
- brand and home navigation share the same dialog behavior;
- each new-article request opens the dialog, including for an untouched blank article;
- save, discard, cancel, and save-failure paths preserve the intended draft and view;
- focus, keyboard access, mobile navigation, and existing export/import behavior remain intact;
- unit, type, lint, build, and Chromium/Firefox/WebKit end-to-end suites pass.
