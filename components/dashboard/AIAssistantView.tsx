import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { FiMessageSquare, FiSend, FiCpu, FiTrendingUp, FiAlertCircle } from 'react-icons/fi';
import { MorphingSquare } from '../ui/morphing-square';
import { Job, CashierTransaction, Settings, InventoryItem } from '../../types';
import { formatCurrency } from '../../utils/helpers';

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
  const [showUnderConstruction, setShowUnderConstruction] = useState(true);

  const runAIScreening = async (mode: 'trouble' | 'promo' | 'target' | 'general') => {
      setIsLoading(true);
      setActiveAnalysis(mode);
      setAnalysisResult(null);

      try {
          const apiKey = settings.geminiApiKey || (process.env.GEMINI_API_KEY as string);
          if (!apiKey) {
              setAnalysisResult("API Key Google Gemini belum diatur. Silakan masukkan API Key di menu Pengaturan (Akses Super Admin/Manager).");
              setIsLoading(false);
              return;
          }

          const ai = new GoogleGenAI({ apiKey });
          
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
          
          const remainingMonthlyTarget = Math.max(settings.monthlyTarget - realizedGP, 0);
          const adjustedWeeklyTarget = remainingMonthlyTarget / remainingWeeks;
          const isCatchUpActive = adjustedWeeklyTarget > (settings.monthlyTarget / 4);

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
    <div className="animate-fade-in pb-[48px]">
        {/* HEADER AI */}
        <div className="border-b border-hairline pb-[24px] mb-[48px]">
            <div className="flex items-center gap-4 mb-[18px]">
                <div className="inline-flex items-center gap-2 bg-ink text-canvas px-4 py-1.5 rounded-none">
                    <span className="text-[12px] font-medium tracking-widest uppercase">Accumulative Profit Intelligence</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-soft-cloud text-ink px-4 py-1.5 rounded-none border border-hairline">
                    <span className="text-[12px] font-medium tracking-widest uppercase">Under Construction</span>
                </div>
            </div>
            <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">AI STRATEGIST</h1>
            <p className="text-[16px] text-mute font-normal mt-[18px] max-w-3xl">
                Asisten cerdas ReForma yang menganalisa Catch-up Target secara dinamis untuk memastikan kekurangan profit di pekan lalu terbayar di pekan ini.
            </p>
        </div>

        {/* AI ACTIONS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[24px] mb-[48px]">
            <button 
                onClick={() => runAIScreening('trouble')}
                disabled={isLoading}
                className="bg-canvas p-6 md:p-8 border border-hairline hover:bg-soft-cloud transition-all text-left flex flex-col items-start justify-start"
            >
                <span className="bg-ink text-canvas text-[10px] uppercase tracking-widest font-medium px-2 py-1 mb-4">ANALYSIS 01</span>
                <h3 className="text-[24px] font-medium text-ink leading-tight mb-2 uppercase">Catch-Up<br/>Strategy</h3>
                <p className="text-[14px] text-mute font-normal mt-auto pt-4">Analisa beban target akumulatif & taktik penyelesaian cepat.</p>
            </button>

            <button 
                onClick={() => runAIScreening('promo')}
                disabled={isLoading}
                className="bg-canvas p-6 md:p-8 border border-hairline hover:bg-soft-cloud transition-all text-left flex flex-col items-start justify-start"
            >
                <span className="bg-ink text-canvas text-[10px] uppercase tracking-widest font-medium px-2 py-1 mb-4">ANALYSIS 02</span>
                <h3 className="text-[24px] font-medium text-ink leading-tight mb-2 uppercase">Margin<br/>Recovery</h3>
                <p className="text-[14px] text-mute font-normal mt-auto pt-4">Ciptakan promo margin tinggi untuk menutup gap target bulanan.</p>
            </button>

            <button 
                onClick={() => runAIScreening('target')}
                disabled={isLoading}
                className="bg-canvas p-6 md:p-8 border border-hairline hover:bg-soft-cloud transition-all text-left flex flex-col items-start justify-start"
            >
                <span className="bg-ink text-canvas text-[10px] uppercase tracking-widest font-medium px-2 py-1 mb-4">ANALYSIS 03</span>
                <h3 className="text-[24px] font-medium text-ink leading-tight mb-2 uppercase">Goal<br/>Accelerator</h3>
                <p className="text-[14px] text-mute font-normal mt-auto pt-4">Rencana harian mendesak untuk konversi WIP menjadi Faktur.</p>
            </button>
        </div>

        {/* AI OUTPUT AREA */}
        <div className="relative min-h-[300px]">
            {isLoading ? (
                <div className="flex justify-center items-center py-12">
                   <MorphingSquare message="AI SEDANG MEMPROSES..." />
                </div>
            ) : analysisResult ? (
                <div className="bg-canvas border border-hairline">
                    <div className="border-b border-hairline p-6 flex justify-between items-center bg-soft-cloud">
                        <h3 className="font-medium text-ink uppercase tracking-widest text-[16px]">Analysis Report</h3>
                        <button onClick={() => setAnalysisResult(null)} className="text-[12px] font-medium text-mute uppercase tracking-widest hover:text-ink transition-colors">
                            CLOSE [X]
                        </button>
                    </div>
                    <div className="p-8 md:p-12">
                        <div className="prose prose-sm max-w-none">
                            <div className="whitespace-pre-wrap text-ink font-normal text-[16px] leading-relaxed">
                                {analysisResult.split('\n').map((line, i) => {
                                    if (line.trim().startsWith('**') || line.trim().startsWith('###')) {
                                        return <h4 key={i} className="text-ink font-medium text-[24px] uppercase mt-8 mb-4 border-b border-hairline pb-2">{line.replace(/\*|#/g, '')}</h4>
                                    }
                                    if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
                                        return (
                                            <div key={i} className="flex gap-4 mb-3 items-start">
                                                <span className="text-mute mt-1">—</span>
                                                <span className="text-ink">{line.substring(1).trim()}</span>
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
                <div className="bg-canvas border border-hairline p-12 md:p-20 flex flex-col items-center justify-center text-center">
                    <p className="text-mute font-medium text-[16px] uppercase tracking-widest">Select an analysis module above to begin</p>
                </div>
            )}
        </div>
        
        {/* UNDER CONSTRUCTION MODAL */}
        {showUnderConstruction && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/90 backdrop-blur-sm">
                <div className="bg-canvas border border-hairline p-8 md:p-12 max-w-lg w-full text-center">
                    <h2 className="text-[32px] font-display text-ink uppercase mb-4 leading-none">UNDER CONSTRUCTION</h2>
                    <p className="text-[16px] text-mute mb-12 font-normal leading-relaxed">
                        Menu AI Strategic Insight saat ini berstatus dalam pengembangan. Anda tetap dapat melakukan uji coba integrasi API Gemini, namun fungsionalitas dan prompt mungkin belum sepenuhnya optimal.
                    </p>
                    <button 
                        onClick={() => setShowUnderConstruction(false)}
                        className="w-full bg-ink text-canvas font-medium py-4 px-6 uppercase tracking-widest text-[14px] hover:bg-mute transition-colors"
                    >
                        PROCEED
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};

export default AIAssistantView;
