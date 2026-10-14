# Petunjuk Teknis BooCash

Panduan ini menjelaskan alur penggunaan BooCash saat ini, termasuk pencatatan, dashboard, anggaran, wishlist, penyesuaian saldo, dan pemulihan dari kesalahan.

## 1. Sebelum menggunakan aplikasi

Pastikan hal berikut sudah benar:

- Aplikasi terhubung ke project Supabase yang benar melalui `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
- Migration `supabase/migrations/202610140001_financial_transactions.sql` sudah dijalankan di Supabase SQL Editor.
- Untuk transfer setoran wishlist ke rekening tabungan, migration lanjutan `supabase/migrations/202610140002_wishlist_savings_transfer.sql` juga harus dijalankan.
- Migration `supabase/migrations/202610140003_emergency_fund_transactions.sql` adalah implementasi lama dana darurat sebagai transfer. Jika sudah pernah dijalankan, biarkan saja; migration 006 menggantikan perilakunya untuk pencatatan baru.
- Untuk membedakan uang Anda yang sedang dipegang pasangan, jalankan migration `supabase/migrations/202610140004_partner_holding_wallet.sql`. Migration ini menambahkan dompet virtual bersaldo nol dan aman dijalankan ulang.
- Untuk memisahkan anggaran **Bersama / Saya / Pasangan**, jalankan migration `supabase/migrations/202610140005_budget_owner_scopes.sql` sebelum mencatat transaksi dengan versi aplikasi terbaru.
- Untuk mencatat dana darurat sebagai alokasi yang tetap berada di rekening yang sama, jalankan migration lanjutan `supabase/migrations/202610140006_emergency_fund_allocation.sql`.
- Tabel `wallets` berisi dompet dengan saldo awal yang benar. Untuk memakai setoran wishlist antar-rekening, pastikan ada rekening sumber dan rekening tabungan tujuan sebagai dua baris dompet yang berbeda. BooCash tidak membuat dompet secara otomatis.
- Setelah mengubah skema atau migration, muat ulang halaman BooCash.

Migration menyediakan RPC dan trigger yang menjaga saldo. Catatan transaksi, transfer, hapus transaksi, dan koreksi saldo harus melalui alur aplikasi/RPC agar saldo tidak dihitung dua kali atau tertinggal.

### Cara memulai pencatatan dari nol

Urutan ini cocok setelah database direset dan untuk mulai mencatat tanpa membawa transaksi lama:

1. **Tentukan titik mulai.** Cara paling sederhana adalah mulai hari ini. Transaksi sebelum hari mulai tidak dimasukkan; saldo pembuka mewakili posisi rekening saat mulai.
2. **Periksa empat rekening.** Pastikan rekening Mandiri dan Blu BCA milik Boo/Bee sudah benar namanya dan tidak tertukar. Cocokkan juga saldo aktual dari aplikasi bank atau catatan kas.
3. **Set saldo pembuka masing-masing rekening.** Pada kartu setiap rekening, tekan ikon pensil dan masukkan saldo aktual penuh rekening itu. Ulangi untuk semua rekening. BooCash membuat transaksi **Adjustment** bertanggal hari ini; ini hanya menetapkan titik awal, bukan pemasukan/pengeluaran.
4. **Buat target tabungan.** Dari **Kelola Wishlist**, buat target `Dana Darurat` dan target wishlist lain yang memang ingin dipantau. Tentukan jumlah sasaran yang realistis. Sebagai patokan perencanaan, dana darurat sering ditargetkan bertahap menuju 3-6 bulan kebutuhan pokok; sesuaikan dengan kondisi dan kestabilan penghasilan.
5. **Isi saldo awal progres target dengan hati-hati.** `Sudah Terkumpul Inisial` adalah jumlah yang memang sudah dialokasikan untuk target tersebut. Nilai ini hanya mengatur progres target, tidak mengubah saldo dompet. Jika uang dana darurat sudah berada di rekening Blu BCA, masukkan bagian yang benar-benar khusus dana darurat sebagai nilai awal progres; jangan buat transaksi transfer baru untuk uang yang sudah berada di sana.
6. **Mulai catat kejadian sejak titik mulai.** Catat pemasukan dan pengeluaran satu kali pada tanggal sebenarnya. Untuk uang yang dipindahkan setelah titik mulai dari Mandiri ke Blu BCA, gunakan **Transfer** atau kategori tabungan yang sesuai; jangan catat perpindahan itu sebagai pengeluaran biasa sekaligus transfer.
7. **Buat anggaran setelah ada gambaran pengeluaran.** Mulai dari batas sederhana untuk kategori utama, kemudian sesuaikan setelah satu-dua bulan melihat pola aktual. Anggaran BooCash saat ini tersimpan per browser.
8. **Rekonsiliasi rutin.** Seminggu sekali, bandingkan saldo BooCash dengan saldo bank. Catat transaksi yang tertinggal bila diketahui; gunakan penyesuaian saldo hanya untuk selisih yang tidak dapat dijelaskan.

Jangan memasukkan saldo awal sebagai transaksi **Pemasukan**, karena itu membuat dashboard menganggap uang lama sebagai pendapatan baru. Jangan mencatat transaksi lama sekaligus memasukkan saldo rekening hari ini sebagai saldo pembuka, karena saldo serta pengeluaran akan terhitung tidak konsisten. Jika perlu merekonstruksi riwayat lampau, tentukan tanggal awal dan saldo pada tanggal tersebut terlebih dahulu; alur penyesuaian saldo aplikasi saat ini bertanggal hari ini, jadi memulai dari saldo aktual hari ini adalah pilihan paling sederhana.

### Memisahkan gaji yang dititipkan ke pasangan

Dompet **Titipan ke Pasangan - Dana Saya** adalah dompet virtual, bukan rekening bank baru. Saldo dompet ini menunjukkan bagian uang Anda yang masih dipegang pasangan. Jangan masukkan uang milik pasangan ke dompet ini.

Jika gaji langsung dikirim ke pasangan:

1. Catat gaji sebagai **Pemasukan → Gaji** ke dompet **Titipan ke Pasangan - Dana Saya** pada tanggal gaji.
2. Setiap pasangan mengirim Rp50.000 kembali ke rekening Boo Mandiri, catat **Transfer** dari dompet virtual tersebut ke **Boo Mandiri**.
3. Catat setiap kiriman satu kali saja. Kiriman harian adalah pengembalian/perpindahan uang Anda sendiri, bukan pemasukan baru.

Contoh: gaji Rp5.000.000 masuk ke dompet virtual. Setelah kiriman Rp50.000 selama 10 hari, dompet virtual menunjukkan Rp4.500.000 dan Boo Mandiri bertambah total Rp500.000 dari transfer tersebut.

Jika gaji terlebih dahulu masuk ke Boo Mandiri baru kemudian dikirim ke pasangan, catat **Pemasukan → Gaji** ke Boo Mandiri, lalu catat **Transfer** dari Boo Mandiri ke dompet virtual sebesar uang yang diserahkan. Kiriman Rp50.000 berikutnya tetap dicatat sebagai transfer dari dompet virtual ke Boo Mandiri.

Untuk mulai melacak uang yang sudah lebih dulu dititipkan sebelum BooCash digunakan, tekan ikon pensil pada dompet virtual setelah migration dijalankan dan masukkan hanya sisa uang Anda yang saat ini masih dipegang pasangan. Jangan masukkan total gaji historis jika sebagian sudah dikirim kembali atau sudah digunakan. Perubahan saldo ini tercatat sebagai penyesuaian pembuka, bukan pemasukan.

### Anggaran bersama dan pribadi

Anggaran bulanan dapat dibuat terpisah untuk **Bersama**, **Bee**, dan **Boo**. Pilih scope di bagian Anggaran Bulan Ini, lalu simpan batas per kategori untuk scope tersebut. Batas kategori pada satu scope tidak mengubah batas di scope lainnya.

Setiap anggaran yang sudah dibuat memiliki tombol **Edit** dan **Hapus**. **Edit** memuat kategori serta batas saat ini ke form; ubah nominal lalu tekan **Perbarui**, atau tekan **Batal edit** untuk keluar tanpa mengubah batas. Scope dan kategori dikunci selama mode edit agar anggaran tidak berpindah ke scope/kategori lain. **Hapus** meminta konfirmasi dan menghapus batas kategori hanya dari scope yang sedang dilihat; transaksi keuangan tidak ikut terhapus.

Setiap kali mencatat pengeluaran biasa, pilih **Pengeluaran ini untuk** dengan scope yang sama:

- **Bersama** untuk kebutuhan rumah tangga atau biaya yang memang dibagi.
- **Bee** untuk pengeluaran pribadi Anda.
- **Boo** untuk pengeluaran pribadi pasangan yang sedang Anda catat.

Progres anggaran hanya menghitung pengeluaran bulan berjalan dengan scope yang dipilih. Transfer, penyesuaian saldo, setoran wishlist, dan setoran dana darurat tidak dihitung sebagai pengeluaran anggaran. Pemasukan tidak memengaruhi anggaran kategori.

Migration memberi transaksi lama label `Bersama` agar tetap terlihat pada anggaran gabungan. Anggaran lama yang tersimpan di browser juga dipertahankan di scope Bersama. Transaksi lama tidak dapat dibagi otomatis menjadi Bee/Boo karena informasi pemiliknya sebelumnya belum dicatat; mulai pilih scope pada transaksi baru. Pengaturan batas anggaran tetap tersimpan lokal per browser.

## 2. Aturan dasar pencatatan

- Satu transaksi pemasukan atau pengeluaran menggunakan satu dompet.
- Isi jumlah sebagai angka rupiah bulat. Contoh: `125000` atau `125.000` untuk Rp125.000.
- Aplikasi menghapus semua karakter selain angka pada kolom jumlah. Jangan masukkan pecahan desimal: `12,50` akan dibaca sebagai `1250`, bukan Rp12,50.
- Jangan menambahkan tanda minus untuk pengeluaran. Pilih jenis **Pengeluaran**; aplikasi menyimpan nilainya sebagai negatif di database.
- Untuk pemasukan dan transfer, masukkan jumlah positif. Aplikasi menentukan tanda dan arah pencatatan.
- Tanggal boleh tanggal transaksi yang sebenarnya, termasuk tanggal lampau. Periksa tanggal sebelum menyimpan.
- Catatan bersifat opsional, tetapi sebaiknya spesifik, misalnya `Makan siang kantor` atau `Ongkos taksi`.
- Jangan mengubah saldo melalui Supabase Table Editor untuk transaksi normal. Gunakan **Penyesuaian Saldo** agar perubahan tercatat di riwayat.

## 3. Mencatat pengeluaran

1. Tekan **+ Tambah Transaksi**.
2. Pilih **Pengeluaran**.
3. Pilih dompet yang benar-benar digunakan untuk membayar.
4. Pilih kategori yang paling sesuai.
5. Periksa tanggal transaksi.
6. Masukkan jumlah positif dalam rupiah bulat.
7. Tambahkan keterangan bila berguna.
8. Tekan **Simpan Catatan** dan tunggu notifikasi berhasil sebelum menutup atau mengulangi pengiriman.

Kategori pengeluaran yang tersedia:

| Kategori | Gunakan untuk |
| --- | --- |
| Makan & Minum | Restoran, kopi, makanan pesan antar |
| Belanja Bulanan | Bahan makanan dan kebutuhan rumah tangga rutin |
| Belanja & Pribadi | Pakaian, barang pribadi, belanja umum |
| Transportasi | Bensin, parkir, taksi, transportasi umum |
| Tagihan & Tempat Tinggal | Listrik, internet, sewa/kost, tagihan rumah |
| Hiburan | Film, rekreasi, acara, kencan |
| Kesehatan | Obat, dokter, pemeriksaan |
| Pendidikan | Buku, kursus, biaya pendidikan |
| Keluarga | Pengeluaran untuk keluarga |
| Perjalanan | Tiket, penginapan, kebutuhan perjalanan |
| Hewan Peliharaan | Pakan, dokter hewan, kebutuhan hewan |
| Hadiah & Donasi | Hadiah atau sumbangan |
| Usaha | Biaya operasional usaha |
| Tabungan Wishlist | Setoran ke salah satu target wishlist |
| Lainnya | Pengeluaran yang tidak cocok dengan kategori lain |

Pilih satu kategori utama yang paling menggambarkan tujuan transaksi. Hindari memakai **Lainnya** jika ada kategori yang lebih tepat karena kategori menjadi dasar grafik dan anggaran.

### Pengeluaran yang salah jumlah atau kategori

Transaksi yang sudah tersimpan tidak diedit langsung. Buka **Lihat Semua**, cari transaksi, tekan **Hapus**, konfirmasi, lalu catat ulang dengan tanggal, dompet, kategori, dan jumlah yang benar. Untuk transaksi pengeluaran biasa, penghapusan akan membalik pengaruhnya terhadap saldo.

## 4. Mencatat pemasukan

1. Tekan **+ Tambah Transaksi** lalu pilih **Pemasukan**.
2. Pilih dompet tempat uang diterima.
3. Pilih kategori pemasukan.
4. Isi tanggal dan jumlah positif.
5. Tambahkan catatan sumber pemasukan, lalu simpan.

Kategori pemasukan:

- Gaji
- Freelance
- Pendapatan Usaha
- Investasi
- Hadiah
- Pengembalian Dana
- Pemasukan Lainnya

Refund dapat dicatat sebagai pemasukan dengan kategori **Pengembalian Dana**. Jika refund perlu dikaitkan dengan belanja awal, tulis keterangan yang mengacu pada transaksi asal. Saat ini refund tidak otomatis mengubah atau menghapus transaksi belanja lama.

Jangan catat uang yang hanya berpindah antar-dompet sebagai pemasukan. Gunakan **Transfer** agar total pemasukan/pengeluaran tidak membesar secara keliru.

## 5. Memindahkan uang antar-dompet

1. Buka form transaksi dan pilih **Transfer**.
2. Pilih **Dari Rekening** sebagai dompet sumber.
3. Pilih **Ke Rekening** sebagai dompet tujuan.
4. Pastikan kedua dompet berbeda.
5. Masukkan jumlah positif, tanggal, dan catatan opsional.
6. Simpan sekali dan tunggu notifikasi berhasil.

Transfer menyimpan dua baris riwayat yang terhubung: jumlah negatif pada dompet sumber dan jumlah positif pada dompet tujuan. Transfer tidak dihitung sebagai pemasukan atau pengeluaran pada ringkasan dan grafik.

Jika menghapus salah satu baris transfer dari riwayat, RPC akan menghapus pasangan transfernya sekaligus. Saldo kedua dompet disesuaikan oleh trigger. Jangan mencatat kaki transfer sebagai pengeluaran/pemasukan biasa selain transfer, dan jangan mengulang simpan hanya karena layar terasa lambat sebelum memeriksa notifikasi/riwayat.

## 6. Menabung ke target wishlist

Buat target terlebih dahulu bila target belum tersedia:

1. Pada bagian **Target Wishlist Kita**, tekan **Kelola**.
2. Isi nama target dan jumlah sasaran.
3. Kolom **Sudah Terkumpul Inisial** boleh diisi untuk saldo tabungan yang sudah ada sebelum pencatatan BooCash. Nilai awal ini bukan transaksi riwayat.
4. Simpan target.

Untuk mencatat setoran wishlist:

1. Tambah transaksi sebagai **Pengeluaran**.
2. Pilih rekening sumber, biasanya rekening harian/bulanan.
3. Pilih kategori **Tabungan Wishlist**.
4. Pilih target wishlist yang menerima setoran.
5. Pilih rekening tujuan tabungan, misalnya rekening tabungan Blue BCA. BooCash memilih rekening dengan nama Blu/Blue BCA sebagai tujuan awal bila tersedia, tetapi tetap periksa tujuan. Rekening sumber dan tujuan harus berbeda.
6. Masukkan jumlah dan tanggal, tambahkan catatan bila perlu, lalu simpan sekali.

Setoran wishlist membuat dua baris transfer yang terhubung dalam satu RPC: saldo rekening sumber berkurang, saldo rekening tabungan bertambah, dan progres target bertambah satu kali. Jika salah satu dihapus, pasangan transfer serta progres target dibalik bersama-sama. Fitur ini memerlukan migration `202610140002_wishlist_savings_transfer.sql`. Jangan catat setoran yang sama lagi sebagai transfer manual.

Untuk mencatat **Dana Darurat**, pilih **Pengeluaran → Tabungan Dana Darurat**, pilih rekening tempat uang itu memang berada, target bernama `Dana Darurat`/`Emergency`, lalu isi jumlah alokasinya. Dana tidak dipindahkan ke rekening lain dan saldo rekening tidak berkurang; aplikasi membuat catatan alokasi khusus yang menaikkan progres target. Nilai alokasi terlihat di riwayat. Jika catatan alokasi dihapus, progres target dikurangi kembali, saldo rekening tetap.

Alur alokasi Dana Darurat memerlukan migration `202610140006_emergency_fund_allocation.sql` setelah migration transaksi sebelumnya. Migration `202610140003_emergency_fund_transactions.sql` yang lama membuat transfer untuk dana darurat, tetapi versi aplikasi terbaru memakai migration 006 untuk mengubah perilaku menjadi alokasi tanpa pemindahan. Jalankan migration 006 sebelum memakai kategori tersebut.

Jika setoran wishlist salah, hapus salah satu baris transfernya selagi target masih ada. RPC menghapus pasangan, trigger membalik saldo kedua rekening dan progres target. Jika alokasi Dana Darurat salah, hapus baris alokasinya; progres target dibalik dan saldo rekening tidak berubah. **Jangan hapus target lebih dahulu jika masih ada transaksi setoran/alokasi yang terkait.** Setelah target dihapus, pembalikan progres saat menghapus transaksi terkait dapat gagal karena targetnya sudah tidak ditemukan.

Saat mengedit target, nilai **Sudah Terkumpul Inisial** mengganti angka progres saat ini secara langsung. Gunakan hanya untuk koreksi/manual baseline; perubahan ini bukan transaksi dan tidak menambah riwayat.

## 7. Mengoreksi saldo dompet

Gunakan **ikon pensil** pada kartu dompet hanya ketika saldo aplikasi berbeda dari saldo nyata di rekening/tunai.

1. Tekan ikon pensil pada dompet terkait.
2. Masukkan saldo aktual keseluruhan saat ini, bukan selisihnya.
3. Periksa angka dan simpan.

Aplikasi menghitung selisih dan membuat transaksi **Penyesuaian Saldo**. Penyesuaian menjaga saldo dompet tetap cocok, tetapi dikecualikan dari ringkasan pendapatan/pengeluaran dan grafik kategori.

Jangan memakai penyesuaian saldo untuk menyamarkan transaksi yang lupa dicatat. Untuk pembukuan yang lebih informatif, catat transaksi sebenarnya; gunakan penyesuaian hanya untuk saldo pembuka atau rekonsiliasi.

## 8. Menggunakan dashboard dan filter durasi

Dashboard memiliki filter dompet dan periode:

- **7 hari terakhir**: hari ini dan enam hari sebelumnya.
- **30 hari terakhir**: hari ini dan 29 hari sebelumnya.
- **Bulan ini**: dari awal bulan kalender ini.
- **Tahun ini**: dari awal tahun kalender ini.
- **Semua waktu**: semua transaksi yang berhasil dimuat.
- **Pilih tanggal**: tanggal mulai dan akhir yang dapat diisi; bila salah satu kosong, batas tersebut tidak diterapkan.

Filter ini berlaku untuk pemasukan, pengeluaran, selisih periode, dan grafik kategori. Pilihan dompet membatasi angka-angka dashboard ke dompet yang dipilih. Bagian anggaran tetap menghitung semua dompet untuk bulan kalender ini.

Grafik kategori mengurutkan pengeluaran terbesar ke terkecil. Bar terpanjang adalah kategori dengan nilai tertinggi relatif terhadap kategori lain pada periode terpilih. Grafik mengabaikan transfer dan penyesuaian saldo.

Riwayat terakhir menampilkan tiga transaksi terbaru. Tombol **Lihat Semua** membuka daftar riwayat dengan pencarian nama kategori/catatan dan filter kategori. Secara default, filter dashboard tidak membatasi daftar riwayat. Centang **Ikuti filter dashboard (dompet dan periode)** di jendela riwayat jika ingin daftar tersebut mengikuti dompet, preset periode, atau tanggal kustom yang sedang dipilih di dashboard. Pencarian dan kategori yang dipilih di riwayat tetap berlaku sebagai filter tambahan. Jika checkbox tidak dicentang, riwayat tetap mencakup semua tanggal dan dompet.

## 9. Menetapkan anggaran

Anggaran adalah batas per kategori untuk bulan kalender saat ini.

1. Di bagian **Anggaran Bulan Ini**, pilih kategori.
2. Masukkan batas rupiah bulat, tanpa angka desimal.
3. Tekan **Simpan**.
4. Ulangi untuk kategori lain.

Menyimpan kategori yang sama lagi akan mengganti batas kategori itu untuk bulan ini. Pengeluaran bertambah otomatis dari transaksi pada bulan ini di semua dompet. Bar berubah menjadi warna peringatan ketika pengeluaran melampaui batas.

Anggaran saat ini disimpan di `localStorage` browser, bukan Supabase. Anggaran tidak ikut berpindah saat menggunakan browser/perangkat lain dan terhapus bila data situs dibersihkan. Mengganti browser atau menghapus data lokal tidak menghapus transaksi Supabase.

## 10. Menghapus transaksi atau target

- Hapus hanya setelah membaca dialog konfirmasi.
- Penghapusan transaksi bersifat permanen dan memengaruhi saldo melalui trigger.
- Menghapus satu baris transfer akan menghapus kedua baris transfer.
- Menghapus transaksi tabungan wishlist membalik progres target selama targetnya masih ada.
- Menghapus target tidak sama dengan menghapus transaksi yang pernah diarahkan ke target tersebut. Hapus setoran terkait terlebih dahulu bila catatan setoran juga perlu dibersihkan.
- Jika salah menghapus, aplikasi tidak memiliki fitur undo. Catat ulang transaksi atau target setelah memastikan saldo/progresnya benar.

## 11. Kondisi gagal atau tampilan belum berubah

- **Notifikasi `Gagal menyimpan` / fungsi RPC tidak ditemukan**: pastikan migration sudah berhasil dijalankan pada project Supabase yang sama dengan project di `.env`, lalu muat ulang aplikasi.
- **Setoran wishlist gagal meminta rekening tabungan**: pastikan rekening sumber dan rekening tujuan (misalnya Blue BCA) sudah ada sebagai dua dompet berbeda di `wallets`, target tabungan sudah dibuat, dan migration `202610140002_wishlist_savings_transfer.sql` sudah dijalankan.
- **Alokasi Dana Darurat gagal disimpan**: pastikan target bernama `Dana Darurat`/`Emergency` tersedia dan migration `202610140006_emergency_fund_allocation.sql` sudah dijalankan setelah migration transaksi sebelumnya.
- **Izin ditolak/RLS error**: jangan menonaktifkan RLS atau menempelkan service-role key di frontend. Periksa policy Supabase dan kirim pesan error lengkap untuk diagnosis.
- **Saldo tidak berubah atau berubah tidak semestinya**: jangan mengulang transaksi berkali-kali. Periksa riwayat terlebih dahulu; transaksi/RPC dapat berhasil meskipun halaman belum memperbarui tampilan. Muat ulang halaman dan bandingkan riwayat serta saldo.
- **Daftar dompet atau target kosong**: pastikan tabel `wallets` atau `savings_goals` memiliki data dan akses baca diizinkan oleh policy Supabase.
- **Periode tidak menampilkan catatan**: cek tanggal transaksi, filter dompet, pilihan periode, dan batas tanggal kustom.
- **Nominal tampak berbeda**: angka dibaca sebagai rupiah bulat dan karakter selain angka dibuang. Masukkan digit nominal saja.
- **Jaringan terputus saat menyimpan**: jangan langsung kirim ulang. Setelah koneksi pulih, muat ulang dan pastikan apakah transaksi sudah tercatat untuk menghindari duplikasi.

## 12. Memulai ulang pencatatan dari nol

Sebelum reset, ekspor/cadangkan data Supabase. Reset berikut menghapus transaksi dan target, tetapi mempertahankan baris dompet dan mengatur saldonya ke nol. Jalankan di Supabase SQL Editor hanya bila memang ingin menghapus seluruh riwayat:

```sql
begin;

delete from public.transactions;
delete from public.savings_goals;
update public.wallets set balance = 0;

commit;
```

Trigger transaksi akan berjalan saat penghapusan; pembaruan terakhir memastikan semua dompet dimulai dari nol. Migration, fungsi RPC, dan trigger tetap terpasang. Setelah itu buat ulang target wishlist yang diperlukan dan periksa saldo dompet.

Untuk menghapus preferensi anggaran lokal di browser yang sedang dipakai, buka Developer Console pada halaman BooCash dan jalankan:

```js
localStorage.removeItem('booCashBudgets');
location.reload();
```

Menghapus dompet akan membuat aplikasi tidak memiliki akun untuk transaksi. Jangan lakukan kecuali siap membuat ulang dompet dan saldo pembukanya.

## 13. Daftar singkat sebelum menekan Simpan

- Jenis transaksi sudah benar: pengeluaran, pemasukan, atau transfer.
- Dompet sumber dan tujuan sudah benar; transfer memakai dua dompet berbeda.
- Kategori sesuai tujuan transaksi.
- Target wishlist dipilih bila menggunakan kategori tabungan wishlist.
- Tanggal sesuai tanggal kejadian.
- Jumlah berupa digit rupiah bulat, tanpa tanda minus atau pecahan.
- Setelah menyimpan, tunggu notifikasi dan periksa riwayat sebelum mengirim ulang.
