import React, { useState, useMemo } from 'react';
import { Job, Settings, UserPermissions, MechanicAssignment, InventoryItem } from '../../types';
import { doc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { formatPoliceNumber, formatDateIndo, formatCurrency } from '../../utils/helpers';
import { PRODUCTION_STAGES } from '../../utils/constants';
import Modal from '../ui/Modal';
import { AlertTriangle } from 'lucide-react';
interface JobControlViewProps {
  jobs: Job[];
  settings: Settings;
  showNotification: (msg: string, type: string) => void;
  userPermissions: UserPermissions;
  inventoryItems: InventoryItem[];
}

const ADMIN_HURDLE_STATUSES = [
    "Banding Harga SPK",
    "Tunggu Part",
    "Unit di Pemilik (Tunggu Part)",
    "Sparepart Lengkap",
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

      if (readyCount === parts.length) return { label: 'PART LENGKAP / READY', style: 'text-ink border-ink' };
      if (readyCount > 0) {
          if (indentCount > 0) return { label: 'PARTIAL (INDENT)', style: 'text-ink border-ink' };
          return { label: 'PARTIAL', style: 'text-ink border-ink' };
      }
      if (onOrderCount > 0 || indentCount > 0) {
          if (indentCount > 0) return { label: 'ON ORDER (INDENT)', style: 'text-mute border-mute' };
          return { label: 'ON ORDER', style: 'text-mute border-mute' };
      }
      return { label: 'NEED ORDER', style: 'text-mute border-mute opacity-50' };
  };

  const boardData = useMemo(() => {
      const columns: Record<string, Job[]> = {};
      PRODUCTION_STAGES.forEach(s => columns[s] = []);
      activeProductionJobs.forEach(job => {
          let status = ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan) ? "Persiapan Kendaraan" : (PRODUCTION_STAGES.includes(job.statusPekerjaan) ? job.statusPekerjaan : 'Bongkar');
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

      // Validasi Tanggal: Tidak boleh pindah stage jika tanggal kosong
      if (!job.actualStartDate || !job.tanggalEstimasiSelesai) {
          showNotification("Tanggal Mulai dan Tanggal Selesai perbaikan harus diisi untuk mengupdate posisi kendaraan.", "error");
          openScheduleModal(job);
          return;
      }

      let currentIndex = PRODUCTION_STAGES.indexOf(job.statusPekerjaan);
      if (currentIndex === -1) currentIndex = 1; 
      let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      
      if (direction === 'next') {
          if (newIndex >= PRODUCTION_STAGES.length) { showNotification("Unit sudah di tahap akhir produksi.", "info"); return; }
          const newStage = PRODUCTION_STAGES[newIndex];
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
          const reason = window.prompt(`Alasan re-work ke ${PRODUCTION_STAGES[newIndex]}:`);
          if (!reason) return;
          const newStage = PRODUCTION_STAGES[newIndex];
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

  const handleAssignMechanic = async (job: Job, mechanicName: string) => {
      let currentStage = ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan) ? "Persiapan Kendaraan" : (PRODUCTION_STAGES.includes(job.statusPekerjaan) ? job.statusPekerjaan : 'Bongkar');
      
      const totalPanelValue = job.estimateData?.jasaItems?.reduce((acc, item) => acc + (item.panelCount || 0), 0) || 0;
      let currentAssignments = [...(job.assignedMechanics || [])];
      
      const existingIdx = currentAssignments.findIndex(a => a.stage === currentStage && a.name === mechanicName);
      
      if (existingIdx >= 0) {
          currentAssignments.splice(existingIdx, 1);
      } else {
          currentAssignments.push({ 
              name: mechanicName, 
              stage: currentStage, 
              assignedAt: new Date().toISOString(),
              panelCount: 0 
          });
      }

      const mechanicsInThisStage = currentAssignments.filter(a => a.stage === currentStage);
      const mechanicCount = mechanicsInThisStage.length;
      
      if (mechanicCount > 0) {
          const splitPanels = parseFloat((totalPanelValue / mechanicCount).toFixed(2));
          currentAssignments = currentAssignments.map(a => {
              if (a.stage === currentStage) {
                  return { ...a, panelCount: splitPanels };
              }
              return a;
          });
      }
      
      await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { assignedMechanics: currentAssignments, mechanicName: mechanicsInThisStage.map(m => m.name).join(', ') || '' });
      
      if (existingIdx >= 0) {
          showNotification(`${mechanicName} dihapus. Beban panel dihitung ulang.`, "info");
      } else {
          showNotification(`${mechanicName} ditugaskan. Panel otomatis dibagi rata.`, "success");
      }
  };

  const aggregatedReport = useMemo(() => {
      const report: Record<string, { totalUnit: number, totalPanel: number, totalWage: number, details: any[] }> = {};
      const start = new Date(reportStartDate);
      const end = new Date(reportEndDate);
      end.setHours(23, 59, 59);

      jobs.forEach(job => {
          if (!job.assignedMechanics) return;
          
          job.assignedMechanics.forEach(asg => {
              const assignDate = new Date(asg.assignedAt);
              if (assignDate >= start && assignDate <= end) {
                  if (!report[asg.name]) report[asg.name] = { totalUnit: 0, totalPanel: 0, totalWage: 0, details: [] };
                  
                  const panels = asg.panelCount || 0; 
                  const rate = settings.stagePanelRates?.[asg.stage] || settings.mechanicPanelRate || 0;
                  const wage = panels * rate;
                  
                  report[asg.name].totalUnit++;
                  report[asg.name].totalPanel += panels;
                  report[asg.name].totalWage += wage;
                  report[asg.name].details.push({
                      date: asg.assignedAt,
                      nopol: job.policeNumber,
                      car: job.carModel,
                      stage: asg.stage,
                      panels: panels,
                      wage: wage
                  });
              }
          });
      });
      return report;
  }, [jobs, reportStartDate, reportEndDate, settings]);

  return (
    <div className="animate-fade-in pb-[48px] h-full flex flex-col">
        {/* HEADER & FILTER */}
        <div className="border-b border-hairline pb-[24px] mb-[24px] flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
            <div>
                <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">JOB CONTROL</h1>
                <p className="text-[16px] text-mute font-normal mt-[18px]">Monitoring Produksi & Gaji Mekanik</p>
            </div>
            <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                    <input 
                        type="text" 
                        placeholder="SEARCH NOPOL..." 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink font-medium uppercase text-[14px] text-ink"
                    />
                </div>
                <button 
                    onClick={() => setShowProductivityReport(true)} 
                    className="bg-ink text-canvas px-6 py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors whitespace-nowrap"
                >
                    LAPORAN GAJI
                </button>
            </div>
        </div>

        {/* MECHANIC LOAD BAR */}
        <details className="mb-[24px] group" open>
            <summary className="flex items-center gap-2 cursor-pointer list-none border-b border-hairline pb-4 mb-4 text-[12px] font-medium text-mute uppercase tracking-widest outline-none">
                <span className="group-open:hidden">+ TAMPILKAN LOAD MEKANIK</span>
                <span className="hidden group-open:inline">- SEMBUNYIKAN LOAD MEKANIK</span>
            </summary>
            <div className="flex gap-4 overflow-x-auto pb-4 shrink-0 scrollbar-hide">
                {(settings.mechanicNames || []).map(mech => (
                    <div key={mech} className="bg-canvas border border-hairline px-4 py-3 flex items-center gap-4 min-w-[180px] shrink-0 rounded-2xl overflow-hidden">
                        <div>
                            <p className="text-[10px] font-medium text-mute uppercase tracking-widest mb-1">LOAD STALL</p>
                            <p className="text-[14px] font-medium text-ink uppercase tracking-widest">{mech}</p>
                        </div>
                        <div className={`ml-auto px-3 py-1 border text-[12px] font-medium ${mechanicWorkload[mech] > 2 ? 'border-ink text-ink bg-soft-cloud' : 'border-hairline text-ink'}`}>
                            {mechanicWorkload[mech] || 0}
                        </div>
                    </div>
                ))}
            </div>
        </details>

        {/* KANBAN BOARD */}
        <div className="flex-grow overflow-x-auto overflow-y-hidden pb-4 scrollbar-hide">
            <div className="flex gap-6 h-full min-w-max">
                {PRODUCTION_STAGES.map((stage) => {
                    const jobsInStage = boardData[stage] || [];
                    const isPersiapan = stage === "Persiapan Kendaraan";
                    const isFinal = stage === "Selesai (Tunggu Pengambilan)";
                    
                    return (
                        <div key={stage} className="w-[340px] flex flex-col h-full bg-soft-cloud border border-hairline">
                            <div className="p-4 border-b border-hairline bg-canvas flex justify-between items-center sticky top-0 z-10">
                                <h3 className="font-medium text-[14px] text-ink uppercase tracking-widest">{stage}</h3>
                                <span className="text-[10px] font-medium px-2 py-1 border border-ink text-ink">{jobsInStage.length}</span>
                            </div>
                            <div className="p-4 flex-grow overflow-y-auto space-y-4 scrollbar-hide">
                                {jobsInStage.map(job => {
                                    const isAdminPending = ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan);
                                    const stageAssignments = job.assignedMechanics?.filter(a => a.stage === (isAdminPending ? 'Persiapan Kendaraan' : job.statusPekerjaan || 'Bongkar')) || [];
                                    const hasAssignments = stageAssignments.length > 0;
                                    const { daysRunning, daysRemaining } = getJobProgress(job);
                                    const totalPanelValue = job.estimateData?.jasaItems?.reduce((acc, item) => acc + (item.panelCount || 0), 0) || 0;
                                    const partStatus = getPartStatus(job);
                                    
                                    let deadlineAlert = null;
                                    if (daysRemaining !== null) {
                                        if (daysRemaining < 0) {
                                            deadlineAlert = <span title="Melewati Tanggal Janji"><AlertTriangle size={18} style={{ color: '#dc2626' }} className="animate-pulse" /></span>;
                                        } else if (daysRemaining <= 2) {
                                            deadlineAlert = <span title={`H-${daysRemaining} Janji Selesai`}><AlertTriangle size={18} style={{ color: '#f97316' }} /></span>;
                                        }
                                    }
                                    
                                    return (
                                        <div key={job.id} className={`bg-canvas border p-4 transition-colors relative ${job.isVVIP ? 'border-ink shadow-[4px_4px_0_0_#111111]' : isAdminPending ? 'border-mute/50' : isFinal ? 'border-hairline opacity-75' : 'border-hairline hover:border-ink'}`}>
                                            {job.isVVIP && <div className="absolute top-0 right-0 bg-ink text-canvas text-[8px] font-medium uppercase tracking-widest px-2 py-1">VVIP</div>}
                                            
                                            <div className="flex justify-between items-start mb-4 border-b border-hairline pb-4">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-display text-[24px] text-ink leading-none">{job.policeNumber}</span>
                                                        {!isFinal && !isAdminPending && deadlineAlert}
                                                    </div>
                                                    <p className="text-[10px] font-medium text-mute uppercase tracking-widest mt-2 truncate max-w-[200px]">{job.carModel} | {job.customerName}</p>
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <button onClick={() => openScheduleModal(job)} className="text-[10px] border border-hairline hover:border-ink px-2 py-1 uppercase tracking-widest text-ink transition-colors">SCHED</button>
                                                    <button onClick={() => toggleVVIP(job)} className="text-[10px] border border-hairline hover:border-ink px-2 py-1 uppercase tracking-widest text-ink transition-colors">VVIP</button>
                                                </div>
                                            </div>
                                            
                                            <div className="flex justify-between items-center text-[10px] font-medium text-mute uppercase tracking-widest mb-4">
                                                <div className="border border-hairline px-2 py-1">SA: {job.namaSA || 'NO SA'}</div>
                                                <div className="border border-hairline px-2 py-1">{totalPanelValue.toFixed(1)} PNL</div>
                                            </div>

                                            {!isAdminPending && !isFinal && (
                                                <div className="flex gap-2 mb-4">
                                                    <div className="flex-1 text-center border border-hairline px-2 py-1 text-[10px] font-medium text-ink uppercase tracking-widest">
                                                        {daysRunning} D RUN
                                                    </div>
                                                    {daysRemaining !== null && (
                                                        <div className={`flex-1 text-center border px-2 py-1 text-[10px] font-medium uppercase tracking-widest ${daysRemaining < 0 ? 'border-ink text-ink bg-soft-cloud' : 'border-hairline text-mute'}`}>
                                                            {daysRemaining < 0 ? `LATE ${Math.abs(daysRemaining)} D` : `LEFT ${daysRemaining} D`}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {isAdminPending && (
                                                <div className="space-y-2 mb-4">
                                                    <div className="px-2 py-1 bg-soft-cloud border border-hairline text-[10px] font-medium text-ink uppercase tracking-widest text-center truncate">
                                                        PENDING: {job.statusKendaraan}
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {partStatus && (
                                                <div className={`mb-4 px-2 py-1 border text-[10px] font-medium uppercase tracking-widest text-center ${partStatus.style}`}>
                                                    SPAREPART: {partStatus.label}
                                                </div>
                                            )}
                                            
                                            <details className="mb-4 bg-soft-cloud border border-hairline group">
                                                <summary className="p-3 text-[10px] font-medium text-mute uppercase tracking-widest cursor-pointer list-none flex justify-between items-center outline-none">
                                                    <span>PIC STALL {hasAssignments ? `(${stageAssignments.length})` : ''}</span>
                                                    <span className="group-open:hidden border border-hairline px-2 py-0.5 text-ink">+ BUKA</span>
                                                    <span className="hidden group-open:block border border-hairline px-2 py-0.5 text-ink">- TUTUP</span>
                                                </summary>
                                                <div className="p-3 pt-0 border-t border-hairline mt-2">
                                                    {hasAssignments ? (
                                                        <div className="flex flex-col gap-1 cursor-pointer mt-3" onClick={() => setAssigningJobId(assigningJobId === job.id ? null : job.id)}>
                                                            {stageAssignments.map((asg, idx) => (
                                                                <div key={idx} className="flex items-center justify-between border border-ink bg-canvas px-3 py-2">
                                                                    <span className="text-[12px] font-medium text-ink uppercase tracking-widest truncate">{asg.name}</span>
                                                                    {asg.panelCount !== undefined && <span className="text-[10px] font-medium text-ink uppercase tracking-widest">{asg.panelCount} PNL</span>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => setAssigningJobId(assigningJobId === job.id ? null : job.id)} className="w-full mt-3 py-2 border border-hairline hover:border-ink text-[10px] font-medium text-ink uppercase tracking-widest transition-colors bg-canvas">ASSIGN MECHANIC</button>
                                                    )}
                                                    {assigningJobId === job.id && (
                                                        <div className="mt-2 grid grid-cols-2 gap-2 bg-canvas p-2 border border-hairline animate-fade-in rounded-2xl overflow-hidden">
                                                            {(settings.mechanicNames || []).map(m => {
                                                                const isAssigned = stageAssignments.some(a => a.name === m);
                                                                const asgPanels = stageAssignments.find(a => a.name === m)?.panelCount;
                                                                return (
                                                                    <button key={m} onClick={(e) => { e.stopPropagation(); handleAssignMechanic(job, m); }} className={`text-[10px] p-2 border transition-colors text-left uppercase tracking-widest ${isAssigned ? 'bg-ink text-canvas border-ink' : 'bg-canvas text-ink border-hairline hover:border-ink'}`}>
                                                                        <div className="truncate">{m}</div>
                                                                        {isAssigned && asgPanels !== undefined && <div className="text-[8px] opacity-70 mt-1">{asgPanels} PNL</div>}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </details>
                                            <div className="flex justify-between items-center pt-4 border-t border-hairline">
                                                <button onClick={() => handleMoveStage(job, 'prev')} disabled={isPersiapan} className="border border-hairline hover:border-ink text-ink px-4 py-2 text-[10px] font-medium uppercase tracking-widest transition-colors disabled:opacity-30">&lt; REWORK</button>
                                                {!isAdminPending && <button onClick={() => handleRequestAddition(job)} className="border border-hairline hover:border-ink text-ink px-2 py-2 text-[10px] font-medium uppercase tracking-widest transition-colors">ADD</button>}
                                                <button onClick={() => handleMoveStage(job, 'next')} disabled={isFinal} className="bg-ink text-canvas hover:bg-mute px-4 py-2 text-[10px] font-medium uppercase tracking-widest transition-colors disabled:opacity-30">NEXT &gt;</button>
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
            title={scheduleModal.targetStage ? "MULAI PRODUKSI (START TIMER)" : "ATUR JADWAL PERBAIKAN"}
        >
            <div className="space-y-6">
                {scheduleModal.targetStage && (
                    <div className="bg-soft-cloud border border-hairline p-4">
                        <p className="text-[12px] font-medium text-ink uppercase tracking-widest">Unit Memasuki Tahap Produksi</p>
                        <p className="text-[10px] text-mute uppercase tracking-widest mt-1">Timer durasi pengerjaan akan dimulai dari tanggal ini.</p>
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Mulai Perbaikan (Start Date)</label>
                        <input 
                            type="date" 
                            required
                            value={scheduleModal.startDate} 
                            onChange={e => setScheduleModal({...scheduleModal, startDate: e.target.value})}
                            className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase"
                        />
                    </div>

                    <div>
                        <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Estimasi Selesai (Target Date)</label>
                        <input 
                            type="date" 
                            required
                            value={scheduleModal.endDate} 
                            onChange={e => setScheduleModal({...scheduleModal, endDate: e.target.value})}
                            className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase"
                        />
                    </div>
                </div>

                <div className="flex gap-4 pt-6 border-t border-hairline">
                    <button 
                        onClick={() => setScheduleModal({ isOpen: false, job: null, startDate: '', endDate: '' })} 
                        className="flex-1 py-4 border border-ink text-[12px] font-medium text-ink uppercase tracking-widest hover:bg-soft-cloud transition-colors"
                    >
                        BATAL
                    </button>
                    <button 
                        onClick={handleSaveSchedule} 
                        className="flex-[2] py-4 bg-ink text-canvas text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors"
                    >
                        {scheduleModal.targetStage ? "MULAI & PINDAH" : "SIMPAN JADWAL"}
                    </button>
                </div>
            </div>
        </Modal>

        {/* MODAL LAPORAN GAJI PANEL (FULLSCREEN) */}
        <Modal 
            isOpen={showProductivityReport} 
            onClose={() => setShowProductivityReport(false)} 
            title="LAPORAN GAJI MEKANIK BERBASIS PANEL"
            maxWidth="max-w-7xl"
        >
            <div className="space-y-6">
                <div className="bg-canvas border border-hairline p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 rounded-2xl overflow-hidden">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2 border border-hairline bg-soft-cloud p-2">
                            <input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="bg-transparent text-[12px] font-medium uppercase tracking-widest text-ink outline-none"/>
                            <span className="text-mute">-</span>
                            <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="bg-transparent text-[12px] font-medium uppercase tracking-widest text-ink outline-none"/>
                        </div>
                        <div>
                            <p className="text-[10px] font-medium text-mute uppercase tracking-widest">Tarif Standar:</p>
                            <p className="text-[14px] font-medium text-ink">{formatCurrency(settings.mechanicPanelRate || 0)} / PANEL</p>
                        </div>
                    </div>
                    <div className="md:text-right">
                        <p className="text-[10px] font-medium text-mute uppercase tracking-widest mb-2">Total Estimasi Gaji Periode Ini</p>
                        <p className="text-[32px] font-display text-ink leading-none">
                            {formatCurrency(Object.values(aggregatedReport).reduce((acc: number, curr: any) => acc + (curr.totalWage || 0), 0) as number)}
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto bg-canvas border border-hairline rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-soft-cloud text-mute font-medium uppercase tracking-widest text-[10px] border-b border-hairline">
                            <tr>
                                <th className="px-6 py-4 font-normal">Nama Mekanik</th>
                                <th className="px-6 py-4 text-center font-normal">Total Unit</th>
                                <th className="px-6 py-4 text-center font-normal">Total Panel</th>
                                <th className="px-6 py-4 text-right font-normal">Tarif</th>
                                <th className="px-6 py-4 text-right font-normal">Total Gaji</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                            {Object.entries(aggregatedReport).map(([name, data]: [string, any]) => (
                                <tr key={name} className="hover:bg-soft-cloud transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="text-[14px] font-medium text-ink uppercase tracking-widest">{name}</div>
                                        <div className="text-[10px] text-mute mt-1 uppercase tracking-widest">
                                            {data.details.length} ASSIGNMENTS
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center font-medium text-ink">{data.totalUnit}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="border border-ink text-ink px-2 py-1 text-[12px] font-medium">
                                            {data.totalPanel.toFixed(1)} PNL
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-mute text-[12px]">VARIAN STALL</td>
                                    <td className="px-6 py-4 text-right font-medium text-ink text-[14px]">
                                        {formatCurrency(data.totalWage)}
                                    </td>
                                </tr>
                            ))}
                            {Object.keys(aggregatedReport).length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-mute text-[12px] uppercase tracking-widest">Tidak ada data pekerjaan pada periode ini.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
                    {Object.entries(aggregatedReport).map(([name, data]: [string, { totalUnit: number, totalPanel: number, details: any[] }]) => (
                        <div key={name} className="bg-canvas border border-hairline p-6 h-64 overflow-y-auto scrollbar-hide rounded-2xl overflow-hidden">
                            <h5 className="font-medium text-ink uppercase tracking-widest text-[14px] border-b border-hairline pb-4 mb-4 sticky top-0 bg-canvas">DETAIL: {name}</h5>
                            <ul className="space-y-4">
                                {data.details.map((d: any, idx: number) => (
                                    <li key={idx} className="border-b border-hairline pb-4 last:border-0 last:pb-0">
                                        <div className="flex justify-between font-medium text-ink text-[12px] uppercase tracking-widest mb-1">
                                            <span>{d.nopol}</span>
                                            <span className="border border-ink px-1">{d.panels} PNL</span>
                                        </div>
                                        <div className="text-mute text-[10px] uppercase tracking-widest">{formatDateIndo(d.date)} - {d.stage}</div>
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
