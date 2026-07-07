
import React, { useState, useMemo } from 'react';
import { Job, Settings, InventoryItem } from '../../types';
import { formatDateIndo, formatCurrency, formatWaNumber, cleanObject } from '../../utils/helpers';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
// Added Car to imports to fix "Cannot find name 'Car'" error
import { MessageSquare, Phone, CheckCircle, Calendar, Star, Send, XCircle, Clock, Search, User, Megaphone, CheckSquare, Square, Zap, Package, Wrench, Loader2, Save, Filter, Users, Trash2, ClipboardCheck, Info, AlertCircle, CheckCircle2, Ticket, Car } from 'lucide-react';
import Modal from '../ui/Modal';

interface CrcDashboardViewProps {
  jobs: Job[];
  inventoryItems: InventoryItem[];
  settings: Settings;
  showNotification: (msg: string, type: string) => void;
}

const DICTIONARY: Record<string, Record<string, string>> = {
    id: {
        tab_ready: "Unit Siap Ambil",
        tab_booking: "Potensi Booking",
        tab_followup: "Follow Up Service",
        tab_broadcast: "Broadcast & Promo",
        tab_history: "Riwayat Feedback",
        ready_title: "Daftar Unit Selesai Perbaikan",
        ready_subtitle: "Hubungi pelanggan untuk mengonfirmasi pengambilan unit.",
        btn_wa_ready: "Konfirmasi Janji Ambil",
        stats_ready: "Unit Selesai"
    },
    en: {
        tab_ready: "Ready for Pickup",
        tab_booking: "Booking Potential",
        tab_followup: "Service Follow Up",
        tab_broadcast: "Broadcast & Promo",
        tab_history: "Feedback History",
        ready_title: "Completed Vehicle List",
        ready_subtitle: "Contact customers to confirm vehicle collection.",
        btn_wa_ready: "Confirm Pickup Date",
        stats_ready: "Finished Units"
    }
};

const CrcDashboardView: React.FC<CrcDashboardViewProps> = ({ jobs, inventoryItems = [], settings, showNotification }) => {
  const [activeTab, setActiveTab] = useState<'ready' | 'booking' | 'followup' | 'broadcast' | 'history'>('ready');
  const [searchTerm, setSearchTerm] = useState('');
  
  const lang = settings.language || 'id';
  const t = (key: string) => DICTIONARY[lang][key] || key;

  // Feedback Modal State
  const [feedbackModal, setFeedbackModal] = useState<{ isOpen: boolean, job: Job | null }>({ isOpen: false, job: null });
  const [csiRatings, setCsiRatings] = useState<Record<string, number>>({});
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [followUpStatus, setFollowUpStatus] = useState<'Contacted' | 'Unreachable'>('Contacted');

  // Booking Execution Modal
  const [bookingModal, setBookingModal] = useState<{ isOpen: boolean, job: Job | null }>({ isOpen: false, job: null });
  const [bookingDateInput, setBookingDateInput] = useState('');
  
  // Pickup Execution Modal (NEW)
  const [pickupModal, setPickupModal] = useState<{ isOpen: boolean, job: Job | null }>({ isOpen: false, job: null });
  const [pickupDateInput, setPickupDateInput] = useState('');

  const [isUpdating, setIsUpdating] = useState(false);

  // Broadcast State
  const [broadcastMessage, setBroadcastMessage] = useState(settings.whatsappTemplates?.promoBroadcast || 'Halo Bpk/Ibu {nama}, kami memiliki promo spesial untuk pemilik {mobil} di Mazda Ranger. Hubungi kami segera untuk info lebih lanjut!');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState('');
  const [filterModel, setFilterModel] = useState('');

  // --- DATA PROCESSING ---
  
  // NEW: Filter for Ready for Pickup units
  const readyPickupJobs = useMemo(() => {
      const term = searchTerm.toLowerCase();
      return jobs.filter(j => 
          !j.isClosed && 
          j.statusKendaraan === 'Selesai (Tunggu Pengambilan)' && 
          !j.isDeleted &&
          (j.policeNumber.toLowerCase().includes(term) || j.customerName.toLowerCase().includes(term))
      ).sort((a,b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  }, [jobs, searchTerm]);

  const bookingJobs = useMemo(() => {
      const term = searchTerm.toLowerCase();
      const activeJobs = jobs.filter(j => !j.isClosed && j.woNumber && !j.isDeleted);
      activeJobs.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      const stockMap: Record<string, number> = {};
      inventoryItems.forEach(item => { stockMap[item.id] = item.stock; });
      const processedJobs = activeJobs.map(job => {
          const parts = job.estimateData?.partItems || [];
          const jasa = job.estimateData?.jasaItems || [];
          const isJasaOnly = parts.length === 0 && jasa.length > 0;
          let allPartsReady = true;
          if (!isJasaOnly) {
              if (parts.length === 0) allPartsReady = false;
              else {
                  parts.forEach(p => {
                      if (p.hasArrived) return;
                      const reqQty = p.qty || 1;
                      if (p.inventoryId && stockMap[p.inventoryId] >= reqQty) stockMap[p.inventoryId] -= reqQty;
                      else allPartsReady = false;
                  });
              }
          }
          return { ...job, isPartReady: allPartsReady, isJasaOnly };
      });
      return processedJobs.filter(j => {
          if (j.posisiKendaraan !== 'Di Pemilik') return false;
          const matchesSearch = j.policeNumber.toLowerCase().includes(term) || j.customerName.toLowerCase().includes(term);
          if (!matchesSearch) return false;
          return j.statusKendaraan === 'Booking Masuk' || j.isPartReady || j.isJasaOnly;
      }).sort((a,b) => new Date(a.tanggalMasuk || '').getTime() - new Date(b.tanggalMasuk || '').getTime());
  }, [jobs, inventoryItems, searchTerm]);

  const followUpJobs = useMemo(() => {
      const term = searchTerm.toLowerCase();
      return jobs.filter(j => {
          const isClosed = j.isClosed || j.statusKendaraan === 'Sudah Diambil Pemilik';
          const isPending = !j.crcFollowUpStatus || j.crcFollowUpStatus === 'Pending';
          return isClosed && isPending && (j.policeNumber.toLowerCase().includes(term) || j.customerName.toLowerCase().includes(term));
      }).sort((a,b) => {
          // Priority sort: Latest Closing OR Latest Update (GatePass)
          const timeA = a.closedAt?.seconds || a.updatedAt?.seconds || 0;
          const timeB = b.closedAt?.seconds || b.updatedAt?.seconds || 0;
          return timeB - timeA;
      });
  }, [jobs, searchTerm]);

  const historyJobs = useMemo(() => {
      const term = searchTerm.toLowerCase();
      return jobs.filter(j => j.crcFollowUpStatus && j.crcFollowUpStatus !== 'Pending' && (j.policeNumber.toLowerCase().includes(term) || j.customerName.toLowerCase().includes(term))).sort((a,b) => (b.crcFollowUpDate?.seconds || 0) - (b.crcFollowUpDate?.seconds || 0));
  }, [jobs, searchTerm]);

  const broadcastCandidates = useMemo(() => {
      const candidates = jobs.filter(j => {
          if (!j.customerPhone || j.isDeleted) return false;
          if (filterModel && !j.carModel.toLowerCase().includes(filterModel.toLowerCase())) return false;
          if (filterYear && j.tahunPembuatan !== filterYear) return false;
          return true;
      });
      const uniqueMap = new Map();
      candidates.forEach(job => {
          const phone = formatWaNumber(job.customerPhone);
          if (phone) {
              const existing = uniqueMap.get(phone);
              if (!existing || (job.createdAt?.seconds || 0) > (existing.createdAt?.seconds || 0)) uniqueMap.set(phone, job);
          }
      });
      return Array.from(uniqueMap.values()) as Job[];
  }, [jobs, filterModel, filterYear]);

  const avgRating = useMemo(() => {
      const ratedJobs = jobs.filter(j => j.customerRating && j.customerRating > 0);
      if (ratedJobs.length === 0) return 0;
      const sum = ratedJobs.reduce((acc, j) => acc + (j.customerRating || 0), 0);
      return (sum / ratedJobs.length).toFixed(1);
  }, [jobs]);

  const isApiMode = settings.whatsappConfig?.mode === 'API';

  const generateWaLink = (job: Job, type: 'booking' | 'followup' | 'promo' | 'ready', overrideDate?: string) => {
      const phone = formatWaNumber(job.customerPhone);
      if (!phone) return null;
      let template = '';
      if (type === 'booking') template = settings.whatsappTemplates?.bookingReminder || '';
      else if (type === 'followup') template = settings.whatsappTemplates?.afterService || '';
      else if (type === 'ready') template = settings.whatsappTemplates?.readyForPickup || 'Kabar Gembira! Kendaraan {mobil} ({nopol}) milik Bpk/Ibu {nama} sudah selesai diperbaiki dan siap diambil. Terima kasih.';
      else template = broadcastMessage;
      
      const displayDate = overrideDate ? formatDateIndo(overrideDate) : (job.tanggalBooking || '(Belum Ditentukan)');
      
      // Replace Placeholders
      let message = template
        .replace(/{nama}/g, job.customerName)
        .replace(/{mobil}/g, job.carModel)
        .replace(/{nopol}/g, job.policeNumber)
        .replace(/{tgl_booking}/g, displayDate); // Used for both Booking and Ready date if mapped

      return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  const handleOpenFeedback = (job: Job) => {
      setFeedbackModal({ isOpen: true, job });
      setFollowUpStatus('Contacted');
      setFeedbackNotes(job.customerFeedback || '');
      const initial: Record<string, number> = {};
      settings.csiIndicators.forEach(ind => {
          initial[ind] = job.csiResults?.[ind] || 5;
      });
      setCsiRatings(initial);
  };

  const handleSaveFeedback = async () => {
      if (!feedbackModal.job) return;
      
      const indicatorsCount = settings.csiIndicators.length;
      let finalAvgRating = 0;
      
      if (followUpStatus === 'Contacted' && indicatorsCount > 0) {
          const totalStars = Object.values(csiRatings).reduce((a: number, b: number) => a + b, 0);
          finalAvgRating = Number(((totalStars as number) / indicatorsCount).toFixed(2));
      }

      try {
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, feedbackModal.job.id);
          await updateDoc(jobRef, cleanObject({
              crcFollowUpStatus: followUpStatus,
              crcFollowUpDate: serverTimestamp(),
              customerRating: followUpStatus === 'Contacted' ? finalAvgRating : null,
              customerFeedback: feedbackNotes,
              csiResults: followUpStatus === 'Contacted' ? csiRatings : null
          }));
          showNotification("Data Follow Up & Survey CSI disimpan.", "success");
          setFeedbackModal({ isOpen: false, job: null });
      } catch (e: any) {
          showNotification("Gagal menyimpan: " + e.message, "error");
      }
  };

  const executeBookingProcess = async () => {
      if (!bookingModal.job || !bookingDateInput) {
          showNotification("Tanggal booking wajib diisi.", "error");
          return;
      }
      setIsUpdating(true);
      try {
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, bookingModal.job.id);
          await updateDoc(jobRef, {
              tanggalBooking: bookingDateInput,
              statusKendaraan: 'Booking Masuk',
              isBookingContacted: true, // Flag as Contacted by CRC for KPI
              bookingSuccess: false, // Reset success metric
              updatedAt: serverTimestamp()
          });
          const link = generateWaLink(bookingModal.job, 'booking', bookingDateInput);
          if (link) window.open(link, '_blank');
          showNotification("Jadwal disimpan & KPI Contacted dicatat.", "success");
          setBookingModal({ isOpen: false, job: null });
      } catch (e: any) {
          showNotification("Gagal memproses booking.", "error");
      } finally {
          setIsUpdating(false);
      }
  };

  const executePickupProcess = async () => {
      if (!pickupModal.job || !pickupDateInput) {
          showNotification("Tanggal Janji Pengambilan wajib diisi.", "error");
          return;
      }
      setIsUpdating(true);
      try {
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, pickupModal.job.id);
          
          // Save Promised Date & Flag as Contacted
          await updateDoc(jobRef, {
              pickupPromiseDate: pickupDateInput,
              isPickupContacted: true,
              updatedAt: serverTimestamp()
          });

          // Generate WA link with the specific pickup date
          const link = generateWaLink(pickupModal.job, 'ready', pickupDateInput);
          if (link) window.open(link, '_blank');
          
          showNotification("Janji Ambil Disimpan. KPI Pickup Contacted dicatat.", "success");
          setPickupModal({ isOpen: false, job: null });
      } catch (e: any) {
          showNotification("Gagal menyimpan janji: " + e.message, "error");
      } finally {
          setIsUpdating(false);
      }
  };

  const handleSingleAction = async (job: Job, type: 'booking' | 'followup' | 'promo' | 'ready') => {
      if (type === 'booking') {
          setBookingModal({ isOpen: true, job });
          setBookingDateInput(job.tanggalBooking || '');
          return;
      }

      if (type === 'ready') {
          // Open Pickup Date Modal instead of direct WA
          setPickupModal({ isOpen: true, job });
          setPickupDateInput(new Date().toISOString().split('T')[0]); // Default to today
          return;
      }

      // Handle other types directly
      if (type === 'followup') {
         // Service Follow Up -> Mark as Contacted
         try {
             await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { isServiceContacted: true });
         } catch(e) { console.error("Failed to update Service Contact status", e); }
      }

      const link = generateWaLink(job, type);
      if (link) window.open(link, '_blank');
      else showNotification("Nomor HP tidak valid", "error");
  };

  const toggleRecipient = (id: string) => {
      setSelectedRecipients(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllRecipients = () => {
      if (selectedRecipients.length === broadcastCandidates.length) setSelectedRecipients([]);
      else setSelectedRecipients(broadcastCandidates.map(c => c.id));
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-green-600 rounded-xl shadow-sm text-white"><MessageSquare size={24}/></div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">CRC / Customer Care</h1>
                    <p className="text-sm text-gray-500 font-medium">Mode WhatsApp: <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${isApiMode ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-green-100 text-green-700 border-green-200'}`}>{isApiMode ? 'GATEWAY API (BOT)' : 'PERSONAL (MANUAL)'}</span></p>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center"><div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('stats_ready')}</p><h2 className="text-2xl font-black text-emerald-600">{readyPickupJobs.length} Unit</h2></div><div className="p-3 bg-emerald-50 rounded-full text-emerald-600"><CheckCircle size={24}/></div></div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center"><div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Potensi Booking</p><h2 className="text-2xl font-black text-indigo-900">{bookingJobs.length} Unit</h2></div><div className="p-3 bg-indigo-50 rounded-full text-indigo-600"><Calendar size={24}/></div></div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center"><div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Perlu Follow Up</p><h2 className="text-2xl font-black text-orange-600">{followUpJobs.length} Unit</h2></div><div className="p-3 bg-orange-50 rounded-full text-orange-600"><Phone size={24}/></div></div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center"><div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Avg. Rating (CSI)</p><h2 className="text-2xl font-black text-yellow-500 flex items-center gap-1">{avgRating} <Star fill="currentColor" size={20}/></h2></div><div className="p-3 bg-yellow-50 rounded-full text-yellow-600"><Star size={24}/></div></div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
                <button onClick={() => setActiveTab('ready')} className={`flex-1 min-w-[150px] py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'ready' ? 'border-emerald-600 text-emerald-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}><CheckCircle2 size={16}/> {t('tab_ready')}</button>
                <button onClick={() => setActiveTab('booking')} className={`flex-1 min-w-[150px] py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'booking' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}><Calendar size={16}/> {t('tab_booking')}</button>
                <button onClick={() => setActiveTab('followup')} className={`flex-1 min-w-[150px] py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'followup' ? 'border-orange-600 text-orange-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}><Phone size={16}/> {t('tab_followup')}</button>
                <button onClick={() => setActiveTab('broadcast')} className={`flex-1 min-w-[150px] py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'broadcast' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}><Megaphone size={16}/> {t('tab_broadcast')}</button>
                <button onClick={() => setActiveTab('history')} className={`flex-1 min-w-[150px] py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'history' ? 'border-green-600 text-green-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}><Star size={16}/> {t('tab_history')}</button>
            </div>

            <div className="min-h-[400px]">
                {/* READY FOR PICKUP TAB */}
                {activeTab === 'ready' && (
                    <div className="animate-fade-in p-0">
                        <div className="p-6 bg-emerald-50/30 border-b border-emerald-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-emerald-900">{t('ready_title')}</h3>
                                <p className="text-xs text-emerald-600 font-medium">{t('ready_subtitle')}</p>
                            </div>
                            <div className="relative group">
                                <Search className="absolute left-3 top-2.5 text-emerald-400" size={18}/>
                                <input 
                                    type="text" 
                                    placeholder="Cari Nopol..." 
                                    className="pl-10 p-2 border border-emerald-200 rounded-xl text-sm focus:ring-4 focus:ring-emerald-50 outline-none w-64"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-600 uppercase text-[10px] font-black tracking-widest border-b">
                                    <tr>
                                        <th className="px-6 py-4">Unit / Pelanggan</th>
                                        <th className="px-6 py-4">SA Penanggungjawab</th>
                                        <th className="px-6 py-4 text-center">Waktu Selesai</th>
                                        <th className="px-6 py-4 text-center">Aksi CRC</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {readyPickupJobs.map(job => (
                                        <tr key={job.id} className="hover:bg-emerald-50/10 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><Car size={18}/></div>
                                                    <div>
                                                        <div className="font-black text-gray-900 leading-none mb-1">{job.policeNumber}</div>
                                                        <div className="text-xs text-gray-500 font-bold uppercase">{job.customerName} | {job.carModel}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-bold text-[10px]">SA</div>
                                                    <span className="font-bold text-gray-700">{job.namaSA || '-'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="text-xs font-bold text-gray-500">{formatDateIndo(job.updatedAt)}</div>
                                                <div className="text-[10px] text-emerald-600 font-black flex items-center justify-center gap-1"><Clock size={10}/> SIAP DIAMBIL</div>
                                                {job.pickupPromiseDate && <div className="text-[9px] text-indigo-600 font-bold mt-1 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">Janji: {formatDateIndo(job.pickupPromiseDate)}</div>}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button 
                                                    onClick={() => handleSingleAction(job, 'ready')}
                                                    className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-[10px] shadow-lg shadow-emerald-100 hover:bg-emerald-700 transform active:scale-95 transition-all"
                                                >
                                                    <Send size={14}/> {t('btn_wa_ready')}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {readyPickupJobs.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="py-20 text-center text-gray-400 italic">
                                                <Ticket size={48} className="mx-auto mb-4 opacity-10"/>
                                                Belum ada unit yang baru selesai perbaikan.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'booking' && (
                    <div className="animate-fade-in">
                        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                            <Search className="text-gray-400" size={20}/><input type="text" placeholder="Cari..." className="w-full bg-transparent outline-none font-medium" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-black"><tr><th className="px-6 py-4">Tgl Rencana</th><th className="px-6 py-4">Pelanggan</th><th className="px-6 py-4">Kendaraan</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-center">Aksi</th></tr></thead>
                                <tbody className="divide-y divide-gray-100">
                                    {bookingJobs.map((job: any) => (
                                        <tr key={job.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 font-bold text-indigo-700">{job.tanggalBooking ? formatDateIndo(job.tanggalBooking) : '-'}</td>
                                            <td className="px-6 py-4"><div><div className="font-bold text-gray-900">{job.customerName}</div><div className="text-xs text-gray-500">{job.customerPhone}</div></div></td>
                                            <td className="px-6 py-4"><div><div className="font-medium text-gray-800">{job.policeNumber}</div><div className="text-xs text-gray-500">{job.carModel}</div></div></td>
                                            <td className="px-6 py-4">
                                                {job.isPartReady ? <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 uppercase">Part Ready</span> : <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 uppercase">Waiting Part</span>}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button onClick={() => handleSingleAction(job, 'booking')} title="Atur Jadwal & Kirim WA" className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-xl border border-green-200 hover:bg-green-100 text-xs font-black shadow-sm transform active:scale-95"><Send size={14}/> WA REMINDER</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'followup' && (
                    <div className="animate-fade-in">
                        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                            <Search className="text-gray-400" size={20}/><input type="text" placeholder="Cari..." className="w-full bg-transparent outline-none font-medium" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-black"><tr><th className="px-6 py-4">Tgl Selesai</th><th className="px-6 py-4">Pelanggan</th><th className="px-6 py-4">Kendaraan</th><th className="px-6 py-4 text-center">Aksi</th></tr></thead>
                                <tbody className="divide-y divide-gray-100">
                                    {followUpJobs.map(job => (
                                        <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 text-gray-600 font-bold">
                                                {job.closedAt ? formatDateIndo(job.closedAt) : (job.updatedAt ? formatDateIndo(job.updatedAt) : '-')}
                                            </td>
                                            <td className="px-6 py-4"><div className="font-bold text-gray-900">{job.customerName}</div><div className="text-xs text-gray-500">{job.customerPhone}</div></td>
                                            <td className="px-6 py-4"><div className="font-medium text-gray-800">{job.policeNumber}</div><div className="text-xs text-gray-500">{job.carModel}</div></td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex justify-center gap-3">
                                                    <button onClick={() => handleSingleAction(job, 'followup')} title="Kirim WA Follow Up Service" className="p-2.5 bg-green-50 text-green-600 rounded-full border border-green-100 hover:bg-green-100 transition-colors shadow-sm"><MessageSquare size={18}/></button>
                                                    <button onClick={() => handleOpenFeedback(job)} title="Input Point Survey Pelanggan (CSI)" className="p-2.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors shadow-sm"><CheckCircle size={18}/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'broadcast' && (
                    <div className="p-6 space-y-6 animate-fade-in">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-1 space-y-4">
                                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                                    <h3 className="font-black text-blue-900 mb-4 flex items-center gap-2 uppercase tracking-widest text-xs"><Megaphone size={18}/> Pesan Promo / Blast</h3>
                                    <textarea className="w-full p-4 border border-blue-200 rounded-xl text-sm min-h-[200px] focus:ring-4 focus:ring-blue-50 transition-all font-medium" placeholder="Tulis pesan..." value={broadcastMessage} onChange={e => setBroadcastMessage(e.target.value)}/>
                                    <button onClick={() => showNotification("Fitur blast siap digunakan per unit.", "info")} className="w-full mt-6 bg-blue-600 text-white py-4 rounded-xl font-black shadow-xl hover:bg-blue-700 transition-all transform active:scale-95 flex items-center justify-center gap-2"><Zap size={20}/> SIAPKAN LINK WA</button>
                                </div>
                            </div>
                            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                                <div className="p-4 bg-gray-50 border-b flex flex-col md:flex-row justify-between gap-4">
                                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><Users size={18} className="text-indigo-500"/> Daftar Pelanggan</h3>
                                    <div className="flex gap-2"><input type="text" placeholder="Filter Model..." value={filterModel} onChange={e => setFilterModel(e.target.value)} className="p-2 border rounded-lg text-xs w-32"/><input type="text" placeholder="Tahun..." value={filterYear} onChange={e => setFilterYear(e.target.value)} className="p-2 border rounded-lg text-xs w-20"/></div>
                                </div>
                                <div className="max-h-[400px] overflow-y-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-100 text-gray-500 uppercase text-[10px] font-black sticky top-0"><tr><th className="px-4 py-3 w-10 text-center"><button onClick={toggleAllRecipients}><Square size={16}/></button></th><th className="px-4 py-3">Nama / Mobil</th><th className="px-4 py-3 text-center">Aksi</th></tr></thead>
                                        <tbody className="divide-y">{broadcastCandidates.map(job => (
                                            <tr key={job.id} className={`hover:bg-gray-50 ${selectedRecipients.includes(job.id) ? 'bg-indigo-50' : ''}`}><td className="px-4 py-3 text-center"><button onClick={() => toggleRecipient(job.id)}>{selectedRecipients.includes(job.id) ? <CheckSquare size={16} className="text-indigo-600"/> : <Square size={16}/>}</button></td><td className="px-4 py-3"><div className="font-bold text-gray-900">{job.customerName}</div><div className="text-[10px] text-indigo-600 font-bold uppercase">{job.carModel} - {job.policeNumber}</div></td><td className="px-4 py-3 text-center"><button onClick={() => handleSingleAction(job, 'promo')} title="Kirim Pesan Promo WA Personal" className="p-2 text-green-600 hover:bg-green-50 rounded-full"><Send size={16}/></button></td></tr>
                                        ))}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="animate-fade-in">
                        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                            <Search className="text-gray-400" size={20}/><input type="text" placeholder="Cari..." className="w-full bg-transparent outline-none font-medium" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-black"><tr><th className="px-6 py-4">Tgl Follow Up</th><th className="px-6 py-4">Pelanggan / Unit</th><th className="px-6 py-4 text-center">Indeks CSI</th><th className="px-6 py-4 text-center">Aksi</th></tr></thead>
                                <tbody className="divide-y divide-gray-100">{historyJobs.map(job => (
                                    <tr key={job.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-gray-500 font-medium">{formatDateIndo(job.crcFollowUpDate)}<div className="text-[10px] font-black text-indigo-400 uppercase">{job.crcFollowUpStatus}</div></td>
                                        <td className="px-6 py-4"><div><div className="font-bold text-gray-900">{job.customerName}</div><div className="text-xs text-gray-500">{job.policeNumber} - {job.carModel}</div></div></td>
                                        <td className="px-6 py-4 text-center"><div className="flex flex-col items-center"><div className="text-xs font-black text-yellow-600">{job.customerRating || 0} / 5</div><div className="flex gap-0.5 text-yellow-400">{[...Array(5)].map((_, i) => (<Star key={i} size={10} fill={i < Math.floor(job.customerRating || 0) ? "currentColor" : "none"} stroke="currentColor"/>))}</div></div></td>
                                        <td className="px-6 py-4 text-center"><button onClick={() => handleOpenFeedback(job)} title="Lihat Detail Survey CSI" className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-full"><ClipboardCheck size={16}/></button></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* BOOKING MODAL */}
        <Modal isOpen={bookingModal.isOpen} onClose={() => !isUpdating && setBookingModal({ isOpen: false, job: null })} title="Penetapan Jadwal Booking">
            <div className="space-y-6">
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-sm"><Calendar size={24}/></div>
                    <div><h4 className="font-black text-gray-900 leading-none">{bookingModal.job?.policeNumber}</h4><p className="text-sm text-gray-500 mt-1">{bookingModal.job?.customerName} | {bookingModal.job?.carModel}</p></div>
                </div>
                <div className="space-y-2"><label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Pilih Tanggal Rencana Masuk *</label><input type="date" required className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl text-lg font-black text-indigo-900 outline-none" value={bookingDateInput} onChange={e => setBookingDateInput(e.target.value)}/></div>
                <div className="pt-4 flex gap-3"><button onClick={() => setBookingModal({ isOpen: false, job: null })} disabled={isUpdating} className="flex-1 py-3 text-gray-400 font-bold hover:text-gray-600 transition-colors">BATAL</button><button onClick={executeBookingProcess} disabled={isUpdating || !bookingDateInput} className="flex-[2] flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all transform active:scale-95 disabled:opacity-50">{isUpdating ? <Loader2 size={20} className="animate-spin"/> : <><Save size={20}/> SIMPAN & KIRIM WA</>}</button></div>
            </div>
        </Modal>

        {/* PICKUP MODAL */}
        <Modal isOpen={pickupModal.isOpen} onClose={() => !isUpdating && setPickupModal({ isOpen: false, job: null })} title="Konfirmasi Jadwal Pengambilan">
            <div className="space-y-6">
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm"><Clock size={24}/></div>
                    <div><h4 className="font-black text-gray-900 leading-none">{pickupModal.job?.policeNumber}</h4><p className="text-sm text-gray-500 mt-1">Status: Siap Ambil</p></div>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 text-xs text-amber-800 font-bold flex items-center gap-2">
                    <AlertCircle size={16}/>
                    Tanggal ini akan digunakan sebagai target KPI (Tepat Waktu/Tidak).
                </div>
                <div className="space-y-2"><label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Customer Berjanji Datang Tanggal *</label><input type="date" required className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-emerald-500 focus:bg-white rounded-2xl text-lg font-black text-emerald-900 outline-none" value={pickupDateInput} onChange={e => setPickupDateInput(e.target.value)}/></div>
                <div className="pt-4 flex gap-3"><button onClick={() => setPickupModal({ isOpen: false, job: null })} disabled={isUpdating} className="flex-1 py-3 text-gray-400 font-bold hover:text-gray-600 transition-colors">BATAL</button><button onClick={executePickupProcess} disabled={isUpdating || !pickupDateInput} className="flex-[2] flex items-center justify-center gap-2 bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-xl hover:bg-emerald-700 transition-all transform active:scale-95 disabled:opacity-50">{isUpdating ? <Loader2 size={20} className="animate-spin"/> : <><Send size={20}/> SIMPAN & BUKA WA</>}</button></div>
            </div>
        </Modal>

        {/* SURVEY CSI MODAL (OVERLAY FORM) */}
        <Modal isOpen={feedbackModal.isOpen} onClose={() => setFeedbackModal({ isOpen: false, job: null })} title="Point Survey Kepuasan Pelanggan (CSI)" maxWidth="max-w-3xl">
            <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-4"><div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-400 border border-gray-100 shadow-sm"><User size={20}/></div><div><p className="font-black text-gray-900 leading-tight">{feedbackModal.job?.customerName}</p><p className="text-xs text-gray-500">{feedbackModal.job?.policeNumber}</p></div></div>
                    <div className="flex gap-2"><button onClick={() => setFollowUpStatus('Contacted')} className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${followUpStatus === 'Contacted' ? 'bg-green-600 text-white' : 'bg-white text-gray-400 border-gray-200'}`}>Tersambung</button><button onClick={() => setFollowUpStatus('Unreachable')} className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${followUpStatus === 'Unreachable' ? 'bg-red-600 text-white' : 'bg-white text-gray-400 border-gray-200'}`}>Gagal Hubungi</button></div>
                </div>
                {followUpStatus === 'Contacted' && (
                    <div className="animate-fade-in space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {settings.csiIndicators.map((indicator, idx) => (
                                <div key={idx} className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex flex-col gap-3">
                                    <p className="text-xs font-black text-gray-800 uppercase tracking-tight">{indicator}</p>
                                    <div className="flex gap-2 justify-center bg-white py-2 rounded-lg border border-indigo-50">
                                        {[1, 2, 3, 4, 5].map(star => (<button key={star} onClick={() => setCsiRatings(prev => ({ ...prev, [indicator]: star }))} className="transition-transform hover:scale-125">{star <= (csiRatings[indicator] || 0) ? <Star size={24} className="text-yellow-400 fill-yellow-400"/> : <Star size={24} className="text-gray-200"/>}</button>))}
                                    </div>
                                </div>
                            ))}
                            {settings.csiIndicators.length === 0 && <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300 col-span-2"><AlertCircle size={24} className="mx-auto text-gray-300 mb-2"/><p className="text-xs text-gray-400">Belum ada indikator survey yang diatur.</p></div>}
                        </div>
                        <div className="space-y-2"><label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Komentar / Feedback Pelanggan</label><textarea value={feedbackNotes} onChange={e => setFeedbackNotes(e.target.value)} rows={3} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm" placeholder="Saran atau keluhan..."/></div>
                    </div>
                )}
                <div className="pt-4 border-t flex gap-3"><button onClick={() => setFeedbackModal({ isOpen: false, job: null })} className="flex-1 py-3 text-gray-400 font-bold hover:text-gray-600 transition-colors">BATAL</button><button onClick={handleSaveFeedback} title="Simpan hasil survey & CSI ke riwayat" className="flex-[2] bg-indigo-600 text-white py-3 rounded-xl font-black shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"><Save size={20}/> SIMPAN HASIL SURVEY</button></div>
            </div>
        </Modal>
    </div>
  );
};

export default CrcDashboardView;