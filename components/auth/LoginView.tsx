
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LogIn, AlertCircle, Loader2 } from 'lucide-react';

const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err: any) {
      console.error("Login Error:", err);
      if (err.code === 'auth/invalid-credential') {
          setError('Email atau password tidak sesuai. Pastikan akun sudah terdaftar dan provider login aktif.');
      } else if (err.code === 'auth/network-request-failed') {
          setError('Koneksi terputus. Mohon periksa internet Anda.');
      } else {
          setError('Login gagal. Periksa kembali data Anda atau hubungi Admin.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-100 p-4 font-sans">
      <div className="bg-white p-8 md:p-10 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in border border-white/50 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute -right-12 -top-12 w-32 h-32 bg-indigo-50 rounded-full opacity-50"></div>
        
        <div className="text-center mb-10 relative z-10">
            <h1 className="text-3xl font-black text-indigo-900 tracking-tighter">ReForma</h1>
            <p className="text-[10px] font-black text-indigo-400 mt-1 uppercase tracking-[0.2em]">Body & Paint Management System</p>
        </div>
        
        {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 text-xs rounded-xl border border-red-100 flex items-start gap-3 animate-shake">
                <AlertCircle className="shrink-0 mt-0.5" size={16}/>
                <div>
                    <p className="font-bold mb-0.5 uppercase tracking-tighter">Terjadi Kesalahan</p>
                    <p className="font-medium opacity-90 leading-relaxed">{error}</p>
                </div>
            </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5 relative z-10">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="block w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none text-gray-700 font-normal" 
              placeholder="admin@reforma.com" 
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="block w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none text-gray-700 font-normal" 
              placeholder="••••••••" 
              required
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 disabled:opacity-70 font-black tracking-wide transform active:scale-[0.98] mt-2"
          >
            {loading ? <Loader2 className="animate-spin" size={20}/> : <><LogIn size={20} /> SIGN IN</>}
          </button>
        </form>

        <div className="mt-12 text-center">
            <p className="text-[9px] text-gray-300 font-bold uppercase tracking-[0.2em]">© 2025 ReForma Workshop • Secure Access Only</p>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
