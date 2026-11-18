# Cursor Workspace Manager

A local web application for discovering project folders, creating/editing `.code-workspace` files, and opening one or multiple workspaces in **separate Cursor windows**.

## Requirements

- Node.js 18+
- Cursor installed and available from your terminal as `cursor`
- Windows, macOS, or Linux

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5180.

Set your projects root in the top bar, for example `D:\Projects` or `~/Projects`.

## Cursor command

The app launches Cursor with:

```bash
cursor --new-window "path/to/workspace.code-workspace"
```

When multiple workspaces are selected, it invokes Cursor once per workspace, each with `--new-window`, so each opens separately.

If `cursor` is not on PATH, set `CURSOR_COMMAND` to the full executable path before starting the server.

PowerShell example:

```powershell
$env:CURSOR_COMMAND = "C:\Users\YOUR_USER\AppData\Local\Programs\cursor\resources\app\bin\cursor.cmd"
npm run dev
```

Linux/macOS example:

```bash
CURSOR_COMMAND=/usr/bin/cursor npm run dev
```

## Features

- Recursively discovers `.code-workspace` files under the selected root.
- Discovers project folders using common project manifest files and immediate child folders.
- Shows workspace-to-project relationships and unassigned projects.
- Creates new workspace files by selecting multiple project folders.
- Edits workspace membership without touching project contents.
- Deletes workspace files only; it never deletes project directories.
- Opens individual projects in Cursor.
- Opens selected workspaces in separate Cursor windows.
- Local-only API bound to `127.0.0.1`.

## Notes

- Workspaces are standard VS Code-compatible JSON files.
- Relative folder paths are written relative to the new workspace file location.
- The selected root is saved in `~/.cursor-workspace-manager.json` for future launches. Set `PROJECTS_ROOT` to override/preconfigure it.
- This initial version does not provide OS-native directory picker dialogs; paste the root path into the field.
- The app should only be run on a trusted local machine. It is not designed for network exposure or multi-user access.
