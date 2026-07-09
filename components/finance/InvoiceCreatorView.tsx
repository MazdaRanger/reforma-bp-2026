import React, { useState, useEffect, useMemo } from 'react';
import { Job, Settings, UserPermissions } from '../../types';
import { formatCurrency, formatDateIndo, cleanObject, generateRandomId } from '../../utils/helpers';
import { generateInvoicePDF } from '../../utils/pdfGenerator';
import { doc, updateDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';

interface InvoiceCreatorViewProps {
  jobs: Job[];
  settings: Settings;
  showNotification: (msg: string, type: string) => void;
  userPermissions: UserPermissions;
}

const InvoiceCreatorView: React.FC<InvoiceCreatorViewProps> = ({ jobs, settings, showNotification, userPermissions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  
  // Editable State for Discounts
  const [discountJasa, setDiscountJasa] = useState(0);
  const [discountPart, setDiscountPart] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const isManager = userPermissions.role === 'Manager';

  const isJobReadyForInvoice = (job: Job) => {
      if (!job.woNumber || job.isDeleted) return false;
      const validStatuses = ['Quality Control', 'Finishing', 'Selesai', 'Selesai (Tunggu Pengambilan)'];
      const isStatusReady = validStatuses.includes(job.statusPekerjaan) || validStatuses.includes(job.statusKendaraan);
      return isStatusReady || job.isClosed || job.hasInvoice;
  };

  const eligibleWOs = useMemo(() => {
      const rawTerm = searchTerm.toUpperCase();
      const cleanTerm = rawTerm.replace(/\s/g, ''); 

      return jobs.filter(j => {
          if (!isJobReadyForInvoice(j)) return false;
          if (searchTerm === '') return true;
          const nopol = (j.policeNumber || '').toUpperCase().replace(/\s/g, '');
          const wo = (j.woNumber || '').toUpperCase().replace(/\s/g, '');
          const cust = (j.customerName || '').toUpperCase();
          return nopol.includes(cleanTerm) || wo.includes(cleanTerm) || cust.includes(rawTerm);
      });
  }, [jobs, searchTerm]);

  const validationWarnings = useMemo(() => {
      if (!selectedJob) return [];
      const warnings = [];
      const partItems = selectedJob.estimateData?.partItems || [];
      
      const allPartsIssued = partItems.every(p => p.hasArrived);
      const materialsIssued = selectedJob.usageLog?.some(l => l.category === 'material');
      const allSpklClosed = (selectedJob.spklItems || []).every(s => s.status === 'Closed');
      const hasPriceMismatch = partItems.some(p => p.isPriceMismatch);

      if (!allPartsIssued) warnings.push("Terdapat Sparepart yang belum Issued/Datang.");
      if (!materialsIssued) warnings.push("Belum ada record pemakaian Bahan (Material).");
      if (!allSpklClosed) warnings.push("Ada SPKL (Jasa Luar) yang belum Closed.");
      // CRITICAL BLOCKER
      if (hasPriceMismatch) warnings.push("CRITICAL: Terdapat selisih harga part (Mismatch) yang belum direview SA.");

      return warnings;
  }, [selectedJob]);

  const searchMatchesWIP = useMemo(() => {
      if (!searchTerm || eligibleWOs.length > 0) return false;
      const rawTerm = searchTerm.toUpperCase();
      const cleanTerm = rawTerm.replace(/\s/g, '');
      return jobs.some(j => {
          const nopol = (j.policeNumber || '').toUpperCase().replace(/\s/g, '');
          const wo = (j.woNumber || '').toUpperCase().replace(/\s/g, '');
          return !j.isDeleted && j.woNumber && !isJobReadyForInvoice(j) && (nopol.includes(cleanTerm) || wo.includes(cleanTerm));
      });
  }, [jobs, searchTerm, eligibleWOs]);

  const invoicesHistory = useMemo(() => {
      return jobs
        .filter(j => j.hasInvoice && !j.isDeleted)
        .sort((a, b) => {
            const tA = a.closedAt?.seconds || 0;
            const tB = b.closedAt?.seconds || 0;
            return tB - tA;
        });
  }, [jobs]);

  const wipUnits = useMemo(() => {
      return jobs
        .filter(j => !j.isClosed && j.woNumber && !j.isDeleted)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [jobs]);

  useEffect(() => {
      if (selectedJob && selectedJob.estimateData) {
          setDiscountJasa(selectedJob.estimateData.discountJasa || 0);
          setDiscountPart(selectedJob.estimateData.discountPart || 0);
      }
  }, [selectedJob]);

  const calculations = useMemo(() => {
      if (!selectedJob || !selectedJob.estimateData) return null;
      const jasaItems = selectedJob.estimateData.jasaItems || [];
      const partItems = selectedJob.estimateData.partItems || [];
      const subtotalJasa = jasaItems.reduce((acc, item) => acc + (item.price || 0), 0);
      const subtotalPart = partItems.reduce((acc, item) => acc + ((item.price || 0) * (item.qty || 1)), 0);
      const discJasaRp = (subtotalJasa * discountJasa) / 100;
      const discPartRp = (subtotalPart * discountPart) / 100;
      const totalJasaNet = subtotalJasa - discJasaRp;
      const totalPartNet = subtotalPart - discPartRp;
      const dpp = totalJasaNet + totalPartNet;
      const ppn = (dpp * settings.ppnPercentage) / 100;
      const grandTotal = dpp + ppn;
      return { subtotalJasa, subtotalPart, discJasaRp, discPartRp, dpp, ppn, grandTotal };
  }, [selectedJob, discountJasa, discountPart, settings.ppnPercentage]);

  const handleFinalizeAndPrint = async () => {
      if (!selectedJob || !calculations) return;
      
      const hasCriticalError = validationWarnings.some(w => w.includes("CRITICAL"));
      if (hasCriticalError) {
          alert(`BLOKIR SISTEM:\n\n${validationWarnings.find(w => w.includes("CRITICAL"))}\n\nHarap informasikan ke SA untuk melakukan 'Sync Harga' di menu Estimasi.`);
          return;
      }

      if (validationWarnings.length > 0) {
          if (!window.confirm(`PERINGATAN:\n${validationWarnings.join('\n')}\n\nApakah Anda yakin ingin tetap menerbitkan faktur?`)) return;
      }

      const isAlreadyInvoiced = selectedJob.hasInvoice;
      const confirmMsg = isAlreadyInvoiced 
        ? `Cetak ulang Salinan Faktur untuk ${selectedJob.policeNumber}?`
        : `Konfirmasi pembuatan Faktur untuk ${selectedJob.policeNumber}?\n\nTotal: ${formatCurrency(calculations.grandTotal)}\n\nWO akan dikunci setelah Faktur terbit.`;

      if (!window.confirm(confirmMsg)) return;

      setIsProcessing(true);
      try {
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          const updatePayload: any = {
              'estimateData.discountJasa': discountJasa,
              'estimateData.discountPart': discountPart,
              'estimateData.discountJasaAmount': calculations.discJasaRp,
              'estimateData.discountPartAmount': calculations.discPartRp,
              'estimateData.subtotalJasa': calculations.subtotalJasa,
              'estimateData.subtotalPart': calculations.subtotalPart,
              'estimateData.ppnAmount': calculations.ppn,
              'estimateData.grandTotal': calculations.grandTotal,
              'hargaJasa': calculations.subtotalJasa, 
              'hargaPart': calculations.subtotalPart,
              'hasInvoice': true 
          };

          let invoiceNumber = selectedJob.invoiceNumber;
          if (!isAlreadyInvoiced) {
              // GENERATE INVOICE ID: INV-YYMM-RRR (Sync)
              invoiceNumber = generateRandomId('INV');
              updatePayload.invoiceNumber = invoiceNumber;
          }

          await updateDoc(jobRef, cleanObject(updatePayload));

          const updatedJob = {
              ...selectedJob,
              hasInvoice: true,
              invoiceNumber: invoiceNumber,
              estimateData: {
                  ...selectedJob.estimateData!,
                  discountJasa,
                  discountPart,
                  discountJasaAmount: calculations.discJasaRp,
                  discountPartAmount: calculations.discPartRp,
                  subtotalJasa: calculations.subtotalJasa,
                  subtotalPart: calculations.subtotalPart,
                  ppnAmount: calculations.ppn,
                  grandTotal: calculations.grandTotal
              }
          };

          generateInvoicePDF(updatedJob, settings);
          showNotification(isAlreadyInvoiced ? "Salinan Faktur dicetak." : `Faktur #${invoiceNumber} berhasil diterbitkan.`, "success");
          
          if (!isAlreadyInvoiced) setSelectedJob(null); 

      } catch (e: any) {
          console.error(e);
          showNotification("Gagal menyimpan faktur: " + e.message, "error");
      } finally {
          setIsProcessing(false);
      }
  };

  const handleCancelInvoice = async () => {
      if (!selectedJob || !selectedJob.hasInvoice) return;
      if (!isManager) {
          alert("Akses Ditolak: Pembatalan faktur hanya dapat dilakukan oleh Manager.");
          return;
      }
      
      const reason = prompt("Masukkan alasan pembatalan faktur / revisi tagihan:");
      if (!reason) return;

      if (!window.confirm("PERINGATAN: Membatalkan faktur akan MEMBUKA KEMBALI status WO menjadi OPEN agar bisa diedit oleh SA.\n\nRiwayat pembayaran yang sudah ada TIDAK akan dihapus. Kasir hanya perlu menagihkan selisihnya nanti.\n\nLanjutkan pembatalan?")) return;

      setIsProcessing(true);
      try {
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          await updateDoc(jobRef, {
              hasInvoice: false,
              isClosed: false,
              statusKendaraan: 'Work In Progress', 
              statusPekerjaan: 'Finishing', 
              'estimateData.invoiceCancelReason': reason
          });
          
          showNotification("Faktur dibatalkan & WO dibuka kembali. Silakan info SA untuk revisi.", "success");
          setSelectedJob(null);
      } catch (e: any) {
          showNotification("Gagal membatalkan: " + e.message, "error");
      } finally {
          setIsProcessing(false);
      }
  };

  return (
    <div className="animate-fade-in pb-[48px]">
        {/* HEADER */}
        <div className="border-b border-hairline pb-[24px] mb-[48px]">
            <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">INVOICING</h1>
            <p className="text-[16px] text-mute font-normal mt-[18px]">Verifikasi Akhir Work Order & Cetak Dokumen Penagihan Resmi</p>
        </div>

        <div className="bg-canvas border border-hairline p-6 md:p-8 mb-[24px]">
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="Search Nopol, WO, atau Nama Customer..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium uppercase text-[14px] text-ink"
                />
                <span className="absolute right-4 top-4 text-[12px] font-medium text-mute uppercase tracking-widest">SEARCH</span>
            </div>
            
            {searchTerm && !selectedJob && (
                <div className="mt-4 space-y-2 max-h-60 overflow-y-auto animate-fade-in">
                    {eligibleWOs.map(job => {
                        const hasMismatch = (job.estimateData?.partItems || []).some(p => p.isPriceMismatch);
                        return (
                            <div 
                                key={job.id}
                                onClick={() => { setSelectedJob(job); setSearchTerm(''); }}
                                className={`p-4 border border-hairline cursor-pointer flex justify-between items-center transition-colors ${hasMismatch ? 'bg-soft-cloud hover:bg-mute/10' : 'bg-canvas hover:bg-soft-cloud'}`}
                            >
                                <div>
                                    <span className="text-[14px] font-medium text-ink">{job.woNumber}</span>
                                    <span className="mx-2 text-mute">|</span>
                                    <span className="text-[14px] font-medium text-ink">{job.policeNumber}</span>
                                    <div className="text-[12px] text-mute mt-1">{job.customerName} - {job.carModel}</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {job.hasInvoice && <span className="text-[10px] font-medium uppercase tracking-widest bg-ink text-canvas px-2 py-1">INVOICED</span>}
                                    {hasMismatch ? <span className="text-[10px] font-medium uppercase tracking-widest border border-ink text-ink px-2 py-1 animate-pulse">MISMATCH</span> : <span className="text-[10px] font-medium uppercase tracking-widest text-mute">READY</span>}
                                </div>
                            </div>
                        );
                    })}
                    
                    {searchMatchesWIP && (
                        <div className="p-4 bg-soft-cloud border border-hairline flex flex-col gap-2">
                            <p className="font-medium text-ink text-[14px] uppercase tracking-widest">Unit Belum Siap Faktur (Tahap Awal)</p>
                            <p className="text-[12px] text-mute">
                                Unit masih dalam proses awal pengerjaan.<br/>
                                Faktur hanya dapat dibuat jika status minimal Finishing, QC, atau Selesai.
                            </p>
                        </div>
                    )}

                    {!searchMatchesWIP && eligibleWOs.length === 0 && (
                        <p className="text-center text-mute py-4 text-[12px] uppercase tracking-widest">Pencarian tidak ditemukan.</p>
                    )}
                </div>
            )}
        </div>

        {!selectedJob && !searchTerm && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-[24px] animate-fade-in">
                <div className="bg-canvas border border-hairline flex flex-col h-[500px]">
                    <div className="p-6 bg-soft-cloud border-b border-hairline flex justify-between items-center">
                        <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">Monitor Produksi (WIP)</h3>
                        <span className="text-[10px] font-medium uppercase tracking-widest text-mute">{wipUnits.length} Unit Aktif</span>
                    </div>
                    <div className="overflow-x-auto flex-grow">
                        <table className="w-full text-left">
                            <thead className="bg-canvas text-mute font-medium uppercase tracking-widest text-[10px] border-b border-hairline sticky top-0">
                                <tr>
                                    <th className="px-6 py-4 font-normal">Unit</th>
                                    <th className="px-6 py-4 text-center font-normal">Part</th>
                                    <th className="px-6 py-4 text-center font-normal">Bahan</th>
                                    <th className="px-6 py-4 text-center font-normal">SPKL</th>
                                    <th className="px-6 py-4 text-center font-normal">Ready?</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-hairline">
                                {wipUnits.map(j => {
                                    const allPartsIssued = (j.estimateData?.partItems || []).every(p => p.hasArrived);
                                    const materialsIssued = j.usageLog?.some(l => l.category === 'material');
                                    const spklCount = (j.spklItems || []).length;
                                    const spklClosed = (j.spklItems || []).every(s => s.status === 'Closed');
                                    const isReady = isJobReadyForInvoice(j);
                                    const hasMismatch = (j.estimateData?.partItems || []).some(p => p.isPriceMismatch);

                                    return (
                                        <tr key={j.id} className="hover:bg-soft-cloud transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="text-[14px] font-medium text-ink">{j.policeNumber}</div>
                                                <div className="text-[10px] text-mute font-mono mt-1 uppercase tracking-widest">{j.woNumber} | {j.customerName.split(' ')[0]}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center text-[10px] font-medium uppercase tracking-widest">
                                                {hasMismatch ? (
                                                    <span className="text-ink border border-ink px-1 py-0.5 animate-pulse">ERR</span>
                                                ) : allPartsIssued ? (
                                                    <span className="text-mute">OK</span>
                                                ) : (
                                                    <span className="text-mute opacity-50">NO</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center text-[10px] font-medium uppercase tracking-widest text-mute">
                                                {materialsIssued ? 'OK' : <span className="opacity-50">NO</span>}
                                            </td>
                                            <td className="px-6 py-4 text-center text-[10px] font-medium uppercase tracking-widest text-mute">
                                                {spklCount > 0 ? (
                                                    spklClosed ? 'OK' : <span className="opacity-50">NO</span>
                                                ) : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {isReady ? (
                                                    <span className="text-[9px] font-medium uppercase tracking-widest text-ink border border-ink px-2 py-1">READY</span>
                                                ) : (
                                                    <span className="text-[9px] font-medium uppercase tracking-widest text-mute">NOT YET</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {wipUnits.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-mute text-[12px] uppercase tracking-widest">Tidak ada unit WIP.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-canvas border border-hairline flex flex-col h-[500px]">
                    <div className="p-6 bg-soft-cloud border-b border-hairline flex justify-between items-center">
                        <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">Riwayat Faktur</h3>
                        <span className="text-[10px] font-medium uppercase tracking-widest text-mute">{invoicesHistory.length} Record</span>
                    </div>
                    <div className="overflow-x-auto flex-grow">
                        <table className="w-full text-left">
                            <thead className="bg-canvas text-mute font-medium uppercase tracking-widest text-[10px] border-b border-hairline sticky top-0">
                                <tr>
                                    <th className="px-6 py-4 font-normal">No. Invoice (WO)</th>
                                    <th className="px-6 py-4 font-normal">Pelanggan</th>
                                    <th className="px-6 py-4 text-right font-normal">Total</th>
                                    <th className="px-6 py-4 text-center font-normal">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-hairline">
                                {invoicesHistory.map((job) => (
                                    <tr key={job.id} className="hover:bg-soft-cloud transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="text-[14px] font-medium text-ink">{job.invoiceNumber || job.woNumber}</div>
                                            <div className="text-[10px] text-mute uppercase tracking-widest mt-1">{formatDateIndo(job.closedAt)}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-[14px] font-medium text-ink">{job.customerName.split(' ')[0]}</div>
                                            <div className="text-[10px] text-mute mt-1">{job.policeNumber}</div>
                                        </td>
                                        <td className="px-6 py-4 text-right text-[14px] font-medium text-ink">
                                            {formatCurrency(job.estimateData?.grandTotal)}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button 
                                                onClick={() => setSelectedJob(job)} 
                                                className="text-[10px] font-medium uppercase tracking-widest text-ink border border-ink px-3 py-1 hover:bg-ink hover:text-canvas transition-colors"
                                            >
                                                VIEW
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {invoicesHistory.length === 0 && (
                                    <tr><td colSpan={4} className="text-center py-12 text-mute text-[12px] uppercase tracking-widest">Belum ada faktur.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {selectedJob && calculations && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-[24px] animate-fade-in">
                <div className="lg:col-span-2 space-y-[24px]">
                    <div className="bg-canvas border border-hairline">
                        <div className="bg-soft-cloud px-6 md:px-8 py-6 border-b border-hairline flex justify-between items-center">
                            <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">DETAIL PEKERJAAN</h3>
                            <div className="flex items-center gap-2">
                                {selectedJob.hasInvoice && <span className="text-[10px] font-medium uppercase tracking-widest bg-ink text-canvas px-2 py-1">{selectedJob.invoiceNumber || 'INVOICED'}</span>}
                                <span className="text-[10px] font-medium uppercase tracking-widest border border-ink text-ink px-2 py-1">{selectedJob.woNumber}</span>
                            </div>
                        </div>
                        <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8 text-[14px]">
                            <div>
                                <div className="text-[10px] font-medium text-mute uppercase tracking-widest mb-4 border-b border-hairline pb-2">Pelanggan</div>
                                <p className="font-display text-[24px] text-ink uppercase mb-2">{selectedJob.customerName}</p>
                                <p className="text-mute">{selectedJob.customerAddress}</p>
                                <p className="text-mute">{selectedJob.customerPhone}</p>
                                <p className="mt-4 text-ink font-medium uppercase tracking-widest text-[12px] border border-ink px-2 py-1 inline-block">{selectedJob.namaAsuransi}</p>
                            </div>
                            <div className="md:text-right">
                                <div className="text-[10px] font-medium text-mute uppercase tracking-widest mb-4 border-b border-hairline pb-2 md:text-right">Kendaraan</div>
                                <p className="font-display text-[24px] text-ink uppercase mb-2">{selectedJob.policeNumber}</p>
                                <p className="text-mute">{selectedJob.carBrand} {selectedJob.carModel}</p>
                                <p className="text-mute">{selectedJob.warnaMobil}</p>
                                <p className="mt-4 text-mute font-mono text-[10px] uppercase tracking-widest">VIN: {selectedJob.nomorRangka || '-'}</p>
                            </div>
                        </div>
                        
                        {(selectedJob.spklItems || []).length > 0 && (
                            <div className="border-t border-hairline bg-soft-cloud">
                                <div className="px-6 md:px-8 py-4 flex justify-between items-center">
                                    <span className="text-[10px] font-medium text-ink uppercase tracking-widest">Biaya Pekerjaan Luar (SPKL)</span>
                                    <span className="text-[14px] font-medium text-ink">{formatCurrency((selectedJob.spklItems || []).reduce((acc, i) => acc + i.cost, 0))}</span>
                                </div>
                            </div>
                        )}
                        
                        <div className="border-t border-hairline">
                            <div className="px-6 md:px-8 py-4 bg-soft-cloud text-[10px] font-medium text-mute uppercase tracking-widest border-b border-hairline">Jasa Perbaikan</div>
                            <table className="w-full text-[14px]">
                                <tbody className="divide-y divide-hairline">
                                    {(selectedJob.estimateData?.jasaItems || []).map((item, idx) => (
                                        <tr key={idx} className="hover:bg-soft-cloud transition-colors">
                                            <td className="px-6 md:px-8 py-4 text-ink">{item.name}</td>
                                            <td className="px-6 md:px-8 py-4 text-right font-medium text-ink">{formatCurrency(item.price)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="border-t border-hairline">
                            <div className="px-6 md:px-8 py-4 bg-soft-cloud text-[10px] font-medium text-mute uppercase tracking-widest border-b border-hairline">Sparepart & Bahan</div>
                            <table className="w-full text-[14px]">
                                <tbody className="divide-y divide-hairline">
                                    {(selectedJob.estimateData?.partItems || []).map((item, idx) => (
                                        <tr key={idx} className={`hover:bg-soft-cloud transition-colors ${item.isPriceMismatch ? 'bg-soft-cloud/50' : ''}`}>
                                            <td className="px-6 md:px-8 py-4">
                                                <div className="text-ink">{item.name}</div>
                                                <div className="text-[10px] text-mute font-mono uppercase tracking-widest mt-1">{item.number}</div>
                                                {item.isPriceMismatch && <div className="text-[10px] font-medium text-ink border border-ink inline-block px-1 py-0.5 mt-2 uppercase tracking-widest">MISMATCH DETECTED</div>}
                                            </td>
                                            <td className="px-6 md:px-8 py-4 text-center text-mute">{item.qty}x</td>
                                            <td className="px-6 md:px-8 py-4 text-right font-medium text-ink">{formatCurrency((item.price||0) * (item.qty||1))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="space-y-[24px]">
                    <div className="bg-canvas border border-hairline p-6 md:p-8">
                        <h3 className="font-medium text-ink uppercase tracking-widest text-[16px] mb-8 border-b border-hairline pb-4">KALKULASI BIAYA</h3>
                        
                        <div className="space-y-4 text-[14px]">
                            <div className="flex justify-between text-mute">
                                <span>Total Jasa</span>
                                <span className="font-medium text-ink">{formatCurrency(calculations.subtotalJasa)}</span>
                            </div>
                            
                            <div className="flex justify-between items-center bg-soft-cloud p-3 border border-hairline">
                                <span className="text-ink font-medium uppercase tracking-widest text-[12px]">Disc Jasa (%)</span>
                                <input 
                                    disabled={selectedJob.hasInvoice}
                                    type="number" min="0" max="100" 
                                    className="w-20 p-2 text-right text-[14px] font-medium border border-hairline rounded-none bg-canvas text-ink focus:outline-none focus:border-ink disabled:bg-soft-cloud"
                                    value={discountJasa}
                                    onChange={e => setDiscountJasa(Number(e.target.value))}
                                />
                            </div>
                            
                            <div className="flex justify-between text-mute mt-4">
                                <span>Total Sparepart</span>
                                <span className="font-medium text-ink">{formatCurrency(calculations.subtotalPart)}</span>
                            </div>
                            
                            <div className="flex justify-between items-center bg-soft-cloud p-3 border border-hairline">
                                <span className="text-ink font-medium uppercase tracking-widest text-[12px]">Disc Part (%)</span>
                                <input 
                                    disabled={selectedJob.hasInvoice}
                                    type="number" min="0" max="100" 
                                    className="w-20 p-2 text-right text-[14px] font-medium border border-hairline rounded-none bg-canvas text-ink focus:outline-none focus:border-ink disabled:bg-soft-cloud"
                                    value={discountPart}
                                    onChange={e => setDiscountPart(Number(e.target.value))}
                                />
                            </div>

                            <div className="border-t border-hairline pt-6 mt-6">
                                <div className="flex justify-between text-mute mb-2">
                                    <span>DPP (Dasar Pengenaan Pajak)</span>
                                    <span className="text-ink">{formatCurrency(calculations.dpp)}</span>
                                </div>
                                <div className="flex justify-between text-mute">
                                    <span>PPN ({settings.ppnPercentage}%)</span>
                                    <span className="text-ink">{formatCurrency(calculations.ppn)}</span>
                                </div>
                            </div>

                            <div className="bg-ink p-6 mt-8 flex flex-col justify-between">
                                <p className="text-[10px] font-medium text-soft-cloud uppercase tracking-widest mb-4 border-b border-soft-cloud/20 pb-4">Grand Total Invoice</p>
                                <div>
                                    <h2 className="text-[32px] font-display text-canvas leading-none">{formatCurrency(calculations.grandTotal)}</h2>
                                </div>
                            </div>
                        </div>

                        {validationWarnings.some(w => w.includes("CRITICAL")) && (
                            <div className="mt-6 p-4 bg-canvas border border-ink text-ink text-[12px] font-medium uppercase tracking-widest text-center animate-pulse">
                                FAKTUR DIBLOKIR: Terdapat selisih harga part yang belum direview SA.
                            </div>
                        )}

                        <div className="mt-8 pt-6 border-t border-hairline flex flex-col gap-4">
                            <button 
                                onClick={handleFinalizeAndPrint}
                                disabled={isProcessing}
                                className={`w-full py-4 text-[14px] font-medium uppercase tracking-widest transition-colors ${selectedJob.hasInvoice ? 'bg-canvas text-ink border border-ink hover:bg-soft-cloud' : 'bg-ink text-canvas hover:bg-mute'} disabled:opacity-50`}
                            >
                                {isProcessing ? 'PROCESSING...' : selectedJob.hasInvoice ? 'CETAK SALINAN (COPY)' : 'SIMPAN & CETAK FAKTUR'}
                            </button>
                            
                            {selectedJob.hasInvoice && (
                                <button 
                                    onClick={handleCancelInvoice}
                                    disabled={isProcessing || !isManager}
                                    className="w-full py-4 text-[12px] font-medium uppercase tracking-widest border border-hairline text-mute hover:bg-soft-cloud transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                                >
                                    BATALKAN FAKTUR & BUKA WO
                                </button>
                            )}
                            
                            <button 
                                onClick={() => setSelectedJob(null)} 
                                disabled={isProcessing} 
                                className="w-full py-4 text-[12px] font-medium uppercase tracking-widest text-mute hover:text-ink transition-colors"
                            >
                                CANCEL / GANTI UNIT
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default InvoiceCreatorView;
