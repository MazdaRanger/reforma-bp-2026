import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { UserProfile, UserPermissions, Settings as SystemSettings } from '../../types';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import Modal from '../ui/Modal';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, TrendingUp, BarChart2, Sparkles,
  Car, FileText, ClipboardList, Wrench, ShieldCheck, Headphones,
  Kanban, ScanSearch, Package, ShoppingBag, PackageOpen, Droplets, Building2,
  Receipt, Landmark, CreditCard, Scale, BarChart, FolderOpen,
  Settings2, LogOut, ChevronDown, Sun, Moon
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

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

// ─── Translations ────────────────────────────────────────────────────────────
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
    settings: 'Pengaturan',
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
    settings: 'System Settings',
  },
};

// ─── Icon Maps ────────────────────────────────────────────────────────────────
const GROUP_ICONS: Record<string, React.ReactNode> = {
  overview_root:   <LayoutDashboard size={17} strokeWidth={1.5} />,
  input_data_root: <Car             size={17} strokeWidth={1.5} />,
  estimation_root: <ClipboardList   size={17} strokeWidth={1.5} />,
  claims_control_root: <ShieldCheck size={17} strokeWidth={1.5} />,
  crc_dashboard_root: <Headphones   size={17} strokeWidth={1.5} />,
  production_root: <Kanban          size={17} strokeWidth={1.5} />,
  sparepart_root:  <Package         size={17} strokeWidth={1.5} />,
  finance_root:    <BarChart        size={17} strokeWidth={1.5} />,
};

const ITEM_ICONS: Record<string, React.ReactNode> = {
  overview_main:      <LayoutDashboard size={13} strokeWidth={1.5} />,
  overview_business:  <TrendingUp      size={13} strokeWidth={1.5} />,
  overview_kpi:       <BarChart2       size={13} strokeWidth={1.5} />,
  overview_ai:        <Sparkles        size={13} strokeWidth={1.5} />,
  input_data:         <Car             size={13} strokeWidth={1.5} />,
  estimation_create:  <FileText        size={13} strokeWidth={1.5} />,
  entry_data:         <ClipboardList   size={13} strokeWidth={1.5} />,
  production_spkl:    <Wrench          size={13} strokeWidth={1.5} />,
  claims_control:     <ShieldCheck     size={13} strokeWidth={1.5} />,
  crc_dashboard:      <Headphones      size={13} strokeWidth={1.5} />,
  job_control:        <Kanban          size={13} strokeWidth={1.5} />,
  part_monitoring:    <ScanSearch      size={13} strokeWidth={1.5} />,
  inventory:          <Package         size={13} strokeWidth={1.5} />,
  purchase_order:     <ShoppingBag     size={13} strokeWidth={1.5} />,
  part_issuance:      <PackageOpen     size={13} strokeWidth={1.5} />,
  material_issuance:  <Droplets        size={13} strokeWidth={1.5} />,
  general_affairs:    <Building2       size={13} strokeWidth={1.5} />,
  finance_invoice:    <Receipt         size={13} strokeWidth={1.5} />,
  finance_tax:        <Landmark        size={13} strokeWidth={1.5} />,
  finance_cashier:    <CreditCard      size={13} strokeWidth={1.5} />,
  finance_debt:       <Scale           size={13} strokeWidth={1.5} />,
  finance_dashboard:  <BarChart        size={13} strokeWidth={1.5} />,
  report_center:      <FolderOpen      size={13} strokeWidth={1.5} />,
};

// ─── Component ────────────────────────────────────────────────────────────────
const Sidebar: React.FC<SidebarProps> = ({
  isOpen, setIsOpen, currentView, setCurrentView, userData, userPermissions, onLogout, settings,
}) => {
  const [isExpanded, setIsExpanded]     = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [accessDeniedModal, setAccessDeniedModal] = useState<{isOpen: boolean, menuName: string}>({isOpen: false, menuName: ''});

  const lang = settings.language || 'id';
  const t = (key: string) => DICTIONARY[lang]?.[key] || key;

  // ─── Menu Groups ──────────────────────────────────────────────────────────
  const menuGroups = useMemo(() => {
    const groups = [
      {
        id: 'overview_root', label: t('overview_root'),
        items: [
          { id: 'overview_main',     label: t('dash_main') },
          { id: 'overview_business', label: t('dash_biz')  },
          { id: 'overview_kpi',      label: t('dash_kpi')  },
          { id: 'overview_ai',       label: t('dash_ai')   },
        ],
      },
      {
        id: 'input_data_root', label: t('input_data'),
        items: [
          { id: 'input_data',        label: t('input_data')  },
        ],
      },
      {
        id: 'estimation_root', label: t('estimation_root'),
        items: [
          { id: 'estimation_create', label: t('est_create')  },
          { id: 'entry_data',        label: t('job_list')    },
          { id: 'production_spkl',   label: t('spkl')        },
        ],
      },
      {
        id: 'claims_control_root', label: t('claims'),
        items: [
          { id: 'claims_control',    label: t('claims')      },
        ],
      },
      {
        id: 'crc_dashboard_root', label: t('crc'),
        items: [
          { id: 'crc_dashboard',     label: t('crc')         },
        ],
      },
      {
        id: 'production_root', label: t('production_root'),
        items: [
          { id: 'job_control', label: t('kanban') },
        ],
      },
      {
        id: 'sparepart_root', label: t('sparepart_root'),
        items: [
          { id: 'part_monitoring',  label: t('monitoring')  },
          { id: 'inventory',        label: t('inventory')   },
          { id: 'purchase_order',   label: t('po')          },
          { id: 'part_issuance',    label: t('part_out')    },
          { id: 'material_issuance',label: t('material_out')},
          { id: 'general_affairs',  label: t('ga')          },
        ],
      },
    ];
    if (userPermissions.hasFinanceAccess) {
      groups.push({
        id: 'finance_root', label: t('finance_root'),
        items: [
          { id: 'finance_invoice',   label: t('invoice')       },
          { id: 'finance_cashier',   label: t('cashier')       },
          { id: 'finance_tax',       label: t('tax')           },
          { id: 'finance_debt',      label: t('debt')          },
          { id: 'finance_dashboard', label: t('reports')       },
          { id: 'report_center',     label: t('report_center') },
        ],
      });
    }
    return groups;
  }, [userPermissions, lang]);

  // Auto-detect active group from currentView
  useEffect(() => {
    const activeGroup = menuGroups.find(g => g.items.some(i => i.id === currentView));
    if (activeGroup) setExpandedGroup(activeGroup.id);
  }, [currentView, menuGroups]);

  // ─── Hover handlers with debounce ─────────────────────────────────────────
  const handleMouseEnter = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    setIsExpanded(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    collapseTimer.current = setTimeout(() => setIsExpanded(false), 180);
  }, []);

  useEffect(() => () => { if (collapseTimer.current) clearTimeout(collapseTimer.current); }, []);

  const navigate = (viewId: string, itemLabel?: string) => { 
      const isManager = userData.role === 'Manager';
      const permissions = settings.menuPermissions?.[userData.role || ''] || [];
      const hasBeenSetup = !!settings.menuPermissions?.[userData.role || ''];
      
      const isAllowed = isManager || (!hasBeenSetup) || permissions.includes(viewId);

      if (!isAllowed) {
          setAccessDeniedModal({ isOpen: true, menuName: itemLabel || viewId });
          return;
      }
      
      setCurrentView(viewId); 
      setIsOpen(false); 
  };

  const toggleGroup = (groupId: string) =>
    setExpandedGroup(prev => (prev === groupId ? null : groupId));

  // ─── User initials ────────────────────────────────────────────────────────
  const initials = useMemo(() => {
    if (!userData.displayName) return 'U';
    return userData.displayName.substring(0, 2).toUpperCase();
  }, [userData.displayName]);

  const { theme, toggleTheme } = useTheme();

  // ─── Shared label transition ──────────────────────────────────────────────
  const labelVariants = {
    hidden:  { opacity: 0, x: -4 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.15, delay: 0.08 } },
    exit:    { opacity: 0, x: -4, transition: { duration: 0.1 } },
  };

  // ─── Mobile Nav Content ───────────────────────────────────────────────────
  const MobileNav = () => (
    <div className="flex h-full flex-col bg-canvas">
      {/* Header */}
      <div className="pb-8 border-b border-hairline mb-6">
        <h2 className="text-[28px] font-display uppercase tracking-tight text-ink leading-none">ReForma</h2>
        <p className="text-[12px] text-mute font-medium mt-1 tracking-wide">Body & Paint System</p>
      </div>

      {/* Menu */}
      <div className="flex-grow overflow-y-auto scrollbar-none space-y-6 pr-1">
        {menuGroups.map(group => (
          <div key={group.id}>
            <p className="text-[10px] font-semibold text-mute uppercase tracking-[0.15em] mb-2 pl-1">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map(item => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id, item.label)}
                    className={cn(
                      'flex items-center gap-3 text-left px-2 py-2.5 w-full transition-colors',
                      isActive ? 'text-ink' : 'text-mute hover:text-ink'
                    )}
                  >
                    <span className="shrink-0">{ITEM_ICONS[item.id]}</span>
                    <span className={cn('text-[14px]', isActive ? 'font-medium border-b border-ink leading-tight' : 'font-normal')}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-hairline pt-4 space-y-2">
        <div className="flex items-center gap-2 px-1 mb-3">
          <div className="w-7 h-7 bg-ink flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-canvas">{initials}</span>
          </div>
          <span className="text-[13px] font-medium text-ink truncate">
            {userData.displayName || userData.email || 'User'}
          </span>
        </div>
        <button onClick={() => navigate('settings')} className="flex items-center gap-3 px-1 text-[13px] text-mute hover:text-ink transition-colors w-full py-1.5">
          <Settings2 size={13} strokeWidth={1.5} />
          <span>{t('settings')}</span>
        </button>
        <button onClick={onLogout} className="flex items-center gap-3 px-1 text-[13px] text-mute hover:text-ink transition-colors w-full py-1.5">
          <LogOut size={13} strokeWidth={1.5} />
          <span>{t('logout')}</span>
        </button>
      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Mobile Sheet ──────────────────────────────────────────────── */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="left"
          className="p-6 w-full max-w-[300px] md:hidden bg-canvas rounded-none border-r border-hairline"
        >
          <SheetTitle className="sr-only">Navigasi Utama</SheetTitle>
          <MobileNav />
        </SheetContent>
      </Sheet>
      
      <Modal isOpen={accessDeniedModal.isOpen} onClose={() => setAccessDeniedModal({ isOpen: false, menuName: '' })} title="AKSES DITOLAK">
          <div className="p-6 bg-canvas border border-ink text-center flex flex-col items-center">
              <ShieldCheck size={48} className="text-mute mb-4" strokeWidth={1.5} />
              <h3 className="font-display text-[24px] uppercase text-ink tracking-tight mb-2">RESTRICTED AREA</h3>
              <p className="text-[12px] font-medium text-mute uppercase tracking-widest leading-relaxed">
                  ANDA TIDAK MEMILIKI AKSES KE MENU <span className="text-ink font-bold border-b border-hairline pb-0.5">{accessDeniedModal.menuName}</span>.
              </p>
              <p className="text-[10px] text-mute uppercase tracking-widest mt-4">
                  HUBUNGI MANAGER UNTUK MENDAPATKAN AKSES INFORMASI TERSEBUT.
              </p>
              <button 
                  onClick={() => setAccessDeniedModal({ isOpen: false, menuName: '' })}
                  className="mt-[32px] w-full bg-ink text-canvas py-4 text-[12px] font-medium uppercase tracking-widest hover:bg-mute transition-colors"
              >
                  MENGERTI
              </button>
          </div>
      </Modal>

      {/* ── Desktop Sidebar ───────────────────────────────────────────── */}
      <motion.aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        animate={{ width: isExpanded ? 260 : 64 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="hidden md:flex h-screen flex-col z-30 sticky top-0 left-0 bg-canvas border-r border-hairline overflow-hidden shrink-0"
      >
        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <div className="h-[72px] flex items-center px-[20px] border-b border-hairline shrink-0">
          <div className="flex items-center gap-3">
            {/* Logo mark — always visible */}
            <div className="w-[24px] h-[24px] bg-ink shrink-0 flex items-center justify-center">
              <span className="text-canvas text-[11px] font-black leading-none">R</span>
            </div>
            {/* Logo text — fades on expand */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  key="logo-text"
                  variants={labelVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="overflow-hidden"
                >
                  <p className="text-[16px] font-display uppercase tracking-tight text-ink leading-none whitespace-nowrap">
                    ReForma
                  </p>
                  <p className="text-[10px] text-mute font-medium mt-0.5 whitespace-nowrap tracking-wide">
                    Body & Paint System
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Navigation ───────────────────────────────────────────────── */}
        <nav className="flex-grow overflow-y-auto overflow-x-hidden py-4 scrollbar-none">
          {menuGroups.map(group => {
            const isGroupActive = group.items.some(i => i.id === currentView);
            const isGroupOpen   = expandedGroup === group.id;

            return (
              <div key={group.id}>
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-[20px] py-[11px] transition-colors text-left',
                    isGroupActive ? 'text-ink' : 'text-mute hover:text-ink'
                  )}
                >
                  {/* Group icon — always visible */}
                  <span className="w-[24px] h-[24px] flex items-center justify-center shrink-0">
                    {GROUP_ICONS[group.id]}
                  </span>

                  {/* Group label + chevron — visible only when expanded */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        key="group-label"
                        variants={labelVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="flex items-center justify-between flex-1 min-w-0"
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap">
                          {group.label}
                        </span>
                        <motion.span
                          animate={{ rotate: isGroupOpen ? 180 : 0 }}
                          transition={{ duration: 0.18 }}
                          className="shrink-0 ml-2 opacity-60"
                        >
                          <ChevronDown size={11} strokeWidth={2.5} />
                        </motion.span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>

                {/* Sub-items (accordion) */}
                <AnimatePresence initial={false}>
                  {isExpanded && isGroupOpen && (
                    <motion.div
                      key="subitems"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      {/* Left accent line for the group */}
                      <div className="ml-[31px] border-l border-hairline pb-2">
                        {group.items.map(item => {
                          const isActive = currentView === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => navigate(item.id, item.label)}
                              className={cn(
                                'w-full flex items-center gap-3 text-left pl-4 pr-4 py-[7px] transition-colors',
                                isActive ? 'text-ink' : 'text-mute hover:text-ink'
                              )}
                            >
                              <span className="shrink-0">{ITEM_ICONS[item.id]}</span>
                              <span
                                className={cn(
                                  'text-[13px] whitespace-nowrap',
                                  isActive ? 'font-medium border-b border-ink pb-[1px]' : 'font-normal'
                                )}
                              >
                                {item.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* ── User Footer ───────────────────────────────────────────────── */}
        <div className="border-t border-hairline shrink-0">
          <AnimatePresence mode="wait">
            {isExpanded ? (
              /* Expanded footer */
              <motion.div
                key="footer-expanded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.15, delay: 0.1 } }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                className="px-[20px] py-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <div className="w-[26px] h-[26px] bg-ink flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-black text-canvas">{initials}</span>
                  </div>
                  <span className="text-[13px] font-medium text-ink truncate max-w-[160px]">
                    {userData.displayName || userData.email || 'User'}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-5">
                    <button
                      onClick={() => navigate('settings')}
                      className="flex items-center gap-2 text-[12px] text-mute hover:text-ink transition-colors"
                    >
                      <Settings2 size={12} strokeWidth={1.5} />
                      <span>{t('settings')}</span>
                    </button>
                    <button
                      onClick={onLogout}
                      className="flex items-center gap-2 text-[12px] text-mute hover:text-ink transition-colors"
                    >
                      <LogOut size={12} strokeWidth={1.5} />
                      <span>{t('logout')}</span>
                    </button>
                  </div>
                  <button onClick={toggleTheme} className="text-mute hover:text-ink transition-colors" title="Toggle Theme">
                    {theme === 'dark' ? <Sun size={14} strokeWidth={1.5} /> : <Moon size={14} strokeWidth={1.5} />}
                  </button>
                </div>
              </motion.div>
            ) : (
              /* Collapsed footer — icons only */
              <motion.div
                key="footer-collapsed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.12 } }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                className="flex flex-col items-center py-4 gap-4"
              >
                {/* User avatar */}
                <div className="w-[26px] h-[26px] bg-ink flex items-center justify-center" title={userData.displayName || ''}>
                  <span className="text-[9px] font-black text-canvas">{initials}</span>
                </div>
                <button
                  onClick={() => { setIsExpanded(true); navigate('settings'); }}
                  className="text-mute hover:text-ink transition-colors"
                  title={t('settings')}
                >
                  <Settings2 size={15} strokeWidth={1.5} />
                </button>
                <button
                  onClick={toggleTheme}
                  className="text-mute hover:text-ink transition-colors"
                  title="Toggle Theme"
                >
                  {theme === 'dark' ? <Sun size={15} strokeWidth={1.5} /> : <Moon size={15} strokeWidth={1.5} />}
                </button>
                <button
                  onClick={onLogout}
                  className="text-mute hover:text-ink transition-colors"
                  title={t('logout')}
                >
                  <LogOut size={15} strokeWidth={1.5} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </>
  );
};

export default Sidebar;
