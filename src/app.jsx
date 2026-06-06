import { useState, useEffect, useMemo } from "react";

const STAGES = ['VANS', 'OFF THE WALL', 'GHOST', 'BEATBOX', 'VERIZON', 'EAGLE'];
const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

const STAGE_COLOR = {
  'VANS':       '#3B82F6',
  'OFF THE WALL':'#10B981',
  'GHOST':      '#8B5CF6',
  'BEATBOX':    '#F59E0B',
  'VERIZON':    '#EF4444',
  'EAGLE':      '#EC4899',
};

const TIER = {
  1:{label:'T1',name:'Must See',    color:'#ef4444',bg:'rgba(239,68,68,0.12)',  border:'rgba(239,68,68,0.35)',  dot:'🔴'},
  2:{label:'T2',name:'Want to See', color:'#f97316',bg:'rgba(249,115,22,0.12)',border:'rgba(249,115,22,0.35)',dot:'🟠'},
  3:{label:'T3',name:'Nice to See', color:'#eab308',bg:'rgba(234,179,8,0.12)', border:'rgba(234,179,8,0.35)', dot:'🟡'},
  4:{label:'T4',name:'If Nearby',   color:'#22c55e',bg:'rgba(34,197,94,0.10)', border:'rgba(34,197,94,0.28)', dot:'🟢'},
  5:{label:'?', name:'Unrated',     color:'#6b7280',bg:'rgba(107,114,128,0.1)',border:'rgba(107,114,128,0.3)',dot:'⚪'},
};

const makeDefaultGrid = () => {
  const g = {};
  STAGES.forEach(s => { g[s] = {}; HOURS.forEach(h => { g[s][h] = { min:'', band:'' }; }); });
  return g;
};

const slotToMin = (hour, min) => hour * 60 + Math.max(0, Math.min(59, parseInt(min) || 0));
const minToDisplay = (m) => {
  const h=Math.floor(m/60), mn=m%60, ap=h>=12?'pm':'am', h12=h>12?h-12:(h||12);
  return `${h12}:${mn.toString().padStart(2,'0')}${ap}`;
};
const hrLabel = (h) => h>12?`${h-12}pm`:h===12?'12pm':`${h}am`;

// Estimate set duration from the gap to the next set on the same stage.
// slotGap = next_start - this_start; subtract changeover buffer for stage reset time.
// stageFallback is used for the last band on a stage (no next start known).
function estimateDuration(slotGap, changeoverBuffer, stageFallback) {
  if (slotGap != null) return Math.min(60, Math.max(20, slotGap - changeoverBuffer));
  return Math.min(60, Math.max(20, stageFallback ?? 45));
}

export default function App() {
  const [tab, setTab] = useState('grid');
  const [grid, setGrid] = useState(makeDefaultGrid());
  const [ratings, setRatings] = useState({});
  const [extraBands, setExtraBands] = useState([]);
  const [conflictMin, setConflictMin] = useState(15);
  const [travelMin, setTravelMin] = useState(8);
  const [changeoverBuffer, setChangeoverBuffer] = useState(30);
  const [schedule, setSchedule] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [resetConfirm, setResetConfirm] = useState(false);
  const [preInput, setPreInput] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [activeStage, setActiveStage] = useState('VANS');
  const [exportCopied, setExportCopied] = useState(false);

  // ── Load from localStorage (synchronous, no async needed) ──
  useEffect(() => {
    const r = localStorage.getItem('wt4-ratings'); if (r) setRatings(JSON.parse(r));
    const g = localStorage.getItem('wt4-grid');    if (g) setGrid(JSON.parse(g));
    const x = localStorage.getItem('wt4-extra');   if (x) setExtraBands(JSON.parse(x));
    setLoaded(true);
  }, []);

  // ── Save to localStorage ──
  useEffect(() => { if (loaded) localStorage.setItem('wt4-ratings', JSON.stringify(ratings)); }, [ratings, loaded]);
  useEffect(() => { if (loaded) localStorage.setItem('wt4-grid',    JSON.stringify(grid));    }, [grid,    loaded]);
  useEffect(() => { if (loaded) localStorage.setItem('wt4-extra',   JSON.stringify(extraBands)); }, [extraBands, loaded]);

  const gridBands = useMemo(() => {
    const s = new Set();
    STAGES.forEach(st => HOURS.forEach(h => { const c=grid[st]?.[h]; if(c?.band?.trim()) s.add(c.band.trim()); }));
    return [...s];
  }, [grid]);

  const allBands = useMemo(() => [...new Set([...gridBands, ...extraBands])].sort(), [gridBands, extraBands]);
  const ratedCount = useMemo(() => allBands.filter(b => ratings[b] && ratings[b] !== 'unrated').length, [allBands, ratings]);

  const setCell = (stage, hour, field, val) => {
    if (field==='min') { val=val.replace(/\D/g,'').slice(0,2); if(val.length===2&&parseInt(val)>59) val='59'; }
    setGrid(g => ({...g, [stage]:{...g[stage], [hour]:{...g[stage][hour], [field]:val}}}));
  };

  const clearGrid = () => { setGrid(makeDefaultGrid()); setSchedule(null); };
  const rate = (band, val) => setRatings(r => ({...r, [band]:val}));

  const addPreBand = () => {
    const n = preInput.trim(); if (!n) return;
    if (!allBands.includes(n)) setExtraBands(e => [...e, n]);
    setPreInput('');
  };

  const bulkImport = () => {
    const newX=[], newR={...ratings};
    importText.split('\n').map(l=>l.trim()).filter(Boolean).forEach(line => {
      const parts = line.split(',').map(p => p.trim());
      const name = parts[0]; if (!name) return;
      const tp = parts[1]?.toUpperCase()?.replace('T','');
      const tv = ['1','2','3','4'].includes(tp) ? tp : (tp==='SKIP'||tp==='S') ? 'skip' : null;
      if (!allBands.includes(name) && !newX.includes(name)) newX.push(name);
      if (tv) newR[name] = tv;
    });
    setExtraBands(e => [...new Set([...e, ...newX])]);
    setRatings(newR);
    setImportText(''); setShowImport(false);
  };

  // ── Export ratings back to importable text format ──
  const exportRatings = () => {
    const tierOrder = ['1','2','3','4','skip','unrated'];
    const lines = [...allBands]
      .sort((a,b) => {
        const ra = ratings[a]||'unrated', rb = ratings[b]||'unrated';
        return tierOrder.indexOf(ra) - tierOrder.indexOf(rb) || a.localeCompare(b);
      })
      .map(band => {
        const r = ratings[band];
        if (!r || r === 'unrated') return band;
        if (r === 'skip') return `${band}, Skip`;
        return `${band}, T${r}`;
      })
      .join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2500);
    });
  };

  const generate = () => {
    const sets = [];
    STAGES.forEach(stage => {
      const occupied = HOURS
        .filter(h => grid[stage]?.[h]?.band?.trim())
        .map(h => ({hour:h, min:parseInt(grid[stage][h].min||0), band:grid[stage][h].band.trim()}))
        .sort((a,b) => slotToMin(a.hour,a.min) - slotToMin(b.hour,b.min));

      // Slot gaps → durations; average used as fallback for last band
      const slotGaps = occupied.map((sl,i) =>
        occupied[i+1] ? slotToMin(occupied[i+1].hour, occupied[i+1].min) - slotToMin(sl.hour, sl.min) : null
      );
      const knownDurs = slotGaps
        .filter(g => g != null)
        .map(g => Math.min(60, Math.max(20, g - changeoverBuffer)));
      const avgDur = knownDurs.length
        ? Math.round(knownDurs.reduce((a,b) => a+b, 0) / knownDurs.length)
        : 45;

      occupied.forEach((sl,i) => {
        const rv = ratings[sl.band]; if (rv==='skip') return;
        // T1–T4 map to priority 1–4; unrated gets lowest priority 4.5
        const tier = !rv||rv==='unrated' ? 4.5 : parseInt(rv);
        const startMin = slotToMin(sl.hour, sl.min);
        const dur = estimateDuration(slotGaps[i], changeoverBuffer, avgDur);
        sets.push({id:`${stage}-${sl.hour}`, stage, band:sl.band, startMin, endMin:startMin+dur, duration:dur, tier});
      });
    });

    sets.sort((a,b) => a.tier!==b.tier ? a.tier-b.tier : a.startMin-b.startMin);

    const scheduled=[], skipped=[];
    for (const set of sets) {
      let cf = null;
      for (const sc of scheduled) {
        const ov  = Math.min(set.endMin,sc.endMin) - Math.max(set.startMin,sc.startMin);
        const tr  = set.stage!==sc.stage ? travelMin : 0;
        const eff = ov>0 ? ov+tr : (-ov<tr ? tr+ov : 0);
        if (eff>conflictMin) { cf={sched:sc, overlap:eff}; break; }
      }
      if (!cf) scheduled.push({...set}); else skipped.push({set, conflict:cf});
    }
    scheduled.sort((a,b) => a.startMin-b.startMin);

    const breaks = [];
    for (let i=0; i<scheduled.length-1; i++) {
      const gap = scheduled[i+1].startMin - scheduled[i].endMin;
      if (gap>=25) breaks.push({duration:gap, after:scheduled[i], before:scheduled[i+1]});
    }
    setSchedule({scheduled, skipped, breaks});
    setTab('schedule');
  };

  const resetAll = () => {
    setRatings({}); setGrid(makeDefaultGrid()); setExtraBands([]); setSchedule(null);
    ['wt4-ratings','wt4-grid','wt4-extra'].forEach(k => localStorage.removeItem(k));
    setResetConfirm(false);
  };

  const inp = {background:'#111122',border:'1px solid #1e1e3a',borderRadius:'6px',padding:'7px 10px',fontSize:'13px',color:'white',outline:'none',boxSizing:'border-box'};

  return (
    <div style={{minHeight:'100vh',background:'#06060e',color:'white',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>

      {/* Header */}
      <div style={{background:'#0b0b1a',borderBottom:'1px solid #181830',padding:'14px 16px'}}>
        <div style={{fontWeight:'800',fontSize:'19px',letterSpacing:'-0.5px'}}>⚡ Warped Tour Planner</div>
        <div style={{fontSize:'11px',color:'#444',marginTop:'2px'}}>Pre-rate bands now · Enter grid morning-of · Generate plan</div>
      </div>

      {/* Tab bar */}
      <div style={{display:'flex',background:'#0b0b1a',borderBottom:'1px solid #181830',overflowX:'auto'}}>
        {[
          {id:'grid',     label:'📋 Grid'},
          {id:'rate',     label:`⭐ Rate (${ratedCount}/${allBands.length})`},
          {id:'config',   label:'⚙️ Config'},
          {id:'schedule', label:`📅 Plan${schedule?` ✓${schedule.scheduled.length}`:''}`},
        ].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'10px 16px',border:'none',cursor:'pointer',fontSize:'13px',whiteSpace:'nowrap',
            background:'transparent',outline:'none',
            fontWeight:tab===t.id?'700':'400',color:tab===t.id?'white':'#555',
            borderBottom:tab===t.id?'2px solid #3B82F6':'2px solid transparent'
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{padding:'16px',maxWidth:'640px',margin:'0 auto'}}>

        {/* ══════════════ GRID TAB ══════════════ */}
        {tab==='grid'&&(
          <div>
            <div style={{fontSize:'12px',color:'#555',marginBottom:'14px',lineHeight:'1.6'}}>
              <strong style={{color:'#888'}}>Morning-of:</strong> select a stage, then for each hour block that has a band, enter the exact minutes and band name.
            </div>

            {/* Stage selector */}
            <div style={{display:'flex',gap:'5px',marginBottom:'12px',overflowX:'auto',paddingBottom:'2px'}}>
              {STAGES.map(s => {
                const count = HOURS.filter(h=>grid[s]?.[h]?.band?.trim()).length;
                return (
                  <button key={s} onClick={()=>setActiveStage(s)} style={{
                    padding:'6px 11px',borderRadius:'6px',border:'none',cursor:'pointer',
                    fontSize:'12px',fontWeight:'700',whiteSpace:'nowrap',flexShrink:0,position:'relative',
                    background:activeStage===s?STAGE_COLOR[s]:'#0b0b1a',
                    color:activeStage===s?'white':count>0?STAGE_COLOR[s]:'#444',
                    outline:activeStage===s?`2px solid ${STAGE_COLOR[s]}44`:'2px solid transparent',
                  }}>
                    {s}
                    {count>0&&activeStage!==s&&(
                      <span style={{position:'absolute',top:'-4px',right:'-4px',background:STAGE_COLOR[s],color:'white',fontSize:'9px',fontWeight:'800',borderRadius:'8px',padding:'1px 4px',lineHeight:'1.4'}}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active stage hour grid */}
            <div style={{background:'#0b0b1a',borderRadius:'10px',padding:'14px',borderLeft:`3px solid ${STAGE_COLOR[activeStage]}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                <span style={{fontWeight:'700',color:STAGE_COLOR[activeStage],fontSize:'13px',letterSpacing:'0.5px'}}>{activeStage} STAGE</span>
                <span style={{fontSize:'11px',color:'#333'}}>{HOURS.filter(h=>grid[activeStage]?.[h]?.band?.trim()).length} bands entered</span>
              </div>

              {HOURS.map(h => {
                const cell = grid[activeStage]?.[h]||{min:'',band:''};
                const filled = !!cell.band?.trim();
                const rv = filled ? ratings[cell.band.trim()] : null;
                const tc = rv&&rv!=='unrated'&&rv!=='skip'?TIER[parseInt(rv)]:null;
                return (
                  <div key={h} style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'5px'}}>
                    <div style={{width:'38px',flexShrink:0,fontSize:'12px',fontWeight:'700',
                      color:filled?STAGE_COLOR[activeStage]:'#1e1e38',fontFamily:'monospace',textAlign:'right'}}>
                      {hrLabel(h).replace('am','a').replace('pm','p')}
                    </div>
                    <div style={{display:'flex',alignItems:'center',flex:1,background:'#111122',borderRadius:'7px',overflow:'hidden',
                      border:filled?`1px solid ${tc?.color||STAGE_COLOR[activeStage]}44`:'1px solid #1a1a2e'}}>
                      <span style={{fontSize:'12px',color:'#2a2a4a',padding:'0 2px 0 8px',fontFamily:'monospace',userSelect:'none',lineHeight:'32px',flexShrink:0}}>
                        {h>12?h-12:h}:
                      </span>
                      <input value={cell.min} onChange={e=>setCell(activeStage,h,'min',e.target.value)} placeholder="00"
                        style={{width:'26px',background:'transparent',border:'none',padding:'6px 2px',fontSize:'12px',
                          color:filled?'#aaa':'#2a2a4a',outline:'none',textAlign:'center',fontFamily:'monospace'}} />
                      <div style={{width:'1px',background:'#1a1a2e',alignSelf:'stretch',margin:'0 2px'}}/>
                      <input value={cell.band} onChange={e=>setCell(activeStage,h,'band',e.target.value)}
                        placeholder={filled?'':' Band name...'}
                        style={{flex:1,background:'transparent',border:'none',padding:'6px 8px',fontSize:'13px',
                          color:tc?.color||'white',outline:'none'}} />
                      {filled&&tc&&(
                        <span style={{fontSize:'10px',color:tc.color,paddingRight:'8px',fontWeight:'800',opacity:0.9,flexShrink:0}}>{tc.label}</span>
                      )}
                      {filled&&rv==='skip'&&(
                        <span style={{fontSize:'10px',color:'#374151',paddingRight:'8px',fontWeight:'800',flexShrink:0}}>✕</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stage summary */}
            <div style={{background:'#0b0b1a',borderRadius:'8px',padding:'12px',marginTop:'10px',border:'1px solid #181830'}}>
              <div style={{fontSize:'10px',color:'#333',fontWeight:'700',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'8px'}}>All Stages</div>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                {STAGES.map(s => {
                  const count = HOURS.filter(h=>grid[s]?.[h]?.band?.trim()).length;
                  return (
                    <button key={s} onClick={()=>setActiveStage(s)} style={{
                      display:'flex',alignItems:'center',gap:'4px',padding:'4px 9px',cursor:'pointer',
                      background:count>0?`${STAGE_COLOR[s]}14`:'transparent',
                      borderRadius:'5px',border:`1px solid ${count>0?STAGE_COLOR[s]+'30':'#1e1e38'}`,outline:'none'
                    }}>
                      <span style={{fontSize:'11px',color:count>0?STAGE_COLOR[s]:'#2a2a4a',fontWeight:'700'}}>{s}</span>
                      <span style={{fontSize:'11px',color:count>0?STAGE_COLOR[s]:'#2a2a4a',opacity:0.6}}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{display:'flex',gap:'8px',marginTop:'10px'}}>
              <button onClick={clearGrid} style={{padding:'10px 14px',background:'transparent',border:'1px solid rgba(239,68,68,0.25)',borderRadius:'8px',color:'#ef4444',cursor:'pointer',fontSize:'12px',fontWeight:'700',flexShrink:0}}>
                Clear Grid
              </button>
              {allBands.length>0&&(
                <button onClick={()=>setTab('rate')} style={{flex:1,padding:'11px',background:'#1d4ed8',borderRadius:'8px',border:'none',color:'white',fontWeight:'700',cursor:'pointer',fontSize:'13px'}}>
                  Rate {allBands.length} Bands →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ══════════════ RATE TAB ══════════════ */}
        {tab==='rate'&&(
          <div>
            {/* Tier legend */}
            <div style={{display:'flex',gap:'5px',flexWrap:'wrap',marginBottom:'10px'}}>
              {[1,2,3,4].map(t=>(
                <span key={t} style={{background:TIER[t].color,padding:'3px 8px',borderRadius:'4px',fontSize:'11px',color:'white',fontWeight:'700'}}>
                  {TIER[t].label}: {TIER[t].name}
                </span>
              ))}
              <span style={{background:'#374151',padding:'3px 8px',borderRadius:'4px',fontSize:'11px',color:'#aaa'}}>Skip: Exclude</span>
            </div>
            <div style={{fontSize:'11px',color:'#444',marginBottom:'12px'}}>💾 Ratings persist — pre-rate the announced lineup before event day.</div>

            {/* Add single band */}
            <div style={{display:'flex',gap:'6px',marginBottom:'6px'}}>
              <input value={preInput} onChange={e=>setPreInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addPreBand()}
                placeholder="Add band by name..." style={{...inp,flex:1}} />
              <button onClick={addPreBand} style={{background:'#1d4ed8',border:'none',borderRadius:'6px',color:'white',padding:'7px 14px',cursor:'pointer',fontSize:'13px',fontWeight:'700',flexShrink:0}}>+</button>
            </div>

            {/* Bulk import toggle */}
            <button onClick={()=>setShowImport(v=>!v)} style={{fontSize:'12px',color:'#444',background:'none',border:'none',cursor:'pointer',marginBottom:'12px',padding:0}}>
              {showImport?'▲':'▼'} Bulk import (paste list)
            </button>
            {showImport&&(
              <div style={{background:'#0b0b1a',borderRadius:'8px',padding:'12px',marginBottom:'14px',border:'1px solid #181830'}}>
                <div style={{fontSize:'11px',color:'#444',marginBottom:'6px'}}>One band per line. Optional: ", T1" / ", T2" / ", T3" / ", T4" / ", Skip"</div>
                <textarea value={importText} onChange={e=>setImportText(e.target.value)}
                  placeholder={"Jimmy Eat World, T1\nRise Against, T1\nSleeping With Sirens, T2\nHoobastank, T4\nNickelback, Skip"}
                  rows={5} style={{...inp,width:'100%',fontFamily:'monospace',resize:'vertical'}} />
                <button onClick={bulkImport} style={{width:'100%',marginTop:'8px',padding:'9px',background:'#1d4ed8',border:'none',borderRadius:'6px',color:'white',fontWeight:'700',cursor:'pointer',fontSize:'13px'}}>Import</button>
              </div>
            )}

            {allBands.length===0?(
              <div style={{textAlign:'center',padding:'40px 0',color:'#2a2a4a',fontSize:'14px'}}>No bands yet. Add above or fill in the grid.</div>
            ):(
              <>
                {/* Export button */}
                <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'12px'}}>
                  <button onClick={exportRatings} style={{
                    padding:'7px 14px',borderRadius:'7px',border:'1px solid #1e1e3a',cursor:'pointer',
                    fontSize:'12px',fontWeight:'700',
                    background:exportCopied?'rgba(34,197,94,0.15)':'#0b0b1a',
                    color:exportCopied?'#22c55e':'#888',
                    transition:'all 0.2s'
                  }}>
                    {exportCopied?'✓ Copied!':'📋 Export Ratings'}
                  </button>
                </div>

                {/* Band list grouped by tier */}
                {['1','2','3','4','skip','unrated'].map(tier=>{
                  const bands = allBands.filter(b=>(ratings[b]||'unrated')===tier);
                  if (!bands.length) return null;
                  const cfg = tier==='unrated'?TIER[5]:tier==='skip'?{color:'#374151',dot:'—',label:'Skip',name:'Excluded'}:TIER[parseInt(tier)];
                  return (
                    <div key={tier} style={{marginBottom:'14px'}}>
                      <div style={{fontSize:'11px',color:tier==='unrated'?'#2a2a4a':cfg.color,fontWeight:'700',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'5px'}}>
                        {cfg.dot} {cfg.label} — {cfg.name} ({bands.length})
                      </div>
                      {bands.map(band=>(
                        <div key={band} style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 10px',background:'#0b0b1a',borderRadius:'7px',marginBottom:'4px'}}>
                          <span style={{flex:1,fontSize:'13px'}}>{band}</span>
                          <div style={{display:'flex',gap:'3px'}}>
                            {[
                              {v:'1',l:'T1',c:'#ef4444'},
                              {v:'2',l:'T2',c:'#f97316'},
                              {v:'3',l:'T3',c:'#eab308'},
                              {v:'4',l:'T4',c:'#22c55e'},
                              {v:'skip',l:'✕',c:'#374151'},
                            ].map(({v,l,c})=>{
                              const active=(ratings[band]||'unrated')===v;
                              return (
                                <button key={v} onClick={()=>rate(band,active?'unrated':v)} style={{
                                  padding:'4px 8px',borderRadius:'5px',cursor:'pointer',fontSize:'11px',fontWeight:'700',
                                  border:active?`2px solid ${c}`:'2px solid transparent',
                                  background:active?c:'#111122',color:active?'white':'#444'
                                }}>{l}</button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}

                <button onClick={generate} style={{width:'100%',padding:'12px',background:'#16a34a',borderRadius:'8px',border:'none',color:'white',fontWeight:'700',cursor:'pointer',fontSize:'14px',marginTop:'8px'}}>
                  🗓 Generate Optimized Schedule
                </button>
              </>
            )}
          </div>
        )}

        {/* ══════════════ CONFIG TAB ══════════════ */}
        {tab==='config'&&(
          <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
            <div>
              <div style={{fontSize:'13px',fontWeight:'700',marginBottom:'8px'}}>Conflict Threshold: <span style={{color:'#60a5fa'}}>{conflictMin} min</span></div>
              <input type="range" min="5" max="30" value={conflictMin} onChange={e=>setConflictMin(+e.target.value)} style={{width:'100%',accentColor:'#3B82F6'}} />
              <div style={{fontSize:'11px',color:'#444',marginTop:'5px'}}>Overlaps greater than this trigger a real conflict. 15 min = you'd miss a significant chunk of an opener.</div>
            </div>
            <div>
              <div style={{fontSize:'13px',fontWeight:'700',marginBottom:'8px'}}>Stage Travel Time: <span style={{color:'#60a5fa'}}>{travelMin} min</span></div>
              <input type="range" min="0" max="20" value={travelMin} onChange={e=>setTravelMin(+e.target.value)} style={{width:'100%',accentColor:'#3B82F6'}} />
              <div style={{fontSize:'11px',color:'#444',marginTop:'5px'}}>Added to effective overlap when switching stages. 8 min is a reasonable festival walk.</div>
            </div>
            <div>
              <div style={{fontSize:'13px',fontWeight:'700',marginBottom:'8px'}}>Stage Changeover Buffer: <span style={{color:'#60a5fa'}}>{changeoverBuffer} min</span></div>
              <input type="range" min="5" max="45" value={changeoverBuffer} onChange={e=>setChangeoverBuffer(+e.target.value)} style={{width:'100%',accentColor:'#3B82F6'}} />
              <div style={{fontSize:'11px',color:'#444',marginTop:'5px'}}>
                Subtracted from each slot gap to estimate set length. If a slot is 61 min long and buffer is 30, the set is estimated at 31 min. Adjust after day 1 if estimates feel off.
              </div>
            </div>
            <div style={{background:'#0b0b1a',borderRadius:'10px',padding:'14px',border:'1px solid #181830'}}>
              <div style={{fontWeight:'700',fontSize:'13px',marginBottom:'8px'}}>How Duration is Estimated</div>
              <div style={{fontSize:'12px',color:'#888',lineHeight:'1.7'}}>
                Set length = <span style={{color:'#60a5fa'}}>slot gap − changeover buffer</span>, capped at 60 min.<br/>
                For the <span style={{color:'#aaa'}}>last band on each stage</span> (no next start time known), the average slot duration on that stage is used as a fallback.<br/>
                Tier affects <span style={{color:'#aaa'}}>scheduling priority only</span> — not duration.
              </div>
            </div>
            {!resetConfirm?(
              <button onClick={()=>setResetConfirm(true)} style={{width:'100%',padding:'11px',background:'transparent',border:'1px solid rgba(239,68,68,0.25)',borderRadius:'8px',color:'#ef4444',cursor:'pointer',fontSize:'13px',fontWeight:'700'}}>
                Reset All Saved Data
              </button>
            ):(
              <div>
                <div style={{textAlign:'center',color:'#ef4444',fontSize:'12px',marginBottom:'10px'}}>Erase all ratings, grid data, and extras?</div>
                <div style={{display:'flex',gap:'8px'}}>
                  <button onClick={resetAll} style={{flex:1,padding:'11px',background:'#ef4444',border:'none',borderRadius:'8px',color:'white',fontWeight:'700',cursor:'pointer',fontSize:'13px'}}>Yes, Reset</button>
                  <button onClick={()=>setResetConfirm(false)} style={{flex:1,padding:'11px',background:'#181830',border:'none',borderRadius:'8px',color:'#aaa',cursor:'pointer',fontSize:'13px'}}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ SCHEDULE TAB ══════════════ */}
        {tab==='schedule'&&(
          !schedule?(
            <div style={{textAlign:'center',padding:'60px 0'}}>
              <div style={{fontSize:'48px',marginBottom:'12px'}}>🎸</div>
              <div style={{color:'#333',marginBottom:'20px',fontSize:'14px'}}>{gridBands.length===0?'Enter the grid first.':'Ready to generate!'}</div>
              {gridBands.length>0&&(
                <button onClick={generate} style={{padding:'12px 32px',background:'#16a34a',borderRadius:'8px',border:'none',color:'white',fontWeight:'700',cursor:'pointer',fontSize:'14px'}}>
                  Generate Schedule
                </button>
              )}
            </div>
          ):(
            <ScheduleView schedule={schedule} viewMode={viewMode} setViewMode={setViewMode} onRegenerate={generate} />
          )
        )}

      </div>
    </div>
  );
}

function ScheduleView({schedule, viewMode, setViewMode, onRegenerate}) {
  const {scheduled, skipped, breaks} = schedule;
  const tc = (tier) => { const t=parseFloat(tier); if(t<=1)return TIER[1]; if(t<=2)return TIER[2]; if(t<=3)return TIER[3]; if(t<=4)return TIER[4]; return TIER[5]; };
  const t1Sk = skipped.filter(s=>parseFloat(s.set.tier)<=1);
  const t2Sk = skipped.filter(s=>parseFloat(s.set.tier)>1&&parseFloat(s.set.tier)<=2);

  // Timeline geometry
  const TS=10*60, TE=22*60, TSPAN=TE-TS;
  const tleft  = (m) => `${Math.max(0,((m-TS)/TSPAN*100)).toFixed(2)}%`;
  const twidth = (d) => `${Math.max(0.8,d/TSPAN*100).toFixed(2)}%`;
  const hrs = [10,11,12,13,14,15,16,17,18,19,20,21];
  const hl  = (h) => h>12?`${h-12}p`:h===12?'12p':`${h}a`;
  const allDisplay = [...scheduled.map(s=>({...s,inSched:true})), ...skipped.map(({set})=>({...set,inSched:false}))];

  return (
    <div>
      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginBottom:'14px'}}>
        {[
          {n:scheduled.length, l:'Scheduled', c:'#16a34a', bg:'rgba(22,163,74,0.08)'},
          {n:skipped.length,   l:'Conflicts', c:skipped.length?'#ef4444':'#2a2a4a', bg:skipped.length?'rgba(239,68,68,0.08)':'rgba(15,15,25,0.5)'},
          {n:breaks.length,    l:'Breaks',    c:breaks.length?'#60a5fa':'#2a2a4a',  bg:breaks.length?'rgba(96,165,250,0.08)':'rgba(15,15,25,0.5)'},
        ].map(({n,l,c,bg})=>(
          <div key={l} style={{background:bg,borderRadius:'8px',padding:'10px',textAlign:'center'}}>
            <div style={{fontSize:'26px',fontWeight:'800',color:c}}>{n}</div>
            <div style={{fontSize:'10px',color:'#555',marginTop:'2px'}}>{l}</div>
          </div>
        ))}
      </div>

      {/* View + regen controls */}
      <div style={{display:'flex',gap:'6px',marginBottom:'14px',alignItems:'center'}}>
        {[{v:'list',l:'📋 List'},{v:'timeline',l:'📊 Timeline'}].map(({v,l})=>(
          <button key={v} onClick={()=>setViewMode(v)} style={{padding:'6px 14px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'12px',fontWeight:'700',background:viewMode===v?'#1d4ed8':'#0b0b1a',color:viewMode===v?'white':'#555'}}>
            {l}
          </button>
        ))}
        <button onClick={onRegenerate} style={{marginLeft:'auto',padding:'6px 12px',borderRadius:'6px',border:'1px solid #181830',background:'transparent',color:'#555',cursor:'pointer',fontSize:'12px'}}>↻ Regen</button>
      </div>

      {/* T1 conflict alert */}
      {t1Sk.length>0&&(
        <div style={{background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:'8px',padding:'12px',marginBottom:'14px'}}>
          <div style={{color:'#ef4444',fontWeight:'700',fontSize:'13px',marginBottom:'8px'}}>⚠️ Must-See Conflicts — Decide Manually</div>
          {t1Sk.map(({set,conflict})=>(
            <div key={set.id} style={{fontSize:'12px',lineHeight:'1.8',marginBottom:'3px'}}>
              <span style={{color:'#fca5a5',fontWeight:'700'}}>{set.band}</span>
              <span style={{color:'#777'}}> @{set.stage} {minToDisplay(set.startMin)} ↔ </span>
              <span style={{color:'#fca5a5',fontWeight:'700'}}>{conflict.sched.band}</span>
              <span style={{color:'#777'}}> @{conflict.sched.stage} {minToDisplay(conflict.sched.startMin)}</span>
              <span style={{color:'#f97316',fontWeight:'600'}}> ~{Math.round(conflict.overlap)}min overlap</span>
            </div>
          ))}
        </div>
      )}

      {/* T2 skipped notice */}
      {t2Sk.length>0&&(
        <div style={{background:'rgba(249,115,22,0.05)',border:'1px solid rgba(249,115,22,0.18)',borderRadius:'8px',padding:'10px',marginBottom:'14px'}}>
          <div style={{color:'#f97316',fontWeight:'700',fontSize:'12px',marginBottom:'6px'}}>T2 Bands Skipped Due to Conflicts</div>
          {t2Sk.map(({set,conflict})=>(
            <div key={set.id} style={{fontSize:'12px',color:'#888',marginBottom:'2px'}}>
              <span style={{color:'#fed7aa'}}>{set.band}</span> @{set.stage} {minToDisplay(set.startMin)} — blocked by {conflict.sched.band}
            </div>
          ))}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode==='list'&&(
        <div>
          {scheduled.map((set,i)=>{
            const cfg = tc(set.tier);
            const prev = scheduled[i-1];
            const gap = prev ? set.startMin-prev.endMin : null;
            return (
              <div key={set.id}>
                {gap!==null&&gap>=25&&(
                  <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 0'}}>
                    <div style={{flex:1,borderTop:'1px dashed rgba(96,165,250,0.12)'}}/>
                    <div style={{fontSize:'11px',color:'#60a5fa',background:'rgba(96,165,250,0.06)',padding:'3px 12px',borderRadius:'20px',whiteSpace:'nowrap'}}>
                      🍔 {gap}min free · {minToDisplay(prev.endMin)} – {minToDisplay(set.startMin)}
                    </div>
                    <div style={{flex:1,borderTop:'1px dashed rgba(96,165,250,0.12)'}}/>
                  </div>
                )}
                <div style={{background:cfg.bg,borderRadius:'8px',padding:'10px 12px',marginBottom:'5px',borderLeft:`3px solid ${cfg.color}`,border:`1px solid ${cfg.border}`,borderLeftWidth:'3px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                        <span style={{fontSize:'14px'}}>{cfg.dot}</span>
                        <span style={{fontWeight:'700',fontSize:'15px'}}>{set.band}</span>
                      </div>
                      <div style={{fontSize:'11px',color:'#666',marginTop:'3px',paddingLeft:'20px'}}>
                        <span style={{color:STAGE_COLOR[set.stage]||'#888'}}>{set.stage}</span>
                        {' '}·{' '}{minToDisplay(set.startMin)} – {minToDisplay(set.endMin)}{' '}·{' '}~{set.duration}min
                      </div>
                    </div>
                    <span style={{background:cfg.color,color:'white',fontSize:'10px',padding:'2px 7px',borderRadius:'4px',fontWeight:'800',flexShrink:0,marginLeft:'8px'}}>{cfg.label}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Lower-tier skipped */}
          {skipped.filter(s=>parseFloat(s.set.tier)>2).length>0&&(
            <div style={{marginTop:'20px',paddingTop:'16px',borderTop:'1px solid #181830'}}>
              <div style={{fontSize:'10px',color:'#2a2a4a',fontWeight:'700',letterSpacing:'1px',textTransform:'uppercase',marginBottom:'8px'}}>Lower Priority — Not Scheduled</div>
              {skipped.filter(s=>parseFloat(s.set.tier)>2).map(({set,conflict})=>(
                <div key={set.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'7px 10px',background:'rgba(10,10,20,0.5)',borderRadius:'6px',marginBottom:'3px',opacity:0.5}}>
                  <span style={{color:'#2a2a4a',fontSize:'14px'}}>✗</span>
                  <span style={{fontSize:'12px',color:'#666'}}>{set.band}</span>
                  <span style={{fontSize:'11px',color:'#2a2a4a'}}>{set.stage} {minToDisplay(set.startMin)}</span>
                  <span style={{marginLeft:'auto',fontSize:'11px',color:'#2a2a4a',textAlign:'right'}}>→ {conflict.sched.band}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TIMELINE VIEW ── */}
      {viewMode==='timeline'&&(
        <div style={{overflowX:'auto'}}>
          <div style={{minWidth:'520px',paddingBottom:'8px'}}>
            <div style={{display:'flex',marginLeft:'62px',marginBottom:'5px',position:'relative',height:'16px'}}>
              <div style={{position:'absolute',left:0,right:0}}>
                {hrs.map(h=>(
                  <div key={h} style={{position:'absolute',left:tleft(h*60),fontSize:'9px',color:'#333',transform:'translateX(-50%)'}}>{hl(h)}</div>
                ))}
              </div>
            </div>
            {STAGES.map(stage=>{
              const sSets = allDisplay.filter(s=>s.stage===stage);
              return (
                <div key={stage} style={{display:'flex',alignItems:'center',marginBottom:'5px'}}>
                  <div style={{width:'62px',flexShrink:0,fontSize:'11px',color:STAGE_COLOR[stage],fontWeight:'700',textAlign:'right',paddingRight:'8px'}}>{stage}</div>
                  <div style={{flex:1,position:'relative',height:'26px',background:'#0b0b1a',borderRadius:'4px',overflow:'hidden'}}>
                    {hrs.map(h=>(<div key={h} style={{position:'absolute',left:tleft(h*60),top:0,bottom:0,borderLeft:'1px solid #181830',pointerEvents:'none'}}/>))}
                    {sSets.map(set=>{
                      const cfg = tc(set.tier);
                      const short = set.band.length>14?set.band.slice(0,13)+'…':set.band;
                      return (
                        <div key={set.id}
                          title={`${set.band} (${minToDisplay(set.startMin)}–${minToDisplay(set.endMin)}) [${cfg.label}]${set.inSched?'':' — SKIPPED'}`}
                          style={{position:'absolute',left:tleft(set.startMin),width:twidth(set.duration),top:'2px',bottom:'2px',
                            background:set.inSched?cfg.color:'#1e1e30',borderRadius:'3px',opacity:set.inSched?1:0.22,
                            display:'flex',alignItems:'center',overflow:'hidden',padding:'0 3px',boxSizing:'border-box',cursor:'default'}}>
                          <span style={{fontSize:'9px',color:'white',fontWeight:'700',whiteSpace:'nowrap',overflow:'hidden'}}>
                            {set.inSched?short:''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div style={{display:'flex',gap:'12px',marginTop:'10px',paddingLeft:'62px',flexWrap:'wrap'}}>
              {[1,2,3,4].map(t=>(<div key={t} style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'10px',color:'#555'}}><div style={{width:'14px',height:'8px',borderRadius:'2px',background:TIER[t].color}}/>{TIER[t].label}</div>))}
              <div style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'10px',color:'#555'}}><div style={{width:'14px',height:'8px',borderRadius:'2px',background:'#1e1e30',opacity:0.22}}/>Skipped</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
