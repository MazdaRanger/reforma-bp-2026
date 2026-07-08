
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
  <div className="bg-card p-6 rounded-md shadow-sm border border-border">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-xs font-semibold text-textSecondary uppercase tracking-widest">{title}</p>
        <h3 className="text-2xl font-bold text-textPrimary mt-2 tracking-tight">{value}</h3>
        {subValue && (
            <div className="flex items-center gap-1.5 mt-3">
                <p className="text-xs font-semibold text-textSecondary">{trend === 'up' ? '↗ ' : ''}{subValue}</p>
            </div>
        )}
        {info && <p className="text-xs text-textSecondary mt-1 italic">{info}</p>}
      </div>
    </div>
  </div>
);

const OverviewDashboard: React.FC<OverviewProps> = ({ allJobs, totalUnits, settings, onNavigate }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activeWeek, setActiveWeek] = useState<number | 'total'>(1);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const lang = settings.language || 'id';

  // Helper untuk parsing tanggal (Timestamp Firebase atau Date Object) agar robust
  const parseDate = (dateInput: any): Date => {
      if (!dateInput) return new Date();
      if (dateInput instanceof Date) return dateInput;
      if (typeof dateInput.toDate === 'function') return dateInput.toDate();
      if (dateInput.seconds) return new Date(dateInput.seconds * 1000);
      const parsed = new Date(dateInput);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  // TRANSLATIONS
  const t = (key: string) => {
      const dict: any = {
          id: {
              title: "Overview Dashboard",
              subtitle: "Pantau performa operasional & finansial bengkel anda.",
              card_db: "Total Database",
              card2: "Work In Progress (WIP)",
              card2_sub: "Unit sedang dikerjakan",
              card3: "Unit Siap Ambil",
              card3_sub: "Menunggu penyerahan",
              card4: "Revenue (Terfaktur)",
              card4_sub: "Total bill periode ini",
              row1: "Unit Terfaktur",
              row2: "Total Produksi Panel",
              row3: "Gross Profit (Real)",
              chart1: "Distribusi Produksi Aktif",
              chart2: "Rasio Faktur"
          },
          en: {
              title: "Overview Dashboard",
              subtitle: "Monitor your workshop's operational & financial performance.",
              card_db: "Total Database",
              card2: "Work In Progress (WIP)",
              card2_sub: "Active jobs on floor",
              card3: "Ready for Delivery",
              card3_sub: "Waiting for handover",
              card4: "Revenue (Invoiced)",
              card4_sub: "Total bill this period",
              row1: "Invoiced Units",
              row2: "Production Panels",
              row3: "Gross Profit (Realized)",
              chart1: "Active Production Stages",
              chart2: "Invoice Ratio"
          }
      };
      return dict[lang][key] || key;
  };

  const stats = useMemo(() => {
    // 1. WIP Stats
    const activeJobsList = allJobs.filter(j => j.woNumber && !j.isClosed && !j.isDeleted);
    const activeJobsCount = activeJobsList.length;
    
    const completedWaiting = allJobs.filter(j => 
        !j.isClosed && 
        !j.isDeleted && 
        (j.statusKendaraan === 'Selesai (Tunggu Pengambilan)' || j.statusPekerjaan?.includes('Selesai'))
    ).length;

    // --- WEEKLY LOGIC ---
    const getWorkingDaysInWeek = (week: number) => {
        let startDay = (week - 1) * 7 + 1;
        let endDay = week * 7;
        let lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        if (startDay > lastDayOfMonth) return 0;
        if (endDay > lastDayOfMonth) endDay = lastDayOfMonth;
        
        let workingDays = 0;
        for (let d = startDay; d <= endDay; d++) {
            let currDate = new Date(selectedYear, selectedMonth, d);
            let dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            if (currDate.getDay() !== 0 && !(settings.internalHolidays || []).includes(dateStr)) {
                workingDays++;
            }
        }
        return workingDays;
    };

    const getWeekNumber = (date: Date, year: number, month: number) => {
        if (date.getMonth() !== month || date.getFullYear() !== year) return -1;
        const day = date.getDate();
        if (day <= 7) return 1;
        if (day <= 14) return 2;
        if (day <= 21) return 3;
        if (day <= 28) return 4;
        return 5;
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

        // Weekly Entry
        if (j.actualStartDate) {
            const entryDate = parseDate(j.actualStartDate);
            const w = getWeekNumber(entryDate, selectedYear, selectedMonth);
            if (w >= 1 && w <= 5) {
                weeklyData[w].entry++;
                weeklyData.total.entry++;
            }
        }

        // Weekly Out
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

        // Weekly Revenue Nett & Costs
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

    // 2. Filtered Stats
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
      backgroundColor: 'rgba(79, 70, 229, 0.8)',
      borderRadius: 8,
      hoverBackgroundColor: 'rgba(79, 70, 229, 1)',
    }]
  };

  const doughnutData = {
      labels: ['Invoiced', 'Active'],
      datasets: [{
          data: [stats.totalInvoicedUnits, stats.activeJobsCount],
          backgroundColor: ['#10B981', '#6366F1'],
          borderWidth: 0,
          cutout: '70%'
      }]
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-card border border-border p-8 rounded-lg shadow-sm relative overflow-hidden">
          
          <div className="relative z-10 flex-grow">
            <h1 className="text-3xl font-bold tracking-tighter text-textPrimary">{t('title')}</h1>
            <p className="text-textSecondary font-medium mt-1">{t('subtitle')}</p>
          </div>

          {/* Database Unit Info (Text Only) */}
          <div className="relative z-10 flex flex-col items-end mr-6 border-r border-border pr-6">
              <p className="text-xs font-semibold text-textSecondary uppercase tracking-widest flex items-center gap-2">
                  {t('card_db')}
              </p>
              <p className="text-3xl font-bold text-textPrimary">{totalUnits}</p>
          </div>

          <div className="flex items-center gap-3 bg-muted p-2 rounded-md border border-border relative z-10">
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="bg-transparent border-none text-sm font-bold focus:ring-0 cursor-pointer py-2">
                  {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                      <option key={i} value={i} className="text-gray-900">{m}</option>
                  ))}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-transparent border-none text-sm font-bold focus:ring-0 cursor-pointer border-l border-border pl-4 py-2">
                  {[2024, 2025, 2026].map(y => <option key={y} value={y} className="text-gray-900">{y}</option>)}
              </select>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title={t('card2')} value={stats.activeJobsCount} subValue={t('card2_sub')} />
        <StatCard title={t('card3')} value={stats.completedWaiting} subValue={t('card3_sub')} />
        <StatCard title={t('card4')} value={formatCurrency(stats.revenue)} subValue={t('card4_sub')} trend="up" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card p-6 rounded-md border border-border shadow-sm flex items-center gap-6">
              <div><p className="text-xs font-semibold text-textSecondary uppercase tracking-widest">{t('row1')}</p><h4 className="text-2xl font-bold text-textPrimary">{stats.totalInvoicedUnits}</h4></div>
          </div>
          <div className="bg-card p-6 rounded-md border border-border shadow-sm flex items-center gap-6">
              <div><p className="text-xs font-semibold text-textSecondary uppercase tracking-widest">{t('row2')}</p><h4 className="text-2xl font-bold text-textPrimary">{stats.totalPanels.toFixed(1)}</h4></div>
          </div>
          <div className="bg-card p-6 rounded-md border border-border shadow-sm flex items-center gap-6">
              <div><p className="text-xs font-semibold text-textSecondary uppercase tracking-widest">{t('row3')}</p><h4 className="text-2xl font-bold text-primary">{formatCurrency(stats.grossProfit)}</h4></div>
          </div>
      </div>

      {/* WEEKLY SIDEBAR SECTION */}
      <div className="bg-card p-6 rounded-lg shadow-sm border border-border flex h-auto md:h-[420px] transition-all">
          {/* Sidebar */}
          <div 
              className={`flex flex-col gap-2 transition-all duration-300 ease-in-out border-r border-gray-100 pr-4 ${isSidebarHovered ? 'w-56' : 'w-16'}`}
              onMouseEnter={() => setIsSidebarHovered(true)}
              onMouseLeave={() => setIsSidebarHovered(false)}
          >
              <div className="mb-4 pl-2 h-10 flex items-center">
                  <span className={`ml-3 font-bold text-textPrimary whitespace-nowrap transition-opacity duration-300 ${isSidebarHovered ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                      Performa Mingguan
                  </span>
              </div>
              {[1, 2, 3, 4, 5].map((w) => (
                  <button
                      key={w}
                      onMouseEnter={() => setActiveWeek(w)}
                      className={`flex items-center p-3 rounded-md transition-all duration-300 whitespace-nowrap overflow-hidden group ${activeWeek === w ? 'bg-primary text-white shadow-sm' : 'hover:bg-muted text-textSecondary'}`}
                  >
                      <span className={`font-bold text-base min-w-[24px] text-center transition-colors ${activeWeek === w ? 'text-white' : 'text-textSecondary group-hover:text-primary'}`}>M{w}</span>
                      <span className={`ml-4 font-semibold transition-opacity duration-300 ${isSidebarHovered ? 'opacity-100' : 'opacity-0 w-0'}`}>Minggu ke - {w}</span>
                  </button>
              ))}
              <div className="flex-grow"></div>
              <button
                  onMouseEnter={() => setActiveWeek('total')}
                  className={`flex items-center p-3 rounded-md transition-all duration-300 whitespace-nowrap overflow-hidden group ${activeWeek === 'total' ? 'bg-secondary text-textPrimary shadow-sm' : 'hover:bg-muted text-textSecondary'}`}
              >
                  <span className={`font-bold text-base min-w-[24px] text-center transition-colors ${activeWeek === 'total' ? 'text-textPrimary' : 'text-textSecondary group-hover:text-textPrimary'}`}>T</span>
                  <span className={`ml-4 font-semibold transition-opacity duration-300 ${isSidebarHovered ? 'opacity-100' : 'opacity-0 w-0'}`}>Grand Total</span>
              </button>
          </div>
          
          {/* Content Area */}
          <div className="flex-1 pl-6 md:pl-10 overflow-y-auto flex flex-col justify-center">
              <div className="mb-8">
                  <h3 className="text-2xl font-bold text-textPrimary tracking-tight">
                      {activeWeek === 'total' ? 'Total Keseluruhan' : `Detail Minggu ke - ${activeWeek}`}
                  </h3>
                  <p className="text-sm text-textSecondary font-semibold mt-1 flex items-center gap-2">
                      Total Hari Kerja: <span className="text-primary">{stats.weeklyData[activeWeek].workingDays} Hari</span>
                  </p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  {/* Unit Stats */}
                  <div className="bg-muted p-5 rounded-md border border-border">
                      <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-widest mb-1">Unit Masuk</p>
                      <p className="text-2xl font-bold text-textPrimary">{stats.weeklyData[activeWeek].entry}</p>
                  </div>
                  <div className="bg-muted p-5 rounded-md border border-border">
                      <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-widest mb-1">Unit Keluar</p>
                      <p className="text-2xl font-bold text-textPrimary">{stats.weeklyData[activeWeek].out}</p>
                  </div>
                  
                  {/* Revenue Stats */}
                  <div className="col-span-2 bg-muted p-5 rounded-md border border-border">
                      <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-widest mb-1">Total Jasa Nett</p>
                      <p className="text-2xl font-bold text-textPrimary">{formatCurrency(stats.weeklyData[activeWeek].jasaNett)}</p>
                  </div>
                  <div className="col-span-2 bg-muted p-5 rounded-md border border-border">
                      <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-widest mb-1">Total Part Nett</p>
                      <p className="text-2xl font-bold text-textPrimary">{formatCurrency(stats.weeklyData[activeWeek].partNett)}</p>
                  </div>

                  {/* Expenses Stats */}
                  <div className="col-span-2 bg-muted p-5 rounded-md border border-border">
                      <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-widest mb-1">HPP Bahan</p>
                      <p className="text-2xl font-bold text-textPrimary">{formatCurrency(stats.weeklyData[activeWeek].bahanCost)}</p>
                  </div>
                  <div className="col-span-2 bg-muted p-5 rounded-md border border-border">
                      <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-widest mb-1">HPP Part</p>
                      <p className="text-2xl font-bold text-textPrimary">{formatCurrency(stats.weeklyData[activeWeek].partCost)}</p>
                  </div>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card p-8 rounded-lg shadow-sm border border-border">
              <div className="flex justify-between items-center mb-8"><h3 className="text-lg font-semibold text-textPrimary">{t('chart1')}</h3><button onClick={() => onNavigate('job_control')} className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">Kanban Board &rarr;</button></div>
              <div className="h-80"><Bar data={barChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
          </div>
          <div className="bg-card p-8 rounded-lg shadow-sm border border-border flex flex-col"><h3 className="text-lg font-semibold text-textPrimary mb-6">{t('chart2')}</h3><div className="flex-grow flex items-center justify-center relative"><div className="h-56 w-56"><Doughnut data={doughnutData} options={{ plugins: { legend: { display: false } } }} /></div><div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><p className="text-3xl font-bold text-textPrimary">{stats.totalInvoicedUnits}</p><p className="text-xs font-semibold text-textSecondary uppercase">Closing</p></div></div></div>
      </div>
    </div>
  );
};

export default OverviewDashboard;
