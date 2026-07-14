import React, { useState, useMemo } from 'react';
import { Job, CashierTransaction, Settings } from '../../types';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

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

    const statusCounts: Record<string, number> = {};
    jobs.filter(j => !j.isClosed && !j.isDeleted && j.statusPekerjaan).forEach(j => {
      const status = j.statusPekerjaan || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return { 
        saMap, successRatio, totalContacted,
        agingProfile, mechMap, 
        totalGPRealizedMonth, currentAchievedWeeklyGP, 
        adjustedWeeklyTarget, remainingWeeks, currentWeekNum, totalAR,
        statusCounts
    };
  }, [jobs, transactions, selectedMonth, selectedYear, settings]);

  const monthlyProgress = Math.min((stats.totalGPRealizedMonth / settings.monthlyTarget) * 100, 100);
  const weeklyProgress = Math.min((stats.currentAchievedWeeklyGP / stats.adjustedWeeklyTarget) * 100, 100);
  const isTargetInflated = stats.adjustedWeeklyTarget > (settings.monthlyTarget / 4);

  const rechartsLineData = Object.keys(stats.statusCounts).map(key => ({
      name: key,
      value: stats.statusCounts[key]
  }));

  return (
    <div className="animate-fade-in pb-6">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-hairline pb-4">
            <div>
                <h1 className="text-[48px] font-bold font-display uppercase leading-[1] text-ink tracking-tight">KPI & PERFORMANCE</h1>
                <p className="text-[12px] text-mute font-normal mt-2">Monitoring Laba Kotor & Catch-Up Target Tim</p>
            </div>

            <div className="flex items-center gap-2 mt-6 md:mt-0 bg-soft-cloud rounded-full px-4 py-2">
                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="bg-transparent border-none text-[12px] font-medium text-ink focus:ring-0 cursor-pointer">
                    {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                    ))}
                </select>
                <span className="text-mute">/</span>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-transparent border-none text-[12px] font-medium text-ink focus:ring-0 cursor-pointer">
                    {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>
        </div>
        
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
             {/* Monthly Card */}
            <div className="bg-card-navy text-canvas p-4 rounded-[12px] shadow-lg">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <p className="text-[12px] font-medium opacity-80 uppercase tracking-widest mb-1">Monthly GP Target (Realized)</p>
                        <h3 className="text-[20px] font-bold font-medium tracking-tight leading-[1]">{formatCurrency(settings.monthlyTarget)}</h3>
                    </div>
                    <div className="text-right">
                        <span className="text-[18px] font-medium">{monthlyProgress.toFixed(1)}%</span>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                            <span className="text-[12px] font-medium opacity-80 uppercase tracking-widest mb-1">Pencapaian Real</span>
                            <span className="text-[12px] font-medium">{formatCurrency(stats.totalGPRealizedMonth)}</span>
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
            <div className="bg-card-emerald text-canvas p-4 rounded-[12px] shadow-lg">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <p className="text-[12px] font-medium opacity-80 uppercase tracking-widest">Adjusted Weekly Target</p>
                            {isTargetInflated && <span className="bg-white text-card-emerald text-[10px] px-2 py-0.5 rounded-full font-medium tracking-widest">CATCH-UP ACTIVE</span>}
                        </div>
                        <h3 className="text-[20px] font-bold font-medium tracking-tight leading-[1]">{formatCurrency(stats.adjustedWeeklyTarget)}</h3>
                    </div>
                    <div className="text-right">
                        <span className="text-[18px] font-medium">{weeklyProgress.toFixed(1)}%</span>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                            <span className="text-[12px] font-medium opacity-80 uppercase tracking-widest mb-1">Closing 7 Hari Terakhir</span>
                            <span className="text-[12px] font-medium">{formatCurrency(stats.currentAchievedWeeklyGP)}</span>
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

        {/* CHARTS */}
        <div className="mb-4 bg-canvas p-4 border border-hairline rounded-2xl overflow-hidden">
            <div className="flex justify-between items-center mb-8">
                <h3 className="text-[12px] font-medium text-ink uppercase tracking-widest">Distribusi Produksi Aktif</h3>
            </div>
            <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={rechartsLineData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorUnits" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0a7281" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#0a7281" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                        <RechartsTooltip 
                            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', fontSize: '12px', textTransform: 'uppercase' }}
                        />
                        <Area type="monotone" dataKey="value" stroke="#0a7281" fillOpacity={1} fill="url(#colorUnits)" strokeWidth={2} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* DETAILS GRID */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* SA TABLE */}
            <div className="bg-canvas border border-hairline flex flex-col rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-hairline">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[12px]">Service Advisor Performance</h3>
                </div>
                <div className="p-0 overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="text-[12px] font-medium text-mute uppercase tracking-widest border-b border-hairline bg-soft-cloud">
                            <tr>
                                <th className="py-2 px-4 font-normal">Nama SA</th>
                                <th className="py-2 px-4 text-center font-normal">Closing Rate</th>
                                <th className="py-2 px-4 text-center font-normal">Invoiced</th>
                                <th className="py-2 px-4 text-right font-normal">GP Contribution</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                            {Object.entries(stats.saMap).length > 0 ? Object.entries(stats.saMap).map(([name, data]: any) => {
                                const ratio = data.estCount > 0 ? (data.woCount / data.estCount) * 100 : 0;
                                return (
                                    <tr key={name} className="hover:bg-soft-cloud transition-colors">
                                        <td className="py-2 px-4 font-medium text-ink">{name}</td>
                                        <td className="py-2 px-4 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-medium text-ink text-[12px]">{ratio.toFixed(0)}%</span>
                                                <span className="text-[10px] text-mute uppercase">{data.woCount} / {data.estCount}</span>
                                            </div>
                                        </td>
                                        <td className="py-2 px-4 text-center font-medium text-ink text-[12px]">{data.woCount}</td>
                                        <td className="py-2 px-4 text-right">
                                            <div className="font-medium text-ink text-[12px]">{formatCurrency(data.gpContribution)}</div>
                                        </td>
                                    </tr>
                                );
                            }) : <tr><td colSpan={4} className="py-2 px-4 text-center text-mute text-[12px]">Belum ada data.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MEKANIK TABLE */}
            <div className="bg-canvas border border-hairline flex flex-col rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-hairline">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[12px]">Produksi & Kualitas</h3>
                </div>
                <div className="p-0 overflow-hidden flex flex-col h-full">
                    <div className="overflow-y-auto scrollbar-thin h-[400px]">
                        <table className="w-full text-left relative">
                            <thead className="text-[12px] font-medium text-mute uppercase tracking-widest border-b border-hairline bg-soft-cloud sticky top-0 z-10">
                                <tr>
                                    <th className="py-2 px-4 font-normal">Mekanik</th>
                                    <th className="py-2 px-4 text-center font-normal">Selesai</th>
                                    <th className="py-2 px-4 text-center font-normal">Panel</th>
                                    <th className="py-2 px-4 text-center font-normal">Kualitas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-hairline">
                                {Object.entries(stats.mechMap).map(([name, data]: any) => (
                                    <tr key={name} className="hover:bg-soft-cloud transition-colors">
                                        <td className="py-2 px-4 font-medium text-ink">{name}</td>
                                        <td className="py-2 px-4 text-center font-medium text-ink text-[12px]">{data.units}</td>
                                        <td className="py-2 px-4 text-center font-medium text-ink text-[12px]">{data.panels.toFixed(1)}</td>
                                        <td className="py-2 px-4 text-center">
                                            {data.reworks === 0 ? (
                                                <span className="text-[12px] font-medium text-mute uppercase tracking-widest">PERFECT</span>
                                            ) : (
                                                <span className="text-[12px] font-medium text-ink uppercase tracking-widest border-b border-ink">{data.reworks} REWORK</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {Object.keys(stats.mechMap).length === 0 && (
                                    <tr><td colSpan={4} className="py-2 px-4 text-center text-mute text-[12px]">Belum ada data produksi periode ini.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* CRC CARD */}
            <div className="bg-canvas border border-hairline flex flex-col rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-hairline">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[12px]">CRM & Customer Care</h3>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between items-end mb-4">
                                <span className="text-[12px] font-medium text-mute uppercase tracking-widest">Success Ratio</span>
                                <span className="text-[18px] font-medium text-ink leading-none">{stats.successRatio.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-soft-cloud h-1 relative border border-hairline">
                                <div className="bg-ink h-full absolute top-0 left-0 transition-all duration-1000" style={{ width: `${stats.successRatio}%` }}></div>
                            </div>
                            <p className="text-[12px] text-mute mt-4">
                                Total {stats.totalContacted} customer dihubungi
                            </p>
                        </div>
                    </div>
                    <div className="bg-soft-cloud border border-hairline p-4 flex flex-col items-center justify-center text-center">
                        <h4 className="font-medium text-ink text-[12px] uppercase tracking-widest">CRC Goal</h4>
                        <p className="text-[12px] text-mute mt-2 max-w-[200px]">Konversi Potensi Booking Menjadi Unit Masuk (Inap) Tepat Waktu & Respon Follow Up.</p>
                    </div>
                </div>
            </div>

            {/* FINANCE CARD */}
            <div className="bg-canvas border border-hairline flex flex-col rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-hairline flex justify-between items-center">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[12px]">Finance & Receivables</h3>
                    <div className="text-right">
                        <span className="text-[10px] font-medium text-mute uppercase block leading-none tracking-widest mb-1">Total Piutang (AR)</span>
                        <span className="text-[12px] font-medium text-ink">{formatCurrency(stats.totalAR)}</span>
                    </div>
                </div>
                <div className="p-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-soft-cloud border border-hairline text-center">
                            <p className="text-[10px] font-medium text-mute uppercase tracking-widest mb-2">0 - 7 Hari</p>
                            <p className="text-[12px] font-medium text-ink">{formatCurrency(stats.agingProfile.current)}</p>
                        </div>
                        <div className="p-4 bg-soft-cloud border border-hairline text-center">
                            <p className="text-[10px] font-medium text-mute uppercase tracking-widest mb-2">8 - 14 Hari</p>
                            <p className="text-[12px] font-medium text-ink">{formatCurrency(stats.agingProfile.warning)}</p>
                        </div>
                        <div className="p-4 bg-soft-cloud border border-hairline text-center">
                            <p className="text-[10px] font-medium text-mute uppercase tracking-widest mb-2">{'>'} 14 Hari</p>
                            <p className="text-[12px] font-medium text-ink">{formatCurrency(stats.agingProfile.critical)}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default KPIPerformanceView;
