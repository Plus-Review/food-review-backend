const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { del, put } = require('@vercel/blob');
const { createUploadFilename, resolveUploadPath } = require('./security');

const uploadsDir = path.join(__dirname, '..', 'uploads');

const usesBlobStorage = () => (
    process.env.STORAGE_DRIVER === 'vercel-blob'
    || Boolean(process.env.VERCEL)
    || Boolean(process.env.BLOB_READ_WRITE_TOKEN)
);

const createUploadStorage = (prefix) => {
    if (usesBlobStorage()) return multer.memoryStorage();

    fs.mkdirSync(uploadsDir, { recursive: true });
    return multer.diskStorage({
        destination: uploadsDir,
        filename: (req, file, callback) => {
            callback(null, createUploadFilename(prefix, file));
        },
    });
};

const persistUploadedFile = async (file, prefix) => {
    if (!file || !usesBlobStorage()) return file;
    if (!file.buffer) throw new Error('Data gambar tidak tersedia untuk disimpan.');

    const filename = createUploadFilename(prefix, file);
    const blob = await put(`plus-review/${prefix}/${filename}`, file.buffer, {
        access: 'public',
        addRandomSuffix: false,
        contentType: file.mimetype,
    });

    file.filename = blob.url;
    file.path = blob.url;
    return file;
};

const persistRequestFiles = async (files, prefix = 'upload') => {
    const uploadedFiles = Array.isArray(files)
        ? files
        : Object.values(files || {}).flat();

    await Promise.all(uploadedFiles.map((file) => persistUploadedFile(file, prefix)));
};

const isVercelBlobUrl = (value) => {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' && url.hostname.endsWith('.blob.vercel-storage.com');
    } catch {
        return false;
    }
};

const deleteStoredImage = (reference, logLabel = 'gambar') => {
    if (!reference) return;

    if (isVercelBlobUrl(reference)) {
        void del(reference).catch((error) => {
            console.error(`Gagal menghapus ${logLabel} dari Blob:`, error.message);
        });
        return;
    }

    const imagePath = resolveUploadPath(uploadsDir, reference);
    if (!imagePath) return;

    fs.unlink(imagePath, (error) => {
        if (error && error.code !== 'ENOENT') {
            console.error(`Gagal menghapus file ${logLabel}:`, error.message);
        }
    });
};

module.exports = {
    createUploadStorage,
    deleteStoredImage,
    isVercelBlobUrl,
    persistRequestFiles,
    persistUploadedFile,
    usesBlobStorage,
};
