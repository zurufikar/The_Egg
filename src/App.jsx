import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import WorkoutSession from './components/WorkoutSession';

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  return new Date(dateString).toLocaleDateString('id-ID', options);
};

// Helper kalkulasi 1RM (Formula Epley)
const calculate1RM = (weight, reps) => {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w === 0 || r === 0) return 0;
  if (r === 1) return w;
  return Math.round(w * (1 + r / 30));
};

export default function App() {
  // 1. SEMUA STATE HARUS DI DEKLARASIKAN PALING ATAS
  const [session, setSession] = useState(null);
  const [view, setView] = useState('home'); 
  const [templates, setTemplates] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [loading, setLoading] = useState(true);

  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // State untuk Grafik
  const [selectedExForChart, setSelectedExForChart] = useState('');

  // States untuk modal & form
  const [showModalTpl, setShowModalTpl] = useState(false);
  const [editingTpl, setEditingTpl] = useState(null);
  const [tplName, setTplName] = useState('');
  const [tplSchedule, setTplSchedule] = useState('');
  const [isEditingMenu, setIsEditingMenu] = useState(false);
  
  // States untuk gerakan baru
  const [newExName, setNewExName] = useState('');
  const [newExSets, setNewExSets] = useState(3);
  const [newExReps, setNewExReps] = useState('8-10');

  // 2. SEMUA EFFECT DAN FUNGSI
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('templates').select(`id, name, schedule, last_done, exercises:template_exercises(id, name, sets, reps, last_weight)`);
    if (!error) {
      setTemplates(data || []);
      if (activeTemplate) {
        const updatedActive = data.find(t => t.id === activeTemplate.id);
        if (updatedActive) setActiveTemplate(updatedActive);
      }
    }
    setLoading(false);
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const { data, error } = await supabase.from('workout_logs').select('*').order('created_at', { ascending: false });
    if (!error) setLogs(data || []);
    setLoadingLogs(false);
  };

  const handleDeleteLog = async (logId) => {
    if (window.confirm("Hapus catatan latihan ini?")) {
      const { error } = await supabase.from('workout_logs').delete().eq('id', logId);
      if (!error) fetchLogs();
      else alert("Gagal menghapus log.");
    }
  };

  useEffect(() => {
    if (session) {
      fetchTemplates();
      fetchLogs();
    }
  }, [session]);

  // PR Calculation
  const personalRecords = useMemo(() => {
    const prs = {};
    logs.forEach(log => {
      if (log.details) {
        log.details.forEach(ex => {
          const weight = Number(ex.last_weight) || 0;
          if (weight > 0) {
            if (!prs[ex.name] || prs[ex.name] < weight) prs[ex.name] = weight;
          }
        });
      }
    });
    return Object.entries(prs).sort((a, b) => b[1] - a[1]);
  }, [logs]);

  // Data Tren Riwayat 1RM per Gerakan (Untuk Grafik)
  const exerciseHistory = useMemo(() => {
    if (!selectedExForChart) return [];
    
    const history = [];
    const sortedLogs = [...logs].reverse();

    sortedLogs.forEach(log => {
      if (log.details) {
        const match = log.details.find(
          ex => ex.name.toLowerCase() === selectedExForChart.toLowerCase()
        );
        if (match) {
          let max1RM = 0;
          let maxWeight = 0;

          if (match.logs_detail && match.logs_detail.length > 0) {
            match.logs_detail.forEach(set => {
              const est = calculate1RM(set.weight, set.reps);
              if (est > max1RM) max1RM = est;
              if (Number(set.weight) > maxWeight) maxWeight = Number(set.weight);
            });
          } else {
            maxWeight = Number(match.last_weight) || 0;
            max1RM = calculate1RM(maxWeight, 8);
          }

          if (max1RM > 0) {
            history.push({
              date: new Date(log.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
              est1RM: max1RM,
              maxWeight: maxWeight
            });
          }
        }
      }
    });

    return history;
  }, [logs, selectedExForChart]);

  // Handlers
  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!tplName) return alert("Nama template wajib diisi!");
    if (editingTpl) {
      await supabase.from('templates').update({ name: tplName, schedule: tplSchedule || 'Fleksibel' }).eq('id', editingTpl.id);
    } else {
      await supabase.from('templates').insert([{ user_id: session.user.id, name: tplName, schedule: tplSchedule || 'Fleksibel' }]);
    }
    setShowModalTpl(false); setTplName(''); setTplSchedule('');
    await fetchTemplates();
  };

  const handleDeleteTemplate = async (id, name, e) => {
    e.stopPropagation();
    if (window.confirm(`Hapus template "${name}"?`)) {
      await supabase.from('templates').delete().eq('id', id);
      await fetchTemplates();
    }
  };

  const handleAddExerciseToTemplate = async (e) => {
    e.preventDefault();
    if (!newExName) return;
    await supabase.from('template_exercises').insert([{ template_id: activeTemplate.id, name: newExName, sets: Number(newExSets) || 3, reps: newExReps || '10', last_weight: 0 }]);
    setNewExName(''); setNewExSets(3); setNewExReps('8-10');
    await fetchTemplates();
  };

  const handleDeleteExerciseFromTemplate = async (exId) => {
    if (window.confirm("Hapus gerakan?")) {
      await supabase.from('template_exercises').delete().eq('id', exId);
      await fetchTemplates();
    }
  };

  const NavTabs = () => (
    <div className="flex gap-4 mb-6 pt-4 border-b border-gray-800 overflow-x-auto no-scrollbar">
      <button onClick={() => setView('home')} className={`pb-3 text-lg font-bold whitespace-nowrap transition-colors ${view === 'home' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>Template</button>
      <button onClick={() => { setView('history'); fetchLogs(); }} className={`pb-3 text-lg font-bold whitespace-nowrap transition-colors ${view === 'history' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>Histori</button>
      <button onClick={() => { setView('stats'); fetchLogs(); }} className={`pb-3 text-lg font-bold whitespace-nowrap transition-colors ${view === 'stats' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>Statistik</button>
    </div>
  );

  // 3. EARLY RETURN RENDER (Dilakukan setelah semua Hooks / State diinisialisasi)
  if (!session) {
    return <Auth />;
  }

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-900 text-blue-400 font-bold">Memuat data...</div>;
  }

  if (view === 'workout') {
    return (
      <div className="bg-gray-900 text-white min-h-screen pb-6">
        <WorkoutSession 
          session={session}
          activeTemplate={activeTemplate} 
          setView={setView} 
          fetchTemplates={fetchTemplates} 
          fetchLogs={fetchLogs} 
          logs={logs}
        />
      </div>
    );
  }

  // 4. MAIN RENDER PADA APLIKASI UTAMA (Gabung Header + Konten Utama)
  return (
    <div className="bg-gray-900 text-white min-h-screen">
      {/* --- HEADER --- */}
      <header className="p-4 border-b border-gray-800 flex justify-between items-center max-w-md mx-auto sticky top-0 bg-gray-900/95 backdrop-blur z-20">
        <span className="text-xs text-gray-400 truncate max-w-[200px]">{session.user.email}</span>
        <button onClick={() => supabase.auth.signOut()} className="text-xs bg-red-950/50 hover:bg-red-900/80 text-red-400 border border-red-900/50 px-3 py-1 rounded-lg transition-colors">
          Logout
        </button>
      </header>

      {/* --- MAIN CONTENT --- */}
      <div className="max-w-md mx-auto p-4 pb-20">
        
        {view !== 'detail' && <NavTabs />}

        {/* --- VIEW: HOME --- */}
        {view === 'home' && (
          <div className="space-y-4">
            {templates.length === 0 ? (
              <p className="text-center text-gray-500 text-sm mt-10">Belum ada template, silakan buat baru.</p>
            ) : (
              templates.map(tpl => (
                <div key={tpl.id} className="bg-gray-800 rounded-xl p-5 border border-gray-700 cursor-pointer hover:border-blue-500" onClick={() => { setActiveTemplate(tpl); setView('detail'); }}>
                  <div className="flex justify-between items-start mb-2">
                    <h2 className="text-xl font-bold text-blue-400">{tpl.name}</h2>
                    <div className="flex gap-2">
                      <button className="p-1 hover:text-blue-400" onClick={(e) => { e.stopPropagation(); setEditingTpl(tpl); setTplName(tpl.name); setTplSchedule(tpl.schedule); setShowModalTpl(true); }}>⚙️</button>
                      <button className="p-1 hover:text-red-400" onClick={(e) => handleDeleteTemplate(tpl.id, tpl.name, e)}>🗑️</button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400 mb-3">🕒 {tpl.schedule}</p>
                  <div className="text-sm text-gray-300 bg-gray-900 p-3 rounded-lg">
                    {tpl.exercises?.length > 0 ? tpl.exercises.map((ex, idx) => <span key={idx}>{ex.sets}x {ex.name}{idx < tpl.exercises.length - 1 ? ', ' : ''}</span>) : <span className="text-gray-500">Kosong</span>}
                  </div>
                </div>
              ))
            )}
            <button className="w-full mt-6 bg-gray-800 text-gray-300 p-4 rounded-xl border border-dashed border-gray-600 hover:bg-gray-700 font-bold transition-colors" onClick={() => { setEditingTpl(null); setTplName(''); setTplSchedule(''); setShowModalTpl(true); }}>+ Buat Template Baru</button>
          </div>
        )}

        {/* --- VIEW: HISTORY --- */}
        {view === 'history' && (
          <div>
            {loadingLogs ? <p className="text-center text-blue-400 mt-10">Memuat riwayat...</p> : logs.length === 0 ? <p className="text-center text-gray-500 text-sm mt-10">Belum ada histori latihan.</p> : logs.map(log => (
              <div key={log.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700 mb-4">
                <div className="flex justify-between items-start mb-2 border-b border-gray-700 pb-2">
                  <div>
                    <h3 className="font-bold">{log.template_name}</h3>
                    <p className="text-xs text-blue-400">{formatDate(log.created_at)}</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs bg-gray-900 px-2 py-1 rounded">⏱ {log.duration}</span>
                    <button 
                        onClick={() => handleDeleteLog(log.id)} 
                        className="text-xs text-red-500 hover:text-red-400 font-semibold transition-colors mt-1">
                        Hapus
                    </button>
                  </div>
                </div>
                {log.details?.map((ex, idx) => (
                  <div key={idx} className="mb-3 text-sm border-b border-gray-700/40 pb-2 last:border-0">
                    <div className="font-semibold text-blue-300 mb-1">{ex.name}</div>
                    {ex.logs_detail ? (
                      <div className="pl-3 space-y-1 border-l-2 border-blue-500/30">
                        {ex.logs_detail.map((set, sIdx) => (
                          <div key={sIdx} className="flex justify-between text-xs text-gray-300">
                            <span>Set {sIdx + 1}: <strong className="text-white">{set.weight} kg</strong> × {set.reps} reps</span>
                            <span className="text-purple-400 font-bold">RPE {Number(set.rpe).toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>{ex.sets}x set</span>
                        <span className="text-yellow-500 font-bold">{ex.last_weight} kg</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* --- VIEW: STATS --- */}
        {view === 'stats' && (
          <div className="space-y-6">
            <div className="bg-blue-900/30 border border-blue-800 rounded-2xl p-6 text-center shadow-lg">
              <h2 className="text-gray-400 text-xs font-bold tracking-widest mb-1">TOTAL SESI LATIHAN</h2>
              <p className="text-5xl font-extrabold text-blue-400">{logs.length}</p>
            </div>

            {/* Grafik Progress 1RM */}
            <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-md">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                📈 Grafik Progress 1RM
              </h3>
              
              <select
                value={selectedExForChart}
                onChange={(e) => setSelectedExForChart(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm text-blue-400 font-bold outline-none mb-4 cursor-pointer"
              >
                <option value="">-- Pilih Gerakan Untuk Dilihat --</option>
                {personalRecords.map(([name]) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>

              {selectedExForChart ? (
                exerciseHistory.length > 1 ? (
                  <div className="mt-4">
                    <div className="h-44 w-full flex items-end gap-2 pt-6 pb-2 px-2 border-b border-l border-gray-700 relative">
                      {exerciseHistory.map((item, idx) => {
                        const maxVal = Math.max(...exerciseHistory.map(h => h.est1RM));
                        const minVal = Math.min(...exerciseHistory.map(h => h.est1RM));
                        const range = (maxVal - minVal) || 1;
                        const heightPercent = Math.max(20, ((item.est1RM - minVal) / range) * 80 + 20);

                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-10">
                              {item.est1RM} kg (1RM)
                            </div>
                            
                            <span className="text-[10px] text-gray-400 font-bold mb-1">{item.est1RM}k</span>
                            
                            <div 
                              style={{ height: `${heightPercent}%` }} 
                              className="w-full bg-gradient-to-t from-blue-700 to-blue-400 rounded-t-md transition-all group-hover:from-blue-600 group-hover:to-cyan-400"
                            />
                            
                            <span className="text-[9px] text-gray-400 mt-2 truncate w-full text-center">{item.date}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-gray-400 text-center mt-3">
                      * Grafik menampilkan estimasi kekuatan 1RM (kg) tiap sesi
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 text-center py-6 italic">
                    Butuh minimal 2 sesi latihan pada gerakan ini untuk menampilkan grafik tren.
                  </p>
                )
              ) : (
                <p className="text-xs text-gray-500 text-center py-6 italic">
                  Pilih gerakan di atas untuk melihat tren progres kekuatan kamu.
                </p>
              )}
            </div>

            {/* Estimasi 1RM & PR */}
            <div>
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                🏆 Best Record & Estimasi 1RM
              </h3>
              <div className="space-y-3">
                {personalRecords.map(([name, weight]) => {
                  let maxEst1RM = weight;
                  logs.forEach(l => {
                    l.details?.forEach(d => {
                      if (d.name === name && d.logs_detail) {
                        d.logs_detail.forEach(s => {
                          const est = calculate1RM(s.weight, s.reps);
                          if (est > maxEst1RM) maxEst1RM = est;
                        });
                      }
                    });
                  });

                  return (
                    <div key={name} className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center shadow-md">
                      <div>
                        <h4 className="font-bold text-gray-200">{name}</h4>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Beban Maks: <strong className="text-white">{weight} kg</strong>
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-purple-400 font-bold uppercase block tracking-wider">Est. 1RM</span>
                        <span className="bg-purple-900/40 text-purple-300 border border-purple-700/50 px-3 py-1 rounded-lg font-extrabold text-sm inline-block">
                          ~{maxEst1RM} kg
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* --- VIEW: DETAIL TEMPLATE --- */}
        {view === 'detail' && activeTemplate && (
          <div>
            <button className="mb-4 text-blue-400" onClick={() => setView('home')}>← Kembali</button>
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold">{activeTemplate.name}</h1>
              <button className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${isEditingMenu ? 'bg-yellow-600 border-yellow-500 text-white' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`} onClick={() => setIsEditingMenu(!isEditingMenu)}>
                {isEditingMenu ? 'Selesai Edit' : 'Edit Menu'}
              </button>
            </div>
            
            {isEditingMenu && (
              <form onSubmit={handleAddExerciseToTemplate} className="bg-gray-800 p-4 rounded-xl mb-6 border border-gray-700">
                <input type="text" placeholder="Nama Gerakan" value={newExName} onChange={e => setNewExName(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white mb-2 outline-none focus:border-blue-500" required />
                <div className="flex gap-2 mb-2">
                  <input type="number" placeholder="Sets" value={newExSets} onChange={e => setNewExSets(e.target.value)} className="w-1/2 bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white outline-none focus:border-blue-500" required />
                  <input type="text" placeholder="Reps" value={newExReps} onChange={e => setNewExReps(e.target.value)} className="w-1/2 bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white outline-none focus:border-blue-500" required />
                </div>
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-2 rounded-lg transition-colors">Tambah Gerakan</button>
              </form>
            )}

            <div className="space-y-4">
              {activeTemplate.exercises?.length === 0 ? (
                <p className="text-gray-500 text-sm text-center italic py-4">Menu latihan masih kosong.</p>
              ) : (
                activeTemplate.exercises?.map(ex => (
                  <div key={ex.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-lg">{ex.name}</h3>
                      <p className="text-sm text-gray-400">Target: {ex.sets}x{ex.reps} | <span className="text-yellow-500">{ex.last_weight} kg</span></p>
                    </div>
                    {isEditingMenu && <button onClick={() => handleDeleteExerciseFromTemplate(ex.id)} className="text-red-400 hover:text-red-300">🗑️</button>}
                  </div>
                ))
              )}
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-900/95 backdrop-blur border-t border-gray-800 max-w-md mx-auto z-10">
              <button 
                disabled={activeTemplate.exercises?.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white font-bold text-lg p-4 rounded-xl transition-colors shadow-lg" 
                onClick={() => { setIsEditingMenu(false); setView('workout'); }}>
                Mulai Latihan
              </button>
            </div>
          </div>
        )}

        {/* Modal Tambah/Edit Template */}
        {showModalTpl && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
              <h2 className="text-xl font-bold mb-4">{editingTpl ? 'Edit Template' : 'Buat Template Baru'}</h2>
              <form onSubmit={handleSaveTemplate} className="space-y-4">
                <input type="text" placeholder="Nama Template (ex: Pull Day)" value={tplName} onChange={(e) => setTplName(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white outline-none focus:border-blue-500" required />
                <input type="text" placeholder="Jadwal (opsional)" value={tplSchedule} onChange={(e) => setTplSchedule(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white outline-none focus:border-blue-500" />
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setShowModalTpl(false)} className="w-1/2 bg-gray-700 hover:bg-gray-600 transition-colors py-3 rounded-xl font-bold">Batal</button>
                  <button type="submit" className="w-1/2 bg-blue-600 hover:bg-blue-500 transition-colors py-3 rounded-xl font-bold">Simpan</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}