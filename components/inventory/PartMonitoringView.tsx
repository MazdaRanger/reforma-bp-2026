
import React, { useState, useMemo } from 'react';
import { Job, InventoryItem, EstimateItem } from '../../types';
import { formatDateIndo } from '../../utils/helpers';
// Added CheckCircle2 to the imports to resolve reference error
import { Search, Filter, CheckCircle, CheckCircle2, Clock, Package, AlertCircle, Eye, X, AlertTriangle, Save, ShoppingCart, Info, Zap } from 'lucide-react';
import Modal from '../ui/Modal';
import { doc, updateDoc } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';

interface PartMonitoringViewProps {
  jobs: Job[];
  inventoryItems: InventoryItem[];
}

const PartMonitoringView: React.FC<PartMonitoringViewProps> = ({ jobs, inventoryItems }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LENGKAP' | 'PARTIAL' | 'INDENT' | 'NEED_ORDER'>('ALL');
  // Use any to allow augmented properties from processedJobs which are not defined on Job interface
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // --- LOGIC: FIFO Stock Allocation Algorithm ---
  // Typed as any[] to allow augmented properties in TS during mapping and rendering
  const processedJobs = useMemo<any[]>(() => {
    // 1. Filter only Active WOs that have Parts
    const activeJobs = jobs.filter(j => 
        !j.isClosed && 
        j.woNumber && 
        !j.isDeleted &&
        j.estimateData?.partItems && 
        j.estimateData.partItems.length > 0
    );

    // 2. Sort by Entry Date (First In First Out priority for stock)
    activeJobs.sort((a, b) => {
        const getTime = (val: any) => {
          if (!val) return 0;
          if (typeof val.toMillis === 'function') return val.toMillis();
          if (val.seconds) return val.seconds * 1000;
          const d = new Date(val).getTime();
          return isNaN(d) ? 0 : d;
        };
        return getTime(a.createdAt) - getTime(b.createdAt);
    });

    // 3. Create a Virtual Stock Map from Inventory Master
    const stockMap: Record<string, number> = {};
    inventoryItems.forEach(item => {
        stockMap[item.id] = item.stock;
    });

    // 4. Process Jobs and Allocate Stock
    return activeJobs.map(job => {
        const parts = job.estimateData?.partItems || [];
        const totalParts = parts.length;
        let readyCount = 0;
        let unOrderedCount = 0;
        let hasIndent = false;
        
        const processedParts = parts.map(part => {
            let status: 'ARRIVED' | 'READY' | 'INDENT_MANUAL' | 'WAITING' = 'WAITING';
            const reqQty = part.qty || 1;

            if (part.isIndent) hasIndent = true;

            // TRACKING HIERARCHY:
            // 1. Physically Arrived (flagged in Job via Receiving PO)
            if (part.hasArrived) {
                status = 'ARRIVED';
                readyCount++;
            }
            // 2. In Stock at Warehouse (FIFO Allocation)
            else if (part.inventoryId && stockMap[part.inventoryId] >= reqQty) {
                status = 'READY';
                stockMap[part.inventoryId] -= reqQty;
                readyCount++;
            }
            // 3. Explicitly marked as Indent
            else if (part.isIndent) {
                status = 'INDENT_MANUAL';
            }
            // 4. Not in stock and not arrived
            else {
                status = 'WAITING';
            }

            // Track outstanding POs (not yet ordered)
            if (!part.hasArrived && !part.isOrdered) {
                unOrderedCount++;
            }

            return { ...part, allocationStatus: status };
        });
        
        let jobStatus: 'LENGKAP' | 'PARTIAL' | 'INDENT' = 'INDENT';
        
        if (readyCount === totalParts) jobStatus = 'LENGKAP';
        else if (readyCount > 0) jobStatus = 'PARTIAL';
        else jobStatus = 'INDENT';

        return {
            ...job,
            partStatus: jobStatus,
            totalParts,
            readyParts: readyCount,
            detailedParts: processedParts,
            hasOutstandingOrder: unOrderedCount > 0,
            unOrderedCount,
            hasIndentConfirmed: hasIndent
        };
    }).filter(job => {
        const matchesSearch = 
            job.policeNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
            job.woNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.customerName.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = 
            statusFilter === 'ALL' || 
            (statusFilter === 'NEED_ORDER' ? job.hasOutstandingOrder : job.partStatus === statusFilter);

        return matchesSearch && matchesStatus;
    });
  }, [jobs, inventoryItems, searchTerm, statusFilter]);

  const stats = useMemo(() => {
      const lengkap = processedJobs.filter(j => j.partStatus === 'LENGKAP').length;
      const partial = processedJobs.filter(j => j.partStatus === 'PARTIAL').length;
      const indent = processedJobs.filter(j => j.partStatus === 'INDENT').length;
      const needOrder = processedJobs.filter(j => j.hasOutstandingOrder).length;
      return { total: processedJobs.length, lengkap, partial, indent, needOrder };
  }, [processedJobs]);

  const handleToggleIndent = async (partIndex: number, currentIndentStatus: boolean, currentETA?: string) => {
      if (!selectedJob) return;
      
      let newETA = currentETA || '';
      if (!currentIndentStatus) {
          const input = prompt("Masukkan Estimasi Tanggal Datang (ETA) (Opsional):", newETA);
          if (input === null) return;
          newETA = input;
      } else {
          newETA = '';
      }

      setIsUpdating(true);
      try {
          const updatedParts = [...(selectedJob.estimateData?.partItems || [])];
          updatedParts[partIndex] = {
              ...updatedParts[partIndex],
              isIndent: !currentIndentStatus,
              indentETA: newETA
          };

          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          await updateDoc(jobRef, {
              'estimateData.partItems': updatedParts
          });

          setSelectedJob(prev => prev ? ({
              ...prev,
              estimateData: {
                  ...prev.estimateData!,
                  partItems: updatedParts
              }
          }) : null);

      } catch (e) {
          console.error("Failed to update indent status", e);
          alert("Gagal update status.");
      } finally {
          setIsUpdating(false);
      }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Monitoring Part WO</h1>
                <p className="text-gray-500 mt-1">Status ketersediaan part dengan alokasi stok (First-In-First-Out).</p>
            </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            <div 
                onClick={() => setStatusFilter('ALL')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${statusFilter === 'ALL' ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
            >
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Total Antrian</span>
                    <Package size={16} className="text-indigo-400"/>
                </div>
                <div className="text-2xl font-black text-gray-900">{stats.total}</div>
            </div>

            <div 
                onClick={() => setStatusFilter('NEED_ORDER')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${statusFilter === 'NEED_ORDER' ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
            >
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-amber-600 uppercase">Perlu Order (PO)</span>
                    <ShoppingCart size={16} className="text-amber-500"/>
                </div>
                <div className="text-2xl font-black text-amber-700">{stats.needOrder}</div>
                <p className="text-[10px] text-amber-600 font-bold mt-1">Outstanding Pekerjaan</p>
            </div>

            <div 
                onClick={() => setStatusFilter('LENGKAP')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${statusFilter === 'LENGKAP' ? 'bg-green-50 border-green-300 ring-1 ring-green-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
            >
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-green-700 uppercase">Part Lengkap</span>
                    <CheckCircle size={16} className="text-green-500"/>
                </div>
                <div className="text-2xl font-black text-green-800">{stats.lengkap}</div>
                <p className="text-[10px] text-green-600 font-bold mt-1">Siap Produksi</p>
            </div>

            <div 
                onClick={() => setStatusFilter('PARTIAL')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${statusFilter === 'PARTIAL' ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
            >
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-blue-700 uppercase">Partial</span>
                    <Clock size={16} className="text-blue-500"/>
                </div>
                <div className="text-2xl font-black text-blue-800">{stats.partial}</div>
                <p className="text-[10px] text-blue-600 font-bold mt-1">Proses Sebagian</p>
            </div>

            <div 
                onClick={() => setStatusFilter('INDENT')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${statusFilter === 'INDENT' ? 'bg-red-50 border-red-300 ring-1 ring-red-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
            >
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-red-700 uppercase">Kosong</span>
                    <AlertTriangle size={16} className="text-red-500"/>
                </div>
                <div className="text-2xl font-black text-red-800">{stats.indent}</div>
                <p className="text-[10px] text-red-600 font-bold mt-1">Stok 0</p>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
                <Search className="text-gray-400" size={20}/>
                <input 
                    type="text" 
                    placeholder="Cari No. Polisi, WO, atau Pelanggan..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 text-gray-700 w-full placeholder-gray-400 font-medium"
                />
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-100 text-gray-500 uppercase font-black text-[10px] tracking-widest">
                        <tr>
                            <th className="px-6 py-4">Unit Info (Work Order)</th>
                            <th className="px-6 py-4">Tgl Masuk</th>
                            <th className="px-6 py-4">Status Ketersediaan</th>
                            <th className="px-6 py-4">Logistik (PO)</th>
                            <th className="px-6 py-4 text-center w-20">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {processedJobs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-20 text-gray-400 italic font-medium">
                                    Tidak ada data Work Order ditemukan.
                                </td>
                            </tr>
                        ) : (
                            processedJobs.map(job => (
                                <tr key={job.id} className="hover:bg-gray-50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-10 rounded-full ${job.partStatus === 'LENGKAP' ? 'bg-emerald-500' : job.partStatus === 'PARTIAL' ? 'bg-blue-500' : 'bg-red-500'}`}></div>
                                            <div>
                                                <div className="font-black text-gray-900 text-lg">{job.policeNumber}</div>
                                                <div className="text-[10px] text-indigo-600 font-black tracking-widest uppercase">{job.woNumber || 'NO-WO'}</div>
                                                <div className="text-xs text-gray-400 font-medium">{job.carModel} | {job.customerName}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 font-medium">
                                        {formatDateIndo(job.tanggalMasuk)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <div className="flex-grow bg-gray-100 rounded-full h-2.5 w-32 overflow-hidden border border-gray-200">
                                                <div 
                                                    className={`h-full rounded-full transition-all duration-500 ${job.partStatus === 'LENGKAP' ? 'bg-emerald-500' : job.partStatus === 'PARTIAL' ? 'bg-blue-500' : 'bg-rose-500'}`} 
                                                    style={{ width: `${(job.readyParts / job.totalParts) * 100}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-[11px] font-black text-gray-700">{job.readyParts}/{job.totalParts}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            {job.partStatus === 'LENGKAP' ? (
                                                <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 uppercase">Lengkap</span>
                                            ) : job.partStatus === 'PARTIAL' ? (
                                                <span className="text-[9px] font-black bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 uppercase">Sebagian</span>
                                            ) : (
                                                <span className="text-[9px] font-black bg-rose-50 text-rose-700 px-2 py-0.5 rounded border border-rose-200 uppercase">Belum Ada</span>
                                            )}
                                            {job.hasIndentConfirmed && (
                                                <span className="text-[9px] font-black bg-red-600 text-white px-2 py-0.5 rounded border border-red-700 uppercase animate-pulse">INDENT CONFIRMED</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {job.hasOutstandingOrder ? (
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5 text-amber-600">
                                                    <ShoppingCart size={14} className="animate-pulse"/>
                                                    <span className="text-[11px] font-black uppercase tracking-tighter">Perlu PO ({job.unOrderedCount})</span>
                                                </div>
                                                <p className="text-[9px] text-amber-500 font-bold">Segera buat Purchase Order</p>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-emerald-600">
                                                <CheckCircle2 size={14}/>
                                                <span className="text-[11px] font-black uppercase tracking-tighter">Order Berjalan</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button 
                                            onClick={() => setSelectedJob(job)}
                                            className="p-2.5 bg-white border border-gray-200 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all shadow-sm group-hover:scale-110 active:scale-95"
                                            title="Kelola Part"
                                        >
                                            <Eye size={18}/>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        <Modal 
            isOpen={!!selectedJob} 
            onClose={() => setSelectedJob(null)} 
            title={`Part Management Control - ${selectedJob?.policeNumber}`}
            maxWidth="max-w-5xl"
        >
            {selectedJob && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col gap-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Detail Pelanggan & WO</span>
                            <div className="flex items-center gap-2">
                                <span className="font-black text-gray-900 text-base">{selectedJob.woNumber}</span>
                                <span className="text-gray-300">|</span>
                                <span className="font-bold text-gray-600">{selectedJob.namaAsuransi}</span>
                            </div>
                            <span className="text-sm font-bold text-gray-500 uppercase leading-none mt-1">{selectedJob.customerName}</span>
                        </div>
                        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Pencapaian Stok</span>
                                <div className="text-2xl font-black text-indigo-700">{selectedJob.readyParts} / {selectedJob.totalParts} <span className="text-xs font-bold opacity-60 uppercase">Item Ready</span></div>
                            </div>
                            <div className="p-3 bg-white rounded-xl text-indigo-600 shadow-sm border border-indigo-200">
                                <Package size={24}/>
                            </div>
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                        <Info size={20} className="text-amber-600 shrink-0 mt-0.5"/>
                        <div className="text-xs text-amber-800 leading-relaxed font-bold">
                            Tugas Partman: <br/>
                            1. Periksa kolom <span className="text-indigo-600">Alokasi Stok</span> di bawah. <br/>
                            2. Jika tertulis <span className="text-emerald-600">DITERIMA (FISIK)</span>, barang sudah diterima dari supplier dan siap di-issued. <br/>
                            3. Gunakan tombol <span className="text-red-600 uppercase">Set Indent</span> jika barang perlu dipesan khusus.
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-800 text-white uppercase text-[10px] font-black tracking-widest">
                                <tr>
                                    <th className="p-4">No. Part / Nama</th>
                                    <th className="p-4 text-center">Qty</th>
                                    <th className="p-4">Status Order</th>
                                    <th className="p-4">Alokasi Stok (FIFO)</th>
                                    <th className="p-4 text-center">Aksi Partman</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {(processedJobs.find(j => j.id === selectedJob.id)?.detailedParts || []).map((part: any, idx: number) => {
                                    let statusBadge;
                                    let rowClass = 'bg-white';

                                    switch(part.allocationStatus) {
                                        case 'ARRIVED':
                                            statusBadge = <span className="text-emerald-600 font-black text-[10px] flex items-center gap-1 uppercase border border-emerald-100 bg-emerald-50 px-2 py-0.5 rounded shadow-sm"><Zap size={10} className="fill-emerald-600"/> DITERIMA (FISIK)</span>;
                                            break;
                                        case 'READY':
                                            statusBadge = <span className="text-blue-600 font-black text-[10px] flex items-center gap-1 uppercase border border-blue-100 bg-blue-50 px-2 py-0.5 rounded">READY GUDANG</span>;
                                            break;
                                        case 'INDENT_MANUAL':
                                            statusBadge = <span className="text-red-600 font-black text-[10px] flex items-center gap-1 uppercase border border-red-100 bg-red-50 px-2 py-0.5 rounded">INDENT SUPPLIER</span>;
                                            break;
                                        case 'WAITING':
                                            statusBadge = <span className="text-amber-600 font-black text-[10px] flex items-center gap-1 uppercase border border-amber-100 bg-amber-50 px-2 py-0.5 rounded">KOSONG</span>;
                                            break;
                                        default:
                                            statusBadge = <span className="text-gray-400">-</span>;
                                    }

                                    return (
                                        <tr key={idx} className={`${rowClass} transition-colors`}>
                                            <td className="p-4">
                                                <div className="font-black text-gray-900 leading-tight uppercase">{part.name}</div>
                                                <div className="text-[10px] font-mono text-gray-400 mt-0.5">{part.number || 'NO-PART'}</div>
                                            </td>
                                            <td className="p-4 text-center font-black text-gray-800">{part.qty}</td>
                                            <td className="p-4">
                                                {part.hasArrived ? (
                                                    <span className="text-[9px] font-black text-emerald-600 flex items-center gap-1 uppercase"><CheckCircle size={10}/> Diterima</span>
                                                ) : part.isOrdered ? (
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] font-black text-indigo-600 flex items-center gap-1 uppercase"><ShoppingCart size={10}/> Sudah di-PO</span>
                                                        {part.isIndent && <span className="text-[8px] text-red-500 font-black uppercase">Stok Indent</span>}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1 text-amber-600">
                                                        <AlertCircle size={10} className="animate-pulse"/>
                                                        <span className="text-[9px] font-black uppercase tracking-tighter">BELUM PO</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                {statusBadge}
                                            </td>
                                            <td className="p-4 text-center">
                                                {part.allocationStatus !== 'ISSUED' && (
                                                    <button 
                                                        disabled={isUpdating}
                                                        onClick={() => handleToggleIndent(idx, part.isIndent, part.indentETA)}
                                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border shadow-sm ${part.isIndent 
                                                            ? 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100' 
                                                            : 'bg-red-600 text-white border-red-700 hover:bg-red-700 hover:scale-105 active:scale-95'
                                                        }`}
                                                    >
                                                        {part.isIndent ? 'BATAL INDENT' : 'SET INDENT'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-gray-100">
                        <button 
                            onClick={() => setSelectedJob(null)}
                            className="px-8 py-3 bg-gray-100 text-gray-600 rounded-2xl hover:bg-gray-200 font-black transition-all active:scale-95"
                        >
                            TUTUP
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    </div>
  );
};

export default PartMonitoringView;
