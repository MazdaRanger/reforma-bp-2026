import React, { useState, useEffect } from 'react';
import { FiSearch, FiPlus, FiEdit2, FiTrash2, FiX, FiCheck, FiFilter, FiDownload, FiUpload } from 'react-icons/fi';
import { MorphingSquare } from '../ui/morphing-square';
import { collection, doc, deleteDoc, addDoc, updateDoc, serverTimestamp, query, limit, getDocs, orderBy } from 'firebase/firestore';
import { db, SPAREPART_COLLECTION } from '../../services/firebase';
import { InventoryItem, UserPermissions, Supplier } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import InventoryForm from './InventoryForm';
import Modal from '../ui/Modal';

interface InventoryViewProps {
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
  suppliers?: Supplier[]; 
}

const InventoryView: React.FC<InventoryViewProps> = ({ userPermissions, showNotification, suppliers = [] }) => {
  const [activeTab, setActiveTab] = useState<'sparepart' | 'material'>('sparepart');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  useEffect(() => {
      fetchItems();
  }, [activeTab]);

  const fetchItems = async (searchTerm = '') => {
      setIsLoading(true);
      try {
          const q = query(collection(db, SPAREPART_COLLECTION), orderBy('updatedAt', 'desc'), limit(100));
          const snap = await getDocs(q);
          const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
          
          let final = fetched;
          if (searchTerm) {
              const lower = searchTerm.toLowerCase();
              final = fetched.filter(i => 
                  i.name.toLowerCase().includes(lower) || 
                  (i.code && i.code.toLowerCase().includes(lower))
              );
          }
          
          setItems(final.filter(i => i.category === activeTab));
      } catch (e) {
          console.error(e);
          showNotification("Gagal memuat data inventory.", "error");
      } finally {
          setIsLoading(false);
      }
  };

  const handleManualSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      fetchItems(searchQuery);
  };

  const handleSave = async (formData: Partial<InventoryItem>) => {
      try {
          const payload = { 
              ...formData, 
              category: formData.category || activeTab,
              updatedAt: serverTimestamp() 
          };

          if (formData.id) {
              await updateDoc(doc(db, SPAREPART_COLLECTION, formData.id), payload);
              showNotification("Item berhasil diperbarui", "success");
              setItems(prev => prev.map(i => i.id === formData.id ? { ...i, ...formData } as InventoryItem : i));
          } else {
              const ref = await addDoc(collection(db, SPAREPART_COLLECTION), { ...payload, createdAt: serverTimestamp() });
              showNotification("Item berhasil ditambahkan", "success");
              setItems(prev => [{ id: ref.id, ...payload } as InventoryItem, ...prev]);
          }
          setIsModalOpen(false);
      } catch (e: any) {
          console.error(e);
          showNotification("Error: " + e.message, "error");
      }
  };

  const handleDelete = async (id: string) => {
      if (!window.confirm("Hapus item ini dari database?")) return;
      try {
          await deleteDoc(doc(db, SPAREPART_COLLECTION, id));
          showNotification("Item dihapus", "success");
          setItems(prev => prev.filter(i => i.id !== id));
      } catch (e) {
          showNotification("Gagal menghapus", "error");
      }
  };

  return (
    <div className="animate-fade-in pb-[48px]">
        {/* HEADER */}
        <div className="border-b border-hairline pb-[24px] mb-[48px] flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
            <div>
                <h1 className="text-[96px] font-display uppercase leading-[0.9] text-ink">INVENTORY</h1>
                <p className="text-[16px] text-mute font-normal mt-[18px]">Kelola Suku Cadang & Bahan Baku</p>
            </div>
            <div className="flex items-center gap-4 w-full md:w-auto">
                <button 
                    onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
                    className="bg-ink text-canvas px-6 py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors whitespace-nowrap"
                >
                    TAMBAH ITEM
                </button>
            </div>
        </div>

        {/* TABS */}
        <div className="flex overflow-x-auto gap-6 border-b border-hairline mb-[48px] pb-4 scrollbar-hide">
            <button 
                onClick={() => setActiveTab('sparepart')}
                className={`text-[14px] font-medium uppercase tracking-widest transition-colors whitespace-nowrap ${activeTab === 'sparepart' ? 'text-ink border-b-2 border-ink' : 'text-mute hover:text-ink'}`}
            >
                SPAREPART
            </button>
            <button 
                onClick={() => setActiveTab('material')}
                className={`text-[14px] font-medium uppercase tracking-widest transition-colors whitespace-nowrap ${activeTab === 'material' ? 'text-ink border-b-2 border-ink' : 'text-mute hover:text-ink'}`}
            >
                BAHAN BAKU
            </button>
        </div>

        <div className="bg-canvas border border-hairline flex flex-col h-full rounded-2xl overflow-hidden">
            {/* SEARCH BAR */}
            <form onSubmit={handleManualSearch} className="p-4 border-b border-hairline bg-soft-cloud flex items-center gap-4">
                <input 
                    type="text" 
                    placeholder={`SEARCH ${activeTab === 'sparepart' ? 'PART' : 'BAHAN'}...`}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="flex-1 bg-canvas border border-hairline p-4 focus:outline-none focus:border-ink font-medium uppercase text-[14px] text-ink rounded-2xl overflow-hidden"
                />
                <button type="submit" className="bg-ink text-canvas px-6 py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors">CARI</button>
            </form>

            {isLoading ? (
                <div className="p-12 flex justify-center">
                   <MorphingSquare message="MEMUAT DATA INVENTORY..." />
                </div>
            ) : items.length === 0 ? (
                <div className="p-12 text-center text-mute text-[12px] font-medium uppercase tracking-widest">TIDAK ADA DATA DITEMUKAN.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-canvas text-mute font-medium uppercase tracking-widest text-[10px] border-b border-hairline">
                            <tr>
                                <th className="px-6 py-4 font-normal">ITEM INFO</th>
                                <th className="px-6 py-4 font-normal">KATEGORI / MERK</th>
                                <th className="px-6 py-4 text-center font-normal">STOK</th>
                                <th className="px-6 py-4 text-right font-normal">HARGA BELI</th>
                                {activeTab === 'sparepart' && <th className="px-6 py-4 text-right font-normal">HARGA JUAL</th>}
                                <th className="px-6 py-4 text-center font-normal">AKSI</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                            {items.map(item => {
                                const isLowStock = item.stock <= (item.minStock || 0);
                                return (
                                    <tr key={item.id} className="hover:bg-soft-cloud transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-[14px] text-ink uppercase">{item.name}</div>
                                            <div className="text-[10px] text-mute uppercase tracking-widest mt-1">
                                                KODE: {item.code || '-'}
                                            </div>
                                            {item.supplierName && (
                                                <div className="text-[10px] text-ink mt-2 font-medium border border-ink px-2 py-1 inline-block uppercase tracking-widest bg-canvas">
                                                    VENDOR: {item.supplierName}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="bg-canvas text-ink px-2 py-1 border border-hairline text-[10px] font-medium uppercase tracking-widest rounded-2xl overflow-hidden">
                                                {item.brand || 'NO BRAND'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className={`font-display text-[20px] ${isLowStock ? 'text-ink bg-soft-cloud border border-ink px-2 py-1' : 'text-ink'}`}>
                                                    {item.stock} <span className="text-[10px] font-medium text-mute uppercase tracking-widest">{item.unit}</span>
                                                </span>
                                                {isLowStock && (
                                                    <span className="text-[10px] font-medium text-ink bg-canvas border border-ink px-2 py-1 mt-2 uppercase tracking-widest">
                                                        STOK RENDAH
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right text-[14px] font-medium text-mute">
                                            {formatCurrency(item.buyPrice)}
                                        </td>
                                        {activeTab === 'sparepart' && (
                                            <td className="px-6 py-4 text-right font-medium text-[14px] text-ink">
                                                {formatCurrency(item.sellPrice)}
                                            </td>
                                        )}
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button onClick={() => { setEditingItem(item); setIsModalOpen(true); }} className="border border-hairline hover:border-ink text-ink px-3 py-1 text-[10px] font-medium uppercase tracking-widest transition-colors">
                                                    EDIT
                                                </button>
                                                <button onClick={() => handleDelete(item.id)} className="border border-hairline hover:border-ink text-ink px-3 py-1 text-[10px] font-medium uppercase tracking-widest transition-colors">
                                                    HAPUS
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        {/* MODAL FORM */}
        <Modal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            title={editingItem ? `EDIT ${activeTab === 'sparepart' ? 'SPAREPART' : 'BAHAN BAKU'}` : `TAMBAH ${activeTab === 'sparepart' ? 'SPAREPART' : 'BAHAN BAKU'} BARU`}
        >
            <InventoryForm 
                initialData={editingItem || { category: activeTab }} 
                activeCategory={activeTab}
                suppliers={suppliers}
                onSave={handleSave} 
                onCancel={() => setIsModalOpen(false)} 
            />
        </Modal>
    </div>
  );
};

export default InventoryView;
