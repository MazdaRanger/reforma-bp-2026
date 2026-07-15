import React, { useState, useEffect } from 'react';
import { Vehicle, Settings } from '../../types';
import { formatPoliceNumber, cleanObject, isInsuranceJob } from '../../utils/helpers';
import { Save, Loader2, User, Car, Shield, Search, Info, MapPin, Tag, Calendar, Database, RefreshCw } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, UNITS_MASTER_COLLECTION } from '../../services/firebase';

interface JobFormProps {
  initialData?: Vehicle | null;
  settings: Settings;
  onSave: (data: Partial<Vehicle>) => Promise<void>;
  onCancel: () => void;
  allJobs?: any[];
}

const DICTIONARY: Record<string, Record<string, string>> = {
    id: {
        title: "Registrasi Master Unit", 
        edit_title: "Perbarui Data Unit Master",
        desc_banner: "Menu ini khusus untuk mendaftarkan database kendaraan baru. Masukkan No. Polisi lalu tekan ENTER untuk cek data lama.",
        sec_vehicle: "Spesifikasi Kendaraan",
        label_police: "No. Polisi (Nopol)",
        placeholder_police: "B 1234 ABC (Tekan Enter)",
        label_brand: "Merk Kendaraan",
        label_model: "Tipe / Model",
        placeholder_model: "CX-5, Mazda 3, dll...",
        label_color: "Warna Utama",
        label_vin: "VIN (Nomor Rangka)",
        placeholder_vin: "17 Digit VIN...",
        label_engine: "Nomor Mesin",
        label_year: "Tahun Pembuatan",
        sec_admin: "Data Penjamin (Master)",
        label_insurance: "Pihak Penjamin (Asuransi)",
        label_policy_no: "Nomor Polis",
        label_policy_expiry: "Masa Berlaku Polis",
        sec_customer: "Kontak & Alamat Pelanggan",
        label_cust_name: "Nama Lengkap Pemilik",
        label_cust_phone: "Nomor WhatsApp / HP",
        sec_location: "Detail Lokasi Pelanggan",
        label_address: "Alamat Lengkap (Jalan/No. Rumah)",
        label_kel: "Kelurahan",
        label_kec: "Kecamatan",
        label_city: "Kota / Kabupaten",
        label_prov: "Provinsi",
        btn_save: "SIMPAN DATABASE UNIT",
        btn_update: "PERBARUI DATA MASTER",
        btn_cancel: "Batal"
    },
    en: {
        title: "Master Vehicle Registration",
        edit_title: "Update Master Vehicle Data",
        desc_banner: "Enter License Plate and press ENTER to check for existing data or register new.",
        sec_vehicle: "Vehicle Specification",
        label_police: "Plate Number",
        placeholder_police: "B 1234 ABC (Press Enter)",
        label_brand: "Vehicle Brand",
        label_model: "Type / Model",
        placeholder_model: "CX-5, Mazda 3, etc...",
        label_color: "Primary Color",
        label_vin: "VIN (Frame Number)",
        placeholder_vin: "17 Digit VIN...",
        label_engine: "Engine Number",
        label_year: "Year of Manufacture",
        sec_admin: "Insurance Data (Master)",
        label_insurance: "Payer / Insurance",
        label_policy_no: "Policy Number",
        label_policy_expiry: "Policy Expiry Date",
        sec_customer: "Customer Contact & Address",
        label_cust_name: "Full Owner Name",
        label_cust_phone: "WhatsApp / Phone Number",
        sec_location: "Customer Location Detail",
        label_address: "Full Address (Street/House No)",
        label_kel: "District (Kelurahan)",
        label_kec: "Sub-district (Kecamatan)",
        label_city: "City / Regency",
        label_prov: "Province",
        btn_save: "SAVE TO DATABASE",
        btn_update: "UPDATE MASTER DATA",
        btn_cancel: "Cancel"
    }
};

const JobForm: React.FC<JobFormProps> = ({ initialData, settings, onSave, onCancel, allJobs = [] }) => {
  const lang = settings.language || 'id';
  const t = (key: string) => DICTIONARY[lang][key] || key;

  const [formData, setFormData] = useState<Partial<Vehicle>>({
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    customerKelurahan: '',
    customerKecamatan: '',
    customerKota: '',
    customerProvinsi: '',
    policeNumber: '',
    carBrand: settings.carBrands?.[0] || 'Mazda',
    carModel: '',
    warnaMobil: settings.carColors?.[0] || 'Soul Red Crystal Metallic',
    nomorRangka: '',
    nomorMesin: '',
    tahunPembuatan: '',
    namaAsuransi: 'Umum / Pribadi',
    nomorPolis: '',
    asuransiExpiryDate: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchMessage, setSearchMessage] = useState<{type: 'success'|'error'|'info', text: string} | null>(null);

  const [customBrand, setCustomBrand] = useState('');
  const [customColor, setCustomColor] = useState('');

  useEffect(() => {
    if (initialData) {
      setFormData({ ...initialData });
      setIsEditMode(true);
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let processedValue: string | number = value;
    if (name === 'policeNumber') processedValue = formatPoliceNumber(value);
    
    setFormData(prev => ({
        ...prev, 
        [name]: processedValue 
    }));
  };

  const handleCheckVehicle = async () => {
      const nopol = formData.policeNumber;
      if (!nopol || nopol.length < 3) return;

      setIsSearching(true);
      setSearchMessage(null);

      try {
          const q = query(collection(db, UNITS_MASTER_COLLECTION), where("policeNumber", "==", nopol));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
              const docData = querySnapshot.docs[0].data() as Vehicle;
              const docId = querySnapshot.docs[0].id;
              
              setFormData({ ...docData, id: docId });
              setIsEditMode(true);
              setSearchMessage({ type: 'success', text: "Data kendaraan ditemukan! Mode Edit Aktif." });
          } else {
              setSearchMessage({ type: 'info', text: "Unit belum terdaftar. Silakan lanjutkan input data baru." });
              setIsEditMode(false);
              // Reset ID to ensure new creation if previously in edit mode
              setFormData(prev => {
                  const { id, ...rest } = prev;
                  return { ...rest, policeNumber: nopol }; // Keep the nopol
              });
          }
      } catch (error) {
          console.error("Error checking vehicle:", error);
          setSearchMessage({ type: 'error', text: "Gagal mengecek database." });
      } finally {
          setIsSearching(false);
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          e.preventDefault(); // Prevent form submission
          handleCheckVehicle();
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.policeNumber || !formData.customerName) return;

    // Strict Address Validation
    const address = (formData.customerAddress || '').trim();
    const kota = (formData.customerKota || '').trim();
    const kecamatan = (formData.customerKecamatan || '').trim();
    const kelurahan = (formData.customerKelurahan || '').trim();

    if (!address || !kota || !kecamatan || !kelurahan) {
        alert("Seluruh kolom alamat (Alamat Lengkap, Kelurahan, Kecamatan, Kota/Kabupaten) WAJIB diisi dengan lengkap!");
        return;
    }

    // Prevent copy-pasting the same word in all boxes
    const lowerAddress = address.toLowerCase();
    const lowerKota = kota.toLowerCase();
    const lowerKec = kecamatan.toLowerCase();
    const lowerKel = kelurahan.toLowerCase();

    if (lowerAddress === lowerKota || lowerKec === lowerKota || lowerKel === lowerKota || lowerKel === lowerKec) {
        alert("Data alamat tidak valid! Tidak diperkenankan mengisi data yang sama persis di setiap kolom alamat (misalnya mengisi nama kota di semua kolom).");
        return;
    }

    if (formData.carBrand === 'Lainnya' && !customBrand.trim()) {
        alert("Kolom Merek Kendaraan Manual WAJIB diisi!");
        return;
    }
    if (formData.warnaMobil === 'Lainnya' && !customColor.trim()) {
        alert("Kolom Warna Kendaraan Manual WAJIB diisi!");
        return;
    }

    const payloadToSave = {
        ...formData,
        carBrand: formData.carBrand === 'Lainnya' ? customBrand.toUpperCase() : formData.carBrand,
        warnaMobil: formData.warnaMobil === 'Lainnya' ? customColor.toUpperCase() : formData.warnaMobil
    };

    setIsSubmitting(true);
    try { await onSave(payloadToSave); } catch (error) { console.error(error); } finally { setIsSubmitting(false); }
  };

  const isInsurance = isInsuranceJob(formData.namaAsuransi);

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-fade-in max-w-5xl mx-auto py-2">
      <div className="bg-muted border border-border p-4 rounded-lg flex items-start gap-3">
          <div>
              <h4 className="font-bold text-textPrimary text-sm">Mode Registrasi Master Data</h4>
              <p className="text-xs text-textSecondary mt-1 leading-relaxed">{t('desc_banner')}</p>
          </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-3">
            <h4 className="text-base font-bold text-textPrimary">{t('sec_vehicle')}</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-6">
            <div className="space-y-1.5 md:col-span-1 relative">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('label_police')}</label>
                <div className="relative group">
                    <input 
                        type="text" 
                        name="policeNumber" 
                        value={formData.policeNumber} 
                        onChange={handleChange} 
                        onKeyDown={handleKeyDown}
                        placeholder={t('placeholder_police')} 
                        className={`w-full p-3 pl-11 bg-card border rounded-md transition-all uppercase font-bold text-textPrimary tracking-tight ${searchMessage?.type === 'success' ? 'border-emerald-400' : 'border-border focus:border-primary focus:ring-1 focus:ring-primary'}`}
                        required 
                        autoFocus 
                    />
                    <div className="absolute left-4 top-3.5 text-gray-400">
                        {isSearching ? <Loader2 size={18} className="animate-spin text-indigo-600"/> : <Search size={18}/>}
                    </div>
                    <button 
                        type="button"
                        onClick={handleCheckVehicle}
                        className="absolute right-2 top-2 p-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"
                        title="Cek Database"
                    >
                        <RefreshCw size={14}/>
                    </button>
                </div>
                {searchMessage && (
                    <div className={`mt-2 text-xs font-bold flex items-center gap-1.5 animate-fade-in ${searchMessage.type === 'success' ? 'text-emerald-600' : searchMessage.type === 'error' ? 'text-red-600' : 'text-blue-600'}`}>
                        <Info size={12}/> {searchMessage.text}
                    </div>
                )}
            </div>
            
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">{t('label_brand')}</label>
                <select name="carBrand" value={formData.carBrand} onChange={handleChange} className="w-full p-3 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary transition-all font-semibold text-textPrimary">
                    {(settings.carBrands || []).map(b => <option key={b} value={b}>{b}</option>)}
                    <option value="Lainnya">Lainnya (Ketik Manual)</option>
                </select>
                {formData.carBrand === 'Lainnya' && (
                    <input 
                        type="text" 
                        value={customBrand} 
                        onChange={(e) => setCustomBrand(e.target.value)} 
                        placeholder="Ketik Merek Kendaraan" 
                        required
                        className="w-full mt-2 p-3 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary transition-all font-semibold text-textPrimary uppercase"
                    />
                )}
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">{t('label_model')}</label>
                <div className="relative group">
                    <input list="car-models-list" type="text" name="carModel" value={formData.carModel} onChange={handleChange} placeholder={t('placeholder_model')} className="w-full p-3 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary transition-all font-semibold text-textPrimary" />
                    <datalist id="car-models-list">{(settings.carModels || []).map(m => <option key={m} value={m}/>)}</datalist>
                </div>
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">{t('label_color')}</label>
                <select name="warnaMobil" value={formData.warnaMobil} onChange={handleChange} className="w-full p-3 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary transition-all font-semibold text-textPrimary">
                    {(settings.carColors || []).map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="Lainnya">Lainnya (Ketik Manual)</option>
                </select>
                {formData.warnaMobil === 'Lainnya' && (
                    <input 
                        type="text" 
                        value={customColor} 
                        onChange={(e) => setCustomColor(e.target.value)} 
                        placeholder="Ketik Warna Kendaraan" 
                        required
                        className="w-full mt-2 p-3 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary transition-all font-semibold text-textPrimary uppercase"
                    />
                )}
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">{t('label_vin')}</label>
                <input type="text" name="nomorRangka" value={formData.nomorRangka || ''} onChange={handleChange} className="w-full p-3 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono text-xs font-semibold uppercase text-textPrimary" placeholder={t('placeholder_vin')} />
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">{t('label_engine')}</label>
                <input type="text" name="nomorMesin" value={formData.nomorMesin || ''} onChange={handleChange} className="w-full p-3 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono text-xs font-semibold uppercase text-textPrimary" placeholder={t('label_engine')} />
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">{t('label_year')}</label>
                <input type="text" name="tahunPembuatan" value={formData.tahunPembuatan || ''} onChange={handleChange} className="w-full p-3 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary transition-all font-semibold text-textPrimary" placeholder="2023" />
            </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-3">
            <h4 className="text-base font-bold text-textPrimary">{t('sec_admin')}</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">{t('label_insurance')}</label>
                <select name="namaAsuransi" value={formData.namaAsuransi} onChange={handleChange} className={`w-full p-3 border rounded-md font-semibold transition-all ${isInsurance ? 'border-primary/50 bg-primary/5 text-primary shadow-sm' : 'border-border bg-card text-textPrimary'}`}>
                    {(settings.insuranceOptions || []).map(ins => <option key={ins.name} value={ins.name}>{ins.name.toUpperCase()}</option>)}
                </select>
            </div>
            {isInsurance ? (
                <>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">{t('label_policy_no')}</label>
                        <input type="text" name="nomorPolis" value={formData.nomorPolis || ''} onChange={handleChange} placeholder={t('label_policy_no')} className="w-full p-3 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary font-semibold text-textPrimary" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider flex items-center gap-1">{t('label_policy_expiry')}</label>
                        <input type="date" name="asuransiExpiryDate" value={formData.asuransiExpiryDate || ''} onChange={handleChange} className="w-full p-3 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary font-semibold text-textPrimary" />
                    </div>
                </>
            ) : <div className="hidden md:block"></div>}
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-3">
            <h4 className="text-base font-bold text-textPrimary">{t('sec_customer')}</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">{t('label_cust_name')}</label>
                <input type="text" name="customerName" value={formData.customerName} onChange={handleChange} className="w-full p-3 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary font-semibold text-textPrimary" required />
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-textSecondary uppercase tracking-wider">{t('label_cust_phone')}</label>
                <input type="text" name="customerPhone" value={formData.customerPhone} onChange={handleChange} className="w-full p-3 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary font-semibold text-textPrimary" placeholder="08..." required />
            </div>
        </div>
        <div className="space-y-6 bg-muted/50 p-6 rounded-lg border border-border mt-4">
            <div className="flex items-center gap-2 mb-2"><span className="text-xs font-bold text-textPrimary uppercase tracking-widest">{t('sec_location')}</span></div>
            <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-textSecondary uppercase tracking-wider">{t('label_address')}</label>
                    <textarea name="customerAddress" value={formData.customerAddress} onChange={handleChange} rows={2} className="w-full p-3 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary transition-all text-textPrimary" />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-textSecondary uppercase tracking-wider">{t('label_kel')}</label><input type="text" name="customerKelurahan" value={formData.customerKelurahan || ''} onChange={handleChange} className="w-full p-2.5 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary font-medium text-textPrimary" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-textSecondary uppercase tracking-wider">{t('label_kec')}</label><input type="text" name="customerKecamatan" value={formData.customerKecamatan || ''} onChange={handleChange} className="w-full p-2.5 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary font-medium text-textPrimary" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-textSecondary uppercase tracking-wider">{t('label_city')}</label><input type="text" name="customerKota" value={formData.customerKota || ''} onChange={handleChange} className="w-full p-2.5 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary font-medium text-textPrimary" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-textSecondary uppercase tracking-wider">{t('label_prov')}</label><input type="text" name="customerProvinsi" value={formData.customerProvinsi || ''} onChange={handleChange} className="w-full p-2.5 bg-card border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary font-medium text-textPrimary" /></div>
            </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-border">
        <button type="button" onClick={onCancel} className="px-6 py-2.5 text-textSecondary hover:text-textPrimary font-semibold transition-colors" disabled={isSubmitting}>{t('btn_cancel')}</button>
        <button type="submit" disabled={isSubmitting} className={`flex items-center gap-2 px-8 py-2.5 text-primary-foreground rounded-md transition-all shadow-sm font-semibold tracking-wide bg-primary hover:bg-primary/90 transform active:scale-95`}>
          {isSubmitting && <Loader2 className="animate-spin" size={16} />}
          {isEditMode ? t('btn_update') : t('btn_save')}
        </button>
      </div>
    </form>
  );
};

export default JobForm;
