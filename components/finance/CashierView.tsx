import React, { useState, useEffect, useMemo } from 'react';
import { Job, CashierTransaction, UserPermissions, Settings } from '../../types';
import { collection, addDoc, getDocs, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, CASHIER_COLLECTION, SETTINGS_COLLECTION, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo, generateTransactionId, generateRandomId } from '../../utils/helpers';
import { generateGatePassPDF, generateReceiptPDF, generateInvoicePDF } from '../../utils/pdfGenerator';
import { initialSettingsState } from '../../utils/constants';

interface CashierViewProps {
  jobs: Job[];
  transactions: CashierTransaction[]; 
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
}

const CashierView: React.FC<CashierViewProps> = ({ jobs, transactions, userPermissions, showNotification }) => {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Settings>(initialSettingsState);

  // Form State
  const [trxType, setTrxType] = useState<'IN' | 'OUT'>('IN');
  const [category, setCategory] = useState('Pelunasan');
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Transfer' | 'EDC'>('Transfer');
  const [selectedBank, setSelectedBank] = useState('');
  const [notes, setNotes] = useState('');
  
  // WITHHOLDING TAX STATE
  const [hasWithholding, setHasWithholding] = useState(false);
  const [withholdingAmount, setWithholdingAmount] = useState<number | ''>('');
  const [taxCertificateNo, setTaxCertificateNo] = useState('');

  // WO Linking & Payment Calculation
  const [woSearch, setWoSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [paymentSummary, setPaymentSummary] = useState({ totalBill: 0, totalPaid: 0, remaining: 0 });
  
  // Gatepass Additions
  const [isRawatJalan, setIsRawatJalan] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
      try {
          const q = await getDocs(collection(db, SETTINGS_COLLECTION));
          if (!q.empty) {
              const data = q.docs[0].data() as Settings;
              setSettings(data);
              if (data.workshopBankAccounts && data.workshopBankAccounts.length > 0) {
                  const b = data.workshopBankAccounts[0];
                  setSelectedBank(`${b.bankName} - ${b.accountNumber}`);
              }
          }
      } catch (e) { console.error(e); }
  };

  const activeJobs = useMemo(() => {
      if (!woSearch) return [];
      const term = woSearch.toUpperCase();
      return jobs.filter(j => 
          (j.woNumber && j.woNumber.includes(term)) || 
          j.policeNumber.includes(term) ||
          j.customerName.toUpperCase().includes(term)
      ).slice(0, 15); 
  }, [jobs, woSearch]);

  const handleSelectJob = (job: Job) => {
      setSelectedJob(job);
      setWoSearch(job.woNumber || job.policeNumber);
      
      const totalBill = Math.floor(job.estimateData?.grandTotal || 0);
      
      const totalPaid = transactions
          .filter(t => t.refJobId === job.id && t.type === 'IN') 
          .reduce((acc, t) => acc + (t.amount || 0), 0);

      const remaining = Math.max(0, totalBill - totalPaid);

      setPaymentSummary({ totalBill, totalPaid, remaining });
      setAmount(remaining > 0 ? remaining : ''); 
      setWithholdingAmount('');
      setHasWithholding(false);

      if (totalPaid > 0) {
          setNotes(remaining > 0 ? `Pelunasan Kekurangan. Total: ${formatCurrency(totalBill)}` : `Lunas. Total Bill: ${formatCurrency(totalBill)}`);
      } else {
          setNotes(`Pembayaran Full Invoice ${job.woNumber}`);
      }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value.replace(/[^0-9]/g, '');
      if (rawValue) {
          setAmount(parseInt(rawValue, 10));
      } else {
          setAmount('');
      }
  };

  const handleWithholdingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value.replace(/[^0-9]/g, '');
      if (rawValue) {
          setWithholdingAmount(parseInt(rawValue, 10));
      } else {
          setWithholdingAmount('');
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!amount || amount <= 0) {
          showNotification("Jumlah uang tidak valid.", "error");
          return;
      }

      if ((category === 'Pelunasan' || category === 'Uang Muka') && !selectedJob) {
          showNotification("Mohon pilih Referensi WO untuk kategori pembayaran ini.", "error");
          return;
      }

      setLoading(true);
      try {
          // 1. Generate ID Transaksi Utama (BKK / BKM) - SYNCHRONOUS
          const transactionNumber = generateTransactionId(trxType, category);

          // 2. Create the Main Payment Transaction
          const newTrx: any = {
              date: serverTimestamp(),
              type: trxType,
              category,
              amount: Number(amount),
              paymentMethod,
              description: notes,
              transactionNumber: transactionNumber,
              createdBy: userPermissions.role || 'Staff',
              createdAt: serverTimestamp()
          };

          if (trxType === 'IN' && (paymentMethod === 'Transfer' || paymentMethod === 'EDC')) {
              if (!selectedBank) throw new Error("Mohon pilih Bank Penerima.");
              newTrx.bankName = selectedBank;
          }

          if (selectedJob) {
              newTrx.refNumber = selectedJob.woNumber;
              newTrx.refJobId = selectedJob.id;
              newTrx.customerName = selectedJob.customerName;
          } else {
              newTrx.customerName = category.includes('Kas Kecil') ? 'Internal / Bengkel' : 'Non-Customer / Umum';
          }

          await addDoc(collection(db, CASHIER_COLLECTION), newTrx);

          // Auto-generate Receipt PDF
          const pdfTrx = { ...newTrx, date: new Date() };
          generateReceiptPDF(pdfTrx, settings);

          // 3. Handle Withholding Tax (Customer deducts PPh 23)
          // This creates a TAX record (Bukti Potong)
          if (trxType === 'IN' && hasWithholding && withholdingAmount && Number(withholdingAmount) > 0) {
              
              // Generate ID for TAX Transaction - SYNCHRONOUS
              const taxTrxId = generateRandomId('TAX');

              const taxTrx: any = {
                  date: serverTimestamp(),
                  type: 'IN', // Recorded as IN because it reduces receivable, but physically it's a paper
                  category: 'Pajak (Bukti Potong PPh)',
                  amount: Number(withholdingAmount),
                  paymentMethod: 'Non-Tunai (Pajak)',
                  transactionNumber: taxTrxId,
                  description: `Potongan Pajak PPh oleh Pelanggan. Ref: ${newTrx.refNumber}`,
                  taxCertificateNumber: taxCertificateNo || 'PENDING',
                  createdBy: userPermissions.role || 'Staff',
                  createdAt: serverTimestamp(),
                  refJobId: selectedJob?.id,
                  refNumber: selectedJob?.woNumber,
                  customerName: selectedJob?.customerName
              };
              await addDoc(collection(db, CASHIER_COLLECTION), taxTrx);
              
              generateReceiptPDF({...taxTrx, date: new Date(), id: 'TEMP'} as any, settings);
          }
          
          showNotification(`Transaksi ${transactionNumber} berhasil disimpan.`, "success");
          
          setAmount('');
          setWithholdingAmount('');
          setHasWithholding(false);
          setTaxCertificateNo('');
          setNotes('');
          setSelectedJob(null);
          setWoSearch('');
          setPaymentSummary({ totalBill: 0, totalPaid: 0, remaining: 0 });

      } catch (e: any) {
          showNotification("Gagal menyimpan transaksi: " + e.message, "error");
      } finally {
          setLoading(false);
      }
  };

  const handlePrintGatePass = async () => {
      if (!selectedJob) {
          showNotification("Pilih unit/WO terlebih dahulu.", "error");
          return;
      }

      const bill = selectedJob.estimateData?.grandTotal || 0;
      const paid = transactions
          .filter(t => t.refJobId === selectedJob.id && t.type === 'IN')
          .reduce((acc, t) => acc + (t.amount || 0), 0);
      
      if (paid < bill - 1000) {
          if(!window.confirm(`Peringatan: Unit ini belum lunas. Sisa: ${formatCurrency(bill - paid)}. Tetap cetak Gate Pass?`)) {
              return;
          }
      }
      
      generateGatePassPDF(selectedJob, settings, userPermissions.role || 'Staff');

      try {
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          const updates: any = {
              statusKendaraan: 'Sudah Diambil Pemilik', 
              statusPekerjaan: 'Selesai', 
              posisiKendaraan: 'Di Pemilik', 
              crcFollowUpStatus: 'Pending', 
              isRawatJalan: isRawatJalan,
              updatedAt: serverTimestamp(),
              productionLogs: arrayUnion({
                  stage: 'Gate Pass',
                  timestamp: new Date().toISOString(),
                  user: userPermissions.role || 'Cashier',
                  type: 'progress',
                  note: `Unit Keluar (Gate Pass Printed) ${isRawatJalan ? '- RAWAT JALAN' : ''}`
              })
          };

          // --- PICKUP KPI LOGIC ---
          if (selectedJob.pickupPromiseDate) {
              const today = new Date().toISOString().split('T')[0];
              const promiseDate = selectedJob.pickupPromiseDate; 
              
              const isSuccess = today === promiseDate;
              updates.pickupSuccess = isSuccess;
              
              if (isSuccess) {
                  showNotification("✅ KPI CRC: Pengambilan Tepat Waktu (Success)", "success");
              } else {
                  showNotification(`⚠️ KPI CRC: Pengambilan Tidak Sesuai Janji (Janji: ${formatDateIndo(promiseDate)})`, "info");
              }
          }

          await updateDoc(jobRef, updates);
          
          showNotification("Gate Pass dicetak. Unit update ke 'Sudah Diambil'.", "success");
          setSelectedJob(null);
          setWoSearch('');
          setPaymentSummary({ totalBill: 0, totalPaid: 0, remaining: 0 });

      } catch (e: any) {
          showNotification("Gagal update status unit.", "error");
      }
  };

  const handlePrintInvoice = () => {
      if (!selectedJob) return;
      try {
        generateInvoicePDF(selectedJob, settings);
      } catch (e) {
        showNotification("Gagal mencetak Invoice.", "error");
      }
  };

  return (
    <div className="animate-fade-in pb-[48px]">
        {/* HEADER */}
        <div className="border-b border-hairline pb-[24px] mb-[48px]">
            <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">CASHIER</h1>
            <p className="text-[16px] text-mute font-normal mt-[18px]">Input BKM (Uang Masuk), BKK (Uang Keluar), & Pajak</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[24px]">
            {/* INPUT FORM */}
            <div className="lg:col-span-2 bg-canvas border border-hairline flex flex-col rounded-2xl overflow-hidden">
                <div className="p-6 md:p-8 border-b border-hairline flex flex-col md:flex-row justify-between items-start md:items-center bg-soft-cloud gap-4">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">TRANSACTION INPUT</h3>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => { setTrxType('IN'); setCategory('Pelunasan'); }}
                            className={`px-4 py-2 text-[12px] font-medium uppercase tracking-widest transition-colors border ${trxType === 'IN' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-mute border-hairline hover:text-ink'}`}
                        >
                            UANG MASUK
                        </button>
                        <button 
                            onClick={() => { setTrxType('OUT'); setCategory('Kas Kecil (Petty Cash)'); }}
                            className={`px-4 py-2 text-[12px] font-medium uppercase tracking-widest transition-colors border ${trxType === 'OUT' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-mute border-hairline hover:text-ink'}`}
                        >
                            UANG KELUAR
                        </button>
                    </div>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8 flex-grow flex flex-col justify-between">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Kategori Transaksi</label>
                                <select 
                                    value={category} 
                                    onChange={e => setCategory(e.target.value)} 
                                    className="w-full p-3 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px]"
                                >
                                    {trxType === 'IN' ? (
                                        <>
                                            <option value="Pelunasan">Pelunasan Service (Full Payment)</option>
                                            <option value="Uang Muka">Uang Muka (Down Payment)</option>
                                            <option value="Pengisian Kas Kecil">Pengisian Kas Kecil (Top Up)</option>
                                            <option value="Lainnya">Penerimaan Lainnya</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="Kas Kecil (Petty Cash)">Kas Kecil (Petty Cash)</option>
                                            <option value="Operasional">Biaya Operasional Besar</option>
                                            <option value="Refund">Refund Customer</option>
                                            <option value="Vendor">Pembayaran Vendor (Non-PO)</option>
                                            <option value="Pajak">Pembayaran Pajak (PPh/PPN)</option>
                                        </>
                                    )}
                                </select>
                            </div>

                            {(category === 'Pelunasan' || category === 'Uang Muka') && (
                                <div className="relative">
                                    <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Cari No. WO / Polisi</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            value={woSearch} 
                                            onChange={e => { setWoSearch(e.target.value); setSelectedJob(null); setPaymentSummary({ totalBill: 0, totalPaid: 0, remaining: 0 }); }}
                                            placeholder="Ketik Nopol atau WO..."
                                            className={`w-full p-3 border focus:outline-none font-mono text-[14px] uppercase ${selectedJob ? 'border-ink bg-ink text-canvas' : 'border-hairline focus:border-ink'}`}
                                        />
                                        {selectedJob && <span className="absolute right-3 top-3 text-[10px] bg-canvas text-ink px-1 py-0.5">SELECTED</span>}
                                    </div>
                                    
                                    {woSearch && !selectedJob && activeJobs.length > 0 && (
                                        <div className="absolute z-10 w-full bg-canvas border border-hairline mt-1 max-h-48 overflow-y-auto rounded-2xl overflow-hidden">
                                            {activeJobs.map(job => (
                                                <div 
                                                    key={job.id} 
                                                    onClick={() => handleSelectJob(job)}
                                                    className="p-3 hover:bg-soft-cloud cursor-pointer border-b border-hairline last:border-0"
                                                >
                                                    <div className="font-medium text-ink text-[14px]">{job.policeNumber}</div>
                                                    <div className="text-[12px] text-mute font-mono">{job.woNumber} - {job.customerName}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {selectedJob && (
                                <div className="bg-soft-cloud p-4 border border-hairline text-[14px] space-y-4">
                                    <h4 className="font-medium text-ink uppercase tracking-widest text-[12px] border-b border-hairline pb-2 mb-2">
                                        WO BILLING DETAIL
                                    </h4>
                                    <div className="flex justify-between">
                                        <span className="text-mute">Pelanggan:</span>
                                        <span className="font-medium text-ink truncate max-w-[150px]">{selectedJob.customerName}</span>
                                    </div>
                                    <div className="flex justify-between border-t border-hairline pt-2">
                                        <span className="text-mute">Total Tagihan (Revisi):</span>
                                        <span className="font-medium text-ink">{formatCurrency(paymentSummary.totalBill)}</span>
                                    </div>
                                    {paymentSummary.totalPaid > 0 && (
                                        <div className="flex justify-between bg-canvas p-2 border border-hairline rounded-2xl overflow-hidden">
                                            <span className="text-mute uppercase tracking-widest text-[10px]">PAID (HISTORI):</span>
                                            <span className="font-medium text-ink">-{formatCurrency(paymentSummary.totalPaid)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between border-t border-hairline pt-2 mt-1">
                                        <span className="text-ink font-medium uppercase tracking-widest text-[12px]">REMAINING:</span>
                                        <span className="font-display text-[20px] leading-none text-ink">{formatCurrency(paymentSummary.remaining)}</span>
                                    </div>
                                    
                                    <div className="pt-2 border-t border-hairline mt-2">
                                        <label className="flex items-start gap-2 cursor-pointer group">
                                            <input 
                                                type="checkbox" 
                                                checked={isRawatJalan}
                                                onChange={(e) => setIsRawatJalan(e.target.checked)}
                                                className="w-4 h-4 accent-ink mt-0.5"
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-medium text-ink uppercase tracking-widest group-hover:text-mute transition-colors">
                                                    Unit Keluar Rawat Jalan
                                                </span>
                                                <span className="text-[9px] text-mute leading-tight mt-0.5">
                                                    Centang ini jika unit diizinkan keluar tapi part/pekerjaan belum lengkap (Masih ada tanggungan bengkel).
                                                </span>
                                            </div>
                                        </label>
                                    </div>

                                    <div className="pt-4 border-t border-hairline flex gap-2">
                                        <button 
                                            type="button"
                                            onClick={handlePrintInvoice}
                                            className="flex-1 bg-canvas border border-ink text-ink py-2 text-[12px] font-medium uppercase tracking-widest hover:bg-ink hover:text-canvas transition-colors"
                                        >
                                            INVOICE
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={handlePrintGatePass}
                                            className="flex-1 bg-ink text-canvas py-2 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors"
                                        >
                                            GATEPASS
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">
                                    {selectedJob ? 'Nominal Dibayar' : 'Nominal (Rp)'}
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3.5 text-mute font-medium">Rp</span>
                                    <input 
                                        type="text" 
                                        required
                                        value={amount ? new Intl.NumberFormat('id-ID').format(amount) : ''} 
                                        onChange={handleAmountChange} 
                                        className="w-full pl-10 p-3 border border-hairline focus:outline-none focus:border-ink font-display text-[24px] text-right"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            {/* WITHHOLDING TAX SECTION */}
                            {trxType === 'IN' && selectedJob && (
                                <div className="p-4 bg-soft-cloud border border-hairline space-y-4">
                                    <label className="flex items-center gap-3 cursor-pointer select-none">
                                        <input 
                                            type="checkbox" 
                                            checked={hasWithholding} 
                                            onChange={e => setHasWithholding(e.target.checked)}
                                            className="w-4 h-4 accent-ink"
                                        />
                                        <span className="text-[12px] font-medium uppercase tracking-widest text-ink">Potongan Pajak (Bukti Potong)</span>
                                    </label>

                                    {hasWithholding && (
                                        <div className="space-y-4 animate-fade-in pt-4 border-t border-hairline">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">Pajak Dipotong (Rp)</label>
                                                    <input 
                                                        type="text" 
                                                        value={withholdingAmount ? new Intl.NumberFormat('id-ID').format(withholdingAmount) : ''} 
                                                        onChange={handleWithholdingChange}
                                                        className="w-full p-2 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium"
                                                        placeholder="20.000"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-medium text-mute uppercase tracking-widest mb-2">No. Bukti Potong</label>
                                                    <input 
                                                        type="text" 
                                                        value={taxCertificateNo} 
                                                        onChange={e => setTaxCertificateNo(e.target.value)}
                                                        className="w-full p-2 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-mono"
                                                        placeholder="BP-123XXX"
                                                    />
                                                </div>
                                            </div>
                                            <div className="text-[10px] font-medium text-mute bg-canvas p-2 border border-hairline uppercase tracking-widest rounded-2xl overflow-hidden">
                                                Total Pelunasan: {formatCurrency(Number(amount || 0) + Number(withholdingAmount || 0))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Metode Pembayaran</label>
                                <div className="flex gap-2">
                                    {['Cash', 'Transfer', 'EDC'].map(m => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setPaymentMethod(m as any)}
                                            className={`flex-1 py-3 text-[12px] uppercase tracking-widest font-medium border transition-colors ${paymentMethod === m ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-mute border-hairline hover:text-ink'}`}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {trxType === 'IN' && (paymentMethod === 'Transfer' || paymentMethod === 'EDC') && (
                                <div className="animate-fade-in">
                                    <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Bank Penerima</label>
                                    <select 
                                        value={selectedBank} 
                                        onChange={e => setSelectedBank(e.target.value)}
                                        className="w-full p-3 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium"
                                    >
                                        <option value="">-- Pilih Rekening --</option>
                                        {settings.workshopBankAccounts.map((bank, idx) => (
                                            <option key={idx} value={`${bank.bankName} - ${bank.accountNumber}`}>
                                                {bank.bankName} - {bank.accountNumber} ({bank.accountHolder})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Catatan</label>
                                <input 
                                    type="text" 
                                    value={notes} 
                                    onChange={e => setNotes(e.target.value)} 
                                    className="w-full p-3 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px]"
                                    placeholder="Opsional..."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-8 mt-4 border-t border-hairline">
                        <button 
                            type="submit" 
                            disabled={loading}
                            className={`w-full text-canvas py-4 uppercase tracking-widest text-[14px] font-medium transition-colors ${trxType === 'IN' ? 'bg-ink hover:bg-mute' : 'bg-ink hover:bg-mute'}`}
                        >
                            {loading ? 'PROCESSING...' : 'PROCESS TRANSACTION'}
                        </button>
                    </div>
                </form>
            </div>

            {/* RIWAYAT (REALTIME FROM PROPS) */}
            <div className="bg-canvas border border-hairline flex flex-col h-[700px] rounded-2xl overflow-hidden">
                <div className="p-6 bg-soft-cloud border-b border-hairline">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">TRANSACTION HISTORY</h3>
                </div>
                <div className="overflow-y-auto flex-grow p-0">
                    {transactions.length === 0 ? (
                        <div className="p-8 text-center text-mute text-[14px] uppercase tracking-widest mt-10">No transactions yet</div>
                    ) : (
                        <div className="divide-y divide-hairline">
                            {transactions.slice(0, 30).map(trx => (
                                <div key={trx.id} className="p-6 hover:bg-soft-cloud transition-colors group relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1">
                                            <p className={`text-[10px] font-medium uppercase tracking-widest ${trx.type === 'IN' ? 'text-ink' : 'text-mute'}`}>
                                                {trx.type === 'IN' ? 'IN' : 'OUT'} ({trx.paymentMethod})
                                            </p>
                                            <p className="font-medium text-ink text-[14px] mt-1">
                                                {trx.category} 
                                                {trx.bankName && <span className="text-mute ml-1">- {trx.bankName}</span>}
                                            </p>
                                            <span className="text-[10px] font-mono text-mute mt-1 block">{trx.transactionNumber || '-'}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className={`font-mono font-medium text-[14px] ${trx.type === 'IN' ? 'text-ink' : 'text-mute'}`}>
                                                {trx.type === 'IN' ? '+' : '-'}{formatCurrency(trx.amount)}
                                            </span>
                                            <p className="text-[10px] text-mute uppercase tracking-widest mt-1 block">{formatDateIndo(trx.date)}</p>
                                        </div>
                                    </div>
                                    <p className="text-[12px] text-mute truncate mt-2">
                                        {trx.customerName && <span className="font-medium text-ink">{trx.customerName} / </span>}
                                        {trx.description || '-'}
                                    </p>
                                    <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity bg-canvas">
                                        <button 
                                            onClick={() => generateReceiptPDF(trx, settings)}
                                            className="text-[10px] font-medium uppercase tracking-widest text-ink border border-ink px-3 py-1 hover:bg-ink hover:text-canvas transition-colors"
                                        >
                                            RECEIPT
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default CashierView;
