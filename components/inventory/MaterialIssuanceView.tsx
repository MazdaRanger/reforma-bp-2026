import React, { useState, useMemo, useEffect } from 'react';
import { Job, InventoryItem, UserPermissions, Supplier, Settings } from '../../types';
import { doc, updateDoc, increment, arrayUnion, serverTimestamp, writeBatch, collection, query, getDocs, where, documentId } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION, SPAREPART_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';

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

  const [materialSearchTerm, setMaterialSearchTerm] = useState(''); 
  const [inputQty, setInputQty] = useState<number | ''>(''); 
  const [inputUnit, setInputUnit] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [selectedMaterialItem, setSelectedMaterialItem] = useState<InventoryItem | null>(null);

  const [fetchedInventoryItems, setFetchedInventoryItems] = useState<InventoryItem[]>([]);
  const [isFetchingItems, setIsFetchingItems] = useState(false);

  // --- UNIT CONVERSION HELPERS ---
  // Returns list of selectable input units based on the item's stock unit
  const getInputUnitOptions = (stockUnit: string): string[] => {
    if (stockUnit === 'Kg') return ['Gram', 'Kg'];
    if (stockUnit === 'Gram') return ['Gram', 'Kg'];
    if (stockUnit === 'Liter') return ['Ml', 'Liter'];
    if (stockUnit === 'Ml') return ['Ml', 'Liter'];
    return [stockUnit]; // same unit, no conversion
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

  const materialSearchResults = useMemo(() => {
      if (issuanceType !== 'material' || materialSearchTerm.length < 2) return [];
      
      const term = materialSearchTerm.toLowerCase();
      return inventoryItems.filter(i => 
          i.category === 'material' && 
          (i.name.toLowerCase().includes(term) || (i.code && i.code.toLowerCase().includes(term)))
      ).slice(0, 50);
  }, [inventoryItems, materialSearchTerm, issuanceType]);

  const handleSelectMaterial = (item: InventoryItem) => {
      setSelectedMaterialItem(item);
      setMaterialSearchTerm(item.name);
      // Default input unit to stock unit
      setInputUnit(item.unit);
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
      if (!selectedJob || !selectedMaterialItem || !inputQty) return;

      setIsSubmitting(true);
      try {
          const rawQty = Number(inputQty);
          const stockUnit = selectedMaterialItem.unit;
          const effectiveUnit = inputUnit || stockUnit;

          // Deduct from stock in STOCK unit
          const qtyInStockUnit = convertToStockUnit(rawQty, effectiveUnit, stockUnit);
          // Calculate cost based on stock-unit price
          const totalCost = qtyInStockUnit * selectedMaterialItem.buyPrice;

          const batch = writeBatch(db);
          
          const invRef = doc(db, SPAREPART_COLLECTION, selectedMaterialItem.id);
          batch.update(invRef, {
              stock: increment(-qtyInStockUnit),
              updatedAt: serverTimestamp()
          });

          const logEntry = {
              itemId: selectedMaterialItem.id,
              itemName: selectedMaterialItem.name,
              itemCode: selectedMaterialItem.code,
              qty: qtyInStockUnit,          // stored in stock unit
              inputQty: rawQty,             // original input qty
              inputUnit: effectiveUnit,      // original input unit
              costPerUnit: selectedMaterialItem.buyPrice,
              totalCost: totalCost,
              category: 'material',
              notes: notes || 'Pemakaian Bahan',
              issuedAt: new Date().toISOString(),
              issuedBy: userPermissions.role
          };

          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          batch.update(jobRef, {
              usageLog: arrayUnion(logEntry),
              'costData.hargaModalBahan': increment(totalCost), 
              updatedAt: serverTimestamp()
          });

          await batch.commit();
          showNotification(`Bahan ${selectedMaterialItem.name} berhasil dicatat.`, "success");
          
          setSelectedMaterialItem(null);
          setMaterialSearchTerm('');
          setInputQty('');
          setInputUnit('');
          setNotes('');
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
                            <h3 className="font-medium text-ink uppercase tracking-widest text-[16px] mb-6 border-b border-hairline pb-4">INPUT PEMAKAIAN BAHAN</h3>
                            
                            <form onSubmit={handleMaterialIssuance} className="space-y-6">
                                <div className="relative">
                                    <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">CARI BAHAN / MATERIAL</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            placeholder="KETIK NAMA BAHAN (CAT, THINNER, CLEAR)..."
                                            value={materialSearchTerm}
                                            onChange={e => setMaterialSearchTerm(e.target.value)}
                                            className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase"
                                        />
                                    </div>
                                    {materialSearchTerm && !selectedMaterialItem && materialSearchResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 bg-canvas border border-hairline mt-2 z-50 max-h-48 overflow-y-auto divide-y divide-hairline">
                                            {materialSearchResults.map(item => (
                                                <div 
                                                    key={item.id} 
                                                    onClick={() => handleSelectMaterial(item)}
                                                    className="p-4 hover:bg-soft-cloud cursor-pointer flex justify-between items-center transition-colors"
                                                >
                                                    <div>
                                                        <div className="font-medium text-ink uppercase text-[14px]">{item.name}</div>
                                                        <div className="text-[10px] text-mute uppercase tracking-widest mt-1">{item.code}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[12px] font-medium text-ink uppercase tracking-widest border border-hairline px-2 py-1 mb-1">STOK: {item.stock} {item.unit}</div>
                                                        <div className="text-[10px] text-mute uppercase tracking-widest">{formatCurrency(item.buyPrice)}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {selectedMaterialItem && (
                                    <div className="p-4 bg-soft-cloud border border-hairline flex justify-between items-center animate-fade-in">
                                        <div>
                                            <div className="font-medium text-ink uppercase text-[16px]">{selectedMaterialItem.name}</div>
                                            <div className="text-[10px] text-mute uppercase tracking-widest mt-1">STOK TERSISA: {selectedMaterialItem.stock} {selectedMaterialItem.unit} &nbsp;|&nbsp; HARGA: {formatCurrency(selectedMaterialItem.buyPrice)}/{selectedMaterialItem.unit}</div>
                                        </div>
                                        <button type="button" onClick={() => { setSelectedMaterialItem(null); setMaterialSearchTerm(''); setInputQty(''); setInputUnit(''); }} className="text-[10px] font-medium text-ink border border-ink hover:bg-canvas px-3 py-1 uppercase tracking-widest transition-colors">BATAL</button>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
                                    <div>
                                        <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">JUMLAH PAKAI</label>
                                        <div className="flex items-stretch">
                                            <input 
                                                type="number" step="0.001" required
                                                value={inputQty}
                                                onChange={e => setInputQty(e.target.value === '' ? '' : Number(e.target.value))}
                                                className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase border-r-0"
                                                placeholder="0.0"
                                            />
                                            {selectedMaterialItem && getInputUnitOptions(selectedMaterialItem.unit).length > 1 ? (
                                                <select
                                                    value={inputUnit || selectedMaterialItem.unit}
                                                    onChange={e => setInputUnit(e.target.value)}
                                                    className="text-[12px] font-medium text-ink bg-soft-cloud px-3 py-4 border border-hairline uppercase focus:outline-none focus:border-ink min-w-[80px]"
                                                >
                                                    {getInputUnitOptions(selectedMaterialItem.unit).map(u => (
                                                        <option key={u} value={u}>{u.toUpperCase()}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className="text-[14px] font-medium text-mute bg-soft-cloud px-4 py-4 border border-hairline uppercase">
                                                    {selectedMaterialItem?.unit || 'UNIT'}
                                                </span>
                                            )}
                                        </div>
                                        {/* LIVE NOMINAL BIAYA */}
                                        {selectedMaterialItem && inputQty !== '' && Number(inputQty) > 0 && (() => {
                                            const rawQty = Number(inputQty);
                                            const stockUnit = selectedMaterialItem.unit;
                                            const effectiveUnit = inputUnit || stockUnit;
                                            const qtyInStockUnit = convertToStockUnit(rawQty, effectiveUnit, stockUnit);
                                            const totalCost = qtyInStockUnit * selectedMaterialItem.buyPrice;
                                            const needsConversion = effectiveUnit !== stockUnit;
                                            return (
                                                <div className="mt-3 p-3 bg-canvas border border-ink space-y-1 animate-fade-in">
                                                    <div className="flex justify-between items-center text-[11px] font-medium text-ink uppercase tracking-widest">
                                                        <span>NOMINAL BIAYA</span>
                                                        <span className="text-[14px] font-medium">{formatCurrency(totalCost)}</span>
                                                    </div>
                                                    {needsConversion && (
                                                        <div className="text-[10px] text-mute uppercase tracking-widest border-t border-hairline pt-1 mt-1">
                                                            PENGURANGAN STOK: {qtyInStockUnit.toFixed(3)} {stockUnit}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">CATATAN</label>
                                        <input 
                                            type="text" 
                                            value={notes}
                                            onChange={e => setNotes(e.target.value)}
                                            className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase"
                                            placeholder="UNTUK PANEL PINTU..."
                                        />
                                    </div>
                                </div>

                                <button 
                                    type="submit" 
                                    disabled={!selectedMaterialItem || isSubmitting}
                                    className="w-full bg-ink text-canvas py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors disabled:opacity-50"
                                >
                                    {isSubmitting ? 'PROCESSING...' : 'CATAT PEMAKAIAN'}
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
