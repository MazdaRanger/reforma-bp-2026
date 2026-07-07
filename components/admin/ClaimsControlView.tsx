
import React, { useState, useMemo } from 'react';
import { Job, Settings, UserPermissions, InventoryItem, Vehicle } from '../../types';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { formatDateIndo, formatCurrency, cleanObject } from '../../utils/helpers';
import { ShieldCheck, Clock, AlertTriangle, ChevronRight, User, MessageSquare, Search, Phone, Package, Calendar, ArrowRight, ClipboardList, CheckCircle2, Zap, Plus, Car, X, Info, ShoppingCart, Loader2, Gavel, Timer } from 'lucide-react';
import Modal from '../ui/Modal';

interface ClaimsControlViewProps {
  jobs: Job[];
  inventoryItems: InventoryItem[];
  vehicles: Vehicle[]; 
  settings: Settings;
  showNotification: (msg: string, type: string) => void;
  openModal: (type: string, data: any) => void;
  onNavigate: (view: string) => void;
}

const CLAIM_STAGES = [
    "Tunggu Estimasi",
    "Tunggu SPK Asuransi",
    "Banding Harga SPK",
    "Unit di Pemilik (Tunggu Part)",
    "Booking Masuk"
];

const DICTIONARY: Record<string, Record<string, string>> = {
    id: {
        title: "Admin Claim Control",
        subtitle: "Jalur Administrasi Asuransi",
        search: "Cari Nopol atau Nama...",
        aging_unit: "HARI",
        ready_badge: "SIAP PANGGIL / BOOKING",
        prod_request: "Request Produksi",
        legend_1: "Outstanding > 3 Hari",
        legend_2: "Menunggu (2-3 Hari)",
        legend_3: "Jadwal Booking Terkonfirmasi",
        "Tunggu Estimasi": "Tunggu Estimasi",
        "Tunggu SPK Asuransi": "Tunggu SPK Asuransi",
        "Banding Harga SPK": "Banding Harga SPK",
        "Unit di Pemilik (Tunggu Part)": "Unit di Pemilik (Tunggu Part)",
        "Booking Masuk": "Booking Masuk",
        btn_deal: "SPK DEAL / ACC"
    },
    en: {
        title: "Claim Control Desk",
        subtitle: "Insurance Admin Pipeline",
        search: "Search Plate or Name...",
        aging_unit: "DAYS",
        ready_badge: "READY TO BOOK / CALL",
        prod_request: "Shop Floor Request",
        legend_1: "Delayed > 3 Days",
        legend_2: "Waiting (2-3 Days)",
        legend_3: "Confirmed Booking Schedule",
        "Tunggu Estimasi": "Pending Estimate",
        "Tunggu SPK Asuransi": "Awaiting Approval",
        "Banding Harga SPK": "Negotiation Phase",
        "Unit di Pemilik (Tunggu Part)": "With Owner (Awaiting Part)",
        "Booking Masuk": "Scheduled Booking",
        btn_deal: "SPK APPROVED"
    }
};

const ClaimsControlView: React.FC<ClaimsControlViewProps> = ({ jobs, inventoryItems, vehicles, settings, showNotification, openModal, onNavigate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);
  const [unitSearch, setUnitSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lang = settings.language || 'id';
  const t = (key: string) => DICTIONARY[lang][key] || key;

  const activeClaimJobs = useMemo(() => {
      const term = searchTerm.toUpperCase();
      const filtered = jobs.filter(j => !j.isClosed && !j.isDeleted && j.namaAsuransi !== 'Umum / Pribadi' && CLAIM_STAGES.includes(j.statusKendaraan) && (j.policeNumber.includes(term) || j.customerName.toUpperCase().includes(term)));
      
      const stockMap: Record<string, number> = {};
      inventoryItems.forEach(i => { stockMap[i.id] = i.stock; });

      return filtered.map(job => {
          const parts = job.estimateData?.partItems || [];
          let readyCount = 0;
          let orderedCount = 0;
          let indentCount = 0;
          let allPartsReady = parts.length > 0;
          let hasPartItems = parts.length > 0;

          if (hasPartItems) {
              parts.forEach(p => {
                  if (p.isOrdered) orderedCount++;
                  if (p.isIndent) indentCount++;

                  if (p.hasArrived) { 
                      readyCount++; 
                      return; 
                  }
                  
                  const reqQty = p.qty || 1;
                  if (p.inventoryId && stockMap[p.inventoryId] >= reqQty) { 
                      stockMap[p.inventoryId] -= reqQty; 
                      readyCount++; 
                  } else { 
                      allPartsReady = false; 
                  }
              });
          } else {
              // Jika tidak ada part (hanya jasa), dianggap ready
              allPartsReady = (job.estimateData?.jasaItems?.length || 0) > 0;
          }

          // Determine Logistic Status Label
          let logisticStatus = 'NEED ORDER';
          if (!hasPartItems) logisticStatus = 'NO PART';
          else if (allPartsReady) logisticStatus = 'READY';
          else if (readyCount > 0) logisticStatus = 'PARTIAL';
          else if (indentCount > 0) logisticStatus = 'INDENT';
          else if (orderedCount === parts.length) logisticStatus = 'ON ORDER';

          return { 
              ...job, 
              isReadyToCall: allPartsReady, 
              logisticStatus, // New Field for Badge
              logistik: { total: parts.length, ordered: orderedCount, ready: readyCount } 
          };
      }).sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  }, [jobs, inventoryItems, searchTerm]);

  const boardData = useMemo(() => {
      const columns: Record<string, any[]> = {};
      CLAIM_STAGES.forEach(s => columns[s] = []);
      activeClaimJobs.forEach(job => { if (columns[job.statusKendaraan]) columns[job.statusKendaraan].push(job); });
      return columns;
  }, [activeClaimJobs]);

  const availableVehicles = useMemo(() => {
      if (!unitSearch) return [];
      const term = unitSearch.toUpperCase().replace(/\s/g, '');
      return vehicles.filter(v => {
          const police = (v.policeNumber || '').toUpperCase().replace(/\s/g, '');
          const customer = (v.customerName || '').toUpperCase();
          return police.includes(term) || customer.includes(term);
      }).slice(0, 10);
  }, [vehicles, unitSearch]);

  const handleMoveStage = async (job: Job, direction: 'next' | 'prev') => {
      const idx = CLAIM_STAGES.indexOf(job.statusKendaraan);
      let newIdx = direction === 'next' ? idx + 1 : idx - 1;
      if (newIdx >= 0 && newIdx < CLAIM_STAGES.length) {
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { statusKendaraan: CLAIM_STAGES[newIdx], updatedAt: serverTimestamp() });
          showNotification(`Moved to: ${CLAIM_STAGES[newIdx]}`, "success");
      }
  };

  const handleResolveBanding = async (job: Job) => {
      const isWipReturn = job.posisiKendaraan === 'Di Bengkel';
      const newStatus = isWipReturn ? 'Work In Progress' : 'Unit di Pemilik (Tunggu Part)';
      
      const confirmMsg = isWipReturn 
          ? `Unit ini fisik ada Di Bengkel (WIP).\n\nHarga Banding sudah Deal?\nKlik OK untuk mengembalikan status ke 'Work In Progress' agar bisa dikerjakan mekanik.`
          : `Unit ini fisik ada Di Pemilik.\n\nHarga Banding sudah Deal?\nKlik OK untuk memindahkan ke 'Unit di Pemilik (Tunggu Part)'.`;

      if(!window.confirm(confirmMsg)) return;

      try {
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { 
              statusKendaraan: newStatus, 
              updatedAt: serverTimestamp() 
          });
          showNotification(`Banding Selesai. Status: ${newStatus}`, "success");
      } catch (e: any) {
          showNotification("Gagal update status: " + e.message, "error");
      }
  };

  const handleAddExistingUnit = async (vehicle: Vehicle) => {
      const activeJob = jobs.find(j => j.unitId === vehicle.id && !j.isClosed && !j.isDeleted);
      if (activeJob) {
          alert(`Unit ${vehicle.policeNumber} sudah ada di dalam list aktif (Status: ${activeJob.statusKendaraan}). Tidak bisa duplikasi.`);
          return;
      }

      if (!window.confirm(`Masukkan unit ${vehicle.policeNumber} ke kolom Tunggu Estimasi?`)) return;

      setIsSubmitting(true);
      try {
          // CREATE NEW JOB in SERVICE_JOBS_COLLECTION based on Vehicle Master Data
          const newJob: Partial<Job> = {
              unitId: vehicle.id, // CRITICAL: Reference ID
              policeNumber: vehicle.policeNumber,
              customerName: vehicle.customerName,
              customerPhone: vehicle.customerPhone,
              customerAddress: vehicle.customerAddress,
              customerKota: vehicle.customerKota,
              carBrand: vehicle.carBrand,
              carModel: vehicle.carModel,
              warnaMobil: vehicle.warnaMobil,
              nomorRangka: vehicle.nomorRangka,
              nomorMesin: vehicle.nomorMesin,
              tahunPembuatan: vehicle.tahunPembuatan,
              namaAsuransi: vehicle.namaAsuransi || 'Asuransi Lainnya', 
              nomorPolis: vehicle.nomorPolis,
              asuransiExpiryDate: vehicle.asuransiExpiryDate,
              
              statusKendaraan: 'Tunggu Estimasi',
              statusPekerjaan: 'Belum Mulai Perbaikan',
              posisiKendaraan: 'Di Bengkel',
              tanggalMasuk: new Date().toISOString(),
              
              isClosed: false,
              isDeleted: false,
              hargaJasa: 0,
              hargaPart: 0,
              costData: { hargaModalBahan: 0, hargaBeliPart: 0, jasaExternal: 0 },
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
          };

          await addDoc(collection(db, SERVICE_JOBS_COLLECTION), cleanObject(newJob));
          
          showNotification("Unit berhasil masuk antrian Tunggu Estimasi.", "success");
          setIsAddUnitOpen(false);
          setUnitSearch('');
      } catch (e: any) {
          showNotification("Gagal menambahkan unit: " + e.message, "error");
      } finally {
          setIsSubmitting(false);
      }
  };

  const getAgingDays = (job: Job) => {
      const rawDate = job.updatedAt || job.createdAt;
      if (!rawDate) return 0;
      let lastDate: Date;
      try {
          if (typeof rawDate === 'object' && 'seconds' in rawDate) {
               lastDate = new Date((rawDate as any).seconds * 1000);
          } else {
               lastDate = new Date(rawDate as any);
          }
      } catch (e) {
          return 0; 
      }
      if (isNaN(lastDate.getTime())) return 0;
      const today = new Date();
      lastDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      const diffTime = today.getTime() - lastDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
  };

  return (
    <div className="space-y-6 animate-fade-in h-[calc(100vh-120px)] flex flex-col">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm shrink-0">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><ShieldCheck size={28}/></div>
                <div><h1 className="text-xl font-bold text-gray-900 tracking-tight">{t('title')}</h1><p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{t('subtitle')}</p></div>
            </div>
            <div className="relative group"><Search className="absolute left-3 top-2.5 text-gray-300" size={18}/><input type="text" placeholder={t('search')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 p-2.5 border border-gray-200 rounded-xl text-sm w-72 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"/></div>
        </div>

        <div className="flex-grow overflow-x-auto pb-4 scrollbar-thin">
            <div className="flex gap-5 h-full min-w-max px-2">
                {CLAIM_STAGES.map((stage) => (
                    <div key={stage} className="w-72 flex flex-col h-full rounded-2xl bg-gray-50/50 border border-gray-200 shadow-sm">
                        <div className="p-4 flex justify-between items-center sticky top-0 z-10">
                            <div className="flex flex-col"><h3 className="font-bold text-gray-800 text-[11px] uppercase tracking-widest">{t(stage)}</h3><span className="text-[10px] text-indigo-500 font-bold">{boardData[stage]?.length || 0} Unit</span></div>
                            {stage === 'Tunggu Estimasi' && (
                                <button 
                                    onClick={() => setIsAddUnitOpen(true)}
                                    className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm transition-all flex items-center justify-center"
                                    title="Tarik Unit dari Database (Outstanding)"
                                >
                                    <Plus size={16} />
                                </button>
                            )}
                        </div>
                        <div className="p-3 flex-grow overflow-y-auto space-y-4 scrollbar-hide">
                            {boardData[stage]?.map(job => {
                                const aging = getAgingDays(job);
                                const latestProdRequest = job.productionLogs?.filter((l: any) => l.note?.startsWith('REQUEST TAMBAHAN: ', '')).reverse()[0];
                                return (
                                    <div key={job.id} onClick={() => openModal('create_estimation', job)} className={`bg-white p-4 rounded-xl shadow-sm border transition-all hover:shadow-md cursor-pointer group relative overflow-hidden ${job.statusKendaraan === 'Booking Masuk' ? 'border-indigo-600 ring-1 ring-indigo-50' : 'border-gray-100 hover:border-indigo-200'}`}>
                                        {aging > 3 ? <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500"></div> : aging >= 2 ? <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-400"></div> : null}
                                        <div className="flex justify-between items-start mb-3"><span className="font-bold text-gray-900 text-sm">{job.policeNumber}</span>{aging > 3 && <AlertTriangle size={14} className="text-red-500 animate-pulse"/>}</div>
                                        <div className="space-y-1.5 mb-4">
                                            <p className="text-[12px] font-bold text-gray-700 truncate uppercase">{job.carModel}</p>
                                            <p className="text-[11px] text-gray-400 font-medium truncate">{job.namaAsuransi}</p>
                                            {stage === 'Banding Harga SPK' && latestProdRequest && (
                                                <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded-lg animate-fade-in">
                                                    <p className="text-[8px] font-black text-red-400 uppercase leading-none">{t('prod_request')} (Stall {latestProdRequest.stage})</p>
                                                    <p className="text-[10px] font-bold text-red-700 mt-1 line-clamp-3">{latestProdRequest.note?.replace('REQUEST TAMBAHAN: ', '')}</p>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between pt-2">
                                                <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1.5"><div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[8px]">SA</div> {job.namaSA || '---'}</span>
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${aging > 3 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-600 border-green-200'}`}>{aging} {t('aging_unit')}</span>
                                            </div>
                                        </div>
                                        
                                        {/* LOGISTIC STATUS BADGES */}
                                        {stage === 'Unit di Pemilik (Tunggu Part)' && (
                                            <div className="mb-3">
                                                {job.logisticStatus === 'READY' && <span className="w-full block text-center text-[10px] font-black bg-emerald-100 text-emerald-700 py-1 rounded border border-emerald-200">READY ALL PART</span>}
                                                {job.logisticStatus === 'PARTIAL' && <span className="w-full block text-center text-[10px] font-black bg-blue-100 text-blue-700 py-1 rounded border border-blue-200">READY PARTIAL</span>}
                                                {job.logisticStatus === 'INDENT' && <span className="w-full block text-center text-[10px] font-black bg-red-100 text-red-700 py-1 rounded border border-red-200">INDENT PART</span>}
                                                {job.logisticStatus === 'ON ORDER' && <span className="w-full block text-center text-[10px] font-black bg-orange-100 text-orange-700 py-1 rounded border border-orange-200">ON ORDER (WAITING)</span>}
                                                {job.logisticStatus === 'NEED ORDER' && <span className="w-full block text-center text-[10px] font-black bg-gray-100 text-gray-600 py-1 rounded border border-gray-300">NEED PO</span>}
                                            </div>
                                        )}

                                        {job.isReadyToCall && stage === 'Unit di Pemilik (Tunggu Part)' && (
                                            <div className="mb-4 py-1.5 px-2 bg-emerald-100/50 rounded-lg flex items-center gap-2 border border-emerald-200 animate-pulse"><Zap size={14} className="text-emerald-600 fill-emerald-600"/><span className="text-[10px] font-black text-emerald-700 uppercase tracking-tighter">{t('ready_badge')}</span></div>
                                        )}
                                        
                                        {stage === 'Banding Harga SPK' && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleResolveBanding(job); }}
                                                className="w-full mb-3 py-2 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2 shadow-sm transition-all transform active:scale-95"
                                            >
                                                <Gavel size={14} /> {t('btn_deal')}
                                            </button>
                                        )}

                                        <div className="flex justify-between items-center pt-3 border-t border-gray-50">
                                            <button onClick={(e) => { e.stopPropagation(); handleMoveStage(job, 'prev'); }} disabled={stage === CLAIM_STAGES[0]} className="p-1 text-gray-300 hover:text-indigo-600 disabled:opacity-0 transition-colors"><ChevronRight size={18} className="rotate-180"/></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleMoveStage(job, 'next'); }} disabled={stage === CLAIM_STAGES[CLAIM_STAGES.length - 1]} className="p-1 text-gray-300 hover:text-indigo-600 disabled:opacity-0 transition-colors"><ChevronRight size={18}/></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
        
        <div className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-wrap items-center gap-8 shadow-sm shrink-0">
             <div className="flex items-center gap-2.5 text-xs font-bold text-gray-500"><div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div><span className="tracking-tight uppercase">{t('legend_1')}</span></div>
             <div className="flex items-center gap-2.5 text-xs font-bold text-gray-500"><div className="w-2.5 h-2.5 rounded-full bg-orange-400"></div><span className="tracking-tight uppercase">{t('legend_2')}</span></div>
             <div className="flex items-center gap-2.5 text-xs font-bold text-gray-500"><div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div><span className="tracking-tight uppercase">{t('legend_3')}</span></div>
        </div>

        {/* MODAL ADD UNIT TO QUEUE */}
        <Modal isOpen={isAddUnitOpen} onClose={() => setIsAddUnitOpen(false)} title="Tarik Data Unit ke Klaim Control">
            <div className="space-y-4">
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-3">
                    <Info className="text-indigo-500 mt-0.5 shrink-0" size={20}/>
                    <div className="text-xs text-indigo-800">
                        <p className="font-bold mb-1">Fungsi ini untuk unit yang belum memiliki estimasi.</p>
                        <p>Pilih unit yang sudah terdaftar di database (Input SA) untuk dimasukkan ke antrian <strong>Tunggu Estimasi</strong>. Jika unit belum ada di database, harap Input Unit Baru terlebih dahulu.</p>
                    </div>
                </div>

                <div className="relative">
                    <input 
                        type="text" 
                        autoFocus
                        placeholder="Ketik Nopol atau Nama Pelanggan..." 
                        value={unitSearch}
                        onChange={(e) => setUnitSearch(e.target.value)}
                        className="w-full pl-10 p-3 border border-gray-300 rounded-xl focus:ring-4 focus:ring-indigo-100 font-bold uppercase"
                    />
                    <Search className="absolute left-3 top-3.5 text-gray-400" size={18}/>
                </div>

                <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                    {unitSearch && availableVehicles.length > 0 ? (
                        availableVehicles.map(v => (
                            <button 
                                key={v.id} 
                                onClick={() => handleAddExistingUnit(v)}
                                disabled={isSubmitting}
                                className="w-full text-left p-3 hover:bg-gray-50 flex justify-between items-center group transition-colors"
                            >
                                <div>
                                    <div className="font-black text-gray-800">{v.policeNumber}</div>
                                    <div className="text-xs text-gray-500">{v.carModel} • {v.customerName}</div>
                                </div>
                                <Plus size={18} className="text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"/>
                            </button>
                        ))
                    ) : unitSearch ? (
                        <div className="p-4 text-center text-gray-400 text-xs italic">
                            Unit tidak ditemukan. Pastikan unit sudah diinput di menu "Input Unit Baru".
                        </div>
                    ) : null}
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default ClaimsControlView;
