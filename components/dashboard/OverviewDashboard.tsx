
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
              card_forecast: "Forecast Gross Profit",
              card_forecast_sub: "Potensi Laba (WO Belum Faktur)",
              card_forecast_info: "Asumsi: Bahan 15%, Part 80%",
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
              card_forecast: "Forecast Gross Profit",
              card_forecast_sub: "Potential Profit (Non-Invoiced)",
              card_forecast_info: "Assumed: Mat 15%, Part 80%",
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
    // 1. WIP Stats - Unit yang memiliki WO dan belum ditutup (Active Production)
    const activeJobsList = allJobs.filter(j => j.woNumber && !j.isClosed && !j.isDeleted);
    const activeJobsCount = activeJobsList.length;
    
    // Unit Selesai (Ready for Delivery) - Cek status text yang mungkin panjang
    const completedWaiting = allJobs.filter(j => 
        !j.isClosed && 
        !j.isDeleted && 
        (j.statusKendaraan === 'Selesai (Tunggu Pengambilan)' || j.statusPekerjaan?.includes('Selesai'))
    ).length;

    // --- FORECAST LOGIC (ESTIMASI LABA DARI WIP) ---
    // UPDATED: Only calculate jobs that have WO but DO NOT have invoice yet
    const forecastJobsList = allJobs.filter(j => 
        j.woNumber &&       // Sudah jadi WO
        !j.hasInvoice &&    // Belum jadi Faktur (Uang belum masuk/piutang belum tercatat real)
        !j.isDeleted
    );

    let potentialRevJasa = 0;
    let potentialRevPart = 0;

    forecastJobsList.forEach(j => {
        const est = j.estimateData;
        if (est) {
            potentialRevJasa += (est.subtotalJasa || 0);
            potentialRevPart += (est.subtotalPart || 0);
        }
    });

    // Hitung asumsi biaya untuk Forecast
    const assumedMatCost = potentialRevJasa * 0.15; // 15% dari Jasa untuk Bahan
    const assumedPartCost = potentialRevPart * 0.80; // 80% dari Part (margin 20%) untuk HPP Part
    const forecastGP = (potentialRevJasa + potentialRevPart) - (assumedMatCost + assumedPartCost);

    // 2. Filtered Stats (REALIZED - BASED ON INVOICE / CLOSING DATE)
    const periodJobs = allJobs.filter(j => {
        if (j.isDeleted) return false;
        // Gunakan closedAt jika ada (prioritas untuk laporan keuangan), jika tidak gunakan createdAt
        const refDate = j.closedAt || j.createdAt; 
        const dateObj = parseDate(refDate);
        return dateObj.getMonth() === selectedMonth && dateObj.getFullYear() === selectedYear;
    });

    // HANYA MENGHITUNG YANG SUDAH TERFAKTUR (HasInvoice = true)
    const invoicedJobs = periodJobs.filter(j => j.hasInvoice);
    const totalInvoicedUnits = invoicedJobs.length;
    
    // REVENUE: Total Bill (Termasuk PPN) untuk ditampilkan sebagai Omzet Kotor
    const revenue = invoicedJobs.reduce((acc, j) => acc + (j.estimateData?.grandTotal || 0), 0);
    
    const totalPanels = invoicedJobs.reduce((acc, j) => {
        const panels = j.estimateData?.jasaItems?.reduce((pAcc, item) => pAcc + (item.panelCount || 0), 0) || 0;
        return acc + panels;
    }, 0);

    // --- REALIZED GROSS PROFIT CALCULATION ---
    // Rumus: (Jasa + Part) - (Modal Bahan + Beli Part + Jasa Luar)
    // Note: Tidak menyertakan PPN dalam perhitungan Profit Bengkel
    const grossProfit = invoicedJobs.reduce((acc, j) => {
        // Revenue Components (Net without PPN)
        const revJasa = j.hargaJasa || 0;
        const revPart = j.hargaPart || 0;
        const totalNetRevenue = revJasa + revPart;

        // Cost Components (Real Recorded Costs) - SAFETY CHECK ADDED
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
        grossProfit, // Corrected Realized GP
        forecastGP,
        forecastCount: forecastJobsList.length
    };
  }, [allJobs, selectedMonth, selectedYear]);

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Forecast GP Card */}
        <StatCard 
            title={t('card_forecast')} 
            value={formatCurrency(stats.forecastGP)} 
            icon={Sparkles} 
            color="bg-purple-600" 
            subValue={`${stats.forecastCount} Unit WO Belum Faktur`} 
            info={t('card_forecast_info')}
        />
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
