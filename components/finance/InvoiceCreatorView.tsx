
import React, { useState, useEffect, useMemo } from 'react';
import { Job, Settings, UserPermissions } from '../../types';
import { formatCurrency, formatDateIndo, cleanObject, generateRandomId } from '../../utils/helpers';
import { generateInvoicePDF } from '../../utils/pdfGenerator';
import { doc, updateDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { FileCheck, Search, FileText, User, Car, Printer, Save, Calculator, AlertTriangle, CheckCircle, Clock, XCircle, RotateCcw, Box, Truck, Eye, ExternalLink } from 'lucide-react';

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
      // ... (Existing implementation remains unchanged)
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
    <div className="space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-600 rounded-xl shadow-sm text-white">
                    <FileCheck size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Pembuatan Faktur (Invoice)</h1>
                    <p className="text-sm text-gray-500 font-medium">Verifikasi Akhir Work Order & Cetak Dokumen Penagihan Resmi</p>
                </div>
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="relative mb-4">
                <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                <input 
                    type="text" 
                    placeholder="Cari Nopol, WO, atau Nama Customer..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium uppercase"
                />
            </div>
            
            {searchTerm && !selectedJob && (
                <div className="space-y-2 max-h-60 overflow-y-auto animate-fade-in">
                    {eligibleWOs.map(job => {
                        const hasMismatch = (job.estimateData?.partItems || []).some(p => p.isPriceMismatch);
                        return (
                            <div 
                                key={job.id}
                                onClick={() => { setSelectedJob(job); setSearchTerm(''); }}
                                className={`p-3 border rounded-lg cursor-pointer flex justify-between items-center transition-colors ${hasMismatch ? 'border-red-200 bg-red-50 hover:bg-red-100' : 'border-gray-100 hover:bg-indigo-50'}`}
                            >
                                <div>
                                    <span className="font-bold text-indigo-700">{job.woNumber}</span>
                                    <span className="mx-2 text-gray-300">|</span>
                                    <span className="font-bold text-gray-900">{job.policeNumber}</span>
                                    <div className="text-sm text-gray-500">{job.customerName} - {job.carModel}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {job.hasInvoice && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded border border-green-200">INVOICED</span>}
                                    {hasMismatch ? <AlertTriangle size={18} className="text-red-500 animate-pulse" /> : <CheckCircle size={18} className="text-indigo-400"/>}
                                </div>
                            </div>
                        );
                    })}
                    
                    {searchMatchesWIP && (
                        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-3">
                            <AlertTriangle className="text-orange-600 mt-1 shrink-0" size={20}/>
                            <div>
                                <p className="font-bold text-orange-800 text-sm">Unit Belum Siap Faktur (Tahap Awal)</p>
                                <p className="text-xs text-orange-700 mt-1">
                                    Unit masih dalam proses awal pengerjaan (Bongkar/Las/Dempul/Cat).<br/>
                                    Faktur hanya dapat dibuat jika status minimal <strong>Finishing, QC, atau Selesai</strong>.
                                </p>
                            </div>
                        </div>
                    )}

                    {!searchMatchesWIP && eligibleWOs.length === 0 && (
                        <p className="text-center text-gray-400 py-4 italic">Pencarian tidak ditemukan.</p>
                    )}
                </div>
            )}
        </div>

        {/* ... (Existing logic for !selectedJob && !searchTerm views) ... */}
        {!selectedJob && !searchTerm && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-fade-in">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <Truck size={18} className="text-blue-500"/> Monitor Produksi (WIP)
                        </h3>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold">{wipUnits.length} Unit Aktif</span>
                    </div>
                    <div className="overflow-x-auto max-h-[400px]">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 uppercase font-semibold text-[10px] sticky top-0">
                                <tr>
                                    <th className="px-4 py-3">Unit</th>
                                    <th className="px-4 py-3 text-center">Part</th>
                                    <th className="px-4 py-3 text-center">Bahan</th>
                                    <th className="px-4 py-3 text-center">SPKL</th>
                                    <th className="px-4 py-3 text-center">Ready?</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {wipUnits.map(j => {
                                    const allPartsIssued = (j.estimateData?.partItems || []).every(p => p.hasArrived);
                                    const materialsIssued = j.usageLog?.some(l => l.category === 'material');
                                    const spklCount = (j.spklItems || []).length;
                                    const spklClosed = (j.spklItems || []).every(s => s.status === 'Closed');
                                    const isReady = isJobReadyForInvoice(j);
                                    const hasMismatch = (j.estimateData?.partItems || []).some(p => p.isPriceMismatch);

                                    return (
                                        <tr key={j.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-gray-900">{j.policeNumber}</div>
                                                <div className="text-[10px] text-gray-500">{j.woNumber} | {j.customerName.split(' ')[0]}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {hasMismatch ? (
                                                    <AlertTriangle size={14} className="text-red-500 mx-auto animate-pulse" title="Price Mismatch Detected"/>
                                                ) : allPartsIssued ? (
                                                    <CheckCircle size={14} className="text-green-500 mx-auto"/>
                                                ) : (
                                                    <XCircle size={14} className="text-red-400 mx-auto"/>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {materialsIssued ? <CheckCircle size={14} className="text-green-500 mx-auto"/> : <XCircle size={14} className="text-red-400 mx-auto"/>}
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                {spklCount > 0 ? (
                                                    spklClosed ? <CheckCircle size={14} className="text-indigo-500 mx-auto"/> : <Clock size={14} className="text-orange-500 mx-auto"/>
                                                ) : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {isReady ? (
                                                    <span className="text-[9px] font-bold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">SIAP CLOSE</span>
                                                ) : (
                                                    <span className="text-[9px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">BELUM</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {wipUnits.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">Tidak ada unit WIP.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <Clock size={18} className="text-gray-500"/> Riwayat Faktur Terbit
                        </h3>
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-bold">{invoicesHistory.length} Record</span>
                    </div>
                    <div className="overflow-x-auto max-h-[400px]">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 uppercase font-semibold text-[10px] sticky top-0">
                                <tr>
                                    <th className="px-4 py-3">No. Invoice (WO)</th>
                                    <th className="px-4 py-3">Pelanggan</th>
                                    <th className="px-4 py-3 text-right">Total</th>
                                    <th className="px-4 py-3 text-center w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {invoicesHistory.map((job) => (
                                    <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-indigo-700">{job.invoiceNumber || job.woNumber}</div>
                                            <div className="text-[10px] text-gray-500">{formatDateIndo(job.closedAt)}</div>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-800">
                                            {job.customerName.split(' ')[0]}
                                            <div className="text-[10px] text-gray-500">{job.policeNumber}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                                            {formatCurrency(job.estimateData?.grandTotal)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button 
                                                onClick={() => setSelectedJob(job)} 
                                                className="p-1.5 bg-gray-100 hover:bg-indigo-100 rounded text-gray-600 hover:text-indigo-600 transition-colors"
                                            >
                                                <Eye size={16}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {invoicesHistory.length === 0 && (
                                    <tr><td colSpan={4} className="text-center py-8 text-gray-400 italic">Belum ada faktur.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {selectedJob && calculations && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2"><FileText size={18}/> Detail Pekerjaan</h3>
                            <div className="flex items-center gap-2">
                                {selectedJob.hasInvoice && <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded border border-green-200 flex items-center gap-1"><FileCheck size={12}/> {selectedJob.invoiceNumber || 'INVOICED'}</span>}
                                <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded border border-indigo-200">{selectedJob.woNumber}</span>
                            </div>
                        </div>
                        {/* ... (Job Details Section - unchanged) ... */}
                        <div className="p-6 grid grid-cols-2 gap-6 text-sm">
                            <div>
                                <div className="flex items-center gap-2 font-bold text-gray-500 mb-2"><User size={16}/> Pelanggan</div>
                                <p className="font-bold text-gray-900 text-lg">{selectedJob.customerName}</p>
                                <p className="text-gray-600">{selectedJob.customerAddress}</p>
                                <p className="text-gray-600">{selectedJob.customerPhone}</p>
                                <p className="mt-2 text-indigo-600 font-medium">{selectedJob.namaAsuransi}</p>
                            </div>
                            <div className="text-right">
                                <div className="flex items-center justify-end gap-2 font-bold text-gray-500 mb-2">Kendaraan <Car size={16}/></div>
                                <p className="font-bold text-gray-900 text-lg">{selectedJob.policeNumber}</p>
                                <p className="text-gray-600">{selectedJob.carBrand} {selectedJob.carModel}</p>
                                <p className="text-gray-600">{selectedJob.warnaMobil}</p>
                                <p className="mt-2 text-gray-500 font-mono text-xs">VIN: {selectedJob.nomorRangka || '-'}</p>
                            </div>
                        </div>
                        {(selectedJob.spklItems || []).length > 0 && (
                            <div className="border-t border-indigo-100 bg-indigo-50/30">
                                <div className="px-6 py-2 flex justify-between items-center">
                                    <span className="text-xs font-bold text-indigo-600 uppercase flex items-center gap-1"><ExternalLink size={12}/> Biaya Pekerjaan Luar (SPKL)</span>
                                    <span className="text-xs font-black text-indigo-700">{formatCurrency((selectedJob.spklItems || []).reduce((acc, i) => acc + i.cost, 0))}</span>
                                </div>
                            </div>
                        )}
                        <div className="border-t border-gray-100">
                            <div className="px-6 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase">Jasa Perbaikan</div>
                            <table className="w-full text-sm">
                                <tbody>
                                    {(selectedJob.estimateData?.jasaItems || []).map((item, idx) => (
                                        <tr key={idx} className="border-b border-gray-50 last:border-0">
                                            <td className="px-6 py-3 text-gray-700">{item.name}</td>
                                            <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(item.price)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="border-t border-gray-100">
                            <div className="px-6 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase">Sparepart & Bahan</div>
                            <table className="w-full text-sm">
                                <tbody>
                                    {(selectedJob.estimateData?.partItems || []).map((item, idx) => (
                                        <tr key={idx} className={`border-b border-gray-50 last:border-0 ${item.isPriceMismatch ? 'bg-red-50' : ''}`}>
                                            <td className="px-6 py-3 text-gray-700">
                                                <div>{item.name}</div>
                                                <div className="text-[10px] text-gray-400 font-mono">{item.number}</div>
                                                {item.isPriceMismatch && <div className="text-[10px] font-bold text-red-600 flex items-center gap-1 mt-1"><AlertTriangle size={10}/> MISMATCH DETECTED</div>}
                                            </td>
                                            <td className="px-6 py-3 text-center text-gray-600">{item.qty} x</td>
                                            <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency((item.price||0) * (item.qty||1))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        {/* ... (Existing calculation display) ... */}
                        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-6"><Calculator size={18} className="text-emerald-600"/> Kalkulasi Biaya</h3>
                        
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between text-gray-600">
                                <span>Total Jasa</span>
                                <span className="font-medium">{formatCurrency(calculations.subtotalJasa)}</span>
                            </div>
                            {/* ... Discounts ... */}
                            <div className="flex justify-between items-center bg-blue-50 p-2 rounded border border-blue-100">
                                <span className="text-blue-800 font-semibold">Disc Jasa (%)</span>
                                <input 
                                    disabled={selectedJob.hasInvoice}
                                    type="number" min="0" max="100" 
                                    className="w-16 p-1 text-right text-sm font-bold border border-blue-300 rounded text-blue-900 focus:ring-1 ring-blue-500 disabled:bg-gray-100"
                                    value={discountJasa}
                                    onChange={e => setDiscountJasa(Number(e.target.value))}
                                />
                            </div>
                            <div className="flex justify-between text-gray-600">
                                <span>Total Sparepart</span>
                                <span className="font-medium">{formatCurrency(calculations.subtotalPart)}</span>
                            </div>
                            <div className="flex justify-between items-center bg-orange-50 p-2 rounded border border-orange-100">
                                <span className="text-orange-800 font-semibold">Disc Part (%)</span>
                                <input 
                                    disabled={selectedJob.hasInvoice}
                                    type="number" min="0" max="100" 
                                    className="w-16 p-1 text-right text-sm font-bold border border-orange-300 rounded text-orange-900 focus:ring-1 ring-orange-500 disabled:bg-gray-100"
                                    value={discountPart}
                                    onChange={e => setDiscountPart(Number(e.target.value))}
                                />
                            </div>

                            <div className="border-t border-gray-200 pt-3 mt-4">
                                <div className="flex justify-between text-gray-700">
                                    <span>DPP (Dasar Pengenaan Pajak)</span>
                                    <span>{formatCurrency(calculations.dpp)}</span>
                                </div>
                                <div className="flex justify-between text-gray-700 mt-1">
                                    <span>PPN ({settings.ppnPercentage}%)</span>
                                    <span>{formatCurrency(calculations.ppn)}</span>
                                </div>
                            </div>

                            <div className="bg-gray-900 text-white p-4 rounded-lg mt-4 text-center">
                                <span className="block text-xs text-gray-400 uppercase tracking-wider">Grand Total Invoice</span>
                                <span className="block text-2xl font-bold mt-1">{formatCurrency(calculations.grandTotal)}</span>
                            </div>
                        </div>

                        {validationWarnings.some(w => w.includes("CRITICAL")) && (
                            <div className="mt-4 p-3 bg-red-100 text-red-700 text-xs font-bold rounded-lg border border-red-200 animate-pulse">
                                ⚠️ FAKTUR DIBLOKIR: Terdapat selisih harga part yang belum direview SA.
                            </div>
                        )}

                        <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
                            <button 
                                onClick={handleFinalizeAndPrint}
                                disabled={isProcessing}
                                className={`w-full flex items-center justify-center gap-2 text-white py-3 rounded-lg font-bold shadow-lg transition-all transform active:scale-95 disabled:opacity-70 ${selectedJob.hasInvoice ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                            >
                                {isProcessing ? 'Memproses...' : <><Printer size={20}/> {selectedJob.hasInvoice ? 'Cetak Salinan (Copy)' : 'Simpan & Cetak Faktur'}</>}
                            </button>
                            {selectedJob.hasInvoice && (
                                <button 
                                    onClick={handleCancelInvoice}
                                    disabled={isProcessing}
                                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold transition-all border ${isManager ? 'bg-red-100 text-red-600 border-red-200 hover:bg-red-200' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`}
                                    title={!isManager ? "Hanya Manager yang dapat membatalkan faktur" : ""}
                                >
                                    <XCircle size={18}/> Batalkan Faktur & Buka WO
                                </button>
                            )}
                            <button onClick={() => setSelectedJob(null)} disabled={isProcessing} className="w-full text-gray-500 font-medium text-sm hover:text-gray-700 py-2 flex items-center justify-center gap-1">
                                <RotateCcw size={14}/> Batalkan / Ganti Unit
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
