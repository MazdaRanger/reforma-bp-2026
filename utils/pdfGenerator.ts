
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Job, EstimateData, Settings, PurchaseOrder, PurchaseOrderItem, CashierTransaction } from '../types';
import { formatCurrency, formatDateIndo } from './helpers';

// Helper for standard B&W Header
const addHeader = (doc: any, settings: Settings) => {
  const pageWidth = doc.internal.pageSize.width;
  const wsName = settings.workshopName || "REFORMA BODY & PAINT";
  const wsAddress = settings.workshopAddress || "Jl. Pangeran Antasari No. 12, Jakarta Selatan";
  const wsPhone = settings.workshopPhone || "(021) 750-9999";
  const wsEmail = settings.workshopEmail || "service@reforma.com";

  // Left Side: Company Info
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0); // Black
  doc.text(wsName, 15, 20);
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(wsAddress, 15, 25);
  doc.text(`Telp: ${wsPhone} | Email: ${wsEmail}`, 15, 29);
  
  // Bottom Line
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(15, 34, pageWidth - 15, 34);
};

export const generateEstimationPDF = (job: Job, estimateData: EstimateData, settings: Settings, creatorName?: string) => {
  const doc: any = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  addHeader(doc, settings);

  const isWO = !!job.woNumber;
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  // Position aligned with header text but on the right
  doc.text(isWO ? "WORK ORDER" : "ESTIMASI BIAYA", pageWidth - 15, 20, { align: 'right' });
  
  doc.setFontSize(10);
  doc.text(isWO ? `#${job.woNumber}` : `#${estimateData.estimationNumber || 'DRAFT'}`, pageWidth - 15, 25, { align: 'right' });
  doc.text(formatDateIndo(new Date()), pageWidth - 15, 29, { align: 'right' });

  // Standard formatting for Estimations
  doc.setFillColor(245, 247, 250);
  doc.rect(15, 40, pageWidth - 30, 28, 'F');
  
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("DATA PELANGGAN", 20, 46);
  doc.setFont("helvetica", "normal");
  doc.text(`Nama: ${job.customerName}`, 20, 52);
  doc.text(`Telp: ${job.customerPhone || '-'}`, 20, 57);
  doc.text(`Asuransi: ${job.namaAsuransi}`, 20, 62);
  
  const rightColX = pageWidth / 2 + 10;
  doc.setFont("helvetica", "bold");
  doc.text("DATA KENDARAAN", rightColX, 46);
  doc.setFont("helvetica", "normal");
  doc.text(`No. Polisi: ${job.policeNumber}`, rightColX, 52);
  doc.text(`Merk: ${job.carBrand || 'Mazda'} - ${job.carModel}`, rightColX, 57);
  doc.text(`Warna: ${job.warnaMobil}`, rightColX, 62);
  
  let currentY = 75;
  doc.setFont("helvetica", "bold");
  doc.text("A. JASA PERBAIKAN", 15, currentY);
  autoTable(doc, {
    startY: currentY + 2,
    head: [['No', 'Jenis', 'Uraian Pekerjaan', 'Biaya (Rp)']],
    body: estimateData.jasaItems.map((item, idx) => [idx + 1, item.workType || '-', item.name, formatCurrency(item.price)]),
    theme: 'plain',
    headStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 15, halign: 'center' }, 3: { cellWidth: 40, halign: 'right' } }
  });

  currentY = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.text("B. SPAREPART & BAHAN", 15, currentY);
  autoTable(doc, {
    startY: currentY + 2,
    head: [['No', 'No. Part', 'Nama Sparepart', 'Qty', 'Harga @', 'Total (Rp)']],
    body: estimateData.partItems.map((item, idx) => [idx + 1, item.number || '-', item.name, item.qty || 1, formatCurrency(item.price), formatCurrency((item.price || 0) * (item.qty || 1))]),
    theme: 'plain',
    headStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 3: { cellWidth: 15, halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
  });

  currentY = doc.lastAutoTable.finalY + 10;
  if (currentY > 200) { doc.addPage(); currentY = 20; }
  
  const labelX = pageWidth - 90;
  const valX = pageWidth - 15;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  
  // Totals
  doc.text("Total Jasa:", labelX, currentY);
  doc.text(formatCurrency(estimateData.subtotalJasa), valX, currentY, { align: 'right' });
  currentY += 5;

  if (estimateData.discountJasaAmount > 0) {
    doc.text(`Diskon Jasa (${estimateData.discountJasa}%):`, labelX, currentY);
    doc.text(`- ${formatCurrency(estimateData.discountJasaAmount)}`, valX, currentY, { align: 'right' });
    currentY += 5;
  }

  doc.text("Total Sparepart:", labelX, currentY);
  doc.text(formatCurrency(estimateData.subtotalPart), valX, currentY, { align: 'right' });
  currentY += 5;

  if (estimateData.discountPartAmount > 0) {
    doc.text(`Diskon Part (${estimateData.discountPart}%):`, labelX, currentY);
    doc.text(`- ${formatCurrency(estimateData.discountPartAmount)}`, valX, currentY, { align: 'right' });
    currentY += 5;
  }

  doc.text(`PPN (${settings.ppnPercentage}%):`, labelX, currentY);
  doc.text(formatCurrency(estimateData.ppnAmount), valX, currentY, { align: 'right' });
  currentY += 7;

  doc.setDrawColor(0);
  doc.line(labelX, currentY - 4, valX, currentY - 4);
  
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("GRAND TOTAL:", labelX, currentY);
  doc.text(formatCurrency(estimateData.grandTotal), valX, currentY, { align: 'right' });

  const signY = currentY + 30;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Hormat Kami,", 30, signY, {align: 'center'});
  doc.text(`( ${creatorName || 'Admin'} )`, 30, signY + 30, {align: 'center'});
  doc.text("Disetujui Oleh,", pageWidth - 50, signY, {align: 'center'});
  doc.text(`( ${job.customerName} )`, pageWidth - 50, signY + 30, {align: 'center'});

  doc.save(`${isWO ? job.woNumber : (estimateData.estimationNumber || 'ESTIMASI')}_${job.policeNumber}.pdf`);
};

// --- INVOICE (FAKTUR PENAGIHAN) - REVISED LAYOUT ---
export const generateInvoicePDF = (job: Job, settings: Settings) => {
  const doc: any = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  // Use standard header which draws text at 20, 25, 29 and Line at 34
  addHeader(doc, settings);

  // OVERRIDE: Add Invoice Info aligned with the Header Text, ABOVE the line
  doc.setTextColor(0, 0, 0);
  
  // Title aligned with Company Name (Y=20)
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("FAKTUR / INVOICE", pageWidth - 15, 20, { align: 'right' });
  
  // No Invoice aligned with Address (Y=25)
  // USE NEW INVOICE NUMBER FORMAT IF AVAILABLE
  const invNumber = job.invoiceNumber || `INV/${job.woNumber}`;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`No: ${invNumber}`, pageWidth - 15, 25, { align: 'right' });
  
  // Date aligned with Phone (Y=29)
  doc.text(`Tgl: ${formatDateIndo(new Date())}`, pageWidth - 15, 29, { align: 'right' });

  // BOX INFO (STROKE ONLY, NO FILL)
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  doc.rect(15, 40, pageWidth - 30, 35); // Start Y=40 (Below the line which is at 34)

  doc.setFontSize(9);
  
  // Left: Bill To
  doc.setFont("helvetica", "bold");
  doc.text("TAGIHAN KEPADA:", 20, 47);
  doc.setFont("helvetica", "normal");
  doc.text(job.customerName, 20, 52);
  doc.text(job.customerAddress || 'Alamat tidak tersedia', 20, 57);
  doc.text(`Telp: ${job.customerPhone || '-'}`, 20, 62);
  doc.text(job.namaAsuransi !== 'Umum / Pribadi' ? `Asuransi: ${job.namaAsuransi}` : 'Pelanggan Umum', 20, 67);

  // Right: Vehicle Info
  const col2 = pageWidth / 2 + 10;
  doc.setFont("helvetica", "bold");
  doc.text("DATA KENDARAAN:", col2, 47);
  doc.setFont("helvetica", "normal");
  doc.text(`Nopol: ${job.policeNumber}`, col2, 52);
  doc.text(`Merk: ${job.carBrand} ${job.carModel}`, col2, 57);
  doc.text(`Warna: ${job.warnaMobil}`, col2, 62);
  doc.text(`Ref WO: ${job.woNumber}`, col2, 67); // Changed from Rangka to Ref WO

  const estimate = job.estimateData;
  if (!estimate) return;

  // -- SECTION: JASA --
  let currentY = 82;
  doc.setFont("helvetica", "bold");
  doc.text("I. RINCIAN JASA & PEKERJAAN", 15, currentY);
  
  // Table: Plain theme for clean print
  autoTable(doc, {
    startY: currentY + 2,
    head: [['No', 'Jenis', 'Uraian Pekerjaan', 'Biaya (Rp)']],
    body: estimate.jasaItems.map((item, idx) => [idx + 1, item.workType || '-', item.name, formatCurrency(item.price)]),
    theme: 'plain', 
    headStyles: { 
        fillColor: false, 
        textColor: 0, 
        fontStyle: 'bold',
        lineWidth: { bottom: 0.5 }, // Line under header
        lineColor: 0
    },
    bodyStyles: { textColor: 0 },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 15, halign: 'center' }, 3: { cellWidth: 40, halign: 'right' } }
  });

  // -- SECTION: PARTS --
  currentY = doc.lastAutoTable.finalY + 10;
  
  if (estimate.partItems && estimate.partItems.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.text("II. SUKU CADANG (SPAREPARTS)", 15, currentY);
      autoTable(doc, {
        startY: currentY + 2,
        head: [['No', 'Kode Part', 'Nama Sparepart', 'Qty', 'Harga', 'Total']],
        body: estimate.partItems.map((item, idx) => [
            idx + 1, 
            item.number || '-', 
            item.name, 
            item.qty || 1, 
            formatCurrency(item.price), 
            formatCurrency((item.price || 0) * (item.qty || 1))
        ]),
        theme: 'plain',
        headStyles: { 
            fillColor: false, 
            textColor: 0, 
            fontStyle: 'bold',
            lineWidth: { bottom: 0.5 },
            lineColor: 0
        },
        bodyStyles: { textColor: 0 },
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 
            0: { cellWidth: 10, halign: 'center' }, 
            3: { halign: 'center', cellWidth: 15 },
            4: { halign: 'right' }, 
            5: { halign: 'right' } 
        }
      });
      currentY = doc.lastAutoTable.finalY + 10;
  }

  // Check Page Break
  if (currentY > 200) { doc.addPage(); currentY = 20; }

  // -- SUMMARY (Clean Layout) --
  const labelX = pageWidth - 90;
  const valX = pageWidth - 15;
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);

  // Line Separator
  doc.setLineWidth(0.2);
  doc.line(labelX, currentY, pageWidth - 15, currentY);
  currentY += 5;

  doc.text("Total Jasa:", labelX, currentY);
  doc.text(formatCurrency(estimate.subtotalJasa), valX, currentY, { align: 'right' });
  currentY += 5;

  if (estimate.discountJasaAmount > 0) {
      doc.text("Diskon Jasa:", labelX, currentY);
      doc.text(`- ${formatCurrency(estimate.discountJasaAmount)}`, valX, currentY, { align: 'right' });
      currentY += 5;
  }

  doc.text("Total Sparepart:", labelX, currentY);
  doc.text(formatCurrency(estimate.subtotalPart), valX, currentY, { align: 'right' });
  currentY += 5;

  if (estimate.discountPartAmount > 0) {
      doc.text("Diskon Sparepart:", labelX, currentY);
      doc.text(`- ${formatCurrency(estimate.discountPartAmount)}`, valX, currentY, { align: 'right' });
      currentY += 5;
  }

  doc.text("PPN:", labelX, currentY);
  doc.text(formatCurrency(estimate.ppnAmount), valX, currentY, { align: 'right' });
  currentY += 2;

  // GRAND TOTAL (Double Line for accounting style)
  doc.setLineWidth(0.5);
  doc.line(labelX, currentY + 3, pageWidth - 15, currentY + 3);
  doc.line(labelX, currentY + 13, pageWidth - 15, currentY + 13);
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("GRAND TOTAL", labelX, currentY + 9);
  doc.text(formatCurrency(estimate.grandTotal), valX, currentY + 9, { align: 'right' });

  // -- FOOTER PAYMENT INFO --
  currentY += 20;
  if (currentY > 250) { doc.addPage(); currentY = 40; }

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Info Pembayaran:", 15, currentY);
  currentY += 5;
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (settings.workshopBankAccounts && settings.workshopBankAccounts.length > 0) {
      settings.workshopBankAccounts.forEach(bank => {
          doc.text(`• ${bank.bankName} : ${bank.accountNumber} (a/n ${bank.accountHolder})`, 15, currentY);
          currentY += 5;
      });
  } else {
      doc.text("- Hubungi Kasir", 15, currentY);
      currentY += 5;
  }

  // SIGNATURES
  const signY = currentY + 10;
  doc.text("Hormat Kami,", 30, signY, {align: 'center'});
  doc.text("Penerima / Customer,", pageWidth - 50, signY, {align: 'center'});
  
  doc.text("( ........................... )", 30, signY + 25, {align: 'center'});
  doc.text("( ........................... )", pageWidth - 50, signY + 25, {align: 'center'});

  doc.save(`${invNumber.replace(/[\/\\\s]/g, '_')}.pdf`);
};

export const generatePurchaseOrderPDF = (po: PurchaseOrder, settings: Settings, supplierAddress?: string) => {
    const doc: any = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    addHeader(doc, settings);

    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("PURCHASE ORDER", 15, 48);
    
    // Header Info (No PO & Date)
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const infoX = pageWidth - 80;
    
    doc.text("No. PO", infoX, 48);
    doc.text(`: ${po.poNumber}`, infoX + 25, 48);
    
    doc.text("Tanggal", infoX, 53);
    
    // Fix: Fallback if date is missing or invalid (returns '-')
    let dateStr = po.createdAt ? formatDateIndo(po.createdAt) : formatDateIndo(new Date());
    if (dateStr === '-') dateStr = formatDateIndo(new Date());
    
    doc.text(`: ${dateStr}`, infoX + 25, 53);

    // Supplier Section
    doc.setFont("helvetica", "bold");
    doc.text("VENDOR / SUPPLIER:", 15, 65);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(po.supplierName, 15, 70);
    
    // Supplier Address (Wrapped)
    let addressHeight = 0;
    if (supplierAddress) {
        doc.setFontSize(9);
        doc.setTextColor(50); // Slightly darker for readability
        // Wrap text to width of 80mm
        const splitAddress = doc.splitTextToSize(supplierAddress, 80);
        doc.text(splitAddress, 15, 75);
        addressHeight = splitAddress.length * 4;
    }

    // Items Table
    // Adjust start position if address is long
    const tableStartY = supplierAddress ? (75 + addressHeight + 5) : 80;
    
    autoTable(doc, {
        startY: tableStartY,
        head: [['No', 'Kode Part', 'Deskripsi Barang', 'Qty', 'Harga Satuan', 'Total']],
        body: po.items.map((item, idx) => [
            idx + 1, 
            item.code, 
            item.brand ? `${item.name} (${item.brand})` : item.name, 
            `${item.qty} ${item.unit}`, 
            formatCurrency(item.price), 
            formatCurrency(item.total)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [52, 73, 94], fontStyle: 'bold' },
        styles: { fontSize: 9 },
        columnStyles: { 
            0: { cellWidth: 10, halign: 'center' }, 
            3: { halign: 'center' }, 
            4: { halign: 'right' }, 
            5: { halign: 'right' } 
        }
    });

    let finalY = doc.lastAutoTable.finalY + 10;
    doc.setTextColor(0);
    
    // Grand Total
    doc.setFont("helvetica", "bold");
    doc.text("GRAND TOTAL:", pageWidth - 90, finalY);
    doc.text(formatCurrency(po.totalAmount), pageWidth - 15, finalY, { align: 'right' });

    // Signatures
    let signY = finalY + 30;
    // Check if enough space for signatures, if not add page
    if (signY > 260) {
        doc.addPage();
        signY = 40;
    }

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    
    // Left Signature (Created By)
    doc.text("Diajukan Oleh,", 30, signY, { align: 'center' });
    
    // Right Signature (Approved By)
    doc.text("Disetujui Oleh,", pageWidth - 50, signY, { align: 'center' });

    doc.setFont("helvetica", "normal");
    
    // Names (Or Roles if names unavailable)
    const creator = po.createdBy || 'Partman';
    const approver = po.approvedBy || 'Manager';
    
    doc.text(`( ${creator} )`, 30, signY + 25, { align: 'center' });
    doc.text(`( ${approver} )`, pageWidth - 50, signY + 25, { align: 'center' });

    doc.save(`${po.poNumber}.pdf`);
};

export const generateReceivingReportPDF = (po: PurchaseOrder, receivedItems: {item: PurchaseOrderItem, qtyReceivedNow: number}[], settings: Settings, receiverName: string) => {
    const doc: any = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    addHeader(doc, settings);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("BUKTI SERAH TERIMA BARANG", pageWidth / 2, 45, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Ref PO: ${po.poNumber}`, 15, 55);
    doc.text(`Supplier: ${po.supplierName}`, 15, 60);
    
    // Added Date
    const todayStr = formatDateIndo(new Date());
    doc.text(`Tanggal: ${todayStr}`, pageWidth - 15, 55, { align: 'right' });
    
    doc.text(`Pencatat: ${receiverName}`, pageWidth - 15, 60, { align: 'right' });

    autoTable(doc, {
        startY: 70,
        head: [['No', 'Kode Part', 'Deskripsi Barang', 'Qty Diterima']],
        body: receivedItems.map((entry, idx) => [idx + 1, entry.item.code, entry.item.brand ? `${entry.item.name} (${entry.item.brand})` : entry.item.name, `${entry.qtyReceivedNow} ${entry.item.unit}`]),
        theme: 'striped',
        headStyles: { fillColor: [52, 73, 94] }
    });
    
    // Added Signatures
    let finalY = doc.lastAutoTable.finalY + 20;
    
    // Check for page break
    if (finalY > 250) {
        doc.addPage();
        finalY = 40;
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    
    // Left: Supplier
    doc.text("Diserahkan Oleh,", 40, finalY, { align: 'center' });
    
    // Right: Warehouse/Sparepart (Receiver)
    doc.text("Diterima Oleh,", pageWidth - 40, finalY, { align: 'center' });

    doc.setFont("helvetica", "normal");
    
    // Names
    doc.text(`( ${po.supplierName} )`, 40, finalY + 25, { align: 'center' });
    doc.text(`( ${receiverName} )`, pageWidth - 40, finalY + 25, { align: 'center' });

    doc.save(`BST_${po.poNumber}_${new Date().getTime()}.pdf`);
};

// --- GATE PASS TICKET (A5 LANDSCAPE) ---
export const generateGatePassPDF = (job: Job, settings: Settings, cashierName: string) => {
    // A5 Landscape
    const doc: any = new jsPDF('l', 'mm', 'a5');
    const pageWidth = doc.internal.pageSize.width; // 210mm
    const pageHeight = doc.internal.pageSize.height; // 148mm
    
    // Header
    addHeader(doc, settings);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("SURAT JALAN KELUAR (GATE PASS)", pageWidth / 2, 45, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const today = formatDateIndo(new Date());
    doc.text(`Tanggal: ${today}`, pageWidth - 15, 45, { align: 'right' });

    // Box Info Kendaraan
    const boxY = 55;
    const boxHeight = 45;
    const boxWidth = pageWidth - 30; // 15mm margin each side
    
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(15, boxY, boxWidth, boxHeight);

    // Layout inside box: 2 Columns
    const col1X = 20;
    const col2X = pageWidth / 2 + 5;
    const rowHeight = 7;
    let currentY = boxY + 10;

    // Col 1
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`NOPOL : ${job.policeNumber}`, col1X, currentY);
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Kendaraan : ${job.carBrand || 'Unit'} ${job.carModel}`, col1X, currentY + rowHeight);
    doc.text(`Warna : ${job.warnaMobil}`, col1X, currentY + (rowHeight * 2));

    // Col 2
    doc.text(`Pemilik : ${job.customerName}`, col2X, currentY);
    doc.text(`No. WO : ${job.woNumber}`, col2X, currentY + rowHeight);
    
    // Status
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("STATUS: LUNAS / SELESAI", pageWidth / 2, boxY + boxHeight + 15, { align: 'center' });

    // Signatures
    const signY = pageHeight - 30;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    
    doc.text("Dikeluarkan Oleh (Kasir),", 40, signY, { align: 'center' });
    doc.text("Security / Gate,", pageWidth - 40, signY, { align: 'center' });

    doc.setFont("helvetica", "normal");
    doc.text(`( ${cashierName || 'Staff'} )`, 40, signY + 20, { align: 'center' });
    doc.text("( ........................... )", pageWidth - 40, signY + 20, { align: 'center' });

    doc.setFontSize(8);
    doc.text("* Harap serahkan tiket ini ke petugas keamanan saat keluar.", pageWidth / 2, pageHeight - 5, { align: 'center' });

    doc.save(`GATEPASS_${job.policeNumber}.pdf`);
};

// --- RECEIPT / BUKTI TRANSAKSI ---
export const generateReceiptPDF = (trx: CashierTransaction, settings: Settings) => {
    const doc: any = new jsPDF('l', 'mm', 'a5'); // Landscape A5
    const pageWidth = doc.internal.pageSize.width;
    
    // Header Custom for Receipt
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(settings.workshopName || "REFORMA", 10, 15);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(settings.workshopAddress || "", 10, 20);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(trx.type === 'IN' ? "BUKTI KAS MASUK (BKM)" : "BUKTI KAS KELUAR (BKK)", pageWidth - 10, 15, { align: 'right' });
    
    doc.setFontSize(10);
    doc.text(`No. Dokumen: ${trx.transactionNumber || 'TRX-PENDING'}`, pageWidth - 10, 22, { align: 'right' });
    doc.text(`Tanggal: ${formatDateIndo(trx.date)}`, pageWidth - 10, 27, { align: 'right' });

    doc.line(10, 32, pageWidth - 10, 32);

    const startY = 45;
    const lineHeight = 10;

    doc.setFontSize(11);
    doc.text(trx.type === 'IN' ? "Telah Terima Dari" : "Dibayarkan Kepada", 15, startY);
    doc.text(`:  ${trx.customerName || '-'}`, 55, startY);

    doc.text("Uang Sejumlah", 15, startY + lineHeight);
    doc.setFont("helvetica", "bold");
    doc.text(`:  ${formatCurrency(trx.amount)}`, 55, startY + lineHeight);
    doc.setFont("helvetica", "normal");

    doc.text("Keterangan / Ref", 15, startY + (lineHeight * 2));
    doc.text(`:  ${trx.category} - ${trx.description || ''}`, 55, startY + (lineHeight * 2));
    if(trx.refNumber) {
        doc.text(`   (Ref ID: ${trx.refNumber})`, 55, startY + (lineHeight * 2) + 5);
    }

    doc.text("Metode / Bank", 15, startY + (lineHeight * 3) + 5);
    const paymentInfo = trx.bankName ? `${trx.paymentMethod} - ${trx.bankName}` : trx.paymentMethod;
    doc.text(`:  ${paymentInfo}`, 55, startY + (lineHeight * 3) + 5);

    // Box Amount
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(15, 105, 60, 15);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrency(trx.amount), 45, 114, { align: 'center' });

    // Signature
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Kasir / Finance,", pageWidth - 40, 105, { align: 'center' });
    doc.text(`( ${trx.createdBy || 'Admin'} )`, pageWidth - 40, 130, { align: 'center' });

    doc.save(`${trx.transactionNumber || 'RECEIPT'}.pdf`);
};
