import React, { useState, useMemo } from 'react';
import { Job, SpklItem, Supplier, UserPermissions } from '../../types';
import { formatCurrency, formatDateIndo, cleanObject } from '../../utils/helpers';
import { collection, updateDoc, doc, increment, arrayUnion } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';

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
    <div className="animate-fade-in pb-[48px]">
        {/* HEADER */}
        <div className="border-b border-hairline pb-[24px] mb-[48px]">
            <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">SPKL (SUBLET)</h1>
            <p className="text-[16px] text-mute font-normal mt-[18px]">Manajemen Sublet & Pekerjaan Vendor Pihak ke-3</p>
        </div>

        {/* SEARCH WORK ORDER */}
        <div className="mb-[48px] bg-canvas border border-hairline relative">
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="SEARCH WO / NOPOL..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full p-4 pl-4 border-b border-hairline bg-canvas focus:outline-none focus:border-ink font-medium uppercase text-[14px] text-ink"
                />
            </div>
            
            {searchTerm && !selectedJobId && (
                <div className="max-h-60 overflow-y-auto divide-y divide-hairline bg-canvas">
                    {activeWOs.map(job => (
                        <div 
                            key={job.id}
                            onClick={() => { setSelectedJobId(job.id); setSearchTerm(''); }}
                            className="p-4 hover:bg-soft-cloud cursor-pointer flex justify-between items-center transition-colors"
                        >
                            <div>
                                <span className="font-medium text-ink uppercase tracking-widest">{job.woNumber}</span>
                                <span className="mx-2 text-mute">|</span>
                                <span className="font-medium text-ink uppercase tracking-widest">{job.policeNumber}</span>
                                <div className="text-[10px] text-mute mt-1 uppercase tracking-widest">{job.customerName} - {job.carModel}</div>
                            </div>
                            <span className="text-[10px] font-medium text-ink uppercase tracking-widest border border-ink px-2 py-1">PILIH</span>
                        </div>
                    ))}
                    {activeWOs.length === 0 && <p className="p-4 text-center text-mute text-[12px] uppercase tracking-widest">UNIT TIDAK DITEMUKAN ATAU SUDAH CLOSED.</p>}
                </div>
            )}
        </div>

        {selectedJob && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-[24px] animate-fade-in">
                {/* LEFT: JOB CONTEXT & NEW SPKL FORM */}
                <div className="space-y-[24px]">
                    <div className="bg-ink text-canvas p-6 border border-ink">
                        <span className="text-[10px] font-medium uppercase tracking-widest text-mute">UNIT TERPILIH</span>
                        <h2 className="text-[32px] font-display mt-2 leading-none">{selectedJob.woNumber}</h2>
                        <p className="text-[14px] text-mute mt-2 uppercase tracking-widest">{selectedJob.policeNumber} | {selectedJob.carModel}</p>
                        <div className="mt-6 pt-6 border-t border-mute/30 flex justify-between items-center">
                            <button onClick={() => setSelectedJobId('')} className="text-[10px] font-medium border border-mute text-mute hover:text-canvas hover:border-canvas px-4 py-2 uppercase tracking-widest transition-colors">
                                GANTI WO
                            </button>
                            <span className="text-[10px] font-medium bg-canvas text-ink px-3 py-1 uppercase tracking-widest">WIP / PRODUKSI</span>
                        </div>
                    </div>

                    <div className="bg-canvas p-6 border border-hairline">
                        <h3 className="font-medium text-ink uppercase tracking-widest text-[16px] mb-6 border-b border-hairline pb-4">BUAT SPKL BARU</h3>
                        <form onSubmit={handleAddSpkl} className="space-y-6">
                            <div>
                                <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">NAMA PEKERJAAN LUAR</label>
                                <input 
                                    type="text" required 
                                    value={spklForm.taskName}
                                    onChange={e => setSpklForm({...spklForm, taskName: e.target.value})}
                                    className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase"
                                    placeholder="CONTOH: BUBUT REM..."
                                />
                            </div>

                            <div>
                                <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">NAMA VENDOR / SUBLET</label>
                                <input 
                                    list="vendor-list"
                                    type="text" required 
                                    value={spklForm.vendorName}
                                    onChange={e => setSpklForm({...spklForm, vendorName: e.target.value})}
                                    className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase"
                                    placeholder="KETIK NAMA VENDOR..."
                                />
                                <datalist id="vendor-list">
                                    {suppliers.filter(s => s.category === 'Jasa Luar').map(s => <option key={s.id} value={s.name}/>)}
                                </datalist>
                            </div>

                            <div>
                                <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">BIAYA VENDOR (HPP)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-4 font-medium text-mute uppercase text-[14px]">RP</span>
                                    <input 
                                        type="text" required 
                                        value={spklForm.cost ? new Intl.NumberFormat('id-ID').format(spklForm.cost) : ''}
                                        onChange={handleCostChange}
                                        className="w-full pl-12 p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="p-4 bg-soft-cloud border border-hairline flex items-center justify-between">
                                <label className="flex items-center gap-3 cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={spklForm.hasPph23} 
                                        onChange={e => setSpklForm({...spklForm, hasPph23: e.target.checked})}
                                        className="w-4 h-4 accent-ink"
                                    />
                                    <span className="text-[12px] font-medium text-ink uppercase tracking-widest">POTONGAN PPh 23 (2%)?</span>
                                </label>
                                {spklForm.hasPph23 && (
                                    <span className="text-[12px] font-medium text-ink uppercase tracking-widest">-{formatCurrency(spklForm.cost * 0.02)}</span>
                                )}
                            </div>

                            <button 
                                type="submit" 
                                disabled={isProcessing}
                                className="w-full bg-ink text-canvas py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors disabled:opacity-50"
                            >
                                {isProcessing ? 'PROCESSING...' : 'TERBITKAN SPKL'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* RIGHT: SPKL ITEMS LIST */}
                <div className="lg:col-span-2 space-y-[24px]">
                    <div className="bg-canvas border border-hairline flex flex-col h-full">
                        <div className="p-6 bg-soft-cloud border-b border-hairline flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
                            <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">DAFTAR ITEM PEKERJAAN LUAR</h3>
                            <div className="text-[12px] font-medium text-ink uppercase tracking-widest border border-ink px-4 py-2 bg-canvas">
                                TOTAL HPP SUBLET: {formatCurrency((selectedJob.spklItems || []).reduce((acc, i) => acc + i.cost, 0))}
                            </div>
                        </div>
                        
                        <div className="overflow-x-auto flex-grow">
                            <table className="w-full text-left">
                                <thead className="bg-canvas text-mute font-medium uppercase tracking-widest text-[10px] border-b border-hairline sticky top-0">
                                    <tr>
                                        <th className="px-6 py-4 font-normal">ITEM PEKERJAAN</th>
                                        <th className="px-6 py-4 font-normal">VENDOR</th>
                                        <th className="px-6 py-4 text-right font-normal">BIAYA (HPP)</th>
                                        <th className="px-6 py-4 text-center font-normal">STATUS</th>
                                        <th className="px-6 py-4 text-center font-normal">AKSI</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-hairline">
                                    {(selectedJob.spklItems || []).length > 0 ? (selectedJob.spklItems || []).map((item) => (
                                        <tr key={item.id} className={`hover:bg-soft-cloud transition-colors ${item.status === 'Closed' ? 'opacity-75' : ''}`}>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-ink uppercase text-[14px]">{item.taskName}</div>
                                                <div className="text-[10px] text-mute uppercase tracking-widest mt-1">{formatDateIndo(item.createdAt)}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-ink uppercase text-[14px]">{item.vendorName}</div>
                                                {item.hasPph23 && <span className="text-[10px] font-medium text-ink border border-ink px-1 py-0.5 uppercase tracking-widest mt-1 inline-block">PPh 23 Terpotong</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="font-medium text-ink text-[14px]">{formatCurrency(item.cost)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button 
                                                    onClick={() => handleToggleSpklStatus(item)}
                                                    className={`px-3 py-1 text-[10px] font-medium uppercase tracking-widest border transition-colors ${item.status === 'Closed' ? 'bg-canvas text-ink border-ink' : 'bg-ink text-canvas border-ink hover:bg-mute'}`}
                                                >
                                                    {item.status === 'Closed' ? 'LENGKAP' : 'PROSES'}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {userPermissions.role.includes('Manager') && (
                                                    <button 
                                                        onClick={() => handleDeleteSpkl(item)}
                                                        className="text-[10px] font-medium uppercase tracking-widest border border-hairline text-ink hover:border-ink px-3 py-1 transition-colors"
                                                    >
                                                        HAPUS
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={5} className="py-12 text-center text-mute text-[12px] uppercase tracking-widest">Belum ada item pekerjaan luar.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-6 bg-canvas border-t border-hairline">
                            <p className="text-[12px] text-ink uppercase tracking-widest leading-relaxed">
                                <span className="font-medium">PENTING:</span> Biaya SPKL akan otomatis masuk ke perhitungan LABA KOTOR di laporan keuangan. Pastikan status sudah CLOSED agar tidak menghambat penerbitan Faktur Penagihan oleh departemen Finance.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default SpklManagementView;
