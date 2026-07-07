
import React, { useState } from 'react';
import { Job, CashierTransaction, PurchaseOrder, InventoryItem, Vehicle } from '../../types';
import * as XLSX from 'xlsx';
import { formatDateIndo, formatCurrency } from '../../utils/helpers';
import { FileSpreadsheet, Download, Calendar, Activity, DollarSign, Package, User, ShoppingCart, BarChart3, TrendingUp, Shield, MapPin, Car, Database, Landmark, Scale, Wallet, Loader2 } from 'lucide-react';
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION, CASHIER_COLLECTION, PURCHASE_ORDERS_COLLECTION, SPAREPART_COLLECTION, UNITS_MASTER_COLLECTION } from '../../services/firebase';

interface ReportCenterViewProps {
  jobs: Job[];
  transactions: CashierTransaction[];
  purchaseOrders: PurchaseOrder[];
  inventoryItems: InventoryItem[];
  vehicles: Vehicle[];
}

const ReportCenterView: React.FC<ReportCenterViewProps> = ({ jobs: _j, transactions: _t, purchaseOrders: _p, inventoryItems: _i, vehicles: _v }) => {
  // Default to First Day of Month -> Today
  const [startDate, setStartDate] = useState(() => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExport = async (type: string) => {
      setIsGenerating(true);
      try {
          let filename = `Report_${type}_${startDate}_to_${endDate}.xlsx`;
          const wb = XLSX.utils.book_new();
          let data: any[] = [];
          
          // Setup Date Objects for Query (Start 00:00 - End 23:59)
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);

          const startTs = Timestamp.fromDate(start);
          const endTs = Timestamp.fromDate(end);

          // Helper to fetch docs with constraints
          const fetchDocs = async (col: string, constraints: any[] = []) => {
              try {
                  const q = query(collection(db, col), ...constraints);
                  const snap = await getDocs(q);
                  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
              } catch (err) {
                  console.error(`Error fetching ${col}:`, err);
                  throw err;
              }
          };

          switch (type) {
              case 'VEHICLE_DATABASE':
                  // Master DB is a Snapshot (Fetch All, no date filter)
                  const allVehicles = await fetchDocs(UNITS_MASTER_COLLECTION) as Vehicle[];
                  
                  const uniqueVehiclesMap = new Map<string, Vehicle>();
                  const sortedVehicles = [...allVehicles].sort((a, b) => {
                      const dateA = (a as any).updatedAt?.seconds || 0;
                      const dateB = (b as any).updatedAt?.seconds || 0;
                      return dateB - dateA;
                  });
                  
                  sortedVehicles.forEach(v => {
                      const nopol = (v.policeNumber || '').toUpperCase().replace(/\s/g, '');
                      if (nopol && !uniqueVehiclesMap.has(nopol)) uniqueVehiclesMap.set(nopol, v);
                  });

                  data = Array.from(uniqueVehiclesMap.values()).map(v => ({
                      'No. Polisi': v.policeNumber,
                      'Nama Pelanggan': v.customerName,
                      'No. WhatsApp/HP': v.customerPhone,
                      'Alamat Lengkap': v.customerAddress || '-',
                      'Kota/Kabupaten': v.customerKota || '-',
                      'Merk': v.carBrand,
                      'Tipe / Model': v.carModel,
                      'Warna': v.warnaMobil,
                      'Pihak Penjamin (Asuransi)': v.namaAsuransi,
                      'Tahun': v.tahunPembuatan,
                      'Terdaftar Sejak': v.createdAt ? formatDateIndo(v.createdAt) : '-'
                  }));
                  filename = `Database_Master_Unit_${new Date().toISOString().split('T')[0]}.xlsx`;
                  break;

              case 'TAX_REPORT':
                  // Fetch Transactions (Cashier) with Date Range
                  const taxTrans = await fetchDocs(CASHIER_COLLECTION, [
                      where('date', '>=', startTs),
                      where('date', '<=', endTs)
                  ]) as CashierTransaction[];

                  data = taxTrans
                    .filter(t => t.category.includes('Pajak') || (t.description && (t.description.toLowerCase().includes('ppn') || t.description.toLowerCase().includes('pph'))))
                    .map(t => ({
                        'No. Transaksi': t.transactionNumber || '-',
                        'Tanggal': formatDateIndo(t.date),
                        'Tipe': t.type === 'IN' ? 'Pajak Masuk (Terima)' : 'Pajak Keluar (Setor)',
                        'Kategori': t.category,
                        'Ref Dokumen': t.refNumber || '-',
                        'Pihak Terkait': t.customerName || '-',
                        'Nominal (Rp)': t.amount,
                        'Bukti Potong': t.taxCertificateNumber || '-',
                        'Keterangan': t.description || '-',
                        'Admin': t.createdBy || '-'
                    }));
                  
                  if (data.length > 0) {
                      const total = data.reduce((acc, curr) => acc + (curr['Nominal (Rp)'] || 0), 0);
                      data.push({ 'Tanggal': 'TOTAL PERIODE', 'Nominal (Rp)': total });
                  }
                  filename = `Laporan_Pajak_${startDate}_to_${endDate}.xlsx`;
                  break;

              case 'RECEIVABLE_REPORT':
                  // Snapshot of current receivables (No Date Filter usually, or filter by created date)
                  // Strategy: Fetch all jobs with invoice, calc remaining locally
                  const invoicedJobs = await fetchDocs(SERVICE_JOBS_COLLECTION, [where('hasInvoice', '==', true)]) as Job[];
                  
                  // Need ALL IN transactions to calculate balance properly
                  // Optimization: Fetch only IN transactions, client-side match
                  const allInTrx = await fetchDocs(CASHIER_COLLECTION, [where('type', '==', 'IN')]) as CashierTransaction[];

                  data = invoicedJobs
                    .filter(j => !j.isDeleted)
                    .map(job => {
                        const totalBill = job.estimateData?.grandTotal || 0;
                        const paidAmount = allInTrx
                            .filter(t => t.refJobId === job.id)
                            .reduce((acc, t) => acc + (t.amount || 0), 0);
                        const remaining = totalBill - paidAmount;
                        return {
                            'No. Invoice': job.invoiceNumber || '-',
                            'No. WO': job.woNumber,
                            'No. Polisi': job.policeNumber,
                            'Pelanggan': job.customerName,
                            'Asuransi': job.namaAsuransi,
                            'Tgl Masuk': formatDateIndo(job.tanggalMasuk),
                            'Total Tagihan': totalBill,
                            'Sudah Dibayar': paidAmount,
                            'Sisa Piutang': remaining,
                            'Status': job.isClosed ? 'Closed' : 'Open'
                        };
                    })
                    .filter(r => r['Sisa Piutang'] > 100); // Filter active debt
                  
                  if (data.length > 0) {
                      const tRem = data.reduce((acc, curr) => acc + curr['Sisa Piutang'], 0);
                      data.push({ 'Pelanggan': 'TOTAL PIUTANG', 'Sisa Piutang': tRem });
                  }
                  filename = `Laporan_Piutang_Unit_${new Date().toISOString().split('T')[0]}.xlsx`;
                  break;

              case 'DEBT_REPORT':
                  // Snapshot of current payables
                  const allPOs = await fetchDocs(PURCHASE_ORDERS_COLLECTION) as PurchaseOrder[];
                  const allOutTrx = await fetchDocs(CASHIER_COLLECTION, [where('type', '==', 'OUT')]) as CashierTransaction[];

                  data = allPOs
                    .filter(po => ['Received', 'Partial', 'Ordered'].includes(po.status))
                    .map(po => {
                        const totalBill = po.totalAmount;
                        const paidAmount = allOutTrx
                            .filter(t => t.refPoId === po.id)
                            .reduce((acc, t) => acc + t.amount, 0);
                        const remaining = totalBill - paidAmount;
                        return {
                            'No. PO': po.poNumber,
                            'Tanggal PO': po.createdAt ? formatDateIndo(po.createdAt) : '-', 
                            'Supplier': po.supplierName,
                            'Total Hutang': totalBill,
                            'Sudah Dibayar': paidAmount,
                            'Sisa Hutang': remaining,
                            'Status PO': po.status
                        };
                    })
                    .filter(p => p['Sisa Hutang'] > 100);
                  
                  if (data.length > 0) {
                      const tRem = data.reduce((acc, curr) => acc + curr['Sisa Hutang'], 0);
                      data.push({ 'Supplier': 'TOTAL HUTANG', 'Sisa Hutang': tRem });
                  }
                  filename = `Laporan_Hutang_Supplier_${new Date().toISOString().split('T')[0]}.xlsx`;
                  break;

              case 'UNIT_FLOW':
                  // Filter by CreatedAt Range
                  const flowJobs = await fetchDocs(SERVICE_JOBS_COLLECTION, [
                      where('createdAt', '>=', startTs),
                      where('createdAt', '<=', endTs)
                  ]) as Job[];

                  data = flowJobs.map(j => ({
                      'Tgl Masuk': formatDateIndo(j.tanggalMasuk), 
                      'No. WO': j.woNumber || '-', 
                      'No. Polisi': j.policeNumber, 
                      'Pelanggan': j.customerName, 
                      'Status Unit': j.statusKendaraan, 
                      'Posisi': j.posisiKendaraan,
                      'SA': j.namaSA, 
                      'Estimasi Total': j.estimateData?.grandTotal || 0
                  }));
                  break;

              case 'PROFIT_LOSS_UNIT':
                  // Filter by ClosedAt Range
                  const closedJobs = await fetchDocs(SERVICE_JOBS_COLLECTION, [
                      where('closedAt', '>=', startTs),
                      where('closedAt', '<=', endTs)
                  ]) as Job[];

                  data = closedJobs.map(j => {
                      const rev = (j.hargaJasa || 0) + (j.hargaPart || 0);
                      const cogs = (j.costData?.hargaModalBahan || 0) + (j.costData?.hargaBeliPart || 0) + (j.costData?.jasaExternal || 0);
                      return { 
                          'No. Invoice': j.invoiceNumber || '-',
                          'No. WO': j.woNumber, 
                          'No. Polisi': j.policeNumber, 
                          'Asuransi': j.namaAsuransi,
                          'Revenue (Net)': rev, 
                          'HPP Total': cogs, 
                          'Gross Profit': rev - cogs,
                          'Tgl Closing': formatDateIndo(j.closedAt)
                      };
                  });

                  if (data.length > 0) {
                      const tGp = data.reduce((acc, curr) => acc + curr['Gross Profit'], 0);
                      data.push({ 'No. Polisi': 'TOTAL GP PERIODE', 'Gross Profit': tGp });
                  }
                  break;

              case 'CASHIER':
                  // Filter by Date Range
                  const cashierTrx = await fetchDocs(CASHIER_COLLECTION, [
                      where('date', '>=', startTs),
                      where('date', '<=', endTs)
                  ]) as CashierTransaction[];

                  data = cashierTrx.map(t => ({ 
                      'No. Transaksi': t.transactionNumber || '-',
                      'Tanggal': formatDateIndo(t.date), 
                      'Tipe': t.type === 'IN' ? 'MASUK' : 'KELUAR', 
                      'Kategori': t.category, 
                      'Ref': t.refNumber || '-', 
                      'Pihak': t.customerName || '-',
                      'Nominal': t.amount, 
                      'Metode': t.paymentMethod,
                      'Keterangan': t.description || '-',
                      'User': t.createdBy || '-'
                  }));
                  
                  if (data.length > 0) {
                      const net = data.reduce((acc, curr) => acc + (curr['Tipe'] === 'MASUK' ? curr['Nominal'] : -curr['Nominal']), 0);
                      data.push({ 'Keterangan': 'NET CASH FLOW', 'Nominal': net });
                  }
                  filename = `Laporan_Arus_Kasir_${startDate}_to_${endDate}.xlsx`;
                  break;

              case 'INVENTORY_STOCK':
                  // Snapshot (All Items)
                  const allInventory = await fetchDocs(SPAREPART_COLLECTION) as InventoryItem[];
                  data = allInventory.map(i => ({ 
                      'Kode': i.code, 
                      'Nama Barang': i.name, 
                      'Kategori': i.category,
                      'Stok Akhir': i.stock, 
                      'Satuan': i.unit, 
                      'Harga Beli': i.buyPrice,
                      'Total Aset': i.stock * i.buyPrice 
                  }));

                  if (data.length > 0) {
                      const totalValue = data.reduce((acc, curr) => acc + curr['Total Aset'], 0);
                      data.push({ 'Nama Barang': 'TOTAL VALUASI GUDANG', 'Total Aset': totalValue });
                  }
                  filename = `Valuasi_Stok_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`;
                  break;
                
              case 'MECHANIC_PROD':
                  // Closed Jobs in Range
                  const prodJobs = await fetchDocs(SERVICE_JOBS_COLLECTION, [
                      where('closedAt', '>=', startTs),
                      where('closedAt', '<=', endTs)
                  ]) as Job[];

                  const mStats: any = {};
                  prodJobs.forEach(j => {
                      const involvedMechs = Array.from(new Set(j.assignedMechanics?.map(a => a.name) || []));
                      involvedMechs.forEach((mName: any) => {
                          if (!mStats[mName]) mStats[mName] = { 'Nama Mekanik': mName, 'Unit Selesai': 0, 'Panel Selesai': 0 };
                          mStats[mName]['Unit Selesai']++;
                          
                          const mechAssignment = j.assignedMechanics?.find(a => a.name === mName);
                          const panels = mechAssignment?.panelCount || 0; 
                          const finalPanels = panels > 0 ? panels : (j.estimateData?.jasaItems?.reduce((acc, i) => acc + (i.panelCount || 0), 0) || 0);

                          mStats[mName]['Panel Selesai'] += finalPanels;
                      });
                  });
                  data = Object.values(mStats);
                  filename = `Produktivitas_Mekanik_${startDate}_to_${endDate}.xlsx`;
                  break;
          }

          if (data.length === 0) {
              alert(`Tidak ada data ditemukan untuk laporan ${type}.\n\nPeriode: ${formatDateIndo(start)} s/d ${formatDateIndo(end)}\n\nPastikan ada transaksi/data pada rentang tanggal tersebut.`);
              setIsGenerating(false);
              return;
          }

          const ws = XLSX.utils.json_to_sheet(data);
          const colWidths = Object.keys(data[0]).map(key => {
              // Simple width calc
              return { wch: 20 };
          });
          ws['!cols'] = colWidths;

          XLSX.utils.book_append_sheet(wb, ws, "Data Report");
          XLSX.writeFile(wb, filename);

      } catch (error: any) {
          console.error("Export Error:", error);
          alert(`Gagal memproses laporan: ${error.message}`);
      } finally {
          setIsGenerating(false);
      }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-700 rounded-xl shadow-sm text-white">
                    <FileSpreadsheet size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Pusat Laporan</h1>
                    <p className="text-sm text-gray-500 font-medium">Data Audit, Finansial & Produksi dengan Rekapitulasi TOTAL</p>
                </div>
            </div>
            
            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <Calendar size={18} className="text-gray-500"/>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-white border border-gray-300 rounded px-2 py-1 text-sm font-medium"/>
                <span className="text-gray-400 font-bold">-</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-white border border-gray-300 rounded px-2 py-1 text-sm font-medium"/>
            </div>
        </div>

        {isGenerating && (
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center">
                <div className="bg-white p-6 rounded-xl shadow-2xl flex flex-col items-center">
                    <Loader2 size={40} className="text-indigo-600 animate-spin mb-3"/>
                    <p className="font-bold text-gray-800">Sedang Mengunduh Data...</p>
                    <p className="text-xs text-gray-500">Mohon tunggu, sedang mengambil data dari server.</p>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-indigo-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-indigo-50/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-900 text-white rounded-lg"><Database size={20}/></div>
                    <h3 className="font-bold text-gray-800">Database Master Unit</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Data lengkap pelanggan & kendaraan dari menu Input Unit (Full Snapshot).</p>
                <button onClick={() => handleExport('VEHICLE_DATABASE')} disabled={isGenerating} className="w-full py-2 bg-indigo-900 text-white font-bold rounded-lg hover:bg-black flex items-center justify-center gap-2 disabled:opacity-50">
                    <Download size={16}/> Export Master DB
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-rose-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-rose-50/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-rose-600 text-white rounded-lg"><Landmark size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Pajak (Audit)</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Rekapitulasi PPN Masukan/Keluaran, PPh 23, dan PPh 25 lengkap dengan TOTAL nominal.</p>
                <button onClick={() => handleExport('TAX_REPORT')} disabled={isGenerating} className="w-full py-2 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 flex items-center justify-center gap-2 disabled:opacity-50">
                    <Download size={16}/> Download Data Pajak
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-emerald-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-emerald-50/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-600 text-white rounded-lg"><Wallet size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Piutang Unit</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Daftar sisa tagihan per WO yang belum lunas dilengkapi ringkasan TOTAL piutang.</p>
                <button onClick={() => handleExport('RECEIVABLE_REPORT')} disabled={isGenerating} className="w-full py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2 disabled:opacity-50">
                    <Download size={16}/> Download Data Piutang
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-orange-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-orange-50/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-orange-600 text-white rounded-lg"><Scale size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Hutang Supplier</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Daftar sisa hutang PO (Received) lengkap dengan Tgl PO, Catatan, dan TOTAL hutang.</p>
                <button onClick={() => handleExport('DEBT_REPORT')} disabled={isGenerating} className="w-full py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 flex items-center justify-center gap-2 disabled:opacity-50">
                    <Download size={16}/> Download Data Hutang
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Activity size={20}/></div>
                    <h3 className="font-bold text-gray-800">Log Unit & Produksi</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Rekapitulasi unit masuk, status progress, dan rekap TOTAL panel produksi (by Tanggal Masuk).</p>
                <button onClick={() => handleExport('UNIT_FLOW')} disabled={isGenerating} className="w-full py-2 bg-white border border-blue-200 text-blue-700 font-bold rounded-lg hover:bg-blue-50 flex items-center justify-center gap-2 disabled:opacity-50">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-emerald-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-emerald-50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><DollarSign size={20}/></div>
                    <h3 className="font-bold text-gray-800">Arus Kasir (Audit Log)</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Histori uang masuk/keluar lengkap dengan Catatan, Admin, dan TOTAL saldo periode.</p>
                <button onClick={() => handleExport('CASHIER')} disabled={isGenerating} className="w-full py-2 bg-white border border-emerald-200 text-emerald-700 font-bold rounded-lg hover:bg-emerald-50 flex items-center justify-center gap-2 disabled:opacity-50">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><BarChart3 size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laba Rugi per WO</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Analisa revenue, HPP, dan Gross Profit per WO lengkap dengan TOTAL laba kotor.</p>
                <button onClick={() => handleExport('PROFIT_LOSS_UNIT')} disabled={isGenerating} className="w-full py-2 bg-white border border-indigo-200 text-indigo-700 font-bold rounded-lg hover:bg-blue-50 flex items-center justify-center gap-2 disabled:opacity-50">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-cyan-100 text-cyan-600 rounded-lg"><Package size={20}/></div>
                    <h3 className="font-bold text-gray-800">Valuasi Stok Opname</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Daftar stok akhir inventory lengkap dengan harga beli dan TOTAL valuasi gudang.</p>
                <button onClick={() => handleExport('INVENTORY_STOCK')} disabled={isGenerating} className="w-full py-2 bg-white border border-cyan-200 text-cyan-700 font-bold rounded-lg hover:bg-blue-50 flex items-center justify-center gap-2 disabled:opacity-50">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>
            
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-slate-100 text-slate-600 rounded-lg"><User size={20}/></div>
                    <h3 className="font-bold text-gray-800">Produktivitas Mekanik</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Rekap performa mekanik (Unit & Panel) lengkap dengan TOTAL pencapaian tim.</p>
                <button onClick={() => handleExport('MECHANIC_PROD')} disabled={isGenerating} className="w-full py-2 bg-white border border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 disabled:opacity-50">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>
        </div>
    </div>
  );
};

export default ReportCenterView;
