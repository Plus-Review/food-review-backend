# Gunakan image node versi terbaru
FROM node:22

# Tentukan direktori kerja di dalam container
WORKDIR /usr/src/app

# Salin package.json dan package-lock.json (jika ada)
COPY package*.json ./

# Install dependensi
RUN npm install

# Salin semua kode backend ke dalam container
COPY . .

# Expose port yang digunakan backend (sesuai settingan kamu)
EXPOSE 5000

# Perintah untuk menjalankan server
CMD ["node", "server.js"]