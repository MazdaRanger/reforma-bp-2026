
import React, { useState, useMemo } from 'react';
import { Job, PurchaseOrder, CashierTransaction, Asset } from '../../types';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Calendar, TrendingUp, TrendingDown, DollarSign, Wallet, FileText, Download, PieChart, ArrowUpRight, ArrowDownRight, ShoppingCart, Activity, Layers, Banknote, AlertCircle } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

interface AccountingViewProps {
  jobs: Job[]; 
  purchaseOrders: PurchaseOrder[]; 
  transactions: CashierTransaction[]; 
  assets: Asset[]; 
}

const AccountingView: React.FC<AccountingViewProps> = ({ jobs, purchaseOrders, transactions = [], assets = [] }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pnl' | 'ledger'>('dashboard');
  
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const parseDate = (dateInput: any): Date => {
      if (!dateInput) return new Date();
      if (dateInput instanceof Date) return dateInput;
      if (typeof dateInput.toDate === 'function') return dateInput.toDate();
      if (dateInput.seconds) return new Date(dateInput.seconds * 1000);
      const parsed = new Date(dateInput);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  // --- CORE FINANCIAL CALCULATIONS (CASH BASIS AUDIT) ---
  const financialData = useMemo(() => {
    // 1. FILTER TRANSACTIONS PER PERIOD
    const periodTransactions = transactions.filter(t => {
        const d = parseDate(t.date);
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    // 2. REVENUE (UANG MASUK AKTUAL)
    // Menghitung uang yang benar-benar diterima (Cash/Transfer)
    const totalRevenueCash = periodTransactions
        .filter(t => t.type === 'IN')
        .reduce((acc, t) => acc + t.amount, 0);

    // 3. EXPENSE CLASSIFICATION (PENGELUARAN AKTUAL)
    let cogsVendor = 0; // HPP: Pembayaran ke Supplier Part/Bahan/Sublet
    let payrollExpense = 0; // Gaji Karyawan
    let taxExpense = 0; // Setoran Pajak
    let assetPurchase = 0; // Capex (Pembelian Aset)
    let operationalExpense = 0; // Listrik, Air, ATK, Lainnya

    periodTransactions.filter(t => t.type === 'OUT').forEach(t => {
        const cat = (t.category || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();

        // Logic Klasifikasi Cerdas
        if (cat.includes('vendor') || cat.includes('supplier') || desc.includes('po-') || desc.includes('sublet')) {
            cogsVendor += t.amount;
        } else if (cat.includes('gaji') || cat.includes('payroll') || desc.includes('gaji') || desc.includes('thr') || desc.includes('bonus')) {
            payrollExpense += t.amount;
        } else if (cat.includes('pajak') || cat.includes('ppn') || cat.includes('pph')) {
            taxExpense += t.amount;
        } else if (cat.includes('aset') || cat.includes('investasi') || desc.includes('beli aset')) {
            assetPurchase += t.amount;
        } else {
            // Sisanya masuk operasional (Listrik, Air, ATK, Bensin, dll)
            operationalExpense += t.amount;
        }
    });

    const totalCashOut = cogsVendor + payrollExpense + taxExpense + assetPurchase + operationalExpense;

    // 4. DEPRECIATION (NON-CASH EXPENSE)
    const depreciationExpense = assets.reduce((acc, asset) => {
        const pDate = parseDate(asset.purchaseDate);
        const reportDate = new Date(selectedYear, selectedMonth + 1, 0);
        // Hitung penyusutan hanya jika aset aktif dan sudah dibeli sebelum akhir bulan laporan
        if (pDate <= reportDate && asset.status === 'Active') {
            return acc + asset.monthlyDepreciation;
        }
        return acc;
    }, 0);

    // 5. PROFITABILITY METRICS
    // Laba Kotor (Cash) = Revenue - HPP Vendor
    const grossProfitCash = totalRevenueCash - cogsVendor;
    
    // Total Biaya Operasional (Accounting) = Payroll + Ops + Tax + Depreciation
    const totalOpexAccounting = payrollExpense + operationalExpense + taxExpense + depreciationExpense;

    // Laba Bersih (Accounting) = Gross Profit - Opex Accounting
    const netProfit = grossProfitCash - totalOpexAccounting;

    // Arus Kas Bersih (Real Money) = Total Masuk - Total Keluar
    // Ini beda dengan Laba Bersih karena memperhitungkan Beli Aset (Capex) dan mengabaikan Penyusutan
    const netCashFlow = totalRevenueCash - totalCashOut;

    return {
        totalRevenueCash,
        cogsVendor,
        payrollExpense,
        taxExpense,
        assetPurchase,
        operationalExpense,
        depreciationExpense,
        grossProfitCash,
        netProfit,
        netCashFlow,
        countIn: periodTransactions.filter(t => t.type === 'IN').length,
        countOut: periodTransactions.filter(t => t.type === 'OUT').length
    };
  }, [transactions, assets, selectedMonth, selectedYear]);

  // --- CHART DATA (6 MONTHS TREND) ---
  const chartData = useMemo(() => {
      const labels = [];
      const cashInData = [];
      const netCashData = [];
      
      for (let i = 5; i >= 0; i--) {
          const d = new Date();
          d.setMonth(selectedMonth - i);
          d.setFullYear(selectedYear); 
          const m = d.getMonth();
          const y = d.getFullYear();
          
          labels.push(d.toLocaleDateString('id-ID', { month: 'short' }));

          const mTransactions = transactions.filter(t => {
              const td = parseDate(t.date);
              return td.getMonth() === m && td.getFullYear() === y;
          });

          const mIn = mTransactions.filter(t => t.type === 'IN').reduce((acc, t) => acc + t.amount, 0);
          const mOut = mTransactions.filter(t => t.type === 'OUT').reduce((acc, t) => acc + t.amount, 0);

          cashInData.push(mIn);
          netCashData.push(mIn - mOut);
      }

      return {
          trend: {
              labels,
              datasets: [
                  { label: 'Uang Masuk (Cash In)', data: cashInData, borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4 },
                  { label: 'Surplus Kas Bersih', data: netCashData, borderColor: '#6366F1', backgroundColor: 'rgba(99, 102, 241, 0.1)', fill: true, tension: 0.4 }
              ]
          },
          expenseBreakdown: {
              labels: ['HPP Vendor', 'Gaji Staff', 'Operasional', 'Pajak', 'Beli Aset'],
              datasets: [{
                  data: [
                      financialData.cogsVendor,
                      financialData.payrollExpense,
                      financialData.operationalExpense,
                      financialData.taxExpense,
                      financialData.assetPurchase
                  ],
                  backgroundColor: ['#F59E0B', '#3B82F6', '#6366F1', '#EF4444', '#10B981'],
                  borderWidth: 0
              }]
          }
      };
  }, [transactions, selectedMonth, selectedYear, financialData]);

  // --- LEDGER DATA ---
  const ledgerData = useMemo(() => {
      return transactions.filter(t => {
          const d = parseDate(t.date);
          return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      }).sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  }, [transactions, selectedMonth, selectedYear]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        {/* HEADER & FILTER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-600 rounded-xl shadow-sm text-white">
                    <TrendingUp size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Finance & Accounting</h1>
                    <p className="text-sm text-gray-500 font-medium">Laporan Keuangan Berbasis Transaksi Aktual (Cash Basis)</p>
                </div>
            </div>
            
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                <Calendar size={18} className="text-gray-400 ml-2"/>
                <select 
                    value={selectedMonth} 
                    onChange={e => setSelectedMonth(Number(e.target.value))}
                    className="bg-transparent border-none text-sm font-bold text-gray-700 focus:ring-0 cursor-pointer"
                >
                    {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                    ))}
                </select>
                <select 
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="bg-transparent border-none text-sm font-bold text-gray-700 focus:ring-0 cursor-pointer border-l border-gray-300"
                >
                    {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 p-4 opacity-5"><DollarSign size={80}/></div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Uang Masuk (Revenue)</p>
                <h2 className="text-2xl font-black text-indigo-900">{formatCurrency(financialData.totalRevenueCash)}</h2>
                <div className="flex items-center gap-1 mt-2 text-xs font-medium text-emerald-600">
                    <ArrowUpRight size={14}/> <span>{financialData.countIn} Transaksi Masuk</span>
                </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 p-4 opacity-5"><TrendingDown size={80}/></div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Pengeluaran (Cash Out)</p>
                <h2 className="text-2xl font-black text-red-800">{formatCurrency(financialData.cogsVendor + financialData.payrollExpense + financialData.operationalExpense + financialData.taxExpense + financialData.assetPurchase)}</h2>
                <div className="flex items-center gap-1 mt-2 text-xs font-medium text-red-600">
                    <ArrowDownRight size={14}/> <span>All Expenses + Assets</span>
                </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 p-4 opacity-5"><Activity size={80}/></div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Laba Bersih (Accounting)</p>
                <h2 className={`text-2xl font-black ${financialData.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatCurrency(financialData.netProfit)}
                </h2>
                <div className="flex items-center gap-1 mt-2 text-xs font-medium text-gray-500">
                    <Layers size={14}/> <span>Revenue - Expenses - Depr.</span>
                </div>
            </div>

             <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm relative overflow-hidden text-white">
                <div className="absolute right-0 top-0 p-4 opacity-10"><Wallet size={80}/></div>
                <p className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Arus Kas Bersih (Net Cash)</p>
                <h2 className="text-2xl font-black">{formatCurrency(financialData.netCashFlow)}</h2>
                <div className="flex items-center gap-1 mt-2 text-xs font-medium text-slate-200">
                    <Banknote size={14}/> <span>Surplus/Defisit Uang Tunai</span>
                </div>
            </div>
        </div>

        {/* TABS NAVIGATION */}
        <div className="flex gap-2 border-b border-gray-200">
            <button 
                onClick={() => setActiveTab('dashboard')}
                className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'dashboard' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
                Visualisasi & Grafik
            </button>
            <button 
                onClick={() => setActiveTab('pnl')}
                className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'pnl' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
                Laporan Laba Rugi (Detail)
            </button>
            <button 
                onClick={() => setActiveTab('ledger')}
                className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'ledger' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
                Buku Besar Transaksi
            </button>
        </div>

        {/* TAB CONTENT: DASHBOARD */}
        {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-6">Analisa Arus Kas (6 Bulan Terakhir)</h3>
                    <div className="h-72">
                        <Line data={chartData.trend} options={{ responsive: true, maintainAspectRatio: false }} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-6">Proporsi Pengeluaran Aktual</h3>
                    <div className="h-64 flex justify-center">
                        <Doughnut data={chartData.expenseBreakdown} options={{ cutout: '60%' }} />
                    </div>
                    <div className="mt-6 text-center text-xs text-gray-500 italic">
                        *Grafik menampilkan distribusi uang keluar berdasarkan kategori transaksi.
                    </div>
                </div>
            </div>
        )}

        {/* TAB CONTENT: P&L */}
        {activeTab === 'pnl' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in max-w-4xl mx-auto">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">Profit & Loss Statement (Cash Basis)</h3>
                        <p className="text-sm text-gray-500">Laporan Laba Rugi Periode {selectedMonth + 1}/{selectedYear}</p>
                    </div>
                    <button className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors">
                        <Download size={16}/> Export PDF
                    </button>
                </div>
                
                <div className="p-8 space-y-6">
                    {/* REVENUE */}
                    <div>
                        <h4 className="text-sm font-black text-gray-400 uppercase mb-3 border-b pb-1 flex justify-between">
                            <span>Pendapatan Usaha</span>
                            <span className="text-emerald-600">+</span>
                        </h4>
                        <div className="space-y-2 pl-2">
                            <div className="flex justify-between text-base font-bold text-indigo-900">
                                <span>Total Uang Masuk (Revenue)</span><span>{formatCurrency(financialData.totalRevenueCash)}</span>
                            </div>
                            <p className="text-xs text-gray-400 italic">*Termasuk DP, Pelunasan Invoice, & Penjualan Langsung.</p>
                        </div>
                    </div>

                    {/* COGS & EXPENSES */}
                    <div>
                        <h4 className="text-sm font-black text-gray-400 uppercase mb-3 border-b pb-1 flex justify-between">
                            <span>Biaya & Beban (Tunai)</span>
                            <span className="text-red-600">-</span>
                        </h4>
                        <div className="space-y-2 pl-2 text-gray-700">
                            <div className="flex justify-between text-sm"><span>HPP Vendor & Sparepart (PO Paid)</span><span>({formatCurrency(financialData.cogsVendor)})</span></div>
                            <div className="flex justify-between text-sm"><span>Beban Gaji & Komisi (Payroll)</span><span>({formatCurrency(financialData.payrollExpense)})</span></div>
                            <div className="flex justify-between text-sm"><span>Biaya Operasional & Umum</span><span>({formatCurrency(financialData.operationalExpense)})</span></div>
                            <div className="flex justify-between text-sm text-red-600"><span>Beban Pajak (PPh/PPN Setor)</span><span>({formatCurrency(financialData.taxExpense)})</span></div>
                        </div>
                    </div>

                    {/* GROSS PROFIT CASH */}
                    <div className="flex justify-between items-center bg-gray-50 p-3 rounded font-bold text-gray-800 border border-gray-200">
                        <span>Surplus Operasional (EBITDA Proxy)</span>
                        <span>{formatCurrency(financialData.totalRevenueCash - (financialData.cogsVendor + financialData.payrollExpense + financialData.operationalExpense + financialData.taxExpense))}</span>
                    </div>

                    {/* NON-CASH EXPENSES */}
                    <div>
                        <h4 className="text-sm font-black text-gray-400 uppercase mb-3 border-b pb-1 flex justify-between">
                            <span>Beban Non-Tunai</span>
                            <span className="text-orange-500">-</span>
                        </h4>
                        <div className="space-y-2 pl-2 text-gray-600">
                            <div className="flex justify-between text-sm"><span>Penyusutan Aset Tetap</span><span>({formatCurrency(financialData.depreciationExpense)})</span></div>
                        </div>
                    </div>

                    {/* NET PROFIT */}
                    <div className="bg-indigo-900 text-white p-6 rounded-xl shadow-md mt-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h4 className="text-xl font-black">Laba Bersih (Net Profit)</h4>
                                <p className="text-xs opacity-70 mt-1">Sesuai Standar Akuntansi (Termasuk Penyusutan)</p>
                            </div>
                            <div className="text-right">
                                <h4 className="text-3xl font-black">{formatCurrency(financialData.netProfit)}</h4>
                            </div>
                        </div>
                    </div>

                    {/* CASH FLOW SECTION */}
                    <div className="mt-8 pt-6 border-t-2 border-dashed border-gray-300">
                        <h4 className="text-sm font-black text-gray-800 uppercase mb-4 flex items-center gap-2">
                            <Banknote size={16}/> Laporan Arus Kas (Cash Flow)
                        </h4>
                        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-lg space-y-2">
                            <div className="flex justify-between text-sm font-medium text-emerald-800">
                                <span>Surplus Operasional</span>
                                <span>{formatCurrency(financialData.totalRevenueCash - (financialData.cogsVendor + financialData.payrollExpense + financialData.operationalExpense + financialData.taxExpense))}</span>
                            </div>
                            <div className="flex justify-between text-sm text-red-600">
                                <span>Belanja Modal (Beli Aset/Capex)</span>
                                <span>({formatCurrency(financialData.assetPurchase)})</span>
                            </div>
                            <div className="border-t border-emerald-200 pt-2 mt-2 flex justify-between text-lg font-black text-emerald-900">
                                <span>Arus Kas Bersih (Net Cash Flow)</span>
                                <span>{formatCurrency(financialData.netCashFlow)}</span>
                            </div>
                            <p className="text-[10px] text-emerald-600 italic mt-1">*Angka ini menunjukkan kenaikan/penurunan uang kas riil di tangan/bank.</p>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* TAB CONTENT: LEDGER */}
        {activeTab === 'ledger' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <FileText size={18} className="text-gray-500"/>
                    <h3 className="font-bold text-gray-800">Buku Besar Transaksi (General Ledger)</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100 text-gray-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="px-6 py-3">Tanggal</th>
                                <th className="px-6 py-3">No. Ref</th>
                                <th className="px-6 py-3">Deskripsi Transaksi</th>
                                <th className="px-6 py-3">Kategori</th>
                                <th className="px-6 py-3 text-right">Debit (Masuk)</th>
                                <th className="px-6 py-3 text-right">Kredit (Keluar)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {ledgerData.map((tx, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                        {formatDateIndo(parseDate(tx.date))}
                                        <div className="text-[10px] opacity-60 font-mono">{tx.transactionNumber || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600">
                                        {tx.refNumber || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-800 font-medium">
                                        {tx.description}
                                        {tx.customerName && <div className="text-[10px] text-gray-500">{tx.customerName}</div>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${tx.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                            {tx.category}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-emerald-700 font-bold bg-emerald-50/10">
                                        {tx.type === 'IN' ? formatCurrency(tx.amount) : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-red-700 font-bold bg-red-50/10">
                                        {tx.type === 'OUT' ? formatCurrency(tx.amount) : '-'}
                                    </td>
                                </tr>
                            ))}
                            {ledgerData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-10 text-gray-400 italic">Tidak ada transaksi pada periode ini.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
    </div>
  );
};

export default AccountingView;
