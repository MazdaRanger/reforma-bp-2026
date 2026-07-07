
import React, { useState, useMemo, useEffect } from 'react';
import { collection, doc, deleteDoc, addDoc, updateDoc, serverTimestamp, query, limit, getDocs, orderBy, startAt, endAt } from 'firebase/firestore';
import { db, SPAREPART_COLLECTION } from '../../services/firebase';
import { InventoryItem, UserPermissions, Supplier } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import InventoryForm from './InventoryForm';
import Modal from '../ui/Modal';
import { Search, Plus, Wrench, PaintBucket, AlertTriangle, Edit, Trash2, Tag, Box, AlertCircle, Loader2 } from 'lucide-react';

interface InventoryViewProps {
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
  suppliers?: Supplier[]; 
  // removed realTimeItems prop
}

const InventoryView: React.FC<InventoryViewProps> = ({ userPermissions, showNotification, suppliers = [] }) => {
  const [activeTab, setActiveTab] = useState<'sparepart' | 'material'>('sparepart');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Local Data State (Fetched On Demand)
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Initial Fetch (Limit 20)
  useEffect(() => {
      fetchItems();
  }, [activeTab]);

  const fetchItems = async (searchTerm = '') => {
      setIsLoading(true);
      try {
          // Optimization: If no search, get recent 20. If search, try to filter.
          // Note: Firestore text search is limited (prefix). 
          
          let q;
          if (!searchTerm) {
              q = query(collection(db, SPAREPART_COLLECTION), orderBy('updatedAt', 'desc'), limit(50));
          } else {
              // Basic optimization: Fetch all matches? No, that's expensive.
              // We'll rely on client-side filtering of a larger batch OR prefix query
              // For zero-cost optimization, we fetch recent 100 and filter client side OR
              // implement a specific search query if the DB structure supports it.
              // Here we stick to fetching recent 100 to show *activity* and assume search is done via DB index if possible
              // but for this MVP we just fetch recent 100 which is still cheaper than all 5000.
              
              // Better: Search by Code Prefix (Assuming Code is indexed)
              // const term = searchTerm.toUpperCase();
              // q = query(collection(db, SPAREPART_COLLECTION), orderBy('code'), startAt(term), endAt(term + '\uf8ff'), limit(20));
              
              // Fallback for this request: Fetch latest 100 and filter locally for simplicity without Algolia
              // This is a trade-off. "True" search requires a paid service or complex index.
              // To keep it strictly FREE: We load recent 50. If user searches, we prompt "Searching..." and load matches manually?
              // Let's implement a simple "Load Recent" approach.
              q = query(collection(db, SPAREPART_COLLECTION), orderBy('updatedAt', 'desc'), limit(100));
          }

          const snap = await getDocs(q);
          const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
          
          // Client side filter if search term exists (on the 100 fetched)
          // Ideally, we'd add 'keywords' array to firestore for simple search
          let final = fetched;
          if (searchTerm) {
              const lower = searchTerm.toLowerCase();
              final = fetched.filter(i => 
                  i.name.toLowerCase().includes(lower) || 
                  (i.code && i.code.toLowerCase().includes(lower))
              );
          }
          
          // Filter by category locally or adding where clause (requires composite index)
          // Simple local filter for now
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
              // Update local state optimistic
              setItems(prev => prev.map(i => i.id === formData.id ? { ...i, ...formData } as InventoryItem : i));
          } else {
              const ref = await addDoc(collection(db, SPAREPART_COLLECTION), { ...payload, createdAt: serverTimestamp() });
              showNotification("Item berhasil ditambahkan", "success");
              // Add to local state
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Inventory & Stok</h1>
            <p className="text-gray-500 mt-1">Kelola suku cadang dan bahan baku. (Menampilkan 50 item terbaru)</p>
          </div>
          <button 
            onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-lg flex items-center gap-2 font-semibold"
          >
            <Plus size={18}/> Tambah Item
          </button>
      </div>

      {/* SUB-MENU TABS */}
      <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-100 inline-flex">
          <button 
            onClick={() => setActiveTab('sparepart')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'sparepart' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
             <Wrench size={16}/> Sparepart
          </button>
          <button 
            onClick={() => setActiveTab('material')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'material' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
             <PaintBucket size={16}/> Bahan Baku
          </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* SEARCH BAR */}
          <form onSubmit={handleManualSearch} className="p-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
             <Search className="text-gray-400" size={20}/>
             <input 
                type="text" 
                placeholder={`Cari ${activeTab === 'sparepart' ? 'Part' : 'Bahan'} (Tekan Enter)...`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent border-none focus:ring-0 text-gray-700 w-full placeholder-gray-400"
             />
             <button type="submit" className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded font-bold hover:bg-indigo-200">CARI</button>
          </form>

          {isLoading ? (
              <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-indigo-500" size={32}/></div>
          ) : items.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center text-gray-400">
                  <Box size={48} className="mb-2 opacity-20"/>
                  <p>Tidak ada data {activeTab === 'sparepart' ? 'sparepart' : 'bahan baku'} ditemukan (Terbaru / Pencarian).</p>
              </div>
          ) : (
              <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                      <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                          <tr>
                              <th className="px-6 py-3">Item Info</th>
                              <th className="px-6 py-3">Kategori/Merk</th>
                              <th className="px-6 py-3 text-center">Stok</th>
                              <th className="px-6 py-3 text-right">Harga Beli</th>
                              {activeTab === 'sparepart' && <th className="px-6 py-3 text-right">Harga Jual</th>}
                              <th className="px-6 py-3 text-center">Aksi</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-sm">
                          {items.map(item => {
                              const isLowStock = item.stock <= (item.minStock || 0);
                              return (
                                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-6 py-4">
                                          <div className="font-bold text-gray-900">{item.name}</div>
                                          <div className="text-xs text-gray-500 font-mono flex items-center gap-1">
                                              {activeTab === 'sparepart' ? <Tag size={12}/> : <PaintBucket size={12}/>}
                                              {item.code || '-'}
                                          </div>
                                          {item.supplierName && (
                                              <div className="text-[10px] text-indigo-600 mt-1 font-medium bg-indigo-50 px-1.5 rounded inline-block border border-indigo-100">
                                                  Vendor: {item.supplierName}
                                              </div>
                                          )}
                                      </td>
                                      <td className="px-6 py-4">
                                          <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-medium border border-gray-200">
                                              {item.brand || 'No Brand'}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <div className="flex flex-col items-center">
                                            <span className={`font-bold text-base ${isLowStock ? 'text-red-600' : 'text-gray-800'}`}>
                                                {item.stock} <span className="text-xs font-normal text-gray-500">{item.unit}</span>
                                            </span>
                                            {isLowStock && (
                                                <span className="flex items-center gap-1 text-[10px] text-red-500 bg-red-50 px-1.5 rounded mt-1">
                                                    <AlertTriangle size={10}/> Stok Rendah
                                                </span>
                                            )}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-right text-gray-600">
                                          {formatCurrency(item.buyPrice)}
                                      </td>
                                      {activeTab === 'sparepart' && (
                                          <td className="px-6 py-4 text-right font-bold text-emerald-600">
                                              {formatCurrency(item.sellPrice)}
                                          </td>
                                      )}
                                      <td className="px-6 py-4 text-center">
                                          <div className="flex justify-center gap-2">
                                              <button onClick={() => { setEditingItem(item); setIsModalOpen(true); }} className="text-indigo-500 hover:text-indigo-700 p-1">
                                                  <Edit size={16}/>
                                              </button>
                                              <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600 p-1">
                                                  <Trash2 size={16}/>
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
        title={editingItem ? `Edit ${activeTab === 'sparepart' ? 'Sparepart' : 'Bahan Baku'}` : `Tambah ${activeTab === 'sparepart' ? 'Sparepart' : 'Bahan Baku'} Baru`}
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
