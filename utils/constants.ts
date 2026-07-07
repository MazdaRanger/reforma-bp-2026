
import { Settings, Job } from '../types';

export const carBrands = ["Mazda", "Toyota", "Honda", "Mitsubishi", "Suzuki", "Daihatsu", "Nissan", "Hyundai", "Wuling", "BMW", "Mercedes-Benz", "Lainnya"];
export const mazdaModels = ["Mazda 2", "Mazda 2 HB", "Mazda 3", "Mazda 3 HB", "Mazda 6", "Mazda CX-3", "Mazda CX-30", "Mazda CX-5", "Mazda CX-60", "Mazda CX-8", "Mazda CX-9", "Mazda MX-5", "Mazda CX-80 (PHEV)", "Mazda MX-30 EV", "Mazda Biante", "Lainnya"];
export const mazdaColors = ["Soul Red", "Soul Red Crystal Metallic", "Machine Gray Metallic", "Polymetal Gray Metallic", "Snowflake White Pearl Mica", "Jet Black Mica", "Deep Crystal Blue Mica", "Platinum Quartz Metallic", "Zircon Sand Metallic", "Rhodium White Premium", "Artisan Red Metallic", "Melting Cooper Metallic", "Lainnya"];
export const posisiKendaraanOptions = ["Di Pemilik", "Di Bengkel"];
export const jobdeskOptions = ["Service Advisor", "Admin Bengkel", "CRC", "Foreman", "Manager", "Partman", "Ass. Partman"].sort();

export const initialSettingsState: Settings = {
    workshopName: "REFORMA BODY & PAINT",
    workshopAddress: "Jl. Pangeran Antasari No. 12, Jakarta Selatan",
    workshopPhone: "(021) 750-9999",
    workshopEmail: "service@reforma.com",
    
    ppnPercentage: 11,
    monthlyTarget: 600000000,
    weeklyTarget: 150000000,
    mechanicPanelRate: 40000, // Default Wage Rate
    afterServiceFollowUpDays: 3,
    nationalHolidays: [],
    mechanicNames: ["Mekanik A", "Mekanik B", "Mekanik C", "Mekanik D"].sort(),
    serviceAdvisors: [],
    insuranceOptions: [
        { name: "ABDA / OONA Ins", jasa: 10, part: 5 }, { name: "ACA Insurance", jasa: 10, part: 7.5 },
        { name: "BCA Insurance", jasa: 10, part: 5 }, { name: "Garda Oto Ins", jasa: 10, part: 5 },
        { name: "Umum / Pribadi", jasa: 10, part: 5 }, { name: "Lainnya", jasa: 10, part: 5 }
    ],
    specialColorRates: [
        { colorName: "Soul Red Crystal Metallic", surchargePerPanel: 1500000 },
        { colorName: "Machine Gray Metallic", surchargePerPanel: 1000000 }
    ],
    csiIndicators: [
        "Kualitas Hasil Perbaikan",
        "Kecepatan Waktu Pengerjaan",
        "Keramahan Petugas & SA",
        "Kebersihan Kendaraan",
        "Kejelasan Informasi Biaya"
    ],
    carBrands: [...carBrands],
    carModels: [...mazdaModels],
    carColors: [...mazdaColors],
    statusKendaraanOptions: [
        "Tunggu Estimasi", 
        "Tunggu SPK Asuransi", 
        "Banding Harga SPK", 
        "Unit di Pemilik (Tunggu Part)", 
        "Booking Masuk", 
        "Work In Progress", 
        "Unit Rawat Jalan", 
        "Selesai (Tunggu Pengambilan)", 
        "Sudah Diambil Pemilik"
    ],
    statusPekerjaanOptions: ["Belum Mulai Perbaikan", "Las Ketok", "Bongkar", "Dempul", "Cat", "Poles", "Pemasangan", "Finishing", "Quality Control", "Tunggu Part", "Selesai"],
    userRoles: {},
    roleOptions: ["Manager", "Service Advisor", "Admin Bengkel", "Foreman", "Sparepart", "Staff", "CRC"],
    workshopBankAccounts: [], 
    whatsappTemplates: {
        bookingReminder: "Halo Bpk/Ibu {nama}, kami mengonfirmasi jadwal booking perbaikan {mobil} ({nopol}) pada tanggal {tgl_booking}. Mohon kehadirannya tepat waktu di ReForma. Terima kasih.",
        afterService: "Halo Bpk/Ibu {nama}, terima kasih telah mempercayakan perbaikan {mobil} di ReForma. Bagaimana hasil perbaikannya? Mohon luangkan waktu untuk memberi penilaian.",
        readyForPickup: "Kabar Gembira! Kendaraan {mobil} ({nopol}) milik Bpk/Ibu {nama} sudah selesai diperbaiki dan siap diambil. Terima kasih."
    },
    language: 'id'
};
