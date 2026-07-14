import React, { useState, useMemo } from 'react';
import { Job, Settings } from '../../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency } from '../../utils/helpers';
import EfferdDashboard2 from './EfferdDashboard2';

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

  const rechartsMarketShare = [
    { name: 'Asuransi', value: data.insCount, fill: '#0a7281' },
    { name: 'Pribadi / Umum', value: data.priCount, fill: '#111111' }
  ];

  const rechartsRegionData = data.topRegions.map(r => ({
      name: r[0],
      value: r[1]
  }));

  return (
    <div className="animate-fade-in pb-6">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-hairline pb-4">
            <div>
                <h1 className="text-[48px] font-bold font-display uppercase leading-[1] text-ink tracking-tight">BISNIS & PASAR</h1>
                <p className="text-[12px] text-mute font-normal mt-2">Insight strategis sumber order dan demografi pelanggan.</p>
            </div>

            <div className="flex items-center gap-2 mt-6 md:mt-0 bg-soft-cloud rounded-full px-4 py-2">
                <select 
                  value={selectedMonth} 
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="bg-transparent border-none text-[12px] font-medium text-ink focus:ring-0 cursor-pointer"
                >
                    {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                    ))}
                </select>
                <span className="text-mute">/</span>
                <select 
                  value={selectedYear} 
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="bg-transparent border-none text-[12px] font-medium text-ink focus:ring-0 cursor-pointer"
                >
                    {[2024, 2025, 2026].map(y => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>
            </div>
        </div>

        {/* FORECAST GROSS PROFIT CARD */}
        <div className="bg-card-emerald text-canvas p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 rounded-[12px] shadow-lg">
            <div>
                <h3 className="font-medium opacity-80 uppercase tracking-widest text-[12px] mb-2">
                    Forecast Gross Profit
                </h3>
                <p className="text-[20px] font-bold font-medium tracking-tight leading-[1]">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* MARKET SHARE CARD */}
            <div className="bg-canvas p-4 border border-hairline flex flex-col items-center rounded-2xl overflow-hidden">
                <div className="w-full flex justify-between items-center mb-8 border-b border-hairline pb-4">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[12px]">
                        Penetrasi Pasar
                    </h3>
                </div>
                <div className="relative h-64 w-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={rechartsMarketShare}
                                cx="50%"
                                cy="50%"
                                innerRadius={75}
                                outerRadius={100}
                                paddingAngle={5}
                                dataKey="value"
                                stroke="none"
                            >
                                {rechartsMarketShare.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </Pie>
                            <RechartsTooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', fontSize: '12px', textTransform: 'uppercase' }} />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[20px] font-bold font-medium text-ink leading-none">{data.totalOrder}</span>
                        <span className="text-[12px] font-medium text-mute uppercase tracking-widest mt-2">Unit Masuk</span>
                    </div>
                </div>
                <div className="w-full mt-8 space-y-4">
                    <div className="flex justify-between items-center p-4 bg-card-teal text-canvas rounded-lg shadow-sm">
                        <span className="text-[12px] font-medium uppercase tracking-widest">Asuransi</span>
                        <span className="font-medium text-[12px]">{data.insCount} <span className="text-[12px] opacity-80 ml-2">({((data.insCount/data.totalOrder || 0)*100).toFixed(1)}%)</span></span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-ink text-canvas rounded-lg shadow-sm">
                        <span className="text-[12px] font-medium uppercase tracking-widest">Pribadi / Umum</span>
                        <span className="font-medium text-[12px]">{data.priCount} <span className="text-[12px] opacity-80 ml-2">({((data.priCount/data.totalOrder || 0)*100).toFixed(1)}%)</span></span>
                    </div>
                </div>
            </div>

            {/* TOP INSURANCE RANKING */}
            <div className="bg-canvas p-4 border border-hairline flex flex-col rounded-2xl overflow-hidden">
                <div className="flex justify-between items-center mb-8 border-b border-hairline pb-4">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[12px]">
                        Top 5 Sumber Order
                    </h3>
                </div>
                <div className="space-y-6 flex-grow">
                    {data.topInsurance.map(([name, count], idx) => (
                        <div key={idx} className="flex items-start gap-4">
                            <div className="w-8 h-8 flex items-center justify-center font-medium text-[12px] text-ink border border-hairline rounded-full shrink-0">
                                {idx + 1}
                            </div>
                            <div className="flex-grow pt-1">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[12px] font-medium text-ink uppercase">{name}</span>
                                    <span className="text-[12px] font-medium text-ink">{count} Unit</span>
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
                    {data.topInsurance.length === 0 && <div className="h-full flex items-center justify-center text-mute italic text-[12px]">Tidak ada data asuransi.</div>}
                </div>
            </div>

            {/* TOP REGIONS CARD */}
            <div className="bg-canvas p-4 border border-hairline flex flex-col rounded-2xl overflow-hidden">
                <div className="flex justify-between items-center mb-8 border-b border-hairline pb-4">
                    <h3 className="font-medium text-ink uppercase tracking-widest text-[12px]">
                        Demografi Pelanggan
                    </h3>
                </div>
                <div className="h-64 mb-8">
                    {data.topRegions.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={rechartsRegionData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" hide />
                                <RechartsTooltip 
                                    cursor={{fill: 'transparent'}}
                                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', fontSize: '12px', textTransform: 'uppercase' }}
                                />
                                <Bar dataKey="value" fill="#0a7281" radius={[0, 20, 20, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-mute italic text-[12px]">Data alamat tidak tersedia.</div>
                    )}
                </div>
                <div className="space-y-4">
                    {data.topRegions.map(([city, count], idx) => (
                        <div key={idx} className="flex justify-between items-center text-[12px] border-b border-hairline pb-4 last:border-0 last:pb-0">
                            <span className="font-medium text-ink uppercase">{city}</span>
                            <span className="bg-soft-cloud text-ink px-4 py-1 rounded-full font-medium tracking-widest uppercase">{count} Unit</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* PRODUCT TRENDS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* TOP BRANDS */}
            <div className="bg-canvas p-4 border border-hairline flex flex-col rounded-2xl overflow-hidden">
                <h3 className="text-[12px] font-medium text-mute uppercase tracking-widest mb-8 border-b border-hairline pb-4">Dominasi Merk</h3>
                <div className="space-y-8 flex-grow">
                    {data.topBrands.map(([name, count], idx) => (
                        <div key={idx}>
                            <div className="flex justify-between items-end mb-2">
                                <span className="font-medium text-[20px] text-ink">{name}</span>
                                <span className="text-mute font-medium text-[12px]">{count} Unit</span>
                            </div>
                            <div className="w-full bg-soft-cloud h-1 relative">
                                <div className="h-full bg-ink absolute top-0 left-0" style={{ width: `${(count/data.totalOrder)*100}%` }}></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* TOP MODELS */}
            <div className="bg-canvas p-4 border border-hairline flex flex-col rounded-2xl overflow-hidden">
                <h3 className="text-[12px] font-medium text-mute uppercase tracking-widest mb-8 border-b border-hairline pb-4">Tipe / Model Terlaris</h3>
                <div className="space-y-4 flex-grow">
                    {data.topModels.map(([name, count], idx) => (
                        <div key={idx} className="flex justify-between items-center p-4 bg-soft-cloud border border-hairline">
                            <span className="font-medium text-ink text-[12px] uppercase">{name}</span>
                            <span className="text-ink font-medium tracking-widest text-[12px]">{count} WO</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* TOP COLORS */}
            <div className="bg-canvas p-4 border border-hairline flex flex-col rounded-2xl overflow-hidden">
                <h3 className="text-[12px] font-medium text-mute uppercase tracking-widest mb-8 border-b border-hairline pb-4">Varian Warna Dominan</h3>
                <div className="space-y-6 flex-grow">
                    {data.topColors.map(([name, count], idx) => (
                        <div key={idx} className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full border border-hairline flex items-center justify-center font-medium text-[12px] bg-canvas text-ink">
                                {count}
                            </div>
                            <div className="flex-grow">
                                <p className="text-[12px] font-medium text-ink uppercase leading-none mb-1">{name}</p>
                                <p className="text-[12px] font-medium text-mute tracking-widest">{((count/data.totalOrder)*100).toFixed(1)}% DARI TOTAL ORDER</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* EFFERD DASHBOARD RECHARTS */}
        <EfferdDashboard2 jobs={jobs} title="BUSINESS INTELLIGENCE LIVE ANALYTICS" subtitle="Demographic & Trend Visualization" />
    </div>
  );
};

export default BusinessIntelligenceView;
