import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabase';
import WorkoutSession from './components/WorkoutSession';

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  return new Date(dateString).toLocaleDateString('id-ID', options);
};

export default function App() {
  const [view, setView] = useState('home'); 
  const [templates, setTemplates] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [loading, setLoading] = useState(true);

  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

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

  useEffect(() => {
    fetchTemplates();
    fetchLogs();
  }, []);

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

  // Fungsi-fungsi Handlers
  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!tplName) return alert("Nama template wajib diisi!");
    if (editingTpl) {
      await supabase.from('templates').update({ name: tplName, schedule: tplSchedule || 'Fleksibel' }).eq('id', editingTpl.id);
    } else {
      await supabase.from('templates').insert([{ name: tplName, schedule: tplSchedule || 'Fleksibel' }]);
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

  if (loading) return <div className="flex h-screen items-center justify-center text-blue-400 font-bold">Memuat data...</div>;

  if (view === 'workout') {
    return <WorkoutSession activeTemplate={activeTemplate} setView={setView} fetchTemplates={fetchTemplates} fetchLogs={fetchLogs} />;
  }

  return (
    <div className="max-w-md mx-auto p-4 pb-20">
      
      {view !== 'detail' && <NavTabs />}

      {/* --- VIEW: HOME --- */}
      {view === 'home' && (
        <div className="space-y-4">
          {templates.map(tpl => (
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
          ))}
          <button className="w-full mt-6 bg-gray-800 text-gray-300 p-4 rounded-xl border border-dashed border-gray-600 hover:bg-gray-700 font-bold" onClick={() => { setEditingTpl(null); setTplName(''); setTplSchedule(''); setShowModalTpl(true); }}>+ Buat Template Baru</button>
        </div>
      )}

      {/* --- VIEW: HISTORY --- */}
      {view === 'history' && (
        <div>
          {loadingLogs ? <p className="text-center text-blue-400">Memuat...</p> : logs.map(log => (
            <div key={log.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700 mb-4">
              <div className="flex justify-between items-start mb-2 border-b border-gray-700 pb-2">
                <div>
                  <h3 className="font-bold">{log.template_name}</h3>
                  <p className="text-xs text-blue-400">{formatDate(log.created_at)}</p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs bg-gray-900 px-2 py-1 rounded">⏱ {log.duration}</span>
                </div>
              </div>
              {log.details?.map((ex, idx) => (
                <div key={idx} className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300"><span className="text-gray-500 mr-2">{ex.sets}x</span>{ex.name}</span>
                  <span className="text-yellow-500 font-bold">{ex.last_weight} kg</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* --- VIEW: STATS --- */}
      {view === 'stats' && (
        <div>
          <div className="bg-blue-900/30 border border-blue-800 rounded-2xl p-6 text-center mb-6 shadow-lg">
            <h2 className="text-gray-400 text-sm font-bold tracking-widest mb-1">TOTAL SESI LATIHAN</h2>
            <p className="text-5xl font-extrabold text-blue-400">{logs.length}</p>
          </div>
          <h3 className="text-lg font-bold mb-4">🏆 Personal Records (PR)</h3>
          <div className="space-y-3">
            {personalRecords.map(([name, weight], idx) => (
              <div key={idx} className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center shadow-md">
                <span className="font-medium text-gray-200">{name}</span>
                <span className="bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 px-3 py-1 rounded-lg font-bold">{weight} kg</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- VIEW: DETAIL TEMPLATE --- */}
      {view === 'detail' && activeTemplate && (
        <div>
          <button className="mb-4 text-blue-400" onClick={() => setView('home')}>← Kembali</button>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">{activeTemplate.name}</h1>
            <button className={`text-sm px-3 py-1.5 rounded-lg border ${isEditingMenu ? 'bg-yellow-600 border-yellow-500 text-white' : 'bg-gray-800 border-gray-700'}`} onClick={() => setIsEditingMenu(!isEditingMenu)}>
              {isEditingMenu ? 'Selesai Edit' : 'Edit Menu'}
            </button>
          </div>
          
          {isEditingMenu && (
            <form onSubmit={handleAddExerciseToTemplate} className="bg-gray-800 p-4 rounded-xl mb-6">
              <input type="text" placeholder="Nama Gerakan" value={newExName} onChange={e => setNewExName(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white mb-2 outline-none" required />
              <div className="flex gap-2 mb-2">
                <input type="number" placeholder="Sets" value={newExSets} onChange={e => setNewExSets(e.target.value)} className="w-1/2 bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white outline-none" required />
                <input type="text" placeholder="Reps" value={newExReps} onChange={e => setNewExReps(e.target.value)} className="w-1/2 bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white outline-none" required />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white text-sm font-bold py-2 rounded-lg">Tambah Gerakan</button>
            </form>
          )}

          <div className="space-y-4">
            {activeTemplate.exercises?.map(ex => (
              <div key={ex.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-lg">{ex.name}</h3>
                  <p className="text-sm text-gray-400">Target: {ex.sets}x{ex.reps} | <span className="text-yellow-500">{ex.last_weight} kg</span></p>
                </div>
                {isEditingMenu && <button onClick={() => handleDeleteExerciseFromTemplate(ex.id)} className="text-red-400">🗑️</button>}
              </div>
            ))}
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-900 border-t border-gray-800 max-w-md mx-auto">
            <button className="w-full bg-blue-600 text-white font-bold text-lg p-4 rounded-xl" onClick={() => { setIsEditingMenu(false); setView('workout'); }}>Mulai Latihan</button>
          </div>
        </div>
      )}

      {/* Modal Tambah/Edit Template */}
      {showModalTpl && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold mb-4">{editingTpl ? 'Edit Template' : 'Buat Template Baru'}</h2>
            <form onSubmit={handleSaveTemplate} className="space-y-4">
              <input type="text" placeholder="Nama Template" value={tplName} onChange={(e) => setTplName(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white outline-none" />
              <input type="text" placeholder="Jadwal (opsional)" value={tplSchedule} onChange={(e) => setTplSchedule(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white outline-none" />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModalTpl(false)} className="w-1/2 bg-gray-700 py-3 rounded-xl font-bold">Batal</button>
                <button type="submit" className="w-1/2 bg-blue-600 py-3 rounded-xl font-bold">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}