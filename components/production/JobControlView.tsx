import React, { useState, useMemo } from 'react';
import { Job, Settings, UserPermissions, MechanicAssignment, InventoryItem } from '../../types';
import { doc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { formatPoliceNumber, formatDateIndo, formatCurrency } from '../../utils/helpers';
import { 
    Hammer, Clock, CheckCircle, User, 
    Calendar, ChevronRight, Search, Wrench, BarChart2, MessageSquare, Info, AlertCircle, PackageSearch, CheckCircle2, Crown, Timer, CalendarClock, CalendarDays, Save, X, Layers, History
} from 'lucide-react';
import Modal from '../ui/Modal';

interface JobControlViewProps {
  jobs: Job[];
  settings: Settings;
  showNotification: (msg: string, type: string) => void;
  userPermissions: UserPermissions;
  inventoryItems: InventoryItem[];
}

const STAGES = [
    "Persiapan Kendaraan",
    "Bongkar",
    "Las Ketok",
    "Dempul",
    "Cat",
    "Pemasangan",
    "Poles",
    "Finishing",
    "Quality Control",
    "Selesai (Tunggu Pengambilan)" 
];

const ADMIN_HURDLE_STATUSES = [
    "Banding Harga SPK",
    "Tunggu Part",
    "Unit di Pemilik (Tunggu Part)",
    "Tunggu SPK Asuransi",
    "Tunggu Estimasi",
    "Booking Masuk"
];

const JobControlView: React.FC<JobControlViewProps> = ({ jobs, settings, showNotification, userPermissions, inventoryItems }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [assigningJobId, setAssigningJobId] = useState<string | null>(null);
  const [showProductivityReport, setShowProductivityReport] = useState(false);
  const [viewHistoryJob, setViewHistoryJob] = useState<Job | null>(null);

  // Report Filter State
  const [reportStartDate, setReportStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split('T')[0]);

  // --- MODAL STATE FOR DATES ---
  const [scheduleModal, setScheduleModal] = useState<{
      isOpen: boolean;
      job: Job | null;
      targetStage?: string; 
      startDate: string;
      endDate: string;
  }>({ isOpen: false, job: null, startDate: '', endDate: '' });

  const activeProductionJobs = useMemo(() => {
      const term = searchTerm.toUpperCase();
      return jobs.filter(j => 
          !j.isClosed && j.woNumber && !j.isDeleted && 
          (j.posisiKendaraan === 'Di Bengkel' || (j.posisiKendaraan === 'Di Pemilik' && ADMIN_HURDLE_STATUSES.includes(j.statusKendaraan))) &&
          (
            j.statusKendaraan === 'Work In Progress' || 
            j.statusKendaraan === 'Unit Rawat Jalan' || 
            j.statusKendaraan === 'Selesai (Tunggu Pengambilan)' || 
            ADMIN_HURDLE_STATUSES.includes(j.statusKendaraan)
          ) && 
          (j.policeNumber.includes(term) || j.carModel.toUpperCase().includes(term) || j.customerName.toUpperCase().includes(term))
      );
  }, [jobs, searchTerm]);

  // Virtual Stock Map
  const stockMap = useMemo(() => {
      const map: Record<string, number> = {};
      inventoryItems.forEach(i => map[i.id] = i.stock);
      return map;
  }, [inventoryItems]);

  const getPartStatus = (job: Job) => {
      const parts = job.estimateData?.partItems || [];
      if (parts.length === 0) return null; 

      let readyCount = 0;
      let onOrderCount = 0;
      let indentCount = 0;
      const tempStock = { ...stockMap };

      parts.forEach(p => {
          if (p.hasArrived) {
              readyCount++;
          } else if (p.inventoryId && tempStock[p.inventoryId] >= (p.qty || 1)) {
              readyCount++;
              tempStock[p.inventoryId] -= (p.qty || 1); 
          } else if (p.isOrdered) {
              onOrderCount++;
              if (p.isIndent) indentCount++;
          }
      });

      if (readyCount === parts.length) return { label: 'PART READY', color: 'bg-emerald-100 text-emerald-700' };
      if (readyCount > 0) return { label: 'PARTIAL READY', color: 'bg-blue-100 text-blue-700' };
      if (indentCount > 0) return { label: 'PART INDENT', color: 'bg-red-100 text-red-700' };
      if (onOrderCount > 0) return { label: 'ON ORDER', color: 'bg-orange-100 text-orange-700' };
      return { label: 'NEED ORDER', color: 'bg-gray-100 text-gray-600' };
  };

  const boardData = useMemo(() => {
      const columns: Record<string, Job[]> = {};
      STAGES.forEach(s => columns[s] = []);
      activeProductionJobs.forEach(job => {
          let status = ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan) ? "Persiapan Kendaraan" : (STAGES.includes(job.statusPekerjaan) ? job.statusPekerjaan : 'Bongkar');
          if (job.statusKendaraan === 'Selesai (Tunggu Pengambilan)') status = "Selesai (Tunggu Pengambilan)";
          if (columns[status]) columns[status].push(job);
      });
      return columns;
  }, [activeProductionJobs]);

  const mechanicWorkload = useMemo(() => {
      const workload: Record<string, number> = {};
      (settings.mechanicNames || []).forEach(m => workload[m] = 0);
      activeProductionJobs.forEach((j: Job) => {
          const currentPIC = j.assignedMechanics?.find(a => a.stage === (j.statusPekerjaan || 'Bongkar'))?.name;
          if (currentPIC && workload[currentPIC as string] !== undefined) workload[currentPIC as string]++;
      });
      return workload;
  }, [activeProductionJobs, settings]);

  const getJobProgress = (job: Job) => {
      let start: Date;
      try {
          if (job.actualStartDate) {
              start = new Date(job.actualStartDate);
          } else if (job.createdAt) {
              start = (job.createdAt as any).toDate ? (job.createdAt as any).toDate() : new Date(job.createdAt as any);
              if ((job.createdAt as any).seconds) start = new Date((job.createdAt as any).seconds * 1000);
          } else {
              start = new Date();
          }
      } catch (e) {
          start = new Date();
      }
      if (isNaN(start.getTime())) start = new Date();
      const now = new Date();
      const diffTime = now.getTime() - start.getTime();
      const daysRunning = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
      let daysRemaining = null;
      if (job.tanggalEstimasiSelesai) {
          const est = new Date(job.tanggalEstimasiSelesai);
          if (!isNaN(est.getTime())) {
              const remTime = est.getTime() - now.getTime();
              daysRemaining = Math.ceil(remTime / (1000 * 60 * 60 * 24));
          }
      }
      return { daysRunning: Math.max(0, daysRunning), daysRemaining };
  };

  const toggleVVIP = async (job: Job) => {
      if (!userPermissions.role.includes('Manager')) {
          showNotification("Hanya Manager bisa set status VVIP", "error");
          return;
      }
      const newStatus = !job.isVVIP;
      await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { isVVIP: newStatus });
      showNotification(newStatus ? "Unit diset VVIP (Prioritas)" : "Status VVIP dihapus", "success");
  };

  const openScheduleModal = (job: Job, targetStage?: string) => {
      const today = new Date().toISOString().split('T')[0];
      const currentStart = job.actualStartDate ? new Date(job.actualStartDate).toISOString().split('T')[0] : today;
      const currentEnd = job.tanggalEstimasiSelesai ? new Date(job.tanggalEstimasiSelesai).toISOString().split('T')[0] : '';
      setScheduleModal({ isOpen: true, job, targetStage, startDate: currentStart, endDate: currentEnd });
  };

  const handleSaveSchedule = async () => {
      if (!scheduleModal.job || !scheduleModal.startDate || !scheduleModal.endDate) {
          showNotification("Tanggal Mulai dan Estimasi Selesai wajib diisi.", "error");
          return;
      }
      try {
          const updatePayload: any = {
              actualStartDate: new Date(scheduleModal.startDate).toISOString(),
              tanggalEstimasiSelesai: new Date(scheduleModal.endDate).toISOString(),
              updatedAt: serverTimestamp()
          };
          if (scheduleModal.targetStage) {
              updatePayload.statusPekerjaan = scheduleModal.targetStage;
              updatePayload.productionLogs = arrayUnion({ 
                  stage: scheduleModal.targetStage, 
                  timestamp: new Date().toISOString(), 
                  user: userPermissions.role, 
                  type: 'progress' 
              });
              
              if (scheduleModal.targetStage === 'Selesai (Tunggu Pengambilan)') {
                  updatePayload.statusKendaraan = 'Selesai (Tunggu Pengambilan)';
              } else {
                  updatePayload.statusKendaraan = 'Work In Progress';
                  updatePayload.posisiKendaraan = 'Di Bengkel'; 
              }
          }
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, scheduleModal.job.id), updatePayload);
          showNotification(scheduleModal.targetStage ? `Unit Masuk Produksi: ${scheduleModal.targetStage}` : "Jadwal Diperbarui", "success");
          setScheduleModal({ isOpen: false, job: null, startDate: '', endDate: '' });
      } catch (e: any) {
          showNotification("Gagal update: " + e.message, "error");
      }
  };

  const handleMoveStage = async (job: Job, direction: 'next' | 'prev') => {
      if (ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan) && direction === 'next') {
          if (!window.confirm(`Unit berstatus '${job.statusKendaraan}'. Mulai pengerjaan dan ubah ke Work In Progress?`)) return;
          openScheduleModal(job, 'Bongkar');
          return;
      }
      let currentIndex = STAGES.indexOf(job.statusPekerjaan);
      if (currentIndex === -1) currentIndex = 1; 
      let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      
      if (direction === 'next') {
          if (newIndex >= STAGES.length) { showNotification("Unit sudah di tahap akhir produksi.", "info"); return; }
          const newStage = STAGES[newIndex];
          const isFinalStage = newStage === "Selesai (Tunggu Pengambilan)";
          const confirmMsg = isFinalStage ? "Tandai perbaikan SELESAI? Unit akan diteruskan ke Tim CRC untuk memanggil pemilik." : `Pindahkan unit ke stall ${newStage}?`;
          if(!window.confirm(confirmMsg)) return;

          const updatePayload: any = { 
              statusPekerjaan: newStage, 
              statusKendaraan: isFinalStage ? 'Selesai (Tunggu Pengambilan)' : 'Work In Progress',
              productionLogs: arrayUnion({ stage: newStage, timestamp: new Date().toISOString(), user: userPermissions.role, type: 'progress' }), 
              updatedAt: serverTimestamp() 
          };
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), updatePayload);
          showNotification(isFinalStage ? "Unit Selesai & CRC Notified." : `Update: ${newStage}`, "success");
      } else if (direction === 'prev' && newIndex >= 0) {
          const reason = window.prompt(`Alasan re-work ke ${STAGES[newIndex]}:`);
          if (!reason) return;
          const newStage = STAGES[newIndex];
          const isFromFinal = job.statusKendaraan === "Selesai (Tunggu Pengambilan)";
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { 
              statusPekerjaan: newStage, 
              statusKendaraan: isFromFinal ? 'Work In Progress' : job.statusKendaraan,
              productionLogs: arrayUnion({ stage: newStage, timestamp: new Date().toISOString(), user: userPermissions.role, note: reason, type: 'rework' }), 
              updatedAt: serverTimestamp() 
          });
          showNotification(`Re-work: ${newStage}`, "info");
      }
  };

  const handleRequestAddition = async (job: Job) => {
      const detail = window.prompt("Detail Tambahan Estimasi:");
      if (!detail) return;
      await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { 
          statusKendaraan: 'Banding Harga SPK', 
          productionLogs: arrayUnion({ stage: job.statusPekerjaan || 'Bongkar', timestamp: new Date().toISOString(), user: userPermissions.role, note: `REQUEST TAMBAHAN: ${detail}`, type: 'rework' }), 
          updatedAt: serverTimestamp() 
      });
      showNotification("Request terkirim ke Admin. Unit dipindah ke Persiapan.", "success");
  };

  // --- NEW ASSIGNMENT LOGIC WITH PANEL COUNT ---
  const handleAssignMechanic = async (job: Job, mechanicName: string) => {
      let currentStage = ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan) ? "Persiapan Kendaraan" : (STAGES.includes(job.statusPekerjaan) ? job.statusPekerjaan : 'Bongkar');
      
      // Calculate total panels from Estimation for reference
      const totalPanelValue = job.estimateData?.jasaItems?.reduce((acc, item) => acc + (item.panelCount || 0), 0) || 0;
      
      // Prompt for Panel Count
      const inputPanel = prompt(`Masukkan jumlah panel yang dikerjakan oleh ${mechanicName} untuk tahap ${currentStage}?`, totalPanelValue.toString());
      if (inputPanel === null) return; // Cancelled
      const assignedPanels = parseFloat(inputPanel) || 0;

      const currentAssignments = [...(job.assignedMechanics || [])];
      const existingIdx = currentAssignments.findIndex(a => a.stage === currentStage);
      
      const assignment: MechanicAssignment = { 
          name: mechanicName, 
          stage: currentStage, 
          assignedAt: new Date().toISOString(),
          panelCount: assignedPanels // Save specific panel count
      };

      if (existingIdx >= 0) currentAssignments[existingIdx] = assignment;
      else currentAssignments.push(assignment);
      
      await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { assignedMechanics: currentAssignments, mechanicName });
      setAssigningJobId(null);
      showNotification(`Assigned ${mechanicName} (${assignedPanels} Panels).`, "success");
  };

  // --- REPORT AGGREGATION ---
  const aggregatedReport = useMemo(() => {
      const report: Record<string, { totalUnit: number, totalPanel: number, details: any[] }> = {};
      const start = new Date(reportStartDate);
      const end = new Date(reportEndDate);
      end.setHours(23, 59, 59);

      // Filter jobs: Closed or Active within range based on assignment date or closing date
      // For payroll, we usually look at completed jobs or assignments made in period
      // Let's iterate all jobs and check assignments within date range
      jobs.forEach(job => {
          if (!job.assignedMechanics) return;
          
          job.assignedMechanics.forEach(asg => {
              const assignDate = new Date(asg.assignedAt);
              if (assignDate >= start && assignDate <= end) {
                  if (!report[asg.name]) report[asg.name] = { totalUnit: 0, totalPanel: 0, details: [] };
                  
                  // Use specific panel count if available, else 0 (or fallback logic if needed)
                  const panels = asg.panelCount || 0; 
                  
                  report[asg.name].totalUnit++;
                  report[asg.name].totalPanel += panels;
                  report[asg.name].details.push({
                      date: asg.assignedAt,
                      nopol: job.policeNumber,
                      car: job.carModel,
                      stage: asg.stage,
                      panels: panels
                  });
              }
          });
      });
      return report;
  }, [jobs, reportStartDate, reportEndDate]);

  return (
    <div className="space-y-6 animate-fade-in pb-4 h-[calc(100vh-100px)] flex flex-col">
        {/* HEADER & FILTER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/80 backdrop-blur-lg p-4 rounded-xl border border-white/60 shadow-lg shadow-indigo-100/50 shrink-0">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-200 text-white"><Hammer size={24}/></div>
                <div><h1 className="text-2xl font-bold text-slate-800">Job Control Board</h1><p className="text-sm text-slate-500 font-medium">Monitoring Produksi & Gaji Mekanik</p></div>
            </div>
            <div className="flex items-center gap-3">
                <div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={18}/><input type="text" placeholder="Cari Unit / Nopol..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 w-64 shadow-sm"/></div>
                <button onClick={() => setShowProductivityReport(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-200"><BarChart2 size={16}/> Laporan Gaji (Panel)</button>
            </div>
        </div>

        {/* MECHANIC LOAD BAR */}
        <div className="flex gap-4 overflow-x-auto pb-2 shrink-0 scrollbar-thin">
            {(settings.mechanicNames || []).map(mech => (
                <div key={mech} className="bg-white/80 backdrop-blur-md px-3 py-2 rounded-xl border border-white/60 shadow-sm flex items-center gap-3 min-w-[150px]">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600"><User size={14}/></div>
                    <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Load Stall</p><p className="text-xs font-bold text-slate-800">{mech}</p></div>
                    <div className={`ml-auto px-2 py-0.5 rounded text-xs font-bold ${mechanicWorkload[mech] > 2 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{mechanicWorkload[mech] || 0}</div>
                </div>
            ))}
        </div>

        {/* KANBAN BOARD */}
        <div className="flex-grow overflow-x-auto pb-4">
            <div className="flex gap-4 h-full min-w-max px-2">
                {STAGES.map((stage) => {
                    const jobsInStage = boardData[stage] || [];
                    const isPersiapan = stage === "Persiapan Kendaraan";
                    const isFinal = stage === "Selesai (Tunggu Pengambilan)";
                    
                    return (
                        <div key={stage} className={`w-80 flex flex-col h-full rounded-2xl border border-white/40 shadow-inner ${isPersiapan ? 'bg-amber-50/50 backdrop-blur-sm' : isFinal ? 'bg-emerald-50/50 backdrop-blur-sm' : 'bg-slate-100/50 backdrop-blur-sm'}`}>
                            <div className="p-3 border-b border-slate-200/50 bg-white/60 rounded-t-2xl flex justify-between items-center sticky top-0 z-10 backdrop-blur-md">
                                <div className="flex items-center gap-2">
                                    {isPersiapan ? <PackageSearch size={16} className="text-amber-500"/> : isFinal ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Wrench size={16} className="text-slate-400"/>}
                                    <h3 className={`font-bold text-sm uppercase ${isPersiapan ? 'text-amber-700' : isFinal ? 'text-emerald-700' : 'text-slate-700'}`}>{stage}</h3>
                                </div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isFinal ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{jobsInStage.length}</span>
                            </div>
                            <div className="p-2 flex-grow overflow-y-auto space-y-3 scrollbar-thin">
                                {jobsInStage.map(job => {
                                    const isAdminPending = ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan);
                                    
                                    // Get Mechanic info specific to THIS stage if exists
                                    const stageAssignment = job.assignedMechanics?.find(a => a.stage === (isAdminPending ? 'Persiapan Kendaraan' : job.statusPekerjaan || 'Bongkar'));
                                    const currentPIC = stageAssignment?.name;
                                    const picPanels = stageAssignment?.panelCount;

                                    const { daysRunning, daysRemaining } = getJobProgress(job);
                                    const totalPanelValue = job.estimateData?.jasaItems?.reduce((acc, item) => acc + (item.panelCount || 0), 0) || 0;
                                    const partStatus = getPartStatus(job);
                                    
                                    return (
                                        <div key={job.id} className={`bg-white p-3 rounded-xl shadow-sm border-l-4 transition-all hover:shadow-lg hover:-translate-y-1 relative ${job.isVVIP ? 'border-l-yellow-400 ring-2 ring-yellow-200' : isAdminPending ? 'border-l-amber-500 ring-1 ring-amber-100' : isFinal ? 'border-l-emerald-500' : 'border-l-blue-500'}`}>
                                            {job.isVVIP && <div className="absolute -top-2 -right-2 bg-yellow-400 text-white p-1 rounded-full shadow-sm z-10"><Crown size={14} fill="currentColor"/></div>}
                                            
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-extrabold text-slate-800 text-sm tracking-tight">{job.policeNumber}</span>
                                                <div className="flex gap-1">
                                                    <button onClick={() => toggleVVIP(job)} className={`p-1 rounded transition-colors ${job.isVVIP ? 'text-yellow-500 bg-yellow-50' : 'text-slate-300 hover:text-yellow-500'}`} title="Set VVIP"><Crown size={14}/></button>
                                                    <button onClick={() => openScheduleModal(job)} className="p-1 hover:bg-slate-100 rounded transition-colors text-blue-600" title="Atur Jadwal"><CalendarDays size={14}/></button>
                                                    <button onClick={() => setViewHistoryJob(job)} className="p-1 hover:bg-slate-100 rounded transition-colors"><History size={14} className="text-slate-400"/></button>
                                                </div>
                                            </div>
                                            <p className="text-xs font-bold text-slate-500 mb-2 truncate uppercase">{job.carModel} | {job.customerName}</p>
                                            
                                            <div className="flex justify-between items-center text-xs text-slate-500 mb-2 border-b border-slate-100 pb-1">
                                                <div className="flex items-center gap-1"><User size={12}/> {job.namaSA || 'No SA'}</div>
                                                <div className="font-bold bg-slate-100 px-1.5 py-0.5 rounded">{totalPanelValue.toFixed(1)} Panels</div>
                                            </div>

                                            {/* Progress Indicators */}
                                            {!isAdminPending && !isFinal && (
                                                <div className="flex gap-2 my-2">
                                                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${daysRunning > 14 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                        <Timer size={12}/> {daysRunning} Hari Jalan
                                                    </div>
                                                    {daysRemaining !== null && (
                                                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${daysRemaining < 0 ? 'bg-red-50 text-red-600 border-red-100' : daysRemaining < 3 ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                                            <CalendarClock size={12}/> {daysRemaining < 0 ? `Telat ${Math.abs(daysRemaining)} Hr` : `Sisa ${daysRemaining} Hr`}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {isAdminPending && (
                                                <div className="space-y-2 mb-2">
                                                    <div className="px-2 py-1 bg-amber-50 rounded border border-amber-100 text-[10px] font-bold text-amber-700 uppercase">PENDING: {job.statusKendaraan}</div>
                                                    {/* PART STATUS BADGE FOR PENDING JOBS */}
                                                    {partStatus && (
                                                        <div className={`px-2 py-1 rounded border text-[10px] font-bold flex items-center gap-1 ${partStatus.color}`}>
                                                            <PackageSearch size={12}/> {partStatus.label}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            
                                            <div className="mb-3">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">PIC (Teknisi):</label>
                                                {currentPIC ? (
                                                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded p-1.5 cursor-pointer hover:bg-indigo-100" onClick={() => setAssigningJobId(assigningJobId === job.id ? null : job.id)}>
                                                        <User size={12} className="text-indigo-600"/>
                                                        <span className="text-xs font-bold text-indigo-700 truncate">{currentPIC}</span>
                                                        {picPanels && <span className="text-[10px] bg-white px-1 rounded border border-indigo-200 ml-auto">{picPanels} Pnl</span>}
                                                    </div>
                                                ) : (
                                                    <button onClick={() => setAssigningJobId(assigningJobId === job.id ? null : job.id)} className="w-full py-1 border border-dashed border-slate-300 rounded text-xs text-slate-400 hover:text-indigo-600 flex items-center justify-center gap-1"><Wrench size={12}/> Tunjuk Mekanik</button>
                                                )}
                                                {assigningJobId === job.id && (
                                                    <div className="mt-2 grid grid-cols-2 gap-1 bg-slate-50 p-2 rounded border border-slate-200 shadow-inner z-20 relative animate-pop-in">
                                                        {(settings.mechanicNames || []).map(m => <button key={m} onClick={(e) => { e.stopPropagation(); handleAssignMechanic(job, m); }} className={`text-[10px] p-1.5 border rounded text-left truncate transition-colors ${currentPIC === m ? 'bg-indigo-600 text-white' : 'bg-white hover:bg-indigo-50'}`}>{m}</button>)}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-2">
                                                <button onClick={() => handleMoveStage(job, 'prev')} disabled={isPersiapan} className={`p-1.5 rounded-lg border transition-all ${isPersiapan ? 'opacity-0' : 'bg-orange-50 text-orange-600 border-orange-200'}`}><ChevronRight size={18} className="rotate-180"/></button>
                                                {!isAdminPending && <button onClick={() => handleRequestAddition(job)} className="p-1.5 rounded-lg border border-red-100 bg-red-50 text-red-600" title="Request Tambahan"><AlertCircle size={18}/></button>}
                                                <button onClick={() => handleMoveStage(job, 'next')} disabled={isFinal} className={`rounded-lg p-1.5 shadow-md transform active:scale-95 transition-all ${isFinal ? 'bg-slate-300 text-white opacity-20' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}><ChevronRight size={18}/></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* MODAL SET TANGGAL */}
        <Modal 
            isOpen={scheduleModal.isOpen} 
            onClose={() => setScheduleModal({ isOpen: false, job: null, startDate: '', endDate: '' })} 
            title={scheduleModal.targetStage ? "Mulai Produksi (Start Timer)" : "Atur Jadwal Perbaikan"}
            maxWidth="max-w-md"
        >
            <div className="space-y-6">
                {scheduleModal.targetStage && (
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-start gap-3">
                        <Info className="text-blue-600 shrink-0 mt-0.5" size={20}/>
                        <div>
                            <p className="text-sm font-bold text-blue-800">Unit Memasuki Tahap Produksi</p>
                            <p className="text-xs text-blue-600 mt-1">Timer durasi pengerjaan akan dimulai dari tanggal ini.</p>
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Mulai Perbaikan (Start Date)</label>
                        <div className="relative">
                            <input 
                                type="date" 
                                required
                                value={scheduleModal.startDate} 
                                onChange={e => setScheduleModal({...scheduleModal, startDate: e.target.value})}
                                className="w-full p-3 border border-slate-300 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                            <Calendar className="absolute right-3 top-3 text-slate-400 pointer-events-none" size={18}/>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Estimasi Selesai (Target Date)</label>
                        <div className="relative">
                            <input 
                                type="date" 
                                required
                                value={scheduleModal.endDate} 
                                onChange={e => setScheduleModal({...scheduleModal, endDate: e.target.value})}
                                className="w-full p-3 border border-slate-300 rounded-xl font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                            <CalendarClock className="absolute right-3 top-3 text-indigo-400 pointer-events-none" size={18}/>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 pt-4">
                    <button 
                        onClick={() => setScheduleModal({ isOpen: false, job: null, startDate: '', endDate: '' })} 
                        className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                    >
                        Batal
                    </button>
                    <button 
                        onClick={handleSaveSchedule} 
                        className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all transform active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Save size={18}/> {scheduleModal.targetStage ? "Mulai & Pindah" : "Simpan Jadwal"}
                    </button>
                </div>
            </div>
        </Modal>

        {/* MODAL LAPORAN GAJI PANEL (FULLSCREEN) */}
        <Modal 
            isOpen={showProductivityReport} 
            onClose={() => setShowProductivityReport(false)} 
            title="Laporan Gaji Mekanik Berbasis Panel"
            maxWidth="max-w-7xl"
        >
            <div className="space-y-6">
                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-4">
                        <div className="bg-white border border-slate-300 rounded-lg p-2 flex items-center gap-2">
                            <Calendar size={16} className="text-slate-500"/>
                            <input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="bg-transparent text-sm font-bold outline-none"/>
                            <span className="text-slate-400">-</span>
                            <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="bg-transparent text-sm font-bold outline-none"/>
                        </div>
                        <div className="text-sm">
                            <p className="text-slate-500">Tarif Standar:</p>
                            <p className="font-black text-indigo-600">{formatCurrency(settings.mechanicPanelRate || 0)} / Panel</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Estimasi Gaji Periode Ini</p>
                        <p className="text-2xl font-black text-emerald-600">
                            {formatCurrency(Object.values(aggregatedReport).reduce((acc: number, curr: any) => acc + (curr.totalPanel * (settings.mechanicPanelRate || 0)), 0) as number)}
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-800 text-white uppercase text-xs font-bold">
                            <tr>
                                <th className="p-4">Nama Mekanik</th>
                                <th className="p-4 text-center">Total Unit</th>
                                <th className="p-4 text-center">Total Panel</th>
                                <th className="p-4 text-right">Tarif</th>
                                <th className="p-4 text-right">Total Gaji</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {Object.entries(aggregatedReport).map(([name, data]: [string, { totalUnit: number, totalPanel: number, details: any[] }]) => (
                                <tr key={name} className="hover:bg-slate-50">
                                    <td className="p-4">
                                        <div className="font-bold text-slate-900">{name}</div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            {data.details.length} Assignment Record
                                        </div>
                                    </td>
                                    <td className="p-4 text-center font-bold text-slate-700">{data.totalUnit}</td>
                                    <td className="p-4 text-center">
                                        <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-bold border border-indigo-100">
                                            {data.totalPanel.toFixed(1)} Pnl
                                        </span>
                                    </td>
                                    <td className="p-4 text-right text-slate-500">{formatCurrency(settings.mechanicPanelRate || 0)}</td>
                                    <td className="p-4 text-right font-black text-emerald-600">
                                        {formatCurrency(data.totalPanel * (settings.mechanicPanelRate || 0))}
                                    </td>
                                </tr>
                            ))}
                            {Object.keys(aggregatedReport).length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-400 italic">Tidak ada data pekerjaan pada periode ini.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* DETAIL EXPANSION (Simple List for now) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    {Object.entries(aggregatedReport).map(([name, data]: [string, { totalUnit: number, totalPanel: number, details: any[] }]) => (
                        <div key={name} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm h-60 overflow-y-auto scrollbar-thin">
                            <h5 className="font-bold text-slate-800 border-b pb-2 mb-2 sticky top-0 bg-white">Detail: {name}</h5>
                            <ul className="space-y-2">
                                {data.details.map((d: any, idx: number) => (
                                    <li key={idx} className="text-xs border-b border-slate-50 pb-1 last:border-0">
                                        <div className="flex justify-between font-bold">
                                            <span>{d.nopol}</span>
                                            <span className="text-indigo-600">{d.panels} Pnl</span>
                                        </div>
                                        <div className="text-slate-500">{formatDateIndo(d.date)} - {d.stage}</div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default JobControlView;
