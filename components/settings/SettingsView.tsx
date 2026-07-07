
import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, updateDoc, deleteDoc, addDoc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, getDocs, setDoc } from 'firebase/firestore'; 
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { db, auth, firebaseConfig, SETTINGS_COLLECTION, SERVICES_MASTER_COLLECTION, USERS_COLLECTION, SERVICE_JOBS_COLLECTION, PURCHASE_ORDERS_COLLECTION } from '../../services/firebase';
import { Settings, UserPermissions, UserProfile, Supplier, ServiceMasterItem, Job, PurchaseOrder } from '../../types';
import { Save, Plus, Trash2, Building, Phone, Mail, Percent, Target, Calendar, User, Users, Shield, CreditCard, MessageSquare, Database, Download, Upload, Layers, Edit2, Loader2, RefreshCw, AlertTriangle, ShieldCheck, Search, Info, Palette, Wrench, Activity, ClipboardCheck, Car, Tag, UserPlus, Key, MailCheck, Globe, CheckCircle2, Bot, Smartphone, Send, Zap, Lock, ShieldAlert, KeyRound, Star, Wallet } from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from '../ui/Modal';

// ... (Interface and Props remain same)
interface SettingsViewProps {
  currentSettings: Settings;
  refreshSettings: () => Promise<void>;
  showNotification: (msg: string, type: string) => void;
  userPermissions: UserPermissions;
  realTimeSuppliers: Supplier[];
}

const SettingsView: React.FC<SettingsViewProps> = ({ currentSettings, refreshSettings, showNotification, userPermissions, realTimeSuppliers }) => {
  const [localSettings, setLocalSettings] = useState<Settings>(currentSettings);
  const [activeTab, setActiveTab] = useState('general');
  const [isLoading, setIsLoading] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const isManager = userPermissions.role === 'Manager';
  
  // Real-time Data States
  const [services, setServices] = useState<ServiceMasterItem[]>([]);
  const [systemUsers, setSystemUsers] = useState<UserProfile[]>([]);

  const [serviceForm, setServiceForm] = useState<Partial<ServiceMasterItem>>({ serviceCode: '', workType: 'KC', panelValue: 1.0 });
  const [isEditingService, setIsEditingService] = useState(false);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userForm, setUserForm] = useState({
      email: '',
      password: '',
      displayName: '',
      role: 'Staff'
  });

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [newCsiInput, setNewCsiInput] = useState('');

  // ... (useEffects and Handlers remain same until handleImportServices) ...
  useEffect(() => {
    setLocalSettings(currentSettings);
  }, [currentSettings]);

  useEffect(() => {
      const qServices = query(collection(db, SERVICES_MASTER_COLLECTION), orderBy('serviceName'));
      const unsubServices = onSnapshot(qServices, (snap) => {
          setServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceMasterItem)));
      }, (error) => console.error("Services Listener Error:", error));

      const qUsers = query(collection(db, USERS_COLLECTION));
      const unsubUsers = onSnapshot(qUsers, (snap) => {
          setSystemUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      }, (error) => console.error("Users Listener Error:", error));

      return () => { unsubServices(); unsubUsers(); };
  }, []);

  const filteredServices = useMemo(() => {
      if (!serviceSearchQuery) return services;
      const term = serviceSearchQuery.toLowerCase();
      return services.filter(s => s.serviceName.toLowerCase().includes(term) || (s.serviceCode && s.serviceCode.toLowerCase().includes(term)));
  }, [services, serviceSearchQuery]);

  const handleChange = (field: keyof Settings, value: any) => { setLocalSettings(prev => ({ ...prev, [field]: value })); };
  const handleNestedChange = (parent: 'whatsappTemplates' | 'whatsappConfig', field: string, value: any) => { setLocalSettings(prev => ({ ...prev, [parent]: { ...(prev[parent] || {}), [field]: value } })); };
  const handleArrayChange = (field: keyof Settings, index: number, value: any) => { const arr = [...(localSettings[field] as any[])]; arr[index] = value; setLocalSettings(prev => ({ ...prev, [field]: arr })); };
  const addItem = (field: keyof Settings, initialValue: any) => { setLocalSettings(prev => ({ ...prev, [field]: [...(prev[field] as any[]), initialValue] })); };
  const removeItem = (field: keyof Settings, index: number) => { const arr = [...(localSettings[field] as any[])]; arr.splice(index, 1); setLocalSettings(prev => ({ ...prev, [field]: arr })); };
  const handleAddCsiItem = () => { if (!newCsiInput.trim()) return; addItem('csiIndicators', newCsiInput); setNewCsiInput(''); };

  const saveSettings = async () => {
    if (!isManager) { showNotification("Akses Ditolak: Hanya Manager yang dapat menyimpan pengaturan.", "error"); return; }
    setIsLoading(true);
    try {
      const q = await getDocs(collection(db, SETTINGS_COLLECTION));
      if (q.empty) await addDoc(collection(db, SETTINGS_COLLECTION), localSettings);
      else await updateDoc(doc(db, SETTINGS_COLLECTION, q.docs[0].id), localSettings as any);
      showNotification("Pengaturan berhasil disimpan.", "success");
    } catch (e: any) { showNotification("Gagal menyimpan: " + e.message, "error"); } finally { setIsLoading(false); }
  };

  // ... (handleCreateUser, handleDeleteUser, Password handlers same as before) ...
  const handleCreateUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isManager) return;
      setIsLoading(true);
      let tempApp: firebase.app.App | null = null;
      let newUid: string | null = null;
      try {
          if (userForm.password) {
              if (userForm.password.length < 6) throw new Error("Password minimal 6 karakter.");
              const tempAppName = `tempApp-${Date.now()}`;
              tempApp = firebase.initializeApp(firebaseConfig, tempAppName);
              const tempAuth = tempApp.auth();
              const cred = await tempAuth.createUserWithEmailAndPassword(userForm.email, userForm.password);
              newUid = cred.user?.uid || null;
              await tempAuth.signOut();
          }
          const docId = newUid || userForm.email.toLowerCase();
          await setDoc(doc(db, USERS_COLLECTION, docId), { email: userForm.email.toLowerCase(), displayName: userForm.displayName, role: userForm.role, createdAt: serverTimestamp(), uid: newUid }, { merge: true }); 
          showNotification(`User ${userForm.displayName} berhasil didaftarkan.`, "success");
          setIsUserModalOpen(false);
          setUserForm({ email: '', displayName: '', role: 'Staff', password: '' });
      } catch (e: any) {
          console.error("Error creating user:", e);
          let msg = e.message;
          if (e.code === 'auth/email-already-in-use') {
              try {
                  await setDoc(doc(db, USERS_COLLECTION, userForm.email.toLowerCase()), { email: userForm.email.toLowerCase(), displayName: userForm.displayName, role: userForm.role, createdAt: serverTimestamp() }, { merge: true });
                  showNotification("Email sudah terdaftar. Hak akses diperbarui (via Email Key).", "success");
                  setIsUserModalOpen(false);
                  setUserForm({ email: '', displayName: '', role: 'Staff', password: '' });
                  return;
              } catch (fsErr: any) { msg = "Email ada di Auth tapi gagal update Firestore: " + fsErr.message; }
          }
          showNotification("Gagal menambah user: " + msg, "error");
      } finally { if (tempApp) await (tempApp as firebase.app.App).delete(); setIsLoading(false); }
  };

  const handleDeleteUser = async (uid: string) => { if (!window.confirm("Hapus akses user ini?")) return; try { await deleteDoc(doc(db, USERS_COLLECTION, uid)); showNotification("User dihapus.", "success"); } catch (e) { showNotification("Gagal menghapus.", "error"); } };
  const handleResetPassword = async (email: string) => { if (!window.confirm(`Kirim link reset password ke email: ${email}?`)) return; try { await auth.sendPasswordResetEmail(email); showNotification("Email reset password berhasil dikirim.", "success"); } catch (e: any) { showNotification("Gagal mengirim email reset.", "error"); } };
  const handleChangePassword = async (e: React.FormEvent) => { e.preventDefault(); if (newPassword !== confirmPassword) { showNotification("Konfirmasi password tidak cocok.", "error"); return; } if (newPassword.length < 6) { showNotification("Password minimal 6 karakter.", "error"); return; } setIsLoading(true); try { if (auth.currentUser) { await auth.currentUser.updatePassword(newPassword); showNotification("Password berhasil diubah.", "success"); setNewPassword(''); setConfirmPassword(''); } else { showNotification("Gagal: User tidak terdeteksi.", "error"); } } catch (e: any) { if (e.code === 'auth/requires-recent-login') showNotification("Sesi kadaluarsa. Silakan Logout lalu Login kembali untuk ubah password.", "error"); else showNotification("Gagal ubah password: " + e.message, "error"); } finally { setIsLoading(false); } };
  
  const handleSyncSystemData = async () => {
      if (!isManager) return;
      if (!window.confirm("Sinkronisasi data unit masif?")) return;
      setIsLoading(true);
      try {
          const jobsSnap = await getDocs(collection(db, SERVICE_JOBS_COLLECTION));
          const poSnap = await getDocs(collection(db, PURCHASE_ORDERS_COLLECTION));
          const allJobs = jobsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Job)).filter(j => !j.isClosed && !j.isDeleted);
          const allPOs = poSnap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseOrder));
          const batch = writeBatch(db);
          let updatedCount = 0;
          allJobs.forEach(job => {
              let hasChanged = false;
              const currentJobData = { ...job };
              const parts = [...(currentJobData.estimateData?.partItems || [])];
              let anyPartUpdated = false;
              if (parts.length > 0) {
                  parts.forEach((part, idx) => {
                      const isOrderedInPO = allPOs.some(po => (po.status !== 'Draft' && po.status !== 'Rejected') && po.items.some(item => item.refJobId === job.id && item.refPartIndex === idx));
                      if (isOrderedInPO && !part.isOrdered) { parts[idx] = { ...part, isOrdered: true }; anyPartUpdated = true; hasChanged = true; }
                  });
              }
              if (hasChanged) {
                  const jobRef = doc(db, SERVICE_JOBS_COLLECTION, job.id);
                  const updatePayload: any = { updatedAt: serverTimestamp() };
                  if (anyPartUpdated) updatePayload['estimateData.partItems'] = parts;
                  batch.update(jobRef, updatePayload);
                  updatedCount++;
              }
          });
          if (updatedCount > 0) { await batch.commit(); showNotification(`Berhasil merapikan ${updatedCount} data.`, "success"); } else { showNotification("Data sudah sinkron.", "success"); }
      } catch (e: any) { showNotification("Gagal: " + e.message, "error"); } finally { setIsLoading(false); }
  };

  const handleCleanupDuplicates = async () => { if (!isManager) return; setIsLoading(true); try { const seen = new Set<string>(); const toDelete: string[] = []; for (const s of services) { const key = `${s.serviceName.trim().toLowerCase()}_${s.workType}`; if (seen.has(key)) toDelete.push(s.id); else seen.add(key); } if (toDelete.length === 0) { showNotification("Tidak ada duplikat.", "success"); return; } if (window.confirm(`Hapus ${toDelete.length} duplikat?`)) { for (const id of toDelete) await deleteDoc(doc(db, SERVICES_MASTER_COLLECTION, id)); showNotification("Pembersihan selesai.", "success"); } } catch (e: any) { showNotification("Gagal: " + e.message, "error"); } finally { setIsLoading(false); } };
  const handleSaveService = async (e: React.FormEvent) => { e.preventDefault(); if (!isManager) return; setIsLoading(true); try { const payload = { ...serviceForm, serviceCode: serviceForm.serviceCode?.toUpperCase() || '' }; if (serviceForm.id) await updateDoc(doc(db, SERVICES_MASTER_COLLECTION, serviceForm.id), payload); else await addDoc(collection(db, SERVICES_MASTER_COLLECTION), { ...payload, createdAt: serverTimestamp() }); showNotification("Data diperbarui", "success"); setServiceForm({ serviceCode: '', workType: 'KC', panelValue: 1.0 }); setIsEditingService(false); } catch (e: any) { showNotification("Gagal: " + e.message, "error"); } finally { setIsLoading(false); } };
  const handleDeleteService = async (id: string) => { if (!isManager || !window.confirm("Hapus?")) return; try { await deleteDoc(doc(db, SERVICES_MASTER_COLLECTION, id)); showNotification("Terhapus", "success"); } catch(e) { showNotification("Gagal", "error"); } };
  
  const handleDownloadServiceTemplate = () => { const headers = [['Kode Jasa', 'Nama Jasa', 'Jenis Pekerjaan (KC/GTC/BP)', 'Nilai Panel', 'Harga Dasar']]; const sampleData = services.map(s => [s.serviceCode || '', s.serviceName, s.workType, s.panelValue, s.basePrice]); const ws = XLSX.utils.aoa_to_sheet([...headers, ...sampleData]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Master Jasa"); XLSX.writeFile(wb, "Master_Jasa_Panel.xlsx"); };

  const handleImportServices = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
          setIsLoading(true);
          try {
              const bstr = evt.target?.result;
              const wb = XLSX.read(bstr, { type: 'binary' });
              const wsname = wb.SheetNames[0];
              if (!wsname) throw new Error("File Excel tidak valid atau kosong.");
              
              const ws = wb.Sheets[wsname];
              const data = XLSX.utils.sheet_to_json(ws);
              
              if (!data || data.length === 0) throw new Error("Tidak ada data ditemukan dalam sheet.");

              let successCount = 0;
              const batch = writeBatch(db);
              
              // Process in chunks if needed, but for now simple loop is ok for <500 items
              for (const row of data as any[]) {
                  const serviceName = (row['Nama Jasa'] || '').toString().trim();
                  if (serviceName) {
                      const itemData = { 
                          serviceCode: String(row['Kode Jasa'] || '').toUpperCase(), 
                          serviceName, 
                          workType: (row['Jenis Pekerjaan (KC/GTC/BP)'] || 'KC') as any, 
                          panelValue: Number(row['Nilai Panel'] || 0), 
                          basePrice: Number(row['Harga Dasar'] || 0) 
                      };
                      const ref = doc(collection(db, SERVICES_MASTER_COLLECTION));
                      batch.set(ref, { ...itemData, createdAt: serverTimestamp() });
                      successCount++;
                  }
              }
              await batch.commit();
              showNotification(`Import Selesai. ${successCount} data ditambahkan.`, "success");
          } catch (err: any) { 
              console.error(err);
              showNotification("Error: " + err.message, "error"); 
          } finally { 
              setIsLoading(false); 
              e.target.value = ''; 
          }
      };
      reader.readAsBinaryString(file);
  };

  const RestrictedOverlay = () => (!isManager ? (<div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-xl"><div className="bg-white p-4 rounded-lg shadow-lg border border-red-100 flex items-center gap-3"><Shield className="text-red-500" size={24}/><div><p className="font-bold text-gray-800">Akses Terbatas</p><p className="text-xs text-gray-500">Hanya Manager yang dapat mengubah pengaturan ini.</p></div></div></div>) : null);
  const restrictedClass = !isManager ? "pointer-events-none opacity-80 relative" : "relative";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Pengaturan Sistem</h1>
          <div className="flex gap-3">
              {isManager && (<button onClick={handleSyncSystemData} disabled={isLoading} className="flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-2.5 rounded-lg hover:bg-amber-100 border border-amber-200 font-bold disabled:opacity-50 transition-all"><RefreshCw size={18}/> Data Doctor (Sync)</button>)}
              <button onClick={saveSettings} disabled={isLoading || !isManager} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 shadow-lg font-bold disabled:opacity-50">{isLoading ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>} Simpan Perubahan</button>
          </div>
      </div>

      <div className="flex border-b border-gray-200 bg-white rounded-t-xl overflow-x-auto">
          {[
            { id: 'general', label: 'Bengkel & Target' },
            { id: 'database', label: 'Data Master' },
            { id: 'unit_catalog', label: 'Katalog Unit' },
            { id: 'whatsapp', label: 'WhatsApp & Pesan' },
            { id: 'services', label: 'Master Jasa & Panel' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-6 py-4 text-sm font-bold capitalize transition-colors border-b-2 flex-shrink-0 ${activeTab === tab.id ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
            </button>
          ))}
      </div>

      <div className="bg-white p-6 rounded-b-xl border border-t-0 border-gray-200 shadow-sm relative min-h-[500px]">
          {activeTab === 'general' && (
              <div className={`space-y-8 ${restrictedClass}`}>
                  <RestrictedOverlay/>
                  {/* ... (Existing General Settings) */}
                  <section className="bg-indigo-50/30 p-6 rounded-2xl border border-indigo-100">
                    <h3 className="text-lg font-bold text-indigo-900 mb-4 flex items-center gap-2"><Globe className="text-indigo-600" size={20}/> Bahasa Tampilan</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex gap-3"><button onClick={() => handleChange('language', 'id')} className={`flex-1 py-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${localSettings.language === 'id' ? 'bg-white border-indigo-600 shadow-md ring-4 ring-indigo-50' : 'bg-gray-50 opacity-60'}`}><span className="text-3xl">🇮🇩</span><span className="font-black text-sm uppercase">Bahasa Indonesia</span></button><button onClick={() => handleChange('language', 'en')} className={`flex-1 py-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${localSettings.language === 'en' ? 'bg-white border-indigo-600 shadow-md ring-4 ring-indigo-50' : 'bg-gray-50 opacity-60'}`}><span className="text-3xl">🇺🇸</span><span className="font-black text-sm uppercase">English (US)</span></button></div>
                    </div>
                  </section>
                  <section>
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Building className="text-indigo-500"/> Informasi Bengkel</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div><label className="block text-sm font-medium mb-1">Nama Bengkel</label><input type="text" className="w-full p-2 border rounded" value={localSettings.workshopName} onChange={e => handleChange('workshopName', e.target.value)} /></div>
                        <div><label className="block text-sm font-medium mb-1">Email</label><input type="email" className="w-full p-2 border rounded" value={localSettings.workshopEmail} onChange={e => handleChange('workshopEmail', e.target.value)} /></div>
                        <div><label className="block text-sm font-medium mb-1">Nomor Telepon</label><input type="text" className="w-full p-2 border rounded" value={localSettings.workshopPhone} onChange={e => handleChange('workshopPhone', e.target.value)} /></div>
                        <div><label className="block text-sm font-medium mb-1">Alamat Lengkap</label><textarea className="w-full p-2 border rounded" rows={2} value={localSettings.workshopAddress} onChange={e => handleChange('workshopAddress', e.target.value)} /></div>
                    </div>
                  </section>
                  <section><h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Target className="text-red-500"/> Target & Pajak</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div><label className="block text-sm font-medium mb-1">PPN (%)</label><div className="relative"><input type="number" className="w-full p-2 border rounded pl-8" value={localSettings.ppnPercentage} onChange={e => handleChange('ppnPercentage', Number(e.target.value))} /><Percent size={14} className="absolute left-3 top-3 text-gray-400"/></div></div><div><label className="block text-sm font-medium mb-1">Target Bulanan (Rp)</label><input type="number" className="w-full p-2 border rounded" value={localSettings.monthlyTarget} onChange={e => handleChange('monthlyTarget', Number(e.target.value))} /></div><div><label className="block text-sm font-medium mb-1">Target Mingguan (Rp)</label><input type="number" className="w-full p-2 border rounded" value={localSettings.weeklyTarget} onChange={e => handleChange('weeklyTarget', Number(e.target.value))} /></div></div></section>
              </div>
          )}

          {activeTab === 'whatsapp' && (
              <div className={`space-y-8 animate-fade-in ${restrictedClass}`}>
                  <RestrictedOverlay />
                  {/* ... (Existing WhatsApp Config) */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <section className="bg-green-50/50 p-6 rounded-2xl border border-green-100">
                          <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
                            <MessageSquare className="text-green-600" size={20}/> Konfigurasi Pengiriman
                          </h3>
                          <div className="space-y-6">
                              <div>
                                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Pilih Mode WhatsApp</label>
                                  <div className="flex gap-4">
                                      <button 
                                          onClick={() => handleNestedChange('whatsappConfig', 'mode', 'MANUAL')}
                                          className={`flex-1 p-4 rounded-xl border-2 flex items-center gap-3 transition-all ${localSettings.whatsappConfig?.mode === 'MANUAL' ? 'bg-white border-green-600 shadow-md ring-4 ring-green-50' : 'bg-gray-50 border-transparent opacity-60'}`}
                                      >
                                          <Smartphone className={localSettings.whatsappConfig?.mode === 'MANUAL' ? 'text-green-600' : 'text-gray-400'} size={24}/>
                                          <div className="text-left"><p className="font-black text-xs uppercase">Manual (Personal)</p><p className="text-[10px] text-gray-500 leading-tight">Membuka Aplikasi WA Desktop/Web</p></div>
                                      </button>
                                      <button 
                                          onClick={() => handleNestedChange('whatsappConfig', 'mode', 'API')}
                                          className={`flex-1 p-4 rounded-xl border-2 flex items-center gap-3 transition-all ${localSettings.whatsappConfig?.mode === 'API' ? 'bg-white border-indigo-600 shadow-md ring-4 ring-indigo-50' : 'bg-gray-50 border-transparent opacity-60'}`}
                                      >
                                          <Bot className={localSettings.whatsappConfig?.mode === 'API' ? 'text-indigo-600' : 'text-gray-400'} size={24}/>
                                          <div className="text-left"><p className="font-black text-xs uppercase">Gateway API (Bot)</p><p className="text-[10px] text-gray-500 leading-tight">Pengiriman otomatis tanpa klik (Cloud)</p></div>
                                      </button>
                                  </div>
                              </div>
                              
                              {localSettings.whatsappConfig?.mode === 'API' && (
                                  <div className="space-y-4 p-4 bg-white rounded-xl border border-indigo-200 animate-fade-in">
                                      <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm mb-2">
                                          <KeyRound size={16}/> API Credentials (Client Owned)
                                      </div>
                                      <div>
                                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pilih Provider Gateway</label>
                                          <select 
                                              value={localSettings.whatsappConfig?.waProvider || 'Whacenter'} 
                                              onChange={e => handleNestedChange('whatsappConfig', 'waProvider', e.target.value)}
                                              className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                                          >
                                              <option value="Whacenter">Whacenter</option>
                                              <option value="Fonnte">Fonnte</option>
                                              <option value="Lainnya">Lainnya (Custom)</option>
                                          </select>
                                      </div>
                                      <div>
                                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">WA API KEY / TOKEN</label>
                                          <input 
                                              type="password" 
                                              value={localSettings.whatsappConfig?.waApiKey || ''}
                                              onChange={e => handleNestedChange('whatsappConfig', 'waApiKey', e.target.value)}
                                              placeholder="Masukkan token dari provider..."
                                              className="w-full p-2.5 border border-indigo-100 rounded-lg text-sm font-mono bg-indigo-50/30 focus:ring-2 focus:ring-indigo-500"
                                          />
                                          <p className="text-[9px] text-gray-400 mt-1 italic">* Token ini digunakan untuk pengiriman otomatis. Client disarankan membeli kuota sendiri ke provider.</p>
                                      </div>
                                  </div>
                              )}

                              <div className="bg-white/60 p-4 rounded-xl border border-green-100 flex items-start gap-3">
                                  <Info size={18} className="text-green-600 shrink-0 mt-0.5"/>
                                  <div className="text-xs text-green-800 leading-relaxed font-medium">
                                      <strong>Variabel Template:</strong><br/>
                                      Gunakan placeholder berikut dalam pesan agar terisi otomatis:<br/>
                                      <code className="bg-green-100 px-1 rounded font-bold">{"{nama}"}</code> : Nama Pelanggan<br/>
                                      <code className="bg-green-100 px-1 rounded font-bold">{"{mobil}"}</code> : Model Kendaraan<br/>
                                      <code className="bg-green-100 px-1 rounded font-bold">{"{nopol}"}</code> : No. Polisi<br/>
                                      <code className="bg-green-100 px-1 rounded font-bold">{"{tgl_booking}"}</code> : Tanggal Janji
                                  </div>
                              </div>
                          </div>
                      </section>

                      <div className="space-y-6">
                          <div className="grid grid-cols-1 gap-6">
                              <div>
                                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Calendar size={14}/> Template Pengingat Booking</label>
                                  <textarea 
                                      className="w-full p-4 border border-gray-200 rounded-xl text-sm min-h-[100px] focus:ring-4 focus:ring-green-50 transition-all font-medium" 
                                      value={localSettings.whatsappTemplates.bookingReminder}
                                      onChange={e => handleNestedChange('whatsappTemplates', 'bookingReminder', e.target.value)}
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2"><CheckCircle2 size={14}/> Template Unit Siap Ambil</label>
                                  <textarea 
                                      className="w-full p-4 border border-gray-200 rounded-xl text-sm min-h-[100px] focus:ring-4 focus:ring-green-50 transition-all font-medium" 
                                      value={localSettings.whatsappTemplates.readyForPickup}
                                      onChange={e => handleNestedChange('whatsappTemplates', 'readyForPickup', e.target.value)}
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Smartphone size={14}/> Template After Service (CSI)</label>
                                  <textarea 
                                      className="w-full p-4 border border-gray-200 rounded-xl text-sm min-h-[100px] focus:ring-4 focus:ring-green-50 transition-all font-medium" 
                                      value={localSettings.whatsappTemplates.afterService}
                                      onChange={e => handleNestedChange('whatsappTemplates', 'afterService', e.target.value)}
                                  />
                              </div>
                          </div>
                      </div>
                  </div>

                  <section className="bg-yellow-50/50 p-6 rounded-2xl border border-yellow-100 mt-8">
                      <h3 className="text-lg font-bold text-yellow-900 mb-4 flex items-center gap-2">
                          <Star className="text-yellow-600" size={20}/> Template Penilaian Pelanggan (CSI Survey)
                      </h3>
                      <div className="flex flex-col md:flex-row gap-6">
                          <div className="flex-1 space-y-4">
                              <p className="text-xs text-yellow-800 leading-relaxed">
                                  Tambahkan kriteria penilaian yang akan muncul saat tim CRC melakukan input survey kepuasan pelanggan. 
                                  Contoh: "Kualitas Perbaikan", "Kecepatan", "Keramahan Staff".
                              </p>
                              <div className="flex gap-2">
                                  <input 
                                      type="text" 
                                      className="flex-grow p-3 border border-yellow-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400"
                                      placeholder="Ketik kriteria baru..."
                                      value={newCsiInput}
                                      onChange={(e) => setNewCsiInput(e.target.value)}
                                      onKeyDown={(e) => e.key === 'Enter' && handleAddCsiItem()}
                                  />
                                  <button 
                                      onClick={handleAddCsiItem}
                                      className="bg-yellow-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-yellow-700 transition-colors shadow-sm"
                                  >
                                      <Plus size={18}/>
                                  </button>
                              </div>
                          </div>
                          <div className="flex-1 bg-white p-4 rounded-xl border border-yellow-200 max-h-60 overflow-y-auto">
                              <div className="flex flex-wrap gap-2">
                                  {(localSettings.csiIndicators || []).map((item, idx) => (
                                      <div key={idx} className="bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 border border-yellow-200 group">
                                          {item}
                                          <button 
                                              onClick={() => removeItem('csiIndicators', idx)}
                                              className="bg-white rounded-full p-0.5 text-yellow-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                                          >
                                              <Trash2 size={12}/>
                                          </button>
                                      </div>
                                  ))}
                                  {(localSettings.csiIndicators || []).length === 0 && (
                                      <span className="text-gray-400 text-xs italic">Belum ada kriteria penilaian.</span>
                                  )}
                              </div>
                          </div>
                      </div>
                  </section>
              </div>
          )}

          {activeTab === 'unit_catalog' && (
              <div className={`space-y-10 animate-fade-in ${restrictedClass}`}>
                  <RestrictedOverlay />
                  {/* ... (Existing Catalog Settings) */}
                  <section className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-black text-gray-800 flex items-center gap-2 uppercase tracking-widest text-xs"><Car size={16} className="text-indigo-500"/> Master Merk Kendaraan</h4>
                      <button onClick={() => addItem('carBrands', '')} className="text-[10px] bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-indigo-700 transition-all">
                        <Plus size={14}/> Tambah Merk
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {(localSettings.carBrands || []).map((brand, idx) => (
                        <div key={idx} className="flex gap-1 group">
                          <input type="text" className="w-full p-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:ring-2 focus:ring-indigo-50" value={brand} onChange={e => handleArrayChange('carBrands', idx, e.target.value)} />
                          <button onClick={() => removeItem('carBrands', idx)} className="text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-black text-gray-800 flex items-center gap-2 uppercase tracking-widest text-xs"><Layers size={16} className="text-blue-500"/> Katalog Model / Tipe</h4>
                      <button onClick={() => addItem('carModels', '')} className="text-[10px] bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-blue-700 transition-all">
                        <Plus size={14}/> Tambah Tipe
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {(localSettings.carModels || []).map((model, idx) => (
                        <div key={idx} className="flex gap-1 group">
                          <input type="text" className="w-full p-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500" value={model} onChange={e => handleArrayChange('carModels', idx, e.target.value)} />
                          <button onClick={() => removeItem('carModels', idx)} className="text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-black text-gray-800 flex items-center gap-2 uppercase tracking-widest text-xs"><Palette size={16} className="text-purple-500"/> Katalog Warna Kendaraan</h4>
                      <button onClick={() => addItem('carColors', '')} className="text-[10px] bg-purple-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-purple-700 transition-all">
                        <Plus size={14}/> Tambah Warna
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {(localSettings.carColors || []).map((color, idx) => (
                        <div key={idx} className="flex gap-1 group">
                          <input type="text" className="w-full p-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:ring-2 focus:ring-purple-500" value={color} onChange={e => handleArrayChange('carColors', idx, e.target.value)} />
                          <button onClick={() => removeItem('carColors', idx)} className="text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
              </div>
          )}

          {activeTab === 'services' && (
              <div className={`space-y-8 animate-fade-in ${restrictedClass}`}>
                  <RestrictedOverlay />
                  
                  {/* NEW: Input Rate Panel per Mekanik */}
                  <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-100 flex items-center justify-between">
                      <div>
                          <h4 className="font-bold text-emerald-900 flex items-center gap-2 text-sm"><Wallet size={18}/> Standar Gaji Mekanik (Per Panel)</h4>
                          <p className="text-xs text-emerald-700 mt-1">Nilai ini digunakan untuk menghitung estimasi gaji teknisi di Laporan Produksi.</p>
                      </div>
                      <div className="relative">
                          <span className="absolute left-3 top-2.5 font-bold text-emerald-500">Rp</span>
                          <input 
                              type="number" 
                              className="w-48 pl-10 p-2.5 border border-emerald-300 rounded-lg font-black text-emerald-800 focus:ring-2 focus:ring-emerald-500"
                              value={localSettings.mechanicPanelRate || 0}
                              onChange={e => handleChange('mechanicPanelRate', Number(e.target.value))}
                          />
                      </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <h3 className="text-lg font-bold text-gray-800">Daftar Master Jasa (Standar Panel)</h3>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={handleCleanupDuplicates} className="flex items-center gap-1 bg-amber-50 text-amber-700 px-3 py-1.5 rounded border border-amber-200 hover:bg-amber-100 text-xs font-bold"><ShieldCheck size={14}/> Cleanup</button>
                          <button onClick={handleDownloadServiceTemplate} className="flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-200 text-xs font-bold"><Download size={14}/> Template/Export</button>
                          <label className="flex items-center gap-2 cursor-pointer bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded border border-emerald-200 hover:bg-emerald-100 text-xs font-bold"><Upload size={14}/> Import & Update<input disabled={!isManager} type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleImportServices} /></label>
                        </div>
                      </div>
                      <div className="mb-4 relative group">
                        <Search className="absolute left-3 top-2.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" size={18}/>
                        <input type="text" placeholder="Cari..." value={serviceSearchQuery} onChange={e => setServiceSearchQuery(e.target.value)} className="w-full pl-10 p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-indigo-50 outline-none transition-all"/>
                      </div>
                      <div className="overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50 text-gray-600 uppercase sticky top-0 z-20">
                            <tr>
                              <th className="px-4 py-3">Kode</th>
                              <th className="px-4 py-3">Nama Pekerjaan</th>
                              <th className="px-4 py-3">Jenis</th>
                              <th className="px-4 py-3 text-center">Panel</th>
                              <th className="px-4 py-3 text-right">Harga</th>
                              <th className="px-4 py-3 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filteredServices.map(s => (
                              <tr key={s.id} className="hover:bg-gray-50 group">
                                <td className="px-4 py-2 font-mono text-xs font-bold text-gray-400">{s.serviceCode || '-'}</td>
                                <td className="px-4 py-2 font-bold text-gray-700 uppercase">{s.serviceName}</td>
                                <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-black border ${s.workType === 'KC' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700'}`}>{s.workType}</span></td>
                                <td className="px-4 py-2 text-center font-black">{s.panelValue}</td>
                                <td className="px-4 py-2 text-right font-black text-emerald-600">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(s.basePrice)}</td>
                                <td className="px-4 py-2 flex justify-end gap-2 opacity-0 group-hover:opacity-100">
                                  <button onClick={() => { setServiceForm(s); setIsEditingService(true); }} className="text-indigo-500 p-1"><Edit2 size={14}/></button>
                                  <button onClick={() => handleDeleteService(s.id)} className="text-red-500 p-1"><Trash2 size={14}/></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit flex flex-col sticky top-4">
                      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Layers className="text-indigo-600" size={20}/> {isEditingService ? 'Edit Jasa' : 'Input Jasa Baru'}</h3>
                      <form onSubmit={handleSaveService} className="space-y-4">
                        <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nama Pekerjaan *</label><input disabled={!isManager} required type="text" value={serviceForm.serviceName || ''} onChange={e => setServiceForm({...serviceForm, serviceName: e.target.value})} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-50 font-bold" /></div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nilai Panel</label><input disabled={!isManager} type="number" step="0.1" value={serviceForm.panelValue || 0} onChange={e => setServiceForm({...serviceForm, panelValue: Number(e.target.value)})} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-50 font-black"/></div>
                          <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Harga Dasar</label><input disabled={!isManager} type="number" value={serviceForm.basePrice || 0} onChange={e => setServiceForm({...serviceForm, basePrice: Number(e.target.value)})} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-50 font-black text-emerald-600"/></div>
                        </div>
                        <button disabled={isLoading || !isManager} type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl hover:bg-indigo-700 shadow-lg font-black">{isLoading ? 'Proses...' : 'SIMPAN DATA'}</button>
                      </form>

                      <div className="mt-8 pt-8 border-t border-gray-100">
                          <div className="flex justify-between items-center mb-4">
                              <h4 className="font-black text-rose-800 flex items-center gap-2 uppercase tracking-widest text-[10px]">
                                  <Palette size={14} className="text-rose-500"/> Harga Warna Spesial
                              </h4>
                              <button 
                                  onClick={() => {
                                      const current = localSettings.specialColorRates || [];
                                      handleChange('specialColorRates', [...current, { colorName: '', surchargePerPanel: 0 }]);
                                  }}
                                  className="text-[9px] bg-rose-500 text-white px-2 py-1 rounded font-bold hover:bg-rose-600 transition-colors"
                              >
                                  + TAMBAH
                              </button>
                          </div>
                          <div className="space-y-3">
                              {(localSettings.specialColorRates || []).map((rate, idx) => (
                                  <div key={idx} className="bg-rose-50/50 p-3 rounded-xl border border-rose-100 flex items-center gap-2 group animate-fade-in">
                                      <div className="flex-grow space-y-1">
                                          <input 
                                              type="text" 
                                              placeholder="Nama Warna..." 
                                              className="w-full bg-transparent border-none p-0 text-[10px] font-black text-rose-900 uppercase focus:ring-0"
                                              value={rate.colorName}
                                              onChange={e => {
                                                  const newRates = [...localSettings.specialColorRates];
                                                  newRates[idx].colorName = e.target.value.toUpperCase();
                                                  handleChange('specialColorRates', newRates);
                                              }}
                                          />
                                          <div className="flex items-center gap-1">
                                              <span className="text-[9px] font-bold text-rose-400">Rp</span>
                                              <input 
                                                  type="number" 
                                                  className="w-full bg-transparent border-none p-0 text-xs font-black text-emerald-600 focus:ring-0"
                                                  value={rate.surchargePerPanel}
                                                  onChange={e => {
                                                      const newRates = [...localSettings.specialColorRates];
                                                      newRates[idx].surchargePerPanel = Number(e.target.value);
                                                      handleChange('specialColorRates', newRates);
                                                  }}
                                              />
                                          </div>
                                      </div>
                                      <button 
                                          onClick={() => {
                                              const newRates = localSettings.specialColorRates.filter((_, i) => i !== idx);
                                              handleChange('specialColorRates', newRates);
                                          }}
                                          className="text-rose-300 hover:text-rose-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                          <Trash2 size={14}/>
                                      </button>
                                  </div>
                              ))}
                              {(!localSettings.specialColorRates || localSettings.specialColorRates.length === 0) && (
                                  <div className="text-center py-4 text-[10px] text-gray-400 italic font-medium">Belum ada warna spesial.</div>
                              )}
                          </div>
                          <div className="mt-3 p-2 bg-amber-50 rounded border border-amber-100 flex items-start gap-1.5">
                              <Info size={12} className="text-amber-600 shrink-0 mt-0.5"/>
                              <p className="text-[9px] text-amber-800 leading-tight">Biaya warna spesial dihitung per panel dikali nilai surcharge di atas.</p>
                          </div>
                      </div>
                    </div>
                  </div>
              </div>
          )}

          {activeTab === 'database' && (
              <div className="space-y-10 animate-fade-in">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className={`bg-gray-50 p-6 rounded-2xl border border-gray-200 flex flex-col h-fit ${!isManager ? 'opacity-80 pointer-events-none' : ''}`}>
                          <div className="flex justify-between items-center mb-6">
                              <h4 className="font-bold text-gray-800 flex items-center gap-2 uppercase tracking-widest text-xs">
                                  <Users size={16} className="text-indigo-600"/> Manajemen User & Akses
                              </h4>
                              <button onClick={() => setIsUserModalOpen(true)} className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-black shadow-sm flex items-center gap-1 hover:bg-indigo-700 transition-all">
                                  <UserPlus size={14}/> Tambah User
                              </button>
                          </div>
                          
                          <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin pr-2">
                              {systemUsers.map(user => (
                                  <div key={user.uid} className="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center group hover:border-indigo-200 transition-all">
                                      <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-black border border-indigo-100 shadow-sm">
                                              {(user.displayName || 'U')[0].toUpperCase()}
                                          </div>
                                          <div>
                                              <p className="text-sm font-black text-gray-800 uppercase tracking-tighter leading-none">{user.displayName || 'User'}</p>
                                              <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase">{user.role || 'Staff'}</p>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button onClick={() => handleResetPassword(user.email!)} className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors" title="Kirim Email Reset Password">
                                              <MailCheck size={16}/>
                                          </button>
                                          <button onClick={() => handleDeleteUser(user.uid)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Hapus User">
                                              <Trash2 size={16}/>
                                          </button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                          {!isManager && <div className="mt-4 p-3 bg-red-50 text-red-600 text-[10px] font-bold rounded-lg border border-red-100 flex items-center gap-2"><ShieldAlert size={14}/> Hanya Manager yang dapat mendaftarkan/menghapus user.</div>}
                      </div>

                      <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-sm h-fit">
                          <h4 className="font-bold text-gray-800 flex items-center gap-2 uppercase tracking-widest text-xs mb-6">
                              <Lock size={16} className="text-indigo-600"/> Keamanan Akun Anda
                          </h4>
                          <form onSubmit={handleChangePassword} className="space-y-4">
                              <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 mb-2">
                                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Akun Terdaftar</p>
                                  <p className="text-sm font-bold text-indigo-900 mt-1">{auth.currentUser?.email}</p>
                              </div>
                              <div>
                                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Password Baru</label>
                                  <input 
                                      type="password" required 
                                      value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                      className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-indigo-50 focus:bg-white transition-all outline-none font-bold"
                                      placeholder="••••••••"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Konfirmasi Password Baru</label>
                                  <input 
                                      type="password" required 
                                      value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                                      className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-indigo-50 focus:bg-white transition-all outline-none font-bold"
                                      placeholder="••••••••"
                                  />
                              </div>
                              <button type="submit" disabled={isLoading} className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-black shadow-lg hover:bg-black transition-all transform active:scale-95 flex items-center justify-center gap-2">
                                  {isLoading ? <Loader2 className="animate-spin" size={18}/> : <RefreshCw size={18}/>}
                                  GANTI PASSWORD
                              </button>
                          </form>
                      </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className={`bg-gray-50 p-6 rounded-2xl border border-gray-200 ${restrictedClass}`}>
                        <RestrictedOverlay/>
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-gray-700 flex items-center gap-2 uppercase tracking-widest text-xs">
                                <Wrench size={16} className="text-gray-500"/> Daftar Mekanik Produksi
                            </h4>
                            <button onClick={() => addItem('mechanicNames', '')} className="text-xs bg-white text-indigo-700 px-3 py-1.5 rounded-lg font-bold border border-indigo-200 hover:bg-indigo-50 shadow-sm transition-all flex items-center gap-1">
                                <Plus size={14}/> Tambah Mekanik
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto scrollbar-thin pr-2">
                            {(localSettings.mechanicNames || []).map((mech, idx) => (
                                <div key={idx} className="flex items-center gap-2 group animate-fade-in bg-white p-1 rounded-xl border border-gray-100 shadow-sm focus-within:border-indigo-300 transition-all">
                                    <input type="text" className="flex-1 w-full min-w-0 p-2 bg-transparent outline-none text-sm font-black text-gray-800 uppercase" value={mech} onChange={e => handleArrayChange('mechanicNames', idx, e.target.value)} />
                                    <button onClick={() => removeItem('mechanicNames', idx)} className="shrink-0 text-red-300 hover:text-red-600 p-2 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 rounded-lg">
                                        <Trash2 size={16}/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={`bg-gray-50 p-6 rounded-2xl border border-gray-200 ${restrictedClass}`}>
                        <RestrictedOverlay/>
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-gray-700 flex items-center gap-2 uppercase tracking-widest text-xs">
                                <ShieldCheck size={16} className="text-indigo-500"/> Daftar Role / Hak Akses
                            </h4>
                            <button onClick={() => addItem('roleOptions', '')} className="text-xs bg-white text-indigo-700 px-3 py-1.5 rounded-lg font-bold border border-indigo-200 hover:bg-indigo-50 shadow-sm transition-all flex items-center gap-1">
                                <Plus size={14}/> Tambah Role
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto scrollbar-thin pr-2">
                            {(localSettings.roleOptions || []).map((role, idx) => (
                                <div key={idx} className="flex items-center gap-2 group animate-fade-in bg-white p-1 rounded-xl border border-gray-100 shadow-sm focus-within:border-indigo-300 transition-all">
                                    <input type="text" className="flex-1 w-full min-w-0 p-2 bg-transparent outline-none text-sm font-black text-indigo-700 uppercase" value={role} onChange={e => handleArrayChange('roleOptions', idx, e.target.value)} />
                                    <button onClick={() => removeItem('roleOptions', idx)} className="shrink-0 text-red-300 hover:text-red-600 p-2 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 rounded-lg">
                                        <Trash2 size={16}/>
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 p-3 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-lg border border-indigo-100">
                           <Info size={14} className="inline mr-1"/> Daftar role ini akan muncul sebagai pilihan saat mendaftarkan staff baru.
                        </div>
                    </div>
                  </div>
              </div>
          )}
      </div>

      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title="Daftarkan User Baru">
          <form onSubmit={handleCreateUser} className="space-y-5">
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 flex items-start gap-3 mb-4">
                  <Info className="text-amber-600 mt-1 shrink-0" size={20}/>
                  <p className="text-xs text-amber-800 leading-relaxed font-medium">Password awal wajib diisi untuk membuat akun login baru. Jika user sudah punya akun, password ini akan diabaikan.</p>
              </div>
              <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email Aktif (Login ID) *</label>
                  <input type="email" required value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-indigo-50 font-bold" placeholder="user@reforma.com"/>
              </div>
              <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Password Awal (Min 6 Karakter) *</label>
                  <input type="text" required value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-indigo-50 font-bold" placeholder="Password123"/>
              </div>
              <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Nama Lengkap Tampilan *</label>
                  <input type="text" required value={userForm.displayName} onChange={e => setUserForm({...userForm, displayName: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-indigo-50 font-bold uppercase" placeholder="Nama Staff..."/>
              </div>
              <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Hak Akses / Role *</label>
                  <select required value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-indigo-50 font-bold">
                      {localSettings.roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black shadow-xl hover:bg-indigo-700 flex items-center justify-center gap-2 transform active:scale-95 transition-all">
                  {isLoading ? <Loader2 className="animate-spin" size={20}/> : <><UserPlus size={20}/> SIMPAN & AKTIFKAN AKSES</>}
              </button>
          </form>
      </Modal>
    </div>
  );
};

export default SettingsView;
