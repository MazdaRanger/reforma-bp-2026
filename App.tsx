
import React, { useState, useMemo, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { collection, addDoc, updateDoc, doc, serverTimestamp, getDocs, onSnapshot, query, orderBy, Timestamp, limit, where } from 'firebase/firestore'; 
import { db, UNITS_MASTER_COLLECTION, SERVICE_JOBS_COLLECTION, SETTINGS_COLLECTION, SPAREPART_COLLECTION, SUPPLIERS_COLLECTION, CASHIER_COLLECTION, PURCHASE_ORDERS_COLLECTION, ASSETS_COLLECTION, SERVICES_MASTER_COLLECTION, USERS_COLLECTION } from './services/firebase';
import { Job, EstimateData, Settings, InventoryItem, Supplier, Vehicle, CashierTransaction, PurchaseOrder, Asset, ServiceMasterItem, UserProfile } from './types';
import { initialSettingsState } from './utils/constants';
import { cleanObject } from './utils/helpers';

// Components
import OverviewDashboard from './components/dashboard/OverviewDashboard';
import BusinessIntelligenceView from './components/dashboard/BusinessIntelligenceView';
import KPIPerformanceView from './components/dashboard/KPIPerformanceView';
import AIAssistantView from './components/dashboard/AIAssistantView';
import MainDashboard from './components/dashboard/MainDashboard';
import LoginView from './components/auth/LoginView';
import Sidebar from './components/layout/Sidebar';
import Modal from './components/ui/Modal';
import JobForm from './components/forms/JobForm';
import EstimationForm from './components/forms/EstimationForm';
import EstimateEditor from './components/forms/EstimateEditor';
import SettingsView from './components/settings/SettingsView';
import InventoryView from './components/inventory/InventoryView'; 
import MaterialIssuanceView from './components/inventory/MaterialIssuanceView'; 
import PurchaseOrderView from './components/inventory/PurchaseOrderView'; 
import PartMonitoringView from './components/inventory/PartMonitoringView'; 
import AccountingView from './components/finance/AccountingView'; 
import CashierView from './components/finance/CashierView'; 
import DebtReceivableView from './components/finance/DebtReceivableView'; 
import InvoiceCreatorView from './components/finance/InvoiceCreatorView';
import TaxManagementView from './components/finance/TaxManagementView';
import SpklManagementView from './components/production/SpklManagementView';
import AssetManagementView from './components/general/AssetManagementView';
import CrcDashboardView from './components/crc/CrcDashboardView'; 
import JobControlView from './components/production/JobControlView';
import ClaimsControlView from './components/admin/ClaimsControlView'; 
import ReportCenterView from './components/reports/ReportCenterView';
import InternalChatWidget from './components/layout/InternalChatWidget';

const AppContent: React.FC = () => {
  const { user, userData, userPermissions, settings: defaultSettings, loading: authLoading, logout } = useAuth();
  
  const [currentView, setCurrentView] = useState('overview_main'); 
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<Settings>(defaultSettings);
  
  // Real-time Data States (GLOBAL INTEGRATION FIX)
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]); 
  const [transactions, setTransactions] = useState<CashierTransaction[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]); 
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  
  const [loadingData, setLoadingData] = useState(true);

  // Global Listeners
  useEffect(() => {
    if (!user) return;
    setLoadingData(true);
    const handleError = (context: string) => (error: any) => console.error(`Error in ${context} listener:`, error);

    const unsubVehicles = onSnapshot(query(collection(db, UNITS_MASTER_COLLECTION), orderBy('updatedAt', 'desc'), limit(500)), (snap) => {
        setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vehicle)));
    }, handleError("Vehicles"));

    const unsubJobs = onSnapshot(query(collection(db, SERVICE_JOBS_COLLECTION), orderBy('updatedAt', 'desc'), limit(200)), (snap) => {
        setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)).filter(j => !j.isDeleted));
    }, handleError("Jobs"));

    const unsubSuppliers = onSnapshot(query(collection(db, SUPPLIERS_COLLECTION)), (snap) => {
        setSuppliers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
    }, handleError("Suppliers"));

    const unsubTransactions = onSnapshot(query(collection(db, CASHIER_COLLECTION), orderBy('createdAt', 'desc'), limit(200)), (snap) => {
        setTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashierTransaction)));
    }, handleError("Transactions"));

    const unsubAssets = onSnapshot(query(collection(db, ASSETS_COLLECTION)), (snap) => {
        setAssets(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset)));
    }, handleError("Assets"));

    // FIXED: Inventory Listener (Increased limit to 5000 to cover full warehouse for accurate Job Control mapping)
    const unsubInventory = onSnapshot(query(collection(db, SPAREPART_COLLECTION), limit(5000)), (snap) => {
        setInventoryItems(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
    }, handleError("Inventory"));

    // FIXED: Purchase Orders Listener Added (Integration Restore)
    const unsubPOs = onSnapshot(query(collection(db, PURCHASE_ORDERS_COLLECTION), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
        setPurchaseOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseOrder)));
    }, handleError("PurchaseOrders"));

    const unsubSettings = onSnapshot(collection(db, SETTINGS_COLLECTION), (snap) => {
       if (!snap.empty) {
           setAppSettings({ ...initialSettingsState, ...snap.docs[0].data() } as Settings);
       }
    });

    setLoadingData(false);
    return () => { 
        unsubVehicles(); unsubJobs(); 
        unsubSuppliers(); unsubTransactions(); unsubAssets(); 
        unsubInventory(); unsubPOs(); unsubSettings();
    };
  }, [user]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterWorkStatus, setFilterWorkStatus] = useState('');
  const [showClosedJobs, setShowClosedJobs] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

  const [actualModalState, setActualModalState] = useState<{
      isOpen: boolean;
      type: 'add_job' | 'edit_data' | 'edit_job' | 'create_estimation' | null;
      data: any | null;
  }>({ isOpen: false, type: null, data: null });

  const showNotification = (message: string, type = 'success') => {
      setNotification({ show: true, message, type });
      setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
  };

  const openModal = (type: any, data: any = null) => setActualModalState({ isOpen: true, type, data });
  const closeModal = () => setActualModalState({ isOpen: false, type: null, data: null });

  // ... (Keep existing handlers: handleSaveVehicle, handleCreateTransaction, generateDocumentNumber, handleSaveEstimate, handleCloseJob, filteredJobs)
  
  const handleSaveVehicle = async (formData: Partial<Vehicle>) => {
      try {
          const vehiclePayload = {
              policeNumber: formData.policeNumber,
              customerName: formData.customerName,
              customerPhone: formData.customerPhone,
              customerAddress: formData.customerAddress,
              customerKelurahan: formData.customerKelurahan,
              customerKecamatan: formData.customerKecamatan,
              customerKota: formData.customerKota,
              customerProvinsi: formData.customerProvinsi,
              carBrand: formData.carBrand,
              carModel: formData.carModel,
              warnaMobil: formData.warnaMobil,
              nomorRangka: formData.nomorRangka,
              nomorMesin: formData.nomorMesin,
              tahunPembuatan: formData.tahunPembuatan,
              namaAsuransi: formData.namaAsuransi,
              nomorPolis: formData.nomorPolis,
              asuransiExpiryDate: formData.asuransiExpiryDate,
              isDeleted: false,
              updatedAt: serverTimestamp()
          };

          if (formData.id) {
              await updateDoc(doc(db, UNITS_MASTER_COLLECTION, formData.id), cleanObject(vehiclePayload));
              showNotification("Database Unit diperbarui.", "success");
          } else {
              const newPayload = {
                  ...vehiclePayload,
                  createdAt: serverTimestamp(),
              };
              await addDoc(collection(db, UNITS_MASTER_COLLECTION), cleanObject(newPayload));
              showNotification("Unit baru terdaftar di Master Database.", "success");
          }
          closeModal();
      } catch (e: any) { 
          console.error(e); 
          showNotification("Gagal menyimpan unit: " + e.message, "error"); 
      }
  };

  const handleCreateTransaction = (vehicle: Vehicle) => {
      const newJobDraft: Partial<Job> = {
          id: `TEMP_${Date.now()}`,
          unitId: vehicle.id,
          policeNumber: vehicle.policeNumber,
          customerName: vehicle.customerName,
          customerPhone: vehicle.customerPhone,
          customerAddress: vehicle.customerAddress,
          customerKota: vehicle.customerKota,
          carBrand: vehicle.carBrand,
          carModel: vehicle.carModel,
          warnaMobil: vehicle.warnaMobil,
          namaAsuransi: vehicle.namaAsuransi,
          nomorRangka: vehicle.nomorRangka,
          nomorMesin: vehicle.nomorMesin,
          tahunPembuatan: vehicle.tahunPembuatan,
          statusKendaraan: 'Tunggu Estimasi',
          statusPekerjaan: 'Belum Mulai Perbaikan',
          posisiKendaraan: 'Di Bengkel',
          tanggalMasuk: new Date().toISOString().split('T')[0],
          isClosed: false,
          hargaJasa: 0,
          hargaPart: 0,
          namaSA: vehicle.namaAsuransi === 'Umum / Pribadi' ? userData.displayName || '' : '', 
          costData: { hargaModalBahan: 0, hargaBeliPart: 0, jasaExternal: 0 },
          estimateData: { grandTotal: 0, jasaItems: [], partItems: [], discountJasa: 0, discountPart: 0, discountJasaAmount: 0, discountPartAmount: 0, ppnAmount: 0, subtotalJasa: 0, subtotalPart: 0 }
      };
      openModal('create_estimation', newJobDraft);
  };

  const generateDocumentNumber = (prefix: string, jobList: Job[]) => {
      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const codePrefix = `${prefix}${year}${month}`;
      
      const existingSequences = jobList
          .map(j => {
              const num = prefix === 'WO' ? j.woNumber : j.estimateData?.estimationNumber;
              if (num && num.startsWith(codePrefix)) {
                  return parseInt(num.substring(codePrefix.length));
              }
              return 0;
          })
          .filter(n => !isNaN(n));
      
      const maxSeq = existingSequences.length > 0 ? Math.max(...existingSequences) : 0;
      const nextSeq = maxSeq + 1;
      return `${codePrefix}${nextSeq.toString().padStart(4, '0')}`;
  };

  const handleSaveEstimate = async (jobId: string, estimateData: any, saveType: 'estimate' | 'wo'): Promise<string> => {
      try {
          const currentJob = jobs.find(j => j.id === jobId) || actualModalState.data;
          const isNewJob = jobId.startsWith('TEMP_');
          
          if (!isNewJob && currentJob?.hasInvoice) {
              showNotification("AKSES DITOLAK: WO ini sudah memiliki Faktur/Invoice.", "error");
              throw new Error("Invoice Exists. WO Locked.");
          }

          let estimationNumber = estimateData.estimationNumber;
          let woNumber = currentJob?.woNumber;
          
          const selectedPosisi = estimateData.posisiKendaraan || currentJob?.posisiKendaraan || 'Di Bengkel';
          
          if (saveType === 'estimate' && !estimationNumber) {
              estimationNumber = generateDocumentNumber('BE', jobs);
          }

          if (saveType === 'wo') {
              if (!estimationNumber) estimationNumber = generateDocumentNumber('BE', jobs);
              if (!woNumber) woNumber = generateDocumentNumber('WO', jobs);
          }

          const { posisiKendaraan, ...cleanEstimateData } = estimateData;

          const basePayload: any = {
              ...currentJob,
              estimateData: { ...cleanEstimateData, estimationNumber },
              hargaJasa: estimateData.subtotalJasa,
              hargaPart: estimateData.subtotalPart,
              namaSA: estimateData.estimatorName || userData.displayName,
              updatedAt: serverTimestamp()
          };
          delete basePayload.id; 

          if (saveType === 'estimate') {
              if (!woNumber) {
                  if (basePayload.namaAsuransi !== 'Umum / Pribadi') {
                      basePayload.statusKendaraan = 'Tunggu SPK Asuransi';
                  } else {
                      basePayload.statusKendaraan = 'Tunggu Estimasi';
                  }
                  basePayload.posisiKendaraan = selectedPosisi;
              }
          } else if (saveType === 'wo') {
              basePayload.woNumber = woNumber;
              basePayload.posisiKendaraan = selectedPosisi;
              if (selectedPosisi === 'Di Bengkel') {
                  basePayload.statusKendaraan = 'Work In Progress'; 
                  basePayload.statusPekerjaan = 'Bongkar';
              } else {
                  basePayload.statusKendaraan = 'Unit di Pemilik (Tunggu Part)';
                  basePayload.statusPekerjaan = 'Tunggu Part';
              }
          }

          if (selectedPosisi === 'Di Bengkel' && currentJob?.isBookingContacted && !currentJob?.bookingSuccess) {
              const today = new Date().toISOString().split('T')[0];
              const bookingDate = currentJob.tanggalBooking;
              
              if (bookingDate === today) {
                  basePayload.bookingSuccess = true;
                  basePayload.bookingEntryDate = today;
                  showNotification("✅ KPI CRC: Booking Tepat Waktu (Success)", "success");
              } else if (bookingDate) {
                  showNotification("⚠️ KPI CRC: Booking Meleset/Tidak Sesuai Tanggal", "info");
              }
          }

          if (isNewJob) {
              await addDoc(collection(db, SERVICE_JOBS_COLLECTION), cleanObject({ ...basePayload, createdAt: serverTimestamp(), isClosed: false }));
          } else {
              await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, jobId), cleanObject(basePayload));
          }
          
          showNotification(saveType === 'wo' ? `WO ${woNumber} Terbit!` : `Estimasi ${estimationNumber} Tersimpan`, "success");
          closeModal();
          
          if (saveType === 'wo') setCurrentView('entry_data'); 
          
          return saveType === 'wo' ? woNumber! : estimationNumber!;
      } catch (e) { 
          if (e.message !== "Invoice Exists. WO Locked.") showNotification("Gagal menyimpan transaksi.", "error"); 
          throw e; 
      }
  };

  const handleCloseJob = async (job: Job) => {
      const partItems = job.estimateData?.partItems || [];
      const hasUnissuedParts = partItems.some(p => !p.hasArrived);
      if (hasUnissuedParts) { alert("Gagal Tutup WO: Terdapat item Sparepart yang belum dikeluarkan (Issued)."); return; }
      
      const hasMaterials = job.usageLog?.some(l => l.category === 'material');
      if (!hasMaterials) { alert("Gagal Tutup WO: Belum ada record pemakaian Bahan."); return; }
      
      if (job.statusKendaraan !== 'Selesai (Tunggu Pengambilan)' && job.statusPekerjaan !== 'Selesai') {
          if (!window.confirm("Unit belum selesai di Papan Kontrol. Paksa tutup?")) return;
      }

      try {
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { 
              isClosed: true, 
              closedAt: serverTimestamp(), 
              statusKendaraan: 'Sudah Diambil Pemilik', 
              statusPekerjaan: 'Selesai',
              updatedAt: serverTimestamp()
          }); 
          showNotification("WO Berhasil Ditutup.", "success");
      } catch (e) { showNotification("Gagal menutup WO.", "error"); }
  };

  const filteredJobs = useMemo(() => {
      let fJobs = jobs;
      if (!showClosedJobs) fJobs = fJobs.filter(j => !j.isClosed);
      if (searchQuery) fJobs = fJobs.filter(j => j.policeNumber.toLowerCase().includes(searchQuery.toLowerCase()) || j.customerName.toLowerCase().includes(searchQuery.toLowerCase()));
      if (filterStatus) fJobs = fJobs.filter(j => j.statusKendaraan === filterStatus);
      if (filterWorkStatus) fJobs = fJobs.filter(j => j.statusPekerjaan === filterWorkStatus);
      return fJobs;
  }, [jobs, searchQuery, filterStatus, filterWorkStatus, showClosedJobs]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-indigo-600 font-medium">Memuat Sistem...</div>;
  if (!user) return <LoginView />;

  return (
    <div className="flex min-h-screen relative">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} currentView={currentView} setCurrentView={setCurrentView} userData={userData} userPermissions={userPermissions} onLogout={logout} settings={appSettings} />

      {/* Main Content Area - Transparent Background to show Body Gradient */}
      <main className="flex-grow p-4 md:p-8 overflow-y-auto h-screen w-full relative">
        {notification.show && ( <div className={`fixed top-4 right-4 p-4 rounded-xl shadow-xl text-white z-[100] animate-fade-in font-bold text-sm ${notification.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>{notification.message}</div> )}

        {currentView === 'overview_main' && (
            <OverviewDashboard allJobs={jobs} totalUnits={vehicles.length} settings={appSettings} onNavigate={setCurrentView} />
        )}
        {currentView === 'overview_business' && (
            <BusinessIntelligenceView jobs={jobs} settings={appSettings} />
        )}
        {currentView === 'overview_kpi' && (
            <KPIPerformanceView jobs={jobs} transactions={transactions} settings={appSettings} />
        )}
        {currentView === 'overview_ai' && (
            <AIAssistantView jobs={jobs} transactions={transactions} settings={appSettings} inventoryItems={inventoryItems} />
        )}

        {currentView === 'input_data' && (
             <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
                 <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Input Data Unit Baru</h1>
                 <div className="bg-white/80 backdrop-blur-lg p-6 md:p-8 rounded-2xl shadow-lg border border-white/50">
                    <JobForm settings={appSettings} onSave={handleSaveVehicle} onCancel={() => setCurrentView('entry_data')} />
                 </div>
             </div>
        )}

        {currentView === 'estimation_create' && (
            <div className="max-w-4xl mx-auto">
                <EstimationForm allVehicles={vehicles} allJobs={jobs} onNavigate={setCurrentView} openModal={openModal} onCreateTransaction={handleCreateTransaction} />
            </div>
        )}

        {currentView === 'claims_control' && (
            <ClaimsControlView jobs={jobs} inventoryItems={inventoryItems} vehicles={vehicles} settings={appSettings} showNotification={showNotification} openModal={openModal} onNavigate={setCurrentView} />
        )}

        {currentView === 'entry_data' && (
            <div className="space-y-4">
                <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Daftar Pekerjaan</h1>
                <MainDashboard allData={filteredJobs} openModal={openModal} onDelete={async (j) => { await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, j.id), { isDeleted: true }); showNotification("Dihapus."); }} onCloseJob={handleCloseJob} onReopenJob={async (j) => { await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, j.id), { isClosed: false }); showNotification("WO Dibuka Kembali."); }} userPermissions={userPermissions} showNotification={showNotification} searchQuery={searchQuery} setSearchQuery={setSearchQuery} filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterWorkStatus={filterWorkStatus} setFilterWorkStatus={setFilterWorkStatus} showClosedJobs={showClosedJobs} setShowClosedJobs={setShowClosedJobs} settings={appSettings} />
            </div>
        )}

        {currentView === 'production_spkl' && ( <SpklManagementView jobs={jobs} suppliers={suppliers} userPermissions={userPermissions} showNotification={showNotification} /> )}
        {currentView === 'job_control' && ( <JobControlView jobs={jobs} inventoryItems={inventoryItems} settings={appSettings} showNotification={showNotification} userPermissions={userPermissions} /> )}
        {currentView === 'general_affairs' && ( <AssetManagementView assets={assets} userPermissions={userPermissions} showNotification={showNotification} /> )}
        {currentView === 'crc_dashboard' && ( <CrcDashboardView jobs={jobs} inventoryItems={inventoryItems} settings={appSettings} showNotification={showNotification} /> )}
        
        {currentView === 'inventory' && <InventoryView userPermissions={userPermissions} showNotification={showNotification} suppliers={suppliers} />}
        
        {currentView === 'part_monitoring' && <PartMonitoringView jobs={jobs} inventoryItems={inventoryItems} />}
        
        {currentView === 'purchase_order' && <PurchaseOrderView suppliers={suppliers} inventoryItems={inventoryItems} jobs={jobs} userPermissions={userPermissions} showNotification={showNotification} realTimePOs={purchaseOrders} />}
        
        {currentView === 'part_issuance' && <MaterialIssuanceView activeJobs={jobs.filter(j => j.woNumber)} inventoryItems={inventoryItems} suppliers={suppliers} userPermissions={userPermissions} showNotification={showNotification} onRefreshData={() => {}} issuanceType="sparepart" />}
        {currentView === 'material_issuance' && <MaterialIssuanceView activeJobs={jobs.filter(j => j.woNumber)} inventoryItems={inventoryItems} suppliers={suppliers} userPermissions={userPermissions} showNotification={showNotification} onRefreshData={() => {}} issuanceType="material" settings={appSettings} />}
        
        {currentView === 'finance_invoice' && <InvoiceCreatorView jobs={jobs} settings={appSettings} showNotification={showNotification} userPermissions={userPermissions} />}
        {currentView === 'finance_tax' && <TaxManagementView jobs={jobs} purchaseOrders={purchaseOrders} transactions={transactions} suppliers={suppliers} settings={appSettings} showNotification={showNotification} userPermissions={userPermissions} />}
        {currentView === 'finance_dashboard' && <AccountingView jobs={jobs} purchaseOrders={purchaseOrders} transactions={transactions} assets={assets} />}
        {currentView === 'finance_cashier' && <CashierView jobs={jobs} transactions={transactions} userPermissions={userPermissions} showNotification={showNotification} />}
        {currentView === 'finance_debt' && <DebtReceivableView jobs={jobs} transactions={transactions} purchaseOrders={purchaseOrders} userPermissions={userPermissions} showNotification={showNotification} />}
        
        {currentView === 'settings' && ( <div className="max-w-5xl mx-auto"><SettingsView currentSettings={appSettings} refreshSettings={async () => {}} showNotification={showNotification} userPermissions={userPermissions} realTimeSuppliers={suppliers} /></div> )}
        
        {currentView === 'report_center' && ( <ReportCenterView jobs={jobs} transactions={transactions} purchaseOrders={purchaseOrders} inventoryItems={inventoryItems} vehicles={vehicles} /> )}

        <Modal isOpen={actualModalState.isOpen} onClose={closeModal} title={actualModalState.type === 'create_estimation' ? 'Editor Estimasi & Work Order' : 'Registrasi Master Unit'} maxWidth={actualModalState.type === 'create_estimation' ? 'max-w-7xl' : 'max-w-3xl'} >
            {actualModalState.type === 'create_estimation' && actualModalState.data && ( <EstimateEditor job={actualModalState.data} ppnPercentage={appSettings.ppnPercentage} insuranceOptions={appSettings.insuranceOptions} onSave={handleSaveEstimate} onCancel={closeModal} settings={appSettings} creatorName={userData.displayName || 'Admin'} inventoryItems={inventoryItems} showNotification={showNotification} /> )}
            {actualModalState.type === 'edit_data' && <JobForm settings={appSettings} initialData={actualModalState.data} onSave={handleSaveVehicle} onCancel={closeModal} />}
        </Modal>
      </main>

      {userData.uid && <InternalChatWidget currentUser={userData} />}
    </div>
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
