import React, { useState, useMemo } from 'react';
import { Job, PurchaseOrder, CashierTransaction, Asset } from '../../types';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { ComposedChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';

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

  const financialData = useMemo(() => {
    const periodTransactions = transactions.filter(t => {
        const d = parseDate(t.date);
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    const totalRevenueCash = periodTransactions
        .filter(t => t.type === 'IN')
        .reduce((acc, t) => acc + t.amount, 0);

    let cogsVendor = 0; 
    let payrollExpense = 0; 
    let taxExpense = 0; 
    let assetPurchase = 0; 
    let operationalExpense = 0; 

    periodTransactions.filter(t => t.type === 'OUT').forEach(t => {
        const cat = (t.category || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();

        if (cat.includes('vendor') || cat.includes('supplier') || desc.includes('po-') || desc.includes('sublet')) {
            cogsVendor += t.amount;
        } else if (cat.includes('gaji') || cat.includes('payroll') || desc.includes('gaji') || desc.includes('thr') || desc.includes('bonus')) {
            payrollExpense += t.amount;
        } else if (cat.includes('pajak') || cat.includes('ppn') || cat.includes('pph')) {
            taxExpense += t.amount;
        } else if (cat.includes('aset') || cat.includes('investasi') || desc.includes('beli aset')) {
            assetPurchase += t.amount;
        } else {
            operationalExpense += t.amount;
        }
    });

    const totalCashOut = cogsVendor + payrollExpense + taxExpense + assetPurchase + operationalExpense;

    const depreciationExpense = assets.reduce((acc, asset) => {
        const pDate = parseDate(asset.purchaseDate);
        const reportDate = new Date(selectedYear, selectedMonth + 1, 0);
        if (pDate <= reportDate && asset.status === 'Active') {
            return acc + asset.monthlyDepreciation;
        }
        return acc;
    }, 0);

    const grossProfitCash = totalRevenueCash - cogsVendor;
    const totalOpexAccounting = payrollExpense + operationalExpense + taxExpense + depreciationExpense;
    const netProfit = grossProfitCash - totalOpexAccounting;
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

  const rechartsData = useMemo(() => {
      const trendData = [];
      
      for (let i = 5; i >= 0; i--) {
          const d = new Date();
          d.setMonth(selectedMonth - i);
          d.setFullYear(selectedYear); 
          const m = d.getMonth();
          const y = d.getFullYear();
          
          const label = d.toLocaleDateString('id-ID', { month: 'short' });

          const mTransactions = transactions.filter(t => {
              const td = parseDate(t.date);
              return td.getMonth() === m && td.getFullYear() === y;
          });

          const mIn = mTransactions.filter(t => t.type === 'IN').reduce((acc, t) => acc + t.amount, 0);
          const mOut = mTransactions.filter(t => t.type === 'OUT').reduce((acc, t) => acc + t.amount, 0);

          trendData.push({
              name: label,
              cashIn: mIn,
              netCash: mIn - mOut
          });
      }

      const expenseBreakdown = [
          { name: 'HPP Vendor', value: financialData.cogsVendor, fill: '#111111' },
          { name: 'Gaji Staff', value: financialData.payrollExpense, fill: '#444444' },
          { name: 'Operasional', value: financialData.operationalExpense, fill: '#888888' },
          { name: 'Pajak', value: financialData.taxExpense, fill: '#cacacb' },
          { name: 'Beli Aset', value: financialData.assetPurchase, fill: '#f4f4f5' }
      ].filter(item => item.value > 0);

      return {
          trendData,
          expenseBreakdown
      };
  }, [transactions, selectedMonth, selectedYear, financialData]);

  const ledgerData = useMemo(() => {
      return transactions.filter(t => {
          const d = parseDate(t.date);
          return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      }).sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  }, [transactions, selectedMonth, selectedYear]);

  return (
    <div className="animate-fade-in pb-[48px]">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-[48px] border-b border-hairline pb-[24px]">
            <div>
                <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">ACCOUNTING</h1>
                <p className="text-[16px] text-mute font-normal mt-[18px]">Laporan Keuangan Berbasis Transaksi Aktual (Cash Basis)</p>
            </div>
            
            <div className="flex items-center gap-2 mt-6 md:mt-0 bg-soft-cloud rounded-full px-4 py-2 border border-hairline">
                <select 
                    value={selectedMonth} 
                    onChange={e => setSelectedMonth(Number(e.target.value))}
                    className="bg-transparent border-none text-[16px] font-medium text-ink focus:ring-0 cursor-pointer"
                >
                    {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                    ))}
                </select>
                <span className="text-mute">/</span>
                <select 
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="bg-transparent border-none text-[16px] font-medium text-ink focus:ring-0 cursor-pointer"
                >
                    {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-[24px] mb-[48px]">
            <div className="bg-canvas p-6 md:p-8 border border-hairline flex flex-col justify-between">
                <p className="text-[14px] font-medium text-mute uppercase tracking-widest mb-4 border-b border-hairline pb-4">Revenue (Cash In)</p>
                <div>
                    <h2 className="text-[32px] font-medium text-ink leading-none">{formatCurrency(financialData.totalRevenueCash)}</h2>
                    <div className="mt-4 text-[12px] font-medium text-mute uppercase tracking-widest">
                        {financialData.countIn} Transaksi Masuk
                    </div>
                </div>
            </div>

            <div className="bg-canvas p-6 md:p-8 border border-hairline flex flex-col justify-between">
                <p className="text-[14px] font-medium text-mute uppercase tracking-widest mb-4 border-b border-hairline pb-4">Total Expenses (Cash Out)</p>
                <div>
                    <h2 className="text-[32px] font-medium text-ink leading-none">{formatCurrency(financialData.cogsVendor + financialData.payrollExpense + financialData.operationalExpense + financialData.taxExpense + financialData.assetPurchase)}</h2>
                    <div className="mt-4 text-[12px] font-medium text-mute uppercase tracking-widest">
                        All Expenses + Assets
                    </div>
                </div>
            </div>

            <div className="bg-canvas p-6 md:p-8 border border-hairline flex flex-col justify-between">
                <p className="text-[14px] font-medium text-mute uppercase tracking-widest mb-4 border-b border-hairline pb-4">Net Profit (Accounting)</p>
                <div>
                    <h2 className="text-[32px] font-medium text-ink leading-none">
                        {formatCurrency(financialData.netProfit)}
                    </h2>
                    <div className="mt-4 text-[12px] font-medium text-mute uppercase tracking-widest">
                        Revenue - Expenses - Depr.
                    </div>
                </div>
            </div>

             <div className="bg-ink p-6 md:p-8 flex flex-col justify-between">
                <p className="text-[14px] font-medium text-soft-cloud uppercase tracking-widest mb-4 border-b border-soft-cloud/20 pb-4">Net Cash Flow</p>
                <div>
                    <h2 className="text-[32px] font-medium text-canvas leading-none">{formatCurrency(financialData.netCashFlow)}</h2>
                    <div className="mt-4 text-[12px] font-medium text-mute uppercase tracking-widest">
                        Surplus/Defisit Kas Riil
                    </div>
                </div>
            </div>
        </div>

        {/* TABS NAVIGATION */}
        <div className="flex gap-6 md:gap-8 border-b border-hairline mb-[48px]">
            <button 
                onClick={() => setActiveTab('dashboard')}
                className={`pb-4 text-[14px] font-medium uppercase tracking-widest transition-colors ${activeTab === 'dashboard' ? 'border-b-2 border-ink text-ink' : 'text-mute hover:text-ink'}`}
            >
                DASHBOARD
            </button>
            <button 
                onClick={() => setActiveTab('pnl')}
                className={`pb-4 text-[14px] font-medium uppercase tracking-widest transition-colors ${activeTab === 'pnl' ? 'border-b-2 border-ink text-ink' : 'text-mute hover:text-ink'}`}
            >
                PROFIT & LOSS
            </button>
            <button 
                onClick={() => setActiveTab('ledger')}
                className={`pb-4 text-[14px] font-medium uppercase tracking-widest transition-colors ${activeTab === 'ledger' ? 'border-b-2 border-ink text-ink' : 'text-mute hover:text-ink'}`}
            >
                GENERAL LEDGER
            </button>
        </div>

        {/* TAB CONTENT: DASHBOARD */}
        {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-[24px] animate-fade-in">
                <div className="lg:col-span-2 bg-canvas p-6 md:p-8 border border-hairline">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px] mb-8 border-b border-hairline pb-4">Analisa Arus Kas (6 Bulan)</h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={rechartsData.trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} 
                                    tickFormatter={(value) => {
                                        if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
                                        if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                                        return value;
                                    }}
                                />
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', fontSize: '12px', textTransform: 'uppercase' }}
                                    formatter={(value: number, name: string) => {
                                        return [formatCurrency(value), name];
                                    }}
                                />
                                <Legend wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase' }} />
                                <Line type="monotone" dataKey="cashIn" name="Uang Masuk (Cash In)" stroke="#111111" strokeWidth={2} dot={{ r: 4 }} />
                                <Line type="monotone" dataKey="netCash" name="Surplus Kas Bersih" stroke="#cacacb" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="bg-canvas p-6 md:p-8 border border-hairline">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px] mb-8 border-b border-hairline pb-4">Proporsi Pengeluaran</h3>
                    <div className="h-64 flex justify-center relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={rechartsData.expenseBreakdown}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={90}
                                    paddingAngle={2}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {rechartsData.expenseBreakdown.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Pie>
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', fontSize: '12px', textTransform: 'uppercase' }}
                                    formatter={(value: number) => formatCurrency(value)}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-8 pt-4 border-t border-hairline flex flex-col gap-2">
                        {rechartsData.expenseBreakdown.map((item, i) => (
                            <div key={i} className="flex justify-between items-center">
                                <span className="text-[12px] font-medium text-ink uppercase tracking-widest">{item.name}</span>
                                <span className="text-[14px] font-medium text-ink">{formatCurrency(item.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* TAB CONTENT: P&L */}
        {activeTab === 'pnl' && (
            <div className="bg-canvas border border-hairline animate-fade-in max-w-4xl mx-auto">
                <div className="p-8 border-b border-hairline flex justify-between items-center bg-soft-cloud">
                    <div>
                        <h3 className="text-[24px] font-medium text-ink uppercase tracking-widest">Profit & Loss Statement</h3>
                        <p className="text-[14px] text-mute font-medium uppercase tracking-widest mt-2">Periode {selectedMonth + 1}/{selectedYear} (Cash Basis)</p>
                    </div>
                    <button className="text-[12px] font-medium text-ink border border-ink px-4 py-2 uppercase tracking-widest hover:bg-ink hover:text-canvas transition-colors">
                        EXPORT PDF
                    </button>
                </div>
                
                <div className="p-8 md:p-12 space-y-12">
                    {/* REVENUE */}
                    <div>
                        <h4 className="text-[14px] font-medium text-mute uppercase tracking-widest mb-4 border-b border-hairline pb-2 flex justify-between">
                            <span>Pendapatan Usaha</span>
                        </h4>
                        <div className="space-y-4">
                            <div className="flex justify-between text-[16px] font-medium text-ink">
                                <span>Total Uang Masuk (Revenue)</span><span>{formatCurrency(financialData.totalRevenueCash)}</span>
                            </div>
                            <p className="text-[12px] text-mute italic">*Termasuk DP, Pelunasan Invoice, & Penjualan Langsung.</p>
                        </div>
                    </div>

                    {/* COGS & EXPENSES */}
                    <div>
                        <h4 className="text-[14px] font-medium text-mute uppercase tracking-widest mb-4 border-b border-hairline pb-2 flex justify-between">
                            <span>Biaya & Beban (Tunai)</span>
                        </h4>
                        <div className="space-y-4">
                            <div className="flex justify-between text-[16px] text-ink"><span>HPP Vendor & Sparepart (PO Paid)</span><span>({formatCurrency(financialData.cogsVendor)})</span></div>
                            <div className="flex justify-between text-[16px] text-ink"><span>Beban Gaji & Komisi (Payroll)</span><span>({formatCurrency(financialData.payrollExpense)})</span></div>
                            <div className="flex justify-between text-[16px] text-ink"><span>Biaya Operasional & Umum</span><span>({formatCurrency(financialData.operationalExpense)})</span></div>
                            <div className="flex justify-between text-[16px] text-ink"><span>Beban Pajak (PPh/PPN Setor)</span><span>({formatCurrency(financialData.taxExpense)})</span></div>
                        </div>
                    </div>

                    {/* GROSS PROFIT CASH */}
                    <div className="flex justify-between items-center bg-soft-cloud p-4 font-medium text-ink border border-hairline text-[16px]">
                        <span className="uppercase tracking-widest">Surplus Operasional (EBITDA Proxy)</span>
                        <span>{formatCurrency(financialData.totalRevenueCash - (financialData.cogsVendor + financialData.payrollExpense + financialData.operationalExpense + financialData.taxExpense))}</span>
                    </div>

                    {/* NON-CASH EXPENSES */}
                    <div>
                        <h4 className="text-[14px] font-medium text-mute uppercase tracking-widest mb-4 border-b border-hairline pb-2 flex justify-between">
                            <span>Beban Non-Tunai</span>
                        </h4>
                        <div className="space-y-4">
                            <div className="flex justify-between text-[16px] text-ink"><span>Penyusutan Aset Tetap</span><span>({formatCurrency(financialData.depreciationExpense)})</span></div>
                        </div>
                    </div>

                    {/* NET PROFIT */}
                    <div className="bg-ink text-canvas p-8">
                        <div className="flex justify-between items-center">
                            <div>
                                <h4 className="text-[20px] font-medium uppercase tracking-widest">Net Profit</h4>
                                <p className="text-[12px] opacity-70 mt-2 uppercase tracking-widest">Standar Akuntansi</p>
                            </div>
                            <div className="text-right">
                                <h4 className="text-[40px] font-display">{formatCurrency(financialData.netProfit)}</h4>
                            </div>
                        </div>
                    </div>

                    {/* CASH FLOW SECTION */}
                    <div className="mt-12 pt-8 border-t border-ink">
                        <h4 className="text-[16px] font-medium text-ink uppercase tracking-widest mb-6">
                            Laporan Arus Kas (Cash Flow)
                        </h4>
                        <div className="bg-canvas border border-hairline p-6 space-y-4">
                            <div className="flex justify-between text-[16px] font-medium text-ink">
                                <span>Surplus Operasional</span>
                                <span>{formatCurrency(financialData.totalRevenueCash - (financialData.cogsVendor + financialData.payrollExpense + financialData.operationalExpense + financialData.taxExpense))}</span>
                            </div>
                            <div className="flex justify-between text-[16px] text-ink">
                                <span>Belanja Modal (Beli Aset/Capex)</span>
                                <span>({formatCurrency(financialData.assetPurchase)})</span>
                            </div>
                            <div className="border-t border-hairline pt-4 mt-4 flex justify-between text-[20px] font-medium text-ink uppercase">
                                <span>Net Cash Flow</span>
                                <span>{formatCurrency(financialData.netCashFlow)}</span>
                            </div>
                            <p className="text-[12px] text-mute italic mt-2">*Angka ini menunjukkan kenaikan/penurunan uang kas riil di tangan/bank.</p>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* TAB CONTENT: LEDGER */}
        {activeTab === 'ledger' && (
            <div className="bg-canvas border border-hairline animate-fade-in">
                <div className="p-6 bg-soft-cloud border-b border-hairline">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">General Ledger</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-canvas text-mute font-medium uppercase tracking-widest text-[12px] border-b border-hairline">
                            <tr>
                                <th className="px-6 py-4 font-normal">Tanggal</th>
                                <th className="px-6 py-4 font-normal">No. Ref</th>
                                <th className="px-6 py-4 font-normal">Deskripsi</th>
                                <th className="px-6 py-4 font-normal">Kategori</th>
                                <th className="px-6 py-4 text-right font-normal">Debit</th>
                                <th className="px-6 py-4 text-right font-normal">Kredit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                            {ledgerData.map((tx, idx) => (
                                <tr key={idx} className="hover:bg-soft-cloud transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-[14px] text-ink font-medium">{formatDateIndo(parseDate(tx.date))}</div>
                                        <div className="text-[10px] text-mute font-mono uppercase tracking-widest mt-1">{tx.transactionNumber || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-[12px] text-ink">
                                        {tx.refNumber || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-[14px] text-ink">
                                        {tx.description}
                                        {tx.customerName && <div className="text-[12px] text-mute mt-1">{tx.customerName}</div>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-3 py-1 border border-hairline text-[10px] font-medium uppercase tracking-widest text-ink">
                                            {tx.category}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-[14px] text-ink bg-soft-cloud/50">
                                        {tx.type === 'IN' ? formatCurrency(tx.amount) : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-[14px] text-ink bg-soft-cloud/50">
                                        {tx.type === 'OUT' ? formatCurrency(tx.amount) : '-'}
                                    </td>
                                </tr>
                            ))}
                            {ledgerData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-12 text-mute text-[14px]">Tidak ada transaksi.</td>
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
