
import React, { useState, useMemo } from 'react';
import { Job, Settings } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement
} from 'chart.js';
import { 
    Car, Wrench, CheckCircle, TrendingUp, Calendar, 
    FileCheck, Layers, Landmark, ArrowUpRight, 
    Briefcase, Users, ChevronRight, PieChart, Activity, Sparkles, Database
} from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

interface OverviewProps {
  allJobs: Job[];
  totalUnits: number;
  settings: Settings;
  onNavigate: (view: string) => void;
}

const StatCard = ({ title, value, icon: Icon, color, subValue, trend, info }: any) => (
  <div className="bg-white/70 backdrop-blur-lg p-6 rounded-3xl shadow-lg shadow-indigo-100/50 border border-white/60 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group overflow-hidden relative">
    <div className={`absolute -right-6 -bottom-6 opacity-5 group-hover:scale-125 transition-transform duration-500`}>
        <Icon size={140}/>
    </div>
    <div className="flex justify-between items-start relative z-10">
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</p>
        <h3 className="text-3xl font-extrabold text-slate-800 mt-2 tracking-tight">{value}</h3>
        {subValue && (
            <div className="flex items-center gap-1.5 mt-3">
                {trend === 'up' ? <ArrowUpRight size={16} className="text-emerald-500"/> : null}
                <p className="text-xs font-semibold text-slate-500">{subValue}</p>
            </div>
        )}
        {info && <p className="text-xs text-slate-400 mt-1 italic">{info}</p>}
      </div>
      <div className={`p-3.5 rounded-2xl shadow-lg ${color} text-white`}>
        <Icon size={26} />
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-slate-900 p-8 rounded-[32px] text-white shadow-2xl shadow-slate-900/20 relative overflow-hidden">
          <div className="absolute right-0 top-0 p-4 opacity-10 rotate-12 scale-150"><Activity size={200}/></div>
          
          <div className="relative z-10 flex-grow">
            <h1 className="text-4xl font-black tracking-tighter">{t('title')}</h1>
            <p className="text-indigo-200 font-medium mt-1 text-lg">{t('subtitle')}</p>
          </div>

          {/* Database Unit Info (Text Only) */}
          <div className="relative z-10 flex flex-col items-end mr-6 border-r border-white/20 pr-6">
              <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest flex items-center gap-2">
                  <Database size={14}/> {t('card_db')}
              </p>
              <p className="text-4xl font-black text-white">{totalUnits}</p>
          </div>

          <div className="flex items-center gap-3 bg-white/10 p-2 rounded-2xl backdrop-blur-md border border-white/10 relative z-10">
              <Calendar className="text-indigo-300 ml-2" size={20}/>
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="bg-transparent border-none text-sm font-bold focus:ring-0 cursor-pointer py-2">
                  {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                      <option key={i} value={i} className="text-gray-900">{m}</option>
                  ))}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-transparent border-none text-sm font-bold focus:ring-0 cursor-pointer border-l border-white/20 pl-4 py-2">
                  {[2024, 2025, 2026].map(y => <option key={y} value={y} className="text-gray-900">{y}</option>)}
              </select>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title={t('card2')} value={stats.activeJobsCount} icon={Wrench} color="bg-indigo-600" subValue={t('card2_sub')} />
        <StatCard title={t('card3')} value={stats.completedWaiting} icon={Car} color="bg-blue-500" subValue={t('card3_sub')} />
        <StatCard title={t('card4')} value={formatCurrency(stats.revenue)} icon={Landmark} color="bg-emerald-600" subValue={t('card4_sub')} trend="up" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-white/60 shadow-lg shadow-indigo-100/30 flex items-center gap-6 border-l-4 border-l-indigo-600">
              <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl"><FileCheck size={32}/></div>
              <div><p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('row1')}</p><h4 className="text-3xl font-extrabold text-slate-800">{stats.totalInvoicedUnits}</h4></div>
          </div>
          <div className="bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-white/60 shadow-lg shadow-indigo-100/30 flex items-center gap-6 border-l-4 border-l-orange-500">
              <div className="p-4 bg-orange-50 text-orange-600 rounded-2xl"><Layers size={32}/></div>
              <div><p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('row2')}</p><h4 className="text-3xl font-extrabold text-slate-800">{stats.totalPanels.toFixed(1)}</h4></div>
          </div>
          <div className="bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-white/60 shadow-lg shadow-indigo-100/30 flex items-center gap-6 border-l-4 border-l-emerald-500">
              <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><TrendingUp size={32}/></div>
              <div><p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('row3')}</p><h4 className="text-3xl font-extrabold text-emerald-700">{formatCurrency(stats.grossProfit)}</h4></div>
          </div>
      </div>

      {/* WEEKLY SIDEBAR SECTION */}
      <div className="bg-white/70 backdrop-blur-md p-6 rounded-[32px] shadow-lg shadow-indigo-100/30 border border-white/60 flex h-auto md:h-[420px] transition-all">
          {/* Sidebar */}
          <div 
              className={`flex flex-col gap-2 transition-all duration-300 ease-in-out border-r border-gray-100 pr-4 ${isSidebarHovered ? 'w-56' : 'w-16'}`}
              onMouseEnter={() => setIsSidebarHovered(true)}
              onMouseLeave={() => setIsSidebarHovered(false)}
          >
              <div className="mb-4 pl-2 h-10 flex items-center">
                  <Calendar className="text-indigo-600 shrink-0" size={24}/>
                  <span className={`ml-3 font-black text-slate-800 whitespace-nowrap transition-opacity duration-300 ${isSidebarHovered ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                      Performa Mingguan
                  </span>
              </div>
              {[1, 2, 3, 4, 5].map((w) => (
                  <button
                      key={w}
                      onMouseEnter={() => setActiveWeek(w)}
                      className={`flex items-center p-3 rounded-2xl transition-all duration-300 whitespace-nowrap overflow-hidden group ${activeWeek === w ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-indigo-50 text-slate-600'}`}
                  >
                      <span className={`font-black text-lg min-w-[24px] text-center transition-colors ${activeWeek === w ? 'text-white' : 'text-indigo-300 group-hover:text-indigo-600'}`}>M{w}</span>
                      <span className={`ml-4 font-bold transition-opacity duration-300 ${isSidebarHovered ? 'opacity-100' : 'opacity-0 w-0'}`}>Minggu ke - {w}</span>
                  </button>
              ))}
              <div className="flex-grow"></div>
              <button
                  onMouseEnter={() => setActiveWeek('total')}
                  className={`flex items-center p-3 rounded-2xl transition-all duration-300 whitespace-nowrap overflow-hidden group ${activeWeek === 'total' ? 'bg-emerald-600 text-white shadow-md' : 'hover:bg-emerald-50 text-slate-600'}`}
              >
                  <span className={`font-black text-lg min-w-[24px] text-center transition-colors ${activeWeek === 'total' ? 'text-white' : 'text-emerald-300 group-hover:text-emerald-600'}`}>T</span>
                  <span className={`ml-4 font-bold transition-opacity duration-300 ${isSidebarHovered ? 'opacity-100' : 'opacity-0 w-0'}`}>Grand Total</span>
              </button>
          </div>
          
          {/* Content Area */}
          <div className="flex-1 pl-6 md:pl-10 overflow-y-auto flex flex-col justify-center">
              <div className="mb-8">
                  <h3 className="text-3xl font-black text-slate-800 tracking-tight">
                      {activeWeek === 'total' ? 'Total Keseluruhan' : `Detail Minggu ke - ${activeWeek}`}
                  </h3>
                  <p className="text-sm text-slate-500 font-bold mt-1 flex items-center gap-2">
                      <Activity size={14}/> Total Hari Kerja: <span className="text-indigo-600">{stats.weeklyData[activeWeek].workingDays} Hari</span>
                  </p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  {/* Unit Stats */}
                  <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100">
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Unit Masuk</p>
                      <p className="text-3xl font-black text-indigo-900">{stats.weeklyData[activeWeek].entry}</p>
                  </div>
                  <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100">
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Unit Keluar</p>
                      <p className="text-3xl font-black text-emerald-900">{stats.weeklyData[activeWeek].out}</p>
                  </div>
                  
                  {/* Revenue Stats */}
                  <div className="col-span-2 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Jasa Nett</p>
                      <p className="text-3xl font-black text-slate-800">{formatCurrency(stats.weeklyData[activeWeek].jasaNett)}</p>
                  </div>
                  <div className="col-span-2 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Part Nett</p>
                      <p className="text-3xl font-black text-slate-800">{formatCurrency(stats.weeklyData[activeWeek].partNett)}</p>
                  </div>

                  {/* Expenses Stats */}
                  <div className="col-span-2 bg-rose-50/50 p-5 rounded-2xl border border-rose-100">
                      <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">HPP Bahan</p>
                      <p className="text-2xl font-black text-rose-900">{formatCurrency(stats.weeklyData[activeWeek].bahanCost)}</p>
                  </div>
                  <div className="col-span-2 bg-orange-50/50 p-5 rounded-2xl border border-orange-100">
                      <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">HPP Part</p>
                      <p className="text-2xl font-black text-orange-900">{formatCurrency(stats.weeklyData[activeWeek].partCost)}</p>
                  </div>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/70 backdrop-blur-md p-8 rounded-[32px] shadow-lg shadow-indigo-100/30 border border-white/60">
              <div className="flex justify-between items-center mb-8"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Activity className="text-indigo-600" size={20}/> {t('chart1')}</h3><button onClick={() => onNavigate('job_control')} className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">Kanban Board <ChevronRight size={14}/></button></div>
              <div className="h-80"><Bar data={barChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
          </div>
          <div className="bg-white/70 backdrop-blur-md p-8 rounded-[32px] shadow-lg shadow-indigo-100/30 border border-white/60 flex flex-col"><h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><PieChart className="text-emerald-500" size={20}/> {t('chart2')}</h3><div className="flex-grow flex items-center justify-center relative"><div className="h-56 w-56"><Doughnut data={doughnutData} options={{ plugins: { legend: { display: false } } }} /></div><div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><p className="text-4xl font-extrabold text-slate-800">{stats.totalInvoicedUnits}</p><p className="text-xs font-bold text-slate-400 uppercase">Closing</p></div></div></div>
      </div>
    </div>
  );
};

export default OverviewDashboard;
