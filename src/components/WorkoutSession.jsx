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

export default function WorkoutSession({ activeTemplate, setView, fetchTemplates, fetchLogs, logs, session }) {
  // 1. Key LocalStorage Unik
  const STORAGE_KEY = `active_workout_${activeTemplate?.id || 'session'}`;
  const REST_STORAGE_KEY = `active_rest_${activeTemplate?.id || 'session'}`;

  const [isSaving, setIsSaving] = useState(false);

  // 2. Inisialisasi State WorkoutData (Restore dari LocalStorage atau buat baru)
  const [workoutData, setWorkoutData] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Gagal memuat sesi tersimpan:", e);
      }
    }

    if (!activeTemplate) return { id: null, name: 'Latihan', exercises: [], startTime: Date.now() };

    return {
      ...activeTemplate,
      startTime: Date.now(), // Timestamp waktu mulai latihan
      exercises: (activeTemplate.exercises || []).map(ex => {
        const lastSessionEx = getLastSessionData(logs, ex.name);
        const prevLogs = lastSessionEx?.logs_detail;

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

  // Auto-Save WorkoutData ke LocalStorage
  useEffect(() => {
    if (workoutData) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workoutData));
    }
  }, [workoutData, STORAGE_KEY]);

  // 3. Timer Durasi Latihan (Berbasis Timestamp - Tahan Refresh)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!workoutData?.startTime) return;

    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.floor((now - workoutData.startTime) / 1000);
      setElapsedSeconds(diff > 0 ? diff : 0);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [workoutData?.startTime]);

  const formatTime = (sec) => {
    const mins = Math.floor(sec / 60).toString().padStart(2, '0');
    const secs = (sec % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // 4. Rest Timer (Berbasis Timestamp - Tahan Refresh)
  const [restEndTime, setRestEndTime] = useState(() => {
    const saved = localStorage.getItem(REST_STORAGE_KEY);
    return saved ? Number(saved) : null;
  });
  const [restRemaining, setRestRemaining] = useState(null);

  const playTimerAlert = () => {
    if ("vibrate" in navigator) navigator.vibrate([200, 100, 200, 100, 300]);
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine'; 
      osc1.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain1.gain.setValueAtTime(0.2, audioCtx.currentTime); 
      osc1.connect(gain1); 
      gain1.connect(audioCtx.destination);
      osc1.start(); 
      osc1.stop(audioCtx.currentTime + 0.2);
    } catch (e) { 
      console.log("Audio error:", e); 
    }
  };

  useEffect(() => {
    if (!restEndTime) {
      setRestRemaining(null);
      return;
    }

    const updateRest = () => {
      const now = Date.now();
      const remaining = Math.ceil((restEndTime - now) / 1000);

      if (remaining <= 0) {
        setRestRemaining(null);
        setRestEndTime(null);
        localStorage.removeItem(REST_STORAGE_KEY);
        playTimerAlert();
      } else {
        setRestRemaining(remaining);
      }
    };

    updateRest();
    const interval = setInterval(updateRest, 1000);
    return () => clearInterval(interval);
  }, [restEndTime, REST_STORAGE_KEY]);

  const startRestTimer = (seconds = 90) => {
    const targetTime = Date.now() + seconds * 1000;
    setRestEndTime(targetTime);
    localStorage.setItem(REST_STORAGE_KEY, targetTime.toString());
  };

  const cancelRestTimer = () => {
    setRestEndTime(null);
    setRestRemaining(null);
    localStorage.removeItem(REST_STORAGE_KEY);
  };

  // State Modal Tambah Exercise
  const [showAddExModal, setShowAddExModal] = useState(false);
  const [newExNameInput, setNewExNameInput] = useState('');
  const [newExSetsInput, setNewExSetsInput] = useState(3);
  const [newExRepsInput, setNewExRepsInput] = useState('8-10');

  // Helper Pembersih Semua Cache Sesi
  const clearAllCache = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(REST_STORAGE_KEY);
    localStorage.removeItem('app_current_view');
    localStorage.removeItem('app_active_template');
  };

  // Toggle Checkbox Set
  const handleToggleSet = (exIdx, setIdx) => {
    const newData = { ...workoutData };
    const targetSet = newData.exercises[exIdx].logs[setIdx];
    targetSet.done = !targetSet.done;
    setWorkoutData(newData);

    if (targetSet.done) {
      const customRest = newData.exercises[exIdx].rest_time || 90;
      startRestTimer(customRest);
    } else {
      cancelRestTimer();
    }
  };

  const handleInputChange = (exIdx, setIdx, field, value) => {
    const newData = { ...workoutData };
    newData.exercises[exIdx].logs[setIdx][field] = value;
    setWorkoutData(newData);
  };

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
    const totalDuration = formatTime(elapsedSeconds);
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
      
      // Clear cache & pindah halaman
      clearAllCache();
      await fetchTemplates(); 
      await fetchLogs(); 
      setView('history');
    }
  };

  // --- BATALKAN LATIHAN ---
  const handleCancelWorkout = () => {
    if (window.confirm('Batalkan sesi latihan ini?')) {
      clearAllCache();
      setView('home');
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 pb-48">
      {/* Header Sticky */}
      <div className="sticky top-0 bg-gray-900/95 backdrop-blur py-3 mb-4 flex justify-between items-center border-b border-gray-800 z-10">
        <div>
          <h1 className="text-xl font-bold">{workoutData.name}</h1>
          <div className="text-blue-400 font-mono text-sm">⏱ {formatTime(elapsedSeconds)}</div>
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
        <button 
          className="w-full bg-red-950/40 border border-red-900/50 text-red-400 font-bold p-3 rounded-xl text-sm hover:bg-red-900/40" 
          onClick={handleCancelWorkout} 
        >
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
      {restRemaining !== null && (
         <div className="fixed bottom-0 left-0 right-0 bg-blue-950 border-t-2 border-blue-500 p-4 z-50 rounded-t-3xl shadow-2xl text-center text-white max-w-md mx-auto">
            <div className="flex justify-between items-center mb-1 px-2">
              <span className="text-xs text-blue-300 font-bold tracking-wider">REST TIMER</span>
              <button onClick={cancelRestTimer} className="text-xs bg-blue-900 px-2 py-0.5 rounded text-gray-300 hover:text-white">Skip</button>
            </div>
            
            <p className="text-4xl font-extrabold font-mono my-1 tracking-tight text-yellow-400">{formatTime(restRemaining)}</p>
            
            <div className="flex justify-center gap-3 mt-3">
              <button 
                onClick={() => startRestTimer(Math.max(0, restRemaining - 30))} 
                className="bg-blue-900/80 hover:bg-blue-800 border border-blue-700 px-4 py-1.5 rounded-lg text-xs font-bold">
                -30s
              </button>
              <button 
                onClick={() => startRestTimer(restRemaining + 30)} 
                className="bg-blue-900/80 hover:bg-blue-800 border border-blue-700 px-4 py-1.5 rounded-lg text-xs font-bold">
                +30s
              </button>
            </div>
         </div>
      )}
    </div>
  );
}