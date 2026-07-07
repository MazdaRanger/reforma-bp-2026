
import React, { useState, useMemo, useEffect } from 'react';
import { LayoutDashboard, List, LogOut, User, Menu, PlusCircle, FileText, Settings, Package, ChevronDown, ChevronRight, Truck, Wrench, PaintBucket, ShoppingCart, ClipboardList, BarChart3, Banknote, Scale, FileCheck, Landmark, ExternalLink, Briefcase, Phone, MessageSquare, Hammer, FileSpreadsheet, ShieldCheck, PieChart, TrendingUp, Trophy, Sparkles } from 'lucide-react';
import { UserProfile, UserPermissions, Settings as SystemSettings } from '../../types';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  currentView: string;
  setCurrentView: (view: string) => void;
  userData: UserProfile;
  userPermissions: UserPermissions;
  onLogout: () => void;
  settings: SystemSettings;
}

const DICTIONARY: Record<string, Record<string, string>> = {
    id: {
        overview_root: 'Ikhtisar / Overview',
        dash_main: 'Dashboard Utama',
        dash_biz: 'Analisis Bisnis',
        dash_kpi: 'Performa Staff (KPI)',
        dash_ai: 'AI Strategic Insight',
        input_data: 'Input Unit Baru',
        estimation_root: 'Estimasi & WO',
        est_create: 'Buat Estimasi',
        job_list: 'Daftar Pekerjaan',
        spkl: 'SPKL (Jasa Luar)',
        claims: 'Admin Claim Control',
        crc: 'CRC / Customer Care',
        production_root: 'Produksi & Bengkel',
        kanban: 'Job Control (Kanban)',
        sparepart_root: 'Sparepart & Gudang',
        monitoring: 'Monitoring Part WO',
        inventory: 'Master Stok',
        po: 'Purchase Order (PO)',
        part_out: 'Keluar Part (WO)',
        material_out: 'Pakai Bahan',
        ga: 'Aset & Operasional',
        finance_root: 'Finance & Accounting',
        invoice: 'Pembuatan Faktur',
        tax: 'Manajemen Pajak',
        cashier: 'Kasir & Gatepass',
        debt: 'Hutang & Piutang',
        reports: 'Laporan Keuangan',
        report_center: 'Pusat Laporan',
        logout: 'Keluar Sistem',
        settings: 'Pengaturan'
    },
    en: {
        overview_root: 'Overview',
        dash_main: 'Main Dashboard',
        dash_biz: 'Business Intelligence',
        dash_kpi: 'Staff KPI',
        dash_ai: 'AI Strategic Insight',
        input_data: 'Vehicle Intake',
        estimation_root: 'Estimates & WO',
        est_create: 'Create Estimate',
        job_list: 'Work List',
        spkl: 'Sublet (External)',
        claims: 'Admin Claim Control',
        crc: 'CRC / Customer Care',
        production_root: 'Workshop Production',
        kanban: 'Job Control (Kanban)',
        sparepart_root: 'Spareparts & Warehouse',
        monitoring: 'Part Monitoring',
        inventory: 'Inventory Master',
        po: 'Purchase Orders (PO)',
        part_out: 'Part Issuance',
        material_out: 'Consumables Usage',
        ga: 'Assets & Operations',
        finance_root: 'Finance & Accounting',
        invoice: 'Invoice Generation',
        tax: 'Tax Management',
        cashier: 'Cashier & Gatepass',
        debt: 'Debt & Receivable',
        reports: 'Financial Statements',
        report_center: 'Report Center',
        logout: 'Log Out',
        settings: 'System Settings'
    }
};

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, setIsOpen, currentView, setCurrentView, userData, userPermissions, onLogout, settings 
}) => {
  const [expandedMenuId, setExpandedMenuId] = useState<string | null>(null);
  const lang = settings.language || 'id';
  const t = (key: string) => DICTIONARY[lang][key] || key;

  const menuItems = useMemo(() => {
    const items = [
      {
          id: 'overview_root',
          label: t('overview_root'),
          icon: LayoutDashboard,
          children: [
              { id: 'overview_main', label: t('dash_main'), icon: LayoutDashboard },
              { id: 'overview_business', label: t('dash_biz'), icon: TrendingUp },
              { id: 'overview_kpi', label: t('dash_kpi'), icon: Trophy },
              { id: 'overview_ai', label: t('dash_ai'), icon: Sparkles },
          ]
      },
      { id: 'input_data', label: t('input_data'), icon: PlusCircle },
      { 
          id: 'estimation_root', 
          label: t('estimation_root'), 
          icon: FileText,
          children: [
              { id: 'estimation_create', label: t('est_create'), icon: PlusCircle },
              { id: 'entry_data', label: t('job_list'), icon: List },
              { id: 'production_spkl', label: t('spkl'), icon: ExternalLink },
          ]
      },
      { id: 'claims_control', label: t('claims'), icon: ShieldCheck },
      { id: 'crc_dashboard', label: t('crc'), icon: MessageSquare },
      { 
          id: 'production_root', 
          label: t('production_root'), 
          icon: Hammer,
          children: [
              { id: 'job_control', label: t('kanban'), icon: LayoutDashboard },
          ]
      },
      { 
          id: 'sparepart_root', 
          label: t('sparepart_root'), 
          icon: Wrench,
          children: [
              { id: 'part_monitoring', label: t('monitoring'), icon: ClipboardList },
              { id: 'inventory', label: t('inventory'), icon: Package },
              { id: 'purchase_order', label: t('po'), icon: ShoppingCart },
              { id: 'part_issuance', label: t('part_out'), icon: Truck }, 
              { id: 'material_issuance', label: t('material_out'), icon: PaintBucket }, 
          ]
      },
      { id: 'general_affairs', label: t('ga'), icon: Briefcase },
    ];

    if (userPermissions.hasFinanceAccess) {
        items.push({ 
            id: 'finance_root', 
            label: t('finance_root'), 
            icon: BarChart3,
            children: [
                { id: 'finance_invoice', label: t('invoice'), icon: FileCheck },
                { id: 'finance_cashier', label: t('cashier'), icon: Banknote },
                { id: 'finance_tax', label: t('tax'), icon: Landmark },
                { id: 'finance_debt', label: t('debt'), icon: Scale },
                { id: 'finance_dashboard', label: t('reports'), icon: BarChart3 },
            ]
        });
        items.push({ id: 'report_center', label: t('report_center'), icon: FileSpreadsheet });
    }
    return items;
  }, [userPermissions, lang]);

  useEffect(() => {
    const activeParent = menuItems.find(item => 
      item.children?.some(child => child.id === currentView)
    );
    if (activeParent) setExpandedMenuId(activeParent.id);
  }, [currentView, menuItems]);

  const toggleMenu = (id: string) => setExpandedMenuId(prevId => (prevId === id ? null : id));

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-20 md:hidden" onClick={() => setIsOpen(false)}></div>
      )}
      <aside className={`fixed md:sticky top-0 left-0 h-screen w-64 bg-white/80 backdrop-blur-2xl border-r border-white/50 shadow-xl flex flex-col z-30 transform transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b border-indigo-50/50 flex justify-between items-center bg-white/40">
          <div>
            <h2 className="text-xl font-extrabold text-indigo-700 tracking-tight">ReForma</h2>
            <p className="text-xs text-slate-500 font-medium">Body & Paint System</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-slate-500"><Menu size={20} /></button>
        </div>
        <nav className="flex-grow p-4 space-y-1 overflow-y-auto scrollbar-thin">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedMenuId === item.id;
            const isParentActive = hasChildren && item.children?.some(child => child.id === currentView);
            const isSingleActive = !hasChildren && currentView === item.id;

            return (
              <div key={item.id} className="mb-1">
                  {!hasChildren ? (
                      <button 
                        onClick={() => { setCurrentView(item.id); setIsOpen(false); }} 
                        className={`flex items-center gap-3 w-full p-3 rounded-xl text-sm font-medium transition-all duration-200 ${isSingleActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-600 hover:bg-white/60 hover:text-indigo-600'}`}
                      >
                        <Icon size={18}/> {item.label}
                      </button>
                  ) : (
                      <div className={`rounded-xl transition-colors duration-200 ${isExpanded ? 'bg-indigo-50/50' : ''}`}>
                          <button onClick={() => toggleMenu(item.id)} className={`flex items-center justify-between w-full p-3 rounded-xl text-sm font-medium transition-all duration-200 ${isParentActive && !isExpanded ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-600 hover:bg-white/60 hover:text-indigo-600'} ${isExpanded ? 'text-indigo-700 font-bold' : ''}`}>
                             <div className="flex items-center gap-3"><Icon size={18}/> {item.label}</div>
                             {isExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                          </button>
                          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-96 opacity-100 pb-2' : 'max-h-0 opacity-0'}`}>
                              <div className="space-y-1 px-3">
                                  {item.children?.map(child => {
                                      const ChildIcon = child.icon;
                                      const isChildActive = currentView === child.id;
                                      return (
                                        <button key={child.id} onClick={() => { setCurrentView(child.id); setIsOpen(false); }} className={`flex items-center gap-3 w-full p-2.5 rounded-lg text-sm transition-all duration-200 ${isChildActive ? 'text-indigo-700 font-bold bg-white shadow-sm' : 'text-slate-500 hover:text-indigo-600 hover:bg-white/40'}`}>
                                            <ChildIcon size={16} className={isChildActive ? "text-indigo-600" : "opacity-70"}/> {child.label}
                                        </button>
                                      )
                                  })}
                              </div>
                          </div>
                      </div>
                  )}
              </div>
            )
          })}
        </nav>
        <div className="p-4 border-t border-indigo-50/50 bg-white/40 space-y-3">
          <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-100 to-white flex items-center justify-center text-indigo-700 font-bold shrink-0 shadow-sm border border-white"><User size={18}/></div>
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-slate-800 truncate max-w-[100px]">{userData.displayName || userData.email || 'User'}</p>
                  <p className="text-xs text-slate-500 truncate capitalize font-medium">{userPermissions.role}</p>
                </div>
              </div>
              <button onClick={() => { setCurrentView('settings'); setIsOpen(false); }} className={`p-2 rounded-full transition-colors ${currentView === 'settings' ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-white text-slate-500'}`} title={t('settings')}><Settings size={18} /></button>
          </div>
          <button onClick={onLogout} className="flex items-center gap-2 text-rose-600 text-sm font-medium hover:text-rose-800 hover:bg-rose-50/50 p-2.5 rounded-xl transition-all w-full border border-transparent hover:border-rose-100">
            <LogOut size={16}/> {t('logout')}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
