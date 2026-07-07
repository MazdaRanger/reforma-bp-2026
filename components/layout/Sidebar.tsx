import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LayoutDashboard, List, LogOut, User, Menu, PlusCircle, FileText, Settings, Package, ChevronDown, ChevronRight, Truck, Wrench, PaintBucket, ShoppingCart, ClipboardList, BarChart3, Banknote, Scale, FileCheck, Landmark, ExternalLink, Briefcase, MessageSquare, Hammer, FileSpreadsheet, ShieldCheck, TrendingUp, Trophy, Sparkles } from 'lucide-react';
import { UserProfile, UserPermissions, Settings as SystemSettings } from '../../types';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  const [expandedMenuId, setExpandedMenuId] = useState<string>('');
  // Track the "pinned" open accordion — the one the user had open before collapsing
  const [pinnedMenuId, setPinnedMenuId] = useState<string>('');
  const [collapsed, setCollapsed] = useState(true);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lang = settings.language || 'id';
  const t = (key: string) => DICTIONARY[lang]?.[key] || key;

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

  // Auto-expand the parent of the active view
  useEffect(() => {
    const activeParent = menuItems.find(item => 
      item.children?.some(child => child.id === currentView)
    );
    if (activeParent) {
      setPinnedMenuId(activeParent.id);
      setExpandedMenuId(activeParent.id);
    }
  }, [currentView, menuItems]);

  const handleMouseEnter = () => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    setCollapsed(false);
    // Restore the pinned expanded menu when sidebar re-opens
    setExpandedMenuId(pinnedMenuId);
  };

  const handleMouseLeave = () => {
    // Small delay so users can click items near the edge
    collapseTimerRef.current = setTimeout(() => {
      setCollapsed(true);
      setExpandedMenuId(''); // Close all dropdowns when sidebar collapses
    }, 200);
  };

  const handleAccordionChange = (val: string) => {
    setExpandedMenuId(val);
    setPinnedMenuId(val); // Remember user's last manual selection
  };

  // Desktop sidebar nav content
  const NavItems = () => (
    <div className="flex flex-col space-y-0.5">
      {menuItems.map((item) => {
        const Icon = item.icon;
        const hasChildren = item.children && item.children.length > 0;
        const isSingleActive = !hasChildren && currentView === item.id;
        const isParentActive = hasChildren && item.children?.some(child => child.id === currentView);
        const isExpanded = expandedMenuId === item.id;

        return (
          <div key={item.id}>
            {!hasChildren ? (
              // ── Leaf menu item ──────────────────────────────────────────
              <button
                onClick={() => { setCurrentView(item.id); setIsOpen(false); }}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'relative flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                  isSingleActive
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <Icon size={18} className="shrink-0" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="truncate"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {/* Collapsed tooltip */}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-md bg-foreground/90 px-2 py-1 text-xs text-background opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-md">
                    {item.label}
                  </span>
                )}
              </button>
            ) : (
              // ── Parent menu with children ────────────────────────────
              <div className={cn('rounded-xl overflow-hidden transition-colors duration-200', isExpanded && !collapsed ? 'bg-accent/40' : '')}>
                <button
                  onClick={() => {
                    if (collapsed) {
                      // Expand sidebar first on click when collapsed
                      setCollapsed(false);
                      setExpandedMenuId(item.id);
                      setPinnedMenuId(item.id);
                    } else {
                      handleAccordionChange(isExpanded ? '' : item.id);
                    }
                  }}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'relative flex items-center w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                    isParentActive && !isExpanded
                      ? 'text-primary bg-primary/10'
                      : isExpanded && !collapsed
                        ? 'text-foreground font-semibold'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="flex-1 text-left truncate ml-3"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="ml-auto shrink-0"
                      >
                        <motion.div
                          animate={{ rotate: isExpanded ? 90 : 0 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                        >
                          <ChevronRight size={15} />
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Active dot indicator when collapsed */}
                  {collapsed && isParentActive && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                  {/* Collapsed tooltip */}
                  {collapsed && (
                    <span className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-md bg-foreground/90 px-2 py-1 text-xs text-background opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-md">
                      {item.label}
                    </span>
                  )}
                </button>

                {/* Dropdown sub-menu */}
                <AnimatePresence initial={false}>
                  {isExpanded && !collapsed && (
                    <motion.div
                      key="submenu"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="flex flex-col gap-0.5 pl-5 pr-2 pb-2 pt-1 border-l-2 border-primary/20 ml-6">
                        {item.children?.map(child => {
                          const ChildIcon = child.icon;
                          const isChildActive = currentView === child.id;
                          return (
                            <button
                              key={child.id}
                              onClick={() => { setCurrentView(child.id); setIsOpen(false); }}
                              className={cn(
                                'flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm transition-all duration-150',
                                isChildActive
                                  ? 'bg-primary/15 text-primary font-semibold'
                                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                              )}
                            >
                              <ChildIcon size={15} className={cn('shrink-0', isChildActive ? 'text-primary' : 'opacity-60')} />
                              <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.05 }}
                              >
                                {child.label}
                              </motion.span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ── Desktop sidebar (collapsible) ──────────────────────────────────────
  const DesktopSidebar = () => (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 256 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="hidden md:flex h-screen flex-col z-30 sticky top-0 left-0 overflow-hidden shrink-0"
    >
      <div className="flex h-full flex-col bg-background/95 supports-[backdrop-filter]:bg-background/60 backdrop-blur-xl border-r">
        {/* Header */}
        <div className={cn('flex items-center border-b bg-background/50 transition-all duration-200', collapsed ? 'p-3 justify-center' : 'p-4 gap-3')}>
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 shadow-md shadow-primary/30">
            <span className="text-primary-foreground font-extrabold text-sm">R</span>
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <h2 className="text-base font-extrabold text-foreground tracking-tight leading-none">ReForma</h2>
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Body & Paint System</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav items */}
        <div className="flex-grow p-2 overflow-y-auto overflow-x-hidden scrollbar-thin">
          <NavItems />
        </div>

        {/* Footer: user & settings */}
        <div className={cn('border-t bg-background/50 transition-all duration-200', collapsed ? 'p-2' : 'p-3 space-y-2')}>
          <div className={cn('flex items-center transition-all duration-200', collapsed ? 'justify-center flex-col gap-2' : 'justify-between px-1')}>
            <div className={cn('flex items-center overflow-hidden', collapsed ? 'flex-col gap-1' : 'gap-2')}>
              <Avatar className="h-8 w-8 border shadow-sm shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                  {(userData.displayName || userData.email || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <AnimatePresence>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <p className="text-xs font-bold text-foreground truncate max-w-[100px]">{userData.displayName || userData.email || 'User'}</p>
                    <p className="text-[10px] text-muted-foreground truncate capitalize">{userPermissions.role}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={() => { setCurrentView('settings'); setIsOpen(false); }}
              title={t('settings')}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                currentView === 'settings' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Settings size={16} />
            </button>
          </div>
          <button
            onClick={onLogout}
            title={collapsed ? t('logout') : undefined}
            className={cn(
              'flex items-center gap-2 text-destructive text-xs font-medium hover:bg-destructive/10 rounded-lg transition-all',
              collapsed ? 'justify-center p-1.5 w-full' : 'w-full px-2 py-1.5'
            )}
          >
            <LogOut size={15} className="shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  {t('logout')}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
    </motion.aside>
  );

  // ── Mobile Sheet sidebar ────────────────────────────────────────────────
  const MobileSidebarContent = () => (
    <div className="flex h-full flex-col bg-background/95 backdrop-blur-xl">
      <div className="p-5 flex justify-between items-center border-b bg-background/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 shadow-md shadow-primary/30">
            <span className="text-primary-foreground font-extrabold text-sm">R</span>
          </div>
          <div>
            <h2 className="text-base font-extrabold text-foreground tracking-tight leading-none">ReForma</h2>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Body & Paint System</p>
          </div>
        </div>
        <button onClick={() => setIsOpen(false)} className="p-1.5 text-muted-foreground hover:bg-accent rounded-lg transition-colors">
          <Menu size={20} />
        </button>
      </div>
      <div className="flex-grow p-3 overflow-y-auto scrollbar-thin">
        <NavItems />
      </div>
      <div className="p-3 border-t bg-background/50 space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8 border shadow-sm">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {(userData.displayName || userData.email || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xs font-bold text-foreground truncate max-w-[130px]">{userData.displayName || userData.email || 'User'}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{userPermissions.role}</p>
            </div>
          </div>
          <button onClick={() => { setCurrentView('settings'); setIsOpen(false); }} className={cn('p-1.5 rounded-lg transition-colors', currentView === 'settings' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent')}>
            <Settings size={16} />
          </button>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 text-destructive text-xs font-medium hover:bg-destructive/10 rounded-lg transition-all w-full px-2 py-1.5">
          <LogOut size={15} /> {t('logout')}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left" className="p-0 w-72 md:hidden border-r-0 [&>button]:hidden">
          <SheetTitle className="sr-only">Navigasi Utama</SheetTitle>
          <MobileSidebarContent />
        </SheetContent>
      </Sheet>

      {/* Desktop collapsible sidebar */}
      <DesktopSidebar />
    </>
  );
};

export default Sidebar;
