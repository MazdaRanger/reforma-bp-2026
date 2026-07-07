
import React, { useState, useMemo } from 'react';
import { Asset, UserPermissions } from '../../types';
import { collection, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db, ASSETS_COLLECTION, CASHIER_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo, generateTransactionId } from '../../utils/helpers';
import { generateReceiptPDF } from '../../utils/pdfGenerator';
import { Briefcase, Plus, Save, Trash2, TrendingDown, DollarSign, ShoppingBag, ShoppingCart, AlertCircle, Building, Laptop, Wrench, Megaphone } from 'lucide-react';

interface AssetManagementViewProps {
  assets: Asset[];
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
}

const AssetManagementView: React.FC<AssetManagementViewProps> = ({ assets, userPermissions, showNotification }) => {
  const [activeTab, setActiveTab] = useState<'assets' | 'expenses'>('assets');
  const [isProcessing, setIsProcessing] = useState(false);

  // Asset Form State
  const [assetForm, setAssetForm] = useState({
      name: '',
      category: 'Peralatan Bengkel',
      purchasePrice: 0,
      purchaseDate: new Date().toISOString().split('T')[0],
      usefulLifeYears: 4,
      createCashierTrx: true
  });

  // Expense Form State
  const [expenseForm, setExpenseForm] = useState({
      category: 'Operasional', // Operasional, Lainnya
      desc: '',
      amount: 0,
      notes: ''
  });

  // Helper for formatted number inputs
  const handleNumberChange = (value: string, setter: (val: number) => void) => {
      const rawValue = value.replace(/\D/g, '');
      setter(rawValue ? parseInt(rawValue, 10) : 0);
  };

  // --- ASSET LOGIC ---
  const handleAddAsset = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!assetForm.name || assetForm.purchasePrice <= 0) {
          showNotification("Nama dan Harga Perolehan wajib diisi.", "error");
          return;
      }

      setIsProcessing(true);
      try {
          const monthlyDep = Math.round(assetForm.purchasePrice / (assetForm.usefulLifeYears * 12));
          
          // 1. Create Asset Record
          await addDoc(collection(db, ASSETS_COLLECTION), {
              name: assetForm.name,
              category: assetForm.category,
              purchasePrice: Number(assetForm.purchasePrice),
              purchaseDate: new Date(assetForm.purchaseDate),
              usefulLifeYears: Number(assetForm.usefulLifeYears),
              residualValue: 0,
              monthlyDepreciation: monthlyDep,
              status: 'Active',
              createdAt: serverTimestamp()
          });

          // 2. Create Cashier Transaction (Capital Expenditure)
          if (assetForm.createCashierTrx) {
              const transactionNumber = generateTransactionId('OUT');
              const payload = {
                  date: serverTimestamp(),
                  type: 'OUT',
                  category: 'Pembelian Aset', // Special Category
                  amount: Number(assetForm.purchasePrice),
                  paymentMethod: 'Cash', // Default to Cash for simplicity, usually needs Bank
                  description: `Beli Aset: ${assetForm.name}`,
                  createdBy: userPermissions.role,
                  transactionNumber: transactionNumber,
                  createdAt: serverTimestamp()
              };
              await addDoc(collection(db, CASHIER_COLLECTION), payload);
              
              // Auto Print Proof
              generateReceiptPDF({...payload, date: new Date(), id: 'TEMP'} as any, {} as any); // Passing empty settings might need fix or fetch settings
          }

          showNotification("Aset berhasil dicatat.", "success");
          setAssetForm({ name: '', category: 'Peralatan Bengkel', purchasePrice: 0, purchaseDate: new Date().toISOString().split('T')[0], usefulLifeYears: 4, createCashierTrx: true });
      } catch (e: any) {
          showNotification("Gagal: " + e.message, "error");
      } finally {
          setIsProcessing(false);
      }
  };

  const handleDeleteAsset = async (id: string) => {
      if (!userPermissions.role.includes('Manager')) return;
      if (!window.confirm("Hapus data aset ini?")) return;
      try {
          await deleteDoc(doc(db, ASSETS_COLLECTION, id));
          showNotification("Aset dihapus.", "success");
      } catch(e) { showNotification("Gagal hapus.", "error"); }
  };

  // --- EXPENSE LOGIC ---
  const handleAddExpense = async (e: React.FormEvent) => {
      e.preventDefault();
      if (expenseForm.amount <= 0 || !expenseForm.desc) return;

      setIsProcessing(true);
      try {
          const transactionNumber = generateTransactionId('OUT');
          const payload = {
              date: serverTimestamp(),
              type: 'OUT',
              category: 'Operasional',
              amount: Number(expenseForm.amount),
              paymentMethod: 'Cash',
              description: `${expenseForm.desc} - ${expenseForm.notes}`,
              createdBy: userPermissions.role,
              createdAt: serverTimestamp(),
              customerName: 'Internal / GA',
              transactionNumber: transactionNumber
          };

          await addDoc(collection(db, CASHIER_COLLECTION), payload);
          
          // Auto Print Proof
          // Note: Ideally fetch settings from context or props if needed for header, passing partial for now
          generateReceiptPDF({...payload, date: new Date(), id: 'TEMP'} as any, { workshopName: "REFORMA", workshopAddress: "" } as any);

          showNotification(`Pengeluaran operasional dicatat (${transactionNumber}) & Bukti diunduh.`, "success");
          setExpenseForm({ category: 'Operasional', desc: '', amount: 0, notes: '' });
      } catch (e: any) {
          showNotification("Gagal: " + e.message, "error");
      } finally {
          setIsProcessing(false);
      }
  };

  // --- CALCULATIONS ---
  const totalAssetValue = useMemo(() => assets.reduce((acc, a) => acc + a.purchasePrice, 0), [assets]);
  const totalMonthlyDepreciation = useMemo(() => assets.reduce((acc, a) => acc + (a.status === 'Active' ? a.monthlyDepreciation : 0), 0), [assets]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-cyan-600 rounded-xl shadow-sm text-white">
                    <Briefcase size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">General Affairs (GA) & Aset</h1>
                    <p className="text-sm text-gray-500 font-medium">Manajemen Inventaris Tetap & Belanja Operasional</p>
                </div>
            </div>
        </div>

        <div className="flex border-b border-gray-200 bg-white rounded-t-xl overflow-hidden">
            <button 
                onClick={() => setActiveTab('assets')}
                className={`flex-1 py-4 font-bold text-sm flex items-center justify-center gap-2 ${activeTab === 'assets' ? 'bg-cyan-50 text-cyan-700 border-b-2 border-cyan-600' : 'text-gray-500 hover:bg-gray-50'}`}
            >
                <Building size={18}/> Daftar Aset Tetap
            </button>
            <button 
                onClick={() => setActiveTab('expenses')}
                className={`flex-1 py-4 font-bold text-sm flex items-center justify-center gap-2 ${activeTab === 'expenses' ? 'bg-orange-50 text-orange-700 border-b-2 border-orange-600' : 'text-gray-500 hover:bg-gray-50'}`}
            >
                <ShoppingBag size={18}/> Belanja Operasional
            </button>
        </div>

        {activeTab === 'assets' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* LIST */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <p className="text-xs font-bold text-gray-500 uppercase">Total Nilai Perolehan</p>
                            <p className="text-2xl font-black text-gray-900">{formatCurrency(totalAssetValue)}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <p className="text-xs font-bold text-gray-500 uppercase">Beban Penyusutan / Bulan</p>
                            <p className="text-2xl font-black text-red-600">{formatCurrency(totalMonthlyDepreciation)}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                            <h3 className="font-bold text-gray-800">Inventaris Bengkel</h3>
                            <span className="text-xs bg-white px-2 py-1 rounded border font-bold">{assets.length} Item</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-100 text-gray-500 font-bold uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-3">Nama Aset</th>
                                        <th className="px-6 py-3">Kategori</th>
                                        <th className="px-6 py-3">Tgl Beli</th>
                                        <th className="px-6 py-3 text-right">Harga Beli</th>
                                        <th className="px-6 py-3 text-right">Penyusutan (Bln)</th>
                                        <th className="px-6 py-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {assets.map(asset => (
                                        <tr key={asset.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 font-bold text-gray-900">{asset.name}</td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 bg-gray-100 rounded text-xs border">{asset.category}</span>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-500">
                                                {formatDateIndo(asset.purchaseDate)}
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium">{formatCurrency(asset.purchasePrice)}</td>
                                            <td className="px-6 py-4 text-right font-bold text-red-500">{formatCurrency(asset.monthlyDepreciation)}</td>
                                            <td className="px-6 py-4 text-center">
                                                <button onClick={() => handleDeleteAsset(asset.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={16}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* FORM */}
                <div className="bg-white p-6 rounded-xl border border-cyan-200 shadow-lg h-fit">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Plus size={18} className="text-cyan-600"/> Tambah Aset Baru
                    </h3>
                    <form onSubmit={handleAddAsset} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Aset</label>
                            <input type="text" required value={assetForm.name} onChange={e => setAssetForm({...assetForm, name: e.target.value})} className="w-full p-2 border rounded" placeholder="Contoh: Laptop Admin..."/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                            <select value={assetForm.category} onChange={e => setAssetForm({...assetForm, category: e.target.value})} className="w-full p-2 border rounded bg-white">
                                <option value="Peralatan Bengkel">Peralatan Bengkel (Tools/Lift)</option>
                                <option value="Elektronik">Elektronik (Laptop/PC)</option>
                                <option value="Furniture">Furniture (Meja/Kursi)</option>
                                <option value="Kendaraan">Kendaraan Operasional</option>
                                <option value="Bangunan">Bangunan / Renovasi</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Harga Beli</label>
                                <input 
                                    type="text" required 
                                    value={assetForm.purchasePrice ? new Intl.NumberFormat('id-ID').format(assetForm.purchasePrice) : ''} 
                                    onChange={e => handleNumberChange(e.target.value, (val) => setAssetForm({...assetForm, purchasePrice: val}))} 
                                    className="w-full p-2 border rounded font-bold"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Masa Manfaat</label>
                                <div className="relative">
                                    <input type="number" required value={assetForm.usefulLifeYears} onChange={e => setAssetForm({...assetForm, usefulLifeYears: Number(e.target.value)})} className="w-full p-2 border rounded"/>
                                    <span className="absolute right-3 top-2 text-xs text-gray-500 font-bold">Tahun</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Pembelian</label>
                            <input type="date" required value={assetForm.purchaseDate} onChange={e => setAssetForm({...assetForm, purchaseDate: e.target.value})} className="w-full p-2 border rounded"/>
                        </div>
                        
                        <div className="p-3 bg-cyan-50 rounded border border-cyan-100 flex items-start gap-2">
                            <input type="checkbox" checked={assetForm.createCashierTrx} onChange={e => setAssetForm({...assetForm, createCashierTrx: e.target.checked})} className="mt-1"/>
                            <div className="text-xs text-cyan-900">
                                <strong>Catat Pengeluaran Kas?</strong><br/>
                                Jika dicentang, sistem akan otomatis membuat transaksi "Uang Keluar" di Kasir untuk pembelian ini.
                            </div>
                        </div>

                        <button type="submit" disabled={isProcessing} className="w-full bg-cyan-600 text-white py-3 rounded-lg font-bold hover:bg-cyan-700 transition-colors shadow-md">
                            {isProcessing ? 'Menyimpan...' : 'Simpan Aset'}
                        </button>
                    </form>
                </div>
            </div>
        )}

        {activeTab === 'expenses' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <ShoppingBag size={20} className="text-orange-600"/> Catat Pengeluaran Umum
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <button 
                            onClick={() => setExpenseForm({...expenseForm, desc: 'Belanja Bulanan (Gas, Las, Sarung Tangan)', category: 'Operasional'})}
                            className="p-4 bg-orange-50 border border-orange-100 rounded-xl hover:bg-orange-100 transition-colors text-left group"
                        >
                            <ShoppingCart className="text-orange-500 mb-2 group-hover:scale-110 transition-transform" size={24}/>
                            <span className="font-bold text-gray-800 block">Belanja Bulanan</span>
                            <span className="text-xs text-gray-500">Gas, Las, Sarung Tangan</span>
                        </button>
                        <button 
                            onClick={() => setExpenseForm({...expenseForm, desc: 'Biaya Promosi & Event', category: 'Operasional'})}
                            className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-colors text-left group"
                        >
                            <Megaphone className="text-indigo-500 mb-2 group-hover:scale-110 transition-transform" size={24}/>
                            <span className="font-bold text-gray-800 block">Promotion</span>
                            <span className="text-xs text-gray-500">Event, Entertaint, Kaos</span>
                        </button>
                        <button 
                            onClick={() => setExpenseForm({...expenseForm, desc: 'Bensin Operasional', category: 'Operasional'})}
                            className="p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-left group"
                        >
                            <TrendingDown className="text-gray-500 mb-2 group-hover:scale-110 transition-transform" size={24}/>
                            <span className="font-bold text-gray-800 block">Bensin / Tol</span>
                            <span className="text-xs text-gray-500">Reimburse perjalanan</span>
                        </button>
                        <button 
                            onClick={() => setExpenseForm({...expenseForm, desc: 'ATK & Keperluan Kantor', category: 'Operasional'})}
                            className="p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-left group"
                        >
                            <Briefcase className="text-gray-500 mb-2 group-hover:scale-110 transition-transform" size={24}/>
                            <span className="font-bold text-gray-800 block">ATK / Kantor</span>
                            <span className="text-xs text-gray-500">Kertas, Tinta, dll</span>
                        </button>
                    </div>

                    <form onSubmit={handleAddExpense} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Keperluan / Deskripsi</label>
                            <input 
                                type="text" required 
                                value={expenseForm.desc} 
                                onChange={e => setExpenseForm({...expenseForm, desc: e.target.value})}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                placeholder="Pilih dari atas atau ketik manual..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nominal (Rp)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-gray-500 font-bold">Rp</span>
                                <input 
                                    type="text" required 
                                    value={expenseForm.amount ? new Intl.NumberFormat('id-ID').format(expenseForm.amount) : ''} 
                                    onChange={e => handleNumberChange(e.target.value, (val) => setExpenseForm({...expenseForm, amount: val}))}
                                    className="w-full pl-10 p-3 border border-gray-300 rounded-lg text-lg font-black text-gray-800"
                                    placeholder="0"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Tambahan</label>
                            <input 
                                type="text" 
                                value={expenseForm.notes} 
                                onChange={e => setExpenseForm({...expenseForm, notes: e.target.value})}
                                className="w-full p-3 border border-gray-300 rounded-lg"
                                placeholder="Detail..."
                            />
                        </div>
                        <button type="submit" disabled={isProcessing} className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-orange-700 transition-all flex items-center justify-center gap-2">
                            <Save size={20}/> Catat Pengeluaran
                        </button>
                    </form>
                </div>

                <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 flex flex-col justify-center text-center">
                    <AlertCircle size={48} className="text-gray-400 mx-auto mb-4"/>
                    <h3 className="font-bold text-gray-800 text-lg">Info Akuntansi</h3>
                    <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                        Pengeluaran yang dicatat di sini akan otomatis masuk ke <strong>Kasir (Uang Keluar)</strong> dengan kategori "Operasional".
                        <br/><br/>
                        Nilai ini akan langsung <strong>mengurangi Laba Kotor</strong> pada laporan Laba Rugi periode berjalan.
                    </p>
                </div>
            </div>
        )}
    </div>
  );
};

export default AssetManagementView;
