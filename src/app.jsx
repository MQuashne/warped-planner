import { useState, useEffect, useMemo } from "react";

const STAGES = ['VANS', 'OFF THE WALL', 'GHOST', 'BEATBOX', 'VERIZON', 'EAGLE'];
const HOURS  = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

const STAGE_COLOR = {
  'VANS':        '#1d4ed8',
  'OFF THE WALL':'#059669',
  'GHOST':       '#7c3aed',
  'BEATBOX':     '#b45309',
  'VERIZON':     '#dc2626',
  'EAGLE':       '#be185d',
};

// Light tinted backgrounds per stage for schedule rows
const STAGE_TINT = {
  'VANS':        {bg:'#eff6ff', border:'#bfdbfe'},
  'OFF THE WALL':{bg:'#f0fdf4', border:'#bbf7d0'},
  'GHOST':       {bg:'#f5f3ff', border:'#ddd6fe'},
  'BEATBOX':     {bg:'#fefce8', border:'#fde68a'},
  'VERIZON':     {bg:'#fff1f2', border:'#fecdd3'},
  'EAGLE':       {bg:'#fdf4ff', border:'#f0abfc'},
};

// Light-mode tier config: colored text/borders, pale tinted backgrounds
const TIER = {
  1: {label:'T1', name:'Must See',    color:'#dc2626', bg:'#fef2f2', border:'#fca5a5', dot:'🔴'},
  2: {label:'T2', name:'Want to See', color:'#ea580c', bg:'#fff7ed', border:'#fdba74', dot:'🟠'},
  3: {label:'T3', name:'Nice to See', color:'#b45309', bg:'#fffbeb', border:'#fcd34d', dot:'🟡'},
  4: {label:'T4', name:'If Nearby',   color:'#15803d', bg:'#f0fdf4', border:'#86efac', dot:'🟢'},
  5: {label:'?',  name:'Unrated',     color:'#6b7280', bg:'#f9fafb', border:'#e5e7eb', dot:'⚪'},
};

// CSS vars baked in as a style object for the page
const C = {
  pageBg:    '#f3f4f6',
  cardBg:    '#ffffff',
  inputBg:   '#f9fafb',
  border:    '#d1d5db',
  borderDark:'#9ca3af',
  text:      '#111827',
  textMid:   '#374151',
  textMute:  '#6b7280',
  textFaint: '#9ca3af',
  activeTab: '#1d4ed8',
};

const makeDefaultGrid = () => {
  const g = {};
  STAGES.forEach(s => { g[s] = {}; HOURS.forEach(h => { g[s][h] = {min:'', band:''}; }); });
  return g;
};

const slotToMin    = (h, m) => h * 60 + Math.max(0, Math.min(59, parseInt(m) || 0));
const minToDisplay = (m) => {
  const h=Math.floor(m/60), mn=m%60, ap=h>=12?'pm':'am', h12=h>12?h-12:(h||12);
  return `${h12}:${mn.toString().padStart(2,'0')}${ap}`;
};
const hrLabel = (h) => h>12?`${h-12}pm`:h===12?'12pm':`${h}am`;

function estimateDuration(slotGap, buf, fallback) {
  if (slotGap != null) return Math.min(60, Math.max(20, slotGap - buf));
  return Math.min(60, Math.max(20, fallback ?? 45));
}

function computeBreaks(scheduled) {
  const sorted = [...scheduled].sort((a,b) => a.startMin - b.startMin);
  const breaks = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i+1].startMin - sorted[i].endMin;
    if (gap >= 25) breaks.push({duration:gap, after:sorted[i], before:sorted[i+1]});
  }
  return breaks;
}

function getTierConfig(tier) {
  const t = parseFloat(tier);
  if (t <= 1) return TIER[1]; if (t <= 2) return TIER[2];
  if (t <= 3) return TIER[3]; if (t <= 4) return TIER[4];
  return TIER[5];
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab,             setTab]             = useState('grid');
  const [grid,            setGrid]            = useState(makeDefaultGrid());
  const [ratings,         setRatings]         = useState({});
  const [extraBands,      setExtraBands]      = useState([]);
  const [conflictMin,     setConflictMin]     = useState(15);
  const [travelMin,       setTravelMin]       = useState(8);
  const [changeoverBuffer,setChangeoverBuffer]= useState(30);
  const [schedule,        setSchedule]        = useState(null);
  const [loaded,          setLoaded]          = useState(false);
  const [viewMode,        setViewMode]        = useState('list');
  const [resetConfirm,    setResetConfirm]    = useState(false);
  const [preInput,        setPreInput]        = useState('');
  const [importText,      setImportText]      = useState('');
  const [showImport,      setShowImport]      = useState(false);
  const [activeStage,     setActiveStage]     = useState('VANS');
  const [exportCopied,    setExportCopied]    = useState(false);

  useEffect(() => {
    const r = localStorage.getItem('wt4-ratings'); if (r) setRatings(JSON.parse(r));
    const g = localStorage.getItem('wt4-grid');    if (g) setGrid(JSON.parse(g));
    const x = localStorage.getItem('wt4-extra');   if (x) setExtraBands(JSON.parse(x));
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem('wt4-ratings', JSON.stringify(ratings));    }, [ratings,    loaded]);
  useEffect(() => { if (loaded) localStorage.setItem('wt4-grid',    JSON.stringify(grid));       }, [grid,       loaded]);
  useEffect(() => { if (loaded) localStorage.setItem('wt4-extra',   JSON.stringify(extraBands)); }, [extraBands, loaded]);

  const gridBands = useMemo(() => {
    const s = new Set();
    STAGES.forEach(st => HOURS.forEach(h => {
      const c = grid[st]?.[h]; if (c?.band?.trim()) s.add(c.band.trim());
    }));
    return [...s];
  }, [grid]);

  const allBands   = useMemo(() => [...new Set([...gridBands, ...extraBands])].sort(), [gridBands, extraBands]);
  const ratedCount = useMemo(() => allBands.filter(b => ratings[b] && ratings[b] !== 'unrated').length, [allBands, ratings]);

  const setCell = (stage, hour, field, val) => {
    if (field==='min') { val=val.replace(/\D/g,'').slice(0,2); if(val.length===2&&parseInt(val)>59) val='59'; }
    setGrid(g => ({...g,[stage]:{...g[stage],[hour]:{...g[stage][hour],[field]:val}}}));
  };
  const clearGrid = () => { setGrid(makeDefaultGrid()); setSchedule(null); };
  const rate = (band, val) => setRatings(r => ({...r,[band]:val}));

  const addPreBand = () => {
    const n = preInput.trim(); if (!n) return;
    if (!allBands.includes(n)) setExtraBands(e => [...e, n]);
    setPreInput('');
  };

  const bulkImport = () => {
    const newX=[], newR={...ratings};
    importText.split('\n').map(l=>l.trim()).filter(Boolean).forEach(line => {
      const parts = line.split(',').map(p=>p.trim());
      const name = parts[0]; if (!name) return;
      const tp = parts[1]?.toUpperCase()?.replace('T','');
      const tv = ['1','2','3','4'].includes(tp) ? tp : (tp==='SKIP'||tp==='S') ? 'skip' : null;
      if (!allBands.includes(name)&&!newX.includes(name)) newX.push(name);
      if (tv) newR[name]=tv;
    });
    setExtraBands(e=>[...new Set([...e,...newX])]);
    setRatings(newR);
    setImportText(''); setShowImport(false);
  };

  const exportRatings = () => {
    const order=['1','2','3','4','skip','unrated'];
    const lines=[...allBands]
      .sort((a,b)=>{
        const ra=ratings[a]||'unrated',rb=ratings[b]||'unrated';
        return order.indexOf(ra)-order.indexOf(rb)||a.localeCompare(b);
      })
      .map(band=>{
        const r=ratings[band];
        if(!r||r==='unrated') return band;
        if(r==='skip') return `${band}, Skip`;
        return `${band}, T${r}`;
      }).join('\n');
    navigator.clipboard.writeText(lines).then(()=>{
      setExportCopied(true);
      setTimeout(()=>setExportCopied(false),2500);
    });
  };

  const generate = () => {
    const sets=[];
    STAGES.forEach(stage=>{
      const occupied=HOURS
        .filter(h=>grid[stage]?.[h]?.band?.trim())
        .map(h=>({hour:h,min:parseInt(grid[stage][h].min||0),band:grid[stage][h].band.trim()}))
        .sort((a,b)=>slotToMin(a.hour,a.min)-slotToMin(b.hour,b.min));
      const slotGaps=occupied.map((sl,i)=>
        occupied[i+1]?slotToMin(occupied[i+1].hour,occupied[i+1].min)-slotToMin(sl.hour,sl.min):null);
      const knownDurs=slotGaps.filter(g=>g!=null).map(g=>Math.min(60,Math.max(20,g-changeoverBuffer)));
      const avgDur=knownDurs.length?Math.round(knownDurs.reduce((a,b)=>a+b,0)/knownDurs.length):45;
      occupied.forEach((sl,i)=>{
        const rv=ratings[sl.band]; if(rv==='skip') return;
        const tier=!rv||rv==='unrated'?4.5:parseInt(rv);
        const startMin=slotToMin(sl.hour,sl.min);
        const dur=estimateDuration(slotGaps[i],changeoverBuffer,avgDur);
        sets.push({id:`${stage}-${sl.hour}`,stage,band:sl.band,startMin,endMin:startMin+dur,duration:dur,tier});
      });
    });

    sets.sort((a,b)=>a.tier!==b.tier?a.tier-b.tier:a.startMin-b.startMin);
    const scheduled=[], skipped=[], pendingConflicts=[];

    for(const set of sets){
      let cf=null;
      for(const sc of scheduled){
        const ov=Math.min(set.endMin,sc.endMin)-Math.max(set.startMin,sc.startMin);
        const tr=set.stage!==sc.stage?travelMin:0;
        const eff=ov>0?ov+tr:(-ov<tr?tr+ov:0);
        if(eff>conflictMin){cf={sched:sc,overlap:eff};break;}
      }
      if(!cf) scheduled.push({...set});
      else if(set.tier===cf.sched.tier)
        pendingConflicts.push({id:`cf-${set.id}-${cf.sched.id}`,challenger:set,incumbent:cf.sched,overlap:cf.overlap});
      else skipped.push({set,conflict:cf});
    }

    const breaks=pendingConflicts.length===0?computeBreaks(scheduled):[];
    setSchedule({scheduled,skipped,pendingConflicts,breaks});
    setTab('schedule');
  };

  const resolveConflict=(keepSet)=>{
    setSchedule(prev=>{
      const [current,...remaining]=prev.pendingConflicts;
      const dropSet=keepSet.id===current.incumbent.id?current.challenger:current.incumbent;
      let newScheduled=[...prev.scheduled];
      if(keepSet.id===current.challenger.id){
        newScheduled=newScheduled.filter(s=>s.id!==current.incumbent.id);
        newScheduled.push({...current.challenger});
      }
      newScheduled.sort((a,b)=>a.startMin-b.startMin);
      const stillPending=remaining.filter(c=>c.challenger.id!==dropSet.id&&c.incumbent.id!==dropSet.id);
      const collateral=remaining
        .filter(c=>c.challenger.id===dropSet.id||c.incumbent.id===dropSet.id)
        .map(c=>({set:c.challenger.id===dropSet.id?c.challenger:c.incumbent,conflict:{sched:dropSet}}));
      const newSkipped=[...prev.skipped,{set:dropSet,conflict:{sched:keepSet}},...collateral];
      const newBreaks=stillPending.length===0?computeBreaks(newScheduled):[];
      return{...prev,scheduled:newScheduled,skipped:newSkipped,pendingConflicts:stillPending,breaks:newBreaks};
    });
  };

  const resetAll=()=>{
    setRatings({});setGrid(makeDefaultGrid());setExtraBands([]);setSchedule(null);
    ['wt4-ratings','wt4-grid','wt4-extra'].forEach(k=>localStorage.removeItem(k));
    setResetConfirm(false);
  };

  const inp={background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:'8px',padding:'9px 12px',fontSize:'14px',color:C.text,outline:'none',boxSizing:'border-box'};

  return (
    <div style={{minHeight:'100vh',background:C.pageBg,color:C.text,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>

      {/* Header */}
      <div style={{background:'#1d4ed8',padding:'14px 16px',boxShadow:'0 2px 8px rgba(0,0,0,0.2)'}}>
        <div style={{fontWeight:'900',fontSize:'20px',color:'white',letterSpacing:'-0.5px'}}>⚡ Warped Tour Planner</div>
        <div style={{fontSize:'12px',color:'rgba(255,255,255,0.75)',marginTop:'2px'}}>Pre-rate bands now · Enter grid morning-of · Generate plan</div>
      </div>

      {/* Tab bar */}
      <div style={{display:'flex',background:C.cardBg,borderBottom:`2px solid ${C.border}`,overflowX:'auto',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
        {[
          {id:'grid',     label:'📋 Grid'},
          {id:'rate',     label:`⭐ Rate (${ratedCount}/${allBands.length})`},
          {id:'config',   label:'⚙️ Config'},
          {id:'schedule', label:`📅 Plan${schedule?` ✓${schedule.scheduled.length}${schedule.pendingConflicts?.length?` · ${schedule.pendingConflicts.length}⚔️`:''}`:''}`},
        ].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'11px 16px',border:'none',cursor:'pointer',fontSize:'13px',fontWeight:'700',
            whiteSpace:'nowrap',background:'transparent',outline:'none',
            color:tab===t.id?C.activeTab:C.textMute,
            borderBottom:tab===t.id?`3px solid ${C.activeTab}`:'3px solid transparent',
            marginBottom:'-2px',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{padding:'16px',maxWidth:'640px',margin:'0 auto'}}>

        {/* ══ GRID TAB ══ */}
        {tab==='grid'&&(
          <div>
            <datalist id="band-options">
              {allBands.map(b=><option key={b} value={b}/>)}
            </datalist>

            <div style={{fontSize:'13px',color:C.textMid,marginBottom:'14px',lineHeight:'1.5',background:C.cardBg,padding:'10px 12px',borderRadius:'8px',border:`1px solid ${C.border}`}}>
              <strong>Morning-of:</strong> select a stage, then enter the exact minutes and band name for each occupied hour block.
            </div>

            {/* Stage selector */}
            <div style={{display:'flex',gap:'6px',marginBottom:'12px',overflowX:'auto',paddingBottom:'4px'}}>
              {STAGES.map(s=>{
                const count=HOURS.filter(h=>grid[s]?.[h]?.band?.trim()).length;
                const active=activeStage===s;
                return(
                  <button key={s} onClick={()=>setActiveStage(s)} style={{
                    padding:'7px 12px',borderRadius:'8px',border:`2px solid ${active?STAGE_COLOR[s]:C.border}`,
                    cursor:'pointer',fontSize:'12px',fontWeight:'800',whiteSpace:'nowrap',flexShrink:0,
                    background:active?STAGE_COLOR[s]:C.cardBg,
                    color:active?'white':count>0?STAGE_COLOR[s]:C.textMute,
                    position:'relative',boxShadow:active?'0 2px 6px rgba(0,0,0,0.15)':'none',
                  }}>
                    {s}
                    {count>0&&!active&&<span style={{position:'absolute',top:'-5px',right:'-5px',background:STAGE_COLOR[s],color:'white',fontSize:'9px',fontWeight:'900',borderRadius:'10px',padding:'1px 5px',lineHeight:'1.4',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}>{count}</span>}
                  </button>
                );
              })}
            </div>

            {/* Active stage slots */}
            <div style={{background:C.cardBg,borderRadius:'12px',padding:'14px',border:`2px solid ${STAGE_COLOR[activeStage]}`,boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                <span style={{fontWeight:'800',color:STAGE_COLOR[activeStage],fontSize:'14px',letterSpacing:'0.3px'}}>{activeStage} STAGE</span>
                <span style={{fontSize:'12px',color:C.textMute,fontWeight:'600'}}>{HOURS.filter(h=>grid[activeStage]?.[h]?.band?.trim()).length} bands</span>
              </div>

              {HOURS.map(h=>{
                const cell=grid[activeStage]?.[h]||{min:'',band:''};
                const filled=!!cell.band?.trim();
                const rv=filled?ratings[cell.band.trim()]:null;
                const tc=rv&&rv!=='unrated'&&rv!=='skip'?TIER[parseInt(rv)]:null;
                return(
                  <div key={h} style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'6px'}}>
                    <div style={{width:'36px',flexShrink:0,fontSize:'12px',fontWeight:'800',
                      color:filled?STAGE_COLOR[activeStage]:C.textFaint,fontFamily:'monospace',textAlign:'right'}}>
                      {hrLabel(h).replace('am','a').replace('pm','p')}
                    </div>
                    <div style={{
                      display:'flex',alignItems:'center',flex:1,
                      background:filled?(tc?tc.bg:'#f8faff'):C.inputBg,
                      borderRadius:'8px',overflow:'hidden',
                      border:`1.5px solid ${filled?(tc?.border||STAGE_COLOR[activeStage]):C.border}`,
                    }}>
                      <span style={{fontSize:'13px',color:C.textFaint,padding:'0 2px 0 8px',fontFamily:'monospace',userSelect:'none',lineHeight:'34px',flexShrink:0,fontWeight:'700'}}>
                        {h>12?h-12:h}:
                      </span>
                      <input value={cell.min} onChange={e=>setCell(activeStage,h,'min',e.target.value)} placeholder="00"
                        style={{width:'28px',background:'transparent',border:'none',padding:'7px 2px',fontSize:'13px',
                          color:C.text,outline:'none',textAlign:'center',fontFamily:'monospace',fontWeight:'700'}}/>
                      <div style={{width:'1.5px',background:C.border,alignSelf:'stretch',margin:'0 2px'}}/>
                      <input list="band-options" value={cell.band} onChange={e=>setCell(activeStage,h,'band',e.target.value)}
                        placeholder="Band name..."
                        style={{flex:1,background:'transparent',border:'none',padding:'7px 8px',fontSize:'14px',
                          color:tc?tc.color:C.text,outline:'none',fontWeight:filled?'700':'400'}}/>
                      {filled&&tc&&<span style={{fontSize:'11px',color:'white',background:tc.color,paddingRight:'7px',paddingLeft:'7px',fontWeight:'800',alignSelf:'stretch',display:'flex',alignItems:'center',flexShrink:0}}>{tc.label}</span>}
                      {filled&&rv==='skip'&&<span style={{fontSize:'11px',color:'white',background:'#6b7280',paddingRight:'7px',paddingLeft:'7px',fontWeight:'800',alignSelf:'stretch',display:'flex',alignItems:'center',flexShrink:0}}>SKIP</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stage summary */}
            <div style={{background:C.cardBg,borderRadius:'10px',padding:'12px',marginTop:'10px',border:`1px solid ${C.border}`}}>
              <div style={{fontSize:'11px',color:C.textMute,fontWeight:'700',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'8px'}}>All Stages</div>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                {STAGES.map(s=>{
                  const count=HOURS.filter(h=>grid[s]?.[h]?.band?.trim()).length;
                  return(
                    <button key={s} onClick={()=>setActiveStage(s)} style={{
                      display:'flex',alignItems:'center',gap:'5px',padding:'5px 10px',cursor:'pointer',
                      background:count>0?`${STAGE_COLOR[s]}15`:C.inputBg,
                      borderRadius:'6px',border:`1.5px solid ${count>0?STAGE_COLOR[s]:C.border}`,outline:'none',
                    }}>
                      <span style={{fontSize:'12px',color:count>0?STAGE_COLOR[s]:C.textFaint,fontWeight:'800'}}>{s}</span>
                      <span style={{fontSize:'12px',color:count>0?STAGE_COLOR[s]:C.textFaint,fontWeight:'600'}}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{display:'flex',gap:'8px',marginTop:'12px'}}>
              <button onClick={clearGrid} style={{padding:'11px 16px',background:C.cardBg,border:`1.5px solid #dc2626`,borderRadius:'8px',color:'#dc2626',cursor:'pointer',fontSize:'13px',fontWeight:'700',flexShrink:0}}>
                Clear Grid
              </button>
              {allBands.length>0&&(
                <button onClick={()=>setTab('rate')} style={{flex:1,padding:'12px',background:'#1d4ed8',borderRadius:'8px',border:'none',color:'white',fontWeight:'800',cursor:'pointer',fontSize:'14px',boxShadow:'0 2px 6px rgba(29,78,216,0.4)'}}>
                  Rate {allBands.length} Bands →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ══ RATE TAB ══ */}
        {tab==='rate'&&(
          <div>
            <div style={{display:'flex',gap:'5px',flexWrap:'wrap',marginBottom:'12px'}}>
              {[1,2,3,4].map(t=>(
                <span key={t} style={{background:TIER[t].color,padding:'4px 10px',borderRadius:'6px',fontSize:'12px',color:'white',fontWeight:'800',boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}}>
                  {TIER[t].label}: {TIER[t].name}
                </span>
              ))}
              <span style={{background:'#6b7280',padding:'4px 10px',borderRadius:'6px',fontSize:'12px',color:'white',fontWeight:'800'}}>Skip</span>
            </div>
            <div style={{fontSize:'12px',color:C.textMute,marginBottom:'12px',padding:'8px 12px',background:C.cardBg,borderRadius:'8px',border:`1px solid ${C.border}`}}>
              💾 Ratings are saved — pre-rate the announced lineup before event day.
            </div>

            <div style={{display:'flex',gap:'6px',marginBottom:'8px'}}>
              <input value={preInput} onChange={e=>setPreInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addPreBand()}
                placeholder="Add band by name..." style={{...inp,flex:1}}/>
              <button onClick={addPreBand} style={{background:'#1d4ed8',border:'none',borderRadius:'8px',color:'white',padding:'9px 16px',cursor:'pointer',fontSize:'14px',fontWeight:'800',flexShrink:0}}>+</button>
            </div>

            <button onClick={()=>setShowImport(v=>!v)} style={{fontSize:'13px',color:C.activeTab,background:'none',border:'none',cursor:'pointer',marginBottom:'12px',padding:0,fontWeight:'700'}}>
              {showImport?'▲':'▼'} Bulk import (paste list)
            </button>
            {showImport&&(
              <div style={{background:C.cardBg,borderRadius:'10px',padding:'14px',marginBottom:'14px',border:`1px solid ${C.border}`,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                <div style={{fontSize:'12px',color:C.textMid,marginBottom:'8px'}}>One per line. Optional: ", T1" / ", T2" / ", T3" / ", T4" / ", Skip"</div>
                <textarea value={importText} onChange={e=>setImportText(e.target.value)}
                  placeholder={"Jimmy Eat World, T1\nRise Against, T2\nHoobastank, T4\nNickelback, Skip"}
                  rows={5} style={{...inp,width:'100%',fontFamily:'monospace',resize:'vertical'}}/>
                <button onClick={bulkImport} style={{width:'100%',marginTop:'10px',padding:'11px',background:'#1d4ed8',border:'none',borderRadius:'8px',color:'white',fontWeight:'800',cursor:'pointer',fontSize:'14px'}}>Import</button>
              </div>
            )}

            {allBands.length===0?(
              <div style={{textAlign:'center',padding:'40px 0',color:C.textFaint,fontSize:'15px'}}>No bands yet.</div>
            ):(
              <>
                <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'12px'}}>
                  <button onClick={exportRatings} style={{
                    padding:'8px 16px',borderRadius:'8px',border:`1.5px solid ${exportCopied?'#15803d':C.borderDark}`,cursor:'pointer',
                    fontSize:'13px',fontWeight:'700',transition:'all 0.2s',
                    background:exportCopied?'#f0fdf4':C.cardBg,
                    color:exportCopied?'#15803d':C.textMid,
                  }}>
                    {exportCopied?'✓ Copied!':'📋 Export Ratings'}
                  </button>
                </div>

                {['1','2','3','4','skip','unrated'].map(tier=>{
                  const bands=allBands.filter(b=>(ratings[b]||'unrated')===tier);
                  if(!bands.length) return null;
                  const cfg=tier==='unrated'?TIER[5]:tier==='skip'?{color:'#6b7280',bg:'#f9fafb',border:'#e5e7eb',dot:'—',label:'Skip',name:'Excluded'}:TIER[parseInt(tier)];
                  return(
                    <div key={tier} style={{marginBottom:'16px'}}>
                      <div style={{
                        fontSize:'12px',color:cfg.color,fontWeight:'800',textTransform:'uppercase',
                        letterSpacing:'1px',marginBottom:'6px',display:'flex',alignItems:'center',gap:'6px'
                      }}>
                        <div style={{width:'10px',height:'10px',borderRadius:'50%',background:cfg.color,flexShrink:0}}/>
                        {cfg.label} — {cfg.name} <span style={{color:C.textFaint,fontWeight:'600'}}>({bands.length})</span>
                      </div>
                      {bands.map(band=>{
                        const active=ratings[band]||'unrated';
                        return(
                          <div key={band} style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px 12px',background:C.cardBg,borderRadius:'8px',marginBottom:'5px',border:`1px solid ${C.border}`,boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
                            <span style={{flex:1,fontSize:'14px',fontWeight:'600',color:C.text}}>{band}</span>
                            <div style={{display:'flex',gap:'4px'}}>
                              {[{v:'1',l:'T1',c:'#dc2626'},{v:'2',l:'T2',c:'#ea580c'},{v:'3',l:'T3',c:'#b45309'},{v:'4',l:'T4',c:'#15803d'},{v:'skip',l:'✕',c:'#6b7280'}].map(({v,l,c})=>(
                                <button key={v} onClick={()=>rate(band,active===v?'unrated':v)} style={{
                                  padding:'5px 9px',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:'800',
                                  border:active===v?'none':'1.5px solid #e5e7eb',
                                  background:active===v?c:C.cardBg,
                                  color:active===v?'white':C.textMute,
                                  boxShadow:active===v?'0 1px 4px rgba(0,0,0,0.2)':'none',
                                }}>{l}</button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                <button onClick={generate} style={{width:'100%',padding:'14px',background:'#16a34a',borderRadius:'10px',border:'none',color:'white',fontWeight:'800',cursor:'pointer',fontSize:'15px',marginTop:'8px',boxShadow:'0 3px 8px rgba(22,163,74,0.35)'}}>
                  🗓 Generate Optimized Schedule
                </button>
              </>
            )}
          </div>
        )}

        {/* ══ CONFIG TAB ══ */}
        {tab==='config'&&(
          <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
            {[
              {label:'Conflict Threshold', val:conflictMin, set:setConflictMin, min:5, max:30, unit:'min', note:'Overlaps greater than this trigger a real conflict.'},
              {label:'Stage Travel Time',  val:travelMin,   set:setTravelMin,   min:0, max:20, unit:'min', note:'Added to effective overlap when switching stages.'},
              {label:'Changeover Buffer',  val:changeoverBuffer, set:setChangeoverBuffer, min:5, max:45, unit:'min', note:'Subtracted from slot gap to estimate set length. Adjust after day 1.'},
            ].map(({label,val,set,min,max,unit,note})=>(
              <div key={label} style={{background:C.cardBg,borderRadius:'10px',padding:'14px',border:`1px solid ${C.border}`}}>
                <div style={{fontSize:'14px',fontWeight:'700',marginBottom:'8px',color:C.text}}>
                  {label}: <span style={{color:'#1d4ed8'}}>{val} {unit}</span>
                </div>
                <input type="range" min={min} max={max} value={val} onChange={e=>set(+e.target.value)}
                  style={{width:'100%',accentColor:'#1d4ed8',height:'6px'}}/>
                <div style={{fontSize:'12px',color:C.textMute,marginTop:'6px'}}>{note}</div>
              </div>
            ))}

            <div style={{background:C.cardBg,borderRadius:'10px',padding:'14px',border:`1px solid ${C.border}`}}>
              <div style={{fontWeight:'700',fontSize:'14px',marginBottom:'8px',color:C.text}}>How Duration is Estimated</div>
              <div style={{fontSize:'13px',color:C.textMid,lineHeight:'1.7'}}>
                Set length = <strong style={{color:'#1d4ed8'}}>slot gap − changeover buffer</strong>, capped at 60 min.<br/>
                Last band on each stage uses average slot duration as fallback.<br/>
                Tier affects <strong>priority only</strong> — not duration.
              </div>
            </div>

            {!resetConfirm?(
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                <button onClick={()=>{ clearGrid(); setTab('grid'); }} style={{width:'100%',padding:'12px',background:'#1d4ed8',border:'none',borderRadius:'10px',color:'white',cursor:'pointer',fontSize:'14px',fontWeight:'800',boxShadow:'0 2px 6px rgba(29,78,216,0.3)'}}>
                  🌅 New Day — Clear Grid
                </button>
                <button onClick={()=>setResetConfirm(true)} style={{width:'100%',padding:'12px',background:C.cardBg,border:'2px solid #dc2626',borderRadius:'10px',color:'#dc2626',cursor:'pointer',fontSize:'14px',fontWeight:'700'}}>
                  Reset All Saved Data
                </button>
              </div>
            ):(
              <div style={{background:C.cardBg,borderRadius:'10px',padding:'14px',border:`2px solid #dc2626`}}>
                <div style={{textAlign:'center',color:'#dc2626',fontSize:'13px',marginBottom:'12px',fontWeight:'600'}}>Erase all ratings, grid data, and extras?</div>
                <div style={{display:'flex',gap:'8px'}}>
                  <button onClick={resetAll} style={{flex:1,padding:'12px',background:'#dc2626',border:'none',borderRadius:'8px',color:'white',fontWeight:'800',cursor:'pointer',fontSize:'14px'}}>Yes, Reset</button>
                  <button onClick={()=>setResetConfirm(false)} style={{flex:1,padding:'12px',background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:'8px',color:C.textMid,cursor:'pointer',fontSize:'14px',fontWeight:'700'}}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ SCHEDULE TAB ══ */}
        {tab==='schedule'&&(
          !schedule?(
            <div style={{textAlign:'center',padding:'60px 0'}}>
              <div style={{fontSize:'52px',marginBottom:'12px'}}>🎸</div>
              <div style={{color:C.textMute,marginBottom:'20px',fontSize:'15px'}}>{gridBands.length===0?'Enter the grid first.':'Ready to generate!'}</div>
              {gridBands.length>0&&(
                <button onClick={generate} style={{padding:'14px 36px',background:'#16a34a',borderRadius:'10px',border:'none',color:'white',fontWeight:'800',cursor:'pointer',fontSize:'15px',boxShadow:'0 3px 8px rgba(22,163,74,0.35)'}}>
                  Generate Schedule
                </button>
              )}
            </div>
          ):(
            <ScheduleView
              schedule={schedule}
              viewMode={viewMode}
              setViewMode={setViewMode}
              onRegenerate={generate}
              onResolve={resolveConflict}
            />
          )
        )}

      </div>
    </div>
  );
}

// ─── Conflict resolution card ─────────────────────────────────────────────────

function ConflictCard({conflict, total, index, onResolve}) {
  const {incumbent, challenger, overlap} = conflict;
  const cfg = getTierConfig(incumbent.tier);

  const BandChoice = ({set, onPick}) => {
    const sc = STAGE_COLOR[set.stage]||'#1d4ed8';
    return (
      <button onClick={onPick} style={{
        flex:1,padding:'14px 10px',borderRadius:'12px',cursor:'pointer',textAlign:'center',
        background:'white',border:`2px solid ${cfg.color}`,outline:'none',
        boxShadow:'0 2px 8px rgba(0,0,0,0.1)',
        WebkitTapHighlightColor:'transparent',
      }}>
        <div style={{fontWeight:'900',fontSize:'15px',marginBottom:'6px',color:C.text,lineHeight:'1.2'}}>{set.band}</div>
        <div style={{fontSize:'12px',color:sc,fontWeight:'800',marginBottom:'2px'}}>{set.stage}</div>
        <div style={{fontSize:'12px',color:C.textMid,fontWeight:'600'}}>{minToDisplay(set.startMin)}</div>
        <div style={{fontSize:'12px',color:C.textMute}}>~{set.duration}min</div>
        <div style={{marginTop:'10px',padding:'8px 0',background:cfg.color,borderRadius:'8px',fontSize:'13px',fontWeight:'800',color:'white',boxShadow:`0 2px 6px ${cfg.color}55`}}>
          Choose
        </div>
      </button>
    );
  };

  return (
    <div style={{background:cfg.bg,border:`2px solid ${cfg.color}`,borderRadius:'14px',padding:'16px',marginBottom:'16px',boxShadow:'0 3px 10px rgba(0,0,0,0.1)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
        <div style={{fontWeight:'900',fontSize:'14px',color:cfg.color}}>
          ⚔️ {cfg.label} Conflict
        </div>
        <div style={{fontSize:'12px',color:C.textMute,fontWeight:'600',background:C.cardBg,padding:'3px 8px',borderRadius:'20px',border:`1px solid ${C.border}`}}>
          {index+1} of {total}
        </div>
      </div>
      <div style={{fontSize:'12px',color:C.textMid,textAlign:'center',marginBottom:'12px',fontWeight:'600'}}>
        ~{Math.round(overlap)}min overlap — you can only fully see one
      </div>
      <div style={{display:'flex',gap:'10px'}}>
        <BandChoice set={incumbent}  onPick={()=>onResolve(incumbent)}/>
        <div style={{display:'flex',alignItems:'center',color:C.textFaint,fontSize:'14px',fontWeight:'800',flexShrink:0}}>vs</div>
        <BandChoice set={challenger} onPick={()=>onResolve(challenger)}/>
      </div>
    </div>
  );
}

// ─── Schedule view ────────────────────────────────────────────────────────────

function ScheduleView({schedule, viewMode, setViewMode, onRegenerate, onResolve}) {
  const {scheduled, skipped, pendingConflicts, breaks} = schedule;
  const crossTierSkipped = skipped.filter(s=>parseFloat(s.set.tier)>1);

  const TS=10*60, TE=22*60, TSPAN=TE-TS;
  const tleft  = m=>`${Math.max(0,((m-TS)/TSPAN*100)).toFixed(2)}%`;
  const twidth = d=>`${Math.max(0.8,d/TSPAN*100).toFixed(2)}%`;
  const hrs=[10,11,12,13,14,15,16,17,18,19,20,21];
  const hl=h=>h>12?`${h-12}p`:h===12?'12p':`${h}a`;
  const allDisplay=[
    ...scheduled.map(s=>({...s,inSched:true})),
    ...skipped.map(({set})=>({...set,inSched:false})),
    ...pendingConflicts.flatMap(c=>[{...c.incumbent,inSched:false,pending:true},{...c.challenger,inSched:false,pending:true}]),
  ];

  return(
    <div>
      {/* Conflict queue */}
      {pendingConflicts.length>0&&(
        <div>
          <div style={{fontSize:'13px',color:C.textMid,marginBottom:'12px',lineHeight:'1.5',background:C.cardBg,padding:'10px 12px',borderRadius:'8px',border:`1px solid ${C.border}`}}>
            Resolve each conflict below. Cross-tier conflicts were auto-resolved in your favor.
          </div>
          <ConflictCard conflict={pendingConflicts[0]} total={pendingConflicts.length} index={0} onResolve={onResolve}/>
        </div>
      )}

      {/* Summary row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginBottom:'14px'}}>
        {[
          {n:scheduled.length,        l:'Confirmed',  c:'#15803d',bg:'#f0fdf4',border:'#86efac'},
          {n:pendingConflicts.length, l:'To Resolve', c:pendingConflicts.length?'#ea580c':'#9ca3af',bg:pendingConflicts.length?'#fff7ed':'#f9fafb',border:pendingConflicts.length?'#fdba74':'#e5e7eb'},
          {n:breaks.length,           l:'Breaks',     c:breaks.length?'#1d4ed8':'#9ca3af',bg:breaks.length?'#eff6ff':'#f9fafb',border:breaks.length?'#93c5fd':'#e5e7eb'},
        ].map(({n,l,c,bg,border})=>(
          <div key={l} style={{background:bg,borderRadius:'10px',padding:'10px',textAlign:'center',border:`1.5px solid ${border}`}}>
            <div style={{fontSize:'28px',fontWeight:'900',color:c,lineHeight:1}}>{n}</div>
            <div style={{fontSize:'11px',color:C.textMute,marginTop:'3px',fontWeight:'600'}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{display:'flex',gap:'6px',marginBottom:'14px',alignItems:'center'}}>
        {[{v:'list',l:'📋 List'},{v:'timeline',l:'📊 Timeline'}].map(({v,l})=>(
          <button key={v} onClick={()=>setViewMode(v)} style={{
            padding:'8px 16px',borderRadius:'8px',border:`2px solid ${viewMode===v?'#1d4ed8':C.border}`,
            cursor:'pointer',fontSize:'13px',fontWeight:'700',
            background:viewMode===v?'#1d4ed8':C.cardBg,
            color:viewMode===v?'white':C.textMid,
          }}>{l}</button>
        ))}
        <button onClick={onRegenerate} style={{marginLeft:'auto',padding:'8px 14px',borderRadius:'8px',border:`1.5px solid ${C.borderDark}`,background:C.cardBg,color:C.textMid,cursor:'pointer',fontSize:'13px',fontWeight:'700'}}>
          ↻ Regen
        </button>
      </div>

      {/* LIST */}
      {viewMode==='list'&&(
        <div>
          {pendingConflicts.length>0&&(
            <div style={{fontSize:'12px',color:C.textMute,textAlign:'center',padding:'10px 0',fontStyle:'italic'}}>
              Confirmed so far — more will appear as you resolve conflicts above.
            </div>
          )}
          {scheduled.map((set,i)=>{
            const tcfg=getTierConfig(set.tier);
            const stint=STAGE_TINT[set.stage]||{bg:'#f9fafb',border:'#e5e7eb'};
            const scol=STAGE_COLOR[set.stage]||'#1d4ed8';
            const prev=scheduled[i-1];
            const gap=prev?set.startMin-prev.endMin:null;
            return(
              <div key={set.id}>
                {gap!==null&&gap>=25&&(
                  <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 0'}}>
                    <div style={{flex:1,borderTop:`2px dashed #93c5fd`}}/>
                    <div style={{fontSize:'12px',color:'#1d4ed8',background:'#eff6ff',padding:'4px 14px',borderRadius:'20px',whiteSpace:'nowrap',fontWeight:'700',border:'1px solid #93c5fd'}}>
                      🍔 {gap}min free · {minToDisplay(prev.endMin)} – {minToDisplay(set.startMin)}
                    </div>
                    <div style={{flex:1,borderTop:`2px dashed #93c5fd`}}/>
                  </div>
                )}
                <div style={{background:stint.bg,borderRadius:'10px',padding:'12px 14px',marginBottom:'6px',border:`1.5px solid ${stint.border}`,borderLeft:`4px solid ${scol}`,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                        <span style={{fontSize:'15px'}}>{tcfg.dot}</span>
                        <span style={{fontWeight:'800',fontSize:'16px',color:C.text}}>{set.band}</span>
                      </div>
                      <div style={{fontSize:'12px',color:C.textMid,marginTop:'3px',paddingLeft:'21px',fontWeight:'600'}}>
                        <span style={{color:scol,fontWeight:'800'}}>{set.stage}</span>
                        {' '}·{' '}{minToDisplay(set.startMin)} – {minToDisplay(set.endMin)}{' '}·{' '}~{set.duration}min
                      </div>
                    </div>
                    <span style={{background:tcfg.color,color:'white',fontSize:'11px',padding:'3px 8px',borderRadius:'6px',fontWeight:'900',flexShrink:0,marginLeft:'8px'}}>{tcfg.label}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {crossTierSkipped.length>0&&pendingConflicts.length===0&&(
            <div style={{marginTop:'20px',paddingTop:'16px',borderTop:`2px solid ${C.border}`}}>
              <div style={{fontSize:'11px',color:C.textFaint,fontWeight:'700',letterSpacing:'1px',textTransform:'uppercase',marginBottom:'8px'}}>Auto-skipped (lower priority)</div>
              {crossTierSkipped.map(({set,conflict})=>(
                <div key={set.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 12px',background:C.cardBg,borderRadius:'8px',marginBottom:'4px',border:`1px solid ${C.border}`,opacity:0.65}}>
                  <span style={{color:C.textFaint,fontSize:'15px'}}>✗</span>
                  <span style={{fontSize:'13px',color:C.textMid,fontWeight:'600'}}>{set.band}</span>
                  <span style={{fontSize:'12px',color:C.textFaint}}>{set.stage} {minToDisplay(set.startMin)}</span>
                  <span style={{marginLeft:'auto',fontSize:'12px',color:C.textFaint}}>→ {conflict.sched.band}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TIMELINE */}
      {viewMode==='timeline'&&(
        <div style={{overflowX:'auto'}}>
          <div style={{minWidth:'520px',paddingBottom:'8px'}}>
            <div style={{display:'flex',marginLeft:'80px',marginBottom:'6px',position:'relative',height:'16px'}}>
              <div style={{position:'absolute',left:0,right:0}}>
                {hrs.map(h=>(
                  <div key={h} style={{position:'absolute',left:tleft(h*60),fontSize:'10px',color:C.textFaint,transform:'translateX(-50%)',fontWeight:'700'}}>{hl(h)}</div>
                ))}
              </div>
            </div>
            {STAGES.map(stage=>{
              const sSets=allDisplay.filter(s=>s.stage===stage);
              return(
                <div key={stage} style={{display:'flex',alignItems:'center',marginBottom:'5px'}}>
                  <div style={{width:'80px',flexShrink:0,fontSize:'10px',color:STAGE_COLOR[stage],fontWeight:'800',textAlign:'right',paddingRight:'8px',letterSpacing:'-0.3px'}}>{stage}</div>
                  <div style={{flex:1,position:'relative',height:'28px',background:'#e5e7eb',borderRadius:'6px',overflow:'hidden',border:`1px solid ${C.border}`}}>
                    {hrs.map(h=>(<div key={h} style={{position:'absolute',left:tleft(h*60),top:0,bottom:0,borderLeft:'1px solid #d1d5db',pointerEvents:'none'}}/>))}
                    {sSets.map(set=>{
                      const cfg=getTierConfig(set.tier);
                      const short=set.band.length>14?set.band.slice(0,13)+'…':set.band;
                      const alpha=set.inSched?1:set.pending?0.5:0.2;
                      return(
                        <div key={set.id+set.inSched}
                          title={`${set.band} (${minToDisplay(set.startMin)}–${minToDisplay(set.endMin)}) [${cfg.label}]`}
                          style={{position:'absolute',left:tleft(set.startMin),width:twidth(set.duration),top:'2px',bottom:'2px',
                            background:set.inSched||set.pending?cfg.color:'#9ca3af',
                            borderRadius:'4px',opacity:alpha,
                            display:'flex',alignItems:'center',overflow:'hidden',padding:'0 4px',boxSizing:'border-box',cursor:'default',
                            boxShadow:set.inSched?'0 1px 3px rgba(0,0,0,0.2)':'none'}}>
                          <span style={{fontSize:'9px',color:'white',fontWeight:'800',whiteSpace:'nowrap',overflow:'hidden',textShadow:'0 1px 2px rgba(0,0,0,0.3)'}}>
                            {set.inSched?short:''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div style={{display:'flex',gap:'14px',marginTop:'10px',paddingLeft:'80px',flexWrap:'wrap'}}>
              {[1,2,3,4].map(t=>(<div key={t} style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'11px',color:C.textMid,fontWeight:'600'}}><div style={{width:'14px',height:'10px',borderRadius:'3px',background:TIER[t].color,boxShadow:'0 1px 2px rgba(0,0,0,0.15)'}}/>{TIER[t].label}</div>))}
              <div style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'11px',color:C.textMid,fontWeight:'600'}}><div style={{width:'14px',height:'10px',borderRadius:'3px',background:TIER[1].color,opacity:0.5}}/>Pending</div>
              <div style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'11px',color:C.textMid,fontWeight:'600'}}><div style={{width:'14px',height:'10px',borderRadius:'3px',background:'#9ca3af',opacity:0.4}}/>Skipped</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
