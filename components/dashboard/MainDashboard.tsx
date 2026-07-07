
import React from 'react';
import { Job, Settings, UserPermissions } from '../../types';
import { formatDateIndo, exportToCsv, formatCurrency } from '../../utils/helpers';
import { Search, Filter, Download, Trash2, Edit, FileText, AlertCircle, CheckCircle, RotateCcw, ShieldAlert, Clock, UserCheck, Stethoscope, CheckCircle2, Hammer, PauseCircle, PlayCircle, Sparkles } from 'lucide-react';

interface MainDashboardProps {
  allData: Job[];
  openModal: (type: string, data?: any) => void;
  onDelete: (job: Job) => Promise<void>;
  onCloseJob: (job: Job) => Promise<void>; 
  onReopenJob: (job: Job) => Promise<void>; 
  userPermissions: UserPermissions;
  showNotification: (msg: string, type?: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  filterWorkStatus: string;
  setFilterWorkStatus: (s: string) => void;
  showClosedJobs: boolean;
  setShowClosedJobs: (b: boolean) => void;
  settings: Settings;
}

const MainDashboard: React.FC<MainDashboardProps> = ({
  allData, openModal, onDelete, onCloseJob, onReopenJob, userPermissions, showNotification,
  searchQuery, setSearchQuery, filterStatus, setFilterStatus,
  filterWorkStatus, setFilterWorkStatus, showClosedJobs, setShowClosedJobs, settings
}) => {
  const lang = settings.language || 'id';

  const handleExportGeneralData = () => {
      const dataToExport = allData.map(job => {
           const revenueJasa = job.hargaJasa || 0;
           const revenuePart = job.hargaPart || 0;
           const totalPanelValue = job.estimateData?.jasaItems?.reduce((acc, item) => acc + (item.panelCount || 0), 0) || 0;

          return {
            'Tanggal Masuk': formatDateIndo(job.tanggalMasuk),
            'No Polisi': job.policeNumber || '',
            'Nama Pelanggan': job.customerName || '',
            'Nama Asuransi': job.namaAsuransi || '',
            'Model Mobil': job.carModel || '',
            'Jumlah Panel': totalPanelValue,
            'Status Kendaraan': job.statusKendaraan || '',
            'Status Pekerjaan': job.statusPekerjaan || '',
            'Total Bill': job.estimateData?.grandTotal || 0
          };
      });
      exportToCsv('Laporan_Data_Unit.csv', dataToExport);
  };

  // LOGIC INTEGRATION: Mapping visual status to System Logic (Admin Control vs Job Control)
  const getStatusConfig = (statusKendaraan: string, statusPekerjaan: string) => {
      if (!statusKendaraan) return { color: 'bg-gray-100 text-gray-800', icon: AlertCircle };

      // 1. ADMIN CLAIM CONTROL STAGES (Prioritas Administrasi)
      if (statusKendaraan.includes('Banding Harga')) return { color: 'bg-red-100 text-red-700 border-red-200 ring-2 ring-red-100', icon: ShieldAlert, ribbon: 'NEGOTIATION' };
      if (statusKendaraan.includes('Tunggu SPK')) return { color: 'bg-orange-100 text-orange-700 border-orange-200', icon: Clock, ribbon: 'WAITING SPK' };
      if (statusKendaraan.includes('Tunggu Estimasi')) return { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Edit, ribbon: 'ESTIMATING' };
      
      // 2. LOGISTIC STAGES
      if (statusKendaraan.includes('Tunggu Part')) return { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: PauseCircle, ribbon: 'WAITING PART' };
      
      // 3. JOB CONTROL STAGES (Produksi Aktif)
      if (statusKendaraan === 'Work In Progress') {
          // Sub-status berdasarkan progress teknis
          if (statusPekerjaan === 'Quality Control') return { color: 'bg-purple-100 text-purple-700 border-purple-200', icon: CheckCircle2, ribbon: 'FINAL QC' };
          if (statusPekerjaan === 'Finishing') return { color: 'bg-teal-100 text-teal-700 border-teal-200', icon: Sparkles, ribbon: 'FINISHING' };
          return { color: 'bg-indigo-100 text-indigo-700 border-indigo-200 ring-1 ring-indigo-50', icon: Hammer, ribbon: 'PRODUCTION' };
      }

      if (statusKendaraan.includes('Rawat Jalan')) return { color: 'bg-cyan-50 text-cyan-700 border-cyan-200', icon: Stethoscope, ribbon: 'OUT-PATIENT' };
      if (statusKendaraan.includes('Booking')) return { color: 'bg-sky-100 text-sky-800 border-sky-200', icon: UserCheck, ribbon: 'BOOKED' };
      
      // 4. FINISHED / CRC STAGES
      if (statusKendaraan.includes('Selesai (Tunggu Pengambilan)')) return { color: 'bg-emerald-100 text-emerald-700 border-emerald-300 ring-1 ring-emerald-100', icon: CheckCircle2, ribbon: 'READY-TO-GO' };
      if (statusKendaraan.includes('Sudah Diambil') || statusKendaraan.includes('Selesai')) return { color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle, ribbon: 'DELIVERED' };

      return { color: 'bg-gray-50 text-gray-600 border-gray-200', icon: RotateCcw };
  };

  const handleDelete = (job: Job) => {
    if(window.confirm(`Hapus Pekerjaan ${job.policeNumber}?`)) {
         onDelete(job);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex-grow w-full lg:w-auto">
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="relative flex-grow max-w-md">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder={lang === 'id' ? "Cari No. Polisi, Pelanggan..." : "Search Plate, Customer..."}
                            value={searchQuery} 
                            onChange={e => setSearchQuery(e.target.value.toUpperCase())} 
                            className="pl-10 p-2.5 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <Filter size={18} className="text-gray-400" />
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="p-2.5 border border-gray-300 rounded-lg bg-white text-sm">
                            <option value="">{lang === 'id' ? 'Status Kendaraan' : 'Unit Status'}</option>
                            {(settings.statusKendaraanOptions || []).map(opt => <option key={opt}>{opt}</option>)}
                        </select>
                        <select value={filterWorkStatus} onChange={e => setFilterWorkStatus(e.target.value)} className="p-2.5 border border-gray-300 rounded-lg bg-white text-sm">
                            <option value="">{lang === 'id' ? 'Status Pekerjaan' : 'Work Progress'}</option>
                            {(settings.statusPekerjaanOptions || []).map(opt => <option key={opt}>{opt}</option>)}
                        </select>
                    </div>
                </div>
                
                <div className="mt-3 flex items-center gap-2">
                     <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                        <div className="relative">
                            <input type="checkbox" checked={showClosedJobs} onChange={(e) => setShowClosedJobs(e.target.checked)} className="sr-only" />
                            <div className={`block w-10 h-6 rounded-full ${showClosedJobs ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
                            <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showClosedJobs ? 'transform translate-x-4' : ''}`}></div>
                        </div>
                        {lang === 'id' ? 'Tampilkan Closed WO' : 'Show Closed WO'}
                    </label>
                </div>
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto">
                <button onClick={handleExportGeneralData} className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold py-2.5 px-5 rounded-lg hover:bg-emerald-700 shadow-sm">
                    <Download size={18} /> <span className="hidden sm:inline">Export CSV</span>
                </button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {allData.map((job) => {
           const config = getStatusConfig(job.statusKendaraan, job.statusPekerjaan);
           const Icon = config.icon;
           const totalPanelValue = job.estimateData?.jasaItems?.reduce((acc, item) => acc + (item.panelCount || 0), 0) || 0;
           
           return (
              <div key={job.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all group flex flex-col">
                  {config.ribbon && (
                      <div className={`text-[9px] font-black tracking-widest text-center py-1 ${config.color} border-b`}>
                          {config.ribbon}
                      </div>
                  )}
                  
                  <div className="p-5 flex-grow">
                      <div className="flex justify-between items-start mb-4">
                          <div>
                              <h3 className="text-xl font-black text-indigo-900">{job.policeNumber}</h3>
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">{job.carModel} • {job.warnaMobil}</p>
                          </div>
                          <div className={`p-2 rounded-xl ${config.color}`}>
                              <Icon size={20}/>
                          </div>
                      </div>

                      <div className="space-y-2 mb-4">
                          <div className="flex items-center gap-2 text-sm">
                              <span className="font-bold text-gray-800">{job.customerName}</span>
                              <span className="text-xs text-gray-400 font-medium truncate">| {job.namaAsuransi}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                              <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 font-bold">SA: {job.namaSA || '-'}</span>
                              <span className="font-black text-indigo-600">{totalPanelValue.toFixed(1)} PANEL</span>
                          </div>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-bold text-gray-400 uppercase">{lang === 'id' ? 'Status Kontrol' : 'Control Status'}</span>
                              <span className="text-[10px] font-bold text-gray-400 uppercase">{lang === 'id' ? 'Pekerjaan' : 'Work Progress'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                              <span className={`text-[11px] font-black uppercase ${config.color.replace('bg-', 'text-').split(' ')[1]}`}>{job.statusKendaraan}</span>
                              <span className="text-[11px] font-bold text-gray-700">{job.statusPekerjaan}</span>
                          </div>
                      </div>
                  </div>

                  <div className="bg-gray-50 p-3 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                          <button onClick={() => openModal('create_estimation', job)} className="p-2 bg-white rounded-lg border border-gray-200 text-indigo-600 hover:bg-indigo-50 transition-colors shadow-sm"><FileText size={18}/></button>
                          {userPermissions.role === 'Manager' && <button onClick={() => handleDelete(job)} className="p-2 bg-white rounded-lg border border-gray-200 text-red-400 hover:bg-red-50 transition-colors shadow-sm"><Trash2 size={18}/></button>}
                      </div>
                      <div className="text-right">
                          <div className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-1">Total Bill</div>
                          <div className="text-sm font-black text-gray-900">{formatCurrency(job.estimateData?.grandTotal || 0)}</div>
                      </div>
                  </div>
              </div>
           );
        })}
        {allData.length === 0 && <div className="col-span-full py-20 text-center text-gray-400 italic">No data found.</div>}
      </div>
    </div>
  );
};

export default MainDashboard;
