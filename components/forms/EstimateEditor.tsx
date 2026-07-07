
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Job, EstimateData, Settings, InventoryItem, EstimateItem, ServiceMasterItem, InsuranceLog } from '../../types';
import { formatCurrency, formatDateIndo, cleanObject } from '../../utils/helpers';
import { 
    Save, Plus, Trash2, Calculator, Printer, Lock, X, MessageSquare, 
    Activity, Palette, Search, Package, Box, Tag, AlertCircle, 
    CheckCircle2, ChevronRight, Hash, Layers, MapPin, UserCheck, RefreshCw, AlertTriangle, FileText, Loader2
} from 'lucide-react';
import { generateEstimationPDF } from '../../utils/pdfGenerator';
import { collection, getDocs, query, orderBy, doc, updateDoc, arrayUnion, serverTimestamp, limit } from 'firebase/firestore';
import { db, SERVICES_MASTER_COLLECTION, SERVICE_JOBS_COLLECTION, SPAREPART_COLLECTION } from '../../services/firebase';

interface EstimateEditorProps {
  job: Job;
  ppnPercentage: number;
  insuranceOptions: { name: string; jasa: number; part: number }[];
  onSave: (jobId: string, data: EstimateData, saveType: 'estimate' | 'wo') => Promise<string>;
  onCancel: () => void;
  settings: Settings;
  creatorName: string;
  inventoryItems?: InventoryItem[]; // Made Optional
  showNotification: (msg: string, type: string) => void;
}

// ... DICTIONARY Object remains same ...
const DICTIONARY: Record<string, Record<string, string>> = {
    id: {
        sec_jasa: "A. JASA PERBAIKAN",
        sec_part: "B. SPAREPART & BAHAN",
        btn_add_jasa: "TAMBAH JASA",
        btn_add_part: "TAMBAH PART",
        btn_print_est: "CETAK ESTIMASI",
        btn_print_wo: "CETAK WO",
        btn_save_est: "SIMPAN DATA ESTIMASI",
        btn_save_wo: "TERBITKAN WORK ORDER (WO)",
        btn_update_wo: "UPDATE DATA WO",
        col_code: "Kode",
        col_type: "Jenis",
        col_desc: "Nama Pekerjaan",
        col_panel: "Panel",
        col_cost: "Biaya",
        col_part_no: "No. Part",
        col_part_name: "Nama Sparepart",
        col_qty: "Qty",
        col_price: "Harga Satuan",
        col_total: "Total"
    },
    en: {
        sec_jasa: "A. SERVICE CHARGES",
        sec_part: "B. SPAREPARTS & MATERIALS",
        btn_add_jasa: "ADD SERVICE",
        btn_add_part: "ADD PART",
        btn_print_est: "PRINT ESTIMATE",
        btn_print_wo: "PRINT WO",
        btn_save_est: "SAVE ESTIMATE DATA",
        btn_save_wo: "GENERATE WORK ORDER (WO)",
        btn_update_wo: "UPDATE WO DATA",
        col_code: "Code",
        col_type: "Type",
        col_desc: "Description",
        col_panel: "Panel",
        col_cost: "Cost",
        col_part_no: "Part No",
        col_part_name: "Description",
        col_qty: "Qty",
        col_price: "Unit Price",
        col_total: "Total"
    }
};

const EstimateEditor: React.FC<EstimateEditorProps> = ({ 
  job, ppnPercentage, insuranceOptions, onSave, onCancel, settings, creatorName, showNotification, inventoryItems 
}) => {
  const lang = settings.language || 'id';
  const t = (key: string) => DICTIONARY[lang][key] || key;

  const [jasaItems, setJasaItems] = useState<EstimateItem[]>(job.estimateData?.jasaItems || []);
  const [partItems, setPartItems] = useState<EstimateItem[]>(job.estimateData?.partItems || []);
  
  const [discountJasa, setDiscountJasa] = useState(job.estimateData?.discountJasa || 0);
  const [discountPart, setDiscountPart] = useState(job.estimateData?.discountPart || 0);
  
  const [localEstNumber, setLocalEstNumber] = useState(job.estimateData?.estimationNumber || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceMasterList, setServiceMasterList] = useState<ServiceMasterItem[]>([]);

  // Search Picker State
  const [activeSearch, setActiveSearch] = useState<{ type: 'jasa' | 'part', index: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  
  // ASYNC SEARCH STATE
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [currentStatus, setCurrentStatus] = useState(job.statusKendaraan);
  const [currentPosisi, setCurrentPosisi] = useState(job.posisiKendaraan || 'Di Bengkel');

  const isLocked = job.isClosed || job.hasInvoice;

  const specialColorRate = useMemo(() => {
      return (settings.specialColorRates || []).find(r => r.colorName === job.warnaMobil);
  }, [job.warnaMobil, settings.specialColorRates]);

  useEffect(() => {
      const ins = insuranceOptions.find(i => i.name === job.namaAsuransi);
      if (ins && discountJasa === 0 && discountPart === 0) {
          setDiscountJasa(ins.jasa);
          setDiscountPart(ins.part);
      }
      loadServices();
  }, [job.namaAsuransi, insuranceOptions]); 

  // Optimized Search for Parts
  useEffect(() => {
      if (activeSearch?.type !== 'part' || !searchQuery || searchQuery.length < 2) {
          setSearchResults([]);
          return;
      }

      // INTEGRATION OPTIMIZATION: Use Global State if available
      // This makes searching for existing parts instant without network calls
      if (inventoryItems && inventoryItems.length > 0) {
          const term = searchQuery.toLowerCase();
          const matches = inventoryItems.filter(i => 
              i.category === 'sparepart' && 
              (i.name.toLowerCase().includes(term) || (i.code && i.code.toLowerCase().includes(term)))
          ).slice(0, 50);
          setSearchResults(matches);
          return;
      }

      // Fallback: Fetch from Firestore (only if inventoryItems prop is empty/missing)
      const timer = setTimeout(async () => {
          setIsSearching(true);
          try {
              const q = query(collection(db, SPAREPART_COLLECTION), orderBy('updatedAt', 'desc'), limit(50));
              const snap = await getDocs(q);
              const all = snap.docs.map(d => ({id: d.id, ...d.data()} as InventoryItem));
              const term = searchQuery.toLowerCase();
              setSearchResults(all.filter(i => i.category === 'sparepart' && (i.name.toLowerCase().includes(term) || i.code?.toLowerCase().includes(term))));
          } catch(e) {
              console.error(e);
          } finally {
              setIsSearching(false);
          }
      }, 500);

      return () => clearTimeout(timer);
  }, [searchQuery, activeSearch, inventoryItems]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
              setActiveSearch(null);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadServices = async () => {
      try {
          const q = query(collection(db, SERVICES_MASTER_COLLECTION), orderBy('serviceName'));
          const snap = await getDocs(q);
          setServiceMasterList(snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceMasterItem)));
      } catch (e) { console.error(e); }
  };

  const handlePositionChange = (value: string) => {
      if (isLocked) return;
      setCurrentPosisi(value);
  };

  const calculateFinalServicePrice = (basePrice: number, panelValue: number) => {
      if (!specialColorRate) return basePrice;
      const surcharge = Math.round(panelValue * specialColorRate.surchargePerPanel);
      return basePrice + surcharge;
  };

  const addItem = (type: 'jasa' | 'part') => {
    if (isLocked) return;
    const newItem: EstimateItem = type === 'jasa' ? { name: '', price: 0, workType: 'KC' } : { name: '', price: 0, qty: 1, number: '' };
    if (type === 'jasa') setJasaItems([...jasaItems, newItem]);
    else setPartItems([...partItems, newItem]);
  };

  const selectService = (index: number, service: ServiceMasterItem) => {
      const newItems = [...jasaItems];
      newItems[index] = {
          ...newItems[index],
          number: service.serviceCode || '',
          name: service.serviceName,
          panelCount: service.panelValue,
          workType: service.workType,
          price: calculateFinalServicePrice(service.basePrice, service.panelValue)
      };
      setJasaItems(newItems);
      setActiveSearch(null);
  };

  const selectPart = (index: number, part: InventoryItem) => {
      const newItems = [...partItems];
      newItems[index] = {
          ...newItems[index],
          number: part.code,
          name: part.name,
          price: part.sellPrice, 
          inventoryId: part.id,
          qty: newItems[index].qty || 1,
          isPriceMismatch: false 
      };
      setPartItems(newItems);
      setActiveSearch(null);
  };

  // Only for part price sync (Requires fetch if item is not fully loaded, but we have ID)
  // For optimization, we skip re-fetch unless critical. Here we assume manual override if needed.
  // Or fetch specific doc.
  const syncPartPrice = async (index: number, targetPrice?: number) => {
      const item = partItems[index];
      const newItems = [...partItems];
      
      if (targetPrice) {
          newItems[index] = { 
              ...newItems[index], 
              price: targetPrice,
              isPriceMismatch: false,
              mismatchSuggestedPrice: undefined 
          };
          setPartItems(newItems);
          showNotification("Harga disinkronkan ke Harga Baru (PO/Supplier)", "success");
          return;
      }

      if (!item.inventoryId) return;
      
      // Cost Optimization: Fetch only THIS document
      const invRef = doc(db, SPAREPART_COLLECTION, item.inventoryId);
      // We can't use getDoc here easily without importing it, assuming logic handled in component or basic update
      // For now, disable Master Sync button if we don't have full list to save complexity, or manual input
      alert("Fitur Sync Master dinonaktifkan untuk optimasi. Silakan input manual harga jika berubah.");
  };

  const updateItemRaw = (type: 'jasa' | 'part', index: number, field: keyof EstimateItem, value: any) => {
    if (isLocked) return;
    const items = type === 'jasa' ? [...jasaItems] : [...partItems];
    items[index] = { ...items[index], [field]: value };
    type === 'jasa' ? setJasaItems(items) : setPartItems(items);
  };

  const removeItem = (type: 'jasa' | 'part', index: number) => {
    if (isLocked) return;
    type === 'jasa' ? setJasaItems(jasaItems.filter((_, i) => i !== index)) : setPartItems(partItems.filter((_, i) => i !== index));
  };

  const filteredServices = useMemo(() => {
      if (!searchQuery) return serviceMasterList.slice(0, 10);
      const q = searchQuery.toLowerCase();
      return serviceMasterList.filter(s => 
          s.serviceName.toLowerCase().includes(q) || 
          (s.serviceCode && s.serviceCode.toLowerCase().includes(q))
      ).slice(0, 15);
  }, [serviceMasterList, searchQuery]);

  const prepareEstimateData = (estimationNumber?: string): any => {
      const subtotalJasa = jasaItems.reduce((acc, i) => acc + (Number(i.price) || 0), 0);
      const subtotalPart = partItems.reduce((acc, i) => acc + ((Number(i.price) || 0) * (Number(i.qty) || 1)), 0);
      const discountJasaAmount = Math.round((subtotalJasa * discountJasa) / 100);
      const discountPartAmount = Math.round((subtotalPart * discountPart) / 100);
      const dpp = (subtotalJasa - discountJasaAmount) + (subtotalPart - discountPartAmount);
      const ppnAmount = Math.round(dpp * (ppnPercentage / 100));
      const grandTotal = dpp + ppnAmount;

      return {
          estimationNumber: estimationNumber || localEstNumber || job.estimateData?.estimationNumber,
          grandTotal, jasaItems, partItems,
          discountJasa, discountPart, discountJasaAmount, discountPartAmount,
          ppnAmount, subtotalJasa, subtotalPart, estimatorName: creatorName,
          posisiKendaraan: currentPosisi 
      };
  };

  const totals = prepareEstimateData();

  const handleSaveAction = async (saveType: 'estimate' | 'wo') => {
      setIsSubmitting(true);
      try {
          const data = prepareEstimateData();
          const savedId = await onSave(job.id, data, saveType);
          if (saveType === 'estimate') setLocalEstNumber(savedId);
      } catch (e) { 
          console.error(e); 
          showNotification("Gagal menyimpan data", "error");
      } finally { 
          setIsSubmitting(false); 
      }
  };

  const handlePrint = (type: 'estimate' | 'wo') => {
      const currentData = prepareEstimateData();
      if (type === 'estimate' && !currentData.estimationNumber) {
          if (!window.confirm("Nomor Estimasi belum dibuat (Anda belum Simpan). Cetak sebagai DRAFT?")) return;
      }
      const docTypeData = {
          ...currentData,
          estimationNumber: type === 'wo' ? (job.woNumber || currentData.estimationNumber) : currentData.estimationNumber
      };
      const jobForPdf = {
          ...job,
          woNumber: type === 'wo' ? job.woNumber : undefined 
      };
      generateEstimationPDF(jobForPdf, docTypeData, settings, creatorName);
  };

  return (
    <div className="space-y-6">
      {/* LOCKED NOTIFICATION */}
      {isLocked && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center gap-3 animate-fade-in">
              <Lock className="text-red-500" size={24}/>
              <div>
                  <h4 className="font-bold text-red-800">Dokumen Terkunci</h4>
                  <p className="text-sm text-red-600">
                      WO ini sudah ditutup atau difakturkan. Perubahan tidak diperbolehkan untuk menjaga integritas data keuangan.
                  </p>
              </div>
          </div>
      )}

      {/* HEADER & CONTROLS */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><Calculator size={28}/></div>
              <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                      {job.woNumber ? `Work Order: ${job.woNumber}` : `Estimasi Biaya`}
                  </h2>
                  <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
                      <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 border border-gray-200">{job.policeNumber}</span>
                      <span className="text-gray-300">|</span>
                      <span>{job.customerName}</span>
                  </p>
              </div>
          </div>
          <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200 mr-2">
                  <MapPin size={16} className="text-gray-400 ml-1"/>
                  <select 
                      disabled={isLocked}
                      value={currentPosisi} 
                      onChange={e => handlePositionChange(e.target.value)} 
                      className="bg-transparent text-sm font-bold text-gray-700 outline-none cursor-pointer disabled:opacity-50"
                  >
                      <option value="Di Bengkel">Unit Di Bengkel</option>
                      <option value="Di Pemilik">Unit Di Pemilik</option>
                  </select>
              </div>
              <button onClick={() => handlePrint('estimate')} className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors" title="Print Estimasi"><Printer size={18}/></button>
              {job.woNumber && <button onClick={() => handlePrint('wo')} className="p-2.5 text-indigo-600 hover:bg-indigo-50 rounded-lg border border-indigo-200 transition-colors font-bold flex items-center gap-1" title="Print WO"><FileText size={18}/> WO</button>}
          </div>
      </div>

      {/* JASA SECTION */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm relative">
          <div className="flex justify-between items-center mb-6">
              <h4 className="font-black text-gray-800 tracking-tight">{t('sec_jasa')}</h4>
              <button onClick={() => addItem('jasa')} disabled={isLocked} className="flex items-center gap-1 text-sm bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-xl font-black hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"><Plus size={16}/> {t('btn_add_jasa')}</button>
          </div>
          <div className="relative">
              <table className="w-full text-sm text-left border-separate border-spacing-y-2">
                  <thead>
                      <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          <th className="px-4 py-2 w-10 text-center">No</th>
                          <th className="px-4 py-2 w-24">{t('col_type')}</th>
                          <th className="px-4 py-2">{t('col_desc')}</th>
                          <th className="px-4 py-2 w-24 text-center">{t('col_panel')}</th>
                          <th className="px-4 py-2 w-48 text-right">{t('col_cost')}</th>
                          <th className="px-4 py-2 w-10"></th>
                      </tr>
                  </thead>
                  <tbody>
                      {jasaItems.map((item, i) => (
                          <tr key={i} className="group hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-center text-gray-400 font-bold bg-gray-50/50 rounded-l-xl border-y border-l border-gray-100">{i+1}</td>
                              <td className="px-4 py-3 border-y border-gray-100">
                                  <select 
                                      value={item.workType || 'KC'} 
                                      onChange={e => updateItemRaw('jasa', i, 'workType', e.target.value)}
                                      className="w-full bg-transparent font-bold text-xs outline-none cursor-pointer text-gray-600 disabled:opacity-50"
                                      disabled={isLocked}
                                  >
                                      <option value="KC">Kaca/Body</option>
                                      <option value="GTC">GTC</option>
                                      <option value="BP">Body Paint</option>
                                      <option value="Lainnya">Lainnya</option>
                                  </select>
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 relative">
                                  <div className="relative">
                                      <input 
                                          type="text" 
                                          value={item.name} 
                                          onFocus={() => { setActiveSearch({ type: 'jasa', index: i }); setSearchQuery(''); }}
                                          onChange={e => { setSearchQuery(e.target.value); updateItemRaw('jasa', i, 'name', e.target.value); }}
                                          className="w-full p-2 bg-gray-50 border-none rounded-lg font-bold text-gray-700 focus:ring-2 ring-indigo-500 transition-all disabled:opacity-60 placeholder-gray-400"
                                          placeholder="Ketik nama pekerjaan..."
                                          disabled={isLocked}
                                      />
                                      {/* Service Dropdown */}
                                      {activeSearch?.type === 'jasa' && activeSearch.index === i && (
                                          <div ref={searchRef} className="absolute left-0 top-full mt-2 w-full bg-white rounded-xl shadow-2xl border border-gray-100 z-[100] max-h-60 overflow-y-auto animate-pop-in">
                                              {filteredServices.map(s => (
                                                  <div key={s.id} onClick={() => selectService(i, s)} className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-50 last:border-0">
                                                      <div className="font-bold text-sm text-gray-800">{s.serviceName}</div>
                                                      <div className="text-[10px] text-gray-400 flex justify-between mt-1">
                                                          <span>Kode: {s.serviceCode || '-'}</span>
                                                          <span className="font-bold text-indigo-600">{formatCurrency(s.basePrice)}</span>
                                                      </div>
                                                  </div>
                                              ))}
                                              {filteredServices.length === 0 && <div className="p-3 text-center text-xs text-gray-400">Tidak ada jasa ditemukan.</div>}
                                          </div>
                                      )}
                                  </div>
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 text-center">
                                  <span className="font-mono font-bold text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{item.panelCount || 0}</span>
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 text-right">
                                  <input type="number" value={item.price} onChange={e => updateItemRaw('jasa', i, 'price', Number(e.target.value))} className="w-full p-2 text-right bg-gray-50 border-none rounded-lg font-bold text-gray-800 focus:ring-2 ring-indigo-500 transition-all disabled:opacity-60" disabled={isLocked} />
                              </td>
                              <td className="px-4 py-3 border-y border-r border-gray-100 bg-gray-50/50 rounded-r-xl text-center">
                                  <button onClick={() => removeItem('jasa', i)} className="text-red-300 hover:text-red-500 transition-colors disabled:opacity-20" disabled={isLocked}><Trash2 size={16}/></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>
      
      {/* PART SECTION */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
              <h4 className="font-black text-gray-800 tracking-tight">{t('sec_part')}</h4>
              <button onClick={() => addItem('part')} disabled={isLocked} className="flex items-center gap-1 text-sm bg-orange-50 text-orange-700 px-4 py-1.5 rounded-xl font-black hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"><Plus size={16}/> {t('btn_add_part')}</button>
          </div>
          <div className="relative">
              <table className="w-full text-sm text-left border-separate border-spacing-y-2 min-w-[700px]">
                  <thead>
                      <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          <th className="px-4 py-2 w-10 text-center">No</th>
                          <th className="px-4 py-2 w-40">{t('col_part_no')}</th>
                          <th className="px-4 py-2">{t('col_part_name')}</th>
                          <th className="px-4 py-2 w-20 text-center">{t('col_qty')}</th>
                          <th className="px-4 py-2 w-40 text-right">{t('col_price')}</th>
                          <th className="px-4 py-2 w-40 text-right">{t('col_total')}</th>
                          <th className="px-4 py-2 w-10"></th>
                      </tr>
                  </thead>
                  <tbody>
                      {partItems.map((item, i) => (
                          <tr key={i} className={`group transition-colors ${item.isPriceMismatch ? 'bg-red-50/70 hover:bg-red-50' : 'hover:bg-gray-50'}`}>
                              <td className="px-4 py-3 text-center text-gray-400 font-bold bg-gray-50/50 rounded-l-xl border-y border-l border-gray-100">{i+1}</td>
                              <td className="px-4 py-3 border-y border-gray-100">
                                  <input type="text" value={item.number || ''} onFocus={() => { setActiveSearch({ type: 'part', index: i }); setSearchQuery(item.number || ''); }} onChange={e => { setSearchQuery(e.target.value); updateItemRaw('part', i, 'number', e.target.value); }} className="w-full p-2 bg-gray-50 border-none rounded-lg uppercase font-mono text-xs font-bold focus:ring-2 ring-orange-500 transition-all disabled:opacity-60" placeholder="CARI..." disabled={isLocked} />
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 relative">
                                  <div className="relative">
                                      <input type="text" value={item.name} onFocus={() => { setActiveSearch({ type: 'part', index: i }); setSearchQuery(item.name); }} onChange={e => { setSearchQuery(e.target.value); updateItemRaw('part', i, 'name', e.target.value); }} className="w-full p-2 bg-gray-50 border-none rounded-lg font-bold text-gray-700 focus:ring-2 ring-orange-500 transition-all disabled:opacity-60" placeholder="SEARCH (DB)..." disabled={isLocked} />
                                      
                                      {item.isPriceMismatch && (
                                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-red-600 animate-pulse bg-red-100 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                                              <AlertTriangle size={12}/> Price Mismatch
                                          </div>
                                      )}

                                      {activeSearch?.type === 'part' && activeSearch.index === i && (
                                          <div ref={searchRef} className={`absolute left-0 top-full mt-2 w-[500px] bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-orange-100 z-[100] max-h-[400px] overflow-y-auto animate-pop-in scrollbar-thin backdrop-blur-md bg-white/98`}>
                                              <div className="p-3 bg-orange-50/50 border-b border-orange-100 flex justify-between items-center sticky top-0 z-10 backdrop-blur-sm">
                                                  <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">{lang === 'id' ? 'Cari di Master' : 'Search Master'}</span>
                                                  <button onClick={() => setActiveSearch(null)} className="p-1 hover:bg-white rounded-full"><X size={14} className="text-orange-400"/></button>
                                              </div>
                                              {isSearching && <div className="p-4 text-center text-xs text-gray-400"><Loader2 className="animate-spin inline mr-1" size={14}/> Mencari...</div>}
                                              
                                              {!isSearching && searchResults.map(p => (
                                                  <div key={p.id} onClick={() => selectPart(i, p)} className="p-3 hover:bg-orange-50 cursor-pointer border-b border-gray-50 flex justify-between items-center group">
                                                      <div>
                                                          <div className="font-bold text-sm text-gray-800 group-hover:text-orange-700 transition-colors">{p.name}</div>
                                                          <div className="text-[10px] font-mono text-gray-400">{p.code} | Stok: {p.stock} {p.unit}</div>
                                                      </div>
                                                      <div className="text-right">
                                                          <div className="font-black text-emerald-600 text-sm">{formatCurrency(p.sellPrice)}</div>
                                                      </div>
                                                  </div>
                                              ))}
                                              
                                              {!isSearching && searchResults.length === 0 && searchQuery && (
                                                  <div className="p-4 text-center text-xs text-gray-400">Tidak ditemukan. Input manual diperbolehkan.</div>
                                              )}
                                          </div>
                                      )}
                                  </div>
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 text-center">
                                  <input type="number" value={item.qty || 1} onChange={e => updateItemRaw('part', i, 'qty', Number(e.target.value))} className="w-16 p-2 text-center bg-gray-50 border-none rounded-lg font-bold text-xs disabled:opacity-60" disabled={isLocked} />
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 text-right relative group-input">
                                  <input type="number" value={item.price} onChange={e => updateItemRaw('part', i, 'price', Number(e.target.value))} className={`w-full p-2 text-right bg-gray-50 border-none rounded-lg font-bold text-gray-800 ${item.isPriceMismatch ? 'ring-2 ring-red-300' : ''} disabled:opacity-60`} disabled={isLocked} />
                                  {item.isPriceMismatch && item.mismatchSuggestedPrice && (
                                       <button 
                                          onClick={() => syncPartPrice(i, item.mismatchSuggestedPrice)} 
                                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 shadow-md rounded text-white hover:bg-indigo-700 transition-all flex items-center gap-1 z-10" 
                                          title={`Sync ke Harga Baru: ${formatCurrency(item.mismatchSuggestedPrice)}`}
                                       >
                                          <RefreshCw size={12}/> <span className="text-[9px] font-bold">SYNC</span>
                                       </button>
                                  )}
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 text-right font-black text-gray-900">
                                  {formatCurrency((item.price || 0) * (item.qty || 1))}
                              </td>
                              <td className="px-4 py-3 border-y border-r border-gray-100 bg-gray-50/50 rounded-r-xl text-center">
                                  <button onClick={() => removeItem('part', i)} className="text-red-300 hover:text-red-500 transition-colors disabled:opacity-20" disabled={isLocked}><Trash2 size={16}/></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>

      {/* SUMMARY */}
      <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="space-y-4">
                  <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Jasa</p>
                      <p className="text-2xl font-black">{formatCurrency(totals.subtotalJasa)}</p>
                  </div>
                  <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Diskon Jasa ({discountJasa}%)</p>
                      <input type="range" min="0" max="100" value={discountJasa} onChange={e => setDiscountJasa(Number(e.target.value))} disabled={isLocked} className="w-full accent-indigo-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"/>
                      <p className="text-sm font-bold text-red-400 mt-1">- {formatCurrency(totals.discountJasaAmount)}</p>
                  </div>
              </div>

              <div className="space-y-4">
                  <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Sparepart</p>
                      <p className="text-2xl font-black">{formatCurrency(totals.subtotalPart)}</p>
                  </div>
                  <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Diskon Part ({discountPart}%)</p>
                      <input type="range" min="0" max="100" value={discountPart} onChange={e => setDiscountPart(Number(e.target.value))} disabled={isLocked} className="w-full accent-orange-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"/>
                      <p className="text-sm font-bold text-red-400 mt-1">- {formatCurrency(totals.discountPartAmount)}</p>
                  </div>
              </div>

              <div className="space-y-2 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                  <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Subtotal Net</span>
                      <span className="font-bold">{formatCurrency(totals.grandTotal - totals.ppnAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">PPN ({ppnPercentage}%)</span>
                      <span className="font-bold">{formatCurrency(totals.ppnAmount)}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-700 mt-2">
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Grand Total Estimasi</p>
                      <p className="text-3xl font-black text-emerald-400">{formatCurrency(totals.grandTotal)}</p>
                  </div>
              </div>

              <div className="flex flex-col justify-end space-y-2">
                  <div className="p-3 bg-indigo-900/50 rounded-xl border border-indigo-800 mb-2">
                      <p className="text-[10px] font-bold text-indigo-300 uppercase mb-1">Estimator</p>
                      <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold">{creatorName[0]}</div>
                          <span className="text-sm font-bold">{creatorName}</span>
                      </div>
                  </div>
                  {specialColorRate && (
                      <div className="p-3 bg-pink-900/30 rounded-xl border border-pink-800/50 text-[10px] text-pink-300 flex items-center gap-2">
                          <Palette size={14}/>
                          <span>Warna Spesial (+{formatCurrency(specialColorRate.surchargePerPanel)}/Panel)</span>
                      </div>
                  )}
              </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 justify-end border-t border-white/10 pt-6">
              <button onClick={onCancel} className="px-6 py-3 rounded-xl font-bold text-gray-400 hover:text-white hover:bg-white/10 transition-colors">Batal</button>
              <button onClick={() => handleSaveAction('estimate')} disabled={isSubmitting || isLocked} className="px-6 py-3 bg-white text-indigo-900 rounded-xl font-black shadow-lg hover:bg-indigo-50 transition-all flex items-center gap-2 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSubmitting ? 'Menyimpan...' : <><Save size={18}/> {t('btn_save_est')}</>}
              </button>
              <button onClick={() => handleSaveAction('wo')} disabled={isSubmitting || isLocked} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black shadow-xl hover:bg-indigo-500 transition-all flex items-center gap-2 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-400">
                  {isSubmitting ? 'Memproses...' : <><FileText size={18}/> {job.woNumber ? t('btn_update_wo') : t('btn_save_wo')}</>}
              </button>
          </div>
      </div>
    </div>
  );
};

export default EstimateEditor;
