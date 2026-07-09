import React, { useState, useEffect } from 'react';
import { InventoryItem, Supplier } from '../../types';

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
      isStockManaged: true,
      supplierId: '',
      supplierName: '',
      ...initialData
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <form onSubmit={handleSubmit} className="space-y-[24px]">
        <div className="bg-canvas border border-ink p-4 text-[12px] font-medium text-ink uppercase tracking-widest">
            MODUL: {activeCategory === 'sparepart' ? 'SUKU CADANG (PART)' : 'BAHAN BAKU (CONSUMABLES)'}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
            <div className="md:col-span-2">
                <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">NAMA ITEM *</label>
                <input 
                    type="text" required name="name" 
                    value={formData.name} onChange={handleChange} 
                    className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase"
                    placeholder={activeCategory === 'sparepart' ? "CONTOH: BUMPER DEPAN CX-5" : "CONTOH: THINNER A SPECIAL"}
                />
            </div>

            <div>
                <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">
                    {activeCategory === 'sparepart' ? 'PART NUMBER (KODE)' : 'KODE BARANG'}
                </label>
                <input 
                    type="text" name="code" 
                    value={formData.code} onChange={handleChange} 
                    className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase"
                    placeholder="X001-222..."
                />
            </div>

            <div>
                <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">MERK / BRAND</label>
                <input 
                    type="text" name="brand" 
                    value={formData.brand} onChange={handleChange} 
                    className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase"
                    placeholder={activeCategory === 'sparepart' ? "MAZDA GENUINE PARTS" : "NIPPON PAINT"}
                />
            </div>
        </div>

        <div className="p-6 bg-soft-cloud border border-hairline">
            <h4 className="text-[14px] font-medium text-ink uppercase tracking-widest mb-4 border-b border-hairline pb-4">INFORMASI STOK & VENDOR</h4>
            
            {activeCategory === 'material' && (
                <div className="mb-6 space-y-4">
                    <div className="bg-canvas p-4 border border-hairline flex items-start gap-4">
                        <input 
                            type="checkbox" 
                            id="isStockManaged"
                            checked={!formData.isStockManaged} 
                            onChange={(e) => setFormData(prev => ({...prev, isStockManaged: !e.target.checked}))}
                            className="mt-1 w-4 h-4 accent-ink"
                        />
                        <div>
                            <label htmlFor="isStockManaged" className="block text-[12px] font-medium text-ink uppercase tracking-widest cursor-pointer">
                                STOK DIKELOLA VENDOR (READY USE / TAGIHAN BULANAN)
                            </label>
                            <p className="text-[10px] text-mute mt-1 uppercase tracking-widest leading-relaxed">
                                JIKA DICENTANG, SISTEM TIDAK AKAN MEMBATASI STOK (BISA MINUS). TAGIHAN AKAN MUNCUL DI HUTANG SUPPLIER SAAT BAHAN DIPAKAI.
                            </p>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">VENDOR / SUPPLIER PENGELOLA</label>
                        <select 
                            value={formData.supplierId} 
                            onChange={handleSupplierChange}
                            className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase"
                        >
                            <option value="">-- PILIH SUPPLIER (OPSIONAL) --</option>
                            {suppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name} - {s.category}</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-mute mt-2 uppercase tracking-widest">WAJIB DIISI JIKA STOK DIKELOLA VENDOR AGAR TAGIHAN OTOMATIS MUNCUL.</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-[16px]">
                <div>
                    <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">STOK SAAT INI</label>
                    <input 
                        type="number" name="stock" required
                        value={formData.stock} onChange={handleChange} 
                        className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase"
                    />
                </div>
                <div>
                    <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">SATUAN</label>
                    <select 
                        name="unit" value={formData.unit} onChange={handleChange}
                        className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase"
                    >
                        {activeCategory === 'sparepart' ? (
                            <>
                                <option value="Pcs">PCS</option>
                                <option value="Set">SET</option>
                                <option value="Unit">UNIT</option>
                            </>
                        ) : (
                            <>
                                <option value="Liter">LITER</option>
                                <option value="Kaleng">KALENG</option>
                                <option value="Kg">KG</option>
                                <option value="Pcs">PCS (LEMBAR/ROLL)</option>
                            </>
                        )}
                    </select>
                </div>
                <div>
                    <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">MIN. ALERT</label>
                    <input 
                        type="number" name="minStock" 
                        value={formData.minStock} onChange={handleChange} 
                        className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase disabled:opacity-50"
                        disabled={!formData.isStockManaged}
                    />
                </div>
                <div className="md:col-span-3">
                     <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">LOKASI PENYIMPANAN</label>
                     <input 
                        type="text" name="location" 
                        value={formData.location || ''} onChange={handleChange} 
                        className="w-full p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase"
                        placeholder="CONTOH: RAK A-12, GUDANG CAT..."
                    />
                </div>
            </div>
        </div>

        <div className="p-6 bg-canvas border border-hairline">
            <h4 className="text-[14px] font-medium text-ink uppercase tracking-widest mb-4 border-b border-hairline pb-4">HARGA & MODAL</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
                <div>
                    <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">HARGA BELI (MODAL)</label>
                    <div className="relative">
                        <span className="absolute left-4 top-4 text-[14px] font-medium text-mute uppercase">RP</span>
                        <input 
                            type="text" name="buyPrice" 
                            value={formData.buyPrice ? new Intl.NumberFormat('id-ID').format(formData.buyPrice) : ''} 
                            onChange={e => handlePriceChange(e, 'buyPrice')} 
                            className="w-full pl-12 p-4 border border-hairline bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase"
                            placeholder="0"
                        />
                    </div>
                    {activeCategory === 'material' && (
                         <p className="text-[10px] text-mute mt-2 uppercase tracking-widest">MASUKKAN HARGA PER {formData.unit}.</p>
                    )}
                </div>

                {activeCategory === 'sparepart' ? (
                    <div>
                        <label className="block text-[12px] font-medium text-mute uppercase tracking-widest mb-2">HARGA JUAL (EST)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-4 text-[14px] font-medium text-mute uppercase">RP</span>
                            <input 
                                type="text" name="sellPrice" 
                                value={formData.sellPrice ? new Intl.NumberFormat('id-ID').format(formData.sellPrice) : ''} 
                                onChange={e => handlePriceChange(e, 'sellPrice')} 
                                className="w-full pl-12 p-4 border border-ink bg-canvas focus:outline-none focus:border-ink text-[14px] font-medium text-ink uppercase"
                                placeholder="0"
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center text-[10px] text-ink uppercase tracking-widest bg-soft-cloud p-4 border border-hairline leading-relaxed">
                        BAHAN BAKU BIASANYA TIDAK DIJUAL LANGSUNG, NAMUN DIBEBANKAN SEBAGAI BIAYA PRODUKSI.
                    </div>
                )}
            </div>
        </div>

        <div className="flex justify-end gap-4 pt-6 border-t border-hairline">
            <button 
                type="button" 
                onClick={onCancel} 
                className="px-6 py-4 border border-ink text-ink text-[12px] font-medium uppercase tracking-widest hover:bg-soft-cloud transition-colors"
            >
                BATAL
            </button>
            <button 
                type="submit" disabled={isSubmitting}
                className="bg-ink text-canvas px-6 py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors disabled:opacity-50"
            >
                {isSubmitting ? 'PROCESSING...' : 'SIMPAN ITEM'}
            </button>
        </div>
    </form>
  );
};

export default InventoryForm;
