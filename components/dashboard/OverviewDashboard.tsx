
import React, { useState, useMemo } from 'react';
import { Job, Settings } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

interface OverviewProps {
  allJobs: Job[];
  totalUnits: number;
  settings: Settings;
  onNavigate: (view: string) => void;
}

const StatCard = ({ title, value, subValue, trend, info }: any) => (
  <div className="bg-canvas p-6 md:p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-hairline last:border-0 md:last:border-r-0">
    <div>
        <p className="text-[14px] font-medium text-mute uppercase tracking-widest">{title}</p>
        <h3 className="text-[32px] font-medium text-ink mt-2 tracking-tight">{value}</h3>
    </div>
    {(subValue || info) && (
        <div className="mt-8 pt-4 border-t border-hairline">
            {subValue && (
                <p className="text-[14px] font-medium text-mute">{trend === 'up' ? '↗ ' : ''}{subValue}</p>
            )}
            {info && <p className="text-[14px] text-mute mt-1 italic">{info}</p>}
        </div>
    )}
  </div>
);

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
              chart1: "Distribusi Produksi Aktif",
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
              chart1: "Active Production Stages",
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
        1: { entry: 0, out: 0, jasaNett: 0, partNett: 0, bahanCost: 0, partCost: 0, workingDays: getWorkingDaysInWeek(1) },
        2: { entry: 0, out: 0, jasaNett: 0, partNett: 0, bahanCost: 0, partCost: 0, workingDays: getWorkingDaysInWeek(2) },
        3: { entry: 0, out: 0, jasaNett: 0, partNett: 0, bahanCost: 0, partCost: 0, workingDays: getWorkingDaysInWeek(3) },
        4: { entry: 0, out: 0, jasaNett: 0, partNett: 0, bahanCost: 0, partCost: 0, workingDays: getWorkingDaysInWeek(4) },
        5: { entry: 0, out: 0, jasaNett: 0, partNett: 0, bahanCost: 0, partCost: 0, workingDays: getWorkingDaysInWeek(5) },
        total: { entry: 0, out: 0, jasaNett: 0, partNett: 0, bahanCost: 0, partCost: 0, workingDays: 0 }
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

    const statusCounts: Record<string, number> = {};
    allJobs.filter(j => !j.isClosed && !j.isDeleted && j.statusPekerjaan).forEach(j => {
      const status = j.statusPekerjaan || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return { 
        activeJobsCount, 
        completedWaiting, 
        revenue, 
        statusCounts, 
        totalInvoicedUnits, 
        totalPanels, 
        grossProfit,
        weeklyData
    };
  }, [allJobs, selectedMonth, selectedYear, settings.internalHolidays]);

  const barChartData = {
    labels: Object.keys(stats.statusCounts),
    datasets: [{
      label: 'Units',
      data: Object.values(stats.statusCounts),
      backgroundColor: '#111111',
      hoverBackgroundColor: '#39393b',
    }]
  };

  const doughnutData = {
      labels: ['Invoiced', 'Active'],
      datasets: [{
          data: [stats.totalInvoicedUnits, stats.activeJobsCount],
          backgroundColor: ['#111111', '#cacacb'],
          borderWidth: 0,
          cutout: '75%'
      }]
  };

  return (
    <div className="animate-fade-in pb-[48px]">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-[48px] border-b border-hairline pb-[24px]">
          <div>
            <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">{t('title')}</h1>
            <p className="text-[16px] text-mute font-normal mt-[18px]">{t('subtitle')}</p>
          </div>

          <div className="flex flex-col md:flex-row items-end gap-6 mt-6 md:mt-0">
              <div className="flex flex-col items-end pr-6">
                  <p className="text-[14px] font-medium text-mute uppercase tracking-widest">{t('card_db')}</p>
                  <p className="text-[32px] font-medium text-ink tracking-tight">{totalUnits}</p>
              </div>

              <div className="flex items-center gap-2 bg-soft-cloud rounded-full px-4 py-2">
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 bg-canvas border border-hairline mb-[48px]">
        <StatCard title={t('card2')} value={stats.activeJobsCount} subValue={t('card2_sub')} />
        <StatCard title={t('card3')} value={stats.completedWaiting} subValue={t('card3_sub')} />
        <StatCard title={t('card4')} value={formatCurrency(stats.revenue)} subValue={t('card4_sub')} trend="up" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 bg-canvas border border-hairline mb-[48px]">
          <StatCard title={t('row1')} value={stats.totalInvoicedUnits} />
          <StatCard title={t('row2')} value={stats.totalPanels.toFixed(1)} />
          <StatCard title={t('row3')} value={formatCurrency(stats.grossProfit)} />
      </div>

      {/* WEEKLY SIDEBAR SECTION */}
      <div className="flex flex-col md:flex-row bg-canvas border border-hairline mb-[48px]">
          <div className="flex flex-row md:flex-col border-b md:border-b-0 md:border-r border-hairline md:w-[220px] shrink-0 p-6 md:p-8 gap-4 overflow-x-auto">
              <h3 className="hidden md:block text-[16px] font-medium text-ink mb-[18px]">PERFORMA</h3>
              {[1, 2, 3, 4, 5].map((w) => (
                  <button
                      key={w}
                      onClick={() => setActiveWeek(w)}
                      className={cn(
                          "text-left px-4 py-2 rounded-full text-[16px] transition-colors whitespace-nowrap",
                          activeWeek === w ? "bg-ink text-canvas" : "text-ink bg-canvas hover:bg-soft-cloud"
                      )}
                  >
                      Minggu {w}
                  </button>
              ))}
              <button
                  onClick={() => setActiveWeek('total')}
                  className={cn(
                      "text-left px-4 py-2 rounded-full text-[16px] transition-colors whitespace-nowrap",
                      activeWeek === 'total' ? "bg-ink text-canvas" : "text-ink bg-canvas hover:bg-soft-cloud"
                  )}
              >
                  Total Keseluruhan
              </button>
          </div>
          
          <div className="flex-1 p-6 md:p-12">
              <div className="mb-[24px]">
                  <h3 className="text-[32px] font-medium text-ink tracking-tight mb-2">
                      {activeWeek === 'total' ? 'TOTAL KESELURUHAN' : `DETAIL MINGGU ${activeWeek}`}
                  </h3>
                  <p className="text-[16px] text-mute font-normal">
                      Total Hari Kerja: <span className="text-ink font-medium">{stats.weeklyData[activeWeek].workingDays} Hari</span>
                  </p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-[24px]">
                  <div className="bg-soft-cloud p-6">
                      <p className="text-[14px] font-medium text-mute uppercase tracking-widest mb-2">Unit Masuk</p>
                      <p className="text-[24px] font-medium text-ink">{stats.weeklyData[activeWeek].entry}</p>
                  </div>
                  <div className="bg-soft-cloud p-6">
                      <p className="text-[14px] font-medium text-mute uppercase tracking-widest mb-2">Unit Keluar</p>
                      <p className="text-[24px] font-medium text-ink">{stats.weeklyData[activeWeek].out}</p>
                  </div>
                  
                  <div className="col-span-2 bg-soft-cloud p-6">
                      <p className="text-[14px] font-medium text-mute uppercase tracking-widest mb-2">Total Jasa Nett</p>
                      <p className="text-[24px] font-medium text-ink">{formatCurrency(stats.weeklyData[activeWeek].jasaNett)}</p>
                  </div>
                  <div className="col-span-2 bg-soft-cloud p-6">
                      <p className="text-[14px] font-medium text-mute uppercase tracking-widest mb-2">Total Part Nett</p>
                      <p className="text-[24px] font-medium text-ink">{formatCurrency(stats.weeklyData[activeWeek].partNett)}</p>
                  </div>

                  <div className="col-span-2 bg-soft-cloud p-6">
                      <p className="text-[14px] font-medium text-mute uppercase tracking-widest mb-2">HPP Bahan</p>
                      <p className="text-[24px] font-medium text-ink">{formatCurrency(stats.weeklyData[activeWeek].bahanCost)}</p>
                  </div>
                  <div className="col-span-2 bg-soft-cloud p-6">
                      <p className="text-[14px] font-medium text-mute uppercase tracking-widest mb-2">HPP Part</p>
                      <p className="text-[24px] font-medium text-ink">{formatCurrency(stats.weeklyData[activeWeek].partCost)}</p>
                  </div>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[24px]">
          <div className="lg:col-span-2 bg-canvas p-6 border border-hairline">
              <div className="flex justify-between items-center mb-8">
                  <h3 className="text-[16px] font-medium text-ink uppercase tracking-widest">{t('chart1')}</h3>
                  <button onClick={() => onNavigate('job_control')} className="text-[14px] font-medium text-ink hover:underline">
                      Kanban Board &rarr;
                  </button>
              </div>
              <div className="h-72"><Bar data={barChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
          </div>
          <div className="bg-canvas p-6 border border-hairline flex flex-col">
              <h3 className="text-[16px] font-medium text-ink uppercase tracking-widest mb-8">{t('chart2')}</h3>
              <div className="flex-grow flex items-center justify-center relative">
                  <div className="h-48 w-48"><Doughnut data={doughnutData} options={{ plugins: { legend: { display: false } } }} /></div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-[32px] font-medium tracking-tight text-ink">{stats.totalInvoicedUnits}</p>
                      <p className="text-[14px] font-medium text-mute uppercase tracking-widest">Closing</p>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default OverviewDashboard;
