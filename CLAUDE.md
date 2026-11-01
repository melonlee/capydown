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

PDF / Word export lives in `src/main/export/` (`ipc-export.ts`): the renderer builds a print HTML (`src/renderer/src/utils/export-document.ts`) that a hidden sandboxed window prints to PDF; `.docx` is built in main from `marked` lexer tokens with the `docx` library. "Open with Slothdown" (file associations in `electron-builder.yml`, macOS `open-file`, argv + single-instance lock) is in `src/main/open-with*.ts` and `src/renderer/src/composables/useOpenWith.ts`. New main-process runtime deps must be added to the `externalizeDepsPlugin` exclude list in `electron.vite.config.ts` so they are bundled (electron-builder drops transitive deps in this pnpm repo).

## Branding

The product is **Slothdown** — one name only (renamed from LazyBox in v0.3.0; the interim Chinese name 懒得排 was dropped in v0.3.1). In Chinese contexts add the descriptor 「Slothdown · 给公众号作者的 Markdown 编辑器」 where a description helps; 「懒得排版？交给树懒。」 is a slogan only (poster, website hero, README tagline), never the product name. Display names live in `src/shared/brand.ts` (`APP_NAME` / `APP_DISPLAY_NAME` Slothdown, `APP_DESCRIPTOR_ZH`, `APP_SLOGAN_ZH`, `APP_TAGLINE`); the splash in `src/renderer/index.html` hardcodes them. Bundle / executable name is `Slothdown` (`productName` in `package.json` and `electron-builder.yml`). Kept on purpose: `appId: com.lazybox.app` and the Windows AppUserModelId `com.lazybox` (changing them makes macOS/Windows treat it as a different app — permissions, file associations, pinned shortcuts), and storage keys with the `lazybox-` prefix (`lazybox-first-run-4`, `lazybox-proofread-style`). `src/main/user-data.ts` (first import in `src/main/index.ts`) copies the old `LazyBox`/`lazybox` userData dir into the new `Slothdown` one on first launch (copy, never delete; skipped with `--user-data-dir` or when the new dir already has data). E2E env vars are `SLOTHDOWN_E2E`, `SLOTHDOWN_USER_DATA`, `SLOTHDOWN_E2E_EXPORT_DIR`.

Icons: the mascot is a monochrome sloth from the owner's mascot family (same style as the 喵想 · FantasyAI Lab cat: dark squircle, glossy white creature, light from the upper left). Since v0.3.1 the pose is product-themed: the sloth dozes ("zz") hugging a black fountain pen whose nib trails an ink line. Hand-maintained masters (from the family-v2 concept, pen barrel lightened + faint light rim for contrast on the tile): `docs/assets/brand/src/sloth-pen.svg` (full), `sloth-pen-small.svg` (head + pen, 16–48px), `sloth-pen-flat.svg` (two-tone); all use viewBox 100..924. `docs/assets/brand/src/tools/build_icon.py` turns them into `app-icon.svg` / `app-icon-small.svg` (macOS 1024 grid with `tile-shadow`), `app-icon-flat.svg`, the frameless mascot `docs/assets/brand/sloth-pen-art*.svg` (website / marketing) and the in-app mark `src/renderer/src/assets/images/logo-mark.svg` (head glyph from `tools/mark-head.txt` with cut-out eye patches + a diagonal pen whose nib sits at (22, 192) of the 200 grid — the splash ink line starts there; `currentColor`, inlined by `components/brand/BrandMark.vue`). `export_icons.py` renders `build/icon.icns` (small for 16/16@2x/32) / `icon.ico` (small ≤48) / `build/icons/` (Linux) / `resources/icon.png` / in-app favicon / website favicons. `build_brand.py` outlines the Slothdown wordmark (Manrope) and composes `logo-lockup-*` (mark) and `logo-lockup-icon-*` (app icon). Marketing images (banner, social preview, share card, poster, workflow) are HTML in `docs/assets/brand/src/` rendered with `tools/render-batch.mjs`. Everything outward-facing is strictly monochrome; only real 公众号 article screenshots carry colour.

## Project Architecture

Slothdown is an Electron-based desktop Markdown editor, forked from doocs/md. The app uses a multi-process Electron architecture:

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
- **Local File Operations** (`src/main/local.ts`) - Main process file system utilities with `defaultAppDir` (`~/Documents/codes/LazyBox` if it exists from before the rename, else `~/Documents/Slothdown`)

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

- Default workspace path: `~/Documents/codes/LazyBox` if it exists (pre-rename installs), otherwise `~/Documents/Slothdown`
- Default document name: `探索 Markdown`
- First-run flag key: `lazybox-first-run-4` (keeps the old prefix)
- appId: `com.lazybox.app` (kept across the rename)

### TypeScript Configuration

The project uses project references with separate configs:
- `tsconfig.node.json` - Main process (Node.js types)
- `tsconfig.web.json` - Renderer process (DOM types)
