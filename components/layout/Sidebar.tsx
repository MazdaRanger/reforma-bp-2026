import React, { useState, useMemo, useEffect } from 'react';
import { UserProfile, UserPermissions, Settings as SystemSettings } from '../../types';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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
        overview_root: 'OVERVIEW',
        dash_main: 'Dashboard Utama',
        dash_biz: 'Analisis Bisnis',
        dash_kpi: 'Performa Staff (KPI)',
        dash_ai: 'AI Strategic Insight',
        input_data: 'Input Unit Baru',
        estimation_root: 'ESTIMASI & WO',
        est_create: 'Buat Estimasi',
        job_list: 'Daftar Pekerjaan',
        spkl: 'SPKL (Jasa Luar)',
        claims: 'Admin Claim Control',
        crc: 'CRC / Customer Care',
        production_root: 'PRODUKSI & BENGKEL',
        kanban: 'Job Control (Kanban)',
        sparepart_root: 'SPAREPART & GUDANG',
        monitoring: 'Monitoring Part WO',
        inventory: 'Master Stok',
        po: 'Purchase Order (PO)',
        part_out: 'Keluar Part (WO)',
        material_out: 'Pakai Bahan',
        ga: 'Aset & Operasional',
        finance_root: 'FINANCE & ACCOUNTING',
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
        overview_root: 'OVERVIEW',
        dash_main: 'Main Dashboard',
        dash_biz: 'Business Intelligence',
        dash_kpi: 'Staff KPI',
        dash_ai: 'AI Strategic Insight',
        input_data: 'Vehicle Intake',
        estimation_root: 'ESTIMATES & WO',
        est_create: 'Create Estimate',
        job_list: 'Work List',
        spkl: 'Sublet (External)',
        claims: 'Admin Claim Control',
        crc: 'CRC / Customer Care',
        production_root: 'WORKSHOP PRODUCTION',
        kanban: 'Job Control (Kanban)',
        sparepart_root: 'SPAREPARTS & WAREHOUSE',
        monitoring: 'Part Monitoring',
        inventory: 'Inventory Master',
        po: 'Purchase Orders (PO)',
        part_out: 'Part Issuance',
        material_out: 'Consumables Usage',
        ga: 'Assets & Operations',
        finance_root: 'FINANCE & ACCOUNTING',
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
  const [collapsed, setCollapsed] = useState(false);
  const lang = settings.language || 'id';
  const t = (key: string) => DICTIONARY[lang]?.[key] || key;

  const menuGroups = useMemo(() => {
    const groups = [
      {
          id: 'overview_root',
          label: t('overview_root'),
          items: [
              { id: 'overview_main', label: t('dash_main') },
              { id: 'overview_business', label: t('dash_biz') },
              { id: 'overview_kpi', label: t('dash_kpi') },
              { id: 'overview_ai', label: t('dash_ai') },
          ]
      },
      {
          id: 'estimation_root', 
          label: t('estimation_root'), 
          items: [
              { id: 'input_data', label: t('input_data') },
              { id: 'estimation_create', label: t('est_create') },
              { id: 'entry_data', label: t('job_list') },
              { id: 'production_spkl', label: t('spkl') },
              { id: 'claims_control', label: t('claims') },
              { id: 'crc_dashboard', label: t('crc') },
          ]
      },
      { 
          id: 'production_root', 
          label: t('production_root'), 
          items: [
              { id: 'job_control', label: t('kanban') },
          ]
      },
      { 
          id: 'sparepart_root', 
          label: t('sparepart_root'), 
          items: [
              { id: 'part_monitoring', label: t('monitoring') },
              { id: 'inventory', label: t('inventory') },
              { id: 'purchase_order', label: t('po') },
              { id: 'part_issuance', label: t('part_out') }, 
              { id: 'material_issuance', label: t('material_out') }, 
              { id: 'general_affairs', label: t('ga') },
          ]
      }
    ];

    if (userPermissions.hasFinanceAccess) {
        groups.push({ 
            id: 'finance_root', 
            label: t('finance_root'), 
            items: [
                { id: 'finance_invoice', label: t('invoice') },
                { id: 'finance_cashier', label: t('cashier') },
                { id: 'finance_tax', label: t('tax') },
                { id: 'finance_debt', label: t('debt') },
                { id: 'finance_dashboard', label: t('reports') },
                { id: 'report_center', label: t('report_center') },
            ]
        });
    }
    return groups;
  }, [userPermissions, lang]);

  const NavItems = () => (
    <div className="flex flex-col space-y-[48px] py-4">
      {menuGroups.map((group) => (
        <div key={group.id} className="flex flex-col">
          <h3 className="text-[16px] font-medium text-ink mb-[18px] uppercase tracking-wide">
            {group.label}
          </h3>
          <div className="flex flex-col gap-3">
            {group.items.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setCurrentView(item.id); setIsOpen(false); }}
                  className={cn(
                    'text-left text-[16px] transition-colors',
                    isActive ? 'font-medium text-ink' : 'text-mute hover:text-ink'
                  )}
                >
                  <span className={cn('inline-block', isActive ? 'border-b-[1px] border-ink' : '')}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const UserFooter = () => (
    <div className="border-t border-hairline bg-canvas pt-4 pb-6 px-1 flex flex-col gap-4">
        <div className="flex justify-between items-center">
            <span className="text-[14px] font-medium text-ink">{userData.displayName || userData.email || 'User'}</span>
            <button onClick={() => { setCurrentView('settings'); setIsOpen(false); }} className="text-[14px] text-mute hover:text-ink transition-colors">
                {t('settings')}
            </button>
        </div>
        <button onClick={onLogout} className="text-left text-[14px] text-mute hover:text-ink transition-colors">
            {t('logout')}
        </button>
    </div>
  );

  const DesktopSidebar = () => (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 0 : 256, opacity: collapsed ? 0 : 1, marginRight: collapsed ? 0 : 48 }}
      transition={{ duration: 0.2 }}
      className={cn("hidden md:flex h-screen flex-col z-30 sticky top-0 left-0 bg-canvas overflow-hidden shrink-0")}
    >
      <div className="flex h-full w-[256px] flex-col bg-canvas border-r border-hairline pr-6">
        <div className="pt-8 pb-12">
            <h2 className="text-[32px] font-display uppercase tracking-tight text-ink leading-none">ReForma</h2>
            <p className="text-[14px] text-mute font-medium mt-1">Body & Paint System</p>
        </div>
        <div className="flex-grow overflow-y-auto scrollbar-none pb-12">
          <NavItems />
        </div>
        <UserFooter />
      </div>
    </motion.aside>
  );

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left" className="p-6 w-full max-w-[320px] md:hidden bg-canvas rounded-none border-r-0">
          <SheetTitle className="sr-only">Navigasi Utama</SheetTitle>
          <div className="flex h-full flex-col bg-canvas">
            <div className="pb-8 flex justify-between items-start">
                <div>
                    <h2 className="text-[32px] font-display uppercase tracking-tight text-ink leading-none">ReForma</h2>
                    <p className="text-[14px] text-mute font-medium mt-1">Body & Paint System</p>
                </div>
            </div>
            <div className="flex-grow overflow-y-auto scrollbar-none pb-8">
              <NavItems />
            </div>
            <UserFooter />
          </div>
        </SheetContent>
      </Sheet>
      
      {/* Collapse Toggle Button - Fixed outside the sidebar */}
      <button 
        onClick={() => setCollapsed(!collapsed)}
        className="hidden md:flex fixed bottom-6 left-6 z-40 bg-soft-cloud text-ink h-10 w-10 rounded-full items-center justify-center hover:bg-hairline-soft transition-colors"
        title="Toggle Menu"
      >
        <span className="text-xl leading-none -mt-1">{collapsed ? '→' : '←'}</span>
      </button>

      <DesktopSidebar />
    </>
  );
};

export default Sidebar;
