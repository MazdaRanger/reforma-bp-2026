import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, getDocs, doc, addDoc, updateDoc, serverTimestamp, increment, query, orderBy, limit, getDoc, where, writeBatch, arrayUnion } from 'firebase/firestore';
import { db, PURCHASE_ORDERS_COLLECTION, SPAREPART_COLLECTION, SETTINGS_COLLECTION, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { InventoryItem, Supplier, PurchaseOrder, PurchaseOrderItem, UserPermissions, Settings, Job, EstimateItem } from '../../types';
import { formatCurrency, formatDateIndo, cleanObject, toYyyyMmDd } from '../../utils/helpers';
import { generatePurchaseOrderPDF, generateReceivingReportPDF } from '../../utils/pdfGenerator';
import { initialSettingsState } from '../../utils/constants';

interface PurchaseOrderViewProps {
  suppliers: Supplier[];
  inventoryItems: InventoryItem[];
  jobs?: Job[]; 
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
  realTimePOs?: PurchaseOrder[];
  initialJobId?: string | null;
  onPOComplete?: () => void;
}

const UNIT_OPTIONS = ['Pcs', 'Set', 'Unit', 'Liter', 'Kaleng', 'Kg', 'Gram', 'Meter', 'Roll', 'Galon'];

const generateSequentialId = async (collectionName: string, idField: string, prefixText: string): Promise<string> => {
    const today = new Date();
    const yy = today.getFullYear().toString().slice(-2);
    const mm = (today.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `${prefixText}-${yy}${mm}-`; 
    
    try {
        const q = query(
            collection(db, collectionName),
            where(idField, ">=", prefix + "0000"),
            where(idField, "<=", prefix + "9999"),
            orderBy(idField, "desc"),
            limit(1)
        );
        const snap = await getDocs(q);
        let nextNum = 1;
        if (!snap.empty) {
            const lastId = snap.docs[0].data()[idField]; 
            if (lastId) {
                const parts = lastId.split('-');
                if (parts.length >= 3) {
                    const lastSeq = parseInt(parts[2], 10);
                    if (!isNaN(lastSeq)) nextNum = lastSeq + 1;
                }
            }
        }
        return `${prefix}${nextNum.toString().padStart(4, '0')}`;
    } catch (e) {
        console.error("Error generating sequential ID:", e);
        return `${prefix}${Math.floor(Math.random() * 9000 + 1000).toString()}`;
    }
};

const PurchaseOrderView: React.FC<PurchaseOrderViewProps> = ({ 
  suppliers, inventoryItems, jobs = [], userPermissions, showNotification, realTimePOs = [], initialJobId, onPOComplete
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'detail'>('list');
  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [settings, setSettings] = useState<Settings>(initialSettingsState);

  const [selectedItemsToReceive, setSelectedItemsToReceive] = useState<number[]>([]);
  const [receiveQtyMap, setReceiveQtyMap] = useState<Record<number, number>>({});

  const [poCreationMode, setPoCreationMode] = useState<'manual' | 'wo'>('manual');
  const [poForm, setPoForm] = useState<any>({
      id: null,
      poNumber: '',
      supplierId: '',
      items: [],
      notes: '',
      hasPpn: false,
      date: new Date().toISOString().split('T')[0] 
  });
  const [searchTerm, setSearchTerm] = useState('');

  const [woSearchTerm, setWoSearchTerm] = useState('');
  const [foundJob, setFoundJob] = useState<Job | null>(null);
  const [woMatches, setWoMatches] = useState<Job[]>([]);
  const [isWoPickerOpen, setIsWoPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [selectedPartsFromWo, setSelectedPartsFromWo] = useState<Record<number, { selected: boolean, isIndent: boolean }>>({});

  const isManager = useMemo(() => {
    return userPermissions && userPermissions.role && userPermissions.role.includes('Manager');
  }, [userPermissions]);

  const isPartman = useMemo(() => {
    return userPermissions && (userPermissions.role === 'Partman' || userPermissions.role === 'Sparepart' || userPermissions.role === 'Manager');
  }, [userPermissions]);

  useEffect(() => {
    const fetchSettings = async () => {
        try {
            const q = await getDocs(collection(db, SETTINGS_COLLECTION));
            if (!q.empty) setSettings(q.docs[0].data() as Settings);
        } catch (e) { console.error(e); }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
              setIsWoPickerOpen(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
      if (selectedPO) {
          const updated = realTimePOs.find(p => p.id === selectedPO.id);
          if (updated) setSelectedPO(updated);
      }
  }, [realTimePOs]);

  useEffect(() => {
      if (initialJobId && jobs.length > 0) {
          const targetJob = jobs.find(j => j.id === initialJobId);
          if (targetJob) {
              setViewMode('create');
              setPoCreationMode('wo');
              setWoSearchTerm(targetJob.woNumber || targetJob.policeNumber);
              
              if (targetJob.estimateData?.partItems && targetJob.estimateData.partItems.length > 0) {
                  setFoundJob(targetJob);
                  const initialSelection: any = {};
                  targetJob.estimateData.partItems.forEach((p, idx) => { 
                      if (!p.isOrdered) initialSelection[idx] = { selected: true, isIndent: p.isIndent || false }; 
                  });
                  setSelectedPartsFromWo(initialSelection);
                  
                  setTimeout(() => {
                     showNotification(`MODE CEPAT: DATA PART DARI WO ${targetJob.woNumber || targetJob.policeNumber} TELAH DIMUAT.`, "success");
                  }, 500);
              } else {
                  showNotification(`PEKERJAAN ${targetJob.policeNumber} TIDAK MEMILIKI ESTIMASI SUKU CADANG.`, "error");
              }
          }
      }
  }, [initialJobId, jobs]);

  useEffect(() => {
      if (selectedPO && (selectedPO.status === 'Ordered' || selectedPO.status === 'Partial')) {
          setSelectedItemsToReceive([]);
          const initialQtyMap: Record<number, number> = {};
          selectedPO.items.forEach((item, idx) => {
              const remaining = item.qty - (item.qtyReceived || 0);
              if (remaining > 0) initialQtyMap[idx] = remaining;
          });
          setReceiveQtyMap(initialQtyMap);
      }
  }, [selectedPO?.id, viewMode]);

  const toggleItemSelection = (idx: number) => {
    setSelectedItemsToReceive(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const handlePrintPO = (po: PurchaseOrder) => {
    if (!po) return;
    const supplier = suppliers.find(s => s.id === po.supplierId);
    const supplierAddress = supplier ? supplier.address : '';
    try {
        generatePurchaseOrderPDF(po, settings, supplierAddress);
        showNotification(`MENDOWNLOAD ${po.poNumber}...`, "success");
    } catch (err: any) {
        console.error("PDF Print Error:", err);
        showNotification("GAGAL MENCETAK PDF.", "error");
    }
  };

  const handleApprovePO = async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!selectedPO || !selectedPO.id) return;
    if (!isManager) { showNotification("AKSES DITOLAK: MANAGER ONLY.", "error"); return; }

    if (!window.confirm(`SETUJUI PO ${selectedPO.poNumber}?`)) return;

    setIsProcessing(true);
    try {
        const poRef = doc(db, PURCHASE_ORDERS_COLLECTION, selectedPO.id);
        await updateDoc(poRef, {
            status: 'Ordered',
            approvedBy: userPermissions.role,
            approvedAt: serverTimestamp(),
            lastModified: serverTimestamp()
        });

        showNotification(`PO ${selectedPO.poNumber} DISETUJUI.`, "success");
        setViewMode('list');
        setSelectedPO(null);
    } catch (e: any) {
        showNotification(`ERROR: ${e.message}`, "error");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleRejectPO = async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!selectedPO || !selectedPO.id) return;
    if (!isManager) return;

    const reason = window.prompt("ALASAN PENOLAKAN:", "");
    if (reason === null) return;
    if (!reason.trim()) { showNotification("ALASAN WAJIB DIISI.", "error"); return; }

    setIsProcessing(true);
    try {
        await updateDoc(doc(db, PURCHASE_ORDERS_COLLECTION, selectedPO.id), {
            status: 'Rejected',
            rejectionReason: reason,
            approvedBy: userPermissions.role,
            approvedAt: serverTimestamp()
        });
        showNotification(`PO DITOLAK.`, "success");
        setViewMode('list');
        setSelectedPO(null);
    } catch (e: any) {
        showNotification("GAGAL MENOLAK PO.", "error");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleCancelPO = async (po: PurchaseOrder) => {
    const isPending = po.status === 'Pending Approval' || po.status === 'Draft';
    const canCancel = isManager || (isPartman && isPending);

    if (!canCancel) {
        showNotification("HANYA MANAGER YANG BISA MEMBATALKAN PO YANG SUDAH DIPROSES.", "error");
        return;
    }

    if (!window.confirm(`YAKIN INGIN MEMBATALKAN/MENGHAPUS PO ${po.poNumber}?`)) return;

    setIsProcessing(true);
    try {
        await updateDoc(doc(db, PURCHASE_ORDERS_COLLECTION, po.id), {
            status: 'Cancelled',
            lastModified: serverTimestamp()
        });

        for (const item of po.items) {
            if (item.refJobId && item.refPartIndex !== undefined) {
                const jobRef = doc(db, SERVICE_JOBS_COLLECTION, item.refJobId);
                const jobSnap = await getDoc(jobRef);
                if (jobSnap.exists()) {
                    const currentParts = jobSnap.data().estimateData?.partItems || [];
                    if (currentParts[item.refPartIndex]) {
                        currentParts[item.refPartIndex] = { ...currentParts[item.refPartIndex], isOrdered: false };
                        await updateDoc(jobRef, { 'estimateData.partItems': currentParts });
                    }
                }
            }
        }

        showNotification(`PO ${po.poNumber} TELAH DIBATALKAN.`, "success");
        setViewMode('list');
        setSelectedPO(null);
    } catch (e: any) {
        console.error(e);
        showNotification("GAGAL MEMBATALKAN PO.", "error");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleEditPO = (po: PurchaseOrder) => {
      setPoForm({
          id: po.id,
          poNumber: po.poNumber,
          supplierId: po.supplierId,
          items: po.items || [],
          notes: po.notes || '',
          hasPpn: po.hasPpn || false,
          date: po.date ? toYyyyMmDd(po.date) : new Date().toISOString().split('T')[0]
      });
      const hasRef = po.items.some(i => i.refJobId);
      setPoCreationMode(hasRef ? 'wo' : 'manual');
      setViewMode('create');
  };

  const handleProcessReceiving = async () => {
      if (!selectedPO) return;
      if (selectedItemsToReceive.length === 0) { 
          showNotification("PILIH SETIDAKNYA SATU ITEM YANG AKAN DITERIMA.", "error"); 
          return; 
      }
      
      for (const idx of selectedItemsToReceive) {
          const item = selectedPO.items[idx];
          const remaining = item.qty - (item.qtyReceived || 0);
          const inputQty = receiveQtyMap[idx] || 0;
          
          if (inputQty <= 0) {
              showNotification(`QTY UNTUK ${item.name} HARUS LEBIH DARI 0.`, "error");
              return;
          }
          if (inputQty > remaining) {
              showNotification(`QTY UNTUK ${item.name} MELEBIHI SISA PESANAN (${remaining}).`, "error");
              return;
          }

          const isLinkedToExisting = item.inventoryId && inventoryItems.some(i => i.id === item.inventoryId);
          if (!isLinkedToExisting && item.estimatedSellPrice && item.estimatedSellPrice < item.price) {
              showNotification(`BLOKIR: HARGA JUAL ESTIMASI ${item.name} (${formatCurrency(item.estimatedSellPrice)}) LEBIH RENDAH DARI MODAL BELI (${formatCurrency(item.price)}). REVISI DI MENU ESTIMASI TERLEBIH DAHULU!`, "error");
              return;
          }
      }

      setIsProcessing(true);
      try {
          const batch = writeBatch(db);
          const updatedItems = [...selectedPO.items];
          const itemsReceivedForReport: {item: PurchaseOrderItem, qtyReceivedNow: number}[] = [];
          
          const jobUpdateMap: Record<string, { parts: EstimateItem[], changed: boolean }> = {};
          let mismatchCount = 0;

          for (const idx of selectedItemsToReceive) {
              const item = updatedItems[idx];
              const qtyNow = receiveQtyMap[idx] || 0;
              const itemCodeUpper = item.code.toUpperCase().trim();
              
              let targetInventoryId = item.inventoryId;
              const newBuyPrice = item.price;
              const newSellPrice = (!targetInventoryId && item.estimatedSellPrice && item.estimatedSellPrice > newBuyPrice) 
                                      ? item.estimatedSellPrice 
                                      : Math.round(newBuyPrice * 1.3);

              const isLinkedToExisting = targetInventoryId && inventoryItems.some(i => i.id === targetInventoryId);

              if (!isLinkedToExisting) {
                  const existingItem = inventoryItems.find(i => i.code === itemCodeUpper);
                  if (existingItem) {
                      targetInventoryId = existingItem.id;
                      batch.update(doc(db, SPAREPART_COLLECTION, targetInventoryId), { 
                          stock: increment(qtyNow), 
                          buyPrice: newBuyPrice, 
                          updatedAt: serverTimestamp() 
                      });
                  } else {
                      const newInvRef = doc(collection(db, SPAREPART_COLLECTION));
                      targetInventoryId = newInvRef.id;
                      batch.set(newInvRef, {
                          code: itemCodeUpper, 
                          name: item.name, 
                          category: item.category || 'sparepart', 
                          brand: item.brand || 'No Brand', 
                          stock: qtyNow, 
                          unit: item.unit, 
                          minStock: 2, 
                          buyPrice: newBuyPrice, 
                          sellPrice: newSellPrice, 
                          isStockManaged: item.isStockManaged ?? true,
                          createdAt: serverTimestamp(), 
                          updatedAt: serverTimestamp()
                      });
                  }
              } else {
                  if (targetInventoryId) {
                       batch.update(doc(db, SPAREPART_COLLECTION, targetInventoryId), { 
                          stock: increment(qtyNow), 
                          buyPrice: newBuyPrice, 
                          updatedAt: serverTimestamp() 
                      });
                  }
              }

              const newQtyReceived = (item.qtyReceived || 0) + qtyNow;
              updatedItems[idx] = { 
                  ...item, 
                  qtyReceived: newQtyReceived, 
                  inventoryId: targetInventoryId 
              };
              itemsReceivedForReport.push({item: updatedItems[idx], qtyReceivedNow: qtyNow});

              if (item.refJobId && item.refPartIndex !== undefined) {
                  const jobId = item.refJobId;
                  if (!jobUpdateMap[jobId]) {
                      const jobRef = doc(db, SERVICE_JOBS_COLLECTION, jobId);
                      const jobSnap = await getDoc(jobRef);
                      if (jobSnap.exists()) {
                          jobUpdateMap[jobId] = {
                              parts: [...(jobSnap.data().estimateData?.partItems || [])],
                              changed: false
                          };
                      }
                  }

                  if (jobUpdateMap[jobId] && jobUpdateMap[jobId].parts[item.refPartIndex]) {
                      const jobPart = jobUpdateMap[jobId].parts[item.refPartIndex];
                      jobPart.inventoryId = targetInventoryId;
                      jobPart.hasArrived = true; 
                      jobUpdateMap[jobId].changed = true;

                      if (inventoryItems.find(i => i.id === targetInventoryId)) {
                          if (jobPart.price < newSellPrice) {
                              jobPart.isPriceMismatch = true;
                              jobPart.mismatchSuggestedPrice = newSellPrice;
                              mismatchCount++;
                          }
                      }
                  }
              }
          }

          for (const [jobId, data] of Object.entries(jobUpdateMap)) {
              if (data.changed) {
                  const updatePayload: any = {
                      'estimateData.partItems': data.parts,
                      updatedAt: serverTimestamp()
                  };
                  
                  const partsComplete = data.parts.every(p => p.hasArrived || !p.isOrdered);
                  
                  if (partsComplete) {
                      const jobRef = doc(db, SERVICE_JOBS_COLLECTION, jobId);
                      const jobSnap = await getDoc(jobRef);
                      if (jobSnap.exists()) {
                          const currentStatus = jobSnap.data().statusKendaraan;
                          if (currentStatus === 'Tunggu Part' || currentStatus === 'Unit di Pemilik (Tunggu Part)') {
                              updatePayload.statusKendaraan = 'Sparepart Lengkap';
                              updatePayload.productionLogs = arrayUnion({
                                  stage: 'Logistik',
                                  note: 'Semua part telah diterima dari PO (Sparepart Lengkap)',
                                  timestamp: new Date().toISOString(),
                                  user: userPermissions.role,
                                  type: 'progress'
                              });
                          }
                      }
                  }

                  batch.update(doc(db, SERVICE_JOBS_COLLECTION, jobId), updatePayload);
              }
          }

          const isFull = updatedItems.every(i => (i.qtyReceived || 0) >= i.qty);
          batch.update(doc(db, PURCHASE_ORDERS_COLLECTION, selectedPO.id), { 
              items: updatedItems, 
              status: isFull ? 'Received' : 'Partial',
              receivedAt: serverTimestamp(),
              receivedBy: userPermissions.role
          });

          const bstNumber = await generateSequentialId('receiptBsts', 'bstNumber', 'BST');
          const bstRef = doc(collection(db, 'receiptBsts'));
          batch.set(bstRef, {
              bstNumber,
              poId: selectedPO.id,
              poNumber: selectedPO.poNumber,
              receivedAt: serverTimestamp(),
              receivedBy: userPermissions.role,
              itemsCount: itemsReceivedForReport.length
          });

          await batch.commit();
          generateReceivingReportPDF(selectedPO, itemsReceivedForReport, settings, userPermissions.role, bstNumber);
          
          if (mismatchCount > 0) {
              showNotification(`BARANG DITERIMA. WARNING: ${mismatchCount} ITEM MISMATCH HARGA.`, "info");
          } else {
              showNotification(`PENERIMAAN BERHASIL. STOK GUDANG BERTAMBAH.`, "success");
          }
          
          setViewMode('list');
          setSelectedPO(null);

      } catch (e: any) {
          console.error("Receiving Error:", e);
          showNotification("ERROR SAAT PENERIMAAN: " + e.message, "error");
      } finally {
          setIsProcessing(false);
      }
  };

  const handleSearchWO = () => {
      if (!woSearchTerm) return;
      const termUpper = woSearchTerm.toUpperCase().replace(/\s/g, '');
      const matches = jobs.filter(j => !j.isClosed && !j.isDeleted && ((j.woNumber && j.woNumber.toUpperCase().replace(/\s/g, '').includes(termUpper)) || (j.policeNumber && j.policeNumber.toUpperCase().replace(/\s/g, '').includes(termUpper)) || (j.customerName && j.customerName.toUpperCase().includes(termUpper))));
      if (matches.length > 0) {
          matches.sort((a, b) => { const getTime = (val: any) => val?.seconds || 0; return getTime(b.createdAt) - getTime(a.createdAt); });
          setWoMatches(matches); setIsWoPickerOpen(true);
      } else { showNotification("NO. POLISI ATAU WO AKTIF TIDAK DITEMUKAN.", "error"); setWoMatches([]); setIsWoPickerOpen(false); setFoundJob(null); }
  };

  const handleSelectJobFromPicker = (job: Job) => {
      if (!job.estimateData?.partItems || job.estimateData.partItems.length === 0) { showNotification(`PEKERJAAN ${job.policeNumber} TIDAK MEMILIKI ESTIMASI SUKU CADANG.`, "error"); return; }
      setFoundJob(job); setIsWoPickerOpen(false);
      const initialSelection: any = {};
      job.estimateData.partItems.forEach((p, idx) => { if (!p.isOrdered) initialSelection[idx] = { selected: true, isIndent: p.isIndent || false }; });
      setSelectedPartsFromWo(initialSelection);
      showNotification(`WORK ORDER ${job.woNumber || job.policeNumber} DIPILIH.`, "success");
  };

  const handleToggleWoPart = (idx: number, field: 'selected' | 'isIndent') => {
      setSelectedPartsFromWo(prev => { const current = prev[idx] || { selected: false, isIndent: false }; return { ...prev, [idx]: { ...current, [field]: !current[field] } }; });
  };

  const handleImportPartsToPO = () => {
      if (!foundJob || !foundJob.estimateData) return;
      const itemsToAdd: PurchaseOrderItem[] = [];
      const parts = foundJob.estimateData.partItems || [];
      parts.forEach((estItem, idx) => {
          const selection = selectedPartsFromWo[idx];
          if (selection && selection.selected) {
              const partCodeUpper = estItem.number?.toUpperCase().trim() || "";
              const invItem = inventoryItems.find(i => (estItem.inventoryId && i.id === estItem.inventoryId) || (partCodeUpper && i.code?.toUpperCase() === partCodeUpper));
              itemsToAdd.push({
                  code: partCodeUpper || estItem.number || 'NON-PART-NO', name: estItem.name || 'TANPA NAMA', brand: invItem?.brand || foundJob.carBrand || 'GENUINE', category: 'sparepart', qty: estItem.qty || 1, qtyReceived: 0, unit: invItem?.unit || 'PCS', price: invItem?.buyPrice || 0, total: (estItem.qty || 1) * (invItem?.buyPrice || 0), inventoryId: estItem.inventoryId || invItem?.id || null, refJobId: foundJob.id, refWoNumber: foundJob.woNumber, refPartIndex: idx, isIndent: selection.isIndent, isStockManaged: true, estimatedSellPrice: estItem.price || 0
              });
          }
      });
      if (itemsToAdd.length === 0) { showNotification("PILIH MINIMAL SATU PART.", "error"); return; }
      setPoForm((prev: any) => ({ ...prev, items: [...(prev.items || []), ...itemsToAdd] }));
      if (!poForm.notes) setPoForm((prev: any) => ({ ...prev, notes: `PO WO: ${foundJob.woNumber || foundJob.policeNumber}` }));
      showNotification(`${itemsToAdd.length} ITEM MASUK KE DRAFT PO.`, "success"); setFoundJob(null); setWoSearchTerm('');
  };

  const handleAddItem = () => { setPoForm((prev: any) => ({ ...prev, items: [...(prev.items || []), { code: '', name: '', brand: '', category: 'sparepart', qty: 1, price: 0, total: 0, unit: 'Pcs', inventoryId: null, qtyReceived: 0, isStockManaged: true }] })); };

  const handleUpdateItem = (index: number, field: keyof PurchaseOrderItem, value: any) => {
      const newItems = [...(poForm.items || [])];
      if (field === 'code') {
          const codeUpper = String(value).toUpperCase().trim();
          const match = inventoryItems.find(i => i.code?.toUpperCase() === codeUpper);
          if (match) { newItems[index] = { ...newItems[index], inventoryId: match.id, name: match.name, brand: match.brand || '', category: match.category, unit: match.unit, price: match.buyPrice, code: match.code, isStockManaged: match.isStockManaged ?? true }; } else { newItems[index] = { ...newItems[index], inventoryId: null, code: codeUpper }; }
      } else { newItems[index] = { ...newItems[index], [field]: value }; }
      newItems[index].total = (newItems[index].qty || 0) * (newItems[index].price || 0);
      setPoForm((prev: any) => ({ ...prev, items: newItems }));
  };

  const handleRemoveItem = (index: number) => { const newItems = poForm.items?.filter((_: any, i: number) => i !== index); setPoForm((prev: any) => ({ ...prev, items: newItems })); };

  const calculateFinancials = () => {
      const subtotal = poForm.items?.reduce((acc: number, item: any) => acc + item.total, 0) || 0;
      const ppnPercentage = settings?.ppnPercentage || 11;
      const ppnRate = ppnPercentage / 100;
      const ppnAmount = poForm.hasPpn ? Math.round(subtotal * ppnRate) : 0;
      const totalAmount = subtotal + ppnAmount;
      return { subtotal, ppnAmount, totalAmount };
  };

  const handleSubmitPO = async (status: 'Draft' | 'Pending Approval') => {
      if (!poForm.supplierId || !poForm.items || poForm.items.length === 0) {
          showNotification("PILIH SUPPLIER DAN TAMBAHKAN ITEM.", "error");
          return;
      }
      const supplier = suppliers.find(s => s.id === poForm.supplierId);
      if (!supplier) return;

      const { subtotal, ppnAmount, totalAmount } = calculateFinancials();

      const sanitizedItems = (poForm.items || []).map((item: any) => ({
          ...item,
          code: item.code.toUpperCase(),
          qtyReceived: 0,
          isStockManaged: item.isStockManaged ?? true
      }));

      setLoading(true);
      try {
          const payload: any = {
              supplierId: poForm.supplierId,
              items: sanitizedItems,
              notes: poForm.notes || '',
              hasPpn: poForm.hasPpn || false,
              date: poForm.date, 
              supplierName: supplier.name,
              status,
              subtotal,
              ppnAmount,
              totalAmount,
              createdBy: userPermissions.role
          };

          if (poForm.id) {
              payload.poNumber = poForm.poNumber; 
              payload.lastModified = serverTimestamp();
              
              await updateDoc(doc(db, PURCHASE_ORDERS_COLLECTION, poForm.id), cleanObject(payload));
              showNotification(`PO ${poForm.poNumber} BERHASIL DIPERBARUI.`, "success");
          } else {
              const poNumber = await generateSequentialId(PURCHASE_ORDERS_COLLECTION, 'poNumber', 'PO');
              payload.poNumber = poNumber;
              payload.createdAt = serverTimestamp();
              
              await addDoc(collection(db, PURCHASE_ORDERS_COLLECTION), cleanObject(payload));
              showNotification(`PO ${poNumber} BERHASIL DITERBITKAN!`, "success");
          }

          for (const item of sanitizedItems) {
              if (item.refJobId && item.refPartIndex !== null) {
                  const jobRef = doc(db, SERVICE_JOBS_COLLECTION, item.refJobId);
                  const jobSnap = await getDoc(jobRef);
                  if (jobSnap.exists()) {
                      const currentParts = jobSnap.data().estimateData?.partItems || [];
                      if (currentParts[item.refPartIndex!]) {
                          currentParts[item.refPartIndex!] = { ...currentParts[item.refPartIndex!], isOrdered: true, isIndent: item.isIndent };
                          await updateDoc(jobRef, { 'estimateData.partItems': currentParts });
                      }
                  }
              }
          }
          
          if (onPOComplete) {
              onPOComplete();
          } else {
              setViewMode('list');
          }
          setPoForm({ id: null, poNumber: '', supplierId: '', items: [], notes: '', hasPpn: false, date: new Date().toISOString().split('T')[0] });
          setPoCreationMode('manual');
      } catch (e: any) {
          showNotification("GAGAL MENYIMPAN PO.", "error");
      } finally {
          setLoading(false);
      }
  };

  const getStatusBadge = (status: string) => {
      switch (status) {
          case 'Draft': return <span className="px-2 py-1 bg-soft-cloud text-mute border border-hairline uppercase tracking-widest text-[10px]">DRAFT</span>;
          case 'Pending Approval': return <span className="px-2 py-1 bg-canvas text-ink border border-ink uppercase tracking-widest text-[10px] animate-pulse">PENDING APPROVAL</span>;
          case 'Ordered': return <span className="px-2 py-1 bg-ink text-canvas border border-ink uppercase tracking-widest text-[10px]">ORDERED</span>;
          case 'Partial': return <span className="px-2 py-1 bg-canvas text-ink border border-ink uppercase tracking-widest text-[10px]">PARTIAL</span>;
          case 'Received': return <span className="px-2 py-1 bg-canvas text-ink border border-hairline uppercase tracking-widest text-[10px] opacity-70">RECEIVED</span>;
          case 'Rejected': return <span className="px-2 py-1 bg-soft-cloud text-ink border border-ink uppercase tracking-widest text-[10px]">REJECTED</span>;
          case 'Cancelled': return <span className="px-2 py-1 bg-soft-cloud text-mute border border-hairline uppercase tracking-widest text-[10px]">CANCELLED</span>;
          default: return null;
      }
  };

  if (viewMode === 'create') {
      const { subtotal, ppnAmount, totalAmount } = calculateFinancials();
      const isEditing = !!poForm.id;

      return (
          <div className="animate-fade-in pb-[48px]">
              <div className="flex items-center gap-4 mb-[48px] border-b border-hairline pb-[24px]">
                  <button onClick={() => { 
                      setPoForm({id: null, poNumber: '', supplierId: '', items: [], hasPpn: false, date: new Date().toISOString().split('T')[0]}); 
                      if (onPOComplete) onPOComplete(); else setViewMode('list'); 
                  }} className="text-[12px] font-medium text-ink uppercase tracking-widest border border-hairline hover:border-ink px-4 py-2 transition-colors">KEMBALI</button>
                  <h2 className="text-[32px] font-display uppercase leading-none text-ink">{isEditing ? `EDIT PO ${poForm.poNumber}` : 'BUAT PURCHASE ORDER BARU'}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-[24px] mb-[48px]">
                  <div>
                      <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">SUPPLIER *</label>
                      <select className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase" value={poForm.supplierId} onChange={e => setPoForm({ ...poForm, supplierId: e.target.value })}>
                          <option value="">-- PILIH SUPPLIER --</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                  </div>
                  <div>
                      <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">TANGGAL PO *</label>
                      <input type="date" className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase" value={poForm.date} onChange={e => setPoForm({...poForm, date: e.target.value})} />
                  </div>
                  <div>
                      <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">METODE INPUT</label>
                      <div className="flex bg-soft-cloud border border-hairline p-1">
                          <button onClick={() => setPoCreationMode('manual')} className={`flex-1 py-3 text-[10px] font-medium uppercase tracking-widest transition-colors ${poCreationMode === 'manual' ? 'bg-ink text-canvas' : 'bg-transparent text-mute hover:text-ink'}`}>GENERAL</button>
                          <button onClick={() => setPoCreationMode('wo')} className={`flex-1 py-3 text-[10px] font-medium uppercase tracking-widest transition-colors ${poCreationMode === 'wo' ? 'bg-ink text-canvas' : 'bg-transparent text-mute hover:text-ink'}`}>DARI WO</button>
                      </div>
                  </div>
              </div>

              {poCreationMode === 'wo' && (
                  <div className="mb-[48px] bg-canvas border border-hairline p-6 relative">
                      <h3 className="font-medium text-[14px] text-ink uppercase tracking-widest mb-4">CARI KEBUTUHAN PART DARI ESTIMASI SA</h3>
                      <div className="flex gap-4 mb-6 relative">
                          <div className="relative flex-grow">
                              <input 
                                  type="text" 
                                  placeholder="NO. POLISI, WO, ATAU NAMA..." 
                                  className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase" 
                                  value={woSearchTerm} 
                                  onChange={e => {
                                      setWoSearchTerm(e.target.value);
                                      if (!e.target.value) setIsWoPickerOpen(false);
                                  }} 
                                  onKeyDown={e => e.key === 'Enter' && handleSearchWO()}
                              />
                              
                              {isWoPickerOpen && (
                                  <div ref={pickerRef} className="absolute left-0 right-0 top-full mt-2 bg-canvas border border-hairline shadow-2xl z-50 max-h-72 overflow-y-auto">
                                      <div className="p-3 bg-soft-cloud border-b border-hairline sticky top-0 z-10">
                                          <span className="text-[10px] font-medium text-mute uppercase tracking-widest">PILIH WORK ORDER AKTIF</span>
                                      </div>
                                      {woMatches.map(job => (
                                          <div 
                                              key={job.id} 
                                              onClick={() => handleSelectJobFromPicker(job)}
                                              className="p-4 hover:bg-soft-cloud cursor-pointer border-b border-hairline last:border-0 flex justify-between items-center transition-colors"
                                          >
                                              <div>
                                                  <div className="flex items-center gap-4">
                                                      <span className="font-display text-[24px] text-ink">{job.policeNumber}</span>
                                                      <span className="px-2 py-1 bg-canvas border border-ink text-ink text-[10px] font-medium tracking-widest uppercase">{job.woNumber || 'ESTIMASI'}</span>
                                                  </div>
                                                  <div className="text-[10px] text-mute uppercase tracking-widest mt-1">{job.customerName} | {job.carModel}</div>
                                              </div>
                                              <div className="text-right">
                                                  <span className="text-[10px] font-medium text-mute uppercase tracking-widest">{formatDateIndo(job.createdAt)}</span>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                          <button onClick={handleSearchWO} disabled={loading} className="bg-ink text-canvas px-8 py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors disabled:opacity-50">
                              {loading ? 'PROCESSING...' : 'CARI DATA'}
                          </button>
                      </div>

                      {foundJob && (
                          <div className="bg-canvas border border-hairline overflow-hidden animate-fade-in">
                              <div className="p-4 bg-soft-cloud flex justify-between items-center border-b border-hairline">
                                  <div className="flex items-center gap-4">
                                      <div className="flex items-center gap-2 font-medium text-ink uppercase text-[14px]">
                                          <span>{foundJob.woNumber || 'ESTIMASI'}</span> 
                                          <span className="text-mute mx-1">|</span>
                                          <span>{foundJob.policeNumber}</span>
                                      </div>
                                      <span className="text-[10px] font-medium text-mute uppercase tracking-widest">{foundJob.customerName}</span>
                                  </div>
                                  <div className="flex gap-4">
                                      <button onClick={() => setFoundJob(null)} className="text-[10px] font-medium text-ink border border-hairline hover:border-ink px-4 py-2 uppercase tracking-widest transition-colors">BATAL</button>
                                      <button onClick={handleImportPartsToPO} className="bg-ink text-canvas px-4 py-2 text-[10px] font-medium uppercase tracking-widest hover:bg-mute transition-colors">TAMBAH KE PO</button>
                                  </div>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-canvas border-b border-hairline"><tr><th className="p-4 w-16 text-center text-[10px] font-medium text-mute uppercase tracking-widest">PILIH</th><th className="p-4 text-[10px] font-medium text-mute uppercase tracking-widest">ITEM PART SA</th><th className="p-4 w-24 text-center text-[10px] font-medium text-mute uppercase tracking-widest">QTY</th><th className="p-4 text-center text-[10px] font-medium text-mute uppercase tracking-widest">SET INDENT?</th></tr></thead>
                                    <tbody className="divide-y divide-hairline">
                                        {foundJob.estimateData?.partItems?.map((part, idx) => (
                                            <tr key={idx} className={part.isOrdered ? 'bg-soft-cloud opacity-60' : 'hover:bg-soft-cloud transition-colors'}>
                                                <td className="p-4 text-center">{!part.isOrdered && <input type="checkbox" checked={selectedPartsFromWo[idx]?.selected || false} onChange={() => handleToggleWoPart(idx, 'selected')} className="w-4 h-4 cursor-pointer accent-ink"/>}</td>
                                                <td className="p-4"><div className="font-medium text-[14px] text-ink uppercase">{part.name}</div><div className="text-[10px] text-mute uppercase tracking-widest mt-1">{part.number || 'TANPA NO PART'}</div></td>
                                                <td className="p-4 text-center font-medium text-ink text-[14px]">{part.qty || 1}</td>
                                                <td className="p-4 text-center">{!part.isOrdered && selectedPartsFromWo[idx]?.selected && <label className="inline-flex items-center gap-2 cursor-pointer text-[10px] bg-canvas px-3 py-1 border border-hairline"><input type="checkbox" checked={selectedPartsFromWo[idx]?.isIndent || false} onChange={() => handleToggleWoPart(idx, 'isIndent')} className="accent-ink"/><span className={selectedPartsFromWo[idx]?.isIndent ? 'text-ink font-medium uppercase' : 'text-mute font-medium uppercase'}>INDENT</span></label>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                              </div>
                          </div>
                      )}
                  </div>
              )}

              <div className="mb-[48px]">
                  <h3 className="font-medium text-[14px] text-ink uppercase tracking-widest mb-4">ITEM PESANAN {isEditing ? '(MODE EDIT)' : '(DRAFT)'}</h3>
                  <div className="overflow-x-auto bg-canvas border border-hairline">
                    <table className="w-full text-left">
                        <thead className="bg-soft-cloud border-b border-hairline font-medium text-[10px] text-mute uppercase tracking-widest">
                            <tr>
                                <th className="p-4 font-normal">KATEGORI</th>
                                <th className="p-4 font-normal">KODE PART</th>
                                <th className="p-4 font-normal">NAMA BARANG</th>
                                <th className="p-4 font-normal">MERK / MODEL</th>
                                <th className="p-4 w-24 text-center font-normal">QTY</th>
                                <th className="p-4 w-32 font-normal">SATUAN</th>
                                <th className="p-4 text-right font-normal">HARGA</th>
                                <th className="p-4 text-right font-normal">TOTAL</th>
                                <th className="p-4 w-16 font-normal"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                            {(poForm.items || []).map((item: any, idx: number) => (
                                <tr key={idx} className={item.refJobId ? "bg-soft-cloud/50" : ""}>
                                    <td className="p-2">
                                        <select className="w-full p-2 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[10px] font-medium uppercase tracking-widest text-ink" value={item.category} onChange={e => handleUpdateItem(idx, 'category', e.target.value)}>
                                            <option value="sparepart">PART</option>
                                            <option value="material">BAHAN</option>
                                        </select>
                                        {item.category === 'material' && (
                                            <div className="mt-2 flex items-center gap-2">
                                                <input 
                                                    type="checkbox" 
                                                    id={`stockManaged-${idx}`}
                                                    checked={item.isStockManaged === false} 
                                                    onChange={e => handleUpdateItem(idx, 'isStockManaged', !e.target.checked)}
                                                    className="w-3 h-3 accent-ink cursor-pointer"
                                                />
                                                <label htmlFor={`stockManaged-${idx}`} className="text-[8px] text-mute font-medium uppercase tracking-widest cursor-pointer whitespace-nowrap">
                                                    READY USE
                                                </label>
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-2"><input type="text" className="w-full p-2 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[10px] font-medium uppercase tracking-widest text-ink" value={item.code} onChange={e => handleUpdateItem(idx, 'code', e.target.value)} placeholder="KODE..." disabled={!!item.refJobId}/></td>
                                    <td className="p-2">
                                        <input type="text" className="w-full p-2 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[10px] font-medium uppercase tracking-widest text-ink" value={item.name} onChange={e => handleUpdateItem(idx, 'name', e.target.value)} placeholder="NAMA..." disabled={!!item.refJobId}/>
                                        {item.refWoNumber && <div className="text-[8px] text-ink font-medium uppercase tracking-widest mt-1">REF: {item.refWoNumber} {item.isIndent && <span className="border border-ink px-1 ml-1 animate-pulse">INDENT</span>}</div>}
                                    </td>
                                    <td className="p-2"><input type="text" className="w-full p-2 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[10px] font-medium uppercase tracking-widest text-ink" value={item.brand} onChange={e => handleUpdateItem(idx, 'brand', e.target.value)} placeholder="MERK/TIPE..."/></td>
                                    <td className="p-2"><input type="number" className="w-full p-2 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[10px] font-medium uppercase tracking-widest text-ink text-center" value={item.qty} onChange={e => handleUpdateItem(idx, 'qty', Number(e.target.value))} /></td>
                                    <td className="p-2">
                                        <select className="w-full p-2 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[10px] font-medium uppercase tracking-widest text-ink" value={item.unit} onChange={e => handleUpdateItem(idx, 'unit', e.target.value)}>
                                            {UNIT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt.toUpperCase()}</option>)}
                                        </select>
                                    </td>
                                    <td className="p-2"><input type="number" className="w-full p-2 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[12px] font-medium text-ink text-right" value={item.price} onChange={e => handleUpdateItem(idx, 'price', Number(e.target.value))} /></td>
                                    <td className="p-2 text-right font-medium text-[12px] text-ink">{formatCurrency(item.total)}</td>
                                    <td className="p-2 text-center"><button onClick={() => handleRemoveItem(idx)} className="text-[10px] font-medium text-ink border border-hairline hover:border-ink px-2 py-1 uppercase tracking-widest transition-colors">HAPUS</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>
                  {poCreationMode === 'manual' && <button onClick={handleAddItem} className="mt-4 text-[10px] font-medium text-ink uppercase tracking-widest border border-hairline hover:border-ink px-4 py-2 transition-colors">+ TAMBAH MANUAL</button>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-[24px] pt-6 border-t border-hairline bg-canvas p-6 border">
                  <div>
                      <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">CATATAN</label>
                      <textarea className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase" rows={3} value={poForm.notes} onChange={e => setPoForm({ ...poForm, notes: e.target.value })}/>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                      <div className="w-full max-w-sm space-y-4">
                          <div className="flex justify-between text-[12px] font-medium text-mute uppercase tracking-widest"><span>SUBTOTAL</span><span className="text-ink">{formatCurrency(subtotal)}</span></div>
                          <div className="flex justify-between items-center text-[12px] font-medium text-mute uppercase tracking-widest">
                              <label className="flex items-center gap-3 cursor-pointer">
                                  <input type="checkbox" checked={poForm.hasPpn} onChange={() => setPoForm((prev: any) => ({...prev, hasPpn: !prev.hasPpn}))} className="w-4 h-4 accent-ink cursor-pointer" />
                                  <span>PPN {settings.ppnPercentage}%</span>
                              </label>
                              <span className="text-ink">{formatCurrency(ppnAmount)}</span>
                          </div>
                          <div className="flex justify-between text-[16px] font-medium text-ink uppercase tracking-widest border-t border-hairline pt-4"><span>TOTAL</span><span>{formatCurrency(totalAmount)}</span></div>
                      </div>
                      <div className="flex gap-4 mt-8 justify-end w-full">
                        <button onClick={() => handleSubmitPO('Draft')} disabled={loading} className="px-6 py-4 border border-ink text-ink text-[12px] font-medium uppercase tracking-widest hover:bg-soft-cloud transition-colors disabled:opacity-50">SIMPAN DRAFT</button>
                        <button onClick={() => handleSubmitPO('Pending Approval')} disabled={loading} className="px-8 py-4 bg-ink text-canvas text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors disabled:opacity-50">{isEditing ? 'SIMPAN PERUBAHAN' : 'AJUKAN APPROVAL'}</button>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  if (viewMode === 'detail' && selectedPO) {
      const isReceivable = selectedPO.status === 'Ordered' || selectedPO.status === 'Partial';
      const showApprovalActions = selectedPO.status === 'Pending Approval' && isManager;

      return (
          <div className="animate-fade-in pb-[48px]">
              <div className="flex flex-col md:flex-row justify-between items-start mb-[48px] border-b border-hairline pb-[24px] gap-6">
                  <div className="flex items-center gap-6">
                      <button onClick={() => { setViewMode('list'); setSelectedPO(null); }} className="text-[12px] font-medium text-ink uppercase tracking-widest border border-hairline hover:border-ink px-4 py-2 transition-colors">KEMBALI</button>
                      <div>
                          <h2 className="text-[48px] font-display text-ink uppercase leading-none">{selectedPO.poNumber}</h2>
                          <div className="flex items-center gap-4 mt-4">
                              {getStatusBadge(selectedPO.status)}
                              <span className="text-[12px] font-medium text-mute uppercase tracking-widest">SUPPLIER: <span className="text-ink">{selectedPO.supplierName}</span></span>
                          </div>
                      </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                      {isManager && selectedPO.status !== 'Cancelled' && selectedPO.status !== 'Received' && (
                          <button 
                              onClick={() => handleCancelPO(selectedPO)} 
                              disabled={isProcessing} 
                              className="px-6 py-4 border border-ink text-ink text-[12px] font-medium uppercase tracking-widest hover:bg-soft-cloud transition-colors disabled:opacity-50"
                          >
                              BATALKAN PO
                          </button>
                      )}
                      {showApprovalActions && (
                          <>
                            <button 
                                type="button" 
                                onClick={(e) => handleRejectPO(e)} 
                                disabled={isProcessing} 
                                className="px-6 py-4 border border-ink text-ink text-[12px] font-medium uppercase tracking-widest hover:bg-soft-cloud transition-colors disabled:opacity-50"
                            >
                                TOLAK
                            </button>
                            <button 
                                type="button" 
                                onClick={(e) => handleApprovePO(e)} 
                                disabled={isProcessing} 
                                className="px-6 py-4 bg-ink text-canvas text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors disabled:opacity-50"
                            >
                                {isProcessing ? 'PROCESSING...' : 'SETUJUI (APPROVE)'}
                            </button>
                          </>
                      )}
                      {isReceivable && selectedItemsToReceive.length > 0 && (
                        <button onClick={handleProcessReceiving} disabled={isProcessing} className="px-6 py-4 bg-ink text-canvas text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors animate-pulse">SIMPAN TERIMA ({selectedItemsToReceive.length})</button>
                      )}
                      <button onClick={() => handlePrintPO(selectedPO)} className="px-6 py-4 border border-hairline hover:border-ink text-ink text-[12px] font-medium uppercase tracking-widest transition-colors">PRINT PO</button>
                  </div>
              </div>

              <div className="overflow-x-auto bg-canvas border border-hairline">
                  <table className="w-full text-left">
                      <thead className="bg-soft-cloud border-b border-hairline font-medium text-[10px] text-mute uppercase tracking-widest">
                          <tr>{isReceivable && <th className="p-4 font-normal w-12 text-center"></th>}<th className="p-4 font-normal">ITEM BARANG</th><th className="p-4 text-center font-normal">ORDER</th><th className="p-4 text-center font-normal bg-canvas border-l border-r border-hairline">DITERIMA</th>{isReceivable && <th className="p-4 text-center font-normal">DATANG</th>}<th className="p-4 text-right font-normal">HARGA</th><th className="p-4 text-right font-normal">TOTAL</th></tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                          {(selectedPO.items || []).map((item, idx) => {
                              const rem = item.qty - (item.qtyReceived || 0);
                              return (
                                  <tr key={idx} className={rem <= 0 ? 'opacity-50 bg-soft-cloud' : 'hover:bg-soft-cloud transition-colors'}>
                                      {isReceivable && <td className="p-4 text-center">{rem > 0 && <input type="checkbox" checked={selectedItemsToReceive.includes(idx)} onChange={() => toggleItemSelection(idx)} className="w-4 h-4 accent-ink cursor-pointer"/>}</td>}
                                      <td className="p-4">
                                          <div className="font-medium text-[14px] text-ink uppercase">{item.name}</div>
                                          <div className="text-[10px] font-medium text-mute uppercase tracking-widest mt-1">
                                              {item.code} {item.brand && `| ${item.brand}`} {item.refWoNumber && `[WO: ${item.refWoNumber}]`} 
                                              <span className="ml-2 px-2 py-1 border border-hairline bg-canvas text-[8px]">{item.category}</span>
                                          </div>
                                      </td>
                                      <td className="p-4 text-center font-medium text-ink text-[14px]">{item.qty} <span className="text-[10px] text-mute uppercase">{item.unit}</span></td>
                                      <td className="p-4 text-center font-medium text-ink text-[14px] bg-canvas border-l border-r border-hairline">{item.qtyReceived || 0}</td>
                                      {isReceivable && <td className="p-4 text-center">{rem > 0 && selectedItemsToReceive.includes(idx) ? <input type="number" max={rem} className="w-20 p-2 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[12px] font-medium text-ink text-center" value={receiveQtyMap[idx] || ''} onChange={e => setReceiveQtyMap({...receiveQtyMap, [idx]: Number(e.target.value)})}/> : '-'}</td>}
                                      <td className="p-4 text-right font-medium text-[12px] text-mute">{formatCurrency(item.price)}</td>
                                      <td className="p-4 text-right font-medium text-[14px] text-ink">{formatCurrency(item.total)}</td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>
          </div>
      );
  }

  return (
    <div className="animate-fade-in pb-[48px]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-[48px] border-b border-hairline pb-[24px]">
            <div>
                <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">PURCHASE ORDER</h1>
                <p className="text-[16px] text-mute font-normal mt-[18px] uppercase tracking-widest">KELOLA PENGADAAN BARANG BENGKEL (REAL-TIME).</p>
            </div>
            <button onClick={() => setViewMode('create')} className="bg-ink text-canvas px-6 py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors whitespace-nowrap">BUAT PO BARU</button>
        </div>

        <div className="bg-canvas border border-hairline overflow-hidden flex flex-col h-full">
            <div className="p-4 bg-soft-cloud border-b border-hairline flex items-center justify-between">
                <input type="text" placeholder="CARI NO. PO ATAU SUPPLIER..." className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium text-[14px] text-ink uppercase" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            {realTimePOs.length === 0 ? <div className="p-12 text-center text-mute text-[12px] uppercase tracking-widest">BELUM ADA PO DIBUAT.</div> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-canvas border-b border-hairline text-mute uppercase font-medium text-[10px] tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-normal">NO. PO</th>
                                <th className="px-6 py-4 font-normal">SUPPLIER</th>
                                <th className="px-6 py-4 font-normal">STATUS</th>
                                <th className="px-6 py-4 text-right font-normal">TOTAL</th>
                                <th className="px-6 py-4 text-center font-normal">AKSI</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                            {realTimePOs.filter(o => o.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) || o.supplierName.toLowerCase().includes(searchTerm.toLowerCase())).map(order => {
                                const isPendingOrDraft = order.status === 'Pending Approval' || order.status === 'Draft';
                                const canModify = isManager || (isPartman && isPendingOrDraft);

                                return (
                                <tr key={order.id} className="hover:bg-soft-cloud transition-colors">
                                    <td className="px-6 py-4 font-display text-[20px] text-ink">{order.poNumber}</td>
                                    <td className="px-6 py-4 font-medium text-[14px] text-ink uppercase">{order.supplierName}</td>
                                    <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                                    <td className="px-6 py-4 text-right font-medium text-[14px] text-ink">{formatCurrency(order.totalAmount)}</td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => { setSelectedPO(order); setViewMode('detail'); }} className="px-3 py-1 border border-hairline hover:border-ink text-ink text-[10px] font-medium uppercase tracking-widest transition-colors">LIHAT</button>
                                            
                                            {canModify && (
                                                <button 
                                                    onClick={() => handleEditPO(order)} 
                                                    className="px-3 py-1 border border-hairline hover:border-ink text-ink text-[10px] font-medium uppercase tracking-widest transition-colors"
                                                >
                                                    EDIT
                                                </button>
                                            )}

                                            {['Ordered', 'Partial', 'Received'].includes(order.status) && <button onClick={() => handlePrintPO(order)} className="px-3 py-1 border border-hairline hover:border-ink text-ink text-[10px] font-medium uppercase tracking-widest transition-colors">PRINT</button>}
                                            
                                            {canModify && order.status !== 'Received' && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleCancelPO(order); }} 
                                                    className="px-3 py-1 border border-hairline hover:border-ink text-ink text-[10px] font-medium uppercase tracking-widest transition-colors"
                                                >
                                                    BATAL
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    </div>
  );
};

export default PurchaseOrderView;
