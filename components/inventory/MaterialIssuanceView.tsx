
import React, { useState, useMemo, useEffect } from 'react';
import { Job, InventoryItem, UserPermissions, Supplier, Settings } from '../../types';
import { doc, updateDoc, increment, arrayUnion, serverTimestamp, writeBatch, collection, query, limit, getDocs, where, documentId } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION, SPAREPART_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { Search, Truck, PaintBucket, CheckCircle, History, Save, ArrowRight, AlertTriangle, Info, Package, XCircle, Zap, CheckSquare, Loader2 } from 'lucide-react';

interface MaterialIssuanceViewProps {
  activeJobs: Job[];
  suppliers: Supplier[];
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
  onRefreshData: () => void;
  issuanceType: 'sparepart' | 'material';
  settings?: Settings; 
  inventoryItems?: InventoryItem[]; // Now actively used for integration
}

const MaterialIssuanceView: React.FC<MaterialIssuanceViewProps> = ({ 
  activeJobs, userPermissions, showNotification, onRefreshData, issuanceType, settings, suppliers, inventoryItems = []
}) => {
  const [selectedJobId, setSelectedJobId] = useState('');
  const [filterWo, setFilterWo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Selection State for Manual Checklist (Sparepart)
  const [selectedPartIndices, setSelectedPartIndices] = useState<number[]>([]);

  // Material Form States
  const [materialSearchTerm, setMaterialSearchTerm] = useState(''); 
  const [inputQty, setInputQty] = useState<number | ''>(''); 
  const [notes, setNotes] = useState('');
  const [selectedMaterialItem, setSelectedMaterialItem] = useState<InventoryItem | null>(null);

  // ASYNC FETCH STATE (Fallback)
  const [fetchedInventoryItems, setFetchedInventoryItems] = useState<InventoryItem[]>([]);
  const [isFetchingItems, setIsFetchingItems] = useState(false);

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

  // --- INTEGRATED FETCHING LOGIC (GLOBAL + FALLBACK) ---

  // 1. Resolve Inventory Items for Selected Job
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

              // A. Try finding in Global State first (Instant)
              const foundInGlobal: InventoryItem[] = [];
              const missingIds: string[] = [];

              idsToResolve.forEach(id => {
                  const item = inventoryItems.find(i => i.id === id);
                  if (item) foundInGlobal.push(item);
                  else missingIds.push(id);
              });

              // B. If missing from global (rare, e.g. >1000 items), fetch from DB
              let fetchedMissing: InventoryItem[] = [];
              if (missingIds.length > 0) {
                  setIsFetchingItems(true);
                  try {
                      // Chunking requests
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

              // Combine Global + Fetched
              setFetchedInventoryItems([...foundInGlobal, ...fetchedMissing]);
          }
      };
      
      resolveJobParts();
  }, [selectedJob, issuanceType, inventoryItems]);

  // 2. Search Materials (Global First)
  const materialSearchResults = useMemo(() => {
      if (issuanceType !== 'material' || materialSearchTerm.length < 2) return [];
      
      const term = materialSearchTerm.toLowerCase();
      // Filter Global State
      return inventoryItems.filter(i => 
          i.category === 'material' && 
          (i.name.toLowerCase().includes(term) || (i.code && i.code.toLowerCase().includes(term)))
      ).slice(0, 50);
  }, [inventoryItems, materialSearchTerm, issuanceType]);

  // --- ACTIONS ---

  const handleSelectMaterial = (item: InventoryItem) => {
      setSelectedMaterialItem(item);
      setMaterialSearchTerm(item.name);
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
              // Find matching inventory item (from combined resolved list)
              const invItem = fetchedInventoryItems.find(i => i.id === partEst.inventoryId);
              
              if (!invItem) {
                  console.warn(`Inventory item not found for part index ${idx}`);
                  continue;
              }

              const qtyToIssue = partEst.qty || 1;

              // 1. Decrement Stock
              const invRef = doc(db, SPAREPART_COLLECTION, invItem.id);
              batch.update(invRef, { 
                  stock: increment(-qtyToIssue), 
                  updatedAt: serverTimestamp() 
              });

              // 2. Mark as Arrived/Issued in Job
              currentParts[idx] = { ...partEst, hasArrived: true };

              // 3. Create Usage Log Entry
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

          // Update Job Doc
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
          const qty = Number(inputQty);
          const totalCost = qty * selectedMaterialItem.buyPrice;

          const batch = writeBatch(db);
          
          // 1. Decrement Stock
          const invRef = doc(db, SPAREPART_COLLECTION, selectedMaterialItem.id);
          batch.update(invRef, {
              stock: increment(-qty),
              updatedAt: serverTimestamp()
          });

          // 2. Add Usage Log to Job
          const logEntry = {
              itemId: selectedMaterialItem.id,
              itemName: selectedMaterialItem.name,
              itemCode: selectedMaterialItem.code,
              qty: qty,
              inputUnit: selectedMaterialItem.unit,
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
              'costData.hargaModalBahan': increment(totalCost), // Update Job Cost
              updatedAt: serverTimestamp()
          });

          await batch.commit();
          showNotification(`Bahan ${selectedMaterialItem.name} berhasil dicatat.`, "success");
          
          // Reset Form
          setSelectedMaterialItem(null);
          setMaterialSearchTerm('');
          setInputQty('');
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

          // Return Stock
          const invRef = doc(db, SPAREPART_COLLECTION, logItem.itemId);
          batch.update(invRef, { stock: increment(logItem.qty) });

          // Update Job
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

  const themeColor = issuanceType === 'sparepart' ? 'indigo' : 'orange';
  const ThemeIcon = issuanceType === 'sparepart' ? Truck : PaintBucket;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl shadow-sm text-white ${issuanceType === 'sparepart' ? 'bg-indigo-600' : 'bg-orange-600'}`}>
                    <ThemeIcon size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{issuanceType === 'sparepart' ? 'Pengeluaran Sparepart (WO)' : 'Pemakaian Bahan Baku'}</h1>
                    <p className="text-sm text-gray-500 font-medium">
                        {issuanceType === 'sparepart' ? 'Checklist part keluar gudang sesuai Work Order.' : 'Input pemakaian cat, thinner, dan material habis pakai.'}
                    </p>
                </div>
            </div>
        </div>

        {/* WORK ORDER SELECTOR */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Pilih Work Order (WO) Aktif</label>
            <div className="relative max-w-xl">
                <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                <input 
                    type="text" 
                    placeholder="Ketik No. Polisi atau WO..."
                    value={filterWo}
                    onChange={e => setFilterWo(e.target.value)}
                    className="w-full pl-10 p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold uppercase"
                />
                {filterWo && !selectedJob && filteredJobs.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 z-50 max-h-60 overflow-y-auto">
                        {filteredJobs.map(job => (
                            <div 
                                key={job.id} 
                                onClick={() => { setSelectedJobId(job.id); setFilterWo(''); }}
                                className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-0"
                            >
                                <div className="flex justify-between">
                                    <span className="font-black text-indigo-700">{job.policeNumber}</span>
                                    <span className="text-xs font-bold bg-gray-100 px-2 py-0.5 rounded">{job.woNumber}</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">{job.carModel} - {job.customerName}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {selectedJob && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
                {/* LEFT COLUMN: ACTION FORM/LIST */}
                <div className="lg:col-span-2 space-y-6">
                    {/* INFO CARD */}
                    <div className="bg-gray-800 text-white p-5 rounded-xl shadow-lg flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-black">{selectedJob.policeNumber}</h2>
                            <p className="text-gray-300 text-sm">{selectedJob.carModel} | {selectedJob.customerName}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-gray-400 uppercase">NO. WO</p>
                            <p className="text-lg font-mono font-bold text-indigo-300">{selectedJob.woNumber}</p>
                        </div>
                    </div>

                    {issuanceType === 'sparepart' && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center">
                                <h3 className="font-bold text-indigo-900 flex items-center gap-2"><CheckSquare size={18}/> Checklist Keluar Barang</h3>
                                <span className="text-xs font-bold bg-white text-indigo-600 px-2 py-1 rounded border border-indigo-200">{selectedJob.estimateData?.partItems?.length || 0} Item</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-white border-b uppercase text-[10px] font-black text-gray-500">
                                        <tr>
                                            <th className="p-4 w-10 text-center">#</th>
                                            <th className="p-4">Nama Part / Kode</th>
                                            <th className="p-4 text-center">Qty</th>
                                            <th className="p-4">Status Stok</th>
                                            <th className="p-4 text-center">Keluar</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {isFetchingItems ? (
                                            <tr><td colSpan={5} className="p-8 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2"/> Memuat Inventory...</td></tr>
                                        ) : (selectedJob.estimateData?.partItems || []).map((part, idx) => {
                                            const invItem = fetchedInventoryItems.find(i => i.id === part.inventoryId);
                                            const isAvailable = invItem && invItem.stock >= (part.qty || 1);
                                            const isSelected = selectedPartIndices.includes(idx);

                                            return (
                                                <tr key={idx} className={part.hasArrived ? "bg-gray-50 opacity-60" : "hover:bg-indigo-50/30"}>
                                                    <td className="p-4 text-center">
                                                        {!part.hasArrived && (
                                                            <input 
                                                                type="checkbox" 
                                                                checked={isSelected}
                                                                onChange={() => setSelectedPartIndices(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])}
                                                                disabled={!invItem || !isAvailable}
                                                                className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                                                            />
                                                        )}
                                                        {part.hasArrived && <CheckCircle size={16} className="text-emerald-500 mx-auto"/>}
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-bold text-gray-800">{part.name}</div>
                                                        <div className="text-[10px] text-gray-400 font-mono">{part.number || '-'}</div>
                                                    </td>
                                                    <td className="p-4 text-center font-bold">{part.qty || 1}</td>
                                                    <td className="p-4">
                                                        {part.hasArrived ? (
                                                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">SUDAH KELUAR</span>
                                                        ) : invItem ? (
                                                            isAvailable ? (
                                                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">TERSEDIA ({invItem.stock})</span>
                                                            ) : (
                                                                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">STOK KURANG ({invItem.stock})</span>
                                                            )
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1"><AlertTriangle size={10}/> LINK ERROR</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-center text-xs text-gray-500">
                                                        {invItem?.location || '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-4 bg-gray-50 border-t flex justify-end">
                                <button 
                                    onClick={handleSparepartIssuance}
                                    disabled={isSubmitting || selectedPartIndices.length === 0}
                                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin" size={18}/> : <ArrowRight size={18}/>}
                                    KELUARKAN {selectedPartIndices.length} PART
                                </button>
                            </div>
                        </div>
                    )}

                    {issuanceType === 'material' && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2 border-b pb-4"><Zap size={20} className="text-orange-500"/> Input Pemakaian Bahan</h3>
                            
                            <form onSubmit={handleMaterialIssuance} className="space-y-5">
                                <div className="relative">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cari Bahan / Material</label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                                        <input 
                                            type="text" 
                                            placeholder="Ketik nama bahan (cat, thinner, clear)..."
                                            value={materialSearchTerm}
                                            onChange={e => setMaterialSearchTerm(e.target.value)}
                                            className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 font-bold"
                                        />
                                    </div>
                                    {/* DROPDOWN RESULTS (FROM GLOBAL INVENTORY PROP) */}
                                    {materialSearchTerm && !selectedMaterialItem && materialSearchResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 z-50 max-h-48 overflow-y-auto">
                                            {materialSearchResults.map(item => (
                                                <div 
                                                    key={item.id} 
                                                    onClick={() => handleSelectMaterial(item)}
                                                    className="p-3 hover:bg-orange-50 cursor-pointer border-b last:border-0 flex justify-between items-center"
                                                >
                                                    <div>
                                                        <div className="font-bold text-gray-800">{item.name}</div>
                                                        <div className="text-xs text-gray-500 font-mono">{item.code}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs font-bold text-gray-600">Stok: {item.stock} {item.unit}</div>
                                                        <div className="text-[10px] text-gray-400">{formatCurrency(item.buyPrice)}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {selectedMaterialItem && (
                                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex justify-between items-center animate-fade-in">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white rounded-lg border border-orange-100 text-orange-600"><PaintBucket size={20}/></div>
                                            <div>
                                                <div className="font-black text-gray-800">{selectedMaterialItem.name}</div>
                                                <div className="text-xs text-gray-500">Stok: {selectedMaterialItem.stock} {selectedMaterialItem.unit}</div>
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => { setSelectedMaterialItem(null); setMaterialSearchTerm(''); }} className="p-1 hover:bg-orange-200 rounded-full text-orange-700"><XCircle size={18}/></button>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Jumlah Pakai</label>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" step="0.1" required
                                                value={inputQty}
                                                onChange={e => setInputQty(Number(e.target.value))}
                                                className="w-full p-3 border border-gray-300 rounded-lg font-bold text-gray-900 focus:ring-2 focus:ring-orange-500"
                                                placeholder="0.0"
                                            />
                                            <span className="text-sm font-bold text-gray-500 bg-gray-100 px-3 py-3 rounded-lg border border-gray-200">
                                                {selectedMaterialItem?.unit || 'Unit'}
                                            </span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Catatan</label>
                                        <input 
                                            type="text" 
                                            value={notes}
                                            onChange={e => setNotes(e.target.value)}
                                            className="w-full p-3 border border-gray-300 rounded-lg text-sm"
                                            placeholder="Utk panel pintu, dll..."
                                        />
                                    </div>
                                </div>

                                <button 
                                    type="submit" 
                                    disabled={!selectedMaterialItem || isSubmitting}
                                    className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-orange-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>}
                                    CATAT PEMAKAIAN
                                </button>
                            </form>
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: HISTORY */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-fit">
                    <div className="p-4 bg-gray-50 border-b border-gray-200">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2"><History size={18}/> Riwayat {issuanceType === 'sparepart' ? 'Part Keluar' : 'Bahan Terpakai'}</h3>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto">
                        {usageHistory.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 italic text-sm">Belum ada history penggunaan.</div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {usageHistory.map((log, idx) => (
                                    <div key={idx} className="p-4 hover:bg-gray-50 transition-colors group">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="font-bold text-gray-800 text-sm">{log.itemName}</div>
                                            <button onClick={() => handleRemoveUsageLog(idx, log)} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Batalkan"><XCircle size={14}/></button>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-gray-500">
                                            <span>{log.qty} {log.inputUnit || 'Pcs'}</span>
                                            <span className="font-mono">{formatDateIndo(log.issuedAt)}</span>
                                        </div>
                                        <div className="mt-1 text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded inline-block">
                                            {formatCurrency(log.totalCost)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="p-4 bg-gray-50 border-t border-gray-200">
                        <div className="flex justify-between items-center text-sm font-black text-gray-800">
                            <span>TOTAL BIAYA:</span>
                            <span>
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
