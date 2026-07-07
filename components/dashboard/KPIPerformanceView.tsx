
// ... existing imports ...
import React, { useState, useMemo } from 'react';
import { Job, CashierTransaction, Settings } from '../../types';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { 
    Trophy, Users, User, Calendar, Target, 
    PhoneCall, 
    Wallet, Hammer, MessageSquare, AlertCircle, TrendingUp,
    Zap, Flag, CheckCircle2, Info
} from 'lucide-react';

interface KPIProps {
  jobs: Job[];
  transactions: CashierTransaction[];
  settings: Settings;
}

const KPIPerformanceView: React.FC<KPIProps> = ({ jobs, transactions, settings }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Helper untuk parsing tanggal (Timestamp Firebase atau Date Object) agar robust
  const parseDate = (dateInput: any): Date => {
      if (!dateInput) return new Date();
      if (dateInput instanceof Date) return dateInput;
      if (typeof dateInput.toDate === 'function') return dateInput.toDate();
      if (dateInput.seconds) return new Date(dateInput.seconds * 1000);
      const parsed = new Date(dateInput);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const stats = useMemo(() => {
    // ... (Existing SA and Financial KPI logic remains unchanged) ...
    const now = new Date();
    const isCurrentMonth = selectedMonth === now.getMonth() && selectedYear === now.getFullYear();

    const invoicedPeriodJobs = jobs.filter(j => {
        if (j.isDeleted || !j.hasInvoice) return false;
        const refDate = j.closedAt || j.updatedAt;
        const dateObj = parseDate(refDate);
        return dateObj.getMonth() === selectedMonth && dateObj.getFullYear() === selectedYear;
    });

    const calculateGP = (job: Job) => {
        const revJasa = job.hargaJasa || 0;
        const revPart = job.hargaPart || 0;
        const totalRevenue = revJasa + revPart; 
        const costBahan = job.costData?.hargaModalBahan || 0;
        const costPart = job.costData?.hargaBeliPart || 0;
        const costSublet = job.costData?.jasaExternal || 0;
        return totalRevenue - (costBahan + costPart + costSublet);
    };

    const saMap: Record<string, any> = {};
    let totalGPRealizedMonth = 0;
    
    invoicedPeriodJobs.forEach(j => {
        const saName = j.namaSA || 'Admin/User';
        const gpValue = calculateGP(j);
        
        if (!saMap[saName]) {
            saMap[saName] = { woCount: 0, estCount: 0, revenue: 0, gpContribution: 0 };
        }
        
        saMap[saName].woCount++;
        saMap[saName].revenue += (j.estimateData?.grandTotal || 0); 
        saMap[saName].gpContribution += gpValue; 
        totalGPRealizedMonth += gpValue;
    });

    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const totalWeeksInMonth = Math.ceil(daysInMonth / 7);
    const currentDay = isCurrentMonth ? now.getDate() : daysInMonth;
    const currentWeekNum = Math.ceil(currentDay / 7);
    const remainingWeeks = Math.max(totalWeeksInMonth - currentWeekNum + 1, 1);

    const achievedSoFar = totalGPRealizedMonth;
    const remainingMonthlyTarget = Math.max(settings.monthlyTarget - achievedSoFar, 0);
    const adjustedWeeklyTarget = remainingMonthlyTarget / remainingWeeks;

    const weeklyInvoicedJobs = invoicedPeriodJobs.filter(j => {
        const refDate = j.closedAt || j.updatedAt;
        const d = parseDate(refDate);
        const diffDays = (now.getTime() - d.getTime()) / (1000 * 3600 * 24);
        return isCurrentMonth ? (diffDays <= 7) : true; 
    });
    
    const currentAchievedWeeklyGP = isCurrentMonth 
        ? weeklyInvoicedJobs.reduce((acc, j) => acc + calculateGP(j), 0)
        : totalGPRealizedMonth / 4; 

    // KPI ADMIN & CRC
    const bookingJobs = jobs.filter(j => {
        if (j.isDeleted) return false;
        const d = parseDate(j.createdAt);
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });
    const bookingCont = bookingJobs.filter(j => j.isBookingContacted).length;
    const bookingSucc = bookingJobs.filter(j => j.bookingSuccess).length;

    const closedInPeriod = jobs.filter(j => {
        if (!j.isClosed || j.isDeleted) return false;
        const refDate = j.closedAt || j.updatedAt;
        const d = parseDate(refDate);
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });
    const serviceCont = closedInPeriod.filter(j => j.isServiceContacted).length;
    const serviceSucc = closedInPeriod.filter(j => j.crcFollowUpStatus === 'Contacted').length;

    const pickupCandidates = jobs.filter(j => {
         const isReady = j.statusKendaraan === 'Selesai (Tunggu Pengambilan)';
         const isClosedThisMonth = j.isClosed && j.closedAt && parseDate(j.closedAt).getMonth() === selectedMonth;
         return isReady || isClosedThisMonth;
    });
    const pickupCont = pickupCandidates.filter(j => j.isPickupContacted).length;
    const pickupSucc = pickupCandidates.filter(j => j.pickupSuccess).length; 

    const totalContacted = bookingCont + serviceCont + pickupCont;
    const totalSuccess = bookingSucc + serviceSucc + pickupSucc;
    const successRatio = totalContacted > 0 ? (totalSuccess / totalContacted) * 100 : 0;
    
    // KPI FINANCE (AR AGING)
    const arItems = jobs.filter(j => j.woNumber && !j.isDeleted && !j.isClosed).map(job => {
        const totalBill = job.estimateData?.grandTotal || 0;
        const paid = transactions
            .filter(t => t.refJobId === job.id && t.type === 'IN')
            .reduce((acc, t) => acc + (t.amount || 0), 0);
        
        const remaining = totalBill - paid;
        const dateRef = parseDate(job.createdAt);
        const ageDays = Math.floor((Date.now() - dateRef.getTime()) / (1000 * 3600 * 24));
        
        return { remaining, ageDays };
    }).filter(i => i.remaining > 1000); 

    const agingProfile = {
        current: arItems.filter(i => i.ageDays <= 7).reduce((acc, i) => acc + i.remaining, 0),
        warning: arItems.filter(i => i.ageDays > 7 && i.ageDays <= 14).reduce((acc, i) => acc + i.remaining, 0),
        critical: arItems.filter(i => i.ageDays > 14).reduce((acc, i) => acc + i.remaining, 0)
    };
    const totalAR = agingProfile.current + agingProfile.warning + agingProfile.critical;

    // 7. KPI PRODUKSI (MEKANIK) - UPDATED LOGIC FOR SPECIFIC PANELS
    const mechMap: Record<string, any> = {};
    (settings.mechanicNames || []).forEach(name => {
        mechMap[name] = { panels: 0, reworks: 0, units: 0 };
    });

    closedInPeriod.forEach(j => {
        // Fallback total panels if individual assignment missing
        const totalJobPanels = j.estimateData?.jasaItems?.reduce((acc, i) => acc + (i.panelCount || 0), 0) || 0;
        const involvedMechs = Array.from(new Set(j.assignedMechanics?.map(a => a.name) || []));
        
        // If mechanics are assigned, use their specific counts. 
        // If specific count is undefined (old data), split equally or assign total (here we assign total for compatibility if multiple mechanics not common on old data)
        
        if (involvedMechs.length > 0) {
             involvedMechs.forEach((m: any) => {
                if (!mechMap[m]) mechMap[m] = { panels: 0, reworks: 0, units: 0 };
                
                // Find specific assignment for this mechanic
                const specificAssignment = j.assignedMechanics?.find(a => a.name === m);
                const assignedPanels = specificAssignment?.panelCount;

                if (assignedPanels !== undefined) {
                    mechMap[m].panels += assignedPanels;
                } else {
                    // Fallback for old data: Full panels
                    mechMap[m].panels += totalJobPanels;
                }
                mechMap[m].units += 1;
            });
        }

        j.productionLogs?.forEach(log => {
            if (log.type === 'rework') {
                const picAtStage = j.assignedMechanics?.find(a => a.stage === log.stage)?.name;
                if (picAtStage) {
                    if (!mechMap[picAtStage]) mechMap[picAtStage] = { panels: 0, reworks: 0, units: 0 };
                    mechMap[picAtStage].reworks++;
                }
            }
        });
    });

    // SA Estimates Count
    jobs.filter(j => {
        if (j.isDeleted) return false;
        const d = parseDate(j.createdAt);
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    }).forEach(j => {
        const saName = j.namaSA || 'Admin/User';
        if (!saMap[saName]) saMap[saName] = { woCount: 0, estCount: 0, revenue: 0, gpContribution: 0 };
        if (j.estimateData?.estimationNumber) saMap[saName].estCount++;
    });

    return { 
        saMap, successRatio, totalContacted,
        agingProfile, mechMap, 
        totalGPRealizedMonth, currentAchievedWeeklyGP, 
        adjustedWeeklyTarget, remainingWeeks, currentWeekNum, totalAR
    };
  }, [jobs, transactions, selectedMonth, selectedYear, settings]);

  const monthlyProgress = Math.min((stats.totalGPRealizedMonth / settings.monthlyTarget) * 100, 100);
  const weeklyProgress = Math.min((stats.currentAchievedWeeklyGP / stats.adjustedWeeklyTarget) * 100, 100);
  const isTargetInflated = stats.adjustedWeeklyTarget > (settings.monthlyTarget / 4);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
        {/* HEADER */}
        <div className="bg-slate-900 p-8 rounded-3xl text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
            <div className="absolute right-0 top-0 p-4 opacity-10 rotate-12 scale-150"><Trophy size={200}/></div>
            <div className="relative z-10 text-center md:text-left">
                <h1 className="text-3xl font-black tracking-tight flex items-center justify-center md:justify-start gap-3">
                    <Trophy className="text-yellow-400" size={32}/> Staff Performance & Target
                </h1>
                <p className="text-indigo-300 font-medium mt-1">Monitoring Laba Kotor (Realized Gross Profit) & Catch-Up Target Tim.</p>
            </div>

            <div className="flex items-center gap-3 bg-white/10 p-2 rounded-2xl backdrop-blur-md border border-white/10 relative z-10">
                <Calendar className="text-indigo-300 ml-2" size={20}/>
                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="bg-transparent border-none text-sm font-black focus:ring-0 cursor-pointer py-2">
                    {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                        <option key={i} value={i} className="text-gray-900">{m}</option>
                    ))}
                </select>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-transparent border-none text-sm font-black focus:ring-0 cursor-pointer border-l border-white/20 pl-4 py-2">
                    {[2024, 2025, 2026].map(y => <option key={y} value={y} className="text-gray-900">{y}</option>)}
                </select>
            </div>
        </div>

        {/* ... (Keep Target Cards & SA Table as is) ... */}
        
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* Monthly Card & Weekly Card Code Omitted for brevity - they remain unchanged */}
             {/* Monthly Card */}
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Flag size={120}/></div>
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Monthly GP Target (Realized)</p>
                        <h3 className="text-3xl font-black text-gray-900">{formatCurrency(settings.monthlyTarget)}</h3>
                    </div>
                    <div className={`p-4 rounded-2xl ${monthlyProgress >= 100 ? 'bg-emerald-500 shadow-emerald-200' : 'bg-indigo-600 shadow-indigo-200'} text-white shadow-xl`}>
                        <CheckCircle2 size={24}/>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-tight">Pencapaian Real (Faktur)</span>
                            <span className="text-xl font-black text-indigo-600">{formatCurrency(stats.totalGPRealizedMonth)}</span>
                        </div>
                        <div className="text-right">
                             <span className={`text-3xl font-black ${monthlyProgress >= 80 ? 'text-emerald-600' : monthlyProgress >= 50 ? 'text-amber-600' : 'text-indigo-600'}`}>{monthlyProgress.toFixed(1)}%</span>
                        </div>
                    </div>
                    <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                        <div className={`h-full transition-all duration-1000 ease-out ${monthlyProgress >= 100 ? 'bg-emerald-500' : monthlyProgress >= 80 ? 'bg-indigo-500' : 'bg-indigo-400'}`} style={{ width: `${monthlyProgress}%` }}></div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold">
                        <div className="flex items-center gap-1 text-amber-500"><AlertCircle size={12}/> Sisa Target: {formatCurrency(Math.max(settings.monthlyTarget - stats.totalGPRealizedMonth, 0))}</div>
                        <span className="text-gray-400">Pekan ke-{stats.currentWeekNum} dari sisa {stats.remainingWeeks} pekan</span>
                    </div>
                </div>
            </div>

            {/* Weekly Card */}
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><Zap size={120}/></div>
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Adjusted Weekly Target</p>
                            {isTargetInflated && <span className="bg-rose-50 text-rose-600 text-[8px] px-1.5 py-0.5 rounded border border-rose-200 font-black animate-pulse">CATCH-UP ACTIVE</span>}
                        </div>
                        <h3 className={`text-3xl font-black ${isTargetInflated ? 'text-rose-700' : 'text-gray-900'}`}>{formatCurrency(stats.adjustedWeeklyTarget)}</h3>
                    </div>
                    <div className={`p-4 rounded-2xl ${weeklyProgress >= 100 ? 'bg-emerald-500' : isTargetInflated ? 'bg-rose-600 shadow-rose-100' : 'bg-orange-500'} text-white shadow-xl animate-pulse`}><TrendingUp size={24}/></div>
                </div>
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-tight">Closing 7 Hari Terakhir</span>
                            <span className={`text-xl font-black ${weeklyProgress >= 100 ? 'text-emerald-600' : 'text-orange-600'}`}>{formatCurrency(stats.currentAchievedWeeklyGP)}</span>
                        </div>
                        <div className="text-right">
                             <span className={`text-3xl font-black ${weeklyProgress >= 100 ? 'text-emerald-600' : isTargetInflated ? 'text-rose-600' : 'text-orange-600'}`}>{weeklyProgress.toFixed(1)}%</span>
                        </div>
                    </div>
                    <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                        <div className={`h-full transition-all duration-1000 ease-out ${weeklyProgress >= 100 ? 'bg-emerald-500' : isTargetInflated ? 'bg-rose-500' : 'bg-orange-500'}`} style={{ width: `${weeklyProgress}%` }}></div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3">
                         <div className={`p-2 rounded-lg ${isTargetInflated ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}><Info size={14}/></div>
                         <p className="text-[9px] text-gray-500 font-bold leading-tight">{isTargetInflated ? `Target naik karena kekurangan pekan sebelumnya dibagi rata ke ${stats.remainingWeeks} pekan sisa.` : `Target pekanan stabil. Pertahankan ritme produksi.`}</p>
                    </div>
                </div>
            </div>
        </div>

        {/* DETAILS GRID */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* SA TABLE */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <div className="p-6 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center">
                    <h3 className="font-black text-indigo-900 flex items-center gap-2 uppercase tracking-widest text-xs"><Users size={18}/> Service Advisor Performance (Realized GP)</h3>
                </div>
                <div className="p-6 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b"><tr><th className="pb-3">Nama SA / User</th><th className="pb-3 text-center">Closing Rate</th><th className="pb-3 text-center">Invoiced Units</th><th className="pb-3 text-right">GP Contribution</th></tr></thead>
                        <tbody className="divide-y divide-gray-50">
                            {Object.entries(stats.saMap).length > 0 ? Object.entries(stats.saMap).map(([name, data]: any) => {
                                const ratio = data.estCount > 0 ? (data.woCount / data.estCount) * 100 : 0;
                                return (
                                    <tr key={name} className="hover:bg-gray-50 transition-colors group">
                                        <td className="py-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-black group-hover:scale-110 transition-transform">{name[0]}</div><span className="font-bold text-gray-800">{name}</span></div></td>
                                        <td className="py-4 text-center"><div className="flex flex-col items-center"><span className={`font-black ${ratio > 70 ? 'text-emerald-600' : 'text-amber-600'}`}>{ratio.toFixed(0)}%</span><span className="text-[9px] text-gray-400 uppercase">{data.woCount} Invoiced / {data.estCount} BE</span></div></td>
                                        <td className="py-4 text-center font-bold text-indigo-600">{data.woCount}</td>
                                        <td className="py-4 text-right"><div className="font-black text-emerald-700">{formatCurrency(data.gpContribution)}</div><div className="text-[9px] text-gray-400 uppercase">Total Profit Terealisasi</div></td>
                                    </tr>
                                );
                            }) : <tr><td colSpan={4} className="py-8 text-center text-gray-400 italic">Belum ada data.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MEKANIK TABLE */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full max-h-[500px]">
                <div className="p-6 bg-blue-50 border-b border-blue-100 flex justify-between items-center shrink-0">
                    <h3 className="font-black text-blue-900 flex items-center gap-2 uppercase tracking-widest text-xs"><Hammer size={18}/> Produksi & Kualitas (Closed WOs)</h3>
                </div>
                <div className="p-0 overflow-hidden flex flex-col h-full">
                    <div className="overflow-y-auto scrollbar-thin h-full p-6">
                        <table className="w-full text-left text-sm relative">
                            <thead className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b bg-white sticky top-0 z-10">
                                <tr>
                                    <th className="pb-3">Mekanik</th>
                                    <th className="pb-3 text-center">Unit Selesai</th>
                                    <th className="pb-3 text-center">Total Panel</th>
                                    <th className="pb-3 text-center">Kualitas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {Object.entries(stats.mechMap).map(([name, data]: any) => (
                                    <tr key={name} className="hover:bg-gray-50 transition-colors">
                                        <td className="py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black">
                                                    {(name || 'M')[0]}
                                                </div>
                                                <span className="font-bold text-gray-800">{name}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 text-center font-black text-gray-600">{data.units}</td>
                                        <td className="py-4 text-center font-black text-blue-700">{data.panels.toFixed(1)}</td>
                                        <td className="py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${data.reworks > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                                                {data.reworks === 0 ? 'PERFECT' : `${data.reworks} REWORK`}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {Object.keys(stats.mechMap).length === 0 && (
                                    <tr><td colSpan={4} className="py-8 text-center text-gray-400 italic">Belum ada data produksi periode ini.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* CRC & Finance Cards Omitted for brevity but assumed present */}
            {/* CRC CARD */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <div className="p-6 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center"><h3 className="font-black text-emerald-900 flex items-center gap-2 uppercase tracking-widest text-xs"><MessageSquare size={18}/> CRM & Customer Care</h3></div>
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <span className="text-xs font-bold text-gray-500 uppercase">Success Ratio (Booking+Pickup+FollowUp)</span>
                                <span className="text-2xl font-black text-emerald-600">{stats.successRatio.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden border border-gray-200">
                                <div className={`bg-emerald-500 h-full transition-all duration-1000`} style={{ width: `${stats.successRatio}%` }}></div>
                            </div>
                            <p className="text-[10px] text-gray-400 font-bold mt-2 flex items-center gap-1">
                                <PhoneCall size={10}/> Total {stats.totalContacted} customer dihubungi (Semua Jalur)
                            </p>
                        </div>
                    </div>
                    <div className="bg-gray-50 rounded-3xl p-6 flex flex-col items-center justify-center text-center">
                        <div className="p-4 bg-white rounded-full shadow-sm mb-4"><Target size={32} className="text-emerald-500"/></div>
                        <h4 className="font-black text-gray-800 text-sm">CRC Goal</h4>
                        <p className="text-xs text-gray-500 mt-2">Target: Konversi Potensi Booking Menjadi Unit Masuk (Inap) Tepat Waktu & Respon Follow Up.</p>
                    </div>
                </div>
            </div>

            {/* FINANCE CARD */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <div className="p-6 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
                    <h3 className="font-black text-rose-900 flex items-center gap-2 uppercase tracking-widest text-xs">
                        <Wallet size={18}/> Finance & Receivables
                    </h3>
                    <div className="text-right">
                        <span className="text-[10px] font-black text-rose-400 uppercase block leading-none">Total Piutang (AR)</span>
                        <span className="text-sm font-black text-rose-700">{formatCurrency(stats.totalAR)}</span>
                    </div>
                </div>
                <div className="p-8 space-y-8">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                            <p className="text-[10px] font-black text-emerald-600 uppercase mb-1">0 - 7 Hari</p>
                            <p className="text-sm font-black text-emerald-900">{formatCurrency(stats.agingProfile.current)}</p>
                        </div>
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-center">
                            <p className="text-[10px] font-black text-amber-600 uppercase mb-1">8 - 14 Hari</p>
                            <p className="text-sm font-black text-emerald-900">{formatCurrency(stats.agingProfile.warning)}</p>
                        </div>
                        <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 text-center">
                            <p className="text-[10px] font-black text-rose-600 uppercase mb-1">{'>'} 14 Hari</p>
                            <p className="text-sm font-black text-emerald-900">{formatCurrency(stats.agingProfile.critical)}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default KPIPerformanceView;
