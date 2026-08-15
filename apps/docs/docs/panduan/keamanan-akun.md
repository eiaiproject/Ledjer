<Reicon name="Shield" size="28" class="page-header-icon" />

# Keamanan Akun

Langkah-langkah menjaga akun dan data keuangan Anda tetap aman.

## Kata sandi yang kuat

Password Ledjer mewajibkan:

- Minimal **8 karakter** (maksimal 72)
- Minimal **1 huruf besar**
- Minimal **1 angka**

Gunakan password yang berbeda dari email/media sosial Anda. Jangan berikan ke siapa pun.

## Mengganti password

1. Buka **Pengaturan → Keamanan**.
2. Masukkan password saat ini, lalu password baru.
3. Semua sesi login di perangkat lain **otomatis keluar** — aman jika password bocor.

## Mengelola sesi

Ledjer menggunakan sesi login yang:

- **Berakhir otomatis** setelah 14 hari sejak masuk, atau setelah 1 jam tidak aktif
- **Diperbarui (rotasi)** setiap 7 hari agar token yang bocor tidak bisa dipakai lama
- **Satu sesi per perangkat** — keluar (logout) mencabut sesi perangkat itu

Jika ponsel/laptop hilang, segera **ubah password** dari perangkat lain — ini mencabut semua sesi.

## Masuk dengan Google

Anda bisa masuk dengan akun Google. Perangkat Anda tetap aman selama akun Google Anda aman — aktifkan verifikasi dua langkah Google untuk lapisan ekstra.

## Proteksi dari serangan

Ledjer menerapkan lapisan keamanan otomatis:

- **Pembatasan percobaan login** — setelah 5 gagal dalam 15 menit, login diblokir sementara
- **Anti enumerasi email** — sistem tidak mengungkap apakah suatu email terdaftar
- **Lampiran aman** — hanya file gambar/PDF yang valid yang bisa diunggah (10 MB maks)
- **Isolasi data** — setiap organisasi hanya bisa melihat datanya sendiri, di semua lapisan

## Menghapus akun

Penghapusan akun bersifat permanen dan hanya untuk **owner**:

1. Buka **Pengaturan → Keamanan → Hapus Akun**.
2. Konfirmasi dengan password (atau ketik `HAPUS` untuk akun Google).
3. Organisasi yang Anda pegang penuh akan ikut dihapus; organisasi dengan owner lain tetap berjalan.

> Pikirkan dua kali: penghapusan **tidak bisa dibatalkan**. Unduh laporan/ekspor CSV yang Anda butuhkan sebelumnya.

## Laporkan masalah keamanan

Temukan celah keamanan? Jangan buka isu publik. Kirim email ke **[security@ledjer.id](mailto:security@ledjer.id)** atau buka GitHub Security Advisory di repositori Ledjer.
