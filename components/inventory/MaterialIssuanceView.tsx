import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Job, InventoryItem, UserPermissions, Supplier, Settings } from '../../types';
import { doc, updateDoc, increment, arrayUnion, serverTimestamp, writeBatch, collection, query, getDocs, where, documentId } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION, SPAREPART_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { Plus, Trash2, Search, X, Loader2, AlertTriangle, AlertCircle } from 'lucide-react';

interface MaterialIssuanceViewProps {
  activeJobs: Job[];
  suppliers: Supplier[];
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
  onRefreshData: () => void;
  issuanceType: 'sparepart' | 'material';
  settings?: Settings; 
  inventoryItems?: InventoryItem[];
}

const MaterialIssuanceView: React.FC<MaterialIssuanceViewProps> = ({ 
  activeJobs, userPermissions, showNotification, onRefreshData, issuanceType, settings, suppliers, inventoryItems = []
}) => {
  const [selectedJobId, setSelectedJobId] = useState('');
  const [filterWo, setFilterWo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [selectedPartIndices, setSelectedPartIndices] = useState<number[]>([]);

  interface MaterialRowItem {
      inventoryItem: InventoryItem | null;
      query: string;
      qty: number | '';
      inputUnit: string;
      notes: string;
  }

  const [materialItems, setMaterialItems] = useState<MaterialRowItem[]>([
      { inventoryItem: null, query: '', qty: '', inputUnit: '', notes: '' }
  ]);
  const [activeMaterialSearch, setActiveMaterialSearch] = useState<number | null>(null);
  const materialDropdownMouseDown = useRef(false);

  const [fetchedInventoryItems, setFetchedInventoryItems] = useState<InventoryItem[]>([]);
  const [isFetchingItems, setIsFetchingItems] = useState(false);

  // Returns list of selectable input units
  const getInputUnitOptions = (stockUnit: string): string[] => {
    // Return all possible material units as requested by user, 
    // so they are not restricted to just Ml/Liter for a Liter item.
    return ['Liter', 'Ml', 'Kg', 'Gram', 'Kaleng', 'Pcs'];
  };

  // Converts qty from inputUnit to stockUnit for stock deduction
  const convertToStockUnit = (qty: number, from: string, to: string): number => {
    if (from === to) return qty;
    if (from === 'Gram' && to === 'Kg') return qty / 1000;
    if (from === 'Kg' && to === 'Gram') return qty * 1000;
    if (from === 'Ml' && to === 'Liter') return qty / 1000;
    if (from === 'Liter' && to === 'Ml') return qty * 1000;
    return qty; // fallback no conversion
  };

  // Cost per unit in input-unit terms
  const getCostPerInputUnit = (item: InventoryItem, iUnit: string): number => {
    if (!item) return 0;
    const stockUnit = item.unit;
    if (iUnit === stockUnit) return item.buyPrice;
    // if input is Gram and stock is Kg: price per gram = pricePerKg / 1000
    if (iUnit === 'Gram' && stockUnit === 'Kg') return item.buyPrice / 1000;
    if (iUnit === 'Kg' && stockUnit === 'Gram') return item.buyPrice * 1000;
    if (iUnit === 'Ml' && stockUnit === 'Liter') return item.buyPrice / 1000;
    if (iUnit === 'Liter' && stockUnit === 'Ml') return item.buyPrice * 1000;
    return item.buyPrice;
  };

  const selectedJob = useMemo(() => activeJobs.find(j => j.id === selectedJobId), [activeJobs, selectedJobId]);
  
  const usageHistory = useMemo(() => {
      if (!selectedJob || !selectedJob.usageLog) return [];
      return [...selectedJob.usageLog]
        .filter(log => log.category === issuanceType)
        .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }, [selectedJob, issuanceType]);

  const filteredJobs = useMemo(() => {
    const lowerFilter = filterWo.toLowerCase().trim();
    return activeJobs.filter(j => 
        j.woNumber && 
        ((j.woNumber.toLowerCase().includes(lowerFilter)) || 
        (j.policeNumber && j.policeNumber.toLowerCase().includes(lowerFilter)) ||
        (j.customerName && j.customerName.toLowerCase().includes(lowerFilter)))
    ).slice(0, 10);
  }, [activeJobs, filterWo]);

  useEffect(() => {
      const resolveJobParts = async () => {
          if (selectedJob && issuanceType === 'sparepart') {
              const idsToResolve = selectedJob.estimateData?.partItems
                  ?.map(p => p.inventoryId)
                  .filter(id => id && typeof id === 'string') as string[] || [];
              
              if (idsToResolve.length === 0) {
                  setFetchedInventoryItems([]);
                  return;
              }

              const foundInGlobal: InventoryItem[] = [];
              const missingIds: string[] = [];

              idsToResolve.forEach(id => {
                  const item = inventoryItems.find(i => i.id === id);
                  if (item) foundInGlobal.push(item);
                  else missingIds.push(id);
              });

              let fetchedMissing: InventoryItem[] = [];
              if (missingIds.length > 0) {
                  setIsFetchingItems(true);
                  try {
                      const chunkSize = 10;
                      for (let i = 0; i < missingIds.length; i += chunkSize) {
                          const chunk = missingIds.slice(i, i + chunkSize);
                          const q = query(collection(db, SPAREPART_COLLECTION), where(documentId(), 'in', chunk));
                          const snap = await getDocs(q);
                          fetchedMissing = [...fetchedMissing, ...snap.docs.map(d => ({id: d.id, ...d.data()} as InventoryItem))];
                      }
                  } catch (e) {
                      console.error("Error fetching missing parts:", e);
                  } finally {
                      setIsFetchingItems(false);
                  }
              }

              setFetchedInventoryItems([...foundInGlobal, ...fetchedMissing]);
          }
      };
      
      resolveJobParts();
  }, [selectedJob, issuanceType, inventoryItems]);

  const getMaterialResults = (query: string) => {
      if (issuanceType !== 'material' || !query || query.length < 2) return [];
      const term = query.toLowerCase();
      return inventoryItems.filter(i => 
          i.category === 'material' && 
          (i.name.toLowerCase().includes(term) || (i.code && i.code.toLowerCase().includes(term)))
      ).slice(0, 50);
  };

  const handleSelectMaterial = (index: number, item: InventoryItem) => {
      const newItems = [...materialItems];
      newItems[index] = {
          ...newItems[index],
          inventoryItem: item,
          query: item.name,
          inputUnit: item.unit // Default input unit to stock unit
      };
      setMaterialItems(newItems);
      setActiveMaterialSearch(null);
  };

  const addMaterialRow = () => {
      setMaterialItems([...materialItems, { inventoryItem: null, query: '', qty: '', inputUnit: '', notes: '' }]);
  };

  const removeMaterialRow = (index: number) => {
      if (materialItems.length === 1) {
          setMaterialItems([{ inventoryItem: null, query: '', qty: '', inputUnit: '', notes: '' }]);
      } else {
          setMaterialItems(materialItems.filter((_, i) => i !== index));
      }
  };

  const handleSparepartIssuance = async () => {
      if (!selectedJob) return;
      if (selectedPartIndices.length === 0) {
          showNotification("Pilih setidaknya satu part untuk dikeluarkan.", "error");
          return;
      }

      if(!window.confirm(`Keluarkan ${selectedPartIndices.length} item part terpilih dari stok?`)) return;

      setIsSubmitting(true);
      try {
          const batch = writeBatch(db);
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          
          const currentParts = [...(selectedJob.estimateData?.partItems || [])];
          const newUsageLogs: any[] = [];
          
          let successCount = 0;

          for (const idx of selectedPartIndices) {
              const partEst = currentParts[idx];
              const invItem = fetchedInventoryItems.find(i => i.id === partEst.inventoryId);
              
              if (!invItem) {
                  console.warn(`Inventory item not found for part index ${idx}`);
                  continue;
              }

              const qtyToIssue = partEst.qty || 1;

              const invRef = doc(db, SPAREPART_COLLECTION, invItem.id);
              batch.update(invRef, { 
                  stock: increment(-qtyToIssue), 
                  updatedAt: serverTimestamp() 
              });

              currentParts[idx] = { ...partEst, hasArrived: true };

              newUsageLogs.push({
                  itemId: invItem.id,
                  itemName: invItem.name,
                  itemCode: invItem.code || '',
                  qty: qtyToIssue,
                  costPerUnit: invItem.buyPrice,
                  totalCost: qtyToIssue * invItem.buyPrice,
                  category: 'sparepart',
                  issuedAt: new Date().toISOString(),
                  issuedBy: userPermissions.role,
                  notes: 'Issued via WO Checklist',
                  refPartIndex: idx
              });
              
              successCount++;
          }

          if (successCount === 0) {
              throw new Error("Tidak ada item valid yang bisa diproses (Cek stok/link).");
          }

          batch.update(jobRef, {
              'estimateData.partItems': currentParts,
              usageLog: arrayUnion(...newUsageLogs),
              updatedAt: serverTimestamp()
          });

          await batch.commit();
          showNotification(`Berhasil mengeluarkan ${successCount} part.`, "success");
          setSelectedPartIndices([]);
          onRefreshData(); 
      } catch (e: any) {
          showNotification("Gagal proses: " + e.message, "error");
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleMaterialIssuance = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedJob) return;

      const validItems = materialItems.filter(i => i.inventoryItem && i.qty !== '' && Number(i.qty) > 0);
      if (validItems.length === 0) {
          showNotification("Tidak ada bahan valid untuk dicatat. Pastikan nama bahan dan jumlah terisi.", "error");
          return;
      }

      setIsSubmitting(true);
      try {
          const batch = writeBatch(db);
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          
          let totalCostAllMaterials = 0;
          const newLogs: any[] = [];

          validItems.forEach(item => {
              const selectedItem = item.inventoryItem!;
              const rawQty = Number(item.qty);
              const stockUnit = selectedItem.unit;
              const effectiveUnit = item.inputUnit || stockUnit;

              // Deduct from stock in STOCK unit
              const qtyInStockUnit = convertToStockUnit(rawQty, effectiveUnit, stockUnit);
              const totalCost = qtyInStockUnit * selectedItem.buyPrice;
              totalCostAllMaterials += totalCost;

              const invRef = doc(db, SPAREPART_COLLECTION, selectedItem.id);
              batch.update(invRef, {
                  stock: increment(-qtyInStockUnit),
                  updatedAt: serverTimestamp()
              });

              newLogs.push({
                  itemId: selectedItem.id,
                  itemName: selectedItem.name,
                  itemCode: selectedItem.code,
                  qty: qtyInStockUnit,          // stored in stock unit
                  inputQty: rawQty,             // original input qty
                  inputUnit: effectiveUnit,      // original input unit
                  costPerUnit: selectedItem.buyPrice,
                  totalCost: totalCost,
                  category: 'material',
                  notes: item.notes || 'Pemakaian Bahan',
                  issuedAt: new Date().toISOString(),
                  issuedBy: userPermissions.role
              });
          });

          batch.update(jobRef, {
              usageLog: arrayUnion(...newLogs),
              'costData.hargaModalBahan': increment(totalCostAllMaterials), 
              updatedAt: serverTimestamp()
          });

          await batch.commit();
          showNotification(`Berhasil mencatat pemakaian ${validItems.length} bahan.`, "success");
          
          setMaterialItems([{ inventoryItem: null, query: '', qty: '', inputUnit: '', notes: '' }]);
      } catch (e: any) {
          showNotification("Gagal input bahan: " + e.message, "error");
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleRemoveUsageLog = async (logIndex: number, logItem: any) => {
      if (!selectedJob || !window.confirm("Batalkan pemakaian ini? Stok akan dikembalikan.")) return;
      
      try {
          const newUsageLog = [...(selectedJob.usageLog || [])];
          const actualIndex = newUsageLog.findIndex(l => 
              l.itemId === logItem.itemId && 
              l.issuedAt === logItem.issuedAt &&
              l.category === logItem.category
          );

          if (actualIndex === -1) return;
          newUsageLog.splice(actualIndex, 1);

          const batch = writeBatch(db);
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);

          const invRef = doc(db, SPAREPART_COLLECTION, logItem.itemId);
          batch.update(invRef, { stock: increment(logItem.qty) });

          const updates: any = { usageLog: newUsageLog };
          if (logItem.category === 'material') {
              updates['costData.hargaModalBahan'] = increment(-logItem.totalCost);
          }
          
          batch.update(jobRef, updates);
          await batch.commit();
          
          showNotification("Pemakaian dibatalkan. Stok dikembalikan.", "success");
      } catch (e: any) {
          showNotification("Gagal cancel: " + e.message, "error");
      }
  };

  return (
    <div className="animate-fade-in pb-[48px]">
        {/* HEADER */}
        <div className="border-b border-hairline pb-[24px] mb-[48px]">
            <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">
                {issuanceType === 'sparepart' ? 'PENGELUARAN SPAREPART' : 'PEMAKAIAN BAHAN'}
            </h1>
            <p className="text-[16px] text-mute font-normal mt-[18px] uppercase tracking-widest">
                {issuanceType === 'sparepart' ? 'CHECKLIST PART KELUAR GUDANG SESUAI WO.' : 'INPUT PEMAKAIAN CAT, THINNER, DAN MATERIAL HABIS PAKAI.'}
            </p>
        </div>

        {/* WORK ORDER SELECTOR */}
        <div className="bg-canvas border border-hairline mb-[48px] relative">
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="PILIH WORK ORDER (KETIK NOPOL/WO)..."
                    value={filterWo}
                    onChange={e => setFilterWo(e.target.value)}
                    className="w-full p-6 border-b border-hairline bg-soft-cloud focus:outline-none focus:border-ink font-medium uppercase text-[14px] text-ink"
                />
                {filterWo && !selectedJob && filteredJobs.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-canvas border-b border-x border-hairline max-h-60 overflow-y-auto divide-y divide-hairline z-50">
                        {filteredJobs.map(job => (
                            <div 
                                key={job.id} 
                                onClick={() => { setSelectedJobId(job.id); setFilterWo(''); }}
                                className="p-4 hover:bg-soft-cloud cursor-pointer flex justify-between items-center transition-colors"
                            >
                                <div>
                                    <span className="font-display text-[24px] text-ink">{job.policeNumber}</span>
                                    <div className="text-[10px] text-mute uppercase tracking-widest mt-1">{job.carModel} - {job.customerName}</div>
                                </div>
                                <span className="text-[12px] font-medium border border-ink text-ink px-4 py-2 uppercase tracking-widest">{job.woNumber}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {selectedJob && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-[24px] animate-fade-in">
                {/* LEFT COLUMN: ACTION FORM/LIST */}
                <div className="lg:col-span-2 space-y-[24px]">
                    {/* INFO CARD */}
                    <div className="bg-ink text-canvas p-6 border border-ink flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <span className="text-[10px] font-medium text-mute uppercase tracking-widest">UNIT TERPILIH</span>
                            <h2 className="text-[32px] font-display mt-2 leading-none">{selectedJob.policeNumber}</h2>
                            <p className="text-[14px] text-mute uppercase tracking-widest mt-2">{selectedJob.carModel} | {selectedJob.customerName}</p>
                        </div>
                        <div className="md:text-right border-t md:border-t-0 md:border-l border-mute/30 pt-4 md:pt-0 md:pl-4">
                            <p className="text-[10px] font-medium text-mute uppercase tracking-widest mb-2">NO. WO</p>
                            <p className="text-[16px] font-medium text-canvas border border-canvas px-3 py-1 bg-ink">{selectedJob.woNumber}</p>
                        </div>
                    </div>

                    {issuanceType === 'sparepart' && (
                        <div className="bg-canvas border border-hairline flex flex-col">
                            <div className="p-6 bg-soft-cloud border-b border-hairline flex justify-between items-center">
                                <h3 className="font-medium text-[16px] text-ink uppercase tracking-widest">CHECKLIST KELUAR BARANG</h3>
                                <span className="text-[12px] font-medium bg-canvas text-ink px-4 py-2 border border-ink uppercase tracking-widest">{selectedJob.estimateData?.partItems?.length || 0} ITEM</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-canvas border-b border-hairline uppercase text-[10px] font-medium text-mute tracking-widest">
                                        <tr>
                                            <th className="px-6 py-4 w-12 text-center">#</th>
                                            <th className="px-6 py-4">NAMA PART / KODE</th>
                                            <th className="px-6 py-4 text-center">QTY</th>
                                            <th className="px-6 py-4">STATUS STOK</th>
                                            <th className="px-6 py-4 text-center">LOKASI</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-hairline">
                                        {isFetchingItems ? (
                                            <tr><td colSpan={5} className="py-12 text-center text-mute text-[12px] uppercase tracking-widest">MEMUAT INVENTORY...</td></tr>
                                        ) : (selectedJob.estimateData?.partItems || []).map((part, idx) => {
                                            const invItem = fetchedInventoryItems.find(i => i.id === part.inventoryId);
                                            const isAvailable = invItem && invItem.stock >= (part.qty || 1);
                                            const isSelected = selectedPartIndices.includes(idx);

                                            return (
                                                <tr key={idx} className={`${part.hasArrived ? "bg-soft-cloud opacity-60" : "hover:bg-soft-cloud transition-colors"}`}>
                                                    <td className="px-6 py-4 text-center">
                                                        {!part.hasArrived ? (
                                                            <input 
                                                                type="checkbox" 
                                                                checked={isSelected}
                                                                onChange={() => setSelectedPartIndices(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])}
                                                                disabled={!invItem || !isAvailable}
                                                                className="w-4 h-4 accent-ink cursor-pointer"
                                                            />
                                                        ) : (
                                                            <span className="text-[10px] font-medium text-ink uppercase tracking-widest border border-ink px-2 py-1">OK</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-[14px] text-ink uppercase">{part.name}</div>
                                                        <div className="text-[10px] text-mute uppercase tracking-widest mt-1">{part.number || '-'}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-medium text-ink text-[14px]">{part.qty || 1}</td>
                                                    <td className="px-6 py-4">
                                                        {part.hasArrived ? (
                                                            <span className="text-[10px] font-medium text-ink border border-ink px-2 py-1 uppercase tracking-widest bg-soft-cloud">SUDAH KELUAR</span>
                                                        ) : invItem ? (
                                                            isAvailable ? (
                                                                <span className="text-[10px] font-medium text-ink border border-ink px-2 py-1 uppercase tracking-widest bg-canvas">TERSEDIA ({invItem.stock})</span>
                                                            ) : (
                                                                <span className="text-[10px] font-medium text-ink border border-hairline px-2 py-1 uppercase tracking-widest bg-soft-cloud opacity-50">STOK KURANG ({invItem.stock})</span>
                                                            )
                                                        ) : (
                                                            <span className="text-[10px] font-medium text-mute border border-hairline px-2 py-1 uppercase tracking-widest bg-soft-cloud">LINK ERROR</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-[10px] text-mute uppercase tracking-widest">
                                                        {invItem?.location || '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-6 bg-canvas border-t border-hairline flex justify-end">
                                <button 
                                    onClick={handleSparepartIssuance}
                                    disabled={isSubmitting || selectedPartIndices.length === 0}
                                    className="bg-ink text-canvas px-6 py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors disabled:opacity-50 w-full md:w-auto"
                                >
                                    {isSubmitting ? 'PROCESSING...' : `KELUARKAN ${selectedPartIndices.length} PART`}
                                </button>
                            </div>
                        </div>
                    )}

                    {issuanceType === 'material' && (
                        <div className="bg-canvas border border-hairline p-6">
                                <div className="flex justify-between items-center mb-6 border-b border-hairline pb-4">
                                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">INPUT PEMAKAIAN BAHAN</h3>
                                    <button 
                                        type="button" 
                                        onClick={addMaterialRow} 
                                        disabled={isSubmitting} 
                                        className="flex items-center gap-2 text-[12px] bg-soft-cloud text-ink px-4 py-2 font-medium hover:bg-canvas border border-hairline disabled:opacity-50 transition-all uppercase tracking-widest"
                                    >
                                        <Plus size={14} /> TAMBAH BAHAN
                                    </button>
                                </div>
                                
                                <form onSubmit={handleMaterialIssuance} className="space-y-6">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse min-w-[900px]">
                                            <thead>
                                                <tr className="text-[10px] font-medium text-mute uppercase tracking-widest border-b border-hairline">
                                                    <th className="py-3 px-2 w-10 text-center">NO</th>
                                                    <th className="py-3 px-2 w-64">BAHAN / MATERIAL</th>
                                                    <th className="py-3 px-2 w-32">STOK</th>
                                                    <th className="py-3 px-2 w-48">JUMLAH PAKAI</th>
                                                    <th className="py-3 px-2 w-48 text-right">NOMINAL BIAYA</th>
                                                    <th className="py-3 px-2">CATATAN</th>
                                                    <th className="py-3 px-2 w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {materialItems.map((item, i) => (
                                                    <tr key={i} className="border-b border-hairline hover:bg-soft-cloud/50 transition-colors">
                                                        <td className="py-3 px-2 text-center text-[12px] font-medium text-mute">{i + 1}</td>
                                                        <td className="py-3 px-2 relative">
                                                            <div className="relative">
                                                                <input 
                                                                    type="text" 
                                                                    placeholder="KETIK NAMA BAHAN..."
                                                                    value={item.query}
                                                                    onFocus={() => setActiveMaterialSearch(i)}
                                                                    onBlur={() => {
                                                                        setTimeout(() => {
                                                                            if (!materialDropdownMouseDown.current) setActiveMaterialSearch(null);
                                                                            materialDropdownMouseDown.current = false;
                                                                        }, 200);
                                                                    }}
                                                                    onChange={e => {
                                                                        const val = e.target.value;
                                                                        const newItems = [...materialItems];
                                                                        newItems[i].query = val;
                                                                        if (newItems[i].inventoryItem && newItems[i].inventoryItem?.name !== val) {
                                                                            newItems[i].inventoryItem = null;
                                                                        }
                                                                        setMaterialItems(newItems);
                                                                        setActiveMaterialSearch(i);
                                                                    }}
                                                                    className="w-full p-2 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase"
                                                                    autoComplete="off"
                                                                />
                                                                {activeMaterialSearch === i && item.query.length >= 2 && (
                                                                    <div 
                                                                        className="absolute top-full left-0 w-[400px] bg-canvas border border-hairline mt-1 z-50 max-h-60 overflow-y-auto divide-y divide-hairline shadow-lg"
                                                                        onMouseDown={() => { materialDropdownMouseDown.current = true; }}
                                                                    >
                                                                        {getMaterialResults(item.query).map(res => (
                                                                            <div 
                                                                                key={res.id} 
                                                                                onClick={() => handleSelectMaterial(i, res)}
                                                                                className="p-3 hover:bg-soft-cloud cursor-pointer flex justify-between items-center transition-colors"
                                                                            >
                                                                                <div>
                                                                                    <div className="font-medium text-ink uppercase text-[12px]">{res.name}</div>
                                                                                    <div className="text-[10px] text-mute uppercase tracking-widest mt-1">{res.code}</div>
                                                                                </div>
                                                                                <div className="text-right">
                                                                                    <div className="text-[10px] font-medium text-ink uppercase tracking-widest">STOK: {res.stock} {res.unit}</div>
                                                                                    <div className="text-[10px] text-mute uppercase tracking-widest mt-1">{formatCurrency(res.buyPrice)}</div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                        {getMaterialResults(item.query).length === 0 && (
                                                                            <div className="p-3 text-center text-[10px] text-mute uppercase tracking-widest">Tidak ada bahan ditemukan</div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-2 text-[10px] font-medium text-ink uppercase tracking-widest">
                                                            {item.inventoryItem ? `${item.inventoryItem.stock} ${item.inventoryItem.unit}` : '-'}
                                                        </td>
                                                        <td className="py-3 px-2">
                                                            <div className="flex items-stretch border border-hairline bg-canvas">
                                                                <input 
                                                                    type="number" step="0.001"
                                                                    value={item.qty}
                                                                    onChange={e => {
                                                                        const newItems = [...materialItems];
                                                                        newItems[i].qty = e.target.value === '' ? '' : Number(e.target.value);
                                                                        setMaterialItems(newItems);
                                                                    }}
                                                                    className="w-full p-2 bg-transparent focus:outline-none focus:bg-soft-cloud font-medium text-[12px] text-ink uppercase text-center border-r border-hairline"
                                                                    placeholder="0.0"
                                                                    disabled={!item.inventoryItem}
                                                                />
                                                                {item.inventoryItem && getInputUnitOptions(item.inventoryItem.unit).length > 1 ? (
                                                                    <select
                                                                        value={item.inputUnit}
                                                                        onChange={e => {
                                                                            const newItems = [...materialItems];
                                                                            newItems[i].inputUnit = e.target.value;
                                                                            setMaterialItems(newItems);
                                                                        }}
                                                                        className="text-[10px] font-medium text-ink bg-soft-cloud px-2 py-2 uppercase focus:outline-none focus:bg-canvas min-w-[70px] text-center"
                                                                    >
                                                                        {getInputUnitOptions(item.inventoryItem.unit).map(u => (
                                                                            <option key={u} value={u}>{u.toUpperCase()}</option>
                                                                        ))}
                                                                    </select>
                                                                ) : (
                                                                    <span className="text-[10px] font-medium text-mute bg-soft-cloud px-3 py-2 uppercase flex items-center justify-center min-w-[70px]">
                                                                        {item.inventoryItem?.unit || 'UNIT'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-2 text-right">
                                                            {(() => {
                                                                if (!item.inventoryItem || item.qty === '' || Number(item.qty) <= 0) return <span className="text-[12px] text-mute">-</span>;
                                                                
                                                                const rawQty = Number(item.qty);
                                                                const stockUnit = item.inventoryItem.unit;
                                                                const effectiveUnit = item.inputUnit || stockUnit;
                                                                const qtyInStockUnit = convertToStockUnit(rawQty, effectiveUnit, stockUnit);
                                                                const totalCost = qtyInStockUnit * item.inventoryItem.buyPrice;
                                                                
                                                                return (
                                                                    <div>
                                                                        <div className="text-[12px] font-medium text-ink uppercase tracking-widest">{formatCurrency(totalCost)}</div>
                                                                        {effectiveUnit !== stockUnit && (
                                                                            <div className="text-[9px] text-mute uppercase tracking-widest mt-1">(-{qtyInStockUnit.toFixed(3)} {stockUnit})</div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>
                                                        <td className="py-3 px-2">
                                                            <input 
                                                                type="text" 
                                                                value={item.notes}
                                                                onChange={e => {
                                                                    const newItems = [...materialItems];
                                                                    newItems[i].notes = e.target.value;
                                                                    setMaterialItems(newItems);
                                                                }}
                                                                className="w-full p-2 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[12px] text-ink uppercase"
                                                                placeholder="CATATAN..."
                                                            />
                                                        </td>
                                                        <td className="py-3 px-2 text-center">
                                                            <button 
                                                                type="button" 
                                                                onClick={() => removeMaterialRow(i)} 
                                                                className="text-mute hover:text-red-500 transition-colors"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <button 
                                        type="submit" 
                                        disabled={isSubmitting || materialItems.every(i => !i.inventoryItem || i.qty === '' || Number(i.qty) <= 0)}
                                        className="w-full bg-ink text-canvas py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'PROCESSING...' : 'CATAT PEMAKAIAN BAHAN'}
                                    </button>
                                </form>
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: HISTORY */}
                <div className="bg-canvas border border-hairline flex flex-col h-fit">
                    <div className="p-6 bg-soft-cloud border-b border-hairline">
                        <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">RIWAYAT {issuanceType === 'sparepart' ? 'PART KELUAR' : 'BAHAN TERPAKAI'}</h3>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto scrollbar-hide">
                        {usageHistory.length === 0 ? (
                            <div className="p-12 text-center text-mute text-[12px] uppercase tracking-widest">BELUM ADA HISTORY PENGGUNAAN.</div>
                        ) : (
                            <div className="divide-y divide-hairline">
                                {usageHistory.map((log, idx) => (
                                    <div key={idx} className="p-4 hover:bg-soft-cloud transition-colors group">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="font-medium text-[14px] text-ink uppercase">{log.itemName}</div>
                                            <button onClick={() => handleRemoveUsageLog(idx, log)} className="text-[10px] font-medium text-ink border border-hairline hover:border-ink px-2 py-1 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all bg-canvas">BATALKAN</button>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] text-mute uppercase tracking-widest">
                                            <span>{log.qty} {log.inputUnit || 'PCS'}</span>
                                            <span>{formatDateIndo(log.issuedAt)}</span>
                                        </div>
                                        <div className="mt-2 text-[10px] font-medium text-ink border border-ink px-2 py-1 inline-block uppercase tracking-widest">
                                            {formatCurrency(log.totalCost)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="p-6 bg-canvas border-t border-hairline">
                        <div className="flex justify-between items-center text-[14px] font-medium text-ink uppercase tracking-widest">
                            <span>TOTAL BIAYA:</span>
                            <span className="border border-ink px-3 py-1 bg-soft-cloud">
                                {formatCurrency(usageHistory.reduce((acc, curr) => acc + curr.totalCost, 0))}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default MaterialIssuanceView;
