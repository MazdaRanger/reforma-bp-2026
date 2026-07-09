import React, { useState, useMemo } from 'react';
import { Job, Settings } from '../../types';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { formatCurrency } from '../../utils/helpers';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface BIProps {
  jobs: Job[];
  settings: Settings;
}

const BusinessIntelligenceView: React.FC<BIProps> = ({ jobs, settings }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const data = useMemo(() => {
    const periodJobs = jobs.filter(j => {
        if (j.isDeleted || !j.woNumber) return false;
        const dateObj = j.closedAt?.toDate ? j.closedAt.toDate() : (j.createdAt?.toDate ? j.createdAt.toDate() : new Date());
        return dateObj.getMonth() === selectedMonth && dateObj.getFullYear() === selectedYear;
    });

    const insCount = periodJobs.filter(j => j.namaAsuransi !== 'Umum / Pribadi').length;
    const priCount = periodJobs.filter(j => j.namaAsuransi === 'Umum / Pribadi').length;

    const insMap: Record<string, number> = {};
    periodJobs.forEach(j => {
        if (j.namaAsuransi !== 'Umum / Pribadi') {
            insMap[j.namaAsuransi] = (insMap[j.namaAsuransi] || 0) + 1;
        }
    });
    const topInsurance = Object.entries(insMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const regionMap: Record<string, number> = {};
    periodJobs.forEach(j => {
        const kota = (j.customerKota || 'TIDAK TERDATA').toUpperCase().trim();
        regionMap[kota] = (regionMap[kota] || 0) + 1;
    });
    const topRegions = Object.entries(regionMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

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

    const forecastJobsList = jobs.filter(j => 
        j.woNumber &&
        !j.hasInvoice &&
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

    const assumedMatCost = potentialRevJasa * 0.15;
    const assumedPartCost = potentialRevPart * 0.80;
    const forecastGP = (potentialRevJasa + potentialRevPart) - (assumedMatCost + assumedPartCost);
    const forecastCount = forecastJobsList.length;

    return {
        insCount, priCount,
        topInsurance,
        topRegions,
        topBrands: getTop3(brandMap),
        topModels: getTop3(modelMap),
        topColors: getTop3(colorMap),
        totalOrder: periodJobs.length,
        forecastGP,
        forecastCount
    };
  }, [jobs, selectedMonth, selectedYear]);

  const marketShareData = {
    labels: ['Asuransi', 'Pribadi / Umum'],
    datasets: [{
      data: [data.insCount, data.priCount],
      backgroundColor: ['#0a7281', '#111111'],
      hoverBackgroundColor: ['#0c8b9d', '#39393b'],
      borderWidth: 4,
      borderColor: '#ffffff',
      hoverOffset: 15
    }]
  };

  const regionChartData = {
    labels: data.topRegions.map(r => r[0]),
    datasets: [{
      label: 'Jumlah Unit',
      data: data.topRegions.map(r => r[1]),
      backgroundColor: (context: any) => {
        const chart = context.chart;
        const { ctx, chartArea } = chart;
        if (!chartArea) return null;
        const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
        gradient.addColorStop(0, '#111111');
        gradient.addColorStop(1, '#0a7281');
        return gradient;
      },
      borderRadius: { topRight: 20, bottomRight: 20 },
      borderSkipped: false,
    }]
  };

  return (
    <div className="animate-fade-in pb-[48px]">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-[48px] border-b border-hairline pb-[24px]">
            <div>
                <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">BISNIS & PASAR</h1>
                <p className="text-[16px] text-mute font-normal mt-[18px]">Insight strategis sumber order dan demografi pelanggan.</p>
            </div>

            <div className="flex items-center gap-2 mt-6 md:mt-0 bg-soft-cloud rounded-full px-4 py-2">
                <select 
                  value={selectedMonth} 
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="bg-transparent border-none text-[16px] font-medium text-ink focus:ring-0 cursor-pointer"
                >
                    {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                    ))}
                </select>
                <span className="text-mute">/</span>
                <select 
                  value={selectedYear} 
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="bg-transparent border-none text-[16px] font-medium text-ink focus:ring-0 cursor-pointer"
                >
                    {[2024, 2025, 2026].map(y => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>
            </div>
        </div>

        {/* FORECAST GROSS PROFIT CARD */}
        <div className="bg-card-emerald text-canvas p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-[24px] rounded-[24px] shadow-lg">
            <div>
                <h3 className="font-medium opacity-80 uppercase tracking-widest text-[14px] mb-2">
                    Forecast Gross Profit
                </h3>
                <p className="text-[48px] font-medium tracking-tight leading-[1]">
                    {formatCurrency(data.forecastGP)}
                </p>
                <div className="mt-6 flex flex-col md:flex-row items-start md:items-center gap-4">
                    <div className="bg-white/20 px-4 py-2 rounded-full font-medium text-[12px] uppercase tracking-widest">
                        {data.forecastCount} Unit WO Belum Faktur
                    </div>
                    <p className="text-[12px] opacity-80 italic">
                        *Asumsi: HPP Bahan 15%, HPP Part 80%
                    </p>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[24px] mb-[24px]">
            {/* MARKET SHARE CARD */}
            <div className="bg-canvas p-6 md:p-8 border border-hairline flex flex-col items-center">
                <div className="w-full flex justify-between items-center mb-8 border-b border-hairline pb-4">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">
                        Penetrasi Pasar
                    </h3>
                </div>
                <div className="relative h-64 w-64">
                    <Doughnut data={marketShareData} options={{ cutout: '75%', plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(17, 17, 17, 0.95)', cornerRadius: 8 } } }} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[48px] font-medium text-ink leading-none">{data.totalOrder}</span>
                        <span className="text-[12px] font-medium text-mute uppercase tracking-widest mt-2">Unit Masuk</span>
                    </div>
                </div>
                <div className="w-full mt-8 space-y-4">
                    <div className="flex justify-between items-center p-4 bg-card-teal text-canvas rounded-lg shadow-sm">
                        <span className="text-[14px] font-medium uppercase tracking-widest">Asuransi</span>
                        <span className="font-medium text-[16px]">{data.insCount} <span className="text-[12px] opacity-80 ml-2">({((data.insCount/data.totalOrder || 0)*100).toFixed(1)}%)</span></span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-ink text-canvas rounded-lg shadow-sm">
                        <span className="text-[14px] font-medium uppercase tracking-widest">Pribadi / Umum</span>
                        <span className="font-medium text-[16px]">{data.priCount} <span className="text-[12px] opacity-80 ml-2">({((data.priCount/data.totalOrder || 0)*100).toFixed(1)}%)</span></span>
                    </div>
                </div>
            </div>

            {/* TOP INSURANCE RANKING */}
            <div className="bg-canvas p-6 md:p-8 border border-hairline flex flex-col">
                <div className="flex justify-between items-center mb-8 border-b border-hairline pb-4">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">
                        Top 5 Sumber Order
                    </h3>
                </div>
                <div className="space-y-6 flex-grow">
                    {data.topInsurance.map(([name, count], idx) => (
                        <div key={idx} className="flex items-start gap-4">
                            <div className="w-8 h-8 flex items-center justify-center font-medium text-[16px] text-ink border border-hairline rounded-full shrink-0">
                                {idx + 1}
                            </div>
                            <div className="flex-grow pt-1">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[14px] font-medium text-ink uppercase">{name}</span>
                                    <span className="text-[16px] font-medium text-ink">{count} Unit</span>
                                </div>
                                <div className="w-full bg-soft-cloud h-1 relative">
                                    <div 
                                        className="h-full bg-ink transition-all duration-1000 absolute top-0 left-0" 
                                        style={{ width: `${(count / (data.topInsurance[0][1] || 1)) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {data.topInsurance.length === 0 && <div className="h-full flex items-center justify-center text-mute italic text-[14px]">Tidak ada data asuransi.</div>}
                </div>
            </div>

            {/* TOP REGIONS CARD */}
            <div className="bg-canvas p-6 md:p-8 border border-hairline flex flex-col">
                <div className="flex justify-between items-center mb-8 border-b border-hairline pb-4">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">
                        Demografi Pelanggan
                    </h3>
                </div>
                <div className="h-64 mb-8">
                    {data.topRegions.length > 0 ? (
                        <Bar 
                            data={regionChartData} 
                            options={{ 
                                indexAxis: 'y',
                                responsive: true, 
                                maintainAspectRatio: false,
                                plugins: { 
                                    legend: { display: false },
                                    tooltip: {
                                        backgroundColor: 'rgba(17, 17, 17, 0.95)',
                                        titleFont: { family: 'Inter', size: 13 },
                                        bodyFont: { family: 'Inter', size: 15, weight: 'bold' as const },
                                        padding: 12,
                                        cornerRadius: 8,
                                        displayColors: false,
                                    }
                                },
                                scales: { 
                                    x: { grid: { display: false }, border: { display: false }, ticks: { display: false } },
                                    y: { grid: { display: false }, border: { display: false } } 
                                }
                            }} 
                        />
                    ) : (
                        <div className="h-full flex items-center justify-center text-mute italic text-[14px]">Data alamat tidak tersedia.</div>
                    )}
                </div>
                <div className="space-y-4">
                    {data.topRegions.map(([city, count], idx) => (
                        <div key={idx} className="flex justify-between items-center text-[14px] border-b border-hairline pb-4 last:border-0 last:pb-0">
                            <span className="font-medium text-ink uppercase">{city}</span>
                            <span className="bg-soft-cloud text-ink px-4 py-1 rounded-full font-medium tracking-widest uppercase">{count} Unit</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* PRODUCT TRENDS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[24px]">
            {/* TOP BRANDS */}
            <div className="bg-canvas p-6 md:p-8 border border-hairline flex flex-col">
                <h3 className="text-[14px] font-medium text-mute uppercase tracking-widest mb-8 border-b border-hairline pb-4">Dominasi Merk</h3>
                <div className="space-y-8 flex-grow">
                    {data.topBrands.map(([name, count], idx) => (
                        <div key={idx}>
                            <div className="flex justify-between items-end mb-2">
                                <span className="font-medium text-[20px] text-ink">{name}</span>
                                <span className="text-mute font-medium text-[16px]">{count} Unit</span>
                            </div>
                            <div className="w-full bg-soft-cloud h-1 relative">
                                <div className="h-full bg-ink absolute top-0 left-0" style={{ width: `${(count/data.totalOrder)*100}%` }}></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* TOP MODELS */}
            <div className="bg-canvas p-6 md:p-8 border border-hairline flex flex-col">
                <h3 className="text-[14px] font-medium text-mute uppercase tracking-widest mb-8 border-b border-hairline pb-4">Tipe / Model Terlaris</h3>
                <div className="space-y-4 flex-grow">
                    {data.topModels.map(([name, count], idx) => (
                        <div key={idx} className="flex justify-between items-center p-4 bg-soft-cloud border border-hairline">
                            <span className="font-medium text-ink text-[16px] uppercase">{name}</span>
                            <span className="text-ink font-medium tracking-widest text-[14px]">{count} WO</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* TOP COLORS */}
            <div className="bg-canvas p-6 md:p-8 border border-hairline flex flex-col">
                <h3 className="text-[14px] font-medium text-mute uppercase tracking-widest mb-8 border-b border-hairline pb-4">Varian Warna Dominan</h3>
                <div className="space-y-6 flex-grow">
                    {data.topColors.map(([name, count], idx) => (
                        <div key={idx} className="flex items-center gap-6">
                            <div className="w-12 h-12 rounded-full border border-hairline flex items-center justify-center font-medium text-[16px] bg-canvas text-ink">
                                {count}
                            </div>
                            <div className="flex-grow">
                                <p className="text-[16px] font-medium text-ink uppercase leading-none mb-1">{name}</p>
                                <p className="text-[12px] font-medium text-mute tracking-widest">{((count/data.totalOrder)*100).toFixed(1)}% DARI TOTAL ORDER</p>
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
