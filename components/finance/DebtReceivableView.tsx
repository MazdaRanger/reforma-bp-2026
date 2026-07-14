import React, { useState, useEffect, useMemo } from 'react';
import { Job, PurchaseOrder, CashierTransaction, UserPermissions, Settings } from '../../types';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, CASHIER_COLLECTION, SETTINGS_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo, cleanObject, generateTransactionId } from '../../utils/helpers';
import { generateReceiptPDF } from '../../utils/pdfGenerator';
import Modal from '../ui/Modal';

interface DebtReceivableViewProps {
  jobs: Job[];
  purchaseOrders: PurchaseOrder[]; 
  transactions: CashierTransaction[]; 
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
      type: 'IN' | 'OUT'; 
      refId: string; 
      refNumber: string; 
      totalBill: number;
      alreadyPaid: number;
      name: string; 
      category: string; 
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
            const setSnap = await getDocs(collection(db, SETTINGS_COLLECTION));
            if (!setSnap.empty) setSettings(setSnap.docs[0].data() as Settings);
        } catch (e) {
            console.error("Failed loading settings", e);
        }
    };
    fetchData();
  }, []);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, '');
      setPaymentForm(prev => ({ ...prev, amount: raw ? parseInt(raw, 10) : 0 }));
  };

  const receivables = useMemo(() => {
      return jobs.filter(j => j.woNumber && !j.isDeleted).map(job => {
          const totalBill = job.estimateData?.grandTotal || 0;
          const paidAmount = transactions
              .filter(t => t.refJobId === job.id && t.type === 'IN') 
              .reduce((acc, t) => acc + (t.amount || 0), 0);
          
          const remaining = totalBill - paidAmount;
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
      }).filter(r => r.remaining > 1000); 
  }, [jobs, transactions]);

  const payables = useMemo(() => {
      return purchaseOrders.filter(po => 
          ['Received', 'Partial', 'Ordered'].includes(po.status) && po.totalAmount > 0
      ).map(po => {
          const totalBill = po.totalAmount;
          const paidAmount = transactions
              .filter(t => t.refPoId === po.id && t.type === 'OUT') 
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

  const totalReceivable = receivables.reduce((acc, r) => acc + r.remaining, 0);
  const totalPayable = payables.reduce((acc, p) => acc + p.remaining, 0);

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
          amount: target.remaining, 
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
      if (amt > (paymentTarget.totalBill - paymentTarget.alreadyPaid + 1000)) { 
          if(!window.confirm("Jumlah pembayaran melebihi sisa tagihan. Lanjutkan?")) return;
      }

      try {
          const transactionNumber = generateTransactionId(paymentTarget.type);

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

          const finalPayload = {
              ...cleanedPayload,
              date: serverTimestamp(),
              createdAt: serverTimestamp(),
          };

          await addDoc(collection(db, CASHIER_COLLECTION), finalPayload);
          
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
    <div className="animate-fade-in pb-[48px]">
        {/* HEADER */}
        <div className="border-b border-hairline pb-[24px] mb-[48px]">
            <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">DEBT & RECEIVABLE</h1>
            <p className="text-[16px] text-mute font-normal mt-[18px]">Manajemen Tagihan Supplier & Klaim Asuransi/Customer (Live)</p>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[24px] mb-[48px]">
            <div className="bg-canvas border border-hairline p-6 md:p-8 flex flex-col justify-between hover:bg-soft-cloud transition-colors rounded-2xl overflow-hidden">
                <p className="text-[14px] font-medium text-mute uppercase tracking-widest mb-4 border-b border-hairline pb-4">
                    Total Piutang (Receivables)
                </p>
                <div>
                    <h2 className="text-[48px] font-display text-ink leading-none">{formatCurrency(totalReceivable)}</h2>
                    <p className="text-[12px] font-medium text-mute uppercase tracking-widest mt-4">
                        {receivables.length} Invoice Belum Lunas
                    </p>
                </div>
            </div>

            <div className="bg-canvas border border-hairline p-6 md:p-8 flex flex-col justify-between hover:bg-soft-cloud transition-colors rounded-2xl overflow-hidden">
                <p className="text-[14px] font-medium text-mute uppercase tracking-widest mb-4 border-b border-hairline pb-4">
                    Total Hutang (Payables)
                </p>
                <div>
                    <h2 className="text-[48px] font-display text-ink leading-none">{formatCurrency(totalPayable)}</h2>
                    <p className="text-[12px] font-medium text-mute uppercase tracking-widest mt-4">
                        {payables.length} PO Belum Lunas
                    </p>
                </div>
            </div>
        </div>

        {/* TABS */}
        <div className="flex gap-6 md:gap-8 border-b border-hairline mb-[48px]">
            <button 
                onClick={() => setActiveTab('receivable')}
                className={`pb-4 text-[14px] font-medium uppercase tracking-widest transition-colors ${activeTab === 'receivable' ? 'border-b-2 border-ink text-ink' : 'text-mute hover:text-ink'}`}
            >
                Piutang Usaha (Invoice Keluar)
            </button>
            <button 
                onClick={() => setActiveTab('payable')}
                className={`pb-4 text-[14px] font-medium uppercase tracking-widest transition-colors ${activeTab === 'payable' ? 'border-b-2 border-ink text-ink' : 'text-mute hover:text-ink'}`}
            >
                Hutang Supplier (Tagihan PO)
            </button>
        </div>

        {/* CONTENT: RECEIVABLES */}
        {activeTab === 'receivable' && (
            <div className="bg-canvas border border-hairline animate-fade-in rounded-2xl overflow-hidden">
                <div className="p-6 bg-soft-cloud border-b border-hairline flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <select 
                            value={filterIns} 
                            onChange={e => setFilterIns(e.target.value)} 
                            className="bg-transparent border border-hairline px-4 py-2 text-[12px] font-medium uppercase tracking-widest text-ink focus:outline-none w-full md:w-auto"
                        >
                            <option value="ALL">Semua Pihak</option>
                            <option value="Asuransi">Hanya Asuransi</option>
                            <option value="Umum">Hanya Umum/Pribadi</option>
                        </select>
                    </div>
                    <span className="text-[12px] text-mute uppercase tracking-widest">Sisa tagihan aktif</span>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-canvas text-mute font-medium uppercase tracking-widest text-[12px] border-b border-hairline">
                            <tr>
                                <th className="px-6 py-4 font-normal">No. WO / Polisi</th>
                                <th className="px-6 py-4 font-normal">Pihak Tertagih</th>
                                <th className="px-6 py-4 text-right font-normal">Total Invoice</th>
                                <th className="px-6 py-4 text-right font-normal">Sudah Bayar</th>
                                <th className="px-6 py-4 text-right font-normal">Sisa Tagihan</th>
                                <th className="px-6 py-4 text-center font-normal">Progress</th>
                                <th className="px-6 py-4 text-center font-normal">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                            {receivables
                                .filter(r => {
                                    if (filterIns === 'ALL') return true;
                                    if (filterIns === 'Asuransi') return r.namaAsuransi !== 'Umum / Pribadi';
                                    return r.namaAsuransi === 'Umum / Pribadi';
                                })
                                .map(job => (
                                <tr key={job.id} className="hover:bg-soft-cloud transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="text-[14px] font-medium text-ink">{job.woNumber}</div>
                                        <div className="text-[12px] font-mono text-mute mt-1">{job.policeNumber}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-[14px] font-medium text-ink">{job.namaAsuransi}</div>
                                        <div className="text-[12px] text-mute mt-1">{job.customerName}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right text-[14px] text-ink">{formatCurrency(job.totalBill)}</td>
                                    <td className="px-6 py-4 text-right text-[14px] text-ink opacity-70">{formatCurrency(job.paidAmount)}</td>
                                    <td className="px-6 py-4 text-right text-[14px] font-bold text-ink">{formatCurrency(job.remaining)}</td>
                                    <td className="px-6 py-4 w-32">
                                        <div className="w-full bg-hairline h-1">
                                            <div className="bg-ink h-1" style={{ width: `${(job.paidAmount/job.totalBill)*100}%` }}></div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button 
                                            onClick={() => handleOpenPayment(job, 'IN')}
                                            className="bg-canvas border border-ink text-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest hover:bg-ink hover:text-canvas transition-colors"
                                        >
                                            TERIMA
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {receivables.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-mute text-[12px] uppercase tracking-widest">Tidak ada piutang.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* CONTENT: PAYABLES */}
        {activeTab === 'payable' && (
            <div className="bg-canvas border border-hairline animate-fade-in rounded-2xl overflow-hidden">
                <div className="p-6 bg-soft-cloud border-b border-hairline">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">HUTANG SUPPLIER</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-canvas text-mute font-medium uppercase tracking-widest text-[12px] border-b border-hairline">
                            <tr>
                                <th className="px-6 py-4 font-normal">No. PO</th>
                                <th className="px-6 py-4 font-normal">Supplier</th>
                                <th className="px-6 py-4 text-right font-normal">Total Tagihan</th>
                                <th className="px-6 py-4 text-right font-normal">Sudah Bayar</th>
                                <th className="px-6 py-4 text-right font-normal">Sisa Hutang</th>
                                <th className="px-6 py-4 text-center font-normal">Status</th>
                                <th className="px-6 py-4 text-center font-normal">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                            {payables.map(po => (
                                <tr key={po.id} className="hover:bg-soft-cloud transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="text-[14px] font-mono font-medium text-ink">{po.poNumber}</div>
                                        <div className="text-[10px] text-mute font-medium uppercase tracking-widest mt-1">{formatDateIndo(po.createdAt)}</div>
                                    </td>
                                    <td className="px-6 py-4 text-[14px] font-medium text-ink">{po.supplierName}</td>
                                    <td className="px-6 py-4 text-right text-[14px] text-ink">{formatCurrency(po.totalAmount)}</td>
                                    <td className="px-6 py-4 text-right text-[14px] text-ink opacity-70">{formatCurrency(po.paidAmount)}</td>
                                    <td className="px-6 py-4 text-right text-[14px] font-bold text-ink">{formatCurrency(po.remaining)}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-3 py-1 border border-hairline text-[10px] font-medium uppercase tracking-widest ${po.status === 'Received' ? 'text-ink' : 'text-mute'}`}>
                                            {po.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button 
                                            onClick={() => handleOpenPayment(po, 'OUT')}
                                            className="bg-canvas border border-ink text-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest hover:bg-ink hover:text-canvas transition-colors"
                                        >
                                            BAYAR
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {payables.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-mute text-[12px] uppercase tracking-widest">Tidak ada hutang supplier.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* PAYMENT MODAL */}
        <Modal
            isOpen={isPaymentModalOpen}
            onClose={() => setIsPaymentModalOpen(false)}
            title={`INPUT PEMBAYARAN ${paymentTarget?.type === 'IN' ? 'PIUTANG' : 'HUTANG'}`}
        >
            {paymentTarget && (
                <form onSubmit={handleSubmitPayment} className="space-y-6">
                    <div className="bg-soft-cloud p-6 border border-hairline space-y-4">
                        <div className="flex justify-between items-center border-b border-hairline pb-2">
                            <span className="text-[12px] font-medium text-mute uppercase tracking-widest">Referensi Dokumen:</span>
                            <span className="text-[14px] font-medium text-ink">{paymentTarget.refNumber}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-hairline pb-2">
                            <span className="text-[12px] font-medium text-mute uppercase tracking-widest">{paymentTarget.type === 'IN' ? 'Customer/Asuransi' : 'Supplier'}:</span>
                            <span className="text-[14px] font-medium text-ink">{paymentTarget.name}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                            <span className="text-[12px] font-medium text-ink uppercase tracking-widest">Sisa Tagihan:</span>
                            <span className="text-[20px] font-display text-ink">{formatCurrency(paymentTarget.totalBill - paymentTarget.alreadyPaid)}</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Nominal Pembayaran (Rp)</label>
                        <input 
                            type="text" 
                            required 
                            className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-display text-[24px] text-ink text-right"
                            value={paymentForm.amount ? new Intl.NumberFormat('id-ID').format(paymentForm.amount) : ''}
                            onChange={handleAmountChange}
                            placeholder="0"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Metode</label>
                            <select 
                                className="w-full p-3 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink"
                                value={paymentForm.method}
                                onChange={e => setPaymentForm({...paymentForm, method: e.target.value})}
                            >
                                <option value="Transfer">Transfer Bank</option>
                                <option value="Cash">Tunai / Cash</option>
                                <option value="EDC">EDC / Kartu</option>
                            </select>
                        </div>
                        {(paymentForm.method === 'Transfer' || paymentForm.method === 'EDC') && (
                            <div className="animate-fade-in">
                                <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Bank Penerima/Sumber</label>
                                <select 
                                    className="w-full p-3 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink"
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
                        <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Catatan</label>
                        <input 
                            type="text" 
                            className="w-full p-3 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] text-ink"
                            placeholder="Opsional..."
                            value={paymentForm.notes}
                            onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})}
                        />
                    </div>

                    <div className="flex gap-4 pt-6 border-t border-hairline">
                        <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="flex-1 py-4 text-[12px] font-medium text-ink uppercase tracking-widest border border-ink hover:bg-soft-cloud transition-colors">BATAL</button>
                        <button type="submit" className="flex-1 py-4 text-[12px] font-medium text-canvas bg-ink uppercase tracking-widest hover:bg-mute transition-colors">
                            SIMPAN TRANSAKSI
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    </div>
  );
};

export default DebtReceivableView;
