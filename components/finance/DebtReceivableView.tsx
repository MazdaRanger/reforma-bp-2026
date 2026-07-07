
import React, { useState, useEffect, useMemo } from 'react';
import { Job, PurchaseOrder, CashierTransaction, UserPermissions, Settings } from '../../types';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, CASHIER_COLLECTION, SETTINGS_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo, cleanObject, generateTransactionId } from '../../utils/helpers';
import { generateReceiptPDF } from '../../utils/pdfGenerator';
import { Scale, ArrowUpRight, ArrowDownLeft, Filter, Wallet, Building2, User, FileText, CheckCircle, Clock, AlertTriangle, Save } from 'lucide-react';
import Modal from '../ui/Modal';

interface DebtReceivableViewProps {
  jobs: Job[];
  purchaseOrders: PurchaseOrder[]; // REAL-TIME PROP
  transactions: CashierTransaction[]; // REAL-TIME PROP
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
}

const DebtReceivableView: React.FC<DebtReceivableViewProps> = ({ jobs, purchaseOrders, transactions, userPermissions, showNotification }) => {
  const [activeTab, setActiveTab] = useState<'receivable' | 'payable'>('receivable');
  const [settings, setSettings] = useState<Settings | null>(null);

  // Filter States
  const [filterIns, setFilterIns] = useState('ALL');
  
  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<{
      type: 'IN' | 'OUT'; // IN = Terima Piutang, OUT = Bayar Hutang
      refId: string; // Job ID or PO ID
      refNumber: string; // WO or PO Number
      totalBill: number;
      alreadyPaid: number;
      name: string; // Customer or Supplier Name
      category: string; // 'Pelunasan' or 'Vendor'
  } | null>(null);
  
  const [paymentForm, setPaymentForm] = useState({
      amount: 0,
      method: 'Transfer',
      bankName: '',
      notes: ''
  });

  useEffect(() => {
    const fetchData = async () => {
        try {
            // Settings for Bank Accounts
            const setSnap = await getDocs(collection(db, SETTINGS_COLLECTION));
            if (!setSnap.empty) setSettings(setSnap.docs[0].data() as Settings);
        } catch (e) {
            console.error("Failed loading settings", e);
        }
    };
    fetchData();
  }, []);

  // Helper for formatting
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, '');
      setPaymentForm(prev => ({ ...prev, amount: raw ? parseInt(raw, 10) : 0 }));
  };

  // --- DATA PROCESSING: RECEIVABLES (PIUTANG) ---
  const receivables = useMemo(() => {
      // Logic: Closed Jobs OR Active Jobs with WO.
      return jobs.filter(j => j.woNumber && !j.isDeleted).map(job => {
          const totalBill = job.estimateData?.grandTotal || 0;
          const paidAmount = transactions
              .filter(t => t.refJobId === job.id && t.type === 'IN') // Only counting IN (Payments received)
              .reduce((acc, t) => acc + (t.amount || 0), 0);
          
          const remaining = totalBill - paidAmount;
          // Status logic
          let status = 'UNPAID';
          if (paidAmount >= totalBill && totalBill > 0) status = 'PAID';
          else if (paidAmount > 0) status = 'PARTIAL';

          return {
              ...job,
              totalBill,
              paidAmount,
              remaining,
              paymentStatus: status
          };
      }).filter(r => r.remaining > 1000); // Filter out fully paid (allow small rounding diff)
  }, [jobs, transactions]);

  // --- DATA PROCESSING: PAYABLES (HUTANG) ---
  const payables = useMemo(() => {
      // Logic: POs with status 'Received' or 'Partial' or 'Ordered'.
      return purchaseOrders.filter(po => 
          ['Received', 'Partial', 'Ordered'].includes(po.status) && po.totalAmount > 0
      ).map(po => {
          const totalBill = po.totalAmount;
          const paidAmount = transactions
              .filter(t => t.refPoId === po.id && t.type === 'OUT') // Only counting OUT (Payments made)
              .reduce((acc, t) => acc + t.amount, 0);
          
          const remaining = totalBill - paidAmount;
          
          let status = 'UNPAID';
          if (paidAmount >= totalBill) status = 'PAID';
          else if (paidAmount > 0) status = 'PARTIAL';

          return {
              ...po,
              paidAmount,
              remaining,
              paymentStatus: status
          };
      }).filter(p => p.remaining > 1000);
  }, [purchaseOrders, transactions]);

  // --- AGGREGATES ---
  const totalReceivable = receivables.reduce((acc, r) => acc + r.remaining, 0);
  const totalPayable = payables.reduce((acc, p) => acc + p.remaining, 0);

  // --- HANDLERS ---
  const handleOpenPayment = (target: any, type: 'IN' | 'OUT') => {
      setPaymentTarget({
          type,
          refId: target.id,
          refNumber: type === 'IN' ? target.woNumber : target.poNumber,
          totalBill: type === 'IN' ? target.totalBill : target.totalAmount,
          alreadyPaid: target.paidAmount,
          name: type === 'IN' ? target.customerName : target.supplierName,
          category: type === 'IN' ? 'Pelunasan' : 'Vendor'
      });
      setPaymentForm({
          amount: target.remaining, // Default to full remaining
          method: 'Transfer',
          bankName: settings?.workshopBankAccounts?.[0]?.bankName ? `${settings.workshopBankAccounts[0].bankName} - ${settings.workshopBankAccounts[0].accountNumber}` : '',
          notes: ''
      });
      setIsPaymentModalOpen(true);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!paymentTarget) return;
      
      const amt = Number(paymentForm.amount);
      if (amt <= 0) { showNotification("Jumlah pembayaran tidak valid", "error"); return; }
      if (amt > (paymentTarget.totalBill - paymentTarget.alreadyPaid + 1000)) { // 1000 tolerance
          if(!window.confirm("Jumlah pembayaran melebihi sisa tagihan. Lanjutkan?")) return;
      }

      try {
          // Generate ID - SYNCHRONOUS
          const transactionNumber = generateTransactionId(paymentTarget.type);

          // 1. Prepare Base Payload (Cleaned first)
          const baseData: any = {
              createdBy: userPermissions.role,
              type: paymentTarget.type,
              category: paymentTarget.category as any,
              amount: amt,
              paymentMethod: paymentForm.method as any,
              bankName: (paymentForm.method === 'Transfer' || paymentForm.method === 'EDC') ? paymentForm.bankName : undefined,
              refNumber: paymentTarget.refNumber,
              customerName: paymentTarget.name,
              description: paymentForm.notes || (paymentTarget.type === 'IN' ? `Pelunasan WO ${paymentTarget.refNumber}` : `Pembayaran PO ${paymentTarget.refNumber}`),
              transactionNumber: transactionNumber, 
              refJobId: paymentTarget.type === 'IN' ? paymentTarget.refId : undefined,
              refPoId: paymentTarget.type === 'OUT' ? paymentTarget.refId : undefined
          };

          const cleanedPayload = cleanObject(baseData);

          // 2. Add Timestamp (Server side)
          const finalPayload = {
              ...cleanedPayload,
              date: serverTimestamp(),
              createdAt: serverTimestamp(),
          };

          await addDoc(collection(db, CASHIER_COLLECTION), finalPayload);
          
          // Auto Print Proof (Using safe Date object for immediate print)
          if (settings) {
              generateReceiptPDF({...finalPayload, date: new Date(), id: 'TEMP'} as CashierTransaction, settings);
          }

          showNotification("Pembayaran berhasil dicatat & Bukti diunduh.", "success");
          setIsPaymentModalOpen(false);
          
      } catch (err: any) {
          showNotification("Gagal menyimpan pembayaran: " + err.message, "error");
      }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Scale size={24} className="text-indigo-600"/> Hutang & Piutang
                </h1>
                <p className="text-sm text-gray-500 font-medium">Manajemen Tagihan Supplier & Klaim Asuransi/Customer (Live)</p>
            </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-white to-green-50 p-6 rounded-xl border border-green-100 shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start relative z-10">
                    <div>
                        <p className="text-sm font-bold text-green-700 uppercase tracking-wider mb-1 flex items-center gap-2">
                            <ArrowDownLeft size={16}/> Total Piutang (Receivables)
                        </p>
                        <h2 className="text-3xl font-black text-gray-900">{formatCurrency(totalReceivable)}</h2>
                        <p className="text-xs text-gray-500 mt-2">{receivables.length} Invoice Belum Lunas</p>
                    </div>
                    <div className="p-3 bg-green-200 rounded-full text-green-700 opacity-80"><Wallet size={24}/></div>
                </div>
            </div>

            <div className="bg-gradient-to-br from-white to-red-50 p-6 rounded-xl border border-red-100 shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start relative z-10">
                    <div>
                        <p className="text-sm font-bold text-red-700 uppercase tracking-wider mb-1 flex items-center gap-2">
                            <ArrowUpRight size={16}/> Total Hutang (Payables)
                        </p>
                        <h2 className="text-3xl font-black text-gray-900">{formatCurrency(totalPayable)}</h2>
                        <p className="text-xs text-gray-500 mt-2">{payables.length} PO Belum Lunas</p>
                    </div>
                    <div className="p-3 bg-red-200 rounded-full text-red-700 opacity-80"><Building2 size={24}/></div>
                </div>
            </div>
        </div>

        {/* TABS */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-200">
                <button 
                    onClick={() => setActiveTab('receivable')}
                    className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'receivable' ? 'bg-white border-b-2 border-indigo-600 text-indigo-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                >
                    <User size={18}/> Piutang Usaha (Invoice Keluar)
                </button>
                <button 
                    onClick={() => setActiveTab('payable')}
                    className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'payable' ? 'bg-white border-b-2 border-red-600 text-red-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                >
                    <Building2 size={18}/> Hutang Supplier (Tagihan PO)
                </button>
            </div>

            {/* CONTENT: RECEIVABLES */}
            {activeTab === 'receivable' && (
                <div className="p-0 animate-fade-in">
                    <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Filter size={16} className="text-gray-400"/>
                            <select value={filterIns} onChange={e => setFilterIns(e.target.value)} className="text-sm border rounded p-1.5">
                                <option value="ALL">Semua Pihak</option>
                                <option value="Asuransi">Hanya Asuransi</option>
                                <option value="Umum">Hanya Umum/Pribadi</option>
                            </select>
                        </div>
                        <span className="text-xs text-gray-500 italic">Menampilkan unit closed/aktif dengan sisa tagihan.</span>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 text-gray-600 uppercase font-bold text-xs">
                                <tr>
                                    <th className="px-6 py-3">No. WO / Polisi</th>
                                    <th className="px-6 py-3">Pihak Tertagih</th>
                                    <th className="px-6 py-3 text-right">Total Invoice</th>
                                    <th className="px-6 py-3 text-right">Sudah Bayar</th>
                                    <th className="px-6 py-3 text-right">Sisa Tagihan</th>
                                    <th className="px-6 py-3 text-center">Progress</th>
                                    <th className="px-6 py-3 text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {receivables
                                    .filter(r => {
                                        if (filterIns === 'ALL') return true;
                                        if (filterIns === 'Asuransi') return r.namaAsuransi !== 'Umum / Pribadi';
                                        return r.namaAsuransi === 'Umum / Pribadi';
                                    })
                                    .map(job => (
                                    <tr key={job.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-indigo-700">{job.woNumber}</div>
                                            <div className="text-xs font-mono text-gray-500">{job.policeNumber}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-800">{job.namaAsuransi}</div>
                                            <div className="text-xs text-gray-500">{job.customerName}</div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium">{formatCurrency(job.totalBill)}</td>
                                        <td className="px-6 py-4 text-right text-emerald-600 font-medium">{formatCurrency(job.paidAmount)}</td>
                                        <td className="px-6 py-4 text-right font-bold text-red-600">{formatCurrency(job.remaining)}</td>
                                        <td className="px-6 py-4 w-32">
                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(job.paidAmount/job.totalBill)*100}%` }}></div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button 
                                                onClick={() => handleOpenPayment(job, 'IN')}
                                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-xs font-bold transition-colors"
                                            >
                                                Terima
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {receivables.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">Tidak ada piutang.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* CONTENT: PAYABLES */}
            {activeTab === 'payable' && (
                <div className="p-0 animate-fade-in">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 text-gray-600 uppercase font-bold text-xs">
                                <tr>
                                    <th className="px-6 py-3">No. Purchase Order</th>
                                    <th className="px-6 py-3">Supplier</th>
                                    <th className="px-6 py-3 text-right">Total Tagihan</th>
                                    <th className="px-6 py-3 text-right">Sudah Bayar</th>
                                    <th className="px-6 py-3 text-right">Sisa Hutang</th>
                                    <th className="px-6 py-3 text-center">Status Barang</th>
                                    <th className="px-6 py-3 text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {payables.map(po => (
                                    <tr key={po.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-mono font-bold text-gray-800">
                                            {po.poNumber}
                                            <div className="text-[10px] text-gray-400 font-normal">{formatDateIndo(po.createdAt)}</div>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-gray-700">{po.supplierName}</td>
                                        <td className="px-6 py-4 text-right font-medium">{formatCurrency(po.totalAmount)}</td>
                                        <td className="px-6 py-4 text-right text-emerald-600 font-medium">{formatCurrency(po.paidAmount)}</td>
                                        <td className="px-6 py-4 text-right font-bold text-red-600">{formatCurrency(po.remaining)}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold border ${po.status === 'Received' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                                {po.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button 
                                                onClick={() => handleOpenPayment(po, 'OUT')}
                                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-bold transition-colors"
                                            >
                                                Bayar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {payables.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">Tidak ada hutang supplier (PO Received).</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>

        {/* PAYMENT MODAL */}
        <Modal
            isOpen={isPaymentModalOpen}
            onClose={() => setIsPaymentModalOpen(false)}
            title={`Input Pembayaran ${paymentTarget?.type === 'IN' ? 'Piutang' : 'Hutang'}`}
        >
            {paymentTarget && (
                <form onSubmit={handleSubmitPayment} className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm">
                        <div className="flex justify-between mb-1">
                            <span className="text-gray-500">Referensi Dokumen:</span>
                            <span className="font-bold text-gray-900">{paymentTarget.refNumber}</span>
                        </div>
                        <div className="flex justify-between mb-1">
                            <span className="text-gray-500">{paymentTarget.type === 'IN' ? 'Customer/Asuransi' : 'Supplier'}:</span>
                            <span className="font-bold text-gray-900">{paymentTarget.name}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t mt-2">
                            <span className="text-gray-500">Sisa Tagihan:</span>
                            <span className="font-bold text-red-600 text-lg">{formatCurrency(paymentTarget.totalBill - paymentTarget.alreadyPaid)}</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nominal Pembayaran (Rp)</label>
                        <input 
                            type="text" 
                            required 
                            className="w-full p-3 border border-gray-300 rounded-lg text-lg font-bold text-gray-900"
                            value={paymentForm.amount ? new Intl.NumberFormat('id-ID').format(paymentForm.amount) : ''}
                            onChange={handleAmountChange}
                            placeholder="0"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Metode</label>
                            <select 
                                className="w-full p-2 border border-gray-300 rounded-lg"
                                value={paymentForm.method}
                                onChange={e => setPaymentForm({...paymentForm, method: e.target.value})}
                            >
                                <option value="Transfer">Transfer Bank</option>
                                <option value="Cash">Tunai / Cash</option>
                                <option value="EDC">EDC / Kartu</option>
                            </select>
                        </div>
                        {(paymentForm.method === 'Transfer' || paymentForm.method === 'EDC') && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Bank Penerima/Sumber</label>
                                <select 
                                    className="w-full p-2 border border-gray-300 rounded-lg"
                                    value={paymentForm.bankName}
                                    onChange={e => setPaymentForm({...paymentForm, bankName: e.target.value})}
                                >
                                    <option value="">-- Pilih Bank --</option>
                                    {settings?.workshopBankAccounts?.map((b, idx) => (
                                        <option key={idx} value={`${b.bankName} - ${b.accountNumber}`}>{b.bankName} ({b.accountNumber})</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-300 rounded-lg"
                            placeholder="Contoh: Pelunasan Termin 1..."
                            value={paymentForm.notes}
                            onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Batal</button>
                        <button type="submit" className={`px-6 py-2 rounded-lg text-white font-bold shadow-md ${paymentTarget.type === 'IN' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-red-600 hover:bg-red-700'}`}>
                            Simpan Pembayaran
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    </div>
  );
};

export default DebtReceivableView;
