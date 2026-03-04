import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";
import "./App.css";

const MEAL_DB_ID = "7fa92be3-5e62-40be-89db-340bf5631151";
const LOG_DB_ID  = "c67032b8-88b1-4118-9257-926b51c68036";
const PROXY      = "https://corsproxy.io/?";

const today = new Date();
const DAYS = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(today);
  d.setDate(d.getDate() - 13 + i);
  return d.toISOString().split("T")[0];
});
const CATEGORIES = ["Breakfast", "Main Course", "Snack", "Post-Workout", "Other"];
const CAT_COLORS = {
  "Breakfast": "#f59e0b", "Main Course": "#3b82f6",
  "Snack": "#a78bfa", "Post-Workout": "#4ade80", "Other": "#94a3b8"
};

function useNotion(token) {
  return useCallback(async (path, method = "GET", body = null) => {
    const url = `${PROXY}${encodeURIComponent("https://api.notion.com" + path)}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    return res.json();
  }, [token]);
}

function parseMeal(page) {
  const p = page.properties || {};
  return {
    notionId: page.id,
    name: p.Name?.title?.[0]?.plain_text || "",
    category: p.Category?.select?.name || "Other",
    calories: p.Calories?.number ?? 0,
    protein:  p.Protein?.number  ?? 0,
    carbs:    p.Carbs?.number    ?? 0,
    fat:      p.Fat?.number      ?? 0,
    isNew:    p["Is New"]?.checkbox || false,
  };
}

function parseLog(page) {
  const p = page.properties || {};
  return {
    notionId:    page.id,
    date:        p.Date?.date?.start || "",
    mealName:    p["Meal Name"]?.rich_text?.[0]?.plain_text || "",
    calories:    p.Calories?.number    ?? 0,
    protein:     p.Protein?.number     ?? 0,
    carbs:       p.Carbs?.number       ?? 0,
    fat:         p.Fat?.number         ?? 0,
    calorieBurn: p["Calorie Burn"]?.number ?? 0,
  };
}

function SetupScreen({ onSave }) {
  const [token, setToken] = useState("");
  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-logo">🥗</div>
        <h1 className="setup-title">Food Tracker</h1>
        <p className="setup-sub">Connect your Notion workspace to get started</p>
        <div className="setup-steps">
          <div className="step"><span className="step-num">1</span><span>Go to <a href="https://notion.so/my-integrations" target="_blank" rel="noreferrer">notion.so/my-integrations</a> → New integration → Save</span></div>
          <div className="step"><span className="step-num">2</span><span>Copy the <strong>Internal Integration Token</strong> (starts with <code>secret_</code>)</span></div>
          <div className="step"><span className="step-num">3</span><span>In Notion, open your <strong>Food Tracking page</strong> → <code>···</code> menu → <strong>Connect to</strong> → select your integration. Repeat for 🍽️ Meal Database and 📅 Daily Food Log.</span></div>
        </div>
        <input className="token-input" type="password" placeholder="secret_xxxxxxxxxxxxxxxxxxxx" value={token} onChange={e => setToken(e.target.value)} />
        <button className="btn-primary full" disabled={!token.startsWith("secret_")} onClick={() => onSave(token)}>
          Connect &amp; Launch →
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken]       = useState(() => localStorage.getItem("notion_ft_token") || "");
  const [mealDb, setMealDb]     = useState([]);
  const [logEntries, setLog]    = useState([]);
  const [burnMap, setBurnMap]   = useState({});
  const [burnDraft, setBurnDraft] = useState({});
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState("log");
  const [selectedDay, setDay]   = useState(DAYS[13]);
  const [search, setSearch]     = useState("");
  const [showModal, setModal]   = useState(false);
  const [newMeal, setNewMeal]   = useState({ name: "", category: "Breakfast", calories: "", protein: "", carbs: "", fat: "" });

  const notion = useNotion(token);

  const saveToken = (t) => { localStorage.setItem("notion_ft_token", t); setToken(t); };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [mealsRes, logRes] = await Promise.all([
        notion(`/v1/databases/${MEAL_DB_ID}/query`, "POST", { page_size: 100, sorts: [{ property: "Name", direction: "ascending" }] }),
        notion(`/v1/databases/${LOG_DB_ID}/query`, "POST", { page_size: 200, sorts: [{ property: "Date", direction: "descending" }] }),
      ]);
      setMealDb((mealsRes.results || []).map(parseMeal));
      const entries = (logRes.results || []).map(parseLog);
      setLog(entries);
      const burns = {};
      entries.forEach(e => { if (e.calorieBurn > 0 && e.date) burns[e.date] = e.calorieBurn; });
      setBurnMap(burns); setBurnDraft(burns);
    } catch (e) { setError("Notion error: " + e.message); }
    setLoading(false);
  }, [token, notion]);

  useEffect(() => { if (token) load(); }, [token]);

  const logsForDay = (day) => logEntries.filter(e => e.date === day);
  const dayTotals  = (day) => {
    const es = logsForDay(day);
    return {
      calories: es.reduce((s, e) => s + e.calories, 0),
      protein:  es.reduce((s, e) => s + e.protein,  0),
      carbs:    es.reduce((s, e) => s + e.carbs,    0),
      fat:      es.reduce((s, e) => s + e.fat,      0),
      burn:     burnMap[day] || 0,
    };
  };
  const weekStats = (days) => days.reduce((a, d) => {
    const t = dayTotals(d);
    return { cal: a.cal + t.calories, burn: a.burn + t.burn, prot: a.prot + t.protein };
  }, { cal: 0, burn: 0, prot: 0 });

  const chartData = DAYS.map(day => {
    const t = dayTotals(day);
    return {
      label: new Date(day).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      intake: t.calories || null,
      burn:   t.burn     || null,
      balance: (t.calories > 0 || t.burn > 0) ? t.calories - t.burn : null,
    };
  });

  const filteredDb = mealDb.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  const selTotals  = dayTotals(selectedDay);
  const selMeals   = logsForDay(selectedDay);
  const w1 = weekStats(DAYS.slice(0, 7));
  const w2 = weekStats(DAYS.slice(7));

  const addMealToLog = async (meal) => {
    setSaving(true); setError(null);
    try {
      const page = await notion("/v1/pages", "POST", {
        parent: { database_id: LOG_DB_ID },
        properties: {
          Name:           { title: [{ text: { content: `${meal.name} — ${selectedDay}` } }] },
          Date:           { date:  { start: selectedDay } },
          "Meal Name":    { rich_text: [{ text: { content: meal.name } }] },
          Calories:       { number: meal.calories },
          Protein:        { number: meal.protein  },
          Carbs:          { number: meal.carbs    },
          Fat:            { number: meal.fat      },
          "Calorie Burn": { number: burnMap[selectedDay] || 0 },
        },
      });
      setLog(prev => [...prev, parseLog(page)]);
    } catch (e) { setError("Save failed: " + e.message); }
    setSaving(false);
  };

  const removeMeal = async (notionId) => {
    setSaving(true);
    try {
      await notion(`/v1/pages/${notionId}`, "PATCH", { archived: true });
      setLog(prev => prev.filter(e => e.notionId !== notionId));
    } catch (e) { setError("Remove failed: " + e.message); }
    setSaving(false);
  };

  const saveBurn = async (day) => {
    const val = parseInt(burnDraft[day]) || 0;
    setSaving(true);
    setBurnMap(prev => ({ ...prev, [day]: val }));
    try {
      await Promise.all(logEntries.filter(e => e.date === day).map(e =>
        notion(`/v1/pages/${e.notionId}`, "PATCH", { properties: { "Calorie Burn": { number: val } } })
      ));
      setLog(prev => prev.map(e => e.date === day ? { ...e, calorieBurn: val } : e));
    } catch (e) { setError("Burn save failed: " + e.message); }
    setSaving(false);
  };

  const addNewMeal = async () => {
    if (!newMeal.name || !newMeal.calories) return;
    setSaving(true); setError(null);
    try {
      const page = await notion("/v1/pages", "POST", {
        parent: { database_id: MEAL_DB_ID },
        properties: {
          Name:     { title: [{ text: { content: newMeal.name } }] },
          Category: { select: { name: newMeal.category } },
          Calories: { number: parseInt(newMeal.calories) || 0 },
          Protein:  { number: parseInt(newMeal.protein)  || 0 },
          Carbs:    { number: parseInt(newMeal.carbs)    || 0 },
          Fat:      { number: parseInt(newMeal.fat)      || 0 },
          "Is New": { checkbox: true },
        },
      });
      const saved = parseMeal(page);
      setMealDb(prev => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)));
      await addMealToLog(saved);
      setNewMeal({ name: "", category: "Breakfast", calories: "", protein: "", carbs: "", fat: "" });
      setModal(false);
    } catch (e) { setError("Add meal failed: " + e.message); }
    setSaving(false);
  };

  if (!token) return <SetupScreen onSave={saveToken} />;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo-icon">🥗</span>
          <div>
            <h1 className="app-title">Food Tracker</h1>
            <p className="app-sub">2-week calorie &amp; macro log · synced with Notion</p>
          </div>
        </div>
        <div className="header-right">
          {saving && <span className="saving-badge">saving…</span>}
          <button className="btn-ghost" onClick={load} disabled={loading}>{loading ? "⏳" : "↺"} Refresh</button>
          <button className="btn-ghost danger" onClick={() => { localStorage.removeItem("notion_ft_token"); setToken(""); }}>Disconnect</button>
        </div>
      </header>

      {error && <div className="error-bar">⚠ {error} <button onClick={() => setError(null)}>✕</button></div>}
      {loading && <div className="loading-bar"><div className="loading-fill" /></div>}

      <nav className="tabs">
        {[["log","📅 Daily Log"],["chart","📊 Charts"],["database","🗃 Meal DB"]].map(([k,l]) => (
          <button key={k} className={`tab ${tab===k?"active":""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      {tab === "log" && (
        <div className="log-grid">
          <div className="log-left">
            <section className="card">
              <label className="section-label">Select Day</label>
              <div className="day-grid">
                {DAYS.map(day => {
                  const t = dayTotals(day); const has = logsForDay(day).length > 0; const sel = day === selectedDay;
                  return (
                    <button key={day} className={`day-btn ${sel?"active":""}`} onClick={() => setDay(day)}>
                      <span className="day-name">{new Date(day).toLocaleDateString("en-GB",{weekday:"short",day:"numeric"})}</span>
                      {has ? <span className="day-kcal">{t.calories} kcal</span> : <span className="day-empty">—</span>}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="card meals-card">
              <div className="meals-header">
                <span className="section-label" style={{marginBottom:0}}>
                  {new Date(selectedDay).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}
                </span>
              </div>
              {selMeals.length === 0 ? (
                <p className="empty-msg">No meals logged yet — add from the panel →</p>
              ) : (
                <div className="meal-list">
                  {selMeals.map(e => (
                    <div key={e.notionId} className="meal-row">
                      <div className="meal-row-info">
                        <span className="meal-row-name">{e.mealName}</span>
                        <div className="meal-row-macros">
                          <span className="mac cal">🔥 {e.calories}</span>
                          <span className="mac prot">P {e.protein}g</span>
                          <span className="mac carb">C {e.carbs}g</span>
                          <span className="mac fat">F {e.fat}g</span>
                        </div>
                      </div>
                      <button className="remove-btn" onClick={() => removeMeal(e.notionId)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {selMeals.length > 0 && (
                <div className="totals-bar">
                  <div className="total-item"><span>Calories</span><strong className="cal">{selTotals.calories}</strong></div>
                  <div className="total-item"><span>Protein</span><strong className="prot">{selTotals.protein}g</strong></div>
                  <div className="total-item"><span>Carbs</span><strong className="carb">{selTotals.carbs}g</strong></div>
                  <div className="total-item"><span>Fat</span><strong className="fat">{selTotals.fat}g</strong></div>
                  {burnMap[selectedDay] > 0 && (
                    <div className="total-item">
                      <span>Balance</span>
                      <strong className={selTotals.calories - burnMap[selectedDay] > 0 ? "surplus" : "deficit"}>
                        {selTotals.calories - burnMap[selectedDay] > 0 ? "+" : ""}{selTotals.calories - burnMap[selectedDay]}
                      </strong>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          <aside className="log-right">
            <section className="card">
              <label className="section-label">🏃 Calorie Burn</label>
              <div className="burn-row">
                <input type="number" className="input" placeholder="e.g. 2800"
                  value={burnDraft[selectedDay] || ""}
                  onChange={e => setBurnDraft(p => ({...p, [selectedDay]: e.target.value}))}
                  onKeyDown={e => e.key==="Enter" && saveBurn(selectedDay)} />
                <button className="btn-save" onClick={() => saveBurn(selectedDay)}>Save</button>
              </div>
              {burnMap[selectedDay] > 0 && selTotals.calories > 0 && (
                <p className={`burn-status ${selTotals.calories < burnMap[selectedDay] ? "deficit" : "surplus"}`}>
                  {selTotals.calories < burnMap[selectedDay]
                    ? `✅ Deficit: ${burnMap[selectedDay] - selTotals.calories} kcal`
                    : `⚠️ Surplus: ${selTotals.calories - burnMap[selectedDay]} kcal`}
                </p>
              )}
            </section>

            <section className="card add-meal-card">
              <label className="section-label">➕ Add Meal</label>
              <input className="input" placeholder="Search meals…" value={search} onChange={e => setSearch(e.target.value)} />
              <div className="meal-search-list">
                {filteredDb.map(m => (
                  <button key={m.notionId} className="meal-pick-btn" onClick={() => addMealToLog(m)}>
                    <span className="meal-pick-name">{m.name}{m.isNew && <span className="new-badge">NEW</span>}</span>
                    <span className="meal-pick-meta">
                      <span style={{color: CAT_COLORS[m.category]||"#94a3b8"}}>{m.category}</span>
                      &nbsp;·&nbsp;{m.calories} kcal · P{m.protein} C{m.carbs} F{m.fat}
                    </span>
                  </button>
                ))}
                {filteredDb.length === 0 && <p className="empty-msg" style={{padding:"12px 0"}}>No meals match</p>}
              </div>
              <button className="btn-add-new" onClick={() => setModal(true)}>+ New meal → save to Notion DB</button>
            </section>
          </aside>
        </div>
      )}

      {tab === "chart" && (
        <div className="charts-grid">
          <section className="card chart-card">
            <h3 className="chart-title">Daily Intake vs. Calorie Burn</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{top:4,right:8,left:-10,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{fill:"#64748b",fontSize:10}} />
                <YAxis tick={{fill:"#64748b",fontSize:10}} />
                <Tooltip contentStyle={{background:"#1a1f2e",border:"1px solid #2d3748",borderRadius:8,fontSize:12}} cursor={{fill:"rgba(255,255,255,0.03)"}} />
                <Legend wrapperStyle={{fontSize:12,color:"#94a3b8"}} />
                <Bar dataKey="intake" name="Intake (kcal)" fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="burn"   name="Burn (kcal)"   fill="#f59e0b" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>

          <section className="card chart-card">
            <h3 className="chart-title">Daily Balance — Intake minus Burn</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{top:4,right:8,left:-10,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{fill:"#64748b",fontSize:10}} />
                <YAxis tick={{fill:"#64748b",fontSize:10}} />
                <Tooltip contentStyle={{background:"#1a1f2e",border:"1px solid #2d3748",borderRadius:8,fontSize:12}} cursor={{fill:"rgba(255,255,255,0.03)"}} formatter={(v) => v!==null?[`${v>0?"+":""}${v} kcal`,"Balance"]:["—","Balance"]} />
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" />
                <Bar dataKey="balance" name="Balance" radius={[4,4,0,0]} fill="#4ade80" />
              </BarChart>
            </ResponsiveContainer>
          </section>

          <div className="week-summary">
            {[["Week 1",w1],["Week 2",w2]].map(([label,s]) => (
              <section key={label} className="card week-card">
                <h3 className="week-title">{label}</h3>
                <div className="week-stats">
                  <div className="stat-box"><span>Total Intake</span><strong className="cal">{s.cal} kcal</strong></div>
                  <div className="stat-box"><span>Total Burn</span><strong className="prot">{s.burn} kcal</strong></div>
                  <div className="stat-box"><span>Net Balance</span><strong className={s.cal-s.burn>0?"surplus":"deficit"}>{s.cal-s.burn>0?"+":""}{s.cal-s.burn} kcal</strong></div>
                  <div className="stat-box"><span>Avg Protein/day</span><strong className="carb">{Math.round(s.prot/7)}g</strong></div>
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {tab === "database" && (
        <section className="card db-card">
          <div className="db-header">
            <h3 className="chart-title" style={{margin:0}}>🍽️ Meal Database — {mealDb.length} meals</h3>
            <button className="btn-primary-sm" onClick={() => setModal(true)}>+ New Meal</button>
          </div>
          <input className="input" placeholder="Search meals…" value={search} onChange={e => setSearch(e.target.value)} style={{marginBottom:14}} />
          <div className="db-table-wrap">
            <table className="db-table">
              <thead><tr>{["Name","Category","Calories","Protein","Carbs","Fat"].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {filteredDb.map((m,i) => (
                  <tr key={m.notionId} className={i%2===0?"odd":""}>
                    <td><span className="db-name">{m.name}</span>{m.isNew&&<span className="new-badge">NEW</span>}</td>
                    <td><span className="cat-pill" style={{background:CAT_COLORS[m.category]+"22",color:CAT_COLORS[m.category]}}>{m.category}</span></td>
                    <td className="cal">{m.calories}</td>
                    <td className="prot">{m.protein}g</td>
                    <td className="carb">{m.carbs}g</td>
                    <td className="fat">{m.fat}g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Add New Meal to Notion</h3>
            <div className="modal-fields">
              <input className="input" placeholder="Meal name *" value={newMeal.name} onChange={e => setNewMeal(p=>({...p,name:e.target.value}))} />
              <select className="input" value={newMeal.category} onChange={e => setNewMeal(p=>({...p,category:e.target.value}))}>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
              <div className="modal-row">
                <input className="input" placeholder="Calories *" type="number" value={newMeal.calories} onChange={e => setNewMeal(p=>({...p,calories:e.target.value}))} />
                <input className="input" placeholder="Protein (g)" type="number" value={newMeal.protein} onChange={e => setNewMeal(p=>({...p,protein:e.target.value}))} />
                <input className="input" placeholder="Carbs (g)" type="number" value={newMeal.carbs} onChange={e => setNewMeal(p=>({...p,carbs:e.target.value}))} />
                <input className="input" placeholder="Fat (g)" type="number" value={newMeal.fat} onChange={e => setNewMeal(p=>({...p,fat:e.target.value}))} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-primary full" onClick={addNewMeal} disabled={saving||!newMeal.name||!newMeal.calories}>
                {saving?"Saving…":"Save to Notion & Log Today"}
              </button>
              <button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
