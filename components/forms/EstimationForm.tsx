
import React, { useState, useEffect, useMemo } from 'react';
import { Job, Vehicle } from '../../types';
import { Search, CheckCircle, AlertCircle, User, Car, Clock, PlusCircle } from 'lucide-react';
import { formatPoliceNumber, formatDateIndo, formatCurrency } from '../../utils/helpers';

interface EstimationFormProps {
  allVehicles: Vehicle[];
  allJobs: Job[];
  onNavigate: (view: string) => void;
  openModal: (type: string, data: any) => void;
  onCreateTransaction?: (vehicle: Vehicle) => void;
}

const EstimationForm: React.FC<EstimationFormProps> = ({ allVehicles, allJobs, onNavigate, openModal, onCreateTransaction }) => {
  const [searchParams, setSearchParams] = useState({ policeNumber: '', nomorRangka: '', nomorMesin: '' });
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [history, setHistory] = useState<Job[]>([]);

  // Fungsi normalisasi untuk pencarian yang lebih akurat
  const normalize = (val: string | undefined) => (val || '').replace(/\s/g, '').toUpperCase();

  // Re-run search whenever search parameters OR the database list changes
  useEffect(() => {
    const { policeNumber, nomorRangka, nomorMesin } = searchParams;
    
    // Minimal search criteria
    if (!policeNumber && !nomorRangka && !nomorMesin) {
      setSelectedVehicle(null);
      setHistory([]);
      return;
    }

    const found = allVehicles.find(v => {
      if (policeNumber && normalize(v.policeNumber) === normalize(policeNumber)) return true;
      if (nomorRangka && normalize(v.nomorRangka) === normalize(nomorRangka)) return true;
      if (nomorMesin && normalize(v.nomorMesin) === normalize(nomorMesin)) return true;
      return false;
    });

    if (found) {
      setSelectedVehicle(found);
      // Sinkronisasi params jika ditemukan via salah satu field
      setSearchParams(prev => ({
        ...prev,
        policeNumber: prev.policeNumber || found.policeNumber || '',
        nomorRangka: prev.nomorRangka || found.nomorRangka || '',
        nomorMesin: prev.nomorMesin || found.nomorMesin || ''
      }));

      const jobHistory = allJobs
        .filter(j => j.unitId === found.id)
        .sort((a, b) => {
           const timeA = a.createdAt?.seconds || 0;
           const timeB = b.createdAt?.seconds || 0;
           return timeB - timeA;
        });
      setHistory(jobHistory);
    } else {
      setSelectedVehicle(null);
      setHistory([]);
    }
  }, [searchParams.policeNumber, searchParams.nomorRangka, searchParams.nomorMesin, allVehicles, allJobs]);

  const handleInputChange = (field: keyof typeof searchParams, value: string) => {
    const processedValue = field === 'policeNumber' ? formatPoliceNumber(value) : value.toUpperCase().trim();
    setSearchParams(prev => ({ ...prev, [field]: processedValue }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Estimasi & Work Order</h1>
        <div className="text-xs font-medium text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
          Database: {allVehicles.length} Unit Terdaftar
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Search size={20} className="text-indigo-600"/> Cari Unit dalam Database
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
                <label className="text-sm font-medium text-gray-700">No. Polisi</label>
                <div className="relative">
                    <input 
                      type="text" 
                      value={searchParams.policeNumber} 
                      onChange={(e) => handleInputChange('policeNumber', e.target.value)} 
                      className="w-full p-2.5 border border-gray-300 rounded-lg uppercase font-bold mt-1 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                      placeholder="Contoh: B1234ABC"
                    />
                    {selectedVehicle && normalize(selectedVehicle.policeNumber) === normalize(searchParams.policeNumber) && (
                      <CheckCircle size={18} className="absolute right-3 top-4 text-green-600 animate-bounce-in" />
                    )}
                </div>
            </div>
            <div>
                <label className="text-sm font-medium text-gray-700">No. Rangka</label>
                <input 
                  type="text" 
                  value={searchParams.nomorRangka} 
                  onChange={(e) => handleInputChange('nomorRangka', e.target.value)} 
                  className="w-full p-2.5 border border-gray-300 rounded-lg uppercase mt-1 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="VIN Number"
                />
            </div>
            <div>
                <label className="text-sm font-medium text-gray-700">No. Mesin</label>
                <input 
                  type="text" 
                  value={searchParams.nomorMesin} 
                  onChange={(e) => handleInputChange('nomorMesin', e.target.value)} 
                  className="w-full p-2.5 border border-gray-300 rounded-lg uppercase mt-1 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="Engine Number"
                />
            </div>
        </div>
        
        {!selectedVehicle && normalize(searchParams.policeNumber).length > 2 && (
             <div className="mt-4 p-4 bg-amber-50 text-amber-800 rounded-xl border border-amber-100 flex items-start gap-3 text-sm animate-fade-in">
                <AlertCircle size={20} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Unit Belum Terdaftar di Master Data</p>
                  <p className="mt-1">Nopol <span className="font-mono font-bold">{searchParams.policeNumber}</span> tidak ditemukan. 
                  Silakan <span className="font-bold underline cursor-pointer hover:text-amber-900" onClick={() => onNavigate('input_data')}>Daftarkan Unit Baru</span> terlebih dahulu.</p>
                </div>
             </div>
        )}
      </div>

      {selectedVehicle && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4"><User className="text-indigo-600" size={20} /> <h4 className="font-bold text-gray-700">Identitas Pelanggan</h4></div>
                <p className="text-2xl font-black text-gray-900">{selectedVehicle.customerName}</p>
                <p className="text-sm text-gray-500 font-medium mt-1">{selectedVehicle.customerPhone || 'Tidak ada nomor telepon'}</p>
                <div className="mt-4 p-3 bg-gray-50 rounded-lg border text-xs text-gray-600">
                  <p className="font-bold uppercase text-[10px] text-gray-400 mb-1">Alamat Terdaftar:</p>
                  {selectedVehicle.customerAddress || '-'}, {selectedVehicle.customerKota || '-'}
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4"><Car className="text-indigo-600" size={20} /> <h4 className="font-bold text-gray-700">Detail Kendaraan</h4></div>
                <p className="text-2xl font-black text-gray-900">{selectedVehicle.carModel}</p>
                <p className="text-sm text-gray-500 font-medium mt-1">{selectedVehicle.warnaMobil}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                   <div className="p-2 bg-indigo-50 rounded border border-indigo-100">
                      <p className="text-[9px] font-bold text-indigo-400 uppercase">Asuransi</p>
                      <p className="text-xs font-bold text-indigo-800 truncate">{selectedVehicle.namaAsuransi}</p>
                   </div>
                   <div className="p-2 bg-gray-50 rounded border border-gray-200">
                      <p className="text-[9px] font-bold text-gray-400 uppercase">Tahun</p>
                      <p className="text-xs font-bold text-gray-800">{selectedVehicle.tahunPembuatan || '-'}</p>
                   </div>
                </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 bg-gray-50 border-b">
                  <div className="flex items-center gap-2 font-bold text-gray-700">
                    <Clock className="text-indigo-600" size={20} /> Riwayat Estimasi & WO
                  </div>
                  <span className="text-xs bg-white px-2 py-1 rounded-full border font-bold text-gray-500">
                    {history.length} Record Ditemukan
                  </span>
                </div>
                
                {history.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                          <thead className="bg-white border-b uppercase text-[10px] font-black text-gray-400">
                              <tr>
                                <th className="p-4 text-left">Tanggal</th>
                                <th className="p-4 text-left">No. Dokumen</th>
                                <th className="p-4 text-left">Status</th>
                                <th className="p-4 text-right">Nilai Transaksi</th>
                                <th className="p-4 text-center">Aksi</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                              {history.map(job => (
                                  <tr key={job.id} className="hover:bg-indigo-50/30 transition-colors">
                                      <td className="p-4 font-medium text-gray-600">{formatDateIndo(job.tanggalMasuk)}</td>
                                      <td className="p-4">
                                        <div className="font-mono font-bold text-indigo-700">{job.woNumber || job.estimateData?.estimationNumber || 'DRAFT'}</div>
                                        <div className="text-[10px] text-gray-400">{job.woNumber ? 'Work Order' : 'Estimasi'}</div>
                                      </td>
                                      <td className="p-4">
                                        {job.isClosed ? 
                                          <span className="px-2 py-1 bg-red-50 text-red-600 text-[10px] font-black rounded-full border border-red-100 uppercase">Closed</span> : 
                                          <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-full border border-emerald-100 uppercase">Active / Open</span>
                                        }
                                      </td>
                                      <td className="p-4 text-right font-black text-gray-900">{formatCurrency(job.estimateData?.grandTotal)}</td>
                                      <td className="p-4 text-center">
                                        <button 
                                          onClick={() => openModal('create_estimation', job)} 
                                          className="text-indigo-600 font-bold hover:underline bg-indigo-50 px-3 py-1.5 rounded-lg transition-all"
                                        >
                                          Buka Detail
                                        </button>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                    </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="inline-flex p-4 bg-gray-50 rounded-full mb-3 text-gray-300">
                      <Search size={32} />
                    </div>
                    <p className="text-gray-400 font-medium italic">Belum ada riwayat perbaikan untuk unit ini.</p>
                  </div>
                )}
            </div>

            <div className="lg:col-span-2 flex justify-end pt-4">
                 <button 
                  onClick={() => onCreateTransaction?.(selectedVehicle)} 
                  className="flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-black shadow-xl transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                 >
                    <PlusCircle size={22} /> BUAT ESTIMASI / TRANSAKSI BARU
                 </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default EstimationForm;
