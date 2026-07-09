
import React from 'react';
import { Job, Settings, UserPermissions } from '../../types';
import { formatDateIndo, exportToCsv, formatCurrency } from '../../utils/helpers';

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

  const getStatusConfig = (statusKendaraan: string, statusPekerjaan: string) => {
      let ribbon = '';
      if (!statusKendaraan) return { ribbon };

      if (statusKendaraan.includes('Banding Harga')) ribbon = 'NEGOTIATION';
      else if (statusKendaraan.includes('Tunggu SPK')) ribbon = 'WAITING SPK';
      else if (statusKendaraan.includes('Tunggu Estimasi')) ribbon = 'ESTIMATING';
      else if (statusKendaraan.includes('Tunggu Part')) ribbon = 'WAITING PART';
      else if (statusKendaraan === 'Work In Progress') {
          if (statusPekerjaan === 'Quality Control') ribbon = 'FINAL QC';
          else if (statusPekerjaan === 'Finishing') ribbon = 'FINISHING';
          else ribbon = 'PRODUCTION';
      }
      else if (statusKendaraan.includes('Rawat Jalan')) ribbon = 'OUT-PATIENT';
      else if (statusKendaraan.includes('Booking')) ribbon = 'BOOKED';
      else if (statusKendaraan.includes('Selesai (Tunggu Pengambilan)')) ribbon = 'READY-TO-GO';
      else if (statusKendaraan.includes('Sudah Diambil') || statusKendaraan.includes('Selesai')) ribbon = 'DELIVERED';

      return { ribbon };
  };

  const handleDelete = (job: Job) => {
    if(window.confirm(`Hapus Pekerjaan ${job.policeNumber}?`)) {
         onDelete(job);
    }
  };

  return (
    <div className="animate-fade-in pb-[48px]">
      
      {/* FILTER & CONTROLS */}
      <div className="bg-canvas border border-hairline p-6 mb-[48px]">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div className="flex-grow w-full lg:w-auto">
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <input 
                        type="text" 
                        placeholder={lang === 'id' ? "Cari No. Polisi, Pelanggan..." : "Search Plate, Customer..."}
                        value={searchQuery} 
                        onChange={e => setSearchQuery(e.target.value.toUpperCase())} 
                        className="p-3 border border-hairline bg-canvas text-ink w-full md:w-[320px] focus:outline-none focus:border-ink transition-colors text-[14px] uppercase placeholder-mute"
                    />
                    
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="p-3 border border-hairline bg-canvas text-[14px] text-ink uppercase focus:outline-none focus:border-ink flex-1 md:flex-none">
                            <option value="">{lang === 'id' ? 'Status Kendaraan' : 'Unit Status'}</option>
                            {(settings.statusKendaraanOptions || []).map(opt => <option key={opt}>{opt}</option>)}
                        </select>
                        <select value={filterWorkStatus} onChange={e => setFilterWorkStatus(e.target.value)} className="p-3 border border-hairline bg-canvas text-[14px] text-ink uppercase focus:outline-none focus:border-ink flex-1 md:flex-none">
                            <option value="">{lang === 'id' ? 'Status Pekerjaan' : 'Work Progress'}</option>
                            {(settings.statusPekerjaanOptions || []).map(opt => <option key={opt}>{opt}</option>)}
                        </select>
                    </div>
                </div>
                
                <div className="mt-6 flex items-center">
                     <label className="flex items-center gap-3 text-[14px] font-medium text-ink uppercase tracking-widest cursor-pointer select-none">
                        <input 
                            type="checkbox" 
                            checked={showClosedJobs} 
                            onChange={(e) => setShowClosedJobs(e.target.checked)} 
                            className="w-5 h-5 border-hairline accent-ink cursor-pointer" 
                        />
                        {lang === 'id' ? 'Tampilkan Closed WO' : 'Show Closed WO'}
                    </label>
                </div>
            </div>

            <button onClick={handleExportGeneralData} className="w-full lg:w-auto px-8 py-3 bg-ink text-canvas text-[14px] font-medium uppercase tracking-widest hover:opacity-80 transition-opacity">
                EXPORT CSV
            </button>
        </div>
      </div>

      {/* JOB CARDS */}
      <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-[24px]">
        {allData.map((job) => {
           const config = getStatusConfig(job.statusKendaraan, job.statusPekerjaan);
           const totalPanelValue = job.estimateData?.jasaItems?.reduce((acc, item) => acc + (item.panelCount || 0), 0) || 0;
           
           return (
              <div key={job.id} className="bg-canvas border border-hairline flex flex-col hover:border-ink transition-colors">
                  
                  <div className="p-6 md:p-8 flex-grow">
                      <div className="flex justify-between items-start mb-6">
                          <div>
                              <h3 className="text-[28px] font-medium text-ink tracking-tight leading-[1.1]">{job.policeNumber}</h3>
                              <p className="text-[12px] font-medium text-mute uppercase tracking-widest mt-2">{job.carModel} • {job.warnaMobil}</p>
                          </div>
                          {config.ribbon && (
                              <span className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-widest bg-ink text-canvas rounded-full shrink-0 ml-4">
                                  {config.ribbon}
                              </span>
                          )}
                      </div>

                      <div className="space-y-4 mb-8">
                          <div className="flex items-center justify-between text-[14px] border-b border-hairline pb-2">
                              <span className="font-medium text-ink uppercase truncate mr-4">{job.customerName}</span>
                              <span className="text-[12px] text-mute uppercase whitespace-nowrap">{job.namaAsuransi}</span>
                          </div>
                          <div className="flex items-center justify-between text-[12px]">
                              <span className="bg-soft-cloud px-3 py-1 text-ink font-medium uppercase tracking-widest">SA: {job.namaSA || '-'}</span>
                              <span className="font-medium text-ink tracking-widest uppercase">{totalPanelValue.toFixed(1)} PANEL</span>
                          </div>
                      </div>

                      <div className="bg-soft-cloud p-4 border border-hairline">
                          <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] font-medium text-mute uppercase tracking-widest">{lang === 'id' ? 'Status' : 'Status'}</span>
                              <span className="text-[10px] font-medium text-mute uppercase tracking-widest">{lang === 'id' ? 'Progress' : 'Progress'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                              <span className="text-[12px] font-medium uppercase text-ink truncate mr-4">{job.statusKendaraan || '-'}</span>
                              <span className="text-[12px] font-medium uppercase text-ink text-right">{job.statusPekerjaan || '-'}</span>
                          </div>
                      </div>
                  </div>

                  <div className="p-6 md:p-8 pt-0 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <button onClick={() => openModal('create_estimation', job)} className="px-6 py-2.5 bg-canvas border border-ink text-ink hover:bg-ink hover:text-canvas text-[12px] font-medium tracking-widest uppercase rounded-full transition-colors">
                              DETAIL
                          </button>
                          {userPermissions.role === 'Manager' && (
                              <button onClick={() => handleDelete(job)} className="px-6 py-2.5 bg-canvas border border-hairline text-mute hover:text-ink hover:border-ink text-[12px] font-medium tracking-widest uppercase rounded-full transition-colors">
                                  HAPUS
                              </button>
                          )}
                      </div>
                      <div className="text-right">
                          <div className="text-[10px] font-medium text-mute uppercase tracking-widest mb-1">TOTAL BILL</div>
                          <div className="text-[20px] font-medium text-ink">{formatCurrency(job.estimateData?.grandTotal || 0)}</div>
                      </div>
                  </div>
              </div>
           );
        })}
        {allData.length === 0 && <div className="col-span-full py-20 text-center text-mute uppercase tracking-widest text-[14px]">No data found.</div>}
      </div>
    </div>
  );
};

export default MainDashboard;
