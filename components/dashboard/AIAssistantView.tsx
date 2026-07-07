
import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Job, CashierTransaction, Settings, InventoryItem } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { Sparkles, BrainCircuit, TrendingUp, AlertTriangle, Zap, MessageSquare, Send, Loader2, Target, Lightbulb, ShieldAlert, BarChart3, X, ChevronRight } from 'lucide-react';

interface AIAssistantProps {
  jobs: Job[];
  transactions: CashierTransaction[];
  settings: Settings;
  inventoryItems: InventoryItem[];
}

const AIAssistantView: React.FC<AIAssistantProps> = ({ jobs, transactions, settings, inventoryItems }) => {
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState<'trouble' | 'promo' | 'target' | 'general' | null>(null);

  const runAIScreening = async (mode: 'trouble' | 'promo' | 'target' | 'general') => {
      setIsLoading(true);
      setActiveAnalysis(mode);
      setAnalysisResult(null);

      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          
          // Calculate Realized GP (Invoiced Only) for the current month
          const now = new Date();
          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const totalWeeksInMonth = Math.ceil(daysInMonth / 7);
          const currentWeekNum = Math.ceil(now.getDate() / 7);
          const remainingWeeks = Math.max(totalWeeksInMonth - currentWeekNum + 1, 1);

          const invoicedJobsThisMonth = jobs.filter(j => {
              if (j.isDeleted || !j.hasInvoice || !j.closedAt) return false;
              const d = j.closedAt.toDate ? j.closedAt.toDate() : new Date(j.closedAt);
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          });

          const calculateGP = (job: Job) => {
              const rev = (job.hargaJasa || 0) + (job.hargaPart || 0);
              const cost = (job.costData?.hargaModalBahan || 0) + (job.costData?.hargaBeliPart || 0) + (job.costData?.jasaExternal || 0);
              return rev - cost;
          };

          const realizedGP = invoicedJobsThisMonth.reduce((acc, j) => acc + calculateGP(j), 0);
          
          // Dynamic Catch-up Target
          const remainingMonthlyTarget = Math.max(settings.monthlyTarget - realizedGP, 0);
          const adjustedWeeklyTarget = remainingMonthlyTarget / remainingWeeks;
          const isCatchUpActive = adjustedWeeklyTarget > (settings.monthlyTarget / 4);

          // Calculate Potential GP from WIP (To guide AI on what to push for closing)
          const wipJobs = jobs.filter(j => !j.isClosed && j.woNumber && !j.isDeleted);
          const potentialGP = wipJobs.reduce((acc, j) => acc + calculateGP(j), 0);

          const dataSummary = {
              realizedGPThisMonth: realizedGP,
              targetMonthlyGP: settings.monthlyTarget,
              adjustedWeeklyTarget: adjustedWeeklyTarget,
              remainingWeeksInMonth: remainingWeeks,
              isCatchUpActive: isCatchUpActive,
              potentialWIPGP: potentialGP,
              activeWipCount: wipJobs.length,
              bottlenecks: wipJobs.filter(j => j.statusPekerjaan === 'Tunggu Part').length,
              lowStockItems: inventoryItems.filter(i => i.stock <= (i.minStock || 0)).length,
              workshopName: settings.workshopName
          };

          let prompt = "";
          if (mode === 'trouble') {
              prompt = `Lakukan screening terhadap data operasional: ${JSON.stringify(dataSummary)}. Berikan analisa bottleneck produksi dan sarankan unit mana yang memiliki margin tinggi agar segera di-Closing (Faktur) untuk mengejar target profit mingguan yang disesuaikan sebesar ${formatCurrency(adjustedWeeklyTarget)}.`;
          } else if (mode === 'promo') {
              prompt = `Berdasarkan pencapaian profit saat ini (${formatCurrency(realizedGP)}), buatkan 3 strategi promo yang fokus pada 'High Margin Services' untuk mengejar target catch-up sebesar ${formatCurrency(adjustedWeeklyTarget)} per pekan. Workshop: ${settings.workshopName}.`;
          } else if (mode === 'target') {
              prompt = `Berikan Strategic Operational Plan harian. Sisa target realized GP bulan ini adalah ${formatCurrency(remainingMonthlyTarget)}. Karena performa sebelumnya, target PEKAN INI naik menjadi ${formatCurrency(adjustedWeeklyTarget)}. Fokus pada konversi ${dataSummary.activeWipCount} unit WIP menjadi Faktur dalam ${remainingWeeks} minggu sisa. Data: ${JSON.stringify(dataSummary)}.`;
          } else {
              prompt = `Analisa performa profitabilitas bengkel secara umum. Jelaskan kondisi 'Catch-up Target' saat ini (${isCatchUpActive ? 'AKTIF' : 'NORMAL'}). Bandingkan Realized Profit (${formatCurrency(realizedGP)}) dan Potential Profit di workshop (${formatCurrency(potentialGP)}). Apa 3 langkah kritis hari ini untuk mengamankan target bulanan ${formatCurrency(settings.monthlyTarget)}?`;
          }

          const response = await ai.models.generateContent({
              model: 'gemini-3-pro-preview',
              contents: prompt,
          });

          setAnalysisResult(response.text || "AI tidak memberikan respon. Coba lagi.");
      } catch (error) {
          console.error("AI Error:", error);
          setAnalysisResult("Maaf, terjadi kesalahan saat menghubungi asisten AI. Pastikan koneksi internet stabil.");
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
        {/* HEADER AI */}
        <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-black p-10 rounded-[40px] text-white shadow-2xl relative overflow-hidden border border-white/10">
            <div className="absolute top-0 right-0 p-12 opacity-10 animate-pulse">
                <BrainCircuit size={300}/>
            </div>
            <div className="relative z-10">
                <div className="inline-flex items-center gap-2 bg-indigo-500/20 px-4 py-2 rounded-full border border-indigo-500/30 mb-6 backdrop-blur-md">
                    <Sparkles className="text-indigo-400" size={16}/>
                    <span className="text-xs font-black tracking-widest uppercase">Accumulative Profit Intelligence</span>
                </div>
                <h1 className="text-5xl font-black tracking-tighter leading-none">
                    AI Business <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Profit Strategist</span>
                </h1>
                <p className="text-indigo-200/70 mt-4 max-w-xl font-medium text-lg">
                    Asisten cerdas ReForma yang menganalisa **Catch-up Target** secara dinamis untuk memastikan kekurangan profit di pekan lalu terbayar di pekan ini.
                </p>
            </div>
        </div>

        {/* AI ACTIONS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button 
                onClick={() => runAIScreening('trouble')}
                disabled={isLoading}
                className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all text-left group relative overflow-hidden"
            >
                <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
                    <ShieldAlert size={120}/>
                </div>
                <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl w-fit mb-6 group-hover:scale-110 transition-transform">
                    <AlertTriangle size={32}/>
                </div>
                <h3 className="text-xl font-black text-gray-900">Catch-Up Strategy</h3>
                <p className="text-sm text-gray-500 mt-2 font-medium">Analisa beban target akumulatif & taktik penyelesaian cepat.</p>
            </button>

            <button 
                onClick={() => runAIScreening('promo')}
                disabled={isLoading}
                className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all text-left group relative overflow-hidden"
            >
                <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
                    <Zap size={120}/>
                </div>
                <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl w-fit mb-6 group-hover:scale-110 transition-transform">
                    <Lightbulb size={32}/>
                </div>
                <h3 className="text-xl font-black text-gray-900">Margin Recovery</h3>
                <p className="text-sm text-gray-500 mt-2 font-medium">Ciptakan promo margin tinggi untuk menutup gap target bulanan.</p>
            </button>

            <button 
                onClick={() => runAIScreening('target')}
                disabled={isLoading}
                className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all text-left group relative overflow-hidden"
            >
                <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
                    <BarChart3 size={120}/>
                </div>
                <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl w-fit mb-6 group-hover:scale-110 transition-transform">
                    <Target size={32}/>
                </div>
                <h3 className="text-xl font-black text-gray-900">Goal Accelerator</h3>
                <p className="text-sm text-gray-500 mt-2 font-medium">Rencana harian mendesak untuk konversi WIP menjadi Faktur.</p>
            </button>
        </div>

        {/* AI OUTPUT AREA */}
        <div className="relative">
            {isLoading ? (
                <div className="bg-white/80 backdrop-blur-md rounded-[40px] p-20 flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 animate-pulse">
                    <div className="relative">
                        <BrainCircuit className="text-indigo-600 animate-bounce" size={64}/>
                        <Sparkles className="text-indigo-400 absolute -top-4 -right-4 animate-spin" size={24}/>
                    </div>
                    <p className="text-indigo-900 font-black mt-6 text-xl tracking-tight">AI sedang menghitung redistribusi target...</p>
                </div>
            ) : analysisResult ? (
                <div className="bg-white rounded-[40px] shadow-2xl border border-gray-100 overflow-hidden animate-pop-in ring-8 ring-indigo-50">
                    <div className="bg-indigo-900 p-6 text-white flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <Sparkles className="text-indigo-300" size={24}/>
                            <h3 className="font-black uppercase tracking-widest text-sm">Catch-Up Strategy Analysis</h3>
                        </div>
                        <button onClick={() => setAnalysisResult(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X size={20}/>
                        </button>
                    </div>
                    <div className="p-10">
                        <div className="prose prose-indigo max-w-none">
                            <div className="whitespace-pre-wrap text-gray-800 leading-relaxed font-medium text-lg">
                                {analysisResult.split('\n').map((line, i) => {
                                    if (line.trim().startsWith('**') || line.trim().startsWith('###')) {
                                        return <h4 key={i} className="text-indigo-900 font-black text-2xl mt-8 mb-4 border-l-4 border-indigo-600 pl-4">{line.replace(/\*|#/g, '')}</h4>
                                    }
                                    if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
                                        return (
                                            <div key={i} className="flex gap-3 mb-2 items-start">
                                                <div className="p-1 bg-indigo-100 text-indigo-600 rounded mt-1.5"><ChevronRight size={14}/></div>
                                                <span className="text-gray-700">{line.substring(1).trim()}</span>
                                            </div>
                                        );
                                    }
                                    return <p key={i} className="mb-4">{line}</p>
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[40px] p-20 flex flex-col items-center justify-center opacity-40">
                    <BrainCircuit size={64} className="text-gray-400 mb-6"/>
                    <p className="text-gray-600 font-black text-xl">Aktifkan Strategi Recovery Profit</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default AIAssistantView;
