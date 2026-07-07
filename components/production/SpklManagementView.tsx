
import React, { useState, useMemo } from 'react';
import { Job, SpklItem, Supplier, UserPermissions } from '../../types';
import { formatCurrency, formatDateIndo, cleanObject } from '../../utils/helpers';
import { collection, updateDoc, doc, increment, arrayUnion } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { Search, ExternalLink, Plus, Trash2, CheckCircle2, Clock, AlertTriangle, FileText, User, Car, Calculator, Save, XCircle, Info, Building2 } from 'lucide-react';

interface SpklManagementViewProps {
  jobs: Job[];
  suppliers: Supplier[];
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
}

const SpklManagementView: React.FC<SpklManagementViewProps> = ({ jobs, suppliers, userPermissions, showNotification }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Form State
  const [spklForm, setSpklForm] = useState({
      taskName: '',
      vendorName: '',
      cost: 0,
      hasPph23: true,
      notes: ''
  });

  const selectedJob = useMemo(() => jobs.find(j => j.id === selectedJobId), [jobs, selectedJobId]);

  const activeWOs = useMemo(() => {
      const term = searchTerm.toUpperCase().trim();
      return jobs.filter(j => 
          !j.isClosed && 
          j.woNumber && 
          !j.isDeleted &&
          (term === '' || 
           j.woNumber.includes(term) || 
           j.policeNumber.includes(term) ||
           j.customerName.toUpperCase().includes(term))
      );
  }, [jobs, searchTerm]);

  // Helper
  const handleCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, '');
      setSpklForm(prev => ({ ...prev, cost: raw ? parseInt(raw, 10) : 0 }));
  };

  const handleAddSpkl = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedJob) return;

      if (!spklForm.taskName || !spklForm.vendorName || spklForm.cost <= 0) {
          showNotification("Mohon lengkapi semua field.", "error");
          return;
      }

      setIsProcessing(true);
      try {
          const pph23Amount = spklForm.hasPph23 ? Math.round(spklForm.cost * 0.02) : 0;
          const newItem: SpklItem = cleanObject({
              id: `SPKL-${Date.now()}`,
              taskName: spklForm.taskName,
              vendorName: spklForm.vendorName,
              cost: Number(spklForm.cost),
              hasPph23: spklForm.hasPph23,
              pph23Amount: pph23Amount,
              status: 'Open',
              createdAt: new Date().toISOString(),
              notes: spklForm.notes
          });

          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          // Total cost added to jasaExternal expense
          await updateDoc(jobRef, {
              spklItems: arrayUnion(newItem),
              'costData.jasaExternal': increment(newItem.cost)
          });

          showNotification("Item SPKL berhasil ditambahkan.", "success");
          setSpklForm({ taskName: '', vendorName: '', cost: 0, hasPph23: true, notes: '' });
      } catch (e: any) {
          showNotification("Gagal menyimpan SPKL: " + e.message, "error");
      } finally {
          setIsProcessing(false);
      }
  };

  const handleToggleSpklStatus = async (item: SpklItem) => {
      if (!selectedJob) return;
      const newStatus = item.status === 'Open' ? 'Closed' : 'Open';
      const confirmMsg = newStatus === 'Closed' 
          ? "Tandai pekerjaan luar ini sudah SELESAI dan biayanya sudah final?"
          : "Buka kembali status SPKL ini?";

      if (!window.confirm(confirmMsg)) return;

      setIsProcessing(true);
      try {
          const updatedItems = (selectedJob.spklItems || []).map(si => {
              if (si.id === item.id) {
                  return { 
                      ...si, 
                      status: newStatus, 
                      closedAt: newStatus === 'Closed' ? new Date().toISOString() : null 
                  };
              }
              return si;
          });

          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id), {
              spklItems: updatedItems
          });

          showNotification(`SPKL diperbarui ke ${newStatus}.`, "success");
      } catch (e: any) {
          showNotification("Gagal update: " + e.message, "error");
      } finally {
          setIsProcessing(false);
      }
  };

  const handleDeleteSpkl = async (item: SpklItem) => {
      if (!selectedJob || !userPermissions.role.includes('Manager')) return;
      if (!window.confirm("Hapus item SPKL ini? Biaya HPP Jasa External akan dikurangi.")) return;

      setIsProcessing(true);
      try {
          const updatedItems = (selectedJob.spklItems || []).filter(si => si.id !== item.id);
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id), {
              spklItems: updatedItems,
              'costData.jasaExternal': increment(-item.cost)
          });
          showNotification("SPKL dihapus.", "success");
      } catch (e: any) {
          showNotification("Gagal hapus: " + e.message, "error");
      } finally {
          setIsProcessing(false);
      }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-600 rounded-xl shadow-sm text-white">
                    <ExternalLink size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">SPKL (Surat Perintah Kerja Luar)</h1>
                    <p className="text-sm text-gray-500 font-medium">Manajemen Sublet & Pekerjaan Vendor Pihak ke-3</p>
                </div>
            </div>
        </div>

        {/* SEARCH WORK ORDER */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="relative mb-4">
                <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                <input 
                    type="text" 
                    placeholder="Cari WO yang membutuhkan Sublet..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium"
                />
            </div>
            
            {searchTerm && !selectedJobId && (
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-2 bg-gray-50/50">
                    {activeWOs.map(job => (
                        <div 
                            key={job.id}
                            onClick={() => { setSelectedJobId(job.id); setSearchTerm(''); }}
                            className="p-3 border border-white bg-white rounded-lg hover:border-indigo-200 hover:bg-indigo-50 cursor-pointer flex justify-between items-center transition-all shadow-sm"
                        >
                            <div>
                                <span className="font-black text-indigo-700">{job.woNumber}</span>
                                <span className="mx-2 text-gray-300">|</span>
                                <span className="font-bold text-gray-900">{job.policeNumber}</span>
                                <div className="text-xs text-gray-500 mt-0.5">{job.customerName} - {job.carModel}</div>
                            </div>
                            <ExternalLink size={18} className="text-gray-300"/>
                        </div>
                    ))}
                    {activeWOs.length === 0 && <p className="text-center text-gray-400 py-4 italic text-sm">Unit tidak ditemukan atau sudah closed.</p>}
                </div>
            )}
        </div>

        {selectedJob && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
                {/* LEFT: JOB CONTEXT & NEW SPKL FORM */}
                <div className="space-y-6">
                    <div className="bg-indigo-900 text-white p-6 rounded-xl shadow-lg relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 opacity-10"><ExternalLink size={120}/></div>
                        <div className="relative z-10">
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Unit Terpilih</span>
                            <h2 className="text-2xl font-black mt-1">{selectedJob.woNumber}</h2>
                            <p className="text-sm opacity-80 mt-1">{selectedJob.policeNumber} | {selectedJob.carModel}</p>
                            <div className="mt-4 pt-4 border-t border-indigo-800 flex justify-between items-center">
                                <button onClick={() => setSelectedJobId('')} className="text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition-colors flex items-center gap-1">
                                    <XCircle size={14}/> Ganti WO
                                </button>
                                <span className="text-[10px] font-bold bg-orange-500 px-2 py-0.5 rounded uppercase">WIP / Produksi</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-indigo-100 shadow-md">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-6 pb-2 border-b">
                            <Plus size={18} className="text-indigo-600"/> Buat SPKL Baru
                        </h3>
                        <form onSubmit={handleAddSpkl} className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Nama Pekerjaan Luar</label>
                                <input 
                                    type="text" required 
                                    value={spklForm.taskName}
                                    onChange={e => setSpklForm({...spklForm, taskName: e.target.value})}
                                    className="w-full p-2.5 border rounded-lg focus:ring-2 ring-indigo-500 font-medium"
                                    placeholder="Contoh: Bubut Rem, Stel Pintu..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Nama Vendor / Sublet</label>
                                <input 
                                    list="vendor-list"
                                    type="text" required 
                                    value={spklForm.vendorName}
                                    onChange={e => setSpklForm({...spklForm, vendorName: e.target.value})}
                                    className="w-full p-2.5 border rounded-lg focus:ring-2 ring-indigo-500"
                                    placeholder="Ketik nama bengkel luar..."
                                />
                                <datalist id="vendor-list">
                                    {suppliers.filter(s => s.category === 'Jasa Luar').map(s => <option key={s.id} value={s.name}/>)}
                                </datalist>
                            </div>

                            <div>
                                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Biaya Vendor (HPP)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 font-bold text-gray-400">Rp</span>
                                    <input 
                                        type="text" required 
                                        value={spklForm.cost ? new Intl.NumberFormat('id-ID').format(spklForm.cost) : ''}
                                        onChange={handleCostChange}
                                        className="w-full pl-10 p-2.5 border rounded-lg focus:ring-2 ring-indigo-500 font-black text-indigo-900"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-center justify-between">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={spklForm.hasPph23} 
                                        onChange={e => setSpklForm({...spklForm, hasPph23: e.target.checked})}
                                        className="w-4 h-4 text-orange-600 rounded"
                                    />
                                    <span className="text-xs font-bold text-amber-800 uppercase">Potongan PPh 23 (2%)?</span>
                                </label>
                                {spklForm.hasPph23 && (
                                    <span className="text-xs font-black text-amber-600">-{formatCurrency(spklForm.cost * 0.02)}</span>
                                )}
                            </div>

                            <button 
                                type="submit" 
                                disabled={isProcessing}
                                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all transform active:scale-95 disabled:opacity-70"
                            >
                                <Save size={18}/> TERBITKAN SPKL
                            </button>
                        </form>
                    </div>
                </div>

                {/* RIGHT: SPKL ITEMS LIST */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                            <h3 className="font-bold text-gray-800">Daftar Item Pekerjaan Luar (SPKL)</h3>
                            <div className="text-xs font-bold text-indigo-600 bg-white px-2 py-1 rounded border">
                                Total HPP Sublet: {formatCurrency((selectedJob.spklItems || []).reduce((acc, i) => acc + i.cost, 0))}
                            </div>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-100 text-gray-500 uppercase font-black text-[10px] tracking-widest">
                                    <tr>
                                        <th className="px-6 py-4">Item Pekerjaan</th>
                                        <th className="px-6 py-4">Vendor</th>
                                        <th className="px-6 py-4 text-right">Biaya (HPP)</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                        <th className="px-6 py-4 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(selectedJob.spklItems || []).length > 0 ? (selectedJob.spklItems || []).map((item) => (
                                        <tr key={item.id} className={`${item.status === 'Closed' ? 'bg-emerald-50/30' : 'hover:bg-gray-50'}`}>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900">{item.taskName}</div>
                                                <div className="text-[10px] text-gray-400">{formatDateIndo(item.createdAt)}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1.5 font-medium text-gray-700">
                                                    <Building2 size={14} className="text-gray-400"/> {item.vendorName}
                                                </div>
                                                {item.hasPph23 && <span className="text-[9px] font-bold text-orange-600 border border-orange-200 px-1 rounded">PPh 23 Terpotong</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="font-black text-gray-800">{formatCurrency(item.cost)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button 
                                                    onClick={() => handleToggleSpklStatus(item)}
                                                    className={`px-3 py-1 rounded-full text-[10px] font-black border transition-all ${item.status === 'Closed' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200'}`}
                                                >
                                                    {item.status === 'Closed' ? 'LENGKAP (CLOSED)' : 'MASIH PROSES (OPEN)'}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex justify-center gap-2">
                                                    {userPermissions.role.includes('Manager') && (
                                                        <button 
                                                            onClick={() => handleDeleteSpkl(item)}
                                                            className="text-red-300 hover:text-red-600 p-1.5 transition-colors"
                                                        >
                                                            <Trash2 size={16}/>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={5} className="p-20 text-center text-gray-400 italic font-medium">Belum ada item pekerjaan luar untuk unit ini.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 bg-blue-50 border-t flex items-start gap-3">
                            <Info size={18} className="text-blue-600 mt-0.5 shrink-0"/>
                            <div className="text-xs text-blue-800 leading-relaxed">
                                <strong>Penting:</strong> Biaya SPKL akan otomatis masuk ke perhitungan <strong>Laba Kotor</strong> di laporan keuangan. Pastikan status sudah <strong>Closed</strong> agar tidak menghambat penerbitan Faktur Penagihan oleh departemen Finance.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default SpklManagementView;
