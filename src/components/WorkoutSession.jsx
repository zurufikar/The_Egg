import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Helper di luar komponen agar bisa langsung dipakai saat inisialisasi state
const getLastSessionData = (logs, exName) => {
  if (!logs || logs.length === 0) return null;
  for (const log of logs) {
    const match = log.details?.find(
      item => item.name?.toLowerCase() === exName?.toLowerCase()
    );
    if (match) return match;
  }
  return null;
};

export default function WorkoutSession({ activeTemplate, setView, fetchTemplates, fetchLogs, logs = [] }) {
  const [time, setTime] = useState(0);
  const [restTimer, setRestTimer] = useState(null); 
  const [restTotal, setRestTotal] = useState(90);
  const [isSaving, setIsSaving] = useState(false);

  // Inisialisasi state: Otomatis memuat data sesi sebelumnya jika ada
  const [workoutData, setWorkoutData] = useState(() => {
    if (!activeTemplate) return { id: null, name: 'Latihan', exercises: [] };
    
    return {
      ...activeTemplate,
      exercises: (activeTemplate.exercises || []).map(ex => {
        const lastSessionEx = getLastSessionData(logs, ex.name);
        const prevLogs = lastSessionEx?.logs_detail;

        // Otomatis isi dari sesi lalu jika data riwayat detail ditemukan
        if (prevLogs && prevLogs.length > 0) {
          return {
            ...ex,
            setsCount: prevLogs.length,
            rest_time: 90,
            logs: prevLogs.map(prevSet => ({
              weight: prevSet.weight || 0,
              reps: prevSet.reps || '10',
              rpe: prevSet.rpe || 8.0,
              done: false
            }))
          };
        }

        // Fallback jika gerakan belum pernah dicatat sebelumnya
        const defaultSets = ex.sets || 3;
        return {
          ...ex,
          setsCount: defaultSets,
          rest_time: 90,
          logs: Array.from({ length: defaultSets }, () => ({
            weight: ex.last_weight || 0,
            reps: ex.reps || '10',
            rpe: 8.0,
            done: false
          }))
        };
      })
    };
  });

  // State untuk Modal Tambah Exercise On-The-Fly
  const [showAddExModal, setShowAddExModal] = useState(false);
  const [newExNameInput, setNewExNameInput] = useState('');
  const [newExSetsInput, setNewExSetsInput] = useState(3);
  const [newExRepsInput, setNewExRepsInput] = useState('8-10');

  const playTimerAlert = () => {
    if ("vibrate" in navigator) navigator.vibrate([200, 100, 200, 100, 300]);
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine'; osc1.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain1.gain.setValueAtTime(0.2, audioCtx.currentTime); osc1.connect(gain1); gain1.connect(audioCtx.destination);
      osc1.start(); osc1.stop(audioCtx.currentTime + 0.2);
    } catch (e) { console.log("Audio error:", e); }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(t => t + 1);
      setRestTimer(r => {
        if (r === null) return null;
        if (r <= 1) { playTimerAlert(); return null; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (sec) => `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;

  const handleToggleSet = (exIdx, setIdx) => {
    const newData = { ...workoutData };
    const targetSet = newData.exercises[exIdx].logs[setIdx];
    targetSet.done = !targetSet.done;
    setWorkoutData(newData);

    if (targetSet.done) {
      const customRest = newData.exercises[exIdx].rest_time || 90;
      setRestTotal(customRest);
      setRestTimer(customRest);
    } else {
      setRestTimer(null);
    }
  };

  const handleInputChange = (exIdx, setIdx, field, value) => {
    const newData = { ...workoutData };
    newData.exercises[exIdx].logs[setIdx][field] = value;
    setWorkoutData(newData);
  };

  // --- FITUR: TAMBAH / HAPUS SET ON-THE-FLY ---
  const handleAddSet = (exIdx) => {
    const newData = { ...workoutData };
    const ex = newData.exercises[exIdx];
    const lastLog = ex.logs[ex.logs.length - 1] || { weight: 0, reps: 10, rpe: 8.0 };
    ex.logs.push({ weight: lastLog.weight, reps: lastLog.reps, rpe: lastLog.rpe, done: false });
    ex.setsCount = ex.logs.length;
    setWorkoutData(newData);
  };

  const handleRemoveSet = (exIdx) => {
    const newData = { ...workoutData };
    const ex = newData.exercises[exIdx];
    if (ex.logs.length > 1) {
      ex.logs.pop();
      ex.setsCount = ex.logs.length;
      setWorkoutData(newData);
    }
  };

  // --- FITUR: TAMBAH / HAPUS EXERCISE CARD ON-THE-FLY ---
  const handleAddExerciseCard = (e) => {
    e.preventDefault();
    if (!newExNameInput.trim()) return alert("Nama gerakan wajib diisi!");
    
    const newData = { ...workoutData };
    const setsCount = Number(newExSetsInput) || 3;
    
    newData.exercises.push({
      name: newExNameInput.trim(),
      sets: setsCount,
      setsCount: setsCount,
      reps: newExRepsInput,
      rest_time: 90,
      isExtra: true,
      logs: Array.from({ length: setsCount }, () => ({ weight: 0, reps: newExRepsInput, rpe: 8.0, done: false }))
    });

    setWorkoutData(newData);
    setNewExNameInput('');
    setNewExSetsInput(3);
    setNewExRepsInput('8-10');
    setShowAddExModal(false);
  };

  const handleRemoveExerciseCard = (exIdx) => {
    if (window.confirm("Hapus kartu gerakan ini dari sesi aktif?")) {
      const newData = { ...workoutData };
      newData.exercises.splice(exIdx, 1);
      setWorkoutData(newData);
    }
  };

  const handleRestTimeChange = (exIdx, newTime) => {
    const newData = { ...workoutData };
    newData.exercises[exIdx].rest_time = Number(newTime) || 90;
    setWorkoutData(newData);
  };

  // --- SIMPAN HASIL LATIHAN ---
  const handleFinish = async () => {
    const totalDuration = formatTime(time);
    if (window.confirm(`Selesaikan latihan? Waktu: ${totalDuration}`)) {
      setIsSaving(true);
      
      const logDetails = workoutData.exercises.map(ex => {
        const maxWeight = Math.max(...ex.logs.map(l => Number(l.weight) || 0), 0);
        return {
          name: ex.name,
          sets: ex.setsCount,
          reps: ex.logs[0]?.reps || '10',
          last_weight: maxWeight,
          logs_detail: ex.logs
        };
      });

      await supabase.from('workout_logs').insert([{ 
        template_name: workoutData.name, 
        duration: totalDuration, 
        details: logDetails 
      }]);

      await supabase.from('templates').update({ last_done: 'Hari ini' }).eq('id', workoutData.id);
      
      for (const ex of workoutData.exercises) {
        const maxWeight = Math.max(...ex.logs.map(l => Number(l.weight) || 0), 0);
        if (ex.id) {
          await supabase.from('template_exercises').update({ last_weight: maxWeight, sets: ex.setsCount }).eq('id', ex.id);
        } else if (ex.isExtra) {
          await supabase.from('template_exercises').insert({
            template_id: workoutData.id,
            name: ex.name,
            sets: ex.setsCount,
            reps: String(ex.reps),
            last_weight: maxWeight
          });
        }
      }

      setIsSaving(false); 
      alert(`Selesai! Latihan berhasil disimpan.`); 
      await fetchTemplates(); 
      await fetchLogs(); 
      setView('stats');
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 pb-48">
      {/* Header Sticky */}
      <div className="sticky top-0 bg-gray-900/95 backdrop-blur py-3 mb-4 flex justify-between items-center border-b border-gray-800 z-10">
        <div>
          <h1 className="text-xl font-bold">{workoutData.name}</h1>
          <div className="text-blue-400 font-mono text-sm">⏱ {formatTime(time)}</div>
        </div>
        <button onClick={handleFinish} disabled={isSaving} className="bg-green-600 hover:bg-green-500 text-white font-bold px-4 py-2 rounded-lg text-sm shadow">
          {isSaving ? 'Menyimpan...' : 'Selesai'}
        </button>
      </div>

      {/* Daftar Latihan */}
      <div className="space-y-6">
        {workoutData.exercises?.map((ex, exIdx) => (
          <div key={exIdx} className="bg-gray-800/60 p-4 rounded-xl border border-gray-700/60 shadow-md">
            
            {/* Header Gerakan */}
            <div className="flex justify-between items-start mb-3 gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-blue-300">{ex.name}</h3>
                  {ex.isExtra && <span className="bg-blue-900/50 text-blue-400 text-[10px] px-1.5 py-0.5 rounded border border-blue-800">Extra</span>}
                </div>
                <p className="text-xs text-gray-400">Target: {ex.sets}x{ex.reps}</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-gray-900 px-2 py-1 rounded-lg border border-gray-700">
                  <span className="text-[10px] text-gray-400">Rest:</span>
                  <select 
                    value={ex.rest_time} 
                    onChange={(e) => handleRestTimeChange(exIdx, e.target.value)}
                    className="bg-transparent text-xs text-yellow-400 font-bold outline-none cursor-pointer">
                    <option value={45} className="bg-gray-900">45s</option>
                    <option value={60} className="bg-gray-900">60s</option>
                    <option value={90} className="bg-gray-900">90s</option>
                    <option value={120} className="bg-gray-900">120s</option>
                    <option value={180} className="bg-gray-900">180s</option>
                  </select>
                </div>
                <button 
                  onClick={() => handleRemoveExerciseCard(exIdx)} 
                  className="text-gray-500 hover:text-red-400 p-1 text-sm transition-colors" title="Hapus Gerakan">
                  🗑️
                </button>
              </div>
            </div>

            {/* Tabel Header */}
            <div className="grid grid-cols-12 gap-1.5 mb-2 text-center text-[11px] font-semibold text-gray-400">
              <div className="col-span-2">SET</div>
              <div className="col-span-3">KG</div>
              <div className="col-span-2">REPS</div>
              <div className="col-span-3">RPE</div>
              <div className="col-span-2">DONE</div>
            </div>

            {/* Daftar Set & Live Delta */}
            <div className="space-y-2">
              {ex.logs.map((log, setIdx) => {
                const lastSessionEx = getLastSessionData(logs, ex.name);
                const lastSet = lastSessionEx?.logs_detail?.[setIdx];

                return (
                  <div key={setIdx} className="space-y-1">
                    <div className="grid grid-cols-12 gap-1.5 items-center">
                      <div className="col-span-2 bg-gray-900/80 rounded-lg h-10 flex items-center justify-center font-bold text-xs text-gray-300">
                        {setIdx + 1}
                      </div>
                      <input 
                        type="number" 
                        value={log.weight} 
                        onChange={(e) => handleInputChange(exIdx, setIdx, 'weight', e.target.value)} 
                        className="col-span-3 bg-gray-900 border border-gray-700 rounded-lg text-center h-10 text-xs text-white font-medium outline-none focus:border-blue-500" 
                      />
                      <input 
                        type="text" 
                        value={log.reps} 
                        onChange={(e) => handleInputChange(exIdx, setIdx, 'reps', e.target.value)} 
                        className="col-span-2 bg-gray-900 border border-gray-700 rounded-lg text-center h-10 text-xs text-white font-medium outline-none focus:border-blue-500" 
                      />
                      <select 
                        value={log.rpe} 
                        onChange={(e) => handleInputChange(exIdx, setIdx, 'rpe', Number(e.target.value))}
                        className="col-span-3 bg-gray-900 border border-gray-700 rounded-lg text-center h-10 text-xs text-purple-400 font-bold outline-none cursor-pointer">
                        {[6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0].map(val => (
                          <option key={val} value={val} className="bg-gray-900 text-white">
                            {val.toFixed(1)}
                          </option>
                        ))}
                      </select>
                      <button 
                        onClick={() => handleToggleSet(exIdx, setIdx)} 
                        className={`col-span-2 h-10 rounded-lg font-bold flex items-center justify-center transition-all ${
                          log.done ? 'bg-green-600 text-white shadow-lg shadow-green-900/30' : 'bg-gray-700 hover:bg-gray-600 text-transparent'
                        }`}>
                        ✓
                      </button>
                    </div>

                    {/* Indikator Pembantu (Sesi Lalu) */}
                    {lastSet ? (
                      <div className="text-[10px] text-gray-400 pl-2 flex justify-between items-center">
                        <span>Lalu: <strong className="text-yellow-400">{lastSet.weight} kg</strong> × {lastSet.reps} reps</span>
                        <span className="text-purple-400">RPE {Number(lastSet.rpe || 6).toFixed(1)}</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-gray-500 pl-2 italic">Belum ada riwayat set ini</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Tombol Set On-The-Fly */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700/50">
              <button 
                onClick={() => handleAddSet(exIdx)} 
                className="w-1/2 bg-gray-900 hover:bg-gray-700 border border-gray-700 text-xs font-bold py-1.5 rounded-lg text-blue-400 transition-colors">
                + Tambah Set
              </button>
              <button 
                onClick={() => handleRemoveSet(exIdx)} 
                disabled={ex.logs.length <= 1}
                className="w-1/2 bg-gray-900 hover:bg-gray-700 border border-gray-700 text-xs font-bold py-1.5 rounded-lg text-red-400 disabled:opacity-40 transition-colors">
                - Hapus Set
              </button>
            </div>

          </div>
        ))}
      </div>

      {/* Tombol Tambah Exercise Card */}
      <div className="mt-4">
        <button 
          onClick={() => setShowAddExModal(true)}
          className="w-full bg-gray-800 hover:bg-gray-700 border border-dashed border-gray-600 text-gray-300 font-bold p-3 rounded-xl text-sm transition-colors">
          + Tambah Gerakan Lain (On-The-Fly)
        </button>
      </div>

      {/* Tombol Aksi Bawah */}
      <div className="mt-8 pt-4 border-t border-gray-800 flex flex-col gap-3">
        <button onClick={handleFinish} disabled={isSaving} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold p-4 rounded-xl text-lg shadow-lg">
          ✓ Selesai Latihan
        </button>
        <button className="w-full bg-red-950/40 border border-red-900/50 text-red-400 font-bold p-3 rounded-xl text-sm hover:bg-red-900/40" onClick={() => { if(window.confirm('Batalkan sesi latihan ini?')) setView('home'); }}>
          Batalkan Latihan
        </button>
      </div>

      {/* Modal Tambah Exercise On-The-Fly */}
      {showAddExModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold mb-4">Tambah Gerakan Baru</h2>
            <form onSubmit={handleAddExerciseCard} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nama Gerakan</label>
                <input 
                  type="text" 
                  placeholder="Contoh: Lateral Raise" 
                  value={newExNameInput} 
                  onChange={e => setNewExNameInput(e.target.value)} 
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm outline-none focus:border-blue-500" 
                  required 
                />
              </div>
              <div className="flex gap-2">
                <div className="w-1/2">
                  <label className="text-xs text-gray-400 mb-1 block">Jumlah Set</label>
                  <input 
                    type="number" 
                    value={newExSetsInput} 
                    onChange={e => setNewExSetsInput(e.target.value)} 
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm outline-none focus:border-blue-500" 
                    min="1"
                    required 
                  />
                </div>
                <div className="w-1/2">
                  <label className="text-xs text-gray-400 mb-1 block">Target Reps</label>
                  <input 
                    type="text" 
                    value={newExRepsInput} 
                    onChange={e => setNewExRepsInput(e.target.value)} 
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm outline-none focus:border-blue-500" 
                    required 
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAddExModal(false)} className="w-1/2 bg-gray-700 hover:bg-gray-600 py-3 rounded-xl font-bold text-sm">Batal</button>
                <button type="submit" className="w-1/2 bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold text-sm">Tambahkan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rest Timer Floating Bar */}
      {restTimer !== null && (
         <div className="fixed bottom-0 left-0 right-0 bg-blue-950 border-t-2 border-blue-500 p-4 z-50 rounded-t-3xl shadow-2xl text-center text-white max-w-md mx-auto">
            <div className="flex justify-between items-center mb-1 px-2">
              <span className="text-xs text-blue-300 font-bold tracking-wider">REST TIMER</span>
              <button onClick={() => setRestTimer(null)} className="text-xs bg-blue-900 px-2 py-0.5 rounded text-gray-300 hover:text-white">Skip</button>
            </div>
            
            <p className="text-4xl font-extrabold font-mono my-1 tracking-tight text-yellow-400">{formatTime(restTimer)}</p>
            
            <div className="flex justify-center gap-3 mt-3">
              <button 
                onClick={() => setRestTimer(r => Math.max(0, r - 30))} 
                className="bg-blue-900/80 hover:bg-blue-800 border border-blue-700 px-4 py-1.5 rounded-lg text-xs font-bold">
                -30s
              </button>
              <button 
                onClick={() => setRestTimer(r => r + 30)} 
                className="bg-blue-900/80 hover:bg-blue-800 border border-blue-700 px-4 py-1.5 rounded-lg text-xs font-bold">
                +30s
              </button>
            </div>
         </div>
      )}
    </div>
  );
}