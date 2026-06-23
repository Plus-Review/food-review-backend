const { Sequelize } = require('sequelize');
const mysql2 = require('mysql2');
require('dotenv').config({ quiet: true });

const useSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';
const rejectUnauthorized =
    String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS ?? process.env.DB_PASSWORD ?? '',
    {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        dialect: 'mysql',
        dialectModule: mysql2,
        logging: false,
        dialectOptions: useSsl
            ? {
                ssl: {
                    require: true,
                    rejectUnauthorized,
                },
            }
            : undefined,
        pool: {
            max: Number(process.env.DB_POOL_MAX || (process.env.VERCEL ? 2 : 10)),
            min: 0,
            acquire: 30000,
            idle: 10000,
        },
    }
);

module.exports = sequelize;