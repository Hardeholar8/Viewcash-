"use client";
import { useEffect,useState } from "react";

type Task={id:string;title:string;description:string|null;reward:number;task_type:string;action_url:string|null;verification_type:string;proof_required:boolean;completed_count:number};

async function imageToDataUrl(file:File){
 if(!file.type.startsWith("image/")) throw new Error("Please select a screenshot image.");
 const bitmap=await createImageBitmap(file);
 const max=1400;
 const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement("canvas");
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));
 canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const ctx=canvas.getContext("2d");
 if(!ctx) throw new Error("Unable to process screenshot.");
 ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
 bitmap.close();
 return canvas.toDataURL("image/jpeg",.72);
}

export default function TasksPage(){
 const [initData,setInitData]=useState(""),[tasks,setTasks]=useState<Task[]>([]),[message,setMessage]=useState("Loading tasks..."),[busy,setBusy]=useState<string|null>(null),[proofs,setProofs]=useState<Record<string,string>>({});
 useEffect(()=>{const tg=window.Telegram?.WebApp;if(!tg?.initData){setMessage("Open ViewCash from Telegram.");return}tg.ready?.();tg.expand?.();setInitData(tg.initData);load(tg.initData)},[]);
 const load=async(data:string)=>{try{const r=await fetch(`/api/tasks?initData=${encodeURIComponent(data)}`,{cache:"no-store"});const d=await r.json().catch(()=>({}));if(r.ok){setTasks(d.tasks||[]);setMessage("")}else setMessage(d.error||"Unable to load tasks.")}catch{setMessage("Unable to load tasks. Please try again.")}};
 const startTask=(t:Task)=>{if(!t.action_url)return;try{const tg=window.Telegram?.WebApp;if(/^https:\/\/t\.me\//i.test(t.action_url)&&tg?.openTelegramLink){tg.openTelegramLink(t.action_url);return}window.open(t.action_url,"_blank","noopener,noreferrer")}catch{window.location.href=t.action_url}};
 const pickProof=async(t:Task,file?:File)=>{if(!file)return;try{setMessage("Preparing screenshot...");const data=await imageToDataUrl(file);if(data.length>2500000)throw new Error("Screenshot is too large. Please use a smaller screenshot.");setProofs(v=>({...v,[t.id]:data}));setMessage("Screenshot attached. Press Submit Proof.")}catch(e){setMessage(e instanceof Error?e.message:"Unable to attach screenshot.")}};
 const submit=async(t:Task)=>{let proof:string|null=null;if(t.verification_type!=="telegram"){proof=(proofs[t.id]||"").trim();if(!proof){setMessage("Upload your proof screenshot first.");return}if(!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(proof)){setMessage("Please upload a valid proof screenshot.");return}}setBusy(t.id);setMessage("");try{const r=await fetch("/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({task_id:t.id,initData,proof_url:proof}),cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Task verification failed");setMessage(`Task completed: +${Number(d.reward||0).toLocaleString()} coins`);setProofs(v=>{const n={...v};delete n[t.id];return n});await load(initData)}catch(e){setMessage(e instanceof Error?e.message:"Task verification failed")}finally{setBusy(null)}};
 return <main className="min-h-screen bg-[#070b14] px-4 py-6 text-white"><div className="mx-auto max-w-md"><div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">ViewCash</p><h1 className="mt-1 text-2xl font-black">Tasks</h1></div><button onClick={()=>window.location.assign("/")} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold">Back</button></div>{message&&<div className="mb-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/[.06] p-3 text-sm text-cyan-100">{message}</div>}<div className="space-y-3">{tasks.map(t=><article key={t.id} className="rounded-3xl border border-white/10 bg-white/[.035] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.15em] text-slate-500">{t.task_type} task</p><h2 className="mt-1 font-bold">{t.title}</h2><p className="mt-1 text-sm leading-5 text-slate-400">{t.description||"Complete this task to earn coins."}</p></div><span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs font-bold text-cyan-300">+{Number(t.reward).toLocaleString()}</span></div>{t.verification_type!=="telegram"&&<div className="mt-4 rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-400/[.04] p-3"><label className="block text-xs font-bold text-cyan-200">Proof screenshot</label><input className="mt-2 w-full text-sm" type="file" accept="image/*" onChange={e=>pickProof(t,e.target.files?.[0])}/>{proofs[t.id]&&<img src={proofs[t.id]} alt="Proof preview" className="mt-3 max-h-48 w-full rounded-xl object-contain"/>}</div>}<div className="mt-4 grid grid-cols-2 gap-2"><button onClick={()=>startTask(t)} disabled={!t.action_url||busy===t.id} className="rounded-2xl border border-white/10 bg-white/[.03] py-2.5 text-sm font-semibold disabled:opacity-40">Start Task</button><button onClick={()=>submit(t)} disabled={busy===t.id} className="rounded-2xl bg-cyan-400 py-2.5 text-sm font-extrabold text-slate-950 disabled:opacity-50">{busy===t.id?"Submitting...":t.verification_type==="telegram"?"Verify":"Submit Proof"}</button></div></article>)}{!tasks.length&&<div className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">No tasks available right now.</div>}</div></div></main>;
}
