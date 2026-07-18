# Reforma BP - System Workflow & Architecture Walkthrough

Dokumen ini adalah dokumentasi hidup (*living documentation*) yang menjelaskan secara rinci proses operasional dari awal hingga akhir (*end-to-end*) beserta seluruh logika yang ditanamkan dalam sistem Reforma Body & Paint (ERP). 

Dokumen ini harus selalu diperbarui setiap kali ada penambahan atau perubahan fitur utama.

---

## 1. Fase Penerimaan & Estimasi (Service Advisor / Estimator)
Proses bermula ketika kendaraan pelanggan masuk ke bengkel.

- **Entry Data:** SA/Estimator memasukkan data pelanggan dan kendaraan melalui menu **Input Data**.
- **Pembuatan Estimasi:** 
  - Di menu **Estimasi**, SA merinci kerusakan, membuat daftar pekerjaan **Jasa** (berdasarkan jumlah panel) dan daftar kebutuhan **Sparepart** atau **Bahan**.
  - Estimasi ini menjadi cikal bakal terbentuknya **SPK (Surat Perintah Kerja)**.
- **Tanda Terima & SPK:** Setelah disetujui, sistem mencetak SPK dan Tanda Terima Kendaraan. Jika kendaraan masuk melalui jalur Asuransi, kendaraan masuk ke fase Administrasi.

---

## 2. Fase Administrasi & Claim Control (Admin Asuransi)
Modul **Admin Claim Control** berfungsi sebagai *pipeline* khusus untuk memonitor kendaraan asuransi sebelum masuk ke area produksi.

- **Status Hurdle (Rintangan):** Kendaraan melewati berbagai status administratif seperti:
  - *Tunggu Estimasi*
  - *Tunggu SPK Asuransi*
  - *Banding Harga SPK*
  - *Unit di Pemilik (Tunggu Part)*
  - *Booking Masuk*
- Selama kendaraan berada di status ini, kendaraan secara fisik berada di bengkel atau di pemilik, namun **tidak akan muncul di Papan Produksi (Kanban)** kecuali masuk ke kolom khusus "Persiapan Kendaraan" atau setelah statusnya berubah menjadi *Work In Progress*.
- **Unit Keluar Rawat Jalan:** Papan kontrol ini juga memonitor ketersediaan part bagi kendaraan yang sudah keluar bengkel melalui Gatepass Rawat Jalan (Hutang Part).

---

## 3. Fase Produksi (Foreman / Job Control)
Setelah administrasi selesai, kendaraan masuk ke modul **Job Control Produksi (Kanban Board)**.

- **Kanban Stages:** Kendaraan bergerak secara linear melalui tahap: `Bongkar` -> `Ketok/Las` -> `Dempul` -> `Epoxy` -> `Cat` -> `Poles` -> `Pemasangan` -> `Finishing` -> `Quality Control`.
- **Penugasan Mekanik (Assignment):** Foreman menugaskan mekanik ke stall tertentu. Sistem secara otomatis **membagi rata jumlah panel** kepada mekanik yang bertugas di stall tersebut.
- **Deadline Monitoring:** Sistem membaca "Tanggal Janji Selesai" (Target Date). 
  - Jika H-2 sebelum target, muncul ikon peringatan **Segitiga Oranye**. 
  - Jika melebihi tanggal target, muncul ikon **Segitiga Merah (Pulse)**.
- **Minimize Mekanik UI:** Foreman dapat mengecilkan panel daftar mekanik untuk memperlebar area pandang Papan Kanban.
- **Re-entry Rawat Jalan:** Mobil yang sebelumnya berstatus "Rawat Jalan" akan **muncul kembali** di kolom "Persiapan Kendaraan" secara otomatis ketika Partman menyatakan sparepart-nya sudah *Ready* di Gudang.

---

## 4. Fase Gudang & Inventory (Partman)
Gudang berjalan secara paralel dan independen dari Papan Produksi.

- **Antrean Pembebanan (WIP Parts):** Terdapat 2 layar terpisah untuk **Bahan** dan **Sparepart**. 
  - Kolom I: Daftar kendaraan yang belum dibebankan / hutang part.
  - Kolom II: Daftar kendaraan yang part-nya sudah dibebankan (Issued).
- **Logika Independen Gudang:** Meskipun sebuah kendaraan sudah selesai difaktur (Invoicing), jika sistem mendeteksi ada Part yang statusnya masih *Indent/On Order* (Belum Datang), kendaraan tersebut akan **tetap bertahan** di Antrean Gudang (Kolom I) sampai Partman melakukan pembebanan.
- **Logistic Status:** Ketersediaan stok dilacak per-SPK dengan status: *Ready All*, *Partial*, *Indent*, atau *On Order*.

---

## 5. Fase Keuangan & Penagihan (Finance / Cashier)
Proses penyelesaian dokumen administrasi bengkel dan pembayaran.

- **Invoicing (Pembuatan Faktur):** 
  - Berisi daftar kendaraan WIP (Monitor Produksi) yang siap ditagih. 
  - **Logika Kunci Faktur:** Sistem akan **MENGUNCI MATI** tombol cetak faktur jika terdeteksi masih ada Sparepart yang belum di-*issued* / dipasang. Jika ada selisih harga dari estimasi awal, sistem juga memunculkan peringatan kuning (*Review SA*).
  - Terdapat pop-up peringatan keras jika sebuah SPK sama sekali belum membebankan part/bahan.
  - Urutan antrean Invoicing diurutkan secara otomatis dengan status **"READY INVOICE"** berada paling atas.
- **Cashier (Kasir & Gatepass):**
  - Mengelola Bukti Kas Masuk (BKM) dan Bukti Kas Keluar (BKK).
  - Melacak pembayaran parsial, DP, dan pelunasan SPK.
  - **Fitur Gatepass (Surat Keluar):** Mencetak surat jalan agar mobil bisa keluar dari gerbang bengkel.

### LOGIKA "RAWAT JALAN" (Closed-Loop System)
Ini adalah salah satu fitur paling kompleks di dalam sistem:
1. **Kendaraan Selesai, Part Belum Lengkap:** Invoicing menolak pembuatan faktur (Dikunci).
2. **Gatepass Rawat Jalan:** Kasir mencetak Gatepass dengan mencentang opsi **"Unit Keluar Rawat Jalan"**. Mobil keluar fisik, Faktur ditangguhkan, Mobil hilang dari Papan Produksi.
3. **Papan Admin Claim:** Mobil terpantau di papan "Unit Keluar Rawat Jalan" beserta status indikator Part-nya.
4. **Part Datang (Re-Entry):** Gudang menerima part. Status menjadi `PART LENGKAP / READY`.
5. **CRC & Produksi Menerima Sinyal:** 
   - Mobil **muncul di Dashboard CRC** untuk ditelpon kembali (Status: Rawat Jalan - Fitter).
   - Mobil **muncul di Papan Produksi** (Persiapan Kendaraan) agar Foreman menyiapkan mekanik.
6. **Closing:** Pelanggan datang, part dipasang, Gudang membebankan part, Invoicing terbuka, Faktur dicetak.

---

## 6. Fase Customer Relation (CRC)
Modul untuk kepuasan pelanggan dan tindak lanjut *aftersales*.

- **Potensi Booking:** Memantau unit-unit yang part-nya sudah lengkap (termasuk unit Rawat Jalan) untuk dijadwalkan masuk bengkel.
- **Follow Up:** Melacak mobil yang sudah keluar bengkel (Selesai). CRC bertugas menghubungi pelanggan untuk menanyakan tingkat kepuasan, dan hasil rekaman ini menjadi bagian dari KPI perusahaan.

---
*Terakhir Diperbarui: Juli 2026*
