
import React, { useState, useMemo } from 'react';
import { Job, Settings } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

interface OverviewProps {
  allJobs: Job[];
  totalUnits: number;
  settings: Settings;
  onNavigate: (view: string) => void;
}

const StatCard = ({ title, value, subValue, trend, info, variant = 'default' }: any) => {
  const getColors = () => {
    switch (variant) {
      case 'ink': return 'bg-ink text-canvas border-ink';
      case 'teal': return 'bg-card-teal text-canvas border-card-teal';
      case 'emerald': return 'bg-card-emerald text-canvas border-card-emerald';
      case 'navy': return 'bg-card-navy text-canvas border-card-navy';
      case 'ruby': return 'bg-card-ruby text-canvas border-card-ruby';
      default: return 'bg-canvas text-ink border-hairline';
    }
  };
  const muteColor = variant === 'default' ? 'text-mute' : 'text-canvas opacity-80';
  const borderColor = variant === 'default' ? 'border-hairline' : 'border-white border-opacity-20';

  return (
    <div className={`${getColors()} p-4 flex flex-col justify-between border-b md:border-b-0 md:border-r last:border-0 md:last:border-r-0 transition-colors`}>
      <div>
          <p className={`text-[12px] font-medium ${muteColor} uppercase tracking-widest`}>{title}</p>
          <h3 className={`text-[18px] font-medium mt-2 tracking-tight`}>{value}</h3>
      </div>
      {(subValue || info) && (
          <div className={`mt-4 pt-4 border-t ${borderColor}`}>
              {subValue && (
                  <p className={`text-[12px] font-medium ${muteColor}`}>{trend === 'up' ? '↗ ' : ''}{subValue}</p>
              )}
              {info && <p className={`text-[12px] ${muteColor} mt-1 italic`}>{info}</p>}
          </div>
      )}
    </div>
  );
};

const OverviewDashboard: React.FC<OverviewProps> = ({ allJobs, totalUnits, settings, onNavigate }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activeWeek, setActiveWeek] = useState<number | 'total'>('total');
  const lang = settings.language || 'id';

  const parseDate = (dateInput: any): Date => {
      if (!dateInput) return new Date();
      if (dateInput instanceof Date) return dateInput;
      if (typeof dateInput.toDate === 'function') return dateInput.toDate();
      if (dateInput.seconds) return new Date(dateInput.seconds * 1000);
      const parsed = new Date(dateInput);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const t = (key: string) => {
      const dict: any = {
          id: {
              title: "OVERVIEW",
              subtitle: "Pantau performa operasional & finansial bengkel anda",
              card_db: "Total Database",
              card2: "Work In Progress",
              card2_sub: "Unit sedang dikerjakan",
              card3: "Siap Ambil",
              card3_sub: "Menunggu penyerahan",
              card4: "Revenue",
              card4_sub: "Total bill periode ini",
              row1: "Unit Terfaktur",
              row2: "Total Produksi Panel",
              row3: "Gross Profit",
              chart2: "Rasio Faktur"
          },
          en: {
              title: "OVERVIEW",
              subtitle: "Monitor operational & financial performance",
              card_db: "Total Database",
              card2: "Work In Progress",
              card2_sub: "Active jobs",
              card3: "Ready for Delivery",
              card3_sub: "Waiting for handover",
              card4: "Revenue",
              card4_sub: "Total bill this period",
              row1: "Invoiced Units",
              row2: "Production Panels",
              row3: "Gross Profit",
              chart2: "Invoice Ratio"
          }
      };
      return dict[lang][key] || key;
  };

  const stats = useMemo(() => {
    const activeJobsList = allJobs.filter(j => j.woNumber && !j.isClosed && !j.isDeleted);
    const activeJobsCount = activeJobsList.length;
    
    const completedWaiting = allJobs.filter(j => 
        !j.isClosed && 
        !j.isDeleted && 
        (j.statusKendaraan === 'Selesai (Tunggu Pengambilan)' || j.statusPekerjaan?.includes('Selesai'))
    ).length;

    const getWeekBounds = (year: number, month: number, week: number) => {
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        let firstSundayDate = 1;
        while (new Date(year, month, firstSundayDate).getDay() !== 0 && firstSundayDate < lastDayOfMonth) {
            firstSundayDate++;
        }

        if (week === 1) return { start: 1, end: firstSundayDate };
        
        let startDay = firstSundayDate + 1 + (week - 2) * 7;
        let endDay = startDay + 6;
        
        if (week === 5) return { start: startDay, end: lastDayOfMonth };
        
        if (startDay > lastDayOfMonth) return { start: lastDayOfMonth + 1, end: lastDayOfMonth };
        if (endDay > lastDayOfMonth) endDay = lastDayOfMonth;
        
        return { start: startDay, end: endDay };
    };

    const getWorkingDaysInWeek = (week: number) => {
        const { start, end } = getWeekBounds(selectedYear, selectedMonth, week);
        if (start > end) return 0;
        
        const workingDaysOfWeek = settings.workingDaysOfWeek || [1,2,3,4,5,6];
        let workingDays = 0;
        
        for (let d = start; d <= end; d++) {
            let currDate = new Date(selectedYear, selectedMonth, d);
            let dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            if (workingDaysOfWeek.includes(currDate.getDay()) && !(settings.internalHolidays || []).includes(dateStr)) {
                workingDays++;
            }
        }
        return workingDays;
    };

    const getWeekNumber = (date: Date, year: number, month: number) => {
        if (date.getMonth() !== month || date.getFullYear() !== year) return -1;
        const day = date.getDate();
        for (let w = 1; w <= 5; w++) {
            const { start, end } = getWeekBounds(year, month, w);
            if (day >= start && day <= end) return w;
        }
        return -1;
    };

    const weeklyData: Record<string, any> = {
        1: { entry: 0, out: 0, jasaNett: 0, partNett: 0, bahanCost: 0, partCost: 0, grossProfit: 0, workingDays: getWorkingDaysInWeek(1) },
        2: { entry: 0, out: 0, jasaNett: 0, partNett: 0, bahanCost: 0, partCost: 0, grossProfit: 0, workingDays: getWorkingDaysInWeek(2) },
        3: { entry: 0, out: 0, jasaNett: 0, partNett: 0, bahanCost: 0, partCost: 0, grossProfit: 0, workingDays: getWorkingDaysInWeek(3) },
        4: { entry: 0, out: 0, jasaNett: 0, partNett: 0, bahanCost: 0, partCost: 0, grossProfit: 0, workingDays: getWorkingDaysInWeek(4) },
        5: { entry: 0, out: 0, jasaNett: 0, partNett: 0, bahanCost: 0, partCost: 0, grossProfit: 0, workingDays: getWorkingDaysInWeek(5) },
        total: { entry: 0, out: 0, jasaNett: 0, partNett: 0, bahanCost: 0, partCost: 0, grossProfit: 0, workingDays: 0 }
    };

    weeklyData.total.workingDays = [1,2,3,4,5].reduce((acc, w) => acc + weeklyData[w].workingDays, 0);

    allJobs.forEach(j => {
        if (j.isDeleted) return;

        if (j.actualStartDate) {
            const entryDate = parseDate(j.actualStartDate);
            const w = getWeekNumber(entryDate, selectedYear, selectedMonth);
            if (w >= 1 && w <= 5) {
                weeklyData[w].entry++;
                weeklyData.total.entry++;
            }
        }

        const isOut = j.statusKendaraan?.includes('Sudah Diambil') || j.isClosed;
        const outDateRaw = j.closedAt || j.updatedAt;
        if (isOut && outDateRaw) {
            const outDate = parseDate(outDateRaw);
            const w = getWeekNumber(outDate, selectedYear, selectedMonth);
            if (w >= 1 && w <= 5) {
                weeklyData[w].out++;
                weeklyData.total.out++;
            }
        }

        if (j.hasInvoice) {
            const invDateRaw = j.closedAt || j.createdAt;
            const invDate = parseDate(invDateRaw);
            const w = getWeekNumber(invDate, selectedYear, selectedMonth);
            if (w >= 1 && w <= 5) {
                const est = j.estimateData;
                const cost = j.costData;
                if (est) {
                    weeklyData[w].jasaNett += (est.subtotalJasa || 0);
                    weeklyData[w].partNett += (est.subtotalPart || 0);
                    weeklyData.total.jasaNett += (est.subtotalJasa || 0);
                    weeklyData.total.partNett += (est.subtotalPart || 0);
                }
                if (cost) {
                    weeklyData[w].bahanCost += (cost.hargaModalBahan || 0);
                    weeklyData[w].partCost += (cost.hargaBeliPart || 0);
                    weeklyData.total.bahanCost += (cost.hargaModalBahan || 0);
                    weeklyData.total.partCost += (cost.hargaBeliPart || 0);
                }

                const revJasa = j.hargaJasa || 0;
                const revPart = j.hargaPart || 0;
                const costBahan = cost?.hargaModalBahan || 0;
                const costPart = cost?.hargaBeliPart || 0;
                const costSublet = cost?.jasaExternal || 0;
                const gp = (revJasa + revPart) - (costBahan + costPart + costSublet);

                weeklyData[w].grossProfit += gp;
                weeklyData.total.grossProfit += gp;
            }
        }
    });

    const periodJobs = allJobs.filter(j => {
        if (j.isDeleted) return false;
        const refDate = j.closedAt || j.createdAt; 
        const dateObj = parseDate(refDate);
        return dateObj.getMonth() === selectedMonth && dateObj.getFullYear() === selectedYear;
    });

    const invoicedJobs = periodJobs.filter(j => j.hasInvoice);
    const totalInvoicedUnits = invoicedJobs.length;
    const revenue = invoicedJobs.reduce((acc, j) => acc + (j.estimateData?.grandTotal || 0), 0);
    
    const totalPanels = invoicedJobs.reduce((acc, j) => {
        const panels = j.estimateData?.jasaItems?.reduce((pAcc, item) => pAcc + (item.panelCount || 0), 0) || 0;
        return acc + panels;
    }, 0);

    const grossProfit = invoicedJobs.reduce((acc, j) => {
        const revJasa = j.hargaJasa || 0;
        const revPart = j.hargaPart || 0;
        const totalNetRevenue = revJasa + revPart;
        const costBahan = j.costData?.hargaModalBahan || 0;
        const costPart = j.costData?.hargaBeliPart || 0;
        const costSublet = j.costData?.jasaExternal || 0;
        const totalCOGS = costBahan + costPart + costSublet;
        return acc + (totalNetRevenue - totalCOGS);
    }, 0);

    return { 
        activeJobsCount, 
        completedWaiting, 
        revenue, 
        totalInvoicedUnits, 
        totalPanels, 
        grossProfit,
        weeklyData
    };
  }, [allJobs, selectedMonth, selectedYear, settings.internalHolidays]);

  const doughnutData = {
      labels: ['Invoiced', 'Active'],
      datasets: [{
          data: [stats.totalInvoicedUnits, stats.activeJobsCount],
          backgroundColor: ['#d4af37', '#f5f5f5'],
          hoverBackgroundColor: ['#c5a059', '#e5e5e5'],
          borderWidth: 0,
          borderRadius: 20,
          cutout: '85%'
      }]
  };

  return (
    <div className="animate-fade-in pb-6">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-hairline pb-4">
          <div>
            <h1 className="text-[48px] font-bold font-display uppercase leading-[1] text-ink tracking-tight">{t('title')}</h1>
            <p className="text-[12px] text-mute font-normal mt-2">{t('subtitle')}</p>
          </div>

          <div className="flex flex-col md:flex-row items-end gap-4 mt-6 md:mt-0">
              <div className="flex flex-col items-end px-6 py-4 bg-card-navy text-canvas rounded-[12px]">
                  <p className="text-[12px] font-medium opacity-80 uppercase tracking-widest">{t('card_db')}</p>
                  <p className="text-[18px] font-medium tracking-tight">{totalUnits}</p>
              </div>

              <div className="flex items-center gap-2 bg-soft-cloud rounded-full px-4 py-2">
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 bg-canvas border border-hairline mb-6">
        <StatCard title={t('card2')} value={stats.activeJobsCount} subValue={t('card2_sub')} variant="teal" />
        <StatCard title={t('card3')} value={stats.completedWaiting} subValue={t('card3_sub')} variant="ink" />
        <StatCard title={t('card4')} value={formatCurrency(stats.revenue)} subValue={t('card4_sub')} trend="up" variant="emerald" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 bg-canvas border border-hairline mb-6">
          <StatCard title={t('row1')} value={stats.totalInvoicedUnits} variant="navy" />
          <StatCard title={t('row2')} value={stats.totalPanels.toFixed(1)} />
          <StatCard title={t('row3')} value={formatCurrency(stats.grossProfit)} variant="emerald" />
      </div>

      {/* WEEKLY SIDEBAR SECTION */}
      <div className="flex flex-col md:flex-row bg-canvas border border-hairline mb-6">
          <div className="flex flex-row md:flex-col border-b md:border-b-0 md:border-r border-hairline md:w-[220px] shrink-0 p-4 gap-4 overflow-x-auto">
              <h3 className="hidden md:block text-[12px] font-medium text-ink mb-4">PERFORMA</h3>
              {[1, 2, 3, 4, 5].map((w) => (
                  <button
                      key={w}
                      onClick={() => setActiveWeek(w)}
                      className={`text-left px-4 py-2 rounded-full text-[12px] transition-colors whitespace-nowrap ${activeWeek === w ? 'bg-ink text-canvas' : 'text-ink bg-canvas hover:bg-soft-cloud'}`}
                  >
                      Minggu {w}
                  </button>
              ))}
              <button
                  onClick={() => setActiveWeek('total')}
                  className={`text-left px-4 py-2 rounded-full text-[12px] transition-colors whitespace-nowrap ${activeWeek === 'total' ? 'bg-ink text-canvas' : 'text-ink bg-canvas hover:bg-soft-cloud'}`}
              >
                  Total Keseluruhan
              </button>
          </div>
          
          <div className="flex-1 p-4 md:p-4">
              <div className="mb-4">
                  <h3 className="text-[18px] font-medium text-ink tracking-tight mb-2">
                      {activeWeek === 'total' ? 'TOTAL KESELURUHAN' : `DETAIL MINGGU ${activeWeek}`}
                  </h3>
                  <p className="text-[12px] text-mute font-normal">
                      Total Hari Kerja: <span className="text-ink font-medium">{stats.weeklyData[activeWeek].workingDays} Hari</span>
                  </p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-canvas border border-hairline p-4">
                      <p className="text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Unit Masuk</p>
                      <p className="text-[12px] font-medium text-ink">{stats.weeklyData[activeWeek].entry}</p>
                  </div>
                  <div className="bg-canvas border border-hairline p-4">
                      <p className="text-[12px] font-medium text-mute uppercase tracking-widest mb-2">Unit Keluar</p>
                      <p className="text-[12px] font-medium text-ink">{stats.weeklyData[activeWeek].out}</p>
                  </div>
                  
                  <div className="col-span-2 bg-card-navy text-canvas p-4">
                      <p className="text-[12px] font-medium opacity-80 uppercase tracking-widest mb-2">Total Jasa Nett</p>
                      <p className="text-[12px] font-medium">{formatCurrency(stats.weeklyData[activeWeek].jasaNett)}</p>
                  </div>
                  <div className="col-span-2 bg-card-emerald text-canvas p-4">
                      <p className="text-[12px] font-medium opacity-80 uppercase tracking-widest mb-2">Total Part Nett</p>
                      <p className="text-[12px] font-medium">{formatCurrency(stats.weeklyData[activeWeek].partNett)}</p>
                  </div>

                  <div className="col-span-2 bg-card-ruby text-canvas p-4">
                      <p className="text-[12px] font-medium opacity-80 uppercase tracking-widest mb-2">HPP Bahan</p>
                      <p className="text-[12px] font-medium">{formatCurrency(stats.weeklyData[activeWeek].bahanCost)}</p>
                  </div>
                  <div className="col-span-2 bg-card-ruby text-canvas p-4">
                      <p className="text-[12px] font-medium opacity-80 uppercase tracking-widest mb-2">HPP Part</p>
                      <p className="text-[12px] font-medium">{formatCurrency(stats.weeklyData[activeWeek].partCost)}</p>
                  </div>
                  <div className="col-span-2 md:col-span-4 bg-card-emerald text-canvas p-4 rounded-b-[12px] shadow-sm">
                      <p className="text-[12px] font-medium opacity-80 uppercase tracking-widest mb-2">Gross Profit (GP) Periode Ini</p>
                      <p className="text-[18px] font-medium tracking-tight">{formatCurrency(stats.weeklyData[activeWeek].grossProfit)}</p>
                  </div>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-canvas p-4 border border-hairline flex flex-col">
              <h3 className="text-[12px] font-medium text-ink uppercase tracking-widest mb-8">{t('chart2')}</h3>
              <div className="flex-grow flex items-center justify-center relative">
                  <div className="h-48 w-48">
                      <Doughnut data={doughnutData} options={{ plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(17, 17, 17, 0.95)', cornerRadius: 8 } } }} />
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-[18px] font-medium tracking-tight text-ink">{stats.totalInvoicedUnits}</p>
                      <p className="text-[12px] font-medium text-mute uppercase tracking-widest">Closing</p>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default OverviewDashboard;
