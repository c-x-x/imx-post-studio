# Dirty Exit Warning and Discarded Draft Design

## Goal

Make in-app home navigation non-destructive, warn only when the browser is leaving with changes that have not reached the local draft library, make “continue without saving” explicitly delete the current draft, and remove hover instability from dialog buttons.

## Confirmed Behavior

- Clicking the Dock home item, Studio logo, or Studio title returns home immediately.
- Returning to the article view restores the same in-memory article.
- Home navigation does not save, delete, or prompt.
- Closing or refreshing the page uses the browser-native `beforeunload` confirmation only while the current article has changes that have not been successfully written to the draft repository.
- A successful autosave, manual save, or transition save clears the unsaved marker.
- Browser-native leave-dialog wording is controlled by the browser and cannot be replaced with Studio buttons.
- “New article” keeps a three-way decision dialog:
  - “保存到草稿库并继续” persists the latest current revision, then creates a clean blank article.
  - “删除草稿并继续” deletes the current article record and its media from the draft library, then creates a clean blank article.
  - “取消” closes the dialog and preserves the current article.
- A deletion failure keeps the current article and dialog open and exposes an actionable error.

## State and Persistence

`App` owns an explicit unsaved flag alongside the existing draft revision counter. User edits and imported content mark the current article unsaved. Opening an existing stored draft and creating a blank article establish a clean baseline. A persistence operation clears the marker only after it has saved the latest stable revision.

The autosave status already represents the exact draft object that completed saving. `App` uses a successful current autosave to clear the unsaved marker. Leaving the workspace for home preserves that marker and stops scheduling new autosaves; returning to the workspace resumes autosave for an unsaved article.

A focused unload-warning hook registers `beforeunload` only while the unsaved flag is true and removes it immediately after a successful save or clean replacement.

## Safe Draft Deletion

The new-article decision dialog pauses future autosave scheduling while open. Draft repository writes and deletion for the same draft ID are serialized so that deletion runs after any write already in progress. This prevents a stale autosave from recreating a draft after “删除草稿并继续”.

The delete action locks the dialog while running. Only a successful repository deletion replaces the reducer state with a new article. Missing records count as successful deletion, matching the existing repository contract.

## Import Dialog Stability

The verified-import buttons inherit a generic hover rule that moves the button upward by one pixel. At the lower hit-test boundary this makes `:hover` repeatedly enter and leave, and a pointer release can miss the moved button.

Dialog action buttons keep their color, border, and shadow hover feedback but no longer translate their own hit box. Other non-dialog button motion remains unchanged. Import operations retain their existing busy/disabled guard so one accepted click cannot start duplicate imports.

## Error and Accessibility Behavior

- The browser leave warning is native and therefore keyboard- and browser-controlled.
- Home navigation retains its existing focus behavior without opening a modal.
- The new-article dialog keeps its focus trap and Escape/cancel restoration.
- Save or delete failures keep focus within the dialog and expose the message through an alert.
- The destructive action has an explicit “删除草稿并继续” label rather than the ambiguous “不保存并继续”.

## Verification

- Component tests cover immediate home navigation and in-memory article restoration.
- Unload-hook tests cover dirty registration, native prevention, and cleanup after save.
- Transition tests cover deletion of the current draft, deletion failure, blank/nonexistent records, and save/delete race ordering.
- Browser tests verify the native `beforeunload` event only for unsaved changes and verify stable dialog-button hit boxes during hover.
- The complete Vitest, TypeScript, ESLint, production build, and Playwright suites must pass before integration.
