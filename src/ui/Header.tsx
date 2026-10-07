// The header above the 3D view (ADR 0037): the frame rate on the left, the title in the middle,
// and on the right the settings button and the credit, whose GitHub icon alone links to the
// repository.
import { fps, settingsOpen, started } from './state'

const REPOSITORY = 'https://github.com/nagoya0/webgpu-skyscape'

export function Header() {
  return (
    <div class="header">
      <div class="header-left">
        <span class="fps" aria-live="off">
          {fps.value === null ? '-- FPS' : `${fps.value.toFixed(0)} FPS`}
        </span>
      </div>
      <h1 class="title">WebGPU Skyscape Demo</h1>
      <div class="header-right">
        <button
          type="button"
          class="icon-button"
          aria-label="設定"
          title="設定"
          aria-expanded={settingsOpen.value}
          // Not while the demo starts (the maintainer).
          disabled={!started.value}
          onClick={() => (settingsOpen.value = !settingsOpen.value)}
        >
          <SettingsIcon />
        </button>
        <span class="credit">@nagoya0</span>
        <a class="icon-link" href={REPOSITORY} target="_blank" rel="noopener" aria-label="GitHub リポジトリ" title="GitHub リポジトリ">
          <GitHubIcon />
        </a>
      </div>
    </div>
  )
}

/** A gear, drawn for this project. */
function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke-linecap="round" />
      <circle cx="12" cy="12" r="6.5" />
    </svg>
  )
}

/** GitHub's mark, from Octicons (mark-github, MIT). */
function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  )
}
