
import React, { useState, useMemo } from 'react';
import { Job, Settings } from '../../types';
import { Bar, Doughnut, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { 
    TrendingUp, Shield, User, MapPin, Car, Palette, 
    ChevronRight, Filter, Calendar, Award, Info
} from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface BIProps {
  jobs: Job[];
  settings: Settings;
}

const BusinessIntelligenceView: React.FC<BIProps> = ({ jobs, settings }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const data = useMemo(() => {
    // 1. Filter jobs by period
    const periodJobs = jobs.filter(j => {
        if (j.isDeleted || !j.woNumber) return false;
        const dateObj = j.closedAt?.toDate ? j.closedAt.toDate() : (j.createdAt?.toDate ? j.createdAt.toDate() : new Date());
        return dateObj.getMonth() === selectedMonth && dateObj.getFullYear() === selectedYear;
    });

    // 2. Insurance vs Private
    const insCount = periodJobs.filter(j => j.namaAsuransi !== 'Umum / Pribadi').length;
    const priCount = periodJobs.filter(j => j.namaAsuransi === 'Umum / Pribadi').length;

    // 3. Top 5 Insurance
    const insMap: Record<string, number> = {};
    periodJobs.forEach(j => {
        if (j.namaAsuransi !== 'Umum / Pribadi') {
            insMap[j.namaAsuransi] = (insMap[j.namaAsuransi] || 0) + 1;
        }
    });
    const topInsurance = Object.entries(insMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // 4. Top 5 Regions (Kota)
    const regionMap: Record<string, number> = {};
    periodJobs.forEach(j => {
        const kota = (j.customerKota || 'TIDAK TERDATA').toUpperCase().trim();
        regionMap[kota] = (regionMap[kota] || 0) + 1;
    });
    const topRegions = Object.entries(regionMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // 5. Product Trends (Brand, Model, Color)
    const brandMap: Record<string, number> = {};
    const modelMap: Record<string, number> = {};
    const colorMap: Record<string, number> = {};

    periodJobs.forEach(j => {
        const brand = (j.carBrand || 'MAZDA').toUpperCase();
        const model = (j.carModel || 'TIPE LAIN').toUpperCase();
        const color = (j.warnaMobil || 'WARNA LAIN').toUpperCase();

        brandMap[brand] = (brandMap[brand] || 0) + 1;
        modelMap[model] = (modelMap[model] || 0) + 1;
        colorMap[color] = (colorMap[color] || 0) + 1;
    });

    const getTop3 = (map: Record<string, number>) => 
        Object.entries(map).sort((a,b) => b[1] - a[1]).slice(0, 3);

    return {
        insCount, priCount,
        topInsurance,
        topRegions,
        topBrands: getTop3(brandMap),
        topModels: getTop3(modelMap),
        topColors: getTop3(colorMap),
        totalOrder: periodJobs.length
    };
  }, [jobs, selectedMonth, selectedYear]);

  // Chart Configs
  const marketShareData = {
    labels: ['Asuransi', 'Pribadi / Umum'],
    datasets: [{
      data: [data.insCount, data.priCount],
      backgroundColor: ['#6366F1', '#EC4899'],
      borderWidth: 0,
      hoverOffset: 10
    }]
  };

  const regionChartData = {
    labels: data.topRegions.map(r => r[0]),
    datasets: [{
      label: 'Jumlah Unit',
      data: data.topRegions.map(r => r[1]),
      backgroundColor: 'rgba(59, 130, 246, 0.8)',
      borderRadius: 12
    }]
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
        {/* HEADER */}
        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
                <div className="p-4 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-100">
                    <TrendingUp size={28}/>
                </div>
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Analisis Bisnis & Pasar</h1>
                    <p className="text-gray-500 font-medium">Insight strategis sumber order dan demografi pelanggan.</p>
                </div>
            </div>

            <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-2xl border border-gray-200">
                <Calendar className="text-gray-400 ml-2" size={20}/>
                <select 
                  value={selectedMonth} 
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="bg-transparent border-none text-sm font-black focus:ring-0 cursor-pointer"
                >
                    {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                    ))}
                </select>
                <select 
                  value={selectedYear} 
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="bg-transparent border-none text-sm font-black focus:ring-0 cursor-pointer border-l border-gray-200 pl-4"
                >
                    {[2024, 2025, 2026].map(y => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* MARKET SHARE CARD */}
            <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col items-center">
                <div className="w-full flex justify-between items-center mb-8">
                    <h3 className="font-black text-gray-800 uppercase tracking-widest text-xs flex items-center gap-2">
                        <Shield size={16} className="text-indigo-500"/> Penetrasi Pasar
                    </h3>
                    <Info size={16} className="text-gray-300"/>
                </div>
                <div className="relative h-64 w-64">
                    <Doughnut data={marketShareData} options={{ cutout: '75%', plugins: { legend: { display: false } } }} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-4xl font-black text-gray-900">{data.totalOrder}</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Unit Masuk</span>
                    </div>
                </div>
                <div className="w-full mt-8 space-y-3">
                    <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-indigo-600"></div>
                            <span className="text-sm font-bold text-indigo-900">Asuransi</span>
                        </div>
                        <span className="font-black text-indigo-700">{data.insCount} <span className="text-[10px] font-normal opacity-60">({((data.insCount/data.totalOrder || 0)*100).toFixed(1)}%)</span></span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-pink-50 rounded-2xl border border-pink-100">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-pink-500"></div>
                            <span className="text-sm font-bold text-pink-900">Pribadi / Umum</span>
                        </div>
                        <span className="font-black text-pink-700">{data.priCount} <span className="text-[10px] font-normal opacity-60">({((data.priCount/data.totalOrder || 0)*100).toFixed(1)}%)</span></span>
                    </div>
                </div>
            </div>

            {/* TOP INSURANCE RANKING */}
            <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="font-black text-gray-800 uppercase tracking-widest text-xs flex items-center gap-2">
                        <Award size={16} className="text-yellow-500"/> Top 5 Sumber Order (Insurance)
                    </h3>
                </div>
                <div className="space-y-4 flex-grow">
                    {data.topInsurance.map(([name, count], idx) => (
                        <div key={idx} className="flex items-center gap-4 group">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${idx === 0 ? 'bg-yellow-400 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                {idx + 1}
                            </div>
                            <div className="flex-grow">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm font-bold text-gray-700 group-hover:text-indigo-600 transition-colors uppercase">{name}</span>
                                    <span className="text-sm font-black text-gray-900">{count} Unit</span>
                                </div>
                                <div className="w-full bg-gray-50 h-2 rounded-full overflow-hidden border border-gray-100">
                                    <div 
                                        className="h-full bg-indigo-500 rounded-full transition-all duration-1000" 
                                        style={{ width: `${(count / (data.topInsurance[0][1] || 1)) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {data.topInsurance.length === 0 && <div className="h-full flex items-center justify-center text-gray-400 italic text-sm">Tidak ada data asuransi.</div>}
                </div>
            </div>

            {/* TOP REGIONS CARD */}
            <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="font-black text-gray-800 uppercase tracking-widest text-xs flex items-center gap-2">
                        <MapPin size={16} className="text-emerald-500"/> Demografi Wilayah Pelanggan
                    </h3>
                </div>
                <div className="h-64 mb-6">
                    {data.topRegions.length > 0 ? (
                        <Bar 
                            data={regionChartData} 
                            options={{ 
                                responsive: true, 
                                maintainAspectRatio: false,
                                plugins: { legend: { display: false } },
                                scales: { 
                                    x: { grid: { display: false }, ticks: { font: { size: 9, weight: 'bold' } } },
                                    y: { beginAtZero: true, grid: { color: '#F3F4F6' } } 
                                }
                            }} 
                        />
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 italic text-sm">Data alamat tidak tersedia.</div>
                    )}
                </div>
                <div className="space-y-2">
                    {data.topRegions.map(([city, count], idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs p-2 hover:bg-gray-50 rounded-lg">
                            <span className="font-bold text-gray-600">{city}</span>
                            <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-black">{count} Unit</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* PRODUCT TRENDS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* TOP BRANDS */}
            <div className="bg-slate-900 p-8 rounded-[32px] text-white shadow-2xl relative overflow-hidden">
                <Car className="absolute -right-4 -bottom-4 opacity-10 rotate-12" size={150}/>
                <h3 className="text-xs font-black text-indigo-300 uppercase tracking-[0.2em] mb-6">Dominasi Merk</h3>
                <div className="space-y-6">
                    {data.topBrands.map(([name, count], idx) => (
                        <div key={idx} className="relative z-10">
                            <div className="flex justify-between items-end mb-2">
                                <span className="font-black text-lg">{name}</span>
                                <span className="text-indigo-400 font-bold">{count} Unit</span>
                            </div>
                            <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(count/data.totalOrder)*100}%` }}></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* TOP MODELS */}
            <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6">Tipe / Model Terlaris</h3>
                <div className="space-y-4">
                    {data.topModels.map(([name, count], idx) => (
                        <div key={idx} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl group hover:bg-indigo-600 transition-all cursor-default">
                            <span className="font-black text-gray-700 group-hover:text-white transition-colors">{name}</span>
                            <span className="text-indigo-600 font-black group-hover:text-white transition-colors">{count} WO</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* TOP COLORS */}
            <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6">Varian Warna Dominan</h3>
                <div className="space-y-4">
                    {data.topColors.map(([name, count], idx) => (
                        <div key={idx} className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full border border-gray-100 shadow-sm flex items-center justify-center text-[10px] font-black ${name.includes('RED') ? 'bg-red-600 text-white' : name.includes('GRAY') ? 'bg-gray-600 text-white' : name.includes('WHITE') ? 'bg-slate-50 text-gray-400' : 'bg-slate-900 text-white'}`}>
                                {count}
                            </div>
                            <div className="flex-grow">
                                <p className="text-sm font-black text-gray-800 uppercase leading-none">{name}</p>
                                <p className="text-[10px] font-bold text-gray-400 mt-1">{((count/data.totalOrder)*100).toFixed(1)}% dari total order</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
  );
};

export default BusinessIntelligenceView;
