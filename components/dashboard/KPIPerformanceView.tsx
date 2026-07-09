import React, { useState, useMemo } from 'react';
import { Job, CashierTransaction, Settings } from '../../types';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';

interface KPIProps {
  jobs: Job[];
  transactions: CashierTransaction[];
  settings: Settings;
}

const KPIPerformanceView: React.FC<KPIProps> = ({ jobs, transactions, settings }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const parseDate = (dateInput: any): Date => {
      if (!dateInput) return new Date();
      if (dateInput instanceof Date) return dateInput;
      if (typeof dateInput.toDate === 'function') return dateInput.toDate();
      if (dateInput.seconds) return new Date(dateInput.seconds * 1000);
      const parsed = new Date(dateInput);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const stats = useMemo(() => {
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

    // KPI PRODUKSI (MEKANIK)
    const mechMap: Record<string, any> = {};
    (settings.mechanicNames || []).forEach(name => {
        mechMap[name] = { panels: 0, reworks: 0, units: 0 };
    });

    closedInPeriod.forEach(j => {
        const totalJobPanels = j.estimateData?.jasaItems?.reduce((acc, i) => acc + (i.panelCount || 0), 0) || 0;
        const involvedMechs = Array.from(new Set(j.assignedMechanics?.map(a => a.name) || []));
        
        if (involvedMechs.length > 0) {
             involvedMechs.forEach((m: any) => {
                if (!mechMap[m]) mechMap[m] = { panels: 0, reworks: 0, units: 0 };
                
                const specificAssignment = j.assignedMechanics?.find(a => a.name === m);
                const assignedPanels = specificAssignment?.panelCount;

                if (assignedPanels !== undefined) {
                    mechMap[m].panels += assignedPanels;
                } else {
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
    <div className="animate-fade-in pb-[48px]">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-[48px] border-b border-hairline pb-[24px]">
            <div>
                <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">KPI & PERFORMANCE</h1>
                <p className="text-[16px] text-mute font-normal mt-[18px]">Monitoring Laba Kotor & Catch-Up Target Tim</p>
            </div>

            <div className="flex items-center gap-2 mt-6 md:mt-0 bg-soft-cloud rounded-full px-4 py-2">
                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="bg-transparent border-none text-[16px] font-medium text-ink focus:ring-0 cursor-pointer">
                    {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                    ))}
                </select>
                <span className="text-mute">/</span>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-transparent border-none text-[16px] font-medium text-ink focus:ring-0 cursor-pointer">
                    {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>
        </div>
        
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-[24px] mb-[24px]">
             {/* Monthly Card */}
            <div className="bg-card-navy text-canvas p-6 md:p-8 rounded-[24px] shadow-lg">
                <div className="flex justify-between items-start mb-12">
                    <div>
                        <p className="text-[14px] font-medium opacity-80 uppercase tracking-widest mb-1">Monthly GP Target (Realized)</p>
                        <h3 className="text-[48px] font-medium tracking-tight leading-[1]">{formatCurrency(settings.monthlyTarget)}</h3>
                    </div>
                    <div className="text-right">
                        <span className="text-[32px] font-medium">{monthlyProgress.toFixed(1)}%</span>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                            <span className="text-[14px] font-medium opacity-80 uppercase tracking-widest mb-1">Pencapaian Real</span>
                            <span className="text-[24px] font-medium">{formatCurrency(stats.totalGPRealizedMonth)}</span>
                        </div>
                    </div>
                    <div className="w-full h-1 bg-white/20 relative">
                        <div className="absolute top-0 left-0 h-full bg-canvas transition-all duration-1000" style={{ width: `${monthlyProgress}%` }}></div>
                    </div>
                    <div className="flex items-center justify-between text-[12px] font-medium opacity-80 uppercase tracking-widest mt-4">
                        <div>SISA TARGET: {formatCurrency(Math.max(settings.monthlyTarget - stats.totalGPRealizedMonth, 0))}</div>
                        <div>PEKAN KE-{stats.currentWeekNum} / {stats.remainingWeeks} SISA</div>
                    </div>
                </div>
            </div>

            {/* Weekly Card */}
            <div className="bg-card-emerald text-canvas p-6 md:p-8 rounded-[24px] shadow-lg">
                <div className="flex justify-between items-start mb-12">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <p className="text-[14px] font-medium opacity-80 uppercase tracking-widest">Adjusted Weekly Target</p>
                            {isTargetInflated && <span className="bg-white text-card-emerald text-[10px] px-2 py-0.5 rounded-full font-medium tracking-widest">CATCH-UP ACTIVE</span>}
                        </div>
                        <h3 className="text-[48px] font-medium tracking-tight leading-[1]">{formatCurrency(stats.adjustedWeeklyTarget)}</h3>
                    </div>
                    <div className="text-right">
                        <span className="text-[32px] font-medium">{weeklyProgress.toFixed(1)}%</span>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                            <span className="text-[14px] font-medium opacity-80 uppercase tracking-widest mb-1">Closing 7 Hari Terakhir</span>
                            <span className="text-[24px] font-medium">{formatCurrency(stats.currentAchievedWeeklyGP)}</span>
                        </div>
                    </div>
                    <div className="w-full h-1 bg-white/20 relative">
                        <div className="absolute top-0 left-0 h-full bg-canvas transition-all duration-1000" style={{ width: `${weeklyProgress}%` }}></div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/20">
                         <p className="text-[12px] opacity-80 font-normal italic">
                            {isTargetInflated ? `Target naik karena kekurangan pekan sebelumnya dibagi rata ke ${stats.remainingWeeks} pekan sisa.` : `Target pekanan stabil. Pertahankan ritme produksi.`}
                         </p>
                    </div>
                </div>
            </div>
        </div>

        {/* DETAILS GRID */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-[24px]">
            {/* SA TABLE */}
            <div className="bg-canvas border border-hairline flex flex-col">
                <div className="p-6 border-b border-hairline">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">Service Advisor Performance</h3>
                </div>
                <div className="p-0 overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="text-[12px] font-medium text-mute uppercase tracking-widest border-b border-hairline bg-soft-cloud">
                            <tr>
                                <th className="py-4 px-6 font-normal">Nama SA</th>
                                <th className="py-4 px-6 text-center font-normal">Closing Rate</th>
                                <th className="py-4 px-6 text-center font-normal">Invoiced</th>
                                <th className="py-4 px-6 text-right font-normal">GP Contribution</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                            {Object.entries(stats.saMap).length > 0 ? Object.entries(stats.saMap).map(([name, data]: any) => {
                                const ratio = data.estCount > 0 ? (data.woCount / data.estCount) * 100 : 0;
                                return (
                                    <tr key={name} className="hover:bg-soft-cloud transition-colors">
                                        <td className="py-4 px-6 font-medium text-ink">{name}</td>
                                        <td className="py-4 px-6 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-medium text-ink text-[16px]">{ratio.toFixed(0)}%</span>
                                                <span className="text-[10px] text-mute uppercase">{data.woCount} / {data.estCount}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 text-center font-medium text-ink text-[16px]">{data.woCount}</td>
                                        <td className="py-4 px-6 text-right">
                                            <div className="font-medium text-ink text-[16px]">{formatCurrency(data.gpContribution)}</div>
                                        </td>
                                    </tr>
                                );
                            }) : <tr><td colSpan={4} className="py-8 px-6 text-center text-mute text-[14px]">Belum ada data.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MEKANIK TABLE */}
            <div className="bg-canvas border border-hairline flex flex-col">
                <div className="p-6 border-b border-hairline">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">Produksi & Kualitas</h3>
                </div>
                <div className="p-0 overflow-hidden flex flex-col h-full">
                    <div className="overflow-y-auto scrollbar-thin h-[400px]">
                        <table className="w-full text-left relative">
                            <thead className="text-[12px] font-medium text-mute uppercase tracking-widest border-b border-hairline bg-soft-cloud sticky top-0 z-10">
                                <tr>
                                    <th className="py-4 px-6 font-normal">Mekanik</th>
                                    <th className="py-4 px-6 text-center font-normal">Selesai</th>
                                    <th className="py-4 px-6 text-center font-normal">Panel</th>
                                    <th className="py-4 px-6 text-center font-normal">Kualitas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-hairline">
                                {Object.entries(stats.mechMap).map(([name, data]: any) => (
                                    <tr key={name} className="hover:bg-soft-cloud transition-colors">
                                        <td className="py-4 px-6 font-medium text-ink">{name}</td>
                                        <td className="py-4 px-6 text-center font-medium text-ink text-[16px]">{data.units}</td>
                                        <td className="py-4 px-6 text-center font-medium text-ink text-[16px]">{data.panels.toFixed(1)}</td>
                                        <td className="py-4 px-6 text-center">
                                            {data.reworks === 0 ? (
                                                <span className="text-[12px] font-medium text-mute uppercase tracking-widest">PERFECT</span>
                                            ) : (
                                                <span className="text-[12px] font-medium text-ink uppercase tracking-widest border-b border-ink">{data.reworks} REWORK</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {Object.keys(stats.mechMap).length === 0 && (
                                    <tr><td colSpan={4} className="py-8 px-6 text-center text-mute text-[14px]">Belum ada data produksi periode ini.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* CRC CARD */}
            <div className="bg-canvas border border-hairline flex flex-col">
                <div className="p-6 border-b border-hairline">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">CRM & Customer Care</h3>
                </div>
                <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between items-end mb-4">
                                <span className="text-[14px] font-medium text-mute uppercase tracking-widest">Success Ratio</span>
                                <span className="text-[32px] font-medium text-ink leading-none">{stats.successRatio.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-soft-cloud h-1 relative border border-hairline">
                                <div className="bg-ink h-full absolute top-0 left-0 transition-all duration-1000" style={{ width: `${stats.successRatio}%` }}></div>
                            </div>
                            <p className="text-[12px] text-mute mt-4">
                                Total {stats.totalContacted} customer dihubungi
                            </p>
                        </div>
                    </div>
                    <div className="bg-soft-cloud border border-hairline p-6 flex flex-col items-center justify-center text-center">
                        <h4 className="font-medium text-ink text-[16px] uppercase tracking-widest">CRC Goal</h4>
                        <p className="text-[12px] text-mute mt-2 max-w-[200px]">Konversi Potensi Booking Menjadi Unit Masuk (Inap) Tepat Waktu & Respon Follow Up.</p>
                    </div>
                </div>
            </div>

            {/* FINANCE CARD */}
            <div className="bg-canvas border border-hairline flex flex-col">
                <div className="p-6 border-b border-hairline flex justify-between items-center">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">Finance & Receivables</h3>
                    <div className="text-right">
                        <span className="text-[10px] font-medium text-mute uppercase block leading-none tracking-widest mb-1">Total Piutang (AR)</span>
                        <span className="text-[16px] font-medium text-ink">{formatCurrency(stats.totalAR)}</span>
                    </div>
                </div>
                <div className="p-6 md:p-8">
                    <div className="grid grid-cols-3 gap-[24px]">
                        <div className="p-4 bg-soft-cloud border border-hairline text-center">
                            <p className="text-[10px] font-medium text-mute uppercase tracking-widest mb-2">0 - 7 Hari</p>
                            <p className="text-[16px] font-medium text-ink">{formatCurrency(stats.agingProfile.current)}</p>
                        </div>
                        <div className="p-4 bg-soft-cloud border border-hairline text-center">
                            <p className="text-[10px] font-medium text-mute uppercase tracking-widest mb-2">8 - 14 Hari</p>
                            <p className="text-[16px] font-medium text-ink">{formatCurrency(stats.agingProfile.warning)}</p>
                        </div>
                        <div className="p-4 bg-soft-cloud border border-hairline text-center">
                            <p className="text-[10px] font-medium text-mute uppercase tracking-widest mb-2">{'>'} 14 Hari</p>
                            <p className="text-[16px] font-medium text-ink">{formatCurrency(stats.agingProfile.critical)}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default KPIPerformanceView;
