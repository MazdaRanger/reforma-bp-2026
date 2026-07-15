import React, { useState, useMemo } from 'react';
import { Job, Settings } from '../../types';
import { Search, FileText, Printer, ChevronRight, CheckCircle2, User, FileSignature } from 'lucide-react';
import { generateSuratPuasPDF, generateSuratKuasaPDF } from '../../utils/pdfGenerator';
import Modal from '../ui/Modal';

interface SuratPentingViewProps {
  jobs: Job[];
  settings: Settings;
  showNotification: (msg: string, type: string) => void;
}

const SuratPentingView: React.FC<SuratPentingViewProps> = ({ jobs, settings, showNotification }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [activeTab, setActiveTab] = useState<'puas' | 'kuasa'>('puas');

  // Form State for Surat Kuasa
  const [formData, setFormData] = useState({
    namaPenerimaKuasa: '',
    nikPenerimaKuasa: '',
    alamatPenerimaKuasa: ''
  });

  const filteredJobs = useMemo(() => {
    if (!searchTerm) return [];
    const term = searchTerm.toLowerCase();
    return jobs.filter(j => 
      !j.isDeleted && 
      (j.policeNumber.toLowerCase().includes(term) || 
       j.customerName.toLowerCase().includes(term) ||
       (j.woNumber && j.woNumber.toLowerCase().includes(term)))
    ).slice(0, 10); // Limit to 10 for performance
  }, [jobs, searchTerm]);

  const handleGenerate = () => {
    if (!selectedJob) {
      showNotification('Pilih kendaraan terlebih dahulu', 'error');
      return;
    }

    try {
      if (activeTab === 'puas') {
        generateSuratPuasPDF(selectedJob, settings);
        showNotification('Surat Pernyataan Puas berhasil di-generate', 'success');
      } else {
        if (!formData.namaPenerimaKuasa || !formData.nikPenerimaKuasa) {
          showNotification('Nama dan NIK Penerima Kuasa wajib diisi', 'error');
          return;
        }
        generateSuratKuasaPDF(selectedJob, formData, settings);
        showNotification('Surat Kuasa berhasil di-generate', 'success');
      }
    } catch (error: any) {
      console.error(error);
      showNotification('Gagal men-generate surat: ' + error.message, 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
          <FileText size={28} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Surat Penting</h1>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
            Generator Dokumen Pelanggan
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Search & Select Job */}
        <div className="col-span-1 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <h2 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wider">1. Pilih Kendaraan</h2>
            
            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Cari Nopol / Nama / WO..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 p-3 border border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-indigo-50 outline-none transition-all uppercase"
              />
            </div>

            {selectedJob ? (
              <div className="p-4 border-2 border-indigo-500 bg-indigo-50 rounded-xl relative">
                <button 
                  onClick={() => setSelectedJob(null)}
                  className="absolute top-2 right-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 px-2 py-1 rounded"
                >
                  Ganti
                </button>
                <div className="flex items-center gap-2 text-indigo-700 mb-2">
                  <CheckCircle2 size={16} />
                  <span className="text-xs font-bold uppercase tracking-wider">Terpilih</span>
                </div>
                <p className="font-black text-gray-900">{selectedJob.policeNumber}</p>
                <p className="text-sm text-gray-600 mt-1 font-medium">{selectedJob.customerName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{selectedJob.carBrand} {selectedJob.carModel}</p>
                {selectedJob.woNumber && (
                  <p className="text-xs font-bold text-gray-400 mt-2">WO: {selectedJob.woNumber}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
                {searchTerm && filteredJobs.length === 0 ? (
                  <p className="text-center text-sm text-gray-500 py-4">Data tidak ditemukan</p>
                ) : (
                  filteredJobs.map(job => (
                    <button
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className="w-full text-left p-3 rounded-xl border border-gray-100 hover:border-indigo-300 hover:bg-indigo-50 transition-all group"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-bold text-gray-900 group-hover:text-indigo-700">{job.policeNumber}</p>
                          <p className="text-xs text-gray-500">{job.customerName}</p>
                        </div>
                        <ChevronRight size={16} className="text-gray-300 group-hover:text-indigo-500" />
                      </div>
                    </button>
                  ))
                )}
                {!searchTerm && (
                   <p className="text-center text-xs text-gray-400 py-4">Ketik nopol atau nama untuk mencari data kendaraan.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Document Options & Generation */}
        <div className="col-span-1 md:col-span-2 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm min-h-[400px]">
            <h2 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wider">2. Pilih Jenis Surat</h2>
            
            <div className="flex gap-4 mb-6">
              <button
                onClick={() => setActiveTab('puas')}
                className={`flex-1 p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  activeTab === 'puas' 
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                    : 'border-gray-100 hover:border-gray-300 text-gray-500'
                }`}
              >
                <CheckCircle2 size={24} />
                <span className="font-bold text-sm text-center">Surat Pernyataan Puas</span>
              </button>
              
              <button
                onClick={() => setActiveTab('kuasa')}
                className={`flex-1 p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  activeTab === 'kuasa' 
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                    : 'border-gray-100 hover:border-gray-300 text-gray-500'
                }`}
              >
                <FileSignature size={24} />
                <span className="font-bold text-sm text-center">Surat Kuasa Pengambilan</span>
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
              {activeTab === 'puas' ? (
                <div className="space-y-4 animate-fade-in">
                  <h3 className="font-bold text-gray-800">Preview Surat Pernyataan Puas</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Surat ini digunakan untuk menyatakan bahwa pemilik kendaraan atau pihak yang diberi kuasa 
                    menyatakan puas terhadap hasil perbaikan yang telah dilakukan oleh bengkel. 
                    <br/><br/>
                    Dengan menandatangani surat ini, pelanggan membebaskan bengkel dari tuntutan 
                    di kemudian hari setelah proses serah terima kendaraan selesai dilaksanakan.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 animate-fade-in">
                  <h3 className="font-bold text-gray-800">Form Data Penerima Kuasa</h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Pemberi Kuasa (Pemilik Kendaraan) adalah <strong>{selectedJob?.customerName || '-'}</strong>. 
                    Silakan isi data Penerima Kuasa di bawah ini:
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 uppercase">Nama Penerima Kuasa</label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        <input
                          type="text"
                          value={formData.namaPenerimaKuasa}
                          onChange={(e) => setFormData({...formData, namaPenerimaKuasa: e.target.value})}
                          placeholder="Nama Sesuai KTP"
                          className="w-full pl-10 p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 uppercase">NIK / No. Identitas</label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        <input
                          type="text"
                          value={formData.nikPenerimaKuasa}
                          onChange={(e) => setFormData({...formData, nikPenerimaKuasa: e.target.value})}
                          placeholder="Nomor KTP / SIM"
                          className="w-full pl-10 p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 pt-2">
                    <label className="text-xs font-bold text-gray-700 uppercase">Alamat Penerima Kuasa</label>
                    <textarea
                      value={formData.alamatPenerimaKuasa}
                      onChange={(e) => setFormData({...formData, alamatPenerimaKuasa: e.target.value})}
                      placeholder="Alamat Lengkap Sesuai KTP"
                      rows={3}
                      className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={!selectedJob}
                className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <Printer size={18} />
                CETAK DOKUMEN (PDF)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuratPentingView;
