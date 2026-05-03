const Umkm = require('../models/Umkm');

exports.getAllUmkm = async (req, res) => {
  try {
    const data = await Umkm.findAll();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createUmkm = async (req, res) => {
  try {
    const baru = await Umkm.create(req.body);
    res.status(201).json(baru);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};