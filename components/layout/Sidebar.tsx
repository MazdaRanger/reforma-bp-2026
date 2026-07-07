import React, { useState, useMemo, useEffect } from 'react';
import { LayoutDashboard, List, LogOut, User, Menu, PlusCircle, FileText, Settings, Package, ChevronDown, ChevronRight, Truck, Wrench, PaintBucket, ShoppingCart, ClipboardList, BarChart3, Banknote, Scale, FileCheck, Landmark, ExternalLink, Briefcase, Phone, MessageSquare, Hammer, FileSpreadsheet, ShieldCheck, PieChart, TrendingUp, Trophy, Sparkles } from 'lucide-react';
import { UserProfile, UserPermissions, Settings as SystemSettings } from '../../types';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

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
  const [expandedMenuId, setExpandedMenuId] = useState<string | "">("");
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

  useEffect(() => {
    const activeParent = menuItems.find(item => 
      item.children?.some(child => child.id === currentView)
    );
    if (activeParent) setExpandedMenuId(activeParent.id);
  }, [currentView, menuItems]);

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-background/95 supports-[backdrop-filter]:bg-background/60 backdrop-blur-xl border-r">
      <div className="p-6 flex justify-between items-center border-b bg-background/50">
        <div>
          <h2 className="text-xl font-extrabold text-primary tracking-tight">ReForma</h2>
          <p className="text-xs text-muted-foreground font-medium">Body & Paint System</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="md:hidden text-muted-foreground"><Menu size={20} /></Button>
      </div>
      
      <div className="flex-grow p-4 overflow-y-auto scrollbar-thin">
        <Accordion type="single" collapsible value={expandedMenuId} onValueChange={setExpandedMenuId} className="w-full space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const isSingleActive = !hasChildren && currentView === item.id;
            const isParentActive = hasChildren && item.children?.some(child => child.id === currentView);

            return (
              <div key={item.id} className="mb-1">
                {!hasChildren ? (
                  <Button 
                    variant={isSingleActive ? "default" : "ghost"}
                    className={cn("w-full justify-start gap-3", isSingleActive ? "shadow-md" : "text-muted-foreground hover:text-primary")}
                    onClick={() => { setCurrentView(item.id); setIsOpen(false); }}
                  >
                    <Icon size={18}/> {item.label}
                  </Button>
                ) : (
                  <AccordionItem value={item.id} className="border-none">
                    <AccordionTrigger className={cn("px-3 py-2 rounded-md hover:bg-accent hover:no-underline transition-all", isParentActive && expandedMenuId !== item.id && "bg-primary/10 text-primary", !isParentActive && "text-muted-foreground")}>
                      <div className="flex items-center gap-3"><Icon size={18}/> {item.label}</div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1 pt-1">
                      <div className="flex flex-col space-y-1 pl-4 border-l ml-4 mt-1 border-border/50">
                        {item.children?.map(child => {
                          const ChildIcon = child.icon;
                          const isChildActive = currentView === child.id;
                          return (
                            <Button
                              key={child.id}
                              variant={isChildActive ? "secondary" : "ghost"}
                              className={cn("w-full justify-start gap-3 h-9 font-normal", isChildActive ? "font-semibold text-primary" : "text-muted-foreground")}
                              onClick={() => { setCurrentView(child.id); setIsOpen(false); }}
                            >
                              <ChildIcon size={16} className={isChildActive ? "text-primary" : "opacity-70"}/> {child.label}
                            </Button>
                          )
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}
              </div>
            )
          })}
        </Accordion>
      </div>

      <div className="p-4 border-t bg-background/50 space-y-3">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3 overflow-hidden">
            <Avatar className="h-9 w-9 border shadow-sm">
              <AvatarFallback className="bg-primary/10 text-primary"><User size={18}/></AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-foreground truncate max-w-[120px]">{userData.displayName || userData.email || 'User'}</p>
              <p className="text-xs text-muted-foreground truncate capitalize font-medium">{userPermissions.role}</p>
            </div>
          </div>
          <Button variant={currentView === 'settings' ? "secondary" : "ghost"} size="icon" onClick={() => { setCurrentView('settings'); setIsOpen(false); }} title={t('settings')} className="rounded-full">
            <Settings size={18} />
          </Button>
        </div>
        <Button variant="ghost" className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onLogout}>
          <LogOut size={16}/> {t('logout')}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left" className="p-0 w-72 md:hidden border-r-0 [&>button]:hidden">
          <SheetTitle className="sr-only">Navigasi Utama</SheetTitle>
          <SidebarContent />
        </SheetContent>
      </Sheet>

      <aside className="hidden md:flex h-screen w-64 flex-col z-30 sticky top-0 left-0">
        <SidebarContent />
      </aside>
    </>
  );
};

export default Sidebar;
