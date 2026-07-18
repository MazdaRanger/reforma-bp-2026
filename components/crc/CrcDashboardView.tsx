import React, { useState, useMemo } from 'react';
import { Job, Settings, InventoryItem } from '../../types';
import { formatDateIndo, formatCurrency, formatWaNumber, cleanObject } from '../../utils/helpers';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
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
        ready_title: "DAFTAR UNIT SELESAI PERBAIKAN",
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
        ready_title: "COMPLETED VEHICLE LIST",
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

  const [feedbackModal, setFeedbackModal] = useState<{ isOpen: boolean, job: Job | null }>({ isOpen: false, job: null });
  const [csiRatings, setCsiRatings] = useState<Record<string, number>>({});
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [followUpStatus, setFollowUpStatus] = useState<'Contacted' | 'Unreachable'>('Contacted');

  const [bookingModal, setBookingModal] = useState<{ isOpen: boolean, job: Job | null }>({ isOpen: false, job: null });
  const [bookingDateInput, setBookingDateInput] = useState('');
  
  const [pickupModal, setPickupModal] = useState<{ isOpen: boolean, job: Job | null }>({ isOpen: false, job: null });
  const [pickupDateInput, setPickupDateInput] = useState('');

  const [isUpdating, setIsUpdating] = useState(false);

  const [broadcastMessage, setBroadcastMessage] = useState(settings.whatsappTemplates?.promoBroadcast || 'Halo Bpk/Ibu {nama}, kami memiliki promo spesial untuk pemilik {mobil} di Mazda Ranger. Hubungi kami segera untuk info lebih lanjut!');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState('');
  const [filterModel, setFilterModel] = useState('');

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
      
      let message = template
        .replace(/{nama}/g, job.customerName)
        .replace(/{mobil}/g, job.carModel)
        .replace(/{nopol}/g, job.policeNumber)
        .replace(/{tgl_booking}/g, displayDate);

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
              isBookingContacted: true, 
              bookingSuccess: false, 
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
          
          await updateDoc(jobRef, {
              pickupPromiseDate: pickupDateInput,
              isPickupContacted: true,
              updatedAt: serverTimestamp()
          });

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
          setPickupModal({ isOpen: true, job });
          setPickupDateInput(new Date().toISOString().split('T')[0]); 
          return;
      }

      if (type === 'followup') {
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
    <div className="animate-fade-in pb-[48px]">
        {/* HEADER */}
        <div className="border-b border-hairline pb-[24px] mb-[48px]">
            <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">CUSTOMER CARE</h1>
            <p className="text-[16px] text-mute font-normal mt-[18px]">Mode WhatsApp: <span className="font-medium text-ink border border-ink px-2 py-1 text-[12px] uppercase tracking-widest">{isApiMode ? 'GATEWAY API (BOT)' : 'PERSONAL (MANUAL)'}</span></p>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-[24px] mb-[48px]">
            <div className="bg-canvas border border-hairline p-6 hover:bg-soft-cloud transition-colors rounded-2xl overflow-hidden">
                <p className="text-[12px] font-medium text-mute uppercase tracking-widest mb-4">{t('stats_ready')}</p>
                <h2 className="text-[40px] font-display text-ink leading-none">{readyPickupJobs.length}</h2>
            </div>
            <div className="bg-canvas border border-hairline p-6 hover:bg-soft-cloud transition-colors rounded-2xl overflow-hidden">
                <p className="text-[12px] font-medium text-mute uppercase tracking-widest mb-4">Potensi Booking</p>
                <h2 className="text-[40px] font-display text-ink leading-none">{bookingJobs.length}</h2>
            </div>
            <div className="bg-canvas border border-hairline p-6 hover:bg-soft-cloud transition-colors rounded-2xl overflow-hidden">
                <p className="text-[12px] font-medium text-mute uppercase tracking-widest mb-4">Perlu Follow Up</p>
                <h2 className="text-[40px] font-display text-ink leading-none">{followUpJobs.length}</h2>
            </div>
            <div className="bg-canvas border border-hairline p-6 hover:bg-soft-cloud transition-colors rounded-2xl overflow-hidden">
                <p className="text-[12px] font-medium text-mute uppercase tracking-widest mb-4">Avg. Rating (CSI)</p>
                <h2 className="text-[40px] font-display text-ink leading-none">{avgRating} / 5</h2>
            </div>
        </div>

        {/* TABS */}
        <div className="flex overflow-x-auto gap-6 border-b border-hairline mb-[48px] pb-4 scrollbar-hide">
            <button onClick={() => setActiveTab('ready')} className={`text-[14px] font-medium uppercase tracking-widest transition-colors whitespace-nowrap ${activeTab === 'ready' ? 'text-ink border-b-2 border-ink' : 'text-mute hover:text-ink'}`}>{t('tab_ready')}</button>
            <button onClick={() => setActiveTab('booking')} className={`text-[14px] font-medium uppercase tracking-widest transition-colors whitespace-nowrap ${activeTab === 'booking' ? 'text-ink border-b-2 border-ink' : 'text-mute hover:text-ink'}`}>{t('tab_booking')}</button>
            <button onClick={() => setActiveTab('followup')} className={`text-[14px] font-medium uppercase tracking-widest transition-colors whitespace-nowrap ${activeTab === 'followup' ? 'text-ink border-b-2 border-ink' : 'text-mute hover:text-ink'}`}>{t('tab_followup')}</button>
            <button onClick={() => setActiveTab('broadcast')} className={`text-[14px] font-medium uppercase tracking-widest transition-colors whitespace-nowrap ${activeTab === 'broadcast' ? 'text-ink border-b-2 border-ink' : 'text-mute hover:text-ink'}`}>{t('tab_broadcast')}</button>
            <button onClick={() => setActiveTab('history')} className={`text-[14px] font-medium uppercase tracking-widest transition-colors whitespace-nowrap ${activeTab === 'history' ? 'text-ink border-b-2 border-ink' : 'text-mute hover:text-ink'}`}>{t('tab_history')}</button>
        </div>

        <div className="min-h-[400px]">
            {/* SEARCH */}
            {activeTab !== 'broadcast' && (
                <div className="relative mb-[24px]">
                    <input 
                        type="text" 
                        placeholder="Search..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium uppercase text-[14px] text-ink"
                    />
                    <span className="absolute right-4 top-4 text-[12px] font-medium text-mute uppercase tracking-widest">SEARCH</span>
                </div>
            )}

            {/* READY FOR PICKUP */}
            {activeTab === 'ready' && (
                <div className="bg-canvas border border-hairline animate-fade-in rounded-2xl overflow-hidden">
                    <div className="p-6 bg-soft-cloud border-b border-hairline">
                        <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">{t('ready_title')}</h3>
                        <p className="text-[12px] text-mute uppercase tracking-widest mt-1">{t('ready_subtitle')}</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-canvas text-mute font-medium uppercase tracking-widest text-[10px] border-b border-hairline">
                                <tr>
                                    <th className="px-6 py-4 font-normal">Unit / Pelanggan</th>
                                    <th className="px-6 py-4 font-normal">SA Penanggungjawab</th>
                                    <th className="px-6 py-4 text-center font-normal">Waktu Selesai</th>
                                    <th className="px-6 py-4 text-center font-normal">Aksi CRC</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-hairline">
                                {readyPickupJobs.map(job => (
                                    <tr key={job.id} className="hover:bg-soft-cloud transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="text-[14px] font-medium text-ink">{job.policeNumber}</div>
                                            <div className="text-[10px] text-mute uppercase tracking-widest mt-1">{job.customerName} | {job.carModel}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-[14px] font-medium text-ink">{job.namaSA || '-'}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="text-[12px] text-ink">{formatDateIndo(job.updatedAt)}</div>
                                            <div className="text-[10px] text-mute uppercase tracking-widest mt-1 border border-mute inline-block px-2 py-0.5">SIAP DIAMBIL</div>
                                            {job.pickupPromiseDate && <div className="text-[10px] text-ink font-medium mt-1">Janji: {formatDateIndo(job.pickupPromiseDate)}</div>}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button 
                                                onClick={() => handleSingleAction(job, 'ready')}
                                                className="bg-canvas border border-ink text-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest hover:bg-ink hover:text-canvas transition-colors"
                                            >
                                                {t('btn_wa_ready')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {readyPickupJobs.length === 0 && (
                                    <tr><td colSpan={4} className="py-12 text-center text-mute text-[12px] uppercase tracking-widest">Belum ada unit yang baru selesai perbaikan.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* BOOKING */}
            {activeTab === 'booking' && (
                <div className="bg-canvas border border-hairline animate-fade-in rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-canvas text-mute font-medium uppercase tracking-widest text-[10px] border-b border-hairline">
                                <tr>
                                    <th className="px-6 py-4 font-normal">Tgl Rencana</th>
                                    <th className="px-6 py-4 font-normal">Pelanggan</th>
                                    <th className="px-6 py-4 font-normal">Kendaraan</th>
                                    <th className="px-6 py-4 font-normal">Status</th>
                                    <th className="px-6 py-4 text-center font-normal">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-hairline">
                                {bookingJobs.map((job: any) => (
                                    <tr key={job.id} className="hover:bg-soft-cloud transition-colors">
                                        <td className="px-6 py-4 text-[14px] font-medium text-ink">{job.tanggalBooking ? formatDateIndo(job.tanggalBooking) : '-'}</td>
                                        <td className="px-6 py-4">
                                            <div className="text-[14px] font-medium text-ink">{job.customerName}</div>
                                            <div className="text-[12px] text-mute">{job.customerPhone}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-[14px] font-medium text-ink">{job.policeNumber}</div>
                                            <div className="text-[12px] text-mute flex items-center gap-2">
                                                {job.carModel}
                                                {job.isRawatJalan && <span className="text-[8px] bg-ink text-canvas px-1 py-0.5 uppercase tracking-widest">RAWAT JALAN</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {job.isPartReady ? <span className="text-[10px] font-medium text-ink border border-ink px-2 py-1 uppercase tracking-widest">Part Ready</span> : <span className="text-[10px] font-medium text-mute border border-mute px-2 py-1 uppercase tracking-widest">Waiting Part</span>}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button 
                                                onClick={() => handleSingleAction(job, 'booking')} 
                                                className="bg-canvas border border-ink text-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest hover:bg-ink hover:text-canvas transition-colors"
                                            >
                                                WA REMINDER
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {bookingJobs.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-mute text-[12px] uppercase tracking-widest">Tidak ada potensi booking.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* FOLLOW UP */}
            {activeTab === 'followup' && (
                <div className="bg-canvas border border-hairline animate-fade-in rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-canvas text-mute font-medium uppercase tracking-widest text-[10px] border-b border-hairline">
                                <tr>
                                    <th className="px-6 py-4 font-normal">Tgl Selesai</th>
                                    <th className="px-6 py-4 font-normal">Pelanggan</th>
                                    <th className="px-6 py-4 font-normal">Kendaraan</th>
                                    <th className="px-6 py-4 text-center font-normal">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-hairline">
                                {followUpJobs.map(job => (
                                    <tr key={job.id} className="hover:bg-soft-cloud transition-colors">
                                        <td className="px-6 py-4 text-[14px] text-ink">
                                            {job.closedAt ? formatDateIndo(job.closedAt) : (job.updatedAt ? formatDateIndo(job.updatedAt) : '-')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-[14px] font-medium text-ink">{job.customerName}</div>
                                            <div className="text-[12px] text-mute">{job.customerPhone}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-[14px] font-medium text-ink">{job.policeNumber}</div>
                                            <div className="text-[12px] text-mute">{job.carModel}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button 
                                                    onClick={() => handleSingleAction(job, 'followup')} 
                                                    className="border border-ink text-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest hover:bg-ink hover:text-canvas transition-colors"
                                                >
                                                    WA FOLLOW UP
                                                </button>
                                                <button 
                                                    onClick={() => handleOpenFeedback(job)} 
                                                    className="border border-ink text-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest hover:bg-ink hover:text-canvas transition-colors"
                                                >
                                                    INPUT CSI
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {followUpJobs.length === 0 && <tr><td colSpan={4} className="py-12 text-center text-mute text-[12px] uppercase tracking-widest">Tidak ada antrean follow up.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* BROADCAST */}
            {activeTab === 'broadcast' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-[24px] animate-fade-in">
                    <div className="lg:col-span-1 space-y-[24px]">
                        <div className="bg-canvas border border-hairline p-6 md:p-8 rounded-2xl overflow-hidden">
                            <h3 className="font-medium text-ink uppercase tracking-widest text-[16px] mb-4 border-b border-hairline pb-4">Pesan Promo / Blast</h3>
                            <textarea 
                                className="w-full p-4 border border-hairline bg-soft-cloud text-[14px] text-ink focus:outline-none focus:border-ink min-h-[200px]" 
                                placeholder="Tulis pesan..." 
                                value={broadcastMessage} 
                                onChange={e => setBroadcastMessage(e.target.value)}
                            />
                            <button 
                                onClick={() => showNotification("Fitur blast siap digunakan per unit.", "info")} 
                                className="w-full mt-6 bg-ink text-canvas py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors"
                            >
                                SIAPKAN LINK WA
                            </button>
                        </div>
                    </div>
                    
                    <div className="lg:col-span-2 bg-canvas border border-hairline flex flex-col rounded-2xl overflow-hidden">
                        <div className="p-6 bg-soft-cloud border-b border-hairline flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">Daftar Pelanggan</h3>
                            <div className="flex gap-2">
                                <input type="text" placeholder="Filter Model..." value={filterModel} onChange={e => setFilterModel(e.target.value)} className="p-2 border border-hairline bg-canvas text-[12px] uppercase w-32 focus:outline-none focus:border-ink"/>
                                <input type="text" placeholder="Tahun..." value={filterYear} onChange={e => setFilterYear(e.target.value)} className="p-2 border border-hairline bg-canvas text-[12px] uppercase w-20 focus:outline-none focus:border-ink"/>
                            </div>
                        </div>
                        <div className="max-h-[500px] overflow-y-auto">
                            <table className="w-full text-left">
                                <thead className="bg-canvas text-mute font-medium uppercase tracking-widest text-[10px] sticky top-0 border-b border-hairline">
                                    <tr>
                                        <th className="px-6 py-4 w-10 text-center font-normal">
                                            <button onClick={toggleAllRecipients} className="uppercase hover:text-ink">{selectedRecipients.length === broadcastCandidates.length && broadcastCandidates.length > 0 ? 'ALL' : 'NONE'}</button>
                                        </th>
                                        <th className="px-6 py-4 font-normal">Nama / Mobil</th>
                                        <th className="px-6 py-4 text-center font-normal">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-hairline">
                                    {broadcastCandidates.map(job => (
                                        <tr key={job.id} className={`hover:bg-soft-cloud transition-colors ${selectedRecipients.includes(job.id) ? 'bg-soft-cloud' : ''}`}>
                                            <td className="px-6 py-4 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedRecipients.includes(job.id)} 
                                                    onChange={() => toggleRecipient(job.id)}
                                                    className="w-4 h-4 accent-ink"
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-[14px] font-medium text-ink">{job.customerName}</div>
                                                <div className="text-[10px] text-mute mt-1 uppercase tracking-widest">{job.carModel} - {job.policeNumber}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button 
                                                    onClick={() => handleSingleAction(job, 'promo')} 
                                                    className="bg-canvas border border-ink text-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest hover:bg-ink hover:text-canvas transition-colors"
                                                >
                                                    KIRIM
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {broadcastCandidates.length === 0 && <tr><td colSpan={3} className="py-12 text-center text-mute text-[12px] uppercase tracking-widest">Tidak ada pelanggan.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* HISTORY */}
            {activeTab === 'history' && (
                <div className="bg-canvas border border-hairline animate-fade-in rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-canvas text-mute font-medium uppercase tracking-widest text-[10px] border-b border-hairline">
                                <tr>
                                    <th className="px-6 py-4 font-normal">Tgl Follow Up</th>
                                    <th className="px-6 py-4 font-normal">Pelanggan / Unit</th>
                                    <th className="px-6 py-4 text-center font-normal">Indeks CSI</th>
                                    <th className="px-6 py-4 text-center font-normal">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-hairline">
                                {historyJobs.map(job => (
                                    <tr key={job.id} className="hover:bg-soft-cloud transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="text-[14px] text-ink">{formatDateIndo(job.crcFollowUpDate)}</div>
                                            <div className="text-[10px] font-medium text-mute uppercase tracking-widest mt-1 border border-hairline inline-block px-1 py-0.5">{job.crcFollowUpStatus}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-[14px] font-medium text-ink">{job.customerName}</div>
                                            <div className="text-[12px] text-mute">{job.policeNumber} - {job.carModel}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="text-[14px] font-medium text-ink">{job.customerRating || 0} / 5</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button 
                                                onClick={() => handleOpenFeedback(job)} 
                                                className="border border-ink text-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest hover:bg-ink hover:text-canvas transition-colors"
                                            >
                                                DETAIL
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {historyJobs.length === 0 && <tr><td colSpan={4} className="py-12 text-center text-mute text-[12px] uppercase tracking-widest">Belum ada riwayat.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>

        {/* BOOKING MODAL */}
        <Modal isOpen={bookingModal.isOpen} onClose={() => !isUpdating && setBookingModal({ isOpen: false, job: null })} title="PENETAPAN JADWAL BOOKING">
            <div className="space-y-6">
                <div className="bg-soft-cloud p-6 border border-hairline">
                    <h4 className="font-display text-[24px] text-ink leading-none uppercase">{bookingModal.job?.policeNumber}</h4>
                    <p className="text-[12px] text-mute mt-2">{bookingModal.job?.customerName} | {bookingModal.job?.carModel}</p>
                </div>
                <div>
                    <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Pilih Tanggal Rencana Masuk</label>
                    <input 
                        type="date" 
                        required 
                        className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase"
                        value={bookingDateInput} 
                        onChange={e => setBookingDateInput(e.target.value)}
                    />
                </div>
                <div className="pt-4 flex gap-4 border-t border-hairline">
                    <button onClick={() => setBookingModal({ isOpen: false, job: null })} disabled={isUpdating} className="flex-1 py-4 text-[12px] font-medium text-ink uppercase tracking-widest border border-ink hover:bg-soft-cloud transition-colors">BATAL</button>
                    <button onClick={executeBookingProcess} disabled={isUpdating || !bookingDateInput} className="flex-1 py-4 text-[12px] font-medium text-canvas bg-ink uppercase tracking-widest hover:bg-mute transition-colors disabled:opacity-50">
                        {isUpdating ? 'PROCESSING...' : 'SIMPAN & KIRIM WA'}
                    </button>
                </div>
            </div>
        </Modal>

        {/* PICKUP MODAL */}
        <Modal isOpen={pickupModal.isOpen} onClose={() => !isUpdating && setPickupModal({ isOpen: false, job: null })} title="KONFIRMASI JADWAL PENGAMBILAN">
            <div className="space-y-6">
                <div className="bg-soft-cloud p-6 border border-hairline">
                    <h4 className="font-display text-[24px] text-ink leading-none uppercase">{pickupModal.job?.policeNumber}</h4>
                    <p className="text-[12px] text-mute mt-2 uppercase tracking-widest">Status: Siap Ambil</p>
                </div>
                <div className="p-4 bg-canvas border border-ink text-ink text-[12px] font-medium uppercase tracking-widest">
                    Tanggal ini akan digunakan sebagai target KPI (Tepat Waktu/Tidak).
                </div>
                <div>
                    <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Customer Berjanji Datang Tanggal</label>
                    <input 
                        type="date" 
                        required 
                        className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase"
                        value={pickupDateInput} 
                        onChange={e => setPickupDateInput(e.target.value)}
                    />
                </div>
                <div className="pt-4 flex gap-4 border-t border-hairline">
                    <button onClick={() => setPickupModal({ isOpen: false, job: null })} disabled={isUpdating} className="flex-1 py-4 text-[12px] font-medium text-ink uppercase tracking-widest border border-ink hover:bg-soft-cloud transition-colors">BATAL</button>
                    <button onClick={executePickupProcess} disabled={isUpdating || !pickupDateInput} className="flex-1 py-4 text-[12px] font-medium text-canvas bg-ink uppercase tracking-widest hover:bg-mute transition-colors disabled:opacity-50">
                        {isUpdating ? 'PROCESSING...' : 'SIMPAN & BUKA WA'}
                    </button>
                </div>
            </div>
        </Modal>

        {/* SURVEY CSI MODAL */}
        <Modal isOpen={feedbackModal.isOpen} onClose={() => setFeedbackModal({ isOpen: false, job: null })} title="SURVEY KEPUASAN PELANGGAN (CSI)" maxWidth="max-w-3xl">
            <div className="space-y-6">
                <div className="bg-soft-cloud p-6 border border-hairline flex items-center justify-between">
                    <div>
                        <p className="font-display text-[24px] text-ink uppercase leading-none">{feedbackModal.job?.customerName}</p>
                        <p className="text-[12px] text-mute mt-2 uppercase tracking-widest">{feedbackModal.job?.policeNumber}</p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setFollowUpStatus('Contacted')} 
                            className={`px-4 py-2 text-[10px] font-medium uppercase tracking-widest border transition-colors ${followUpStatus === 'Contacted' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-mute border-hairline hover:text-ink'}`}
                        >
                            Tersambung
                        </button>
                        <button 
                            onClick={() => setFollowUpStatus('Unreachable')} 
                            className={`px-4 py-2 text-[10px] font-medium uppercase tracking-widest border transition-colors ${followUpStatus === 'Unreachable' ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-mute border-hairline hover:text-ink'}`}
                        >
                            Gagal Hubungi
                        </button>
                    </div>
                </div>
                
                {followUpStatus === 'Contacted' && (
                    <div className="animate-fade-in space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {settings.csiIndicators.map((indicator, idx) => (
                                <div key={idx} className="bg-canvas p-4 border border-hairline flex flex-col gap-4 rounded-2xl overflow-hidden">
                                    <p className="text-[12px] font-medium text-ink uppercase tracking-widest">{indicator}</p>
                                    <div className="flex gap-2">
                                        {[1, 2, 3, 4, 5].map(val => (
                                            <button 
                                                key={val} 
                                                onClick={() => setCsiRatings(prev => ({ ...prev, [indicator]: val }))} 
                                                className={`flex-1 py-2 border text-[12px] font-medium transition-colors ${val <= (csiRatings[indicator] || 0) ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-mute border-hairline hover:text-ink'}`}
                                            >
                                                {val}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {settings.csiIndicators.length === 0 && (
                                <div className="p-8 text-center border border-hairline border-dashed col-span-2">
                                    <p className="text-[12px] text-mute uppercase tracking-widest">Belum ada indikator survey yang diatur.</p>
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Komentar / Feedback</label>
                            <textarea 
                                value={feedbackNotes} 
                                onChange={e => setFeedbackNotes(e.target.value)} 
                                rows={3} 
                                className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] text-ink" 
                                placeholder="Saran atau keluhan..."
                            />
                        </div>
                    </div>
                )}
                
                <div className="pt-6 border-t border-hairline flex gap-4">
                    <button onClick={() => setFeedbackModal({ isOpen: false, job: null })} className="flex-1 py-4 text-[12px] font-medium text-ink uppercase tracking-widest border border-ink hover:bg-soft-cloud transition-colors">BATAL</button>
                    <button onClick={handleSaveFeedback} className="flex-1 py-4 text-[12px] font-medium text-canvas bg-ink uppercase tracking-widest hover:bg-mute transition-colors">
                        SIMPAN HASIL SURVEY
                    </button>
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default CrcDashboardView;