
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, getDocs, doc, addDoc, updateDoc, serverTimestamp, increment, query, orderBy, limit, getDoc, where, Timestamp, writeBatch } from 'firebase/firestore';
import { db, PURCHASE_ORDERS_COLLECTION, SPAREPART_COLLECTION, SETTINGS_COLLECTION, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { InventoryItem, Supplier, PurchaseOrder, PurchaseOrderItem, UserPermissions, Settings, Job, EstimateItem } from '../../types';
import { formatCurrency, formatDateIndo, cleanObject, generateRandomId, toYyyyMmDd } from '../../utils/helpers';
import { generatePurchaseOrderPDF, generateReceivingReportPDF } from '../../utils/pdfGenerator';
import { ShoppingCart, Plus, Search, Eye, Download, CheckCircle, XCircle, ArrowLeft, Trash2, Package, AlertCircle, CheckSquare, Square, Printer, Save, FileText, Send, Ban, Check, RefreshCw, Layers, Car, Loader2, X, ChevronRight, Hash, Clock, Calendar, AlertTriangle, Edit } from 'lucide-react';
import { initialSettingsState } from '../../utils/constants';

interface PurchaseOrderViewProps {
  suppliers: Supplier[];
  inventoryItems: InventoryItem[];
  jobs?: Job[]; 
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
  realTimePOs?: PurchaseOrder[];
}

const UNIT_OPTIONS = ['Pcs', 'Set', 'Unit', 'Liter', 'Kaleng', 'Kg', 'Gram', 'Meter', 'Roll', 'Galon'];

const PurchaseOrderView: React.FC<PurchaseOrderViewProps> = ({ 
  suppliers, inventoryItems, jobs = [], userPermissions, showNotification, realTimePOs = []
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
      id: null, // Add ID to track edit mode
      poNumber: '', // Track PO Number for edit
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
        showNotification(`Mendownload ${po.poNumber}...`, "success");
    } catch (err: any) {
        console.error("PDF Print Error:", err);
        showNotification("Gagal mencetak PDF.", "error");
    }
  };

  const handleApprovePO = async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!selectedPO || !selectedPO.id) return;
    if (!isManager) { showNotification("Akses Ditolak: Manager only.", "error"); return; }

    if (!window.confirm(`Setujui PO ${selectedPO.poNumber}?`)) return;

    setIsProcessing(true);
    try {
        const poRef = doc(db, PURCHASE_ORDERS_COLLECTION, selectedPO.id);
        await updateDoc(poRef, {
            status: 'Ordered',
            approvedBy: userPermissions.role,
            approvedAt: serverTimestamp(),
            lastModified: serverTimestamp()
        });

        showNotification(`PO ${selectedPO.poNumber} disetujui.`, "success");
        setViewMode('list');
        setSelectedPO(null);
    } catch (e: any) {
        showNotification(`Error: ${e.message}`, "error");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleRejectPO = async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!selectedPO || !selectedPO.id) return;
    if (!isManager) return;

    const reason = window.prompt("Alasan penolakan:", "");
    if (reason === null) return;
    if (!reason.trim()) { showNotification("Alasan wajib diisi.", "error"); return; }

    setIsProcessing(true);
    try {
        await updateDoc(doc(db, PURCHASE_ORDERS_COLLECTION, selectedPO.id), {
            status: 'Rejected',
            rejectionReason: reason,
            approvedBy: userPermissions.role,
            approvedAt: serverTimestamp()
        });
        showNotification(`PO ditolak.`, "success");
        setViewMode('list');
        setSelectedPO(null);
    } catch (e: any) {
        showNotification("Gagal menolak PO.", "error");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleCancelPO = async (po: PurchaseOrder) => {
    // Allow Manager OR Partman IF Pending/Draft
    const isPending = po.status === 'Pending Approval' || po.status === 'Draft';
    const canCancel = isManager || (isPartman && isPending);

    if (!canCancel) {
        showNotification("Hanya Manager yang bisa membatalkan PO yang sudah diproses.", "error");
        return;
    }

    if (!window.confirm(`Yakin ingin membatalkan/menghapus PO ${po.poNumber}?`)) return;

    setIsProcessing(true);
    try {
        await updateDoc(doc(db, PURCHASE_ORDERS_COLLECTION, po.id), {
            status: 'Cancelled',
            lastModified: serverTimestamp()
        });

        // Release job items order status
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

        showNotification(`PO ${po.poNumber} telah dibatalkan.`, "success");
        setViewMode('list');
        setSelectedPO(null);
    } catch (e: any) {
        console.error(e);
        showNotification("Gagal membatalkan PO.", "error");
    } finally {
        setIsProcessing(false);
    }
  };

  // Populate Form for Edit Mode
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
      // Set Mode to Manual (easiest for editing mixed items) or WO if all items have ref
      const hasRef = po.items.some(i => i.refJobId);
      setPoCreationMode(hasRef ? 'wo' : 'manual');
      setViewMode('create');
  };

  const handleProcessReceiving = async () => {
      if (!selectedPO) return;
      if (selectedItemsToReceive.length === 0) { 
          showNotification("Pilih setidaknya satu item yang akan diterima.", "error"); 
          return; 
      }
      
      for (const idx of selectedItemsToReceive) {
          const item = selectedPO.items[idx];
          const remaining = item.qty - (item.qtyReceived || 0);
          const inputQty = receiveQtyMap[idx] || 0;
          
          if (inputQty <= 0) {
              showNotification(`Qty untuk ${item.name} harus lebih dari 0.`, "error");
              return;
          }
          if (inputQty > remaining) {
              showNotification(`Qty untuk ${item.name} melebihi sisa pesanan (${remaining}).`, "error");
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
              const newSellPrice = Math.round(newBuyPrice * 1.3);

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

          Object.entries(jobUpdateMap).forEach(([jobId, data]) => {
              if (data.changed) {
                  batch.update(doc(db, SERVICE_JOBS_COLLECTION, jobId), {
                      'estimateData.partItems': data.parts,
                      updatedAt: serverTimestamp()
                  });
              }
          });

          const isFull = updatedItems.every(i => (i.qtyReceived || 0) >= i.qty);
          batch.update(doc(db, PURCHASE_ORDERS_COLLECTION, selectedPO.id), { 
              items: updatedItems, 
              status: isFull ? 'Received' : 'Partial',
              receivedAt: serverTimestamp(),
              receivedBy: userPermissions.role
          });

          await batch.commit();
          generateReceivingReportPDF(selectedPO, itemsReceivedForReport, settings, userPermissions.role);
          
          if (mismatchCount > 0) {
              showNotification(`Barang Diterima. Warning: ${mismatchCount} item mismatch harga.`, "info");
          } else {
              showNotification(`Penerimaan Berhasil. Stok Gudang Bertambah.`, "success");
          }
          
          setViewMode('list');
          setSelectedPO(null);

      } catch (e: any) {
          console.error("Receiving Error:", e);
          showNotification("Error saat penerimaan: " + e.message, "error");
      } finally {
          setIsProcessing(false);
      }
  };

  // ... (Other functions like handleSearchWO, handleSelectJobFromPicker, handleToggleWoPart, handleImportPartsToPO, handleAddItem, handleUpdateItem, handleRemoveItem remain same) ...
  const handleSearchWO = () => {
      if (!woSearchTerm) return;
      const termUpper = woSearchTerm.toUpperCase().replace(/\s/g, '');
      const matches = jobs.filter(j => !j.isClosed && !j.isDeleted && ((j.woNumber && j.woNumber.toUpperCase().replace(/\s/g, '').includes(termUpper)) || (j.policeNumber && j.policeNumber.toUpperCase().replace(/\s/g, '').includes(termUpper)) || (j.customerName && j.customerName.toUpperCase().includes(termUpper))));
      if (matches.length > 0) {
          matches.sort((a, b) => { const getTime = (val: any) => val?.seconds || 0; return getTime(b.createdAt) - getTime(a.createdAt); });
          setWoMatches(matches); setIsWoPickerOpen(true);
      } else { showNotification("No. Polisi atau WO aktif tidak ditemukan.", "error"); setWoMatches([]); setIsWoPickerOpen(false); setFoundJob(null); }
  };

  const handleSelectJobFromPicker = (job: Job) => {
      if (!job.estimateData?.partItems || job.estimateData.partItems.length === 0) { showNotification(`Pekerjaan ${job.policeNumber} tidak memiliki estimasi suku cadang.`, "error"); return; }
      setFoundJob(job); setIsWoPickerOpen(false);
      const initialSelection: any = {};
      job.estimateData.partItems.forEach((p, idx) => { if (!p.isOrdered) initialSelection[idx] = { selected: true, isIndent: p.isIndent || false }; });
      setSelectedPartsFromWo(initialSelection);
      showNotification(`Work Order ${job.woNumber || job.policeNumber} dipilih.`, "success");
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
                  code: partCodeUpper || estItem.number || 'NON-PART-NO', name: estItem.name || 'Tanpa Nama', brand: invItem?.brand || foundJob.carBrand || 'Genuine', category: 'sparepart', qty: estItem.qty || 1, qtyReceived: 0, unit: invItem?.unit || 'Pcs', price: invItem?.buyPrice || 0, total: (estItem.qty || 1) * (invItem?.buyPrice || 0), inventoryId: estItem.inventoryId || invItem?.id || null, refJobId: foundJob.id, refWoNumber: foundJob.woNumber, refPartIndex: idx, isIndent: selection.isIndent, isStockManaged: true
              });
          }
      });
      if (itemsToAdd.length === 0) { showNotification("Pilih minimal satu part.", "error"); return; }
      setPoForm((prev: any) => ({ ...prev, items: [...(prev.items || []), ...itemsToAdd] }));
      if (!poForm.notes) setPoForm((prev: any) => ({ ...prev, notes: `PO WO: ${foundJob.woNumber || foundJob.policeNumber}` }));
      showNotification(`${itemsToAdd.length} item masuk ke Draft PO.`, "success"); setFoundJob(null); setWoSearchTerm('');
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
          showNotification("Pilih supplier dan tambahkan item.", "error");
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
              // UPDATE EXISTING PO
              payload.poNumber = poForm.poNumber; // Keep existing number
              payload.lastModified = serverTimestamp();
              
              await updateDoc(doc(db, PURCHASE_ORDERS_COLLECTION, poForm.id), cleanObject(payload));
              showNotification(`PO ${poForm.poNumber} berhasil diperbarui.`, "success");
          } else {
              // CREATE NEW PO
              const poNumber = generateRandomId('PO');
              payload.poNumber = poNumber;
              payload.createdAt = serverTimestamp();
              
              await addDoc(collection(db, PURCHASE_ORDERS_COLLECTION), cleanObject(payload));
              showNotification(`PO ${poNumber} Berhasil Diterbitkan!`, "success");
          }

          // Update Job Link status regardless of create or update
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
          
          setViewMode('list');
          setPoForm({ id: null, poNumber: '', supplierId: '', items: [], notes: '', hasPpn: false, date: new Date().toISOString().split('T')[0] });
          setPoCreationMode('manual');
      } catch (e: any) {
          showNotification("Gagal menyimpan PO.", "error");
      } finally {
          setLoading(false);
      }
  };

  const getStatusBadge = (status: string) => {
      switch (status) {
          case 'Draft': return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold border">Draft</span>;
          case 'Pending Approval': return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold border">Pending Approval</span>;
          case 'Ordered': return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold border">Ordered</span>;
          case 'Partial': return <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold border">Partial</span>;
          case 'Received': return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold border">Received</span>;
          case 'Rejected': return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold border">Rejected</span>;
          case 'Cancelled': return <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs font-bold border">Cancelled</span>;
          default: return null;
      }
  };

  if (viewMode === 'create') {
      const { subtotal, ppnAmount, totalAmount } = calculateFinancials();
      const isEditing = !!poForm.id;

      return (
          <div className="animate-fade-in bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-4 mb-6 border-b pb-4">
                  <button onClick={() => { setViewMode('list'); setPoForm({id: null, poNumber: '', supplierId: '', items: [], hasPpn: false, date: new Date().toISOString().split('T')[0]}); }} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={20}/></button>
                  <h2 className="text-2xl font-bold text-gray-800">{isEditing ? `Edit PO ${poForm.poNumber}` : 'Buat Purchase Order Baru'}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div>
                      <label className="block text-sm font-bold mb-1">Supplier *</label>
                      <select className="w-full p-2 border rounded" value={poForm.supplierId} onChange={e => setPoForm({ ...poForm, supplierId: e.target.value })}>
                          <option value="">-- Pilih Supplier --</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                  </div>
                  <div>
                      <label className="block text-sm font-bold mb-1">Tanggal PO *</label>
                      <div className="relative">
                        <input type="date" className="w-full p-2 border rounded pl-10 font-bold" value={poForm.date} onChange={e => setPoForm({...poForm, date: e.target.value})} />
                        <Calendar className="absolute left-3 top-2.5 text-indigo-500" size={18}/>
                      </div>
                  </div>
                  <div>
                      <label className="block text-sm font-bold mb-1">Metode Input</label>
                      <div className="flex bg-gray-100 p-1 rounded-lg">
                          <button onClick={() => setPoCreationMode('manual')} className={`flex-1 py-2 rounded-md text-sm font-bold ${poCreationMode === 'manual' ? 'bg-white text-indigo-600 shadow' : 'text-gray-500'}`}><Layers size={16} className="inline mr-1"/> General</button>
                          <button onClick={() => setPoCreationMode('wo')} className={`flex-1 py-2 rounded-md text-sm font-bold ${poCreationMode === 'wo' ? 'bg-white text-indigo-600 shadow' : 'text-gray-500'}`}><Car size={16} className="inline mr-1"/> Dari WO</button>
                      </div>
                  </div>
              </div>

              {poCreationMode === 'wo' && (
                  <div className="mb-8 bg-blue-50 border border-blue-200 p-4 rounded-xl relative">
                      <h3 className="font-bold text-blue-800 mb-3 flex items-center gap-2"><Search size={18}/> Cari Kebutuhan Part dari Estimasi SA</h3>
                      <div className="flex gap-2 mb-4 relative">
                          <div className="relative flex-grow">
                              <input 
                                  type="text" 
                                  placeholder="No. Polisi, WO, atau Nama..." 
                                  className="w-full p-2 border border-blue-300 rounded uppercase font-mono font-bold" 
                                  value={woSearchTerm} 
                                  onChange={e => {
                                      setWoSearchTerm(e.target.value);
                                      if (!e.target.value) setIsWoPickerOpen(false);
                                  }} 
                                  onKeyDown={e => e.key === 'Enter' && handleSearchWO()}
                              />
                              
                              {isWoPickerOpen && (
                                  <div ref={pickerRef} className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-indigo-100 z-[100] max-h-72 overflow-y-auto animate-pop-in backdrop-blur-md bg-white/98">
                                      <div className="p-2 bg-indigo-50 border-b border-indigo-100 sticky top-0 z-10 flex justify-between items-center">
                                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-2">Pilih Work Order Aktif</span>
                                          <button onClick={() => setIsWoPickerOpen(false)} className="p-1 hover:bg-white rounded-full text-indigo-400"><X size={14}/></button>
                                      </div>
                                      {woMatches.map(job => (
                                          <div 
                                              key={job.id} 
                                              onClick={() => handleSelectJobFromPicker(job)}
                                              className="p-4 hover:bg-indigo-50 cursor-pointer border-b last:border-0 group flex justify-between items-center transition-colors"
                                          >
                                              <div>
                                                  <div className="flex items-center gap-2">
                                                      <span className="font-black text-indigo-900 text-lg">{job.policeNumber}</span>
                                                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-black">{job.woNumber || 'ESTIMASI'}</span>
                                                  </div>
                                                  <div className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-tight">{job.customerName} | {job.carModel}</div>
                                              </div>
                                              <div className="text-right flex flex-col items-end gap-1">
                                                  <span className="text-[9px] font-bold text-gray-400 uppercase flex items-center gap-1"><Clock size={10}/> {formatDateIndo(job.createdAt)}</span>
                                                  <ChevronRight size={18} className="text-gray-300 group-hover:text-indigo-600 transition-colors"/>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                          <button onClick={handleSearchWO} disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700 flex items-center gap-2">
                              {loading ? <Loader2 size={16} className="animate-spin"/> : <Search size={16}/>}
                              Cari Data
                          </button>
                      </div>

                      {foundJob && (
                          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm animate-fade-in">
                              <div className="p-3 bg-gray-100 flex justify-between items-center border-b">
                                  <div className="flex items-center gap-4">
                                      <div className="flex items-center gap-2 font-bold text-gray-800">
                                          <Hash size={16} className="text-indigo-600"/>
                                          <span>{foundJob.woNumber || 'ESTIMASI'}</span> 
                                          <span className="text-gray-300 mx-1">|</span>
                                          <span>{foundJob.policeNumber}</span>
                                      </div>
                                      <span className="text-xs font-bold text-gray-500 uppercase tracking-tighter">{foundJob.customerName}</span>
                                  </div>
                                  <div className="flex gap-2">
                                      <button onClick={() => setFoundJob(null)} className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-2 rounded">BATAL</button>
                                      <button onClick={handleImportPartsToPO} className="bg-green-600 text-white px-4 py-2 rounded text-xs font-bold hover:bg-green-700 flex items-center gap-1 shadow-sm transition-transform active:scale-95"><Plus size={14}/> TAMBAH KE PO</button>
                                  </div>
                              </div>
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-gray-50"><tr><th className="p-3 w-10 text-center">Pilih</th><th className="p-3">Item Part SA</th><th className="p-3 w-20 text-center">Qty</th><th className="p-3 text-center">Set Indent?</th></tr></thead>
                                  <tbody className="divide-y">
                                      {foundJob.estimateData?.partItems?.map((part, idx) => (
                                          <tr key={idx} className={part.isOrdered ? 'bg-gray-50 opacity-60' : 'hover:bg-blue-50/50'}>
                                              <td className="p-3 text-center">{!part.isOrdered && <input type="checkbox" checked={selectedPartsFromWo[idx]?.selected || false} onChange={() => handleToggleWoPart(idx, 'selected')} className="w-4 h-4 cursor-pointer text-indigo-600 rounded"/>}</td>
                                              <td className="p-3"><div className="font-bold text-gray-800">{part.name}</div><div className="text-[10px] text-indigo-600 font-mono font-bold">{part.number || 'TANPA NO PART'}</div></td>
                                              <td className="p-3 text-center font-bold text-gray-700">{part.qty || 1}</td>
                                              <td className="p-3 text-center">{!part.isOrdered && selectedPartsFromWo[idx]?.selected && <label className="inline-flex items-center gap-1 cursor-pointer text-[10px] bg-white px-2 py-1 rounded border border-red-200 shadow-sm"><input type="checkbox" checked={selectedPartsFromWo[idx]?.isIndent || false} onChange={() => handleToggleWoPart(idx, 'isIndent')} className="text-red-600 rounded"/><span className={selectedPartsFromWo[idx]?.isIndent ? 'text-red-600 font-black' : 'text-gray-400 font-bold'}>INDENT</span></label>}</td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      )}
                  </div>
              )}

              <div className="mb-6">
                  <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2"><ShoppingCart size={18}/> Item Pesanan {isEditing ? '(Mode Edit)' : '(Draft)'}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border border-gray-200 rounded overflow-hidden">
                        <thead className="bg-gray-100 font-bold">
                            <tr>
                                <th className="p-3 border">Kategori</th>
                                <th className="p-3 border">Kode Part</th>
                                <th className="p-3 border">Nama Barang</th>
                                <th className="p-3 border">Merk / Model</th>
                                <th className="p-3 border w-20 text-center">Qty</th>
                                <th className="p-3 border w-24">Satuan</th>
                                <th className="p-3 border text-right">Harga</th>
                                <th className="p-3 border text-right">Total</th>
                                <th className="p-3 border w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {(poForm.items || []).map((item: any, idx: number) => (
                                <tr key={idx} className={item.refJobId ? "bg-blue-50/50" : ""}>
                                    <td className="p-2 border">
                                        <select className="w-full p-2 border rounded text-xs" value={item.category} onChange={e => handleUpdateItem(idx, 'category', e.target.value)}>
                                            <option value="sparepart">Part</option>
                                            <option value="material">Bahan</option>
                                        </select>
                                        {item.category === 'material' && (
                                            <div className="mt-1 flex items-center gap-1">
                                                <input 
                                                    type="checkbox" 
                                                    id={`stockManaged-${idx}`}
                                                    checked={item.isStockManaged === false} 
                                                    onChange={e => handleUpdateItem(idx, 'isStockManaged', !e.target.checked)}
                                                    className="w-3 h-3 text-orange-600 rounded focus:ring-orange-500 cursor-pointer"
                                                />
                                                <label htmlFor={`stockManaged-${idx}`} className="text-[10px] text-orange-700 font-bold cursor-pointer whitespace-nowrap">
                                                    Ready Use (Vendor)
                                                </label>
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-2 border"><input type="text" className="w-full p-2 border rounded font-mono uppercase text-xs" value={item.code} onChange={e => handleUpdateItem(idx, 'code', e.target.value)} placeholder="Kode..." disabled={!!item.refJobId}/></td>
                                    <td className="p-2 border">
                                        <input type="text" className="w-full p-2 border rounded text-xs" value={item.name} onChange={e => handleUpdateItem(idx, 'name', e.target.value)} placeholder="Nama..." disabled={!!item.refJobId}/>
                                        {item.refWoNumber && <div className="text-[9px] text-blue-600 font-bold">Ref: {item.refWoNumber} {item.isIndent && <span className="text-red-600">[INDENT]</span>}</div>}
                                    </td>
                                    <td className="p-2 border"><input type="text" className="w-full p-2 border rounded text-xs" value={item.brand} onChange={e => handleUpdateItem(idx, 'brand', e.target.value)} placeholder="Merk/Tipe..."/></td>
                                    <td className="p-2 border"><input type="number" className="w-full p-2 border rounded text-center font-bold" value={item.qty} onChange={e => handleUpdateItem(idx, 'qty', Number(e.target.value))} /></td>
                                    <td className="p-2 border">
                                        <select className="w-full p-2 border rounded text-xs" value={item.unit} onChange={e => handleUpdateItem(idx, 'unit', e.target.value)}>
                                            {UNIT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </td>
                                    <td className="p-2 border"><input type="number" className="w-full p-2 border rounded text-right font-mono" value={item.price} onChange={e => handleUpdateItem(idx, 'price', Number(e.target.value))} /></td>
                                    <td className="p-2 border text-right font-bold">{formatCurrency(item.total)}</td>
                                    <td className="p-2 border text-center"><button onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>
                  {poCreationMode === 'manual' && <button onClick={handleAddItem} className="mt-2 text-xs text-indigo-600 font-bold hover:underline">+ Tambah Manual</button>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t bg-gray-50 p-6 rounded-xl">
                  <div><label className="block text-sm font-bold mb-1">Catatan</label><textarea className="w-full p-3 border rounded text-sm" rows={2} value={poForm.notes} onChange={e => setPoForm({ ...poForm, notes: e.target.value })}/></div>
                  <div className="flex flex-col items-end">
                      <div className="w-full max-w-xs space-y-1">
                          <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-bold">{formatCurrency(subtotal)}</span></div>
                          <div className="flex justify-between items-center text-sm">
                              <label className="flex items-center gap-2 cursor-pointer">
                                  <div onClick={() => setPoForm((prev: any) => ({...prev, hasPpn: !prev.hasPpn}))} className={`w-4 h-4 rounded border flex items-center justify-center ${poForm.hasPpn ? 'bg-indigo-600' : 'bg-white'}`}>{poForm.hasPpn && <CheckSquare size={12} className="text-white"/>}</div>
                                  <span>PPN {settings.ppnPercentage}%</span>
                              </label>
                              <span>{formatCurrency(ppnAmount)}</span>
                          </div>
                          <div className="flex justify-between text-xl font-black text-indigo-900 border-t pt-2"><span>Total</span><span>{formatCurrency(totalAmount)}</span></div>
                      </div>
                      <div className="flex gap-3 mt-6 justify-end w-full">
                        <button onClick={() => handleSubmitPO('Draft')} disabled={loading} className="px-6 py-2 border rounded font-bold text-gray-600 hover:bg-gray-100">Simpan Draft</button>
                        <button onClick={() => handleSubmitPO('Pending Approval')} disabled={loading} className="px-8 py-2 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700 shadow-lg">{isEditing ? 'Simpan Perubahan' : 'Ajukan Approval'}</button>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  if (viewMode === 'detail' && selectedPO) {
      // ... (Existing detail view logic - no changes needed as it uses stored totals) ...
      const isReceivable = selectedPO.status === 'Ordered' || selectedPO.status === 'Partial';
      const showApprovalActions = selectedPO.status === 'Pending Approval' && isManager;

      return (
          <div className="animate-fade-in bg-white p-6 rounded-xl border shadow-sm">
              <div className="flex justify-between items-start mb-6 border-b pb-4">
                  <div className="flex items-center gap-4">
                      <button onClick={() => { setViewMode('list'); setSelectedPO(null); }} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={20}/></button>
                      <div>
                          <h2 className="text-2xl font-bold text-gray-800">{selectedPO.poNumber}</h2>
                          <div className="flex items-center gap-2 text-sm mt-1">{getStatusBadge(selectedPO.status)}<span className="text-gray-500">Supplier: <strong>{selectedPO.supplierName}</strong></span></div>
                      </div>
                  </div>
                  <div className="flex gap-2">
                      {isManager && selectedPO.status !== 'Cancelled' && selectedPO.status !== 'Received' && (
                          <button 
                              onClick={() => handleCancelPO(selectedPO)} 
                              disabled={isProcessing} 
                              className="px-4 py-2 bg-red-100 text-red-700 rounded border border-red-200 font-bold hover:bg-red-200 transition-all flex items-center gap-1 disabled:opacity-50"
                          >
                              <XCircle size={18}/> Batalkan PO
                          </button>
                      )}
                      {showApprovalActions && (
                          <>
                            <button 
                                type="button" 
                                onClick={(e) => handleRejectPO(e)} 
                                disabled={isProcessing} 
                                className="px-4 py-2 bg-red-100 text-red-700 rounded border border-red-200 font-bold hover:bg-red-200 transition-all flex items-center gap-1 disabled:opacity-50"
                            >
                                <Ban size={18}/> Tolak
                            </button>
                            <button 
                                type="button" 
                                onClick={(e) => handleApprovePO(e)} 
                                disabled={isProcessing} 
                                className="px-4 py-2 bg-green-600 text-white rounded shadow font-bold hover:bg-green-700 transition-all flex items-center gap-1 disabled:opacity-50"
                            >
                                {isProcessing ? <Loader2 size={18} className="animate-spin"/> : <Check size={18}/>}
                                Setujui (Approve)
                            </button>
                          </>
                      )}
                      {isReceivable && selectedItemsToReceive.length > 0 && (
                        <button onClick={handleProcessReceiving} disabled={isProcessing} className="px-4 py-2 bg-indigo-600 text-white rounded shadow font-bold animate-pulse hover:bg-indigo-700">Simpan Terima ({selectedItemsToReceive.length})</button>
                      )}
                      <button onClick={() => handlePrintPO(selectedPO)} className="px-4 py-2 border rounded flex items-center gap-2 font-bold border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"><Printer size={18}/> Print PO</button>
                  </div>
              </div>

              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border">
                      <thead className="bg-gray-100 font-bold">
                          <tr>{isReceivable && <th className="p-3 border w-10"></th>}<th className="p-3 border">Item Barang</th><th className="p-3 border text-center">Order</th><th className="p-3 border text-center bg-green-50">Diterima</th>{isReceivable && <th className="p-3 border text-center bg-blue-50 w-24">Datang</th>}<th className="p-3 border text-right">Harga</th><th className="p-3 border text-right">Total</th></tr>
                      </thead>
                      <tbody>
                          {(selectedPO.items || []).map((item, idx) => {
                              const rem = item.qty - (item.qtyReceived || 0);
                              return (
                                  <tr key={idx} className={rem <= 0 ? 'opacity-50 bg-gray-50' : ''}>
                                      {isReceivable && <td className="p-3 border text-center">{rem > 0 && <input type="checkbox" checked={selectedItemsToReceive.includes(idx)} onChange={() => toggleItemSelection(idx)} className="w-4 h-4"/>}</td>}
                                      <td className="p-3 border">
                                          <div><strong>{item.name}</strong></div>
                                          <div className="text-[10px] font-mono text-gray-500">
                                              {item.code} {item.brand && `| ${item.brand}`} {item.refWoNumber && `[WO: ${item.refWoNumber}]`} 
                                              <span className="ml-2 px-1 bg-gray-200 rounded text-[9px] uppercase">{item.category}</span>
                                          </div>
                                      </td>
                                      <td className="p-3 border text-center">{item.qty} {item.unit}</td>
                                      <td className="p-3 border text-center bg-green-50 font-bold">{item.qtyReceived || 0}</td>
                                      {isReceivable && <td className="p-3 border text-center bg-blue-50">{rem > 0 && selectedItemsToReceive.includes(idx) ? <input type="number" max={rem} className="w-full p-1 border rounded text-center font-bold" value={receiveQtyMap[idx] || ''} onChange={e => setReceiveQtyMap({...receiveQtyMap, [idx]: Number(e.target.value)})}/> : '-'}</td>}
                                      <td className="p-3 border text-right font-mono">{formatCurrency(item.price)}</td>
                                      <td className="p-3 border text-right font-bold">{formatCurrency(item.total)}</td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>
          </div>
      );
  }

  // ... (Return JSX same)
  return (
    <div className="animate-fade-in space-y-6">
        <div className="flex justify-between items-center">
            <div><h1 className="text-3xl font-bold text-gray-900">Purchase Order (PO)</h1><p className="text-gray-500">Kelola pengadaan barang bengkel (Real-time).</p></div>
            <button onClick={() => setViewMode('create')} className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 shadow-lg flex items-center gap-2 font-bold"><Plus size={18}/> Buat PO Baru</button>
        </div>
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
                <div className="relative w-full max-w-md"><Search className="absolute left-3 top-2.5 text-gray-400" size={18}/><input type="text" placeholder="Cari No. PO atau Supplier..." className="w-full pl-10 p-2.5 border rounded-lg" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
            </div>
            {realTimePOs.length === 0 ? <div className="p-20 text-center text-gray-500 font-bold">Belum ada PO dibuat.</div> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 font-bold"><tr><th className="px-6 py-4 text-xs uppercase text-gray-500">No. PO</th><th className="px-6 py-4 text-xs uppercase text-gray-500">Supplier</th><th className="px-6 py-4 text-xs uppercase text-gray-500">Status</th><th className="px-6 py-4 text-xs uppercase text-gray-500 text-right">Total</th><th className="px-6 py-4 text-xs uppercase text-gray-500 text-center">Aksi</th></tr></thead>
                        <tbody className="divide-y">
                            {realTimePOs.filter(o => o.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) || o.supplierName.toLowerCase().includes(searchTerm.toLowerCase())).map(order => {
                                // Enable edit/cancel for Partman IF status is Pending or Draft
                                const isPendingOrDraft = order.status === 'Pending Approval' || order.status === 'Draft';
                                const canModify = isManager || (isPartman && isPendingOrDraft);

                                return (
                                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 font-mono font-bold text-indigo-700">{order.poNumber}</td>
                                    <td className="px-6 py-4 font-bold text-gray-800">{order.supplierName}</td>
                                    <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                                    <td className="px-6 py-4 text-right font-black text-indigo-900">{formatCurrency(order.totalAmount)}</td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => { setSelectedPO(order); setViewMode('detail'); }} className="text-indigo-500 hover:text-indigo-700 bg-indigo-50 p-2 rounded-full transition-colors" title="Lihat Detail"><Eye size={18}/></button>
                                            
                                            {canModify && (
                                                <button 
                                                    onClick={() => handleEditPO(order)} 
                                                    className="text-orange-500 hover:text-orange-700 bg-orange-50 p-2 rounded-full transition-colors"
                                                    title="Edit PO"
                                                >
                                                    <Edit size={18}/>
                                                </button>
                                            )}

                                            {['Ordered', 'Partial', 'Received'].includes(order.status) && <button onClick={() => handlePrintPO(order)} className="text-emerald-500 hover:text-emerald-700 bg-emerald-50 p-2 rounded-full transition-colors" title="Print PO"><Printer size={18}/></button>}
                                            
                                            {canModify && order.status !== 'Received' && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleCancelPO(order); }} 
                                                    className="text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-full transition-colors"
                                                    title="Batalkan PO"
                                                >
                                                    <X size={18}/>
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
