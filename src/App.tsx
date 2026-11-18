import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, ConfigProvider, Empty, Input, Modal, Popconfirm, Select, Spin, Tag, Tooltip, message, theme } from "antd";
import { FolderOpen, Folder, Layers, Plus, RefreshCw, Search, Pencil, Trash2, ExternalLink, Network, CheckSquare, Square, FolderPlus, Moon, Sun } from "lucide-react";

type Project = { name: string; path: string; referenced: boolean; workspaces: string[] };
type Workspace = { id: string; name: string; filePath: string; folders: { path:string; resolvedPath:string|null; exists:boolean|null; remote:boolean }[] };
type Data = { root:string; workspaces:Workspace[]; projects:Project[]; warnings:string[] };
const folderLabel = (folder:Workspace["folders"][number]) => {
 const path=folder.resolvedPath||folder.path;
 return path.split(/[\\/]/).filter(Boolean).pop()||path;
};
const api = async (url:string, options:RequestInit={}) => {
  const r = await fetch(url,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
  const d = await r.json(); if(!r.ok) throw new Error(d.error || "Request failed"); return d;
};
export default function App(){
 const [isDark,setIsDark]=useState(()=>localStorage.getItem("workspace-manager-theme") !== "light");
 const [root,setRoot]=useState(""); const [rootDraft,setRootDraft]=useState("");
 const [data,setData]=useState<Data|null>(null); const [loading,setLoading]=useState(false);
 const [search,setSearch]=useState(""); const [selectedWs,setSelectedWs]=useState<string[]>([]);
 const [modal,setModal]=useState<"create"|"edit"|null>(null); const [editing,setEditing]=useState<Workspace|null>(null);
 const [wsName,setWsName]=useState(""); const [chosen,setChosen]=useState<string[]>([]);
 const [saveDir,setSaveDir]=useState(""); const [dirOptions,setDirOptions]=useState<{name:string,path:string}[]>([]);
 const [busy,setBusy]=useState(false); const [viewMode,setViewMode]=useState<"list"|"graph">("list");
 const [msg,ctx]=message.useMessage();

 useEffect(()=>{
  document.documentElement.dataset.theme=isDark?"dark":"light";
  document.documentElement.style.colorScheme=isDark?"dark":"light";
  localStorage.setItem("workspace-manager-theme",isDark?"dark":"light");
 },[isDark]);

 async function loadRoot(){setLoading(true);try{const s=await api("/api/status");if(s.root){setRoot(s.root);setRootDraft(s.root);await refresh(s.root)}}catch(e:any){msg.error(e.message)}finally{setLoading(false)}}
 async function refresh(r=root){if(!r)return;setLoading(true);try{const d=await api("/api/data");setData(d);setSelectedWs(s=>s.filter(id=>d.workspaces.some((w:Workspace)=>w.id===id)))}catch(e:any){msg.error(e.message)}finally{setLoading(false)}}
 useEffect(()=>{loadRoot()},[]);
 async function setProjectsRoot(){setBusy(true);try{const d=await api("/api/root",{method:"POST",body:JSON.stringify({root:rootDraft})});setRoot(d.root);setData(null);setSelectedWs([]);await refresh(d.root);msg.success("Projects root configured")}catch(e:any){msg.error(e.message)}finally{setBusy(false)}}
 const filteredProjects=useMemo(()=>data?.projects.filter(p=>(p.name+" "+p.path).toLowerCase().includes(search.toLowerCase()))||[],[data,search]);
 const filteredWorkspaces=useMemo(()=>data?.workspaces.filter(w=>(w.name+" "+w.filePath).toLowerCase().includes(search.toLowerCase()))||[],[data,search]);
 async function openSelected(ids=selectedWs){if(!ids.length)return msg.warning("Select at least one workspace.");setBusy(true);try{const d=await api("/api/open",{method:"POST",body:JSON.stringify({workspaces:ids})});msg.success(`Requested ${d.opened} separate Cursor window(s)`)}catch(e:any){msg.error(e.message)}finally{setBusy(false)}}
 async function openProject(p:Project){try{await api("/api/open-project",{method:"POST",body:JSON.stringify({path:p.path})});msg.success(`Opening ${p.name} in Cursor`)}catch(e:any){msg.error(e.message)}}
 async function loadDirs(p:string){try{const d=await api("/api/directories?path="+encodeURIComponent(p));setDirOptions(d.dirs);return d}catch(e:any){msg.error(e.message);return null}}
 async function showCreate(){setEditing(null);setWsName("");setChosen([]);setSaveDir(root);await loadDirs(root);setModal("create")}
 async function showEdit(w:Workspace){setEditing(w);setWsName(w.name);setChosen(w.folders.filter(f=>f.resolvedPath&&f.exists).map(f=>f.resolvedPath!));setSaveDir(root);await loadDirs(root);setModal("edit")}
 async function saveWorkspace(){setBusy(true);try{if(editing){await api("/api/workspaces/"+encodeURIComponent(editing.filePath),{method:"PUT",body:JSON.stringify({projects:chosen})});msg.success("Workspace updated")}else{await api("/api/workspaces",{method:"POST",body:JSON.stringify({name:wsName,projects:chosen,outputDir:saveDir})});msg.success("Workspace created")}setModal(null);await refresh()}catch(e:any){msg.error(e.message)}finally{setBusy(false)}}
 async function deleteWorkspace(w:Workspace){try{await api("/api/workspaces/"+encodeURIComponent(w.filePath),{method:"DELETE"});msg.success("Workspace file deleted");await refresh()}catch(e:any){msg.error(e.message)}}
 const allSelected=!!data?.workspaces.length&&selectedWs.length===data.workspaces.length;
 return <ConfigProvider theme={{algorithm:isDark?theme.darkAlgorithm:theme.defaultAlgorithm}}>{ctx}<div className="shell"><header className="topbar"><div className="brand"><div className="brand-icon"><Network size={21}/></div><div><h1>Workspace Manager</h1><span>Manage projects and Cursor workspaces</span></div></div><div className="top-actions"><Tooltip title={isDark?"Switch to light mode":"Switch to dark mode"}><Button aria-label={isDark?"Switch to light mode":"Switch to dark mode"} icon={isDark?<Sun size={15}/>:<Moon size={15}/>} onClick={()=>setIsDark(v=>!v)}/></Tooltip><Button icon={<RefreshCw size={15}/>} onClick={()=>refresh()} disabled={!root}>Refresh</Button><Button type="primary" icon={<Plus size={16}/>} onClick={showCreate} disabled={!root}>New workspace</Button></div></header>
 <section className="rootbar"><div className="root-label"><FolderOpen size={17}/><b>Projects root</b></div><Input value={rootDraft} onChange={e=>setRootDraft(e.target.value)} placeholder="Choose a folder path, e.g. D:\\Projects" onPressEnter={setProjectsRoot}/><Button type="primary" onClick={setProjectsRoot} loading={busy}>Set root</Button></section>
 {!root?<div className="welcome"><div className="welcome-icon"><FolderPlus size={34}/></div><h2>Choose your projects folder</h2><p>Set the parent directory that contains your project folders and .code-workspace files.</p></div>:<main className="content">
 {data?.warnings.length?<Alert type="warning" showIcon message="Some workspace files could not be read" description={data.warnings.join(" · ")}/>:null}
 <div className="summary-grid"><div className="summary"><span>Workspaces</span><strong>{data?.workspaces.length??"—"}</strong><Layers size={19}/></div><div className="summary"><span>Projects</span><strong>{data?.projects.length??"—"}</strong><Folder size={19}/></div><div className="summary"><span>Unassigned</span><strong>{data?.projects.filter(p=>!p.referenced).length??"—"}</strong><Network size={19}/></div></div>
 <div className="toolbar"><Input allowClear prefix={<Search size={16}/>} placeholder="Search projects and workspaces…" value={search} onChange={e=>setSearch(e.target.value)} /><span className="root-hint">{root}</span><div className="view-switch"><Button size="small" type={viewMode==="list"?"primary":"default"} onClick={()=>setViewMode("list")}>List</Button><Button size="small" type={viewMode==="graph"?"primary":"default"} icon={<Network size={14}/>} onClick={()=>setViewMode("graph")}>Graph</Button></div></div>
 {viewMode==="graph"?<GraphPanel workspaces={filteredWorkspaces} projects={filteredProjects}/>:<div className="columns">
 <section className="panel"><div className="panel-head"><div><h2>Workspaces</h2><p>Select one or more to open each in a separate Cursor window.</p></div><div className="panel-actions"><Button size="small" onClick={()=>setSelectedWs(allSelected?[]:(data?.workspaces.map(w=>w.id)||[]))}>{allSelected?"Clear":"Select all"}</Button><Button size="small" type="primary" icon={<ExternalLink size={14}/>} disabled={!selectedWs.length} loading={busy} onClick={()=>openSelected()}>Open selected ({selectedWs.length})</Button></div></div>
 {loading?<div className="loading"><Spin/></div>:filteredWorkspaces.length?filteredWorkspaces.map(w=><div className={"workspace-card "+(selectedWs.includes(w.id)?"chosen":"")} key={w.id}><Checkbox checked={selectedWs.includes(w.id)} onChange={e=>setSelectedWs(s=>e.target.checked?[...s,w.id]:s.filter(x=>x!==w.id))}/><div className="workspace-icon"><Layers size={18}/></div><div className="workspace-content"><div className="workspace-title"><div className="card-main"><b>{w.name}</b><span>{w.filePath}</span></div><span className="workspace-count">{w.folders.length} {w.folders.length===1?"folder":"folders"}</span></div>{w.folders.length?<div className="workspace-projects">{w.folders.map((f,i)=>{const status=f.remote?"remote":f.exists===false?"missing":f.exists===true?"local":"unknown";const statusLabel=status==="remote"?"Remote":status==="missing"?"Missing":status==="local"?"Available":"Unresolved";return <div className={`workspace-project ${status}`} key={`${f.path}-${i}`}><div className="workspace-project-icon"><Folder size={14}/></div><div className="workspace-project-label"><b>{folderLabel(f)}</b><span>{statusLabel}</span></div><i className="workspace-status-dot"/></div>})}</div>:<div className="workspace-empty">No project folders listed</div>}</div><div className="card-actions"><Tooltip title="Open in Cursor"><Button type="text" icon={<ExternalLink size={16}/>} onClick={()=>openSelected([w.id])}/></Tooltip><Tooltip title="Edit workspace"><Button type="text" icon={<Pencil size={16}/>} onClick={()=>showEdit(w)}/></Tooltip><Popconfirm title="Delete this workspace file?" description="Project folders will not be deleted." onConfirm={()=>deleteWorkspace(w)}><Button type="text" danger icon={<Trash2 size={16}/>}/></Popconfirm></div></div>):<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No workspaces found"/>}</section>
 <section className="panel"><div className="panel-head"><div><h2>Projects</h2><p>Discovered folders and their workspace membership.</p></div></div>
 {filteredProjects.length?filteredProjects.map(p=><div className="project-row" key={p.path}><div className="project-icon"><Folder size={17}/></div><div className="card-main"><b>{p.name}</b><span>{p.path}</span><div className="tags">{p.workspaces.length?p.workspaces.map(n=><Tag color="green" key={n}>{n}</Tag>):<Tag color="warning">Not in a workspace</Tag>}</div></div><Tooltip title="Open project folder in Cursor"><Button type="text" icon={<ExternalLink size={16}/>} onClick={()=>openProject(p)}/></Tooltip></div>):<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No projects found"/>}</section></div>}
 <div className="footer-note">Workspace files are ordinary .code-workspace JSON files. Deleting a workspace never deletes its project folders. Multi-open launches each selected workspace in its own Cursor window.</div>
 </main>}
 </div>
 <Modal title={editing?`Edit workspace · ${editing.name}`:"Create workspace"} open={!!modal} onCancel={()=>setModal(null)} onOk={saveWorkspace} okText={editing?"Save changes":"Create workspace"} confirmLoading={busy} okButtonProps={{disabled:!chosen.length||(!editing&&!wsName.trim())}} width={680}>
 <div className="modal-body">{!editing&&<><label>Workspace name</label><Input value={wsName} onChange={e=>setWsName(e.target.value)} placeholder="e.g. Sales Platform" autoFocus/><label>Save workspace file in</label><Input value={saveDir} onChange={e=>setSaveDir(e.target.value)} placeholder="Workspace output directory"/></>}
 <div className="picker-head"><div><label>Project folders</label><p>Select the folders to include in this workspace.</p></div><span>{chosen.length} selected</span></div>
 <div className="folder-picker">{(data?.projects||[]).map(p=><Checkbox key={p.path} checked={chosen.includes(p.path)} onChange={e=>setChosen(s=>e.target.checked?[...s,p.path]:s.filter(x=>x!==p.path))}><span className="folder-option"><b>{p.name}</b><small>{p.path}</small></span></Checkbox>)}</div>
 <p className="modal-hint">The generated workspace stores relative folder paths, so it remains portable when the folder structure moves together.</p>
 </div></Modal></ConfigProvider>;
}


function GraphPanel({workspaces,projects}:{workspaces:Workspace[];projects:Project[]}){
 const [active,setActive]=useState<string|null>(null);
 const width=1100, top=54, leftX=250, rightX=850;
 const wsY=(i:number)=>top+i*88+22, prY=(i:number)=>top+i*66+18;
 const height=Math.max(340,top+Math.max(workspaces.length*88,projects.length*66)+70);
 const projectIndex=new Map(projects.map((p,i)=>[p.path,i]));
 const related=new Set<string>();
 if(active){const w=workspaces.find(x=>x.id===active);const p=projects.find(x=>x.path===active);if(w)w.folders.forEach(f=>{if(f.resolvedPath)related.add(f.resolvedPath)});if(p)workspaces.filter(w=>w.folders.some(f=>f.resolvedPath===p.path)).forEach(w=>related.add(w.id));}
 return <section className="panel graph-panel"><div className="panel-head"><div><h2>Workspace relationships</h2><p>Lines show which project folders are included in each workspace. Select a node to highlight its connections.</p></div><Button size="small" onClick={()=>setActive(null)}>Clear selection</Button></div>
 {workspaces.length||projects.length?<div className="graph-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Workspace and project relationship graph">
 <text x="34" y="28" className="graph-heading">WORKSPACES</text><text x="690" y="28" className="graph-heading">PROJECT FOLDERS</text>
 {workspaces.flatMap((w,i)=>w.folders.map((f)=>{const j=f.resolvedPath?projectIndex.get(f.resolvedPath):undefined;if(j===undefined)return null;const on=!active||active===w.id||active===f.resolvedPath;return <line key={`${w.id}-${f.path}`} x1={leftX+155} y1={wsY(i)} x2={rightX-155} y2={prY(j)} className={on?"graph-edge active":"graph-edge faded"}/>;}))}
 {workspaces.map((w,i)=><g key={w.id} className={`graph-node ${active&&active!==w.id&&!related.has(w.id)?"faded":""}`} onClick={()=>setActive(active===w.id?null:w.id)}><rect x="34" y={wsY(i)-24} width="371" height="48" rx="10" className="graph-workspace"/><text x="52" y={wsY(i)+4} className="graph-name">{w.name.length>38?w.name.slice(0,35)+"…":w.name}</text><text x="388" y={wsY(i)+4} textAnchor="end" className="graph-count">{w.folders.length}</text></g>)}
 {projects.map((p,i)=><g key={p.path} className={`graph-node ${active&&active!==p.path&&!related.has(p.path)?"faded":""}`} onClick={()=>setActive(active===p.path?null:p.path)}><rect x="695" y={prY(i)-22} width="371" height="44" rx="10" className="graph-project"/><text x="712" y={prY(i)+4} className="graph-name">{p.name.length>37?p.name.slice(0,34)+"…":p.name}</text><text x="1048" y={prY(i)+4} textAnchor="end" className="graph-count">{p.workspaces.length}</text></g>)}
 </svg></div>:<Empty description="Nothing to visualize"/>}
 <div className="graph-legend"><span><i className="legend-dot blue"/>Workspace</span><span><i className="legend-dot green"/>Project folder</span><span>Line = workspace membership</span></div></section>
}
