
import React, { useState, useMemo } from 'react';
import { Job, PurchaseOrder, CashierTransaction, Settings, UserPermissions, Supplier } from '../../types';
import { formatCurrency, formatDateIndo, generateTransactionId, generateRandomId, cleanObject } from '../../utils/helpers';
import { generateReceiptPDF } from '../../utils/pdfGenerator';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDocs } from 'firebase/firestore';
import { db, CASHIER_COLLECTION, SETTINGS_COLLECTION } from '../../services/firebase';
import { Landmark, Calendar, Landmark as TaxIcon, ArrowUpRight, ArrowDownRight, Calculator, Plus, History, Receipt, AlertCircle, Building2, Save, Loader2, ListChecks, CheckCircle2, FileText, ShoppingCart, Percent, XCircle, Wrench, Info, Users, ArrowRight, BarChart3, TrendingUp, ShieldCheck, ClipboardCheck } from 'lucide-react';

interface TaxManagementViewProps {
  jobs: Job[];
  purchaseOrders: PurchaseOrder[];
  transactions: CashierTransaction[];
  suppliers: Supplier[];
  settings: Settings;
  showNotification: (msg: string, type: string) => void;
  userPermissions: UserPermissions;
}

const TaxManagementView: React.FC<TaxManagementViewProps> = ({ jobs, purchaseOrders, transactions, suppliers, settings, showNotification, userPermissions }) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'pending' | 'calculators' | 'history'>('summary');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [isProcessing, setIsProcessing] = useState(false);

  // --- CALCULATOR STATES ---
  const [calcPPh21, setCalcPPh21] = useState({
      grossIncome: 0,
      hasNPWP: true,
      category: 'Bukan Pegawai'
  });

  const [pph25Wizard, setPph25Wizard] = useState({
      pphTerutangSPT: 0,
      kreditPajak: 0,
      isSavingDefault: false
  });

  const [taxForm, setTaxForm] = useState({
      type: 'PPh 23',
      amount: 0,
      periodMonth: new Date().getMonth(),
      periodYear: new Date().getFullYear(),
      paymentMethod: 'Transfer' as 'Cash' | 'Transfer' | 'EDC',
      bankName: settings.workshopBankAccounts?.[0] ? `${settings.workshopBankAccounts[0].bankName} - ${settings.workshopBankAccounts[0].accountNumber}` : '',
      notes: '',
      refNumber: '',
      refId: ''
  });

  const handleNumberChange = (value: string, setter: (val: number) => void) => {
      const raw = value.replace(/\D/g, '');
      setter(raw ? parseInt(raw, 10) : 0);
  };

  const settledTaxRefs = useMemo(() => {
      return new Set(transactions
        .filter(t => t.category === 'Pajak' && t.refNumber)
        .map(t => t.refNumber));
  }, [transactions]);

  const pendingPPNInvoices = useMemo(() => {
      return jobs.filter(j => 
          j.hasInvoice && 
          j.woNumber && 
          !settledTaxRefs.has(j.woNumber)
      ).sort((a,b) => (b.closedAt?.seconds || 0) - (a.closedAt?.seconds || 0));
  }, [jobs, settledTaxRefs]);

  const pendingPPhSublets = useMemo(() => {
      return purchaseOrders.filter(po => {
          const supplier = suppliers.find(s => s.id === po.supplierId);
          return (
              po.status === 'Received' && 
              supplier?.category === 'Jasa Luar' &&
              !settledTaxRefs.has(po.poNumber)
          );
      }).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [purchaseOrders, suppliers, settledTaxRefs]);

  const monthlyRevenue = useMemo(() => {
      return jobs.filter(j => {
          if (!j.isClosed || !j.closedAt) return false;
          const d = j.closedAt.toDate ? j.closedAt.toDate() : new Date(j.closedAt);
          return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      }).reduce((acc, j) => acc + (j.estimateData?.grandTotal || 0), 0);
  }, [jobs, selectedMonth, selectedYear]);

  const annualRevenue = useMemo(() => {
      return jobs.filter(j => {
          if (!j.isClosed || !j.closedAt) return false;
          const d = j.closedAt.toDate ? j.closedAt.toDate() : new Date(j.closedAt);
          return d.getFullYear() === selectedYear;
      }).reduce((acc, j) => acc + (j.estimateData?.grandTotal || 0), 0);
  }, [jobs, selectedYear]);

  const pph25InstallmentsPaid = useMemo(() => {
      return transactions.filter(t => 
        t.category === 'Pajak' && 
        t.description?.includes('PPh 25') && 
        new Date(t.date?.seconds * 1000).getFullYear() === selectedYear
      );
  }, [transactions, selectedYear]);

  const ppnStats = useMemo(() => {
      const periodInvoices = jobs.filter(j => {
          if (!j.hasInvoice || !j.closedAt) return false;
          const d = j.closedAt.toDate ? j.closedAt.toDate() : new Date(j.closedAt);
          return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      });
      const ppnOutput = periodInvoices.reduce((acc, j) => acc + (j.estimateData?.ppnAmount || 0), 0);

      const periodPOs = purchaseOrders.filter(po => {
          if (!po.createdAt || !po.hasPpn) return false;
          const d = po.createdAt.toDate ? po.createdAt.toDate() : new Date(po.createdAt);
          return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear && (po.status === 'Received' || po.status === 'Partial');
      });
      const ppnInput = periodPOs.reduce((acc, po) => acc + (po.ppnAmount || 0), 0);

      return { ppnOutput, ppnInput, ppnNet: ppnOutput - ppnInput, invoiceCount: periodInvoices.length, poCount: periodPOs.length };
  }, [jobs, purchaseOrders, selectedMonth, selectedYear]);

  const taxHistory = useMemo(() => {
      return transactions
        .filter(t => t.category === 'Pajak' && t.type === 'OUT')
        .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
  }, [transactions]);

  const pph21Result = useMemo(() => {
      const dpp = calcPPh21.grossIncome * 0.5;
      const rate = calcPPh21.hasNPWP ? 0.05 : 0.06;
      return Math.round(dpp * rate);
  }, [calcPPh21]);

  const pph25InstallmentResult = useMemo(() => {
      const sisaPajak = pph25Wizard.pphTerutangSPT - pph25Wizard.kreditPajak;
      return sisaPajak > 0 ? Math.round(sisaPajak / 12) : 0;
  }, [pph25Wizard]);

  const umkmTaxResult = Math.round(monthlyRevenue * 0.005);

  const applyCalcToForm = (type: string, amount: number, desc: string) => {
      setTaxForm({
          ...taxForm,
          type: type as any,
          amount,
          notes: desc
      });
      setActiveTab('pending');
      showNotification("Hasil kalkulasi diterapkan ke form setor.", "success");
  };

  const handleUpdatePph25Settings = async () => {
      if (pph25InstallmentResult <= 0) return;
      if (!window.confirm(`Gunakan ${formatCurrency(pph25InstallmentResult)} sebagai standar angsuran bulanan bengkel?`)) return;

      setPph25Wizard(prev => ({ ...prev, isSavingDefault: true }));
      try {
          const q = await getDocs(collection(db, SETTINGS_COLLECTION));
          if (!q.empty) {
              const settingsDocRef = doc(db, SETTINGS_COLLECTION, q.docs[0].id);
              await updateDoc(settingsDocRef, {
                  fixedPph25Amount: pph25InstallmentResult,
                  taxProfile: 'UMUM'
              });
              showNotification("Profil Pajak PPh 25 diperbarui di sistem.", "success");
          }
      } catch (e: any) {
          showNotification("Gagal update settings: " + e.message, "error");
      } finally {
          setPph25Wizard(prev => ({ ...prev, isSavingDefault: false }));
      }
  };

  const prepareTaxFromInvoice = (job: Job) => {
      setTaxForm({
          ...taxForm,
          type: 'PPN (Setoran Masa)',
          amount: Math.round(job.estimateData?.ppnAmount || 0),
          refNumber: job.woNumber || '',
          refId: job.id,
          notes: `Setoran PPN Faktur ${job.woNumber} - ${job.customerName}`
      });
      setActiveTab('pending'); 
  };

  const prepareTaxFromPO = (po: PurchaseOrder) => {
      const serviceTotal = po.items.reduce((acc, item) => acc + item.total, 0);
      const pphAmount = Math.round(serviceTotal * 0.02);

      setTaxForm({
          ...taxForm,
          type: 'PPh 23',
          amount: pphAmount,
          refNumber: po.poNumber,
          refId: po.id,
          notes: `Potongan PPh 23 (2%) atas Jasa Luar ${po.poNumber} - ${po.supplierName}`
      });
      setActiveTab('pending');
  };

  const handleAddTaxPayment = async (e: React.FormEvent) => {
      e.preventDefault();
      if (taxForm.amount <= 0) {
          showNotification("Jumlah pajak tidak valid.", "error");
          return;
      }

      setIsProcessing(true);
      try {
          // GENERATE ID: TAX-YYMM-RRR
          const transactionNumber = generateRandomId('TAX');
          
          const payload = {
              date: serverTimestamp(),
              createdAt: serverTimestamp(),
              createdBy: userPermissions.role,
              type: 'OUT',
              category: 'Pajak',
              amount: Number(taxForm.amount),
              paymentMethod: taxForm.paymentMethod,
              bankName: taxForm.paymentMethod !== 'Cash' ? taxForm.bankName : null,
              customerName: 'Kantor Pelayanan Pajak (KPP)',
              description: `Bayar ${taxForm.type} - Masa ${taxForm.periodMonth + 1}/${taxForm.periodYear}. ${taxForm.notes}`,
              refNumber: taxForm.refNumber || null,
              refJobId: taxForm.refId || null,
              transactionNumber: transactionNumber 
          };

          // Gunakan cleanObject untuk menghapus key yang bernilai undefined
          await addDoc(collection(db, CASHIER_COLLECTION), cleanObject(payload));
          
          if (settings) {
              const pdfData: any = {
                  ...payload,
                  date: new Date(),
                  id: 'TEMP'
              };
              generateReceiptPDF(pdfData as CashierTransaction, settings);
          }

          showNotification(`Berhasil mencatat pembebanan ${taxForm.type} (${transactionNumber})`, "success");
          setTaxForm(prev => ({ ...prev, amount: 0, notes: '', refNumber: '', refId: '' }));
          setActiveTab('history');
      } catch (e: any) {
          console.error("Tax Payment Error:", e);
          showNotification("Gagal mencatat: " + e.message, "error");
      } finally {
          setIsProcessing(false);
      }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-700 rounded-xl shadow-sm text-white">
                    <TaxIcon size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Manajemen Pajak Terintegrasi</h1>
                    <p className="text-sm text-gray-500 font-medium">Compliance Fiskal {settings.taxProfile || 'UMKM'} Bengkel</p>
                </div>
            </div>
            
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                <Calendar size={18} className="text-gray-400 ml-2"/>
                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="bg-transparent border-none text-sm font-bold text-gray-700 focus:ring-0">
                    {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                    ))}
                </select>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-transparent border-none text-sm font-bold text-gray-700 focus:ring-0 border-l border-gray-300 pl-2">
                    {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>
        </div>

        {/* TABS */}
        <div className="flex border-b border-gray-200">
            <button onClick={() => setActiveTab('summary')} className={`px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${activeTab === 'summary' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Calculator size={18}/> Ringkasan PPN
            </button>
            <button onClick={() => setActiveTab('calculators')} className={`px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${activeTab === 'calculators' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Percent size={18}/> Kalkulator & Perencanaan Pajak
            </button>
            <button onClick={() => setActiveTab('pending')} className={`px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${activeTab === 'pending' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <ListChecks size={18}/> Daftar Tunggu & Setor
                { (pendingPPNInvoices.length + pendingPPhSublets.length) > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">{pendingPPNInvoices.length + pendingPPhSublets.length}</span>}
            </button>
            <button onClick={() => setActiveTab('history')} className={`px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${activeTab === 'history' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <History size={18}/> Riwayat Setoran
            </button>
        </div>

        {activeTab === 'summary' && (
            <div className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                        <ArrowUpRight className="absolute -right-2 -top-2 text-emerald-100" size={80}/>
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">PPN Keluaran (Faktur)</p>
                        <h2 className="text-2xl font-black text-gray-900">{formatCurrency(ppnStats.ppnOutput)}</h2>
                        <div className="mt-2 text-[10px] text-gray-500 flex items-center gap-1"><Receipt size={10}/> Dari {ppnStats.invoiceCount} Penjualan Jasa/Part</div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                        <ArrowDownRight className="absolute -right-2 -top-2 text-red-100" size={80}/>
                        <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">PPN Masukan (PO)</p>
                        <h2 className="text-2xl font-black text-gray-900">{formatCurrency(ppnStats.ppnInput)}</h2>
                        <div className="mt-2 text-[10px] text-gray-500 flex items-center gap-1"><Building2 size={10}/> Dari {ppnStats.poCount} Pembelian Ber-PPN</div>
                    </div>

                    <div className={`p-6 rounded-xl border shadow-sm ${ppnStats.ppnNet >= 0 ? 'bg-indigo-900 text-white' : 'bg-emerald-600 text-white'}`}>
                        <p className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">Estimasi Kurang/Lebih Bayar</p>
                        <h2 className="text-2xl font-black">{formatCurrency(Math.abs(ppnStats.ppnNet))}</h2>
                        <div className="mt-2 text-[10px] flex items-center gap-1 opacity-90"><Calculator size={10}/> {ppnStats.ppnNet >= 0 ? 'Wajib Setor ke Negara' : 'Kompensasi Bulan Depan'}</div>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center text-center">
                    <AlertCircle size={40} className="text-indigo-300 mb-3"/>
                    <h3 className="font-bold text-gray-800">Audit Compliance Dashboard</h3>
                    <p className="text-sm text-gray-500 max-w-lg mt-2">Pastikan semua WO yang sudah selesai (Closed) memiliki record PPN di tab Daftar Tunggu untuk menghindari selisih data saat pelaporan SPT.</p>
                </div>
            </div>
        )}

        {/* TAB: CALCULATORS */}
        {activeTab === 'calculators' && (
            <div className="space-y-8 animate-fade-in">
                {/* TOP SECTION: WIZARDS */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* PPh 21 CALCULATOR */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-4 bg-indigo-600 text-white flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2"><Users size={18}/> Kalkulator PPh 21 (Staff/Mekanik)</h3>
                            <div className="bg-white/20 px-2 py-1 rounded text-[10px] font-bold">Pasal 21</div>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Penghasilan Bruto (Total Gaji/Komisi)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 font-bold text-gray-400">Rp</span>
                                        <input 
                                            type="text" 
                                            value={calcPPh21.grossIncome ? new Intl.NumberFormat('id-ID').format(calcPPh21.grossIncome) : ''} 
                                            onChange={e => handleNumberChange(e.target.value, (val) => setCalcPPh21({...calcPPh21, grossIncome: val}))}
                                            className="w-full pl-10 p-2.5 border border-gray-300 rounded-lg text-lg font-black text-gray-800 focus:ring-2 ring-indigo-500"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    <span className="text-sm font-medium text-gray-700">Karyawan memiliki NPWP?</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={calcPPh21.hasNPWP} onChange={e => setCalcPPh21({...calcPPh21, hasNPWP: e.target.checked})} className="sr-only peer"/>
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                    </label>
                                </div>
                            </div>

                            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                                <div className="flex justify-between text-xs font-bold text-indigo-400 uppercase mb-2">
                                    <span>PPh 21 Terutang</span>
                                    <span>Hasil Perhitungan</span>
                                </div>
                                <div className="flex justify-between items-baseline">
                                    <div className="text-[10px] text-gray-500">DPP (50% Bruto) x {calcPPh21.hasNPWP ? '5%' : '6%'}</div>
                                    <div className="text-2xl font-black text-indigo-700">{formatCurrency(pph21Result)}</div>
                                </div>
                            </div>

                            <button 
                                onClick={() => applyCalcToForm('PPh 21', pph21Result, `Pajak PPh 21 ${calcPPh21.hasNPWP ? 'NPWP' : 'Non-NPWP'} atas Bruto ${formatCurrency(calcPPh21.grossIncome)}`)}
                                disabled={pph21Result <= 0}
                                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                Terapkan ke Form Setoran <ArrowRight size={18}/>
                            </button>
                        </div>
                    </div>

                    {/* PPh 25 / UMKM CALCULATOR */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                        <div className={`p-4 text-white flex justify-between items-center ${settings.taxProfile === 'UMKM' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                            <h3 className="font-bold flex items-center gap-2">
                                <BarChart3 size={18}/> 
                                {settings.taxProfile === 'UMKM' ? 'Kalkulator PPh Final UMKM' : 'Asisten Skema PPh 25 (Umum)'}
                            </h3>
                            <div className="bg-white/20 px-2 py-1 rounded text-[10px] font-bold">
                                {settings.taxProfile === 'UMKM' ? 'PP 55/2022' : 'Wizard Angsuran'}
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            {settings.taxProfile === 'UMKM' ? (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase">Omzet Bulan Ini</p>
                                            <p className="text-lg font-black text-gray-800">{formatCurrency(monthlyRevenue)}</p>
                                        </div>
                                        <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                                            <p className="text-[10px] font-bold text-indigo-400 uppercase">PPh Final (0,5%)</p>
                                            <p className="text-lg font-black text-indigo-700">{formatCurrency(umkmTaxResult)}</p>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="text-[10px] font-bold text-amber-600 uppercase flex items-center gap-1"><TrendingUp size={12}/> Akumulasi Omzet {selectedYear}</p>
                                            <p className="text-[10px] font-bold text-amber-700">{Math.round((annualRevenue / 4800000000) * 100)}%</p>
                                        </div>
                                        <div className="w-full bg-amber-200/50 rounded-full h-2 overflow-hidden">
                                            <div className="bg-amber-500 h-full rounded-full" style={{ width: `${Math.min((annualRevenue / 4800000000) * 100, 100)}%` }}></div>
                                        </div>
                                        <div className="flex justify-between mt-1 text-[10px] text-amber-600 font-medium">
                                            <span>Total: {formatCurrency(annualRevenue)}</span>
                                            <span>Limit: 4,8 M</span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => applyCalcToForm('PPh 25', umkmTaxResult, `Setoran PPh Final 0,5% UMKM atas Omzet Masa ${selectedMonth + 1}/${selectedYear}`)}
                                        disabled={umkmTaxResult <= 0}
                                        className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        Terapkan Setoran UMKM <ArrowRight size={18}/>
                                    </button>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">PPh Terutang Setahun (SPT)</label>
                                            <input 
                                                type="text" 
                                                value={pph25Wizard.pphTerutangSPT ? new Intl.NumberFormat('id-ID').format(pph25Wizard.pphTerutangSPT) : ''} 
                                                onChange={e => handleNumberChange(e.target.value, (val) => setPph25Wizard({...pph25Wizard, pphTerutangSPT: val}))}
                                                className="w-full p-2 border border-gray-300 rounded text-sm font-bold"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Total Kredit Pajak (22, 23, 24)</label>
                                            <input 
                                                type="text" 
                                                value={pph25Wizard.kreditPajak ? new Intl.NumberFormat('id-ID').format(pph25Wizard.kreditPajak) : ''} 
                                                onChange={e => handleNumberChange(e.target.value, (val) => setPph25Wizard({...pph25Wizard, kreditPajak: val}))}
                                                className="w-full p-2 border border-gray-300 rounded text-sm font-bold"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                                        <div className="flex justify-between text-[10px] font-bold text-red-400 uppercase mb-1">
                                            <span>Rekomendasi Angsuran Bulanan</span>
                                            <span>PPh 25</span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <div className="text-[10px] text-gray-500">(Total - Kredit) / 12</div>
                                            <div className="text-xl font-black text-red-700">{formatCurrency(pph25InstallmentResult)}</div>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => applyCalcToForm('PPh 25', pph25InstallmentResult, `Setoran Angsuran PPh 25 Masa ${selectedMonth + 1}/${selectedYear}`)}
                                            disabled={pph25InstallmentResult <= 0}
                                            className="flex-1 py-2.5 bg-gray-800 text-white rounded-lg text-xs font-bold hover:bg-gray-900 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            Bebankan Bulan Ini
                                        </button>
                                        <button 
                                            onClick={handleUpdatePph25Settings}
                                            disabled={pph25InstallmentResult <= 0 || pph25Wizard.isSavingDefault}
                                            className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-md border border-red-700"
                                        >
                                            {pph25Wizard.isSavingDefault ? <Loader2 className="animate-spin" size={14}/> : <ShieldCheck size={14}/>}
                                            Set Sebagai Default
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* BOTTOM SECTION: MONITORING & TIMELINE */}
                {settings.taxProfile === 'UMUM' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in flex flex-col min-h-[400px]">
                        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2"><ClipboardCheck size={18} className="text-red-600"/> Proyeksi & Kepatuhan Angsuran PPh 25 (Tahun {selectedYear})</h3>
                            <div className="text-[10px] font-bold text-gray-500 bg-white px-2 py-1 rounded border">Target: {formatCurrency((settings.fixedPph25Amount || 0) * 12)} / Tahun</div>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                                {["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"].map((m, idx) => {
                                    const isPaid = pph25InstallmentsPaid.some(t => new Date(t.date?.seconds * 1000).getMonth() === idx);
                                    const isPast = new Date().getFullYear() > selectedYear || (new Date().getFullYear() === selectedYear && new Date().getMonth() > idx);
                                    
                                    return (
                                        <div key={m} className={`flex flex-col items-center p-3 rounded-lg border text-center transition-all ${isPaid ? 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-100' : isPast ? 'bg-red-50 border-red-100 opacity-60' : 'bg-gray-50 border-gray-100'}`}>
                                            <span className={`text-[10px] font-black mb-2 ${isPaid ? 'text-emerald-600' : 'text-gray-400'}`}>{m.toUpperCase()}</span>
                                            {isPaid ? (
                                                <CheckCircle2 size={24} className="text-emerald-500"/>
                                            ) : (
                                                <div className={`w-6 h-6 rounded-full border-2 border-dashed ${isPast ? 'border-red-300' : 'border-gray-200'}`}></div>
                                            )}
                                            <span className="text-[8px] font-bold mt-2 text-gray-500">
                                                {isPaid ? 'LUNAS' : isPast ? 'MISSING' : 'PENDING'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            
                            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Terselesaikan</p>
                                    <p className="text-xl font-black text-gray-800">{pph25InstallmentsPaid.length} / 12 <span className="text-sm font-medium text-gray-500">Bulan</span></p>
                                </div>
                                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Total Terbayar</p>
                                    <p className="text-xl font-black text-emerald-700">{formatCurrency(pph25InstallmentsPaid.reduce((acc, t) => acc + t.amount, 0))}</p>
                                </div>
                                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                                    <p className="text-[10px] font-bold text-indigo-600 uppercase">Kepatuhan Pajak</p>
                                    <p className="text-xl font-black text-indigo-700">{Math.round((pph25InstallmentsPaid.length / 12) * 100)}%</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}

        {activeTab === 'pending' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
                {/* LEFT: PENDING LIST */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
                            <h3 className="font-bold text-emerald-800 flex items-center gap-2"><FileText size={18}/> Piutang PPN (Invoice Keluar)</h3>
                            <span className="text-[10px] font-bold bg-white text-emerald-600 px-2 py-1 rounded border border-emerald-200">{pendingPPNInvoices.length} Unit</span>
                        </div>
                        <div className="overflow-x-auto max-h-60 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <tbody className="divide-y divide-gray-50">
                                    {pendingPPNInvoices.map(job => (
                                        <tr key={job.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-gray-900">{job.woNumber}</div>
                                                <div className="text-[10px] text-gray-400">{job.policeNumber} | {job.customerName}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="text-[10px] text-gray-400">PPN (11%)</div>
                                                <div className="font-bold text-emerald-600">{formatCurrency(job.estimateData?.ppnAmount)}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button onClick={() => prepareTaxFromInvoice(job)} className="text-[10px] font-bold bg-emerald-600 text-white px-3 py-1.5 rounded hover:bg-emerald-700 shadow-sm transition-transform active:scale-95">Bayar / Setor</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {pendingPPNInvoices.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-gray-400 italic">Semua PPN Faktur sudah terselesaikan.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4 bg-orange-50 border-b border-orange-100 flex justify-between items-center">
                            <h3 className="font-bold text-orange-800 flex items-center gap-2"><Wrench size={18}/> Hutang PPh 23 (Objek Jasa Luar)</h3>
                            <span className="text-[10px] font-bold bg-white text-orange-600 px-2 py-1 rounded border border-emerald-200">{pendingPPhSublets.length} PO</span>
                        </div>
                        <div className="overflow-x-auto max-h-60 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <tbody className="divide-y divide-gray-50">
                                    {pendingPPhSublets.map(po => {
                                        const serviceTotal = po.items.reduce((acc, i) => acc + i.total, 0);
                                        return (
                                            <tr key={po.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-gray-900">{po.poNumber}</div>
                                                    <div className="text-[10px] text-gray-400 font-bold text-indigo-600">{po.supplierName} (Vendor Jasa)</div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="text-[10px] text-gray-400">Potongan PPh 23 (2%)</div>
                                                    <div className="font-bold text-orange-600">{formatCurrency(serviceTotal * 0.02)}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button onClick={() => prepareTaxFromPO(po)} className="text-[10px] font-bold bg-orange-600 text-white px-3 py-1.5 rounded hover:bg-orange-700 shadow-sm transition-transform active:scale-95">Potong & Bebankan</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {pendingPPhSublets.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-gray-400 italic">Tidak ada tagihan Jasa Luar yang perlu dipotong PPh 23.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* RIGHT: SETTLEMENT FORM */}
                <div className="bg-white p-6 rounded-xl border border-indigo-200 shadow-lg h-fit ring-4 ring-indigo-50">
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b">
                        <div className="p-2 bg-indigo-600 rounded-lg text-white"><Calculator size={20}/></div>
                        <h3 className="font-bold text-gray-800">Selesaikan Pembayaran Pajak</h3>
                    </div>
                    
                    <form onSubmit={handleAddTaxPayment} className="space-y-4">
                        {taxForm.refNumber && (
                            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200 flex justify-between items-center animate-bounce-in">
                                <div>
                                    <p className="text-[10px] font-bold text-indigo-400 uppercase">Referensi Transaksi</p>
                                    <p className="font-black text-indigo-700">{taxForm.refNumber}</p>
                                </div>
                                <button type="button" onClick={() => setTaxForm({...taxForm, refNumber: '', refId: '', amount: 0})} className="text-indigo-400 hover:text-indigo-600"><XCircle size={18}/></button>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Jenis Pajak</label>
                            <select value={taxForm.type} onChange={e => setTaxForm({...taxForm, type: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 font-bold text-gray-800">
                                <option value="PPh 23">PPh 23 (Potongan Jasa Luar)</option>
                                <option value="PPN (Setoran Masa)">PPN (Setoran Hasil Faktur)</option>
                                <option value="PPh 25">{settings.taxProfile === 'UMKM' ? 'PPh Final 0,5% (UMKM)' : 'PPh 25 (Angsuran Bulanan)'}</option>
                                <option value="PPh 21">PPh 21 (Pajak Staff/Gaji)</option>
                                <option value="Lainnya">Pajak Lainnya</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nominal Pajak (IDR)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 font-bold text-gray-400">Rp</span>
                                <input 
                                    type="text" required 
                                    value={taxForm.amount ? new Intl.NumberFormat('id-ID').format(taxForm.amount) : ''} 
                                    onChange={e => handleNumberChange(e.target.value, (val) => setTaxForm({...taxForm, amount: val}))} 
                                    className="w-full pl-10 p-2.5 border border-gray-300 rounded-lg text-lg font-black text-indigo-900 focus:ring-2 ring-indigo-500"
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Metode Bayar</label>
                                <select value={taxForm.paymentMethod} onChange={e => setTaxForm({...taxForm, paymentMethod: e.target.value as any})} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50">
                                    <option value="Transfer">Transfer Bank</option>
                                    <option value="Cash">Tunai (Kasir)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sumber Rekening</label>
                                <select value={taxForm.bankName} onChange={e => setTaxForm({...taxForm, bankName: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg text-[10px] bg-gray-50">
                                    {(settings.workshopBankAccounts || []).map((b, i) => (
                                        <option key={i} value={`${b.bankName} - ${b.accountNumber}`}>{b.bankName}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Catatan / No. NTPN</label>
                            <textarea value={taxForm.notes} onChange={e => setTaxForm({...taxForm, notes: e.target.value})} rows={2} placeholder="Masukkan referensi manual atau kode bayar..." className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"/>
                        </div>

                        <button type="submit" disabled={isProcessing} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-xl font-black shadow-xl hover:bg-indigo-700 transition-all transform active:scale-95 disabled:opacity-70">
                            {isProcessing ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>}
                            SIMPAN PEMBEBANAN PAJAK
                        </button>
                    </form>
                </div>
            </div>
        )}

        {activeTab === 'history' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in flex flex-col min-h-[400px]">
                <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <History size={18} className="text-gray-500"/> Riwayat Beban Pajak Terintegrasi
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100 text-gray-600 uppercase font-semibold text-[10px] tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Tgl Setor</th>
                                <th className="px-6 py-4">Referensi Case</th>
                                <th className="px-6 py-4">Keterangan</th>
                                <th className="px-6 py-4 text-right">Nominal</th>
                                <th className="px-6 py-4 text-center">PIC</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {taxHistory.length > 0 ? taxHistory.map(trx => (
                                <tr key={trx.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-gray-600">
                                        <div className="font-bold">{formatDateIndo(trx.date)}</div>
                                        <div className="text-[10px] opacity-60">{trx.paymentMethod}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {trx.refNumber ? (
                                            <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md font-mono font-bold border border-indigo-100 text-xs">
                                                {trx.refNumber}
                                            </span>
                                        ) : <span className="text-gray-300">- General -</span>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-800">{trx.description}</div>
                                        {trx.transactionNumber && <span className="text-[9px] font-mono text-gray-400">{trx.transactionNumber}</span>}
                                    </td>
                                    <td className="px-6 py-4 text-right font-black text-red-600">
                                        {formatCurrency(trx.amount)}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="text-[10px] font-bold text-gray-400">{trx.createdBy}</span>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan={5} className="text-center py-20 text-gray-400 italic font-medium">Belum ada riwayat pembayaran pajak.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
    </div>
  );
};

export default TaxManagementView;
