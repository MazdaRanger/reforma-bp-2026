
import React, { useState, useEffect } from 'react';
import { InventoryItem, Supplier } from '../../types';
import { Save, Loader2, Package, Info } from 'lucide-react';

interface InventoryFormProps {
  initialData: Partial<InventoryItem>;
  activeCategory: 'sparepart' | 'material';
  onSave: (data: Partial<InventoryItem>) => Promise<void>;
  onCancel: () => void;
  suppliers?: Supplier[];
}

const InventoryForm: React.FC<InventoryFormProps> = ({ initialData, activeCategory, onSave, onCancel, suppliers = [] }) => {
  const [formData, setFormData] = useState<Partial<InventoryItem>>({
      code: '',
      name: '',
      brand: '',
      stock: 0,
      unit: activeCategory === 'sparepart' ? 'Pcs' : 'Liter',
      minStock: 5,
      buyPrice: 0,
      sellPrice: 0,
      location: '',
      isStockManaged: true, // Default true
      supplierId: '',
      supplierName: '',
      ...initialData
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-set unit defaults when switching categories if creating new
  useEffect(() => {
      if (!initialData.id) {
          setFormData(prev => ({
              ...prev,
              unit: activeCategory === 'sparepart' ? 'Pcs' : 'Liter',
              category: activeCategory,
              isStockManaged: true
          }));
      }
  }, [activeCategory, initialData.id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value, type } = e.target;
      setFormData(prev => ({
          ...prev,
          [name]: type === 'number' ? Number(value) : value
      }));
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'buyPrice' | 'sellPrice') => {
      const raw = e.target.value.replace(/\D/g, '');
      setFormData(prev => ({ ...prev, [field]: raw ? parseInt(raw, 10) : 0 }));
  };

  const handleSupplierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      const supplier = suppliers.find(s => s.id === id);
      setFormData(prev => ({
          ...prev,
          supplierId: id,
          supplierName: supplier ? supplier.name : ''
      }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      await onSave(formData);
      setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-blue-50 p-3 rounded-lg flex items-center gap-3 text-blue-800 text-sm font-medium">
            <Package size={20}/>
            Modul: {activeCategory === 'sparepart' ? 'Suku Cadang (Part)' : 'Bahan Baku (Consumables)'}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Item *</label>
                <input 
                    type="text" required name="name" 
                    value={formData.name} onChange={handleChange} 
                    className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder={activeCategory === 'sparepart' ? "Contoh: Bumper Depan CX-5" : "Contoh: Thinner A Special"}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {activeCategory === 'sparepart' ? 'Part Number (Kode)' : 'Kode Barang'}
                </label>
                <input 
                    type="text" name="code" 
                    value={formData.code} onChange={handleChange} 
                    className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono uppercase"
                    placeholder="X001-222..."
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Merk / Brand</label>
                <input 
                    type="text" name="brand" 
                    value={formData.brand} onChange={handleChange} 
                    className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder={activeCategory === 'sparepart' ? "Mazda Genuine Parts" : "Nippon Paint"}
                />
            </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <h4 className="text-sm font-bold text-gray-800 mb-3 border-b pb-2">Informasi Stok & Vendor</h4>
            
            {/* VENDOR MANAGED STOCK TOGGLE */}
            {activeCategory === 'material' && (
                <div className="mb-4 space-y-3">
                    <div className="bg-white p-3 rounded border border-blue-200 flex items-start gap-3">
                        <input 
                            type="checkbox" 
                            id="isStockManaged"
                            checked={!formData.isStockManaged} // Logic flip: checked means NOT managed
                            onChange={(e) => setFormData(prev => ({...prev, isStockManaged: !e.target.checked}))}
                            className="mt-1 w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                        />
                        <div>
                            <label htmlFor="isStockManaged" className="block text-sm font-bold text-gray-800 cursor-pointer">
                                Stok Dikelola Vendor (Ready Use / Tagihan Bulanan)
                            </label>
                            <p className="text-xs text-gray-500 mt-1">
                                Jika dicentang, sistem tidak akan membatasi stok (bisa minus). Tagihan akan muncul di Hutang Supplier saat bahan dipakai.
                            </p>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Vendor / Supplier Pengelola</label>
                        <select 
                            value={formData.supplierId} 
                            onChange={handleSupplierChange}
                            className="w-full p-2.5 border rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">-- Pilih Supplier (Opsional) --</option>
                            {suppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name} - {s.category}</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-gray-400 mt-1">Wajib diisi jika stok dikelola vendor agar tagihan otomatis muncul.</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-3 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Stok Saat Ini</label>
                    <input 
                        type="number" name="stock" required
                        value={formData.stock} onChange={handleChange} 
                        className="w-full p-2 border rounded font-bold text-gray-900"
                        // If vendor managed, allow any number, typically user starts at 0 and it goes negative
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Satuan</label>
                    <select 
                        name="unit" value={formData.unit} onChange={handleChange}
                        className="w-full p-2 border rounded bg-white"
                    >
                        {activeCategory === 'sparepart' ? (
                            <>
                                <option value="Pcs">Pcs</option>
                                <option value="Set">Set</option>
                                <option value="Unit">Unit</option>
                            </>
                        ) : (
                            <>
                                <option value="Liter">Liter</option>
                                <option value="Kaleng">Kaleng</option>
                                <option value="Kg">Kg</option>
                                <option value="Pcs">Pcs (Lembar/Roll)</option>
                            </>
                        )}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Min. Alert</label>
                    <input 
                        type="number" name="minStock" 
                        value={formData.minStock} onChange={handleChange} 
                        className="w-full p-2 border rounded"
                        disabled={!formData.isStockManaged}
                    />
                </div>
                <div className="col-span-3">
                     <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Lokasi Penyimpanan</label>
                     <input 
                        type="text" name="location" 
                        value={formData.location || ''} onChange={handleChange} 
                        className="w-full p-2 border rounded"
                        placeholder="Contoh: Rak A-12, Gudang Cat..."
                    />
                </div>
            </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <h4 className="text-sm font-bold text-gray-800 mb-3 border-b pb-2">Harga & Modal</h4>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Harga Beli (Modal)</label>
                    <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-500 text-sm">Rp</span>
                        <input 
                            type="text" name="buyPrice" 
                            value={formData.buyPrice ? new Intl.NumberFormat('id-ID').format(formData.buyPrice) : ''} 
                            onChange={e => handlePriceChange(e, 'buyPrice')} 
                            className="w-full p-2 pl-9 border rounded"
                            placeholder="0"
                        />
                    </div>
                    {activeCategory === 'material' && (
                         <p className="text-[10px] text-gray-500 mt-1">Masukkan harga per {formData.unit}.</p>
                    )}
                </div>

                {activeCategory === 'sparepart' ? (
                    <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Harga Jual (Est)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2 text-gray-500 text-sm">Rp</span>
                            <input 
                                type="text" name="sellPrice" 
                                value={formData.sellPrice ? new Intl.NumberFormat('id-ID').format(formData.sellPrice) : ''} 
                                onChange={e => handlePriceChange(e, 'sellPrice')} 
                                className="w-full p-2 pl-9 border rounded font-bold text-emerald-700"
                                placeholder="0"
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center text-xs text-gray-500 italic bg-white p-2 border rounded">
                        Bahan baku biasanya tidak dijual langsung, namun dibebankan sebagai biaya produksi.
                    </div>
                )}
            </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Batal</button>
            <button 
                type="submit" disabled={isSubmitting}
                className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 transition-colors disabled:opacity-70"
            >
                {isSubmitting ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                Simpan Item
            </button>
        </div>
    </form>
  );
};

export default InventoryForm;
