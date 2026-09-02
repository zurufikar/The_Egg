import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    let error;
    if (isSignUp) {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      error = signUpError;
      if (!error) alert('Pendaftaran berhasil! Silakan login.');
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      error = signInError;
    }

    if (error) alert(error.message);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-900 text-white">
      <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 w-full max-w-sm shadow-xl">
        <h1 className="text-2xl font-bold mb-2 text-center text-blue-400">Gym Tracker</h1>
        <p className="text-xs text-gray-400 mb-6 text-center">
          {isSignUp ? 'Bikin akun baru kamu' : 'Masuk untuk mencatat latihan'}
        </p>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Email</label>
            <input
              type="email"
              placeholder="email@kamu.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 font-bold p-3 rounded-xl text-sm transition-colors shadow-lg disabled:opacity-50">
            {loading ? 'Memproses...' : isSignUp ? 'Daftar Akun' : 'Masuk'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs text-blue-400 hover:underline">
            {isSignUp ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar sekarang'}
          </button>
        </div>
      </div>
    </div>
  );
}