"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getIdToken } from "firebase/auth";
import Swal from "sweetalert2";
import { collection, getDocs, query, orderBy, limit, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { COLLECTIONS, FirestoreUser, FirestoreQuestion } from "@/lib/types";

const fmt$ = (c: number) => "$" + (c / 100).toFixed(2);
function timeAgo(ts: any) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m/60)}h ago`;
  return `${Math.floor(m/1440)}d ago`;
}

const NAV_ITEMS = [
  { icon:"🏠", label:"Dashboard",   href:"/dashboard",    ext:false },
  { icon:"❤️", label:"Health",      href:"/admin/health", ext:false },
  { icon:"💰", label:"Payouts",     href:"/admin/payouts",ext:false },
  { icon:"🔥", label:"Firebase",    href:"https://console.firebase.google.com/project/askexpert-app/firestore", ext:true },
  { icon:"💳", label:"Stripe",      href:"https://dashboard.stripe.com", ext:true },
  { icon:"📧", label:"Resend",      href:"https://resend.com/emails",    ext:true },
  { icon:"🗃️", label:"cron-job.org",href:"https://cron-job.org",        ext:true },
];

const STATUS_COLORS: Record<string,{bg:string;color:string}> = {
  PENDING:  { bg:"#fef9c3", color:"#a16207" },
  ANSWERED: { bg:"#dcfce7", color:"#166534" },
  REFUNDED: { bg:"#fee2e2", color:"#991b1b" },
};

export default function AdminPage() {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState({ totalUsers:0, totalCreators:0, totalQuestions:0, pendingQs:0, answeredQs:0, refundedQs:0, totalRevenue:0 });
  const [recentQs, setRecentQs] = useState<FirestoreQuestion[]>([]);
  const [allCreators, setAllCreators] = useState<FirestoreUser[]>([]);
  const [selectedCreator, setSelectedCreator] = useState<string>("");
  const [creatorQs, setCreatorQs] = useState<FirestoreQuestion[]>([]);
  const [creatorQsLoading, setCreatorQsLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [togglingPublic, setTogglingPublic] = useState<string|null>(null);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testEmailType, setTestEmailType] = useState("asker_confirmation");
  const [testBusy, setTestBusy] = useState(false);
  const [cronBusy, setCronBusy] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !userProfile?.isAdmin)) router.replace("/dashboard");
  }, [loading, user, userProfile, router]);

  useEffect(() => {
    if (!userProfile?.isAdmin) return;
    (async () => {
      setDataLoading(true);
      try {
        const usersSnap = await getDocs(collection(db, COLLECTIONS.USERS));
        const allUsers = usersSnap.docs.map(d => d.data() as FirestoreUser);
        const creators = allUsers.filter(u => u.isCreator);
        setAllCreators(creators);
        const qSnap = await getDocs(collection(db, COLLECTIONS.QUESTIONS));
        const allQs = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreQuestion));
        setStats({
          totalUsers: allUsers.length, totalCreators: creators.length,
          totalQuestions: allQs.length,
          pendingQs:  allQs.filter(q=>q.status==="PENDING").length,
          answeredQs: allQs.filter(q=>q.status==="ANSWERED").length,
          refundedQs: allQs.filter(q=>q.status==="REFUNDED").length,
          totalRevenue: allQs.filter(q=>q.status==="ANSWERED").reduce((s,q)=>s+(q.pricePaid??0),0),
        });
        const rq = await getDocs(query(collection(db,COLLECTIONS.QUESTIONS),orderBy("createdAt","desc"),limit(10)));
        setRecentQs(rq.docs.map(d=>({id:d.id,...d.data()} as FirestoreQuestion)));
      } finally { setDataLoading(false); }
    })();
  }, [userProfile]);

  const loadCreatorQs = useCallback(async (creatorId: string) => {
    setCreatorQsLoading(true);
    const snap = await getDocs(query(collection(db, COLLECTIONS.QUESTIONS), where("creatorId","==",creatorId)));
    setCreatorQs(snap.docs.map(d=>({id:d.id,...d.data()} as FirestoreQuestion)));
    setCreatorQsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedCreator) loadCreatorQs(selectedCreator);
    else setCreatorQs([]);
  }, [selectedCreator, loadCreatorQs]);

  async function handleDeleteCreatorQs() {
    if (!selectedCreator) return;
    const creator = allCreators.find(c=>c.uid===selectedCreator);
    const r = await Swal.fire({ title:`Delete ALL questions for ${creator?.displayName}?`, text:`This will permanently delete ${creatorQs.length} questions. This cannot be undone.`, icon:"warning", showCancelButton:true, confirmButtonColor:"#ef4444", confirmButtonText:"Yes, delete all" });
    if (!r.isConfirmed) return;
    const idToken = await getIdToken(user!);
    const res = await fetch("/api/admin/delete-creator-questions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${idToken}`},body:JSON.stringify({creatorId:selectedCreator})});
    const data = await res.json();
    if (!res.ok) { Swal.fire("Error",data.error,"error"); return; }
    Swal.fire("Deleted!",`${data.deleted} questions removed.`,"success");
    setCreatorQs([]);
  }

  async function handleTogglePublic(q: FirestoreQuestion, makePublic: boolean) {
    if (q.status !== "ANSWERED" && makePublic) { Swal.fire("Not answered","Only answered questions can be shown publicly.","warning"); return; }
    setTogglingPublic(q.id!);
    try {
      const idToken = await getIdToken(user!);
      await fetch("/api/admin/toggle-public-answer",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${idToken}`},body:JSON.stringify({questionId:q.id,isPublic:makePublic})});
      setRecentQs(prev=>prev.map(x=>x.id===q.id?{...x,isPublicAnswer:makePublic}:x));
    } finally { setTogglingPublic(null); }
  }

  async function triggerCron() {
    setCronBusy(true);
    try {
      const res = await fetch("/api/cron/refund-expired",{method:"POST",headers:{Authorization:`Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET||""}`}});
      const d = await res.json();
      Swal.fire("Cron Done ✅",`Refunded: ${d.refunded ?? 0} | Errors: ${d.errors?.length ?? 0}`,"success");
    } catch(e:any){ Swal.fire("Error",e.message,"error"); } finally { setCronBusy(false); }
  }

  async function sendTestEmail() {
    if (!testEmailTo.trim()) { Swal.fire("Enter an email","","warning"); return; }
    setTestBusy(true);
    try {
      const idToken = await getIdToken(user!);
      const res = await fetch("/api/admin/test-email",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${idToken}`},body:JSON.stringify({emailType:testEmailType,to:testEmailTo.trim(),creatorId:selectedCreator})});
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      Swal.fire("Sent! ✉️",`Check ${testEmailTo}`,"success");
    } catch(e:any){ Swal.fire("Error",e.message,"error"); } finally { setTestBusy(false); }
  }

  if (loading || !userProfile) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:48,height:48,border:"4px solid #e5e7eb",borderTop:"4px solid #7c3aed",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/></div>;
  if (!userProfile.isAdmin) return null;

  const answerRate = stats.totalQuestions>0 ? Math.round((stats.answeredQs/stats.totalQuestions)*100) : 0;
  const STATS = [
    {icon:"👥",label:"Users",value:stats.totalUsers,color:"#7c3aed"},
    {icon:"🎓",label:"Creators",value:stats.totalCreators,color:"#a855f7"},
    {icon:"💬",label:"Questions",value:stats.totalQuestions,color:"#f59e0b"},
    {icon:"✅",label:"Answered",value:stats.answeredQs,color:"#22c55e"},
    {icon:"⏳",label:"Pending",value:stats.pendingQs,color:"#f97316"},
    {icon:"💰",label:"Revenue",value:fmt$(stats.totalRevenue),color:"#10b981"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#f9fafb",fontFamily:"'Inter',sans-serif",color:"#111827"}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .admin-card{background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);transition:all 0.2s ease}
        .admin-card:hover{border-color:#7c3aed;transform:translateY(-2px);box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1)}
        .nav-btn{display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 12px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;color:#4b5563;text-decoration:none;font-size:0.75rem;font-weight:700;transition:all 0.18s;cursor:pointer;min-width:80px}
        .nav-btn:hover{background:#f5f3ff;border-color:#7c3aed;color:#7c3aed;transform:translateY(-3px);box-shadow:0 8px 24px rgba(124,58,237,0.15)}
        .stat-card{padding:22px 20px;animation:fadeIn 0.4s ease both}
        .action-btn{padding:10px 20px;border-radius:10px;font-weight:700;font-size:0.85rem;cursor:pointer;border:none;transition:all 0.15s}
        .action-btn:hover{transform:translateY(-1px)}
        .badge{border-radius:99px;padding:2px 10px;font-size:0.7rem;font-weight:700;display:inline-block}
        input,select{background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;color:#111827;padding:10px 14px;font-size:0.9rem;width:100%;box-sizing:border-box;outline:none}
        input:focus,select:focus{border-color:#7c3aed;box-shadow: 0 0 0 2px rgba(124,58,237,0.1)}
        select option{background:#ffffff;color:#111827}
        @media(max-width:700px){.stat-grid{grid-template-columns:repeat(2,1fr)!important}.two-col{grid-template-columns:1fr!important}}
      `}</style>

      {/* TOPBAR */}
      <div style={{background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"0 5%"}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:64}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:36,height:36,background:"linear-gradient(135deg,#7c3aed,#a855f7)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",color:"#fff"}}>⚡</div>
            <div>
              <div style={{fontWeight:900,fontSize:"1.1rem",fontFamily:"'Outfit',sans-serif",color:"#111827"}}>AskExpert Admin</div>
              <div style={{fontSize:"0.68rem",color:"#6b7280",marginTop:-2}}>Super Control Panel</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:"0.8rem",color:"#6b7280"}}>{userProfile.displayName}</span>
            <Link href="/dashboard" style={{padding:"7px 16px",background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:99,color:"#7c3aed",fontSize:"0.8rem",fontWeight:700,textDecoration:"none"}}>← Dashboard</Link>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"32px 5% 80px"}}>

        {/* SECTION: NAV HUB */}
        <div style={{marginBottom:36}}>
          <div style={{fontSize:"0.7rem",fontWeight:800,letterSpacing:"0.12em",color:"rgba(196,181,253,0.5)",textTransform:"uppercase",marginBottom:14}}>Quick Navigation</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {NAV_ITEMS.map(n=>(
              <a key={n.href} href={n.href} target={n.ext?"_blank":"_self"} rel={n.ext?"noopener noreferrer":undefined} className="nav-btn">
                <span style={{fontSize:"1.5rem"}}>{n.icon}</span>
                <span>{n.label}{n.ext&&" ↗"}</span>
              </a>
            ))}
            <button onClick={triggerCron} disabled={cronBusy} className="nav-btn" style={{background:cronBusy?"rgba(255,255,255,0.03)":"rgba(239,68,68,0.1)",borderColor:"rgba(239,68,68,0.3)"}}>
              <span style={{fontSize:"1.5rem"}}>🔁</span>
              <span>{cronBusy?"Running…":"Run Cron"}</span>
            </button>
          </div>
        </div>

        {/* STATS */}
        {dataLoading ? (
          <div style={{textAlign:"center",padding:"40px",color:"rgba(196,181,253,0.5)"}}>Loading stats…</div>
        ) : (
          <>
            <div className="stat-grid" style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:14,marginBottom:28}}>
              {STATS.map((s,i)=>(
                <div key={s.label} className="admin-card stat-card" style={{animationDelay:`${i*0.07}s`}}>
                  <div style={{fontSize:"1.6rem",marginBottom:6}}>{s.icon}</div>
                  <div style={{fontSize:"1.7rem",fontWeight:900,fontFamily:"'Outfit',sans-serif",color:s.color,lineHeight:1}}>{s.value}</div>
                  <div style={{fontSize:"0.72rem",color:"rgba(196,181,253,0.5)",marginTop:4,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* ANSWER RATE */}
            <div className="admin-card" style={{padding:"18px 22px",marginBottom:28}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontWeight:700,fontSize:"0.85rem",color:"#c4b5fd"}}>Platform Answer Rate</span>
                <span style={{fontWeight:900,color:answerRate>=70?"#22c55e":answerRate>=40?"#f97316":"#ef4444"}}>{answerRate}%</span>
              </div>
              <div style={{height:8,background:"rgba(255,255,255,0.07)",borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:99,background:"linear-gradient(90deg,#7c3aed,#a855f7)",width:`${answerRate}%`,transition:"width 0.8s ease"}}/>
              </div>
              <div style={{display:"flex",gap:16,marginTop:10,flexWrap:"wrap"}}>
                {[["Answered",stats.answeredQs,"#22c55e"],["Pending",stats.pendingQs,"#f97316"],["Refunded",stats.refundedQs,"#ef4444"]].map(([l,c,col])=>(
                  <span key={l as string} style={{fontSize:"0.75rem",color:"rgba(196,181,253,0.5)",display:"flex",alignItems:"center",gap:5}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:col as string,display:"inline-block"}}/>
                    {l as string}: <strong style={{color:"#e2d9ff"}}>{c as number}</strong>
                  </span>
                ))}
              </div>
            </div>

            {/* TWO COL */}
            <div className="two-col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:28}}>
              {/* RECENT QUESTIONS with public toggle */}
              <div className="admin-card" style={{overflow:"hidden"}}>
                <div style={{padding:"14px 18px",borderBottom:"1px solid rgba(139,92,246,0.2)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:800,fontSize:"0.85rem",color:"#c4b5fd"}}>💬 Recent Questions</span>
                  <span style={{fontSize:"0.7rem",color:"rgba(196,181,253,0.4)"}}>Last 10 · toggle public</span>
                </div>
                <div style={{maxHeight:380,overflowY:"auto"}}>
                  {recentQs.length===0 ? <p style={{textAlign:"center",color:"rgba(196,181,253,0.3)",padding:"32px 0"}}>No questions</p> : recentQs.map(q=>{
                    const sc = STATUS_COLORS[q.status]??{bg:"#374151",color:"#9ca3af"};
                    const isPublic = !!(q as any).isPublicAnswer;
                    return (
                      <div key={q.id} style={{padding:"12px 18px",borderBottom:"1px solid rgba(255,255,255,0.04)",display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                          <p style={{margin:0,fontSize:"0.8rem",color:"#e2d9ff",fontWeight:600,lineHeight:1.4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{q.content}</p>
                          <span className="badge" style={{background:sc.bg,color:sc.color,flexShrink:0}}>{q.status}</span>
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:"0.7rem",color:"rgba(196,181,253,0.4)"}}>{timeAgo((q as any).createdAt)}</span>
                          <span style={{fontSize:"0.7rem",color:"#a855f7",fontWeight:700}}>{fmt$(q.pricePaid??0)}</span>
                          {q.status==="ANSWERED" && (
                            <button
                              disabled={togglingPublic===q.id}
                              onClick={()=>handleTogglePublic(q,!isPublic)}
                              style={{padding:"2px 10px",borderRadius:99,fontSize:"0.68rem",fontWeight:700,border:"1px solid",cursor:"pointer",background:isPublic?"rgba(34,197,94,0.15)":"rgba(255,255,255,0.05)",color:isPublic?"#22c55e":"rgba(196,181,253,0.5)",borderColor:isPublic?"rgba(34,197,94,0.4)":"rgba(255,255,255,0.1)",transition:"all 0.2s"}}
                            >
                              {togglingPublic===q.id?"…":isPublic?"👁 Public":"🔒 Private"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CREATOR MANAGER */}
              <div className="admin-card" style={{overflow:"hidden"}}>
                <div style={{padding:"14px 18px",borderBottom:"1px solid rgba(139,92,246,0.2)"}}>
                  <span style={{fontWeight:800,fontSize:"0.85rem",color:"#c4b5fd"}}>🎓 Creator Manager</span>
                </div>
                <div style={{padding:"16px 18px",display:"flex",flexDirection:"column",gap:12}}>
                  <div>
                    <label style={{fontSize:"0.72rem",fontWeight:700,color:"rgba(196,181,253,0.5)",display:"block",marginBottom:6}}>Select Creator</label>
                    <select value={selectedCreator} onChange={e=>setSelectedCreator(e.target.value)}>
                      <option value="">— Choose a creator —</option>
                      {allCreators.map(c=><option key={c.uid} value={c.uid!}>{c.displayName} (@{c.username})</option>)}
                    </select>
                  </div>
                  {selectedCreator && (
                    <>
                      {creatorQsLoading ? (
                        <p style={{textAlign:"center",color:"rgba(196,181,253,0.4)",fontSize:"0.8rem"}}>Loading…</p>
                      ) : (
                        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"10px 14px",maxHeight:220,overflowY:"auto"}}>
                          <div style={{fontSize:"0.72rem",fontWeight:700,color:"rgba(196,181,253,0.4)",marginBottom:8}}>
                            {creatorQs.length} questions found
                          </div>
                          {creatorQs.map(q=>{
                            const sc=STATUS_COLORS[q.status]??{bg:"#374151",color:"#9ca3af"};
                            return (
                              <div key={q.id} style={{padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.04)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                                <p style={{margin:0,fontSize:"0.75rem",color:"#c4b5fd",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{q.content}</p>
                                <span className="badge" style={{background:sc.bg,color:sc.color,flexShrink:0}}>{q.status}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <button
                        onClick={handleDeleteCreatorQs}
                        disabled={creatorQsLoading||creatorQs.length===0}
                        className="action-btn"
                        style={{background:"rgba(239,68,68,0.15)",color:"#f87171",border:"1px solid rgba(239,68,68,0.3)",opacity:creatorQs.length===0?0.4:1}}
                      >
                        🗑 Delete All {creatorQs.length} Questions
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* TEST EMAIL */}
            <div className="admin-card" style={{padding:"22px 24px"}}>
              <div style={{fontWeight:800,fontSize:"0.95rem",color:"#c4b5fd",marginBottom:16}}>✉️ Test Emails</div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div style={{flex:"1 1 200px"}}>
                  <label style={{fontSize:"0.72rem",fontWeight:700,color:"rgba(196,181,253,0.5)",display:"block",marginBottom:6}}>Recipient</label>
                  <input type="email" placeholder="you@example.com" value={testEmailTo} onChange={e=>setTestEmailTo(e.target.value)}/>
                </div>
                <div style={{flex:"1 1 200px"}}>
                  <label style={{fontSize:"0.72rem",fontWeight:700,color:"rgba(196,181,253,0.5)",display:"block",marginBottom:6}}>Type</label>
                  <select value={testEmailType} onChange={e=>setTestEmailType(e.target.value)}>
                    <option value="asker_confirmation">✅ Asker Confirmation</option>
                    <option value="new_question_creator">🔔 New Question (creator)</option>
                    <option value="answer">💡 Answer Delivered</option>
                    <option value="refund">💸 Refund</option>
                  </select>
                </div>
                <button onClick={sendTestEmail} disabled={testBusy} className="action-btn" style={{background:testBusy?"rgba(255,255,255,0.05)":"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",flexShrink:0}}>
                  {testBusy?"Sending…":"Send Test ↗"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
