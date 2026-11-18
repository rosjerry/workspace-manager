import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const app = express();
const PORT = Number(process.env.PORT || 4317);
const CONFIG_FILE = path.join(os.homedir(), ".cursor-workspace-manager.json");
app.use(cors({ origin: "http://127.0.0.1:5180" }));
app.use(express.json({ limit: "1mb" }));

type FolderRef = { path: string; name?: string };
type WorkspaceFile = { folders?: FolderRef[]; settings?: unknown; [key: string]: unknown };
let configuredRoot = process.env.PROJECTS_ROOT ? path.resolve(process.env.PROJECTS_ROOT) : "";
if (!configuredRoot) {
  try { const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); if (saved.root && fs.existsSync(saved.root) && fs.statSync(saved.root).isDirectory()) configuredRoot = path.resolve(saved.root); } catch {}
}
const SKIP = new Set([".git", "node_modules", "dist", "build", ".next", ".nuxt", ".venv", "venv", "vendor", ".cache", ".turbo"]);
const MARKERS = ["package.json","pnpm-workspace.yaml","pyproject.toml","requirements.txt","Cargo.toml","go.mod","composer.json","Gemfile","pom.xml","build.gradle","build.gradle.kts","Dockerfile","*.csproj","*.sln"];

function ensureRoot(root: string) {
  const full = path.resolve(root);
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) throw new Error("Directory does not exist or is not a directory.");
  configuredRoot = full;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ root: full }, null, 2));
  return full;
}
function safeRead(file: string): WorkspaceFile {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}
function scan(root: string) {
  const projects = new Map<string, any>();
  const workspaces: any[] = [];
  const warnings: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const files = new Set(ents.filter(e => e.isFile()).map(e => e.name));
    const isProject = MARKERS.some(m => files.has(m) || (m.startsWith("*.") && [...files].some(f => f.endsWith(m.slice(1)))));
    if (isProject) projects.set(path.resolve(dir), { path: path.resolve(dir), name: path.basename(dir) });
    for (const ent of ents) {
      if (!ent.isDirectory() || ent.isSymbolicLink() || SKIP.has(ent.name) || ent.name.startsWith(".")) continue;
      walk(path.join(dir, ent.name), depth + 1);
    }
  };
  walk(root, 0);
  try {
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
      if (ent.isDirectory() && !ent.isSymbolicLink() && !SKIP.has(ent.name) && !ent.name.startsWith(".")) {
        projects.set(path.resolve(root, ent.name), { path: path.resolve(root, ent.name), name: ent.name });
      }
    }
  } catch {}
  const findWorkspaces = (dir: string, depth: number) => {
    if (depth > 6) return;
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      const full = path.join(dir, ent.name);
      if (ent.isFile() && ent.name.toLowerCase().endsWith(".code-workspace")) {
        try {
          const data = safeRead(full);
          const folders = (Array.isArray(data.folders) ? data.folders : []).map(f => {
            const isUri = /^[a-z][a-z0-9+.-]*:\/\//i.test(f.path);
            const abs = isUri ? null : path.resolve(path.dirname(full), f.path);
            return { path: f.path, resolvedPath: abs, exists: isUri ? null : !!abs && fs.existsSync(abs), remote: isUri };
          });
          workspaces.push({ id: full, name: path.basename(full, ".code-workspace"), filePath: full, folders });
        } catch (e: any) { warnings.push(`${path.relative(root, full)}: ${e.message}`); }
      } else if (ent.isDirectory() && !ent.isSymbolicLink() && !SKIP.has(ent.name) && !ent.name.startsWith(".")) findWorkspaces(full, depth + 1);
    }
  };
  findWorkspaces(root, 0);
  for (const ws of workspaces) for (const f of ws.folders) {
    if (f.resolvedPath && f.exists && !projects.has(f.resolvedPath)) projects.set(f.resolvedPath, { path: f.resolvedPath, name: path.basename(f.resolvedPath) });
  }
  const referenced = new Set(workspaces.flatMap(w => w.folders.filter((f: any) => f.resolvedPath && f.exists).map((f: any) => f.resolvedPath)));
  const projectList = [...projects.values()].map(p => ({
    ...p, workspaces: workspaces.filter(w => w.folders.some((f: any) => f.resolvedPath === p.path && f.exists)).map(w => w.name),
    referenced: referenced.has(p.path)
  })).sort((a,b) => a.name.localeCompare(b.name));
  return { root, workspaces: workspaces.sort((a,b) => a.name.localeCompare(b.name)), projects: projectList, warnings };
}
function assertWithinRoot(target: string) {
  const rel = path.relative(configuredRoot, path.resolve(target));
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Path must be inside the configured projects root.");
}
function cursorCommand() {
  return process.env.CURSOR_COMMAND || (process.platform === "win32" ? "cursor" : "cursor");
}
function openCursor(workspaceFile: string) {
  const child = spawn(cursorCommand(), ["--new-window", workspaceFile], { detached: true, stdio: "ignore", shell: process.platform === "win32" });
  child.on("error", (e) => console.error("Could not launch Cursor:", e.message));
  child.unref();
}
app.get("/api/status", (_req,res) => res.json({ root: configuredRoot, ready: !!configuredRoot }));
app.post("/api/root", (req,res) => {
  try { const root = ensureRoot(String(req.body.root || "")); res.json({ root }); }
  catch(e:any) { res.status(400).json({ error: e.message }); }
});
app.get("/api/data", (_req,res) => {
  if (!configuredRoot) return res.status(400).json({ error: "Choose your projects root first." });
  try { res.json(scan(configuredRoot)); } catch(e:any) { res.status(500).json({ error: e.message }); }
});
app.get("/api/directories", (req,res) => {
  if (!configuredRoot) return res.status(400).json({ error: "Choose your projects root first." });
  const requested = String(req.query.path || configuredRoot);
  try {
    const target = path.resolve(requested); assertWithinRoot(target);
    const dirs = fs.readdirSync(target, { withFileTypes: true }).filter(e => e.isDirectory() && !e.isSymbolicLink() && !SKIP.has(e.name) && !e.name.startsWith("."))
      .map(e => ({ name: e.name, path: path.join(target,e.name) })).sort((a,b)=>a.name.localeCompare(b.name));
    res.json({ current: target, parent: target === configuredRoot ? null : path.dirname(target), dirs });
  } catch(e:any) { res.status(400).json({ error: e.message }); }
});
app.post("/api/workspaces", (req,res) => {
  if (!configuredRoot) return res.status(400).json({ error: "Choose your projects root first." });
  try {
    const name = String(req.body.name || "").trim();
    const selected = Array.isArray(req.body.projects) ? req.body.projects.map(String) : [];
    if (!name) throw new Error("Workspace name is required.");
    if (!selected.length) throw new Error("Select at least one project folder.");
    if (/[\\\\/:*?"<>|]/.test(name) || name === "." || name === "..") throw new Error("Workspace name contains invalid filename characters.");
    const outputDir = req.body.outputDir ? path.resolve(String(req.body.outputDir)) : configuredRoot;
    assertWithinRoot(outputDir);
    if (!fs.existsSync(outputDir) || !fs.statSync(outputDir).isDirectory()) throw new Error("Workspace save directory does not exist.");
    const filePath = path.join(outputDir, `${name}.code-workspace`);
    if (fs.existsSync(filePath)) throw new Error("A workspace with this name already exists in that directory.");
    const folders = selected.map(p => {
      const full = path.resolve(p); assertWithinRoot(full);
      if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) throw new Error(`Project folder does not exist: ${p}`);
      return { path: path.relative(outputDir, full).split(path.sep).join("/") || "." };
    });
    fs.writeFileSync(filePath, JSON.stringify({ folders }, null, 2) + "\n", { flag: "wx" });
    res.json({ success: true, filePath });
  } catch(e:any) { res.status(400).json({ error: e.message }); }
});
app.put("/api/workspaces/:id", (req,res) => {
  try {
    const file = path.resolve(req.params.id); assertWithinRoot(file);
    if (!file.endsWith(".code-workspace") || !fs.existsSync(file)) throw new Error("Workspace file not found.");
    const data = safeRead(file);
    const selected = Array.isArray(req.body.projects) ? req.body.projects.map(String) : [];
    if (!selected.length) throw new Error("A workspace must contain at least one project.");
    data.folders = selected.map(p => {
      const full = path.resolve(p); assertWithinRoot(full);
      if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) throw new Error(`Project folder does not exist: ${p}`);
      return { path: path.relative(path.dirname(file), full).split(path.sep).join("/") || "." };
    });
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    res.json({ success: true });
  } catch(e:any) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/workspaces/:id", (req,res) => {
  try {
    const file = path.resolve(req.params.id); assertWithinRoot(file);
    if (!file.endsWith(".code-workspace") || !fs.existsSync(file)) throw new Error("Workspace file not found.");
    fs.unlinkSync(file); res.json({ success: true });
  } catch(e:any) { res.status(400).json({ error: e.message }); }
});
app.post("/api/open", (req,res) => {
  try {
    const ids = Array.isArray(req.body.workspaces) ? req.body.workspaces.map(String) : [];
    if (!ids.length) throw new Error("Select at least one workspace.");
    const files = ids.map((id: string) => {
      const file = path.resolve(id); assertWithinRoot(file);
      if (!file.endsWith(".code-workspace") || !fs.existsSync(file)) throw new Error(`Workspace not found: ${id}`);
      return file;
    });
    // Deliberately launch one separate Cursor window per workspace.
    files.forEach(openCursor);
    res.json({ success: true, opened: files.length });
  } catch(e:any) { res.status(400).json({ error: e.message }); }
});
app.post("/api/open-project", (req,res) => {
  try {
    const folder = path.resolve(String(req.body.path || "")); assertWithinRoot(folder);
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error("Project folder not found.");
    const child = spawn(cursorCommand(), ["--new-window", folder], { detached: true, stdio: "ignore", shell: process.platform === "win32" });
    child.on("error", e => console.error(e)); child.unref();
    res.json({ success: true });
  } catch(e:any) { res.status(400).json({ error: e.message }); }
});
app.listen(PORT, "127.0.0.1", () => console.log(`Workspace Manager API listening on http://127.0.0.1:${PORT}`));
