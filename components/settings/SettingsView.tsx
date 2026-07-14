import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, updateDoc, deleteDoc, addDoc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, getDocs, setDoc } from 'firebase/firestore'; 
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as firebaseSignOut, updatePassword, sendPasswordResetEmail } from 'firebase/auth';
import { db, auth, firebaseConfig, SETTINGS_COLLECTION, SERVICES_MASTER_COLLECTION, USERS_COLLECTION, SERVICE_JOBS_COLLECTION, PURCHASE_ORDERS_COLLECTION } from '../../services/firebase';
import { Settings, UserPermissions, UserProfile, Supplier, ServiceMasterItem, Job, PurchaseOrder } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import * as XLSX from 'xlsx';
import Modal from '../ui/Modal';

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
    if (!isManager) { showNotification("AKSES DITOLAK: HANYA MANAGER YANG DAPAT MENYIMPAN PENGATURAN.", "error"); return; }
    setIsLoading(true);
    try {
      const q = await getDocs(collection(db, SETTINGS_COLLECTION));
      if (q.empty) await addDoc(collection(db, SETTINGS_COLLECTION), localSettings);
      else await updateDoc(doc(db, SETTINGS_COLLECTION, q.docs[0].id), localSettings as any);
      showNotification("PENGATURAN BERHASIL DISIMPAN.", "success");
    } catch (e: any) { showNotification("GAGAL MENYIMPAN: " + e.message, "error"); } finally { setIsLoading(false); }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isManager) return;
      setIsLoading(true);
      let tempApp: any = null;
      let newUid: string | null = null;
      try {
          if (userForm.password) {
              if (userForm.password.length < 6) throw new Error("PASSWORD MINIMAL 6 KARAKTER.");
              const tempAppName = `tempApp-${Date.now()}`;
              tempApp = initializeApp(firebaseConfig, tempAppName);
              const tempAuth = getAuth(tempApp);
              const cred = await createUserWithEmailAndPassword(tempAuth, userForm.email, userForm.password);
              newUid = cred.user?.uid || null;
              await firebaseSignOut(tempAuth);
          }
          const docId = newUid || userForm.email.toLowerCase();
          await setDoc(doc(db, USERS_COLLECTION, docId), { email: userForm.email.toLowerCase(), displayName: userForm.displayName, role: userForm.role, createdAt: serverTimestamp(), uid: newUid }, { merge: true }); 
          showNotification(`USER ${userForm.displayName} BERHASIL DIDAFTARKAN.`, "success");
          setIsUserModalOpen(false);
          setUserForm({ email: '', displayName: '', role: 'Staff', password: '' });
      } catch (e: any) {
          console.error("Error creating user:", e);
          let msg = e.message;
          if (e.code === 'auth/email-already-in-use') {
              try {
                  await setDoc(doc(db, USERS_COLLECTION, userForm.email.toLowerCase()), { email: userForm.email.toLowerCase(), displayName: userForm.displayName, role: userForm.role, createdAt: serverTimestamp() }, { merge: true });
                  showNotification("EMAIL SUDAH TERDAFTAR. HAK AKSES DIPERBARUI (VIA EMAIL KEY).", "success");
                  setIsUserModalOpen(false);
                  setUserForm({ email: '', displayName: '', role: 'Staff', password: '' });
                  return;
              } catch (fsErr: any) { msg = "EMAIL ADA DI AUTH TAPI GAGAL UPDATE FIRESTORE: " + fsErr.message; }
          }
          showNotification("GAGAL MENAMBAH USER: " + msg, "error");
      } finally { if (tempApp) await deleteApp(tempApp); setIsLoading(false); }
  };

  const handleDeleteUser = async (uid: string) => { if (!window.confirm("HAPUS AKSES USER INI?")) return; try { await deleteDoc(doc(db, USERS_COLLECTION, uid)); showNotification("USER DIHAPUS.", "success"); } catch (e) { showNotification("GAGAL MENGHAPUS.", "error"); } };
  const handleResetPassword = async (email: string) => { if (!window.confirm(`KIRIM LINK RESET PASSWORD KE EMAIL: ${email}?`)) return; try { await sendPasswordResetEmail(auth, email); showNotification("EMAIL RESET PASSWORD BERHASIL DIKIRIM.", "success"); } catch (e: any) { showNotification("GAGAL MENGIRIM EMAIL RESET.", "error"); } };
  const handleChangePassword = async (e: React.FormEvent) => { e.preventDefault(); if (newPassword !== confirmPassword) { showNotification("KONFIRMASI PASSWORD TIDAK COCOK.", "error"); return; } if (newPassword.length < 6) { showNotification("PASSWORD MINIMAL 6 KARAKTER.", "error"); return; } setIsLoading(true); try { if (auth.currentUser) { await updatePassword(auth.currentUser, newPassword); showNotification("PASSWORD BERHASIL DIUBAH.", "success"); setNewPassword(''); setConfirmPassword(''); } else { showNotification("GAGAL: USER TIDAK TERDETEKSI.", "error"); } } catch (e: any) { if (e.code === 'auth/requires-recent-login') showNotification("SESI KADALUARSA. SILAKAN LOGOUT LALU LOGIN KEMBALI UNTUK UBAH PASSWORD.", "error"); else showNotification("GAGAL UBAH PASSWORD: " + e.message, "error"); } finally { setIsLoading(false); } };
  
  const handleSyncSystemData = async () => {
      if (!isManager) return;
      if (!window.confirm("SINKRONISASI DATA UNIT MASIF?")) return;
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
          if (updatedCount > 0) { await batch.commit(); showNotification(`BERHASIL MERAPIKAN ${updatedCount} DATA.`, "success"); } else { showNotification("DATA SUDAH SINKRON.", "success"); }
      } catch (e: any) { showNotification("GAGAL: " + e.message, "error"); } finally { setIsLoading(false); }
  };

  const handleCleanupDuplicates = async () => { if (!isManager) return; setIsLoading(true); try { const seen = new Set<string>(); const toDelete: string[] = []; for (const s of services) { const key = `${s.serviceName.trim().toLowerCase()}_${s.workType}`; if (seen.has(key)) toDelete.push(s.id); else seen.add(key); } if (toDelete.length === 0) { showNotification("TIDAK ADA DUPLIKAT.", "success"); return; } if (window.confirm(`HAPUS ${toDelete.length} DUPLIKAT?`)) { for (const id of toDelete) await deleteDoc(doc(db, SERVICES_MASTER_COLLECTION, id)); showNotification("PEMBERSIHAN SELESAI.", "success"); } } catch (e: any) { showNotification("GAGAL: " + e.message, "error"); } finally { setIsLoading(false); } };
  const handleSaveService = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (!isManager) return; 
    
    const newCode = serviceForm.serviceCode?.toUpperCase().trim() || '';
    
    // DUPLICATE CHECK: serviceCode must be unique (exclude current item if editing)
    if (newCode) {
      const isDuplicate = services.some(s => 
        s.serviceCode?.toUpperCase().trim() === newCode && 
        s.id !== serviceForm.id // allow same code for the item being edited
      );
      if (isDuplicate) {
        showNotification(`GAGAL: KODE PANEL "${newCode}" SUDAH DIGUNAKAN OLEH ITEM LAIN. GUNAKAN KODE YANG BERBEDA.`, 'error');
        return;
      }
    }
    
    setIsLoading(true); 
    try { 
      const payload = { ...serviceForm, serviceCode: newCode }; 
      if (serviceForm.id) await updateDoc(doc(db, SERVICES_MASTER_COLLECTION, serviceForm.id), payload); 
      else await addDoc(collection(db, SERVICES_MASTER_COLLECTION), { ...payload, createdAt: serverTimestamp() }); 
      showNotification('DATA DIPERBARUI', 'success'); 
      setServiceForm({ serviceCode: '', workType: 'KC', panelValue: 1.0 }); 
      setIsEditingService(false); 
    } catch (e: any) { showNotification('GAGAL: ' + e.message, 'error'); } finally { setIsLoading(false); } 
  };
  const handleDeleteService = async (id: string) => { if (!isManager || !window.confirm('HAPUS?')) return; try { await deleteDoc(doc(db, SERVICES_MASTER_COLLECTION, id)); showNotification('TERHAPUS', 'success'); } catch(e) { showNotification('GAGAL', 'error'); } };
  
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
              if (!wsname) throw new Error("FILE EXCEL TIDAK VALID ATAU KOSONG.");
              
              const ws = wb.Sheets[wsname];
              const data = XLSX.utils.sheet_to_json(ws);
              
              if (!data || data.length === 0) throw new Error("TIDAK ADA DATA DITEMUKAN DALAM SHEET.");

              let successCount = 0;
              const batch = writeBatch(db);
              
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
              showNotification(`IMPORT SELESAI. ${successCount} DATA DITAMBAHKAN.`, "success");
          } catch (err: any) { 
              console.error(err);
              showNotification("ERROR: " + err.message, "error"); 
          } finally { 
              setIsLoading(false); 
              e.target.value = ''; 
          }
      };
      reader.readAsBinaryString(file);
  };

  const RestrictedOverlay = () => (!isManager ? (<div className="absolute inset-0 bg-canvas/80 flex items-center justify-center z-10"><div className="bg-canvas border border-ink p-6 text-center"><p className="font-display text-[24px] text-ink uppercase mb-2">AKSES TERBATAS</p><p className="text-[10px] text-mute font-medium uppercase tracking-widest">HANYA MANAGER YANG DAPAT MENGUBAH PENGATURAN INI.</p></div></div>) : null);
  const restrictedClass = !isManager ? "pointer-events-none opacity-80 relative" : "relative";

  return (
    <div className="animate-fade-in pb-[48px]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-[48px] border-b border-hairline pb-[24px]">
          <div>
              <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">PENGATURAN</h1>
              <p className="text-[16px] text-mute font-normal mt-[18px] uppercase tracking-widest">KONFIGURASI SISTEM BENGKEL.</p>
          </div>
          <div className="flex gap-4">
              {isManager && (<button onClick={handleSyncSystemData} disabled={isLoading} className="border border-hairline hover:border-ink px-6 py-4 text-[12px] font-medium uppercase tracking-widest text-ink transition-colors disabled:opacity-50">SYNC DATA</button>)}
              <button onClick={saveSettings} disabled={isLoading || !isManager} className="bg-ink text-canvas px-6 py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors disabled:opacity-50">{isLoading ? 'PROCESSING...' : 'SIMPAN PERUBAHAN'}</button>
          </div>
      </div>

      <div className="flex flex-wrap border-b border-hairline mb-[48px]">
          {[
            { id: 'general', label: 'BENGKEL & TARGET' },
            { id: 'database', label: 'DATA MASTER' },
            { id: 'unit_catalog', label: 'KATALOG UNIT' },
            { id: 'insurance', label: 'DATABASE ASURANSI' },
            { id: 'whatsapp', label: 'WHATSAPP & PESAN' },
            { id: 'services', label: 'MASTER JASA & PANEL' },
            { id: 'menu_access', label: 'HAK AKSES MENU' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-6 py-4 text-[12px] font-medium uppercase tracking-widest transition-colors flex-shrink-0 ${activeTab === tab.id ? 'bg-ink text-canvas border-t border-l border-r border-ink' : 'text-mute hover:text-ink border-transparent'}`}>
              {tab.label}
            </button>
          ))}
      </div>

      <div className="relative min-h-[500px]">
          {activeTab === 'general' && (
              <div className={`space-y-[48px] ${restrictedClass}`}>
                  <RestrictedOverlay/>
                  <section className="bg-canvas border border-hairline p-6">
                    <h3 className="text-[14px] font-medium text-ink uppercase tracking-widest mb-6">BAHASA TAMPILAN</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex gap-4">
                            <button onClick={() => handleChange('language', 'id')} className={`flex-1 py-6 px-4 border transition-colors ${localSettings.language === 'id' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-ink border-hairline hover:bg-soft-cloud'}`}>
                                <span className="font-medium text-[12px] uppercase tracking-widest">BAHASA INDONESIA</span>
                            </button>
                            <button onClick={() => handleChange('language', 'en')} className={`flex-1 py-6 px-4 border transition-colors ${localSettings.language === 'en' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-ink border-hairline hover:bg-soft-cloud'}`}>
                                <span className="font-medium text-[12px] uppercase tracking-widest">ENGLISH (US)</span>
                            </button>
                        </div>
                    </div>
                  </section>
                  <section className="bg-canvas border border-hairline p-6">
                    <h3 className="text-[14px] font-medium text-ink uppercase tracking-widest mb-6">INFORMASI BENGKEL</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-[24px]">
                        <div><label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">NAMA BENGKEL</label><input type="text" className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase" value={localSettings.workshopName} onChange={e => handleChange('workshopName', e.target.value)} /></div>
                        <div><label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">EMAIL</label><input type="email" className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase" value={localSettings.workshopEmail} onChange={e => handleChange('workshopEmail', e.target.value)} /></div>
                        <div><label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">NOMOR TELEPON</label><input type="text" className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase" value={localSettings.workshopPhone} onChange={e => handleChange('workshopPhone', e.target.value)} /></div>
                        <div><label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">ALAMAT LENGKAP</label><textarea className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase" rows={2} value={localSettings.workshopAddress} onChange={e => handleChange('workshopAddress', e.target.value)} /></div>
                    </div>
                  </section>
                  <section className="bg-canvas border border-hairline p-6"><h3 className="text-[14px] font-medium text-ink uppercase tracking-widest mb-6">TARGET & PAJAK</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-[24px]"><div><label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">PPN (%)</label><div className="relative"><input type="number" className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase pl-12" value={localSettings.ppnPercentage} onChange={e => handleChange('ppnPercentage', Number(e.target.value))} /><span className="absolute left-4 top-[1.15rem] text-[14px] font-medium text-mute">%</span></div></div><div><label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">TARGET BULANAN (RP)</label><input type="number" className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase" value={localSettings.monthlyTarget} onChange={e => handleChange('monthlyTarget', Number(e.target.value))} /></div><div><label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">TARGET MINGGUAN (RP)</label><input type="number" className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase" value={localSettings.weeklyTarget} onChange={e => handleChange('weeklyTarget', Number(e.target.value))} /></div></div></section>
                  
                  <section className="bg-canvas border border-hairline p-6">
                      <h3 className="text-[14px] font-medium text-ink uppercase tracking-widest mb-6">KALENDER HARI KERJA & LIBUR</h3>
                      <div className="space-y-[24px]">
                          <div>
                              <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-4">HARI KERJA OPERASIONAL RUTIN</label>
                              <div className="flex flex-wrap gap-4">
                                  {[{ id: 1, label: 'SENIN' }, { id: 2, label: 'SELASA' }, { id: 3, label: 'RABU' }, { id: 4, label: 'KAMIS' }, { id: 5, label: 'JUMAT' }, { id: 6, label: 'SABTU' }, { id: 0, label: 'MINGGU' }].map(day => {
                                      const isWorkingDay = (localSettings.workingDaysOfWeek || [1,2,3,4,5,6]).includes(day.id);
                                      return (
                                          <button 
                                              key={day.id}
                                              type="button"
                                              onClick={() => {
                                                  const current = localSettings.workingDaysOfWeek || [1,2,3,4,5,6];
                                                  const newDays = isWorkingDay 
                                                      ? current.filter(d => d !== day.id) 
                                                      : [...current, day.id];
                                                  handleChange('workingDaysOfWeek', newDays);
                                              }}
                                              className={`px-6 py-3 border transition-colors text-[10px] font-medium uppercase tracking-widest ${
                                                  isWorkingDay
                                                      ? 'bg-ink text-canvas border-ink'
                                                      : 'bg-canvas text-ink border-hairline hover:bg-soft-cloud'
                                              }`}
                                          >
                                              {day.label}
                                          </button>
                                      );
                                  })}
                              </div>
                              <p className="text-[10px] text-mute uppercase tracking-widest mt-4">PENGATURAN INI AKAN DIGUNAKAN UNTUK MENGHITUNG TARGET JUMLAH HARI KERJA AKTUAL SETIAP BULANNYA DI DASHBOARD.</p>
                          </div>
                          <div className="pt-[24px] border-t border-hairline">
                              <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-4">HARI LIBUR KHUSUS / NASIONAL</label>
                              <div className="flex gap-4 mb-6">
                                  <input 
                                      type="date" 
                                      id="newHolidayInput"
                                      className="px-4 py-3 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase"
                                  />
                                  <button 
                                      type="button"
                                      onClick={() => {
                                          const val = (document.getElementById('newHolidayInput') as HTMLInputElement).value;
                                          if (!val) return;
                                          const currentHolidays = localSettings.internalHolidays || [];
                                          if (!currentHolidays.includes(val)) {
                                              handleChange('internalHolidays', [...currentHolidays, val].sort());
                                              (document.getElementById('newHolidayInput') as HTMLInputElement).value = '';
                                          }
                                      }}
                                      className="bg-canvas border border-hairline hover:border-ink text-ink px-6 py-3 text-[10px] font-medium uppercase tracking-widest transition-colors"
                                  >
                                      TAMBAH LIBUR
                                  </button>
                              </div>
                              <div className="flex flex-wrap gap-4">
                                  {(localSettings.internalHolidays || []).length === 0 && <span className="text-[10px] text-mute uppercase tracking-widest">BELUM ADA HARI LIBUR KHUSUS YANG DITAMBAHKAN.</span>}
                                  {(localSettings.internalHolidays || []).map((h, i) => (
                                      <span key={i} className="bg-canvas border border-hairline text-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest flex items-center gap-4">
                                          {new Date(h).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                                          <button onClick={() => {
                                              const currentHolidays = [...(localSettings.internalHolidays || [])];
                                              currentHolidays.splice(i, 1);
                                              handleChange('internalHolidays', currentHolidays);
                                          }} className="text-mute hover:text-ink">HAPUS</button>
                                      </span>
                                  ))}
                              </div>
                          </div>
                      </div>
                  </section>
              </div>
          )}

          {activeTab === 'whatsapp' && (
              <div className={`space-y-[48px] animate-fade-in ${restrictedClass}`}>
                  <RestrictedOverlay />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-[48px]">
                      <section className="bg-canvas border border-hairline p-6">
                          <h3 className="text-[14px] font-medium text-ink uppercase tracking-widest mb-6">KONFIGURASI PENGIRIMAN</h3>
                          <div className="space-y-[24px]">
                              <div>
                                  <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-4">PILIH MODE WHATSAPP</label>
                                  <div className="flex gap-4">
                                      <button 
                                          onClick={() => handleNestedChange('whatsappConfig', 'mode', 'MANUAL')}
                                          className={`flex-1 p-6 border transition-colors ${localSettings.whatsappConfig?.mode === 'MANUAL' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-ink border-hairline hover:bg-soft-cloud'}`}
                                      >
                                          <div className="text-left"><p className="font-medium text-[12px] uppercase tracking-widest mb-2">MANUAL (PERSONAL)</p><p className="text-[10px] uppercase tracking-widest opacity-70">MEMBUKA APLIKASI WA DESKTOP/WEB</p></div>
                                      </button>
                                      <button 
                                          onClick={() => handleNestedChange('whatsappConfig', 'mode', 'API')}
                                          className={`flex-1 p-6 border transition-colors ${localSettings.whatsappConfig?.mode === 'API' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-ink border-hairline hover:bg-soft-cloud'}`}
                                      >
                                          <div className="text-left"><p className="font-medium text-[12px] uppercase tracking-widest mb-2">GATEWAY API (BOT)</p><p className="text-[10px] uppercase tracking-widest opacity-70">PENGIRIMAN OTOMATIS TANPA KLIK (CLOUD)</p></div>
                                      </button>
                                  </div>
                              </div>
                              
                              {localSettings.whatsappConfig?.mode === 'API' && (
                                  <div className="space-y-[16px] p-6 bg-soft-cloud border border-hairline animate-fade-in">
                                      <div className="font-medium text-ink uppercase tracking-widest text-[12px] mb-4">
                                          API CREDENTIALS (CLIENT OWNED)
                                      </div>
                                      <div>
                                          <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">PILIH PROVIDER GATEWAY</label>
                                          <select 
                                              value={localSettings.whatsappConfig?.waProvider || 'Whacenter'} 
                                              onChange={e => handleNestedChange('whatsappConfig', 'waProvider', e.target.value)}
                                              className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase"
                                          >
                                              <option value="Whacenter">WHACENTER</option>
                                              <option value="Fonnte">FONNTE</option>
                                              <option value="Lainnya">LAINNYA (CUSTOM)</option>
                                          </select>
                                      </div>
                                      <div>
                                          <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">WA API KEY / TOKEN</label>
                                          <input 
                                              type="password" 
                                              value={localSettings.whatsappConfig?.waApiKey || ''}
                                              onChange={e => handleNestedChange('whatsappConfig', 'waApiKey', e.target.value)}
                                              placeholder="MASUKKAN TOKEN DARI PROVIDER..."
                                              className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase"
                                          />
                                          <p className="text-[10px] text-mute mt-2 uppercase tracking-widest">TOKEN INI DIGUNAKAN UNTUK PENGIRIMAN OTOMATIS. CLIENT DISARANKAN MEMBELI KUOTA SENDIRI KE PROVIDER.</p>
                                      </div>
                                  </div>
                              )}

                              <div className="bg-soft-cloud p-6 border border-hairline">
                                  <div className="text-[12px] text-ink leading-relaxed font-medium uppercase tracking-widest">
                                      VARIABEL TEMPLATE:<br/><br/>
                                      GUNAKAN PLACEHOLDER BERIKUT DALAM PESAN AGAR TERISI OTOMATIS:<br/><br/>
                                      <span className="border border-ink px-2 py-1">{"{nama}"}</span> : NAMA PELANGGAN<br/><br/>
                                      <span className="border border-ink px-2 py-1">{"{mobil}"}</span> : MODEL KENDARAAN<br/><br/>
                                      <span className="border border-ink px-2 py-1">{"{nopol}"}</span> : NO. POLISI<br/><br/>
                                      <span className="border border-ink px-2 py-1">{"{tgl_booking}"}</span> : TANGGAL JANJI
                                  </div>
                              </div>
                          </div>
                      </section>
                      
                      <section className="bg-canvas p-6 border border-hairline">
                          <h3 className="text-[14px] font-medium text-ink uppercase tracking-widest mb-6">INTEGRASI AI GOOGLE GEMINI</h3>
                          <div className="space-y-[16px]">
                              <div>
                                  <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">GEMINI API KEY</label>
                                  <input 
                                      type="password" 
                                      value={localSettings.geminiApiKey || ''}
                                      onChange={e => setLocalSettings({...localSettings, geminiApiKey: e.target.value})}
                                      placeholder="MASUKKAN API KEY GOOGLE GEMINI..."
                                      className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase"
                                  />
                                  <p className="text-[10px] text-mute mt-2 uppercase tracking-widest">KEY INI DIPERLUKAN UNTUK FITUR AI STRATEGIC INSIGHT. SIMPAN DENGAN AMAN.</p>
                              </div>
                          </div>
                      </section>

                      <div className="space-y-[24px]">
                          <div className="grid grid-cols-1 gap-[24px]">
                              <div>
                                  <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">TEMPLATE PENGINGAT BOOKING</label>
                                  <textarea 
                                      className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase min-h-[150px]" 
                                      value={localSettings.whatsappTemplates.bookingReminder}
                                      onChange={e => handleNestedChange('whatsappTemplates', 'bookingReminder', e.target.value)}
                                  />
                              </div>
                              <div>
                                  <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">TEMPLATE UNIT SIAP AMBIL</label>
                                  <textarea 
                                      className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase min-h-[150px]" 
                                      value={localSettings.whatsappTemplates.readyForPickup}
                                      onChange={e => handleNestedChange('whatsappTemplates', 'readyForPickup', e.target.value)}
                                  />
                              </div>
                              <div>
                                  <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">TEMPLATE AFTER SERVICE (CSI)</label>
                                  <textarea 
                                      className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase min-h-[150px]" 
                                      value={localSettings.whatsappTemplates.afterService}
                                      onChange={e => handleNestedChange('whatsappTemplates', 'afterService', e.target.value)}
                                  />
                              </div>
                          </div>
                      </div>
                  </div>

                  <section className="bg-canvas border border-hairline p-6 mt-[48px]">
                      <h3 className="text-[14px] font-medium text-ink uppercase tracking-widest mb-6">
                          TEMPLATE PENILAIAN PELANGGAN (CSI SURVEY)
                      </h3>
                      <div className="flex flex-col md:flex-row gap-[24px]">
                          <div className="flex-1 space-y-[16px]">
                              <p className="text-[10px] text-mute uppercase tracking-widest leading-relaxed">
                                  TAMBAHKAN KRITERIA PENILAIAN YANG AKAN MUNCUL SAAT TIM CRC MELAKUKAN INPUT SURVEY KEPUASAN PELANGGAN. 
                                  CONTOH: "KUALITAS PERBAIKAN", "KECEPATAN", "KERAMAHAN STAFF".
                              </p>
                              <div className="flex gap-4">
                                  <input 
                                      type="text" 
                                      className="flex-grow p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase"
                                      placeholder="KETIK KRITERIA BARU..."
                                      value={newCsiInput}
                                      onChange={(e) => setNewCsiInput(e.target.value)}
                                      onKeyDown={(e) => e.key === 'Enter' && handleAddCsiItem()}
                                  />
                                  <button 
                                      onClick={handleAddCsiItem}
                                      className="bg-ink text-canvas px-6 py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors"
                                  >
                                      TAMBAH
                                  </button>
                              </div>
                          </div>
                          <div className="flex-1 bg-soft-cloud p-6 border border-hairline max-h-60 overflow-y-auto">
                              <div className="flex flex-wrap gap-4">
                                  {(localSettings.csiIndicators || []).map((item, idx) => (
                                      <div key={idx} className="bg-canvas text-ink px-4 py-2 border border-hairline text-[10px] font-medium uppercase tracking-widest flex items-center gap-4 group hover:border-ink transition-colors">
                                          {item}
                                          <button 
                                              onClick={() => removeItem('csiIndicators', idx)}
                                              className="text-mute hover:text-ink"
                                          >
                                              HAPUS
                                          </button>
                                      </div>
                                  ))}
                                  {(localSettings.csiIndicators || []).length === 0 && (
                                      <span className="text-mute text-[10px] uppercase tracking-widest">BELUM ADA KRITERIA PENILAIAN.</span>
                                  )}
                              </div>
                          </div>
                      </div>
                  </section>
              </div>
          )}

          {activeTab === 'unit_catalog' && (
              <div className={`space-y-[48px] animate-fade-in ${restrictedClass}`}>
                  <RestrictedOverlay />
                  <section className="bg-canvas p-6 border border-hairline">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="font-medium text-ink uppercase tracking-widest text-[14px]">MASTER MERK KENDARAAN</h4>
                      <button onClick={() => addItem('carBrands', '')} className="text-[10px] border border-hairline hover:border-ink text-ink px-4 py-2 font-medium uppercase tracking-widest transition-colors">
                        TAMBAH MERK
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {(localSettings.carBrands || []).map((brand, idx) => (
                        <div key={idx} className="flex gap-2 group">
                          <input type="text" className="w-full p-3 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[12px] font-medium text-ink uppercase" value={brand} onChange={e => handleArrayChange('carBrands', idx, e.target.value)} />
                          <button onClick={() => removeItem('carBrands', idx)} className="text-mute hover:text-ink px-3 border border-transparent group-hover:border-hairline transition-all">
                            HAPUS
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="bg-canvas p-6 border border-hairline">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="font-medium text-ink uppercase tracking-widest text-[14px]">KATALOG MODEL / TIPE</h4>
                      <button onClick={() => addItem('carModels', '')} className="text-[10px] border border-hairline hover:border-ink text-ink px-4 py-2 font-medium uppercase tracking-widest transition-colors">
                        TAMBAH TIPE
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {(localSettings.carModels || []).map((model, idx) => (
                        <div key={idx} className="flex gap-2 group">
                          <input type="text" className="w-full p-3 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[12px] font-medium text-ink uppercase" value={model} onChange={e => handleArrayChange('carModels', idx, e.target.value)} />
                          <button onClick={() => removeItem('carModels', idx)} className="text-mute hover:text-ink px-3 border border-transparent group-hover:border-hairline transition-all">
                            HAPUS
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="bg-canvas p-6 border border-hairline">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="font-medium text-ink uppercase tracking-widest text-[14px]">KATALOG WARNA KENDARAAN</h4>
                      <button onClick={() => addItem('carColors', '')} className="text-[10px] border border-hairline hover:border-ink text-ink px-4 py-2 font-medium uppercase tracking-widest transition-colors">
                        TAMBAH WARNA
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {(localSettings.carColors || []).map((color, idx) => (
                        <div key={idx} className="flex gap-2 group">
                          <input type="text" className="w-full p-3 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[12px] font-medium text-ink uppercase" value={color} onChange={e => handleArrayChange('carColors', idx, e.target.value)} />
                          <button onClick={() => removeItem('carColors', idx)} className="text-mute hover:text-ink px-3 border border-transparent group-hover:border-hairline transition-all">
                            HAPUS
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
              </div>
          )}

          {activeTab === 'services' && (
              <div className={`space-y-[48px] animate-fade-in ${restrictedClass}`}>
                  <RestrictedOverlay />
                  
                  <div className="bg-canvas p-6 border border-ink flex items-center justify-between">
                      <div>
                          <h4 className="font-medium text-ink uppercase tracking-widest text-[14px]">STANDAR GAJI MEKANIK (PER PANEL)</h4>
                          <p className="text-[10px] text-mute mt-2 uppercase tracking-widest">NILAI INI DIGUNAKAN UNTUK MENGHITUNG ESTIMASI GAJI TEKNISI DI LAPORAN PRODUKSI.</p>
                      </div>
                      <div className="relative">
                          <span className="absolute left-4 top-[1.15rem] font-medium text-ink text-[14px]">RP</span>
                          <input 
                              type="number" 
                              className="w-48 pl-12 p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-display text-[16px] text-ink uppercase"
                              value={localSettings.mechanicPanelRate || 0}
                              onChange={e => handleChange('mechanicPanelRate', Number(e.target.value))}
                          />
                      </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-[48px]">
                    <div className="lg:col-span-2 bg-canvas p-6 border border-hairline flex flex-col">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-[24px]">
                        <h3 className="text-[14px] font-medium text-ink uppercase tracking-widest">DAFTAR MASTER JASA (STANDAR PANEL)</h3>
                        <div className="flex flex-wrap gap-4">
                          <button onClick={handleCleanupDuplicates} className="border border-hairline hover:border-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-ink transition-colors">CLEANUP</button>
                          <button onClick={handleDownloadServiceTemplate} className="border border-hairline hover:border-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-ink transition-colors">TEMPLATE/EXPORT</button>
                          <label className="bg-ink text-canvas px-4 py-2 text-[10px] font-medium uppercase tracking-widest hover:bg-mute transition-colors cursor-pointer">IMPORT & UPDATE<input disabled={!isManager} type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleImportServices} /></label>
                        </div>
                      </div>
                      <div className="mb-[24px]">
                        <input type="text" placeholder="CARI..." value={serviceSearchQuery} onChange={e => setServiceSearchQuery(e.target.value)} className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium uppercase text-ink transition-all"/>
                      </div>
                      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                        <table className="w-full text-left">
                          <thead className="bg-canvas border-b border-hairline text-mute uppercase font-medium text-[10px] tracking-widest sticky top-0">
                            <tr>
                              <th className="px-6 py-4 font-normal">KODE</th>
                              <th className="px-6 py-4 font-normal">NAMA PEKERJAAN</th>
                              <th className="px-6 py-4 font-normal">JENIS</th>
                              <th className="px-6 py-4 text-center font-normal">PANEL</th>
                              <th className="px-6 py-4 text-right font-normal">HARGA</th>
                              <th className="px-6 py-4 text-right font-normal">AKSI</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-hairline">
                            {filteredServices.map(s => (
                              <tr key={s.id} className="hover:bg-soft-cloud transition-colors group">
                                <td className="px-6 py-4 font-medium text-[14px] text-mute uppercase">{s.serviceCode || '-'}</td>
                                <td className="px-6 py-4 font-medium text-[14px] text-ink uppercase">{s.serviceName}</td>
                                <td className="px-6 py-4"><span className="px-2 py-1 border border-ink text-[10px] font-medium tracking-widest uppercase">{s.workType}</span></td>
                                <td className="px-6 py-4 text-center font-medium text-[14px] text-ink">{s.panelValue}</td>
                                <td className="px-6 py-4 text-right font-medium text-[14px] text-ink">{formatCurrency(s.basePrice)}</td>
                                <td className="px-6 py-4 text-right flex justify-end gap-4 opacity-0 group-hover:opacity-100">
                                  <button onClick={() => { setServiceForm(s); setIsEditingService(true); }} className="text-[10px] font-medium uppercase tracking-widest text-ink hover:underline">EDIT</button>
                                  <button onClick={() => handleDeleteService(s.id)} className="text-[10px] font-medium uppercase tracking-widest text-ink hover:underline">HAPUS</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="bg-canvas p-6 border border-hairline h-fit flex flex-col sticky top-4">
                      <h3 className="text-[14px] font-medium text-ink uppercase tracking-widest mb-2">{isEditingService ? 'EDIT JASA' : 'INPUT JASA BARU'}</h3>
                      
                      {/* KODE PANEL TERAKHIR DIGUNAKAN */}
                      {(() => {
                        const sorted = [...services]
                          .filter(s => s.serviceCode)
                          .sort((a, b) => {
                            const tA = a.createdAt?.seconds || 0;
                            const tB = b.createdAt?.seconds || 0;
                            return tB - tA;
                          });
                        const lastUsed = sorted[0];
                        return lastUsed ? (
                          <div className="mb-4 p-3 bg-soft-cloud border border-hairline">
                            <div className="text-[9px] font-medium text-mute uppercase tracking-widest mb-1">KODE PANEL TERAKHIR DIGUNAKAN</div>
                            <div className="flex items-center gap-3">
                              <span className="font-display text-[20px] text-ink">{lastUsed.serviceCode}</span>
                              <span className="text-[10px] text-mute uppercase tracking-widest flex-1 truncate">{lastUsed.serviceName}</span>
                            </div>
                          </div>
                        ) : null;
                      })()}

                      <form onSubmit={handleSaveService} className="space-y-[16px]">
                        <div>
                          <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">NAMA PEKERJAAN *</label>
                          <input disabled={!isManager} required type="text" value={serviceForm.serviceName || ''} onChange={e => setServiceForm({...serviceForm, serviceName: e.target.value})} className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase" placeholder="CONTOH: CAT FULL PANEL PINTU" />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">KODE PANEL</label>
                            {(() => {
                              const currentCode = serviceForm.serviceCode?.toUpperCase().trim() || '';
                              const isDup = currentCode ? services.some(s => s.serviceCode?.toUpperCase().trim() === currentCode && s.id !== serviceForm.id) : false;
                              return (
                                <>
                                  <input 
                                    disabled={!isManager} 
                                    type="text" 
                                    value={serviceForm.serviceCode || ''} 
                                    onChange={e => setServiceForm({...serviceForm, serviceCode: e.target.value.toUpperCase()})} 
                                    className={`w-full p-4 border bg-canvas focus:outline-none font-medium text-[12px] text-ink uppercase ${isDup ? 'border-red-400 focus:border-red-500' : 'border-hairline focus:border-ink'}`} 
                                    placeholder="BP001" 
                                  />
                                  {isDup && <p className="text-[9px] text-red-600 uppercase tracking-widest mt-1">KODE SUDAH TERPAKAI</p>}
                                </>
                              );
                            })()}
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">JENIS PEKERJAAN</label>
                            <select 
                              disabled={!isManager} 
                              value={serviceForm.workType || 'KC'} 
                              onChange={e => setServiceForm({...serviceForm, workType: e.target.value as any})} 
                              className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase"
                            >
                              <option value="KC">KC</option>
                              <option value="GTC">GTC</option>
                              <option value="BP">BP</option>
                              <option value="Lainnya">LAINNYA</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">NILAI PANEL</label><input disabled={!isManager} type="number" step="0.1" value={serviceForm.panelValue || 0} onChange={e => setServiceForm({...serviceForm, panelValue: Number(e.target.value)})} className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase"/></div>
                          <div><label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">HARGA DASAR</label><input disabled={!isManager} type="number" value={serviceForm.basePrice || 0} onChange={e => setServiceForm({...serviceForm, basePrice: Number(e.target.value)})} className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase"/></div>
                        </div>

                        <div className="flex gap-3 pt-2">
                          {isEditingService && (
                            <button type="button" onClick={() => { setServiceForm({ serviceCode: '', workType: 'KC', panelValue: 1.0 }); setIsEditingService(false); }} className="flex-1 border border-hairline hover:border-ink text-ink py-4 text-[12px] font-medium uppercase tracking-widest transition-colors">BATAL EDIT</button>
                          )}
                          <button disabled={isLoading || !isManager} type="submit" className="flex-1 bg-ink text-canvas py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors">{isLoading ? 'PROSES...' : (isEditingService ? 'UPDATE DATA' : 'SIMPAN DATA')}</button>
                        </div>
                      </form>

                      <div className="mt-[48px] pt-[24px] border-t border-hairline">
                          <div className="flex justify-between items-center mb-6">
                              <h4 className="font-medium text-ink uppercase tracking-widest text-[12px]">
                                  HARGA WARNA SPESIAL
                              </h4>
                              <button 
                                  onClick={() => {
                                      const current = localSettings.specialColorRates || [];
                                      handleChange('specialColorRates', [...current, { colorName: '', surchargePerPanel: 0 }]);
                                  }}
                                  className="text-[10px] border border-hairline hover:border-ink text-ink px-3 py-2 font-medium uppercase tracking-widest transition-colors"
                              >
                                  TAMBAH
                              </button>
                          </div>
                          <div className="space-y-4">
                              {(localSettings.specialColorRates || []).map((rate, idx) => (
                                  <div key={idx} className="bg-soft-cloud p-4 border border-hairline flex items-center gap-4 group animate-fade-in">
                                      <div className="flex-grow space-y-2">
                                          <input 
                                              type="text" 
                                              placeholder="NAMA WARNA..." 
                                              className="w-full bg-canvas border border-hairline p-2 text-[10px] font-medium text-ink uppercase focus:outline-none focus:border-ink"
                                              value={rate.colorName}
                                              onChange={e => {
                                                  const newRates = [...localSettings.specialColorRates];
                                                  newRates[idx].colorName = e.target.value.toUpperCase();
                                                  handleChange('specialColorRates', newRates);
                                              }}
                                          />
                                          <div className="flex items-center gap-2">
                                              <span className="text-[10px] font-medium text-mute">RP</span>
                                              <input 
                                                  type="number" 
                                                  className="w-full bg-canvas border border-hairline p-2 text-[12px] font-medium text-ink focus:outline-none focus:border-ink"
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
                                          className="text-mute hover:text-ink px-2 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest text-[10px] font-medium"
                                      >
                                          HAPUS
                                      </button>
                                  </div>
                              ))}
                              {(!localSettings.specialColorRates || localSettings.specialColorRates.length === 0) && (
                                  <div className="text-center py-4 text-[10px] text-mute uppercase tracking-widest">BELUM ADA WARNA SPESIAL.</div>
                              )}
                          </div>
                          <div className="mt-6 p-4 bg-soft-cloud border border-hairline">
                              <p className="text-[10px] text-ink leading-relaxed uppercase tracking-widest font-medium">BIAYA WARNA SPESIAL DIHITUNG PER PANEL DIKALI NILAI SURCHARGE DI ATAS.</p>
                          </div>
                      </div>
                    </div>
                  </div>
              </div>
          )}

          {activeTab === 'database' && (
              <div className="space-y-[48px] animate-fade-in">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-[48px]">
                      <div className={`bg-canvas p-6 border border-hairline flex flex-col h-fit ${!isManager ? 'opacity-80 pointer-events-none' : ''}`}>
                          <div className="flex justify-between items-center mb-[24px]">
                              <h4 className="font-medium text-ink uppercase tracking-widest text-[14px]">
                                  MANAJEMEN USER & AKSES
                              </h4>
                              <button onClick={() => setIsUserModalOpen(true)} className="bg-ink text-canvas px-4 py-2 text-[10px] font-medium uppercase tracking-widest hover:bg-mute transition-colors">
                                  TAMBAH USER
                              </button>
                          </div>
                          
                          <div className="space-y-4 max-h-[400px] overflow-y-auto">
                              {systemUsers.map(user => (
                                  <div key={user.uid} className="bg-canvas p-4 border border-hairline flex justify-between items-center group hover:border-ink transition-colors">
                                      <div className="flex items-center gap-4">
                                          <div className="w-12 h-12 border border-ink flex items-center justify-center text-ink font-display text-[24px]">
                                              {(user.displayName || 'U')[0].toUpperCase()}
                                          </div>
                                          <div>
                                              <p className="text-[14px] font-medium text-ink uppercase">{user.displayName || 'USER'}</p>
                                              <p className="text-[10px] text-mute font-medium mt-1 uppercase tracking-widest">{user.role || 'STAFF'}</p>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button onClick={() => handleResetPassword(user.email!)} className="text-[10px] font-medium uppercase tracking-widest text-ink hover:underline">
                                              RESET PW
                                          </button>
                                          <button onClick={() => handleDeleteUser(user.uid)} className="text-[10px] font-medium uppercase tracking-widest text-ink hover:underline">
                                              HAPUS
                                          </button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                          {!isManager && <div className="mt-[24px] p-4 bg-soft-cloud border border-ink text-ink text-[10px] font-medium uppercase tracking-widest">HANYA MANAGER YANG DAPAT MENDAFTARKAN/MENGHAPUS USER.</div>}
                      </div>

                      <div className="bg-canvas p-6 border border-hairline h-fit">
                          <h4 className="font-medium text-ink uppercase tracking-widest text-[14px] mb-[24px]">
                              KEAMANAN AKUN ANDA
                          </h4>
                          <form onSubmit={handleChangePassword} className="space-y-[16px]">
                              <div className="p-4 bg-soft-cloud border border-hairline mb-4">
                                  <p className="text-[10px] font-medium text-mute uppercase tracking-widest">AKUN TERDAFTAR</p>
                                  <p className="text-[14px] font-medium text-ink mt-2 uppercase">{auth.currentUser?.email}</p>
                              </div>
                              <div>
                                  <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">PASSWORD BARU</label>
                                  <input 
                                      type="password" required 
                                      value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                      className="w-full p-4 bg-canvas border border-hairline rounded-none focus:outline-none focus:border-ink font-medium text-ink"
                                      placeholder="••••••••"
                                  />
                              </div>
                              <div>
                                  <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">KONFIRMASI PASSWORD BARU</label>
                                  <input 
                                      type="password" required 
                                      value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                                      className="w-full p-4 bg-canvas border border-hairline rounded-none focus:outline-none focus:border-ink font-medium text-ink"
                                      placeholder="••••••••"
                                  />
                              </div>
                              <button type="submit" disabled={isLoading} className="w-full bg-ink text-canvas py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors mt-4">
                                  {isLoading ? 'PROCESSING...' : 'GANTI PASSWORD'}
                              </button>
                          </form>
                      </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-[48px]">
                    <div className={`bg-canvas p-6 border border-hairline ${restrictedClass}`}>
                        <RestrictedOverlay/>
                        <div className="flex justify-between items-center mb-[24px]">
                            <h4 className="font-medium text-ink uppercase tracking-widest text-[14px]">
                                DAFTAR MEKANIK PRODUKSI
                            </h4>
                            <button onClick={() => addItem('mechanicNames', '')} className="border border-hairline hover:border-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-ink transition-colors">
                                TAMBAH MEKANIK
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto">
                            {(localSettings.mechanicNames || []).map((mech, idx) => (
                                <div key={idx} className="flex items-center gap-2 group animate-fade-in bg-canvas p-2 border border-hairline focus-within:border-ink transition-colors">
                                    <input type="text" className="flex-1 w-full min-w-0 p-2 bg-transparent outline-none text-[12px] font-medium text-ink uppercase" value={mech} onChange={e => handleArrayChange('mechanicNames', idx, e.target.value)} />
                                    <button onClick={() => removeItem('mechanicNames', idx)} className="shrink-0 text-mute hover:text-ink px-3 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-medium uppercase tracking-widest">
                                        HAPUS
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={`bg-canvas p-6 border border-hairline ${restrictedClass}`}>
                        <RestrictedOverlay/>
                        <div className="flex justify-between items-center mb-[24px]">
                            <h4 className="font-medium text-ink uppercase tracking-widest text-[14px]">
                                DAFTAR ROLE / HAK AKSES
                            </h4>
                            <button onClick={() => addItem('roleOptions', '')} className="border border-hairline hover:border-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-ink transition-colors">
                                TAMBAH ROLE
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto">
                            {(localSettings.roleOptions || []).map((role, idx) => (
                                <div key={idx} className="flex items-center gap-2 group animate-fade-in bg-canvas p-2 border border-hairline focus-within:border-ink transition-colors">
                                    <input type="text" className="flex-1 w-full min-w-0 p-2 bg-transparent outline-none text-[12px] font-medium text-ink uppercase" value={role} onChange={e => handleArrayChange('roleOptions', idx, e.target.value)} />
                                    <button onClick={() => removeItem('roleOptions', idx)} className="shrink-0 text-mute hover:text-ink px-3 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-medium uppercase tracking-widest">
                                        HAPUS
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="mt-[24px] p-4 bg-soft-cloud text-ink text-[10px] font-medium uppercase tracking-widest border border-hairline">
                           DAFTAR ROLE INI AKAN MUNCUL SEBAGAI PILIHAN SAAT MENDAFTARKAN STAFF BARU.
                        </div>
                    </div>
                  </div>

                  <div className={`bg-canvas p-6 border border-hairline ${restrictedClass}`}>
                      <RestrictedOverlay/>
                      <div className="flex justify-between items-center mb-[24px]">
                          <h4 className="font-medium text-ink uppercase tracking-widest text-[14px]">
                              PENGATURAN KALENDER KERJA (LIBUR INTERNAL/NASIONAL)
                          </h4>
                      </div>
                      <p className="text-[10px] text-mute uppercase tracking-widest leading-relaxed mb-[24px]">
                          HARI MINGGU SECARA OTOMATIS DIHITUNG SEBAGAI HARI LIBUR. SILAKAN TAMBAHKAN TANGGAL KHUSUS (FORMAT YYYY-MM-DD) YANG DIHITUNG SEBAGAI HARI LIBUR UNTUK KEPERLUAN AKURASI PERHITUNGAN SLA DAN PERFORMA MINGGUAN.
                      </p>
                      
                      <div className="flex flex-col md:flex-row gap-4 mb-[24px]">
                          <div className="flex items-center gap-4 w-full md:w-auto">
                              <input 
                                  type="date" 
                                  id="newHolidayInput"
                                  className="w-full md:w-auto p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[12px] font-medium text-ink uppercase"
                              />
                              <button 
                                  onClick={() => {
                                      const el = document.getElementById('newHolidayInput') as HTMLInputElement;
                                      if (el && el.value) {
                                          const current = localSettings.internalHolidays || [];
                                          if (!current.includes(el.value)) {
                                              handleChange('internalHolidays', [...current, el.value].sort());
                                          }
                                          el.value = '';
                                      }
                                  }}
                                  className="shrink-0 bg-ink text-canvas px-6 py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors"
                              >
                                  TAMBAH TANGGAL
                              </button>
                          </div>
                      </div>

                      <div className="flex flex-wrap gap-4 max-h-[300px] overflow-y-auto">
                          {(localSettings.internalHolidays || []).map((dateStr, idx) => (
                              <div key={idx} className="flex items-center gap-4 bg-canvas p-4 border border-hairline transition-colors">
                                  <span className="text-[14px] font-medium text-ink">{dateStr}</span>
                                  <button onClick={() => {
                                      const newHolidays = [...(localSettings.internalHolidays || [])];
                                      newHolidays.splice(idx, 1);
                                      handleChange('internalHolidays', newHolidays);
                                  }} className="text-[10px] font-medium text-mute hover:text-ink uppercase tracking-widest">
                                      HAPUS
                                  </button>
                              </div>
                          ))}
                          {(!localSettings.internalHolidays || localSettings.internalHolidays.length === 0) && (
                              <div className="w-full text-center py-8 text-[10px] text-mute uppercase tracking-widest">BELUM ADA HARI LIBUR KHUSUS YANG DITAMBAHKAN.</div>
                          )}
                      </div>
                  </div>
              </div>
          )}

          {activeTab === 'insurance' && (
              <div className={`space-y-[48px] animate-fade-in ${restrictedClass}`}>
                  <RestrictedOverlay />

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div>
                          <h3 className="text-[14px] font-medium text-ink uppercase tracking-widest">DATABASE ASURANSI & ATURAN DISKON</h3>
                          <p className="text-[10px] text-mute mt-2 uppercase tracking-widest">NILAI DISKON YANG DITETAPKAN DI SINI AKAN OTOMATIS DITERAPKAN SAAT MEMBUAT ESTIMASI BARU BERDASARKAN NAMA ASURANSI UNIT KENDARAAN.</p>
                      </div>
                      <button
                          onClick={() => {
                              const current = localSettings.insuranceOptions || [];
                              handleChange('insuranceOptions', [...current, { name: '', jasa: 0, part: 0 }]);
                          }}
                          className="flex-shrink-0 bg-ink text-canvas px-6 py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors"
                      >
                          TAMBAH ASURANSI
                      </button>
                  </div>

                  <div className="flex items-start gap-4 bg-soft-cloud border border-hairline p-6">
                      <div className="text-[10px] text-ink leading-relaxed uppercase tracking-widest font-medium">
                          CARA KERJA AUTO-FILL: KETIKA SA MEMBUKA FORM ESTIMASI UNTUK UNIT DENGAN ASURANSI "GARDA OTO INS", SISTEM AKAN OTOMATIS MENGISI KOLOM DISKON JASA DAN DISKON PART SESUAI ANGKA YANG TERSIMPAN DI SINI. SA TETAP DAPAT MENGUBAH NILAI TERSEBUT SECARA MANUAL JIKA DIPERLUKAN.
                      </div>
                  </div>

                  <div className="bg-canvas border border-hairline overflow-hidden">
                      <div className="overflow-x-auto">
                          <table className="w-full text-left">
                              <thead className="bg-soft-cloud border-b border-hairline text-mute uppercase font-medium text-[10px] tracking-widest">
                                  <tr>
                                      <th className="px-6 py-4 font-normal w-12">#</th>
                                      <th className="px-6 py-4 font-normal">NAMA ASURANSI / REKANAN</th>
                                      <th className="px-6 py-4 text-center font-normal w-64">DISKON JASA (%)</th>
                                      <th className="px-6 py-4 text-center font-normal w-64">DISKON PART (%)</th>
                                      <th className="px-6 py-4 text-center font-normal w-24">AKSI</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-hairline">
                                  {(localSettings.insuranceOptions || []).map((ins, idx) => (
                                      <tr key={idx} className="hover:bg-soft-cloud transition-colors group">
                                          <td className="px-6 py-4 text-[14px] font-medium text-mute">{idx + 1}</td>

                                          <td className="px-6 py-4">
                                              <input
                                                  type="text"
                                                  value={ins.name}
                                                  onChange={e => {
                                                      const updated = [...(localSettings.insuranceOptions || [])];
                                                      updated[idx] = { ...updated[idx], name: e.target.value };
                                                      handleChange('insuranceOptions', updated);
                                                  }}
                                                  placeholder="NAMA ASURANSI..."
                                                  className="w-full p-4 bg-canvas border border-hairline focus:outline-none focus:border-ink text-[12px] font-medium text-ink uppercase"
                                              />
                                          </td>

                                          <td className="px-6 py-4">
                                              <div className="flex items-center gap-4">
                                                  <input
                                                      type="number"
                                                      min="0"
                                                      max="100"
                                                      value={ins.jasa}
                                                      onChange={e => {
                                                          const updated = [...(localSettings.insuranceOptions || [])];
                                                          updated[idx] = { ...updated[idx], jasa: Math.min(100, Math.max(0, Number(e.target.value))) };
                                                          handleChange('insuranceOptions', updated);
                                                      }}
                                                      className="w-24 p-4 border border-hairline bg-canvas text-[14px] font-medium text-ink text-center focus:outline-none focus:border-ink"
                                                  />
                                                  <span className="text-mute font-medium text-[14px]">%</span>
                                              </div>
                                          </td>

                                          <td className="px-6 py-4">
                                              <div className="flex items-center gap-4">
                                                  <input
                                                      type="number"
                                                      min="0"
                                                      max="100"
                                                      value={ins.part}
                                                      onChange={e => {
                                                          const updated = [...(localSettings.insuranceOptions || [])];
                                                          updated[idx] = { ...updated[idx], part: Math.min(100, Math.max(0, Number(e.target.value))) };
                                                          handleChange('insuranceOptions', updated);
                                                      }}
                                                      className="w-24 p-4 border border-hairline bg-canvas text-[14px] font-medium text-ink text-center focus:outline-none focus:border-ink"
                                                  />
                                                  <span className="text-mute font-medium text-[14px]">%</span>
                                              </div>
                                          </td>

                                          <td className="px-6 py-4 text-center">
                                              <button
                                                  onClick={() => {
                                                      const updated = (localSettings.insuranceOptions || []).filter((_, i) => i !== idx);
                                                      handleChange('insuranceOptions', updated);
                                                  }}
                                                  className="text-[10px] font-medium uppercase tracking-widest text-mute hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity"
                                              >
                                                  HAPUS
                                              </button>
                                          </td>
                                      </tr>
                                  ))}
                                  {(localSettings.insuranceOptions || []).length === 0 && (
                                      <tr>
                                          <td colSpan={5} className="py-[48px] text-center">
                                              <p className="text-[12px] font-medium text-mute uppercase tracking-widest">BELUM ADA DATA ASURANSI.</p>
                                              <p className="text-[10px] text-mute mt-2 uppercase tracking-widest">KLIK "TAMBAH ASURANSI" UNTUK MULAI MENGISI DATABASE.</p>
                                          </td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>

                      {(localSettings.insuranceOptions || []).length > 0 && (
                          <div className="bg-soft-cloud border-t border-hairline px-6 py-4 flex items-center justify-between">
                              <span className="text-[10px] text-mute font-medium uppercase tracking-widest">{(localSettings.insuranceOptions || []).length} REKANAN ASURANSI TERDAFTAR</span>
                              <span className="text-[10px] bg-canvas border border-ink text-ink font-medium px-4 py-2 uppercase tracking-widest">
                                  AKTIF — OTOMATIS DITERAPKAN KE ESTIMASI
                              </span>
                          </div>
                      )}
                  </div>

                  <div className="flex items-center gap-4 p-6 bg-canvas border border-ink">
                      <p className="text-[10px] text-ink font-medium uppercase tracking-widest">JANGAN LUPA KLIK "SIMPAN PERUBAHAN" DI BAGIAN ATAS HALAMAN SETELAH SELESAI MENGEDIT.</p>
                  </div>
              </div>
          )}
          
          {activeTab === 'menu_access' && (
              <div className={`space-y-[48px] ${restrictedClass}`}>
                  <RestrictedOverlay/>
                  <section className="bg-canvas border border-hairline p-6">
                      <h3 className="text-[14px] font-medium text-ink uppercase tracking-widest mb-6">PENGATURAN HAK AKSES MENU PER ROLE</h3>
                      <p className="text-[10px] text-mute mb-6 uppercase tracking-widest">CENTANG KOTAK UNTUK MEMBERIKAN AKSES. ROLE MANAGER SELALU MEMILIKI AKSES PENUH.</p>
                      
                      <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                              <thead>
                                  <tr>
                                      <th className="p-4 border-b border-hairline bg-soft-cloud text-[10px] font-medium text-mute uppercase tracking-widest min-w-[200px]">NAMA MENU</th>
                                      {localSettings.roleOptions.map(role => (
                                          <th key={role} className="p-4 border-b border-hairline bg-soft-cloud text-[10px] font-medium text-mute uppercase tracking-widest text-center whitespace-nowrap">{role}</th>
                                      ))}
                                  </tr>
                              </thead>
                              <tbody>
                                  {[
                                    { id: 'overview_main', label: 'Dashboard Utama' },
                                    { id: 'overview_business', label: 'Analisis Bisnis' },
                                    { id: 'overview_kpi', label: 'Performa Staff (KPI)' },
                                    { id: 'overview_ai', label: 'AI Strategic Insight' },
                                    { id: 'input_data', label: 'Input Unit Baru' },
                                    { id: 'estimation_create', label: 'Buat Estimasi' },
                                    { id: 'entry_data', label: 'Daftar Pekerjaan (WO)' },
                                    { id: 'production_spkl', label: 'SPKL (Jasa Luar)' },
                                    { id: 'claims_control', label: 'Admin Claim Control' },
                                    { id: 'crc_dashboard', label: 'CRC / Customer Care' },
                                    { id: 'job_control', label: 'Job Control (Kanban)' },
                                    { id: 'part_monitoring', label: 'Monitoring Part WO' },
                                    { id: 'inventory', label: 'Master Stok' },
                                    { id: 'purchase_order', label: 'Purchase Order (PO)' },
                                    { id: 'part_issuance', label: 'Keluar Part (WO)' },
                                    { id: 'material_issuance', label: 'Pakai Bahan' },
                                    { id: 'general_affairs', label: 'Aset & Operasional' },
                                    { id: 'finance_invoice', label: 'Pembuatan Faktur' },
                                    { id: 'finance_cashier', label: 'Kasir & Gatepass' },
                                    { id: 'finance_tax', label: 'Manajemen Pajak' },
                                    { id: 'finance_debt', label: 'Hutang & Piutang' },
                                    { id: 'finance_dashboard', label: 'Laporan Keuangan' },
                                    { id: 'report_center', label: 'Pusat Laporan' }
                                  ].map((menu, idx) => (
                                      <tr key={menu.id} className={idx % 2 === 0 ? 'bg-canvas' : 'bg-soft-cloud'}>
                                          <td className="p-4 border-b border-hairline text-[12px] font-medium text-ink uppercase">{menu.label}</td>
                                          {localSettings.roleOptions.map(role => {
                                              const isManagerRole = role === 'Manager';
                                              const permissions = localSettings.menuPermissions?.[role] || [];
                                              // Jika belum pernah di-set (undefined array length 0) dan bukan manager, biarkan false.
                                              // Namun secara default awal, kita biarkan checked jika admin belum setup menuPermissions?
                                              // Mari kita buat default true jika menuPermissions[role] belum pernah dibuat.
                                              const hasBeenSetup = !!localSettings.menuPermissions?.[role];
                                              const isChecked = isManagerRole || (!hasBeenSetup) || permissions.includes(menu.id);
                                              
                                              return (
                                                  <td key={role} className="p-4 border-b border-hairline text-center">
                                                      <input 
                                                          type="checkbox" 
                                                          disabled={!isManager || isManagerRole}
                                                          checked={isChecked}
                                                          onChange={(e) => {
                                                              const checked = e.target.checked;
                                                              let newPerms = hasBeenSetup ? [...permissions] : [
                                                                'overview_main', 'overview_business', 'overview_kpi', 'overview_ai',
                                                                'input_data', 'estimation_create', 'entry_data', 'production_spkl', 'claims_control', 'crc_dashboard',
                                                                'job_control', 'part_monitoring', 'inventory', 'purchase_order', 'part_issuance', 'material_issuance', 'general_affairs',
                                                                'finance_invoice', 'finance_cashier', 'finance_tax', 'finance_debt', 'finance_dashboard', 'report_center'
                                                              ];
                                                              
                                                              if (checked) {
                                                                  if (!newPerms.includes(menu.id)) newPerms.push(menu.id);
                                                              } else {
                                                                  newPerms = newPerms.filter(id => id !== menu.id);
                                                              }
                                                              setLocalSettings(prev => ({
                                                                  ...prev,
                                                                  menuPermissions: {
                                                                      ...(prev.menuPermissions || {}),
                                                                      [role]: newPerms
                                                                  }
                                                              }));
                                                          }}
                                                          className="w-4 h-4 cursor-pointer accent-ink"
                                                      />
                                                  </td>
                                              );
                                          })}
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </section>
                  
                  <div className="flex items-center gap-4 p-6 bg-canvas border border-ink">
                      <p className="text-[10px] text-ink font-medium uppercase tracking-widest">JANGAN LUPA KLIK "SIMPAN PERUBAHAN" DI BAGIAN ATAS HALAMAN SETELAH SELESAI MENGEDIT HAK AKSES.</p>
                  </div>
              </div>
          )}
      </div>

      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title="DAFTARKAN USER BARU">
          <form onSubmit={handleCreateUser} className="space-y-[24px]">
              <div className="bg-soft-cloud p-6 border border-hairline mb-[24px]">
                  <p className="text-[10px] text-ink leading-relaxed font-medium uppercase tracking-widest">PASSWORD AWAL WAJIB DIISI UNTUK MEMBUAT AKUN LOGIN BARU. JIKA USER SUDAH PUNYA AKUN, PASSWORD INI AKAN DIABAIKAN.</p>
              </div>
              <div>
                  <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">EMAIL AKTIF (LOGIN ID) *</label>
                  <input type="email" required value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase" placeholder="USER@REFORMA.COM"/>
              </div>
              <div>
                  <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">PASSWORD AWAL (MIN 6 KARAKTER) *</label>
                  <input type="text" required value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase" placeholder="PASSWORD123"/>
              </div>
              <div>
                  <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">NAMA LENGKAP TAMPILAN *</label>
                  <input type="text" required value={userForm.displayName} onChange={e => setUserForm({...userForm, displayName: e.target.value})} className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase" placeholder="NAMA STAFF..."/>
              </div>
              <div>
                  <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">HAK AKSES / ROLE *</label>
                  <select required value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})} className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase">
                      {localSettings.roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-ink text-canvas py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors mt-4">
                  {isLoading ? 'PROCESSING...' : 'DAFTARKAN USER'}
              </button>
          </form>
      </Modal>
    </div>
  );
};

export default SettingsView;
