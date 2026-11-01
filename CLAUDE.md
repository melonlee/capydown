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

PDF / Word export lives in `src/main/export/` (`ipc-export.ts`): the renderer builds a print HTML (`src/renderer/src/utils/export-document.ts`) that a hidden sandboxed window prints to PDF; `.docx` is built in main from `marked` lexer tokens with the `docx` library. "Open with LazyBox" (file associations in `electron-builder.yml`, macOS `open-file`, argv + single-instance lock) is in `src/main/open-with*.ts` and `src/renderer/src/composables/useOpenWith.ts`. New main-process runtime deps must be added to the `externalizeDepsPlugin` exclude list in `electron.vite.config.ts` so they are bundled (electron-builder drops transitive deps in this pnpm repo).

## Project Architecture

LazyBox is an Electron-based desktop Markdown editor, forked from doocs/md. The app uses a multi-process Electron architecture:

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
- **Local File Operations** (`src/main/local.ts`) - Main process file system utilities with `defaultAppDir = ~/documents/codes/LazyBox`

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

- Default workspace path: `~/documents/codes/LazyBox`
- Default document name: `探索 Markdown`
- First-run flag key: `lazybox-first-run-4`

### TypeScript Configuration

The project uses project references with separate configs:
- `tsconfig.node.json` - Main process (Node.js types)
- `tsconfig.web.json` - Renderer process (DOM types)
