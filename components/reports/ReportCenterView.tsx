import React, { useState } from 'react';
import { Job, CashierTransaction, PurchaseOrder, InventoryItem, Vehicle } from '../../types';
import * as XLSX from 'xlsx';
import { formatDateIndo, formatCurrency } from '../../utils/helpers';
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
          
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);

          const startTs = Timestamp.fromDate(start);
          const endTs = Timestamp.fromDate(end);

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
                  const invoicedJobs = await fetchDocs(SERVICE_JOBS_COLLECTION, [where('hasInvoice', '==', true)]) as Job[];
                  
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
                    .filter(r => r['Sisa Piutang'] > 100); 
                  
                  if (data.length > 0) {
                      const tRem = data.reduce((acc, curr) => acc + curr['Sisa Piutang'], 0);
                      data.push({ 'Pelanggan': 'TOTAL PIUTANG', 'Sisa Piutang': tRem });
                  }
                  filename = `Laporan_Piutang_Unit_${new Date().toISOString().split('T')[0]}.xlsx`;
                  break;

              case 'DEBT_REPORT':
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
                          
                          const specificAssignments = j.assignedMechanics?.filter(a => a.name === mName) || [];
                          const hasExplicitPanels = specificAssignments.some(a => a.panelCount !== undefined);
                          const assignedPanels = specificAssignments.reduce((acc, a) => acc + (a.panelCount || 0), 0);
                          const finalPanels = hasExplicitPanels ? assignedPanels : (j.estimateData?.jasaItems?.reduce((acc, i) => acc + (i.panelCount || 0), 0) || 0);

                          mStats[mName]['Panel Selesai'] += finalPanels;
                      });
                  });
                  data = Object.values(mStats);
                  filename = `Produktivitas_Mekanik_${startDate}_to_${endDate}.xlsx`;
                  break;
          }

          if (data.length === 0) {
              alert(`TIDAK ADA DATA DITEMUKAN UNTUK LAPORAN ${type}.\n\nPERIODE: ${formatDateIndo(start)} S/D ${formatDateIndo(end)}\n\nPASTIKAN ADA TRANSAKSI/DATA PADA RENTANG TANGGAL TERSEBUT.`);
              setIsGenerating(false);
              return;
          }

          const ws = XLSX.utils.json_to_sheet(data);
          const colWidths = Object.keys(data[0]).map(key => {
              return { wch: 20 };
          });
          ws['!cols'] = colWidths;

          XLSX.utils.book_append_sheet(wb, ws, "Data Report");
          XLSX.writeFile(wb, filename);

      } catch (error: any) {
          console.error("Export Error:", error);
          alert(`GAGAL MEMPROSES LAPORAN: ${error.message}`);
      } finally {
          setIsGenerating(false);
      }
  };

  return (
    <div className="animate-fade-in pb-[48px]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-[48px] border-b border-hairline pb-[24px]">
            <div>
                <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">PUSAT LAPORAN</h1>
                <p className="text-[16px] text-mute font-normal mt-[18px] uppercase tracking-widest">
                    DATA AUDIT, FINANSIAL & PRODUKSI DENGAN REKAPITULASI TOTAL.
                </p>
            </div>
            
            <div className="flex items-center gap-4 bg-canvas border border-hairline p-2 rounded-2xl overflow-hidden">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-canvas border-none focus:outline-none font-medium text-[12px] uppercase text-ink p-2"/>
                <span className="text-mute font-medium text-[12px] uppercase">-</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-canvas border-none focus:outline-none font-medium text-[12px] uppercase text-ink p-2"/>
            </div>
        </div>

        {isGenerating && (
            <div className="fixed inset-0 bg-canvas/90 z-50 flex items-center justify-center">
                <div className="bg-canvas p-8 border border-ink flex flex-col items-center">
                    <div className="text-ink font-display text-[48px] uppercase tracking-widest animate-pulse mb-4">MEMPROSES</div>
                    <p className="text-[10px] text-mute font-medium uppercase tracking-widest">MOHON TUNGGU, SEDANG MENGAMBIL DATA DARI SERVER...</p>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[24px]">
            <div className="bg-canvas border border-hairline p-6 hover:border-ink transition-colors group flex flex-col justify-between rounded-2xl overflow-hidden">
                <div>
                    <h3 className="font-medium text-[14px] text-ink uppercase tracking-widest mb-4">DATABASE MASTER UNIT</h3>
                    <p className="text-[10px] text-mute uppercase tracking-widest mb-8 leading-relaxed">DATA LENGKAP PELANGGAN & KENDARAAN DARI MENU INPUT UNIT (FULL SNAPSHOT).</p>
                </div>
                <button onClick={() => handleExport('VEHICLE_DATABASE')} disabled={isGenerating} className="w-full py-4 border border-hairline group-hover:border-ink text-ink font-medium text-[10px] uppercase tracking-widest hover:bg-soft-cloud transition-colors disabled:opacity-50">
                    EXPORT MASTER DB
                </button>
            </div>

            <div className="bg-canvas border border-hairline p-6 hover:border-ink transition-colors group flex flex-col justify-between rounded-2xl overflow-hidden">
                <div>
                    <h3 className="font-medium text-[14px] text-ink uppercase tracking-widest mb-4">LAPORAN PAJAK (AUDIT)</h3>
                    <p className="text-[10px] text-mute uppercase tracking-widest mb-8 leading-relaxed">REKAPITULASI PPN MASUKAN/KELUARAN, PPH 23, DAN PPH 25 LENGKAP DENGAN TOTAL NOMINAL.</p>
                </div>
                <button onClick={() => handleExport('TAX_REPORT')} disabled={isGenerating} className="w-full py-4 border border-hairline group-hover:border-ink text-ink font-medium text-[10px] uppercase tracking-widest hover:bg-soft-cloud transition-colors disabled:opacity-50">
                    DOWNLOAD DATA PAJAK
                </button>
            </div>

            <div className="bg-canvas border border-hairline p-6 hover:border-ink transition-colors group flex flex-col justify-between rounded-2xl overflow-hidden">
                <div>
                    <h3 className="font-medium text-[14px] text-ink uppercase tracking-widest mb-4">LAPORAN PIUTANG UNIT</h3>
                    <p className="text-[10px] text-mute uppercase tracking-widest mb-8 leading-relaxed">DAFTAR SISA TAGIHAN PER WO YANG BELUM LUNAS DILENGKAPI RINGKASAN TOTAL PIUTANG.</p>
                </div>
                <button onClick={() => handleExport('RECEIVABLE_REPORT')} disabled={isGenerating} className="w-full py-4 border border-hairline group-hover:border-ink text-ink font-medium text-[10px] uppercase tracking-widest hover:bg-soft-cloud transition-colors disabled:opacity-50">
                    DOWNLOAD DATA PIUTANG
                </button>
            </div>

            <div className="bg-canvas border border-hairline p-6 hover:border-ink transition-colors group flex flex-col justify-between rounded-2xl overflow-hidden">
                <div>
                    <h3 className="font-medium text-[14px] text-ink uppercase tracking-widest mb-4">LAPORAN HUTANG SUPPLIER</h3>
                    <p className="text-[10px] text-mute uppercase tracking-widest mb-8 leading-relaxed">DAFTAR SISA HUTANG PO (RECEIVED) LENGKAP DENGAN TGL PO, CATATAN, DAN TOTAL HUTANG.</p>
                </div>
                <button onClick={() => handleExport('DEBT_REPORT')} disabled={isGenerating} className="w-full py-4 border border-hairline group-hover:border-ink text-ink font-medium text-[10px] uppercase tracking-widest hover:bg-soft-cloud transition-colors disabled:opacity-50">
                    DOWNLOAD DATA HUTANG
                </button>
            </div>

            <div className="bg-canvas border border-hairline p-6 hover:border-ink transition-colors group flex flex-col justify-between rounded-2xl overflow-hidden">
                <div>
                    <h3 className="font-medium text-[14px] text-ink uppercase tracking-widest mb-4">LOG UNIT & PRODUKSI</h3>
                    <p className="text-[10px] text-mute uppercase tracking-widest mb-8 leading-relaxed">REKAPITULASI UNIT MASUK, STATUS PROGRESS, DAN REKAP TOTAL PANEL PRODUKSI (BY TANGGAL MASUK).</p>
                </div>
                <button onClick={() => handleExport('UNIT_FLOW')} disabled={isGenerating} className="w-full py-4 border border-hairline group-hover:border-ink text-ink font-medium text-[10px] uppercase tracking-widest hover:bg-soft-cloud transition-colors disabled:opacity-50">
                    DOWNLOAD LOG
                </button>
            </div>

            <div className="bg-canvas border border-hairline p-6 hover:border-ink transition-colors group flex flex-col justify-between rounded-2xl overflow-hidden">
                <div>
                    <h3 className="font-medium text-[14px] text-ink uppercase tracking-widest mb-4">ARUS KASIR (AUDIT LOG)</h3>
                    <p className="text-[10px] text-mute uppercase tracking-widest mb-8 leading-relaxed">HISTORI UANG MASUK/KELUAR LENGKAP DENGAN CATATAN, ADMIN, DAN TOTAL SALDO PERIODE.</p>
                </div>
                <button onClick={() => handleExport('CASHIER')} disabled={isGenerating} className="w-full py-4 border border-hairline group-hover:border-ink text-ink font-medium text-[10px] uppercase tracking-widest hover:bg-soft-cloud transition-colors disabled:opacity-50">
                    DOWNLOAD ARUS KASIR
                </button>
            </div>

            <div className="bg-canvas border border-hairline p-6 hover:border-ink transition-colors group flex flex-col justify-between rounded-2xl overflow-hidden">
                <div>
                    <h3 className="font-medium text-[14px] text-ink uppercase tracking-widest mb-4">LABA RUGI PER WO</h3>
                    <p className="text-[10px] text-mute uppercase tracking-widest mb-8 leading-relaxed">ANALISA REVENUE, HPP, DAN GROSS PROFIT PER WO LENGKAP DENGAN TOTAL LABA KOTOR.</p>
                </div>
                <button onClick={() => handleExport('PROFIT_LOSS_UNIT')} disabled={isGenerating} className="w-full py-4 border border-hairline group-hover:border-ink text-ink font-medium text-[10px] uppercase tracking-widest hover:bg-soft-cloud transition-colors disabled:opacity-50">
                    DOWNLOAD LABA RUGI
                </button>
            </div>

            <div className="bg-canvas border border-hairline p-6 hover:border-ink transition-colors group flex flex-col justify-between rounded-2xl overflow-hidden">
                <div>
                    <h3 className="font-medium text-[14px] text-ink uppercase tracking-widest mb-4">VALUASI STOK OPNAME</h3>
                    <p className="text-[10px] text-mute uppercase tracking-widest mb-8 leading-relaxed">DAFTAR STOK AKHIR INVENTORY LENGKAP DENGAN HARGA BELI DAN TOTAL VALUASI GUDANG.</p>
                </div>
                <button onClick={() => handleExport('INVENTORY_STOCK')} disabled={isGenerating} className="w-full py-4 border border-hairline group-hover:border-ink text-ink font-medium text-[10px] uppercase tracking-widest hover:bg-soft-cloud transition-colors disabled:opacity-50">
                    DOWNLOAD VALUASI STOK
                </button>
            </div>
            
            <div className="bg-canvas border border-hairline p-6 hover:border-ink transition-colors group flex flex-col justify-between rounded-2xl overflow-hidden">
                <div>
                    <h3 className="font-medium text-[14px] text-ink uppercase tracking-widest mb-4">PRODUKTIVITAS MEKANIK</h3>
                    <p className="text-[10px] text-mute uppercase tracking-widest mb-8 leading-relaxed">REKAP PERFORMA MEKANIK (UNIT & PANEL) LENGKAP DENGAN TOTAL PENCAPAIAN TIM.</p>
                </div>
                <button onClick={() => handleExport('MECHANIC_PROD')} disabled={isGenerating} className="w-full py-4 border border-hairline group-hover:border-ink text-ink font-medium text-[10px] uppercase tracking-widest hover:bg-soft-cloud transition-colors disabled:opacity-50">
                    DOWNLOAD PRODUKTIVITAS
                </button>
            </div>
        </div>
    </div>
  );
};

export default ReportCenterView;
