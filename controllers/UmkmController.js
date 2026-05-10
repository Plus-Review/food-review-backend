const { Umkm } = require('../models');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage }).single('image');
exports.getAllUmkm = async (req, res) => {
    try {
        const umkmList = await Umkm.findAll();
        res.status(200).json(umkmList);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createUmkm = (req, res) => {
    upload(req, res, async (err) => {
        console.log('=== DEBUG ===');
        console.log('req.body:', req.body);
        console.log('req.file:', req.file);
        console.log('content-type:', req.headers['content-type']);
        if (err) return res.status(500).json({ message: "Gagal upload gambar" });

        try {
            const { nama_umkm, harga_range, jenis_makanan, deskripsi, alamat_teks, latitude, longitude } = req.body;

            if (!nama_umkm) {
                return res.status(400).json({ message: "nama_umkm tidak boleh kosong!" });
            }

            const newUmkm = await Umkm.create({
                nama_umkm,
                harga_range,
                jenis_makanan,
                deskripsi,
                alamat_teks,
                latitude: latitude || 0,
                longitude: longitude || 0,
                image: req.file ? req.file.filename : null,
                userId: req.user?.id || null
            });

            res.status(201).json(newUmkm);
        } catch (error) {
            console.error('=== ERROR DETAIL ===');
            console.error('Name:', error.name);
            console.error('Message:', error.message);
            res.status(500).json({ message: error.message });
        }
    });
};