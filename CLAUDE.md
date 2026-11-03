# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the application for production
- `npm run typecheck` - Run TypeScript type checking for both main and renderer processes
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run build:win` - Build Windows executable
- `npm run build:mac` - Build macOS executable
- `npm run build:linux` - Build Linux executable
- `pnpm test` - Run Vitest unit tests (`tests/unit/`)

Docs: user guide `docs/usage.md`, roadmap `docs/ROADMAP.md`, changelog `CHANGELOG.md`, archived planning docs in `docs/dev/` (editor redesign: `docs/dev/typora-redesign.md`). Brand assets and their sources live in `docs/assets/brand/`, app screenshots in `docs/assets/screenshots/`. The landing page is a build-free static site in `website/` (see `website/README.md`).

The main editor is CodeMirror 6 with Typora-style live preview (`src/renderer/src/editor/`); the file on disk must round-trip byte-for-byte (`tests/unit/editor.test.ts`). Menus, shortcuts and the command palette share one command table (`src/shared/commands.ts`). The UI is strictly monochrome (`src/renderer/src/assets/workbench.css`); only 公众号 article themes carry colour. In-editor affordances (selection toolbar `components/workbench/SelectionToolbar.vue`, empty-line "+" `editor/insert-button.ts` + `InsertMenu.vue`, native right-click menu `src/shared/context-menu.ts` → `src/main/context-menu.ts`, sidebar icon row `SidebarActions.vue`) all call `runCommand(id)`; their pure logic lives in `editor/affordances.ts` (`tests/unit/affordances.test.ts`).

AI is limited to two features — pre-publish proofreading and title/summary generation (see `docs/dev/ai.md`; mock server `scripts/dev/mock-openai.mjs`, live smoke test `scripts/dev/ai-smoke.mjs`). The old writing helpers (continue, polish, outline…) keep their source but are only registered with the experimental flag.

Experimental modules (MCP, Skill, vector/knowledge graph, templates, AI image generation) are only registered when the `experimental_features_enabled` store key is true (`src/main/config/experimental.ts`). Publishing is honest: only WeChat (clipboard) and Markdown export are implemented (`src/main/publish/`).

PDF / Word export lives in `src/main/export/` (`ipc-export.ts`): the renderer builds a print HTML (`src/renderer/src/utils/export-document.ts`) that a hidden sandboxed window prints to PDF; `.docx` is built in main from `marked` lexer tokens with the `docx` library. "Open with Capydown" (file associations in `electron-builder.yml`, macOS `open-file`, argv + single-instance lock) is in `src/main/open-with*.ts` and `src/renderer/src/composables/useOpenWith.ts`. New main-process runtime deps must be added to the `externalizeDepsPlugin` exclude list in `electron.vite.config.ts` so they are bundled (electron-builder drops transitive deps in this pnpm repo).

## Branding

The product is **Capydown** (Capybara + Markdown) — one name only. History: LazyBox → Slothdown (v0.3.x) → Capydown (v0.4.0); former-name notes say 「原名 LazyBox / Slothdown」. Capybaras are famous for being calm and unbothered (情绪稳定), which is the mood for focused writing. In Chinese contexts add the descriptor 「Capydown · 给公众号作者的 Markdown 编辑器」 where a description helps; 「淡定地写，排版交给卡皮巴拉。」 (en: "Stay calm and write. Capydown does the formatting.") is a slogan only (poster, website hero, README tagline), never the product name. Display names live in `src/shared/brand.ts` (`APP_NAME` / `APP_DISPLAY_NAME` Capydown, `APP_DESCRIPTOR_ZH`, `APP_SLOGAN_ZH`, `APP_SLOGAN_EN`, `APP_TAGLINE`); the splash in `src/renderer/index.html` hardcodes them. Bundle / executable name is `Capydown` (`productName` in `package.json` and `electron-builder.yml`; Linux executable `capydown`). GitHub repo `melonlee/capydown`, website `https://melonlee.github.io/capydown/`. Kept on purpose: `appId: com.lazybox.app` and the Windows AppUserModelId `com.lazybox` (changing them makes macOS/Windows treat it as a different app — permissions, file associations, pinned shortcuts), and storage keys with the `lazybox-` prefix (`lazybox-first-run-4`, `lazybox-proofread-style`, `lb-*`).

userData migration: `src/main/user-data.ts` (first import in `src/main/index.ts`) calls the electron-free `src/main/user-data-migration.ts` (`tests/unit/user-data.test.ts`). On first launch, if the `Capydown` userData dir has no data (`config.json` / `Local Storage`), it copies the most recent previous profile — `Slothdown`/`slothdown` first, else `LazyBox`/`lazybox` (newest case variant wins) — via a temp dir, skipping caches and Singleton locks, never deleting the old dir, and writes `migrated-from-<name>.json`. Skipped with `--user-data-dir` or when the new dir already has data. `pickDefaultAppDir` keeps an existing `~/Documents/Slothdown` or `~/Documents/codes/LazyBox` as the default workspace; new installs use `~/Documents/Capydown`. E2E env vars are `CAPYDOWN_E2E`, `CAPYDOWN_USER_DATA`, `CAPYDOWN_E2E_EXPORT_DIR`.

Icons: the mascot is a **capybara coiled into a capital C** — the C of Capydown, drawn in the 「字母动物」 style (fat round-capped letter strokes, flat art, one crisp side-shade band instead of gradients): a warm taupe capybara whose body is the C's stroke, head resting on the lower terminal with sleepy closed eyes, blush and a split lip, and **a baby capybara lying on the upper terminal**. Because the mark *is* the letter C, the lockup reads `[coloured C] apydown` — the mascot replaces the first letter of the wordmark rather than sitting beside it. The pup and the fur ticks are dropped at ≤48 px (they turn to mush). The app icon is the only coloured thing — the UI and every in-app mark stay strictly monochrome. Everything is generated by one parametric script, **`docs/assets/brand/src/tools/letter_capy.py`** (never hand-edit the SVGs or the regions it patches; it needs Playwright, so run it as `CAPY_RENDER=$HOME/Desktop/vibecoding/_tools/sd-render-batch.mjs python3 docs/assets/brand/src/tools/letter_capy.py` — the in-repo `render-batch.mjs` has no node_modules). It writes: `src/capybara.svg` (full, ≥64px), `capybara-small.svg` (no pup/ticks, enlarged features, 16–48px), `capybara-flat.svg`, `src/app-icon*.svg` (macOS 1024 grid, squircle 100..924, `tile-shadow`), the frameless mascot `docs/assets/brand/capybara-art*.svg` (website copy `website/assets/capybara.svg`), `src/capy-glyph.svg` + `src/renderer/src/assets/images/logo-mark.svg` (single even-odd path on a 24 grid, `currentColor`, no ids so it can be inlined repeatedly; the head sits only slightly above the stroke so it doesn't close the C's aperture, chin flush with the stroke's lower edge, one open eye — a closed-eye slit disappears at 16px; coordinates need 3 decimals or the eye squashes into an ellipse), `logo-wordmark-*` / `logo-lockup-*` / `logo-lockup-icon-*` (Nunito Black outlined with fontTools, cap height `CAP = 0.705` em; the wordmark's cap height is matched to the glyph's ink height `GLYPH_INK` and the baselines are shared), and `src/renderer/src/assets/images/logo-lockup.svg` (one `currentColor` lockup, inlined by `Welcome.vue`). It also **patches two hand-inlined copies in place**: the Electron splash in `src/renderer/index.html` (the `lb-splash-mark` / `lb-splash-word` SVGs and their CSS) and the website hero — `website/style.css` between `/* lockup:start */` and `/* lockup:end */`, plus the inline `hl-word` SVG in `website/index.html` and `website/en/index.html`. The website hero uses the coloured mascot `assets/capybara.svg` as `<img class="hl-mark">` instead of the monochrome glyph, so it matches the favicon. `export_icons.py` (`LB_RENDER=` same override) renders `build/icon.icns` (small for 16/16@2x/32) / `icon.ico` (small ≤48) / `build/icons/` (Linux) / `build/icon.png` / `resources/icon.png` / in-app favicon / `website/assets/` favicons + `capybara.svg`; Windows and Linux use the no-padding variant (viewBox cropped to 100..924, drop shadow stripped). Splash sequence: mark settles → wordmark slides in → tagline. Retired: the 喵想-cat-construction front-facing capybara (0.4.x, `capybara.py` + `build_icon.py` + `build_brand.py`), the 0.4.0 yuzu head and the 0.4.0-dev "thinking capybara". Marketing images (banner, social preview, share card, poster, workflow) are HTML in `docs/assets/brand/src/` rendered with `tools/render-batch.mjs`; `contact-sheet.html` is the legibility check. Outward-facing marketing is monochrome apart from the capybara icon/art and real 公众号 article screenshots.

## Project Architecture

Capydown is an Electron-based desktop Markdown editor, forked from doocs/md. The app uses a multi-process Electron architecture:

### Process Structure

- **Main Process** (`src/main/`) - Node.js environment, handles window management, file system operations, and IPC
- **Preload** (`src/preload/`) - Bridge between main and renderer, exposes safe APIs via `contextBridge`
- **Renderer Process** (`src/renderer/`) - Vue 3 application with Pinia state management

### Key Architectural Patterns

#### IPC Communication
All file operations and system calls go through IPC handlers defined in `src/main/ipc.ts`. The preload script (`src/preload/index.ts`) exposes these as `window.$api` with two API sets:

1. **Legacy API** - Single-file operations (`addPost`, `renamePost`, `removePost`, etc.)
2. **New API** - Workspace-based file tree operations (`createFile`, `readDirectoryTree`, `moveFileOrFolder`, etc.)

#### Workspace System
The app uses a workspace-based file management system:

- **Workspace Store** (`src/renderer/src/stores/workspace.ts`) - Manages multiple workspaces, tracks current/recent workspaces, persists to localStorage
- **File Tree Store** (`src/renderer/src/stores/fileTree.ts`) - Handles file tree loading, file/folder CRUD operations
- **Local File Operations** (`src/main/local.ts`) - Main process file system utilities with `defaultAppDir` (an existing `~/Documents/Slothdown` or `~/Documents/codes/LazyBox` from before the renames, else `~/Documents/Capydown`)

#### View Routing
App.vue conditionally renders based on workspace state:
- `Welcome.vue` - Shown when no workspace is open (workspace selection screen)
- `CodemirrorEditor.vue` - Main editor when a workspace is active

#### Markdown Rendering Pipeline
The renderer system (`src/renderer/src/utils/renderer.ts`) uses:
- `marked` for Markdown parsing
- `highlight.js` for code syntax highlighting
- `mermaid` for diagram rendering
- `DOMPurify` for sanitization
- Custom theme system with CSS-in-JS styling

Theme customization flows through:
1. Base theme definitions in `@renderer/config/theme.ts`
2. CSS editor (`CssEditor.vue`) for user custom CSS
3. `renderer.ts` combines theme + custom CSS + applies to rendered output

#### State Management
- **Main Store** (`src/renderer/src/stores/index.ts`) - Editor state, theme settings, CSS configuration
- **Workspace Store** - Workspace CRUD, recent workspaces tracking
- **File Tree Store** - File tree loading and operations
- **Display Store** - UI state (dialogs, sliders visibility)

### File Structure Notes

- UI components in `src/renderer/src/components/ui/` are auto-imported Radix Vue wrappers
- `CodemirrorEditor` directory contains editor sub-panels (FileTreePanel, RightSlider, CssEditor, UploadImgDialog); workbench chrome (title bar, status bar, outline, command palette, WeChat panel, proofread panel) lives in `components/workbench/`
- The app uses `path-browserify` for path operations in renderer (original Node `path` is polyfilled)
- Assets are imported through Vite's `?asset` and `?raw` suffixes

### Key Constants

- Default workspace path: `~/Documents/Slothdown` or `~/Documents/codes/LazyBox` if it exists (pre-rename installs), otherwise `~/Documents/Capydown`
- Default document name: `探索 Markdown`
- First-run flag key: `lazybox-first-run-4` (keeps the old prefix)
- appId: `com.lazybox.app` (kept across the renames)

### TypeScript Configuration

The project uses project references with separate configs:
- `tsconfig.node.json` - Main process (Node.js types)
- `tsconfig.web.json` - Renderer process (DOM types)
