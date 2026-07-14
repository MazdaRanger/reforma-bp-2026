import React, { useState, useMemo } from 'react';
import { Job, InventoryItem, EstimateItem } from '../../types';
import { formatDateIndo, formatCurrency } from '../../utils/helpers';
import Modal from '../ui/Modal';
import { doc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';

interface PartMonitoringViewProps {
  jobs: Job[];
  inventoryItems: InventoryItem[];
  onNavigateToPO?: (jobId: string) => void;
}

const PartMonitoringView: React.FC<PartMonitoringViewProps> = ({ jobs, inventoryItems, onNavigateToPO }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LENGKAP' | 'PARTIAL' | 'INDENT' | 'NEED_ORDER' | 'ON_ORDER'>('ALL');
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const processedJobs = useMemo<any[]>(() => {
    const activeJobs = jobs.filter(j => 
        !j.isClosed && 
        j.woNumber && 
        !j.isDeleted &&
        j.estimateData?.partItems && 
        j.estimateData.partItems.length > 0
    );

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

    const stockMap: Record<string, number> = {};
    inventoryItems.forEach(item => {
        stockMap[item.id] = item.stock;
    });

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

            if (part.hasArrived) {
                status = 'ARRIVED';
                if (part.inventoryId && stockMap[part.inventoryId]) {
                    stockMap[part.inventoryId] -= reqQty;
                }
                readyCount++;
            }
            else if (part.inventoryId && stockMap[part.inventoryId] >= reqQty) {
                status = 'READY';
                stockMap[part.inventoryId] -= reqQty;
                readyCount++;
            }
            else if (part.isIndent) {
                status = 'INDENT_MANUAL';
            }
            else {
                status = 'WAITING';
            }

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
            (statusFilter === 'NEED_ORDER' ? job.hasOutstandingOrder : 
             statusFilter === 'ON_ORDER' ? (!job.hasOutstandingOrder && job.partStatus !== 'LENGKAP' && job.detailedParts.some((p:any) => p.isOrdered && !p.hasArrived)) :
             job.partStatus === statusFilter);

        return matchesSearch && matchesStatus;
    });
  }, [jobs, inventoryItems, searchTerm, statusFilter]);

  const stats = useMemo(() => {
      const lengkap = processedJobs.filter(j => j.partStatus === 'LENGKAP').length;
      const partial = processedJobs.filter(j => j.partStatus === 'PARTIAL').length;
      const indent = processedJobs.filter(j => j.partStatus === 'INDENT').length;
      const needOrder = processedJobs.filter(j => j.hasOutstandingOrder).length;
      const onOrder = processedJobs.filter(j => !j.hasOutstandingOrder && j.partStatus !== 'LENGKAP' && j.detailedParts.some((p:any) => p.isOrdered && !p.hasArrived)).length;
      return { total: processedJobs.length, lengkap, partial, indent, needOrder, onOrder };
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

  const handleSwitchPart = async (idx: number, part: any) => {
      const targetPoliceNo = prompt("Masukkan No. Polisi tujuan (Urgent) untuk mengalihkan part ini:");
      if (!targetPoliceNo) return;

      const targetJob = jobs.find(j => 
          j.policeNumber.toUpperCase() === targetPoliceNo.toUpperCase() &&
          !j.isClosed && !j.isDeleted
      );

      if (!targetJob) { alert("Unit tujuan tidak ditemukan atau sudah selesai."); return; }

      const targetPartIndex = targetJob.estimateData?.partItems?.findIndex((p: any) => 
          (p.number && p.number.toUpperCase() === part.number.toUpperCase()) || 
          (p.inventoryId && p.inventoryId === part.inventoryId)
      );

      if (targetPartIndex === undefined || targetPartIndex === -1) { alert("Unit tujuan tidak membutuhkan part ini di estimasinya."); return; }

      const targetPart = targetJob.estimateData!.partItems![targetPartIndex];
      if (targetPart.hasArrived) { alert("Unit tujuan sudah memiliki part ini (Lengkap)."); return; }
      
      const invItem = inventoryItems.find(i => i.id === part.inventoryId);
      if (invItem && targetPart.price < invItem.buyPrice) {
          alert(`BLOKIR: Harga estimasi pada unit tujuan (${formatCurrency(targetPart.price)}) lebih rendah dari harga modal/beli (${formatCurrency(invItem.buyPrice)}). Harap revisi estimasi unit tujuan terlebih dahulu!`);
          return;
      }

      if (!confirm(`Yakin ingin mengalihkan part ini ke ${targetJob.policeNumber}? Status PO akan diswap otomatis.`)) return;

      setIsUpdating(true);
      try {
          const batch = writeBatch(db);
          
          const sourceParts = [...selectedJob.estimateData.partItems];
          sourceParts[idx].hasArrived = targetPart.hasArrived || false;
          sourceParts[idx].isOrdered = targetPart.isOrdered || false;
          
          batch.update(doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id), { 'estimateData.partItems': sourceParts, updatedAt: serverTimestamp() });

          const targetParts = [...targetJob.estimateData!.partItems!];
          targetParts[targetPartIndex].hasArrived = true;
          targetParts[targetPartIndex].inventoryId = part.inventoryId;
          
          batch.update(doc(db, SERVICE_JOBS_COLLECTION, targetJob.id), { 'estimateData.partItems': targetParts, updatedAt: serverTimestamp() });

          await batch.commit();
          
          setSelectedJob((prev: any) => prev ? { ...prev, estimateData: { ...prev.estimateData!, partItems: sourceParts } } : null);
          alert("Berhasil mengalihkan part.");
      } catch (e) {
          console.error(e); alert("Gagal mengalihkan part.");
      } finally {
          setIsUpdating(false);
      }
  };

  return (
    <div className="animate-fade-in pb-[48px]">
        {/* HEADER */}
        <div className="border-b border-hairline pb-[24px] mb-[48px]">
            <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">MONITORING PART WO</h1>
            <p className="text-[16px] text-mute font-normal mt-[18px] uppercase tracking-widest">
                STATUS KETERSEDIAAN PART DENGAN ALOKASI STOK (FIRST-IN-FIRST-OUT).
            </p>
        </div>

        {/* STATS & FILTERS */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-[16px] mb-[48px]">
            <div 
                onClick={() => setStatusFilter('ALL')}
                className={`p-6 border cursor-pointer transition-colors ${statusFilter === 'ALL' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-ink border-hairline hover:bg-soft-cloud'}`}
            >
                <div className="text-[10px] font-medium uppercase tracking-widest mb-4">TOTAL ANTRIAN</div>
                <div className="text-[48px] font-display leading-none">{stats.total}</div>
            </div>

            <div 
                onClick={() => setStatusFilter('NEED_ORDER')}
                className={`p-6 border cursor-pointer transition-colors ${statusFilter === 'NEED_ORDER' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-ink border-hairline hover:bg-soft-cloud'}`}
            >
                <div className="text-[10px] font-medium uppercase tracking-widest mb-4">PERLU ORDER (PO)</div>
                <div className="text-[48px] font-display leading-none">{stats.needOrder}</div>
                <p className="text-[10px] font-medium uppercase tracking-widest mt-2 opacity-70">OUTSTANDING</p>
            </div>

            <div 
                onClick={() => setStatusFilter('ON_ORDER')}
                className={`p-6 border cursor-pointer transition-colors ${statusFilter === 'ON_ORDER' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-ink border-hairline hover:bg-soft-cloud'}`}
            >
                <div className="text-[10px] font-medium uppercase tracking-widest mb-4">PO BERJALAN</div>
                <div className="text-[48px] font-display leading-none">{stats.onOrder}</div>
                <p className="text-[10px] font-medium uppercase tracking-widest mt-2 opacity-70">ON ORDER</p>
            </div>

            <div 
                onClick={() => setStatusFilter('LENGKAP')}
                className={`p-6 border cursor-pointer transition-colors ${statusFilter === 'LENGKAP' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-ink border-hairline hover:bg-soft-cloud'}`}
            >
                <div className="text-[10px] font-medium uppercase tracking-widest mb-4">PART LENGKAP</div>
                <div className="text-[48px] font-display leading-none">{stats.lengkap}</div>
                <p className="text-[10px] font-medium uppercase tracking-widest mt-2 opacity-70">SIAP PRODUKSI</p>
            </div>

            <div 
                onClick={() => setStatusFilter('PARTIAL')}
                className={`p-6 border cursor-pointer transition-colors ${statusFilter === 'PARTIAL' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-ink border-hairline hover:bg-soft-cloud'}`}
            >
                <div className="text-[10px] font-medium uppercase tracking-widest mb-4">PARTIAL</div>
                <div className="text-[48px] font-display leading-none">{stats.partial}</div>
                <p className="text-[10px] font-medium uppercase tracking-widest mt-2 opacity-70">PROSES SEBAGIAN</p>
            </div>

            <div 
                onClick={() => setStatusFilter('INDENT')}
                className={`p-6 border cursor-pointer transition-colors ${statusFilter === 'INDENT' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-ink border-hairline hover:bg-soft-cloud'}`}
            >
                <div className="text-[10px] font-medium uppercase tracking-widest mb-4">KOSONG (INDENT)</div>
                <div className="text-[48px] font-display leading-none">{stats.indent}</div>
                <p className="text-[10px] font-medium uppercase tracking-widest mt-2 opacity-70">STOK 0</p>
            </div>
        </div>

        {/* LIST */}
        <div className="bg-canvas border border-hairline flex flex-col rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-hairline bg-soft-cloud flex items-center gap-4">
                <input 
                    type="text" 
                    placeholder="CARI NO. POLISI, WO, ATAU PELANGGAN..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="flex-1 bg-canvas border border-hairline p-4 focus:outline-none focus:border-ink font-medium uppercase text-[14px] text-ink rounded-2xl overflow-hidden"
                />
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-canvas border-b border-hairline text-mute uppercase font-medium text-[10px] tracking-widest">
                        <tr>
                            <th className="px-6 py-4 font-normal">UNIT INFO (WO)</th>
                            <th className="px-6 py-4 font-normal">TGL MASUK</th>
                            <th className="px-6 py-4 font-normal">STATUS KETERSEDIAAN</th>
                            <th className="px-6 py-4 font-normal">LOGISTIK (PO)</th>
                            <th className="px-6 py-4 text-center font-normal">AKSI</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                        {processedJobs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-mute text-[12px] uppercase tracking-widest">
                                    TIDAK ADA DATA WORK ORDER DITEMUKAN.
                                </td>
                            </tr>
                        ) : (
                            processedJobs.map(job => (
                                <tr key={job.id} className="hover:bg-soft-cloud transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-4">
                                            <div className="font-display text-[24px] text-ink">{job.policeNumber}</div>
                                            <div className="text-[10px] border border-ink px-2 py-1 bg-canvas text-ink uppercase tracking-widest font-medium">
                                                {job.woNumber || 'NO-WO'}
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-mute uppercase tracking-widest mt-2">{job.carModel} | {job.customerName}</div>
                                    </td>
                                    <td className="px-6 py-4 text-[12px] font-medium text-mute uppercase tracking-widest">
                                        {formatDateIndo(job.tanggalMasuk)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="flex-grow bg-canvas rounded-none h-[8px] w-32 border border-hairline overflow-hidden">
                                                <div 
                                                    className={`h-full transition-all duration-500 ${job.partStatus === 'LENGKAP' ? 'bg-ink' : job.partStatus === 'PARTIAL' ? 'bg-mute' : 'bg-transparent'}`} 
                                                    style={{ width: `${(job.readyParts / job.totalParts) * 100}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-[10px] font-medium text-ink uppercase tracking-widest">{job.readyParts}/{job.totalParts}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {job.partStatus === 'LENGKAP' ? (
                                                <span className="text-[10px] font-medium bg-ink text-canvas px-2 py-1 border border-ink uppercase tracking-widest">LENGKAP</span>
                                            ) : job.partStatus === 'PARTIAL' ? (
                                                <span className="text-[10px] font-medium bg-canvas text-ink px-2 py-1 border border-ink uppercase tracking-widest">SEBAGIAN</span>
                                            ) : (
                                                <span className="text-[10px] font-medium bg-soft-cloud text-mute px-2 py-1 border border-hairline uppercase tracking-widest">BELUM ADA</span>
                                            )}
                                            {job.hasIndentConfirmed && (
                                                <span className="text-[10px] font-medium bg-canvas text-ink px-2 py-1 border border-ink uppercase tracking-widest animate-pulse">INDENT CONFIRMED</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {job.hasOutstandingOrder ? (
                                            <div className="flex flex-col gap-2">
                                                <div className="text-[10px] font-medium uppercase tracking-widest text-ink">
                                                    PERLU PO ({job.unOrderedCount})
                                                </div>
                                                {onNavigateToPO && (
                                                    <button
                                                        onClick={() => onNavigateToPO(job.id)}
                                                        className="self-start text-[10px] font-medium bg-ink text-canvas px-3 py-1 uppercase tracking-widest hover:bg-mute transition-colors"
                                                    >
                                                        BUAT PO →
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-[10px] font-medium uppercase tracking-widest text-mute">
                                                ORDER BERJALAN
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button 
                                            onClick={() => setSelectedJob(job)}
                                            className="px-4 py-2 border border-hairline hover:border-ink text-ink text-[10px] font-medium uppercase tracking-widest transition-colors"
                                        >
                                            KELOLA PART
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
            title={`PART MANAGEMENT - ${selectedJob?.policeNumber}`}
        >
            {selectedJob && (
                <div className="space-y-[24px]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
                        <div className="bg-canvas border border-hairline p-6 flex flex-col gap-2 rounded-2xl overflow-hidden">
                            <span className="text-[10px] font-medium text-mute uppercase tracking-widest">DETAIL PELANGGAN & WO</span>
                            <div className="flex items-center gap-4">
                                <span className="font-display text-[24px] text-ink">{selectedJob.woNumber}</span>
                                <span className="text-[12px] text-mute uppercase tracking-widest border border-hairline px-2 py-1">{selectedJob.namaAsuransi}</span>
                            </div>
                            <span className="text-[14px] font-medium text-ink uppercase tracking-widest">{selectedJob.customerName}</span>
                        </div>
                        <div className="bg-ink border border-ink p-6 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-medium text-mute uppercase tracking-widest text-canvas/70">PENCAPAIAN STOK</span>
                                <div className="text-[48px] font-display text-canvas leading-none mt-2">{selectedJob.readyParts} / {selectedJob.totalParts} <span className="text-[12px] font-medium opacity-70 uppercase tracking-widest ml-2">READY</span></div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-soft-cloud border border-hairline p-6">
                        <div className="text-[12px] text-ink leading-relaxed font-medium uppercase tracking-widest">
                            TUGAS PARTMAN: <br/><br/>
                            1. PERIKSA KOLOM [ALOKASI STOK] DI BAWAH. <br/>
                            2. JIKA TERTULIS [DITERIMA (FISIK)], BARANG SUDAH DITERIMA DARI SUPPLIER DAN SIAP DI-ISSUED. <br/>
                            3. GUNAKAN TOMBOL [SET INDENT] JIKA BARANG PERLU DIPESAN KHUSUS.
                        </div>
                    </div>

                    <div className="bg-canvas border border-hairline overflow-hidden rounded-2xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-canvas border-b border-hairline text-mute uppercase text-[10px] font-medium tracking-widest">
                                    <tr>
                                        <th className="px-6 py-4 font-normal">NO. PART / NAMA</th>
                                        <th className="px-6 py-4 text-center font-normal">QTY</th>
                                        <th className="px-6 py-4 font-normal">STATUS ORDER</th>
                                        <th className="px-6 py-4 font-normal">ALOKASI STOK (FIFO)</th>
                                        <th className="px-6 py-4 text-center font-normal">AKSI PARTMAN</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-hairline">
                                    {(processedJobs.find(j => j.id === selectedJob.id)?.detailedParts || []).map((part: any, idx: number) => {
                                        let statusBadge;

                                        switch(part.allocationStatus) {
                                            case 'ARRIVED':
                                                statusBadge = <span className="text-[10px] font-medium text-ink uppercase tracking-widest border border-ink bg-soft-cloud px-2 py-1">DITERIMA (FISIK)</span>;
                                                break;
                                            case 'READY':
                                                statusBadge = <span className="text-[10px] font-medium text-ink uppercase tracking-widest border border-ink px-2 py-1">READY GUDANG</span>;
                                                break;
                                            case 'INDENT_MANUAL':
                                                statusBadge = <span className="text-[10px] font-medium text-ink uppercase tracking-widest border border-ink px-2 py-1 animate-pulse">INDENT SUPPLIER</span>;
                                                break;
                                            case 'WAITING':
                                                statusBadge = <span className="text-[10px] font-medium text-mute uppercase tracking-widest border border-hairline px-2 py-1 bg-soft-cloud">KOSONG</span>;
                                                break;
                                            default:
                                                statusBadge = <span className="text-[10px] font-medium text-mute">-</span>;
                                        }

                                        return (
                                            <tr key={idx} className="hover:bg-soft-cloud transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-[14px] text-ink uppercase">{part.name}</div>
                                                    <div className="text-[10px] text-mute uppercase tracking-widest mt-1">{part.number || 'NO-PART'}</div>
                                                </td>
                                                <td className="px-6 py-4 text-center font-medium text-ink text-[14px]">{part.qty}</td>
                                                <td className="px-6 py-4">
                                                    {part.hasArrived ? (
                                                        <span className="text-[10px] font-medium text-ink uppercase tracking-widest border border-ink px-2 py-1 bg-soft-cloud">DITERIMA</span>
                                                    ) : part.isOrdered ? (
                                                        <div className="flex flex-col gap-2 items-start">
                                                            <span className="text-[10px] font-medium text-ink uppercase tracking-widest border border-hairline px-2 py-1">SUDAH DI-PO</span>
                                                            {part.isIndent && <span className="text-[10px] text-ink border border-ink px-2 py-1 font-medium uppercase tracking-widest">STOK INDENT</span>}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] font-medium text-mute uppercase tracking-widest">BELUM PO</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {statusBadge}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex flex-col gap-2">
                                                        {part.allocationStatus !== 'ISSUED' && (
                                                            <button 
                                                                disabled={isUpdating || part.hasArrived || part.allocationStatus === 'READY'}
                                                                onClick={() => handleToggleIndent(idx, part.isIndent, part.indentETA)}
                                                                className={`px-3 py-2 text-[10px] font-medium uppercase tracking-widest transition-colors border ${
                                                                    (part.hasArrived || part.allocationStatus === 'READY') ? 'bg-soft-cloud text-mute border-hairline cursor-not-allowed opacity-50' :
                                                                    part.isIndent 
                                                                        ? 'bg-canvas text-ink border-ink hover:bg-soft-cloud' 
                                                                        : 'bg-ink text-canvas border-ink hover:bg-mute'
                                                                }`}
                                                            >
                                                                {(part.hasArrived || part.allocationStatus === 'READY') ? 'SELESAI' : part.isIndent ? 'BATAL INDENT' : 'SET INDENT'}
                                                            </button>
                                                        )}
                                                        {(part.hasArrived || part.allocationStatus === 'READY') && (
                                                            <button 
                                                                disabled={isUpdating}
                                                                onClick={() => handleSwitchPart(idx, part)}
                                                                className="px-3 py-2 text-[10px] font-medium uppercase tracking-widest bg-canvas text-ink border border-ink hover:bg-soft-cloud transition-colors"
                                                                title="ALIHKAN PART INI KE UNIT LAIN (URGENT)"
                                                            >
                                                                ALIH PART
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-end pt-6 border-t border-hairline">
                        <button 
                            onClick={() => setSelectedJob(null)}
                            className="px-6 py-4 border border-ink text-ink text-[12px] font-medium uppercase tracking-widest hover:bg-soft-cloud transition-colors"
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
