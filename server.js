require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const sequelize = require('./config/db');
const User = require('./models/User');
const Umkm = require('./models/Umkm');
const Review = require('./models/Review');
const app = express();

app.use(cors());
app.use(express.json());

// User - Umkm (One-to-Many)
User.hasMany(Umkm, { foreignKey: 'userId', onDelete: 'CASCADE' });
Umkm.belongsTo(User, { foreignKey: 'userId' });
// Umkm - Review (One-to-Many)
Umkm.hasMany(Review, { foreignKey: 'umkmId', onDelete: 'CASCADE' });
Review.belongsTo(Umkm, { foreignKey: 'umkmId' });
// User - Review (One-to-Many)
User.hasMany(Review, { foreignKey: 'userId', onDelete: 'CASCADE' });
Review.belongsTo(User, { foreignKey: 'userId' });

app.get('/', (req, res) => {
    res.send('API Food Review Kampus Berjalan Lancar!');
});
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/umkm', require('./routes/umkmRoutes'));

const PORT = process.env.PORT || 5000;
sequelize.sync({ alter: true })
    .then(() => {
        console.log('--- Database & Tabel Berhasil Disinkronkan ---');
        app.listen(PORT, () => {
            console.log(`Server aktif di: http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Gagal sinkronisasi database:', err);
    });
    