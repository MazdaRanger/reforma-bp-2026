
import { Timestamp } from 'firebase/firestore';

export interface ProductionLog {
  stage: string;
  timestamp: any;
  user: string;
  note?: string;
  type: 'progress' | 'rework';
}

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  recipientId?: string | null; // Added: If null/undefined = Global, otherwise = Private UID
  createdAt: any;
}

export interface MechanicAssignment {
  name: string;
  stage: string;
  assignedAt: string;
  panelCount?: number; // Added specific panel count per mechanic
}

export interface Settings {
  workshopName: string;
  workshopAddress: string;
  workshopPhone: string;
  workshopEmail: string;
  ppnPercentage: number;
  monthlyTarget: number;
  weeklyTarget: number;
  mechanicPanelRate: number; // Added wage rate per panel
  afterServiceFollowUpDays: number;
  nationalHolidays: string[];
  mechanicNames: string[];
  serviceAdvisors: string[];
  insuranceOptions: { name: string; jasa: number; part: number }[];
  specialColorRates: { colorName: string; surchargePerPanel: number }[]; 
  statusKendaraanOptions: string[];
  statusPekerjaanOptions: string[];
  userRoles: Record<string, string>;
  roleOptions: string[];
  workshopBankAccounts: { bankName: string; accountNumber: string; accountHolder: string }[];
  whatsappTemplates: {
    bookingReminder: string;
    afterService: string;
    readyForPickup: string;
    promoBroadcast?: string;
  };
  csiIndicators: string[]; 
  carBrands: string[]; 
  carModels: string[]; 
  carColors: string[]; 
  whatsappConfig?: {
    mode: 'API' | 'MANUAL';
    waApiKey?: string;
    waProvider?: 'Whacenter' | 'Fonnte' | 'Lainnya';
  };
  taxProfile?: 'UMKM' | 'UMUM';
  fixedPph25Amount?: number;
  language: 'id' | 'en'; 
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  jobdesk?: string;
  role?: string;
}

export interface UserPermissions {
  role: string;
  hasFinanceAccess: boolean;
}

export interface ServiceMasterItem {
  id: string;
  serviceCode?: string; 
  serviceName: string;
  workType: 'KC' | 'GTC' | 'BP' | 'Lainnya'; 
  panelValue: number; 
  basePrice: number;
  createdAt?: any;
}

export interface EstimateItem {
  name: string;
  price: number;
  qty?: number;
  number?: string; 
  inventoryId?: string | null;
  panelCount?: number;
  workType?: string;
  hasArrived?: boolean;
  isOrdered?: boolean;
  isIndent?: boolean;
  indentETA?: string;
  // PRICE MISMATCH CONTROL
  isPriceMismatch?: boolean;
  mismatchSuggestedPrice?: number;
}

export interface InsuranceLog {
  date: string;
  user: string;
  note: string;
}

export interface EstimateData {
  estimationNumber?: string;
  grandTotal: number;
  jasaItems: EstimateItem[];
  partItems: EstimateItem[];
  discountJasa: number;
  discountPart: number;
  discountJasaAmount: number;
  discountPartAmount: number;
  ppnAmount: number;
  subtotalJasa: number;
  subtotalPart: number;
  invoiceCancelReason?: string;
  estimatorName?: string;
}

export interface UsageLogItem {
  itemId: string;
  itemName: string;
  itemCode: string;
  qty: number;
  inputQty?: number;
  inputUnit?: string;
  costPerUnit: number;
  totalCost: number;
  category: 'sparepart' | 'material';
  notes?: string;
  issuedAt: string;
  issuedBy: string;
  refPartIndex?: number; 
}

export interface SpklItem {
  id: string;
  taskName: string;
  vendorName: string;
  cost: number;
  hasPph23: boolean;
  pph23Amount: number;
  status: 'Open' | 'Closed';
  createdAt: string;
  closedAt?: string | null;
  notes?: string;
}

export interface CostData {
  hargaModalBahan: number;
  hargaBeliPart: number;
  jasaExternal: number;
}

export interface Job {
  id: string;
  unitId?: string; 
  policeNumber: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerKelurahan?: string;
  customerKecamatan?: string;
  customerKota?: string;
  customerProvinsi?: string;
  
  carBrand: string;
  carModel: string;
  warnaMobil: string;
  nomorRangka?: string;
  nomorMesin?: string;
  tahunPembuatan?: string;
  
  namaAsuransi: string;
  nomorPolis?: string;
  asuransiExpiryDate?: string;
  
  statusKendaraan: string;
  statusPekerjaan: string;
  posisiKendaraan: string;
  jumlahPanel: number; 
  
  tanggalMasuk: string; 
  tanggalEstimasiSelesai?: string;
  actualStartDate?: string; 
  isVVIP?: boolean; 
  tanggalBooking?: string; 
  
  woNumber?: string;
  namaSA?: string;
  mechanicName?: string; 
  assignedMechanics?: MechanicAssignment[]; 
  
  estimateData?: EstimateData;
  hargaJasa?: number;
  hargaPart?: number;
  
  costData?: CostData;
  usageLog?: UsageLogItem[];
  spklItems?: SpklItem[];
  
  insuranceNegotiationLog?: InsuranceLog[];
  productionLogs?: ProductionLog[]; 
  
  isClosed: boolean;
  closedAt?: any; 
  hasInvoice?: boolean;
  invoiceNumber?: string; 
  
  createdAt?: any; 
  updatedAt?: any; 
  isDeleted?: boolean;

  crcFollowUpStatus?: 'Pending' | 'Contacted' | 'Unreachable';
  crcFollowUpDate?: any;
  customerRating?: number;
  customerFeedback?: string;
  csiResults?: Record<string, number>; 

  // KPI & CONTACT TRACKING FIELDS
  isBookingContacted?: boolean;
  bookingSuccess?: boolean;
  bookingEntryDate?: string;
  
  isPickupContacted?: boolean;
  pickupPromiseDate?: string; // Tgl Janji Pengambilan
  pickupSuccess?: boolean;    // KPI Hit: Actual pickup date == Promise date
  
  isServiceContacted?: boolean;
}

// STRICT SEPARATION: Vehicle Master only holds static identity data
export interface Vehicle {
  id: string;
  policeNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerKelurahan?: string;
  customerKecamatan?: string;
  customerKota?: string;
  customerProvinsi?: string;
  carBrand: string;
  carModel: string;
  warnaMobil: string;
  nomorRangka?: string;
  nomorMesin?: string;
  tahunPembuatan?: string;
  namaAsuransi: string;
  nomorPolis?: string;
  asuransiExpiryDate?: string;
  isDeleted?: boolean;
  createdAt?: any;
}

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  brand?: string;
  category: 'sparepart' | 'material';
  stock: number;
  unit: string;
  minStock?: number;
  buyPrice: number;
  sellPrice: number;
  location?: string;
  isStockManaged?: boolean; 
  // VENDOR MANAGED INVENTORY LINKS
  supplierId?: string;
  supplierName?: string;
  
  createdAt?: any;
  updatedAt?: any;
}

export interface Supplier {
  id: string;
  name: string;
  category: 'Sparepart' | 'Bahan' | 'Jasa Luar' | 'Umum';
  phone?: string;
  address?: string;
}

export interface PurchaseOrderItem {
  code: string;
  name: string;
  brand?: string;
  category: 'sparepart' | 'material';
  qty: number;
  qtyReceived?: number;
  unit: string;
  price: number;
  total: number;
  inventoryId?: string | null;
  refJobId?: string;
  refWoNumber?: string;
  refPartIndex?: number;
  isIndent?: boolean;
  isStockManaged?: boolean;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: 'Draft' | 'Pending Approval' | 'Ordered' | 'Partial' | 'Received' | 'Rejected' | 'Cancelled';
  items: PurchaseOrderItem[];
  notes?: string;
  hasPpn: boolean;
  subtotal: number;
  ppnAmount: number;
  totalAmount: number;
  paidAmount?: number; 
  remaining?: number; 
  
  createdBy: string;
  createdAt: any;
  approvedBy?: string;
  approvedAt?: any;
  receivedBy?: string;
  receivedAt?: any;
  rejectionReason?: string;
  lastModified?: any;
  date?: any;
}

export interface CashierTransaction {
  id: string;
  date: any; 
  type: 'IN' | 'OUT';
  category: string;
  amount: number;
  paymentMethod: 'Cash' | 'Transfer' | 'EDC' | 'Non-Tunai (Pajak)';
  bankName?: string;
  description?: string;
  customerName?: string; 
  refNumber?: string; 
  refJobId?: string;
  refPoId?: string;
  
  transactionNumber?: string; 
  taxCertificateNumber?: string;
  
  createdBy: string;
  createdAt: any;
}

export interface Asset {
  id: string;
  name: string;
  category: string;
  purchasePrice: number;
  purchaseDate: string | Date; 
  usefulLifeYears: number;
  residualValue: number;
  monthlyDepreciation: number;
  status: 'Active' | 'Sold' | 'Disposed';
  createdAt: any;
}
