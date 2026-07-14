import React, { useMemo } from 'react';
import { Job } from '../../types';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { formatCurrency } from '../../utils/helpers';

interface EfferdDashboard2Props {
  jobs: Job[];
  title?: string;
  subtitle?: string;
}

const COLORS = ['#1a1a1a', '#e11d48', '#0ea5e9', '#10b981', '#f59e0b', '#6b7280'];

export const EfferdDashboard2: React.FC<EfferdDashboard2Props> = ({ jobs, title = "LIVE DATA VISUALIZATION", subtitle = "Real-time analytics from Firestore" }) => {
  
  const parseDate = (dateInput: any): Date => {
      if (!dateInput) return new Date();
      if (dateInput instanceof Date) return dateInput;
      if (typeof dateInput.toDate === 'function') return dateInput.toDate();
      if (dateInput.seconds) return new Date(dateInput.seconds * 1000);
      const parsed = new Date(dateInput);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const chartData = useMemo(() => {
    const last6Months = Array.from({length: 6}, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return { 
          month: d.getMonth(), 
          year: d.getFullYear(), 
          label: d.toLocaleString('default', { month: 'short' }), 
          revenue: 0, 
          expenses: 0,
          grossProfit: 0,
          jobs: 0 
      };
    });

    const statusCounts: Record<string, number> = {};
    let totalRev = 0;
    let totalExp = 0;
    let totalGP = 0;

    jobs.forEach(job => {
      // Status Distribution
      const status = job.isClosed ? 'Closed' : job.statusPekerjaan || 'Draft';
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      // Revenue, Expenses, GP over time
      const date = parseDate(job.createdAt);
      const monthIndex = last6Months.findIndex(m => m.month === date.getMonth() && m.year === date.getFullYear());
      
      if (monthIndex !== -1) {
        last6Months[monthIndex].jobs += 1;
        
        if (job.isClosed && job.estimateData?.grandTotal) {
           const rev = job.estimateData.grandTotal;
           
           // Calculate HPP (Expenses)
           let exp = 0;
           if (job.costData) {
               exp = (job.costData.hargaModalBahan || 0) + (job.costData.hargaBeliPart || 0) + (job.costData.jasaExternal || 0);
           } else {
               // Fallback assumption if no costData but is closed
               exp = (job.estimateData.subtotalPart || 0) * 0.8 + (job.estimateData.subtotalJasa || 0) * 0.15;
           }

           const gp = rev - exp;

           last6Months[monthIndex].revenue += rev;
           last6Months[monthIndex].expenses += exp;
           last6Months[monthIndex].grossProfit += gp;

           totalRev += rev;
           totalExp += exp;
           totalGP += gp;
        }
      }
    });

    const pieData = Object.keys(statusCounts).map(key => ({
      name: key,
      value: statusCounts[key]
    })).sort((a,b) => b.value - a.value);

    return { timelineData: last6Months, pieData, totalRev, totalExp, totalGP };
  }, [jobs]);

  return (
    <div className="bg-canvas border border-hairline p-6 mt-8 animate-fade-in">
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
            <h3 className="text-[14px] font-medium text-ink uppercase tracking-widest">{title}</h3>
            <p className="text-[10px] text-mute uppercase tracking-widest mt-1">{subtitle}</p>
        </div>
        
        {/* KPI CARDS */}
        <div className="flex gap-4 overflow-x-auto">
            <div className="bg-soft-cloud border border-hairline px-4 py-3 min-w-[140px]">
                <p className="text-[10px] text-mute uppercase tracking-widest font-medium mb-1">TOTAL REVENUE</p>
                <p className="text-[14px] font-medium text-ink tracking-tight">{formatCurrency(chartData.totalRev)}</p>
            </div>
            <div className="bg-soft-cloud border border-hairline px-4 py-3 min-w-[140px]">
                <p className="text-[10px] text-mute uppercase tracking-widest font-medium mb-1">TOTAL HPP (EXP)</p>
                <p className="text-[14px] font-medium text-red-600 tracking-tight">{formatCurrency(chartData.totalExp)}</p>
            </div>
            <div className="bg-ink text-canvas border border-ink px-4 py-3 min-w-[140px]">
                <p className="text-[10px] opacity-80 uppercase tracking-widest font-medium mb-1">GROSS PROFIT</p>
                <p className="text-[14px] font-medium tracking-tight">{formatCurrency(chartData.totalGP)}</p>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        
        {/* FINANCIAL TREND - AREA CHART */}
        <div className="lg:col-span-2 border border-hairline p-4">
           <h4 className="text-[10px] font-medium text-mute uppercase tracking-widest mb-4">PRODUCTION FINANCIAL TREND (LAST 6 MONTHS)</h4>
           <div className="h-[300px] w-full">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={chartData.timelineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                 <defs>
                   <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#1a1a1a" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="#1a1a1a" stopOpacity={0}/>
                   </linearGradient>
                   <linearGradient id="colorGP" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                   </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                 <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} dy={10} />
                 <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#6b7280' }} 
                    tickFormatter={(value) => `Rp${(value/1000000).toFixed(0)}M`}
                 />
                 <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', fontSize: '12px', textTransform: 'uppercase' }}
                    formatter={(value: number) => formatCurrency(value)}
                 />
                 <Legend wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase' }} />
                 <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#1a1a1a" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                 <Area type="monotone" dataKey="expenses" name="Expenses (HPP)" stroke="#e11d48" strokeWidth={2} fillOpacity={0} fill="none" />
                 <Area type="monotone" dataKey="grossProfit" name="Gross Profit" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorGP)" />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* STATUS DISTRIBUTION - PIE CHART */}
        <div className="border border-hairline p-4 flex flex-col">
           <h4 className="text-[10px] font-medium text-mute uppercase tracking-widest mb-4">JOB STATUS DISTRIBUTION</h4>
           <div className="flex-1 w-full flex justify-center items-center min-h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie
                   data={chartData.pieData}
                   cx="50%"
                   cy="50%"
                   innerRadius={60}
                   outerRadius={90}
                   paddingAngle={2}
                   dataKey="value"
                   stroke="none"
                 >
                   {chartData.pieData.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                   ))}
                 </Pie>
                 <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', fontSize: '12px', textTransform: 'uppercase' }}
                 />
                 <Legend wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase' }} />
               </PieChart>
             </ResponsiveContainer>
           </div>
        </div>

      </div>
    </div>
  );
};

export default EfferdDashboard2;
