// ============================================================
// lib/drive.js — acceso de solo lectura a una carpeta de
// Google Drive vía cuenta de servicio. La carpeta se comparte
// con drive-lectura@pizzeria-web-drive.iam.gserviceaccount.com
// ============================================================
const path = require('path');
const { google } = require('googleapis');

// Carpeta raíz de imágenes del blog (no es secreta).
const FOLDER_ROOT = process.env.GDRIVE_FOLDER_ID || '1ZbEpKgfuI5b3oVxxTVfjuOghadpBTgfn';

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, '..', 'google-drive-key.json'),
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

// Solo se aceptan ids de Drive válidos (alfanumérico, guiones).
function safeId(id) {
  return /^[A-Za-z0-9_-]{10,}$/.test(id || '') ? id : null;
}

// Lista una carpeta: subcarpetas + imágenes.
async function listFolder(folderId) {
  const id = safeId(folderId) || FOLDER_ROOT;
  const res = await drive.files.list({
    q: "'" + id + "' in parents and trashed=false",
    fields: 'files(id,name,mimeType)',
    pageSize: 300,
    orderBy: 'folder,name',
  });
  const all = res.data.files || [];
  return {
    folders: all
      .filter((f) => f.mimeType === 'application/vnd.google-apps.folder')
      .map((f) => ({ id: f.id, name: f.name })),
    images: all
      .filter((f) => (f.mimeType || '').startsWith('image/'))
      .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
  };
}

// Descarga un archivo de Drive como Buffer.
async function downloadFile(fileId) {
  const id = safeId(fileId);
  if (!id) throw new Error('ID de archivo no válido.');
  const res = await drive.files.get(
    { fileId: id, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

module.exports = { listFolder, downloadFile, FOLDER_ROOT };
