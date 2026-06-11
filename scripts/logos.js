// Script de un solo uso: baja los logos del Kit del Drive, recorta el
// transparente y los guarda optimizados en public/images/logos/.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { downloadFile } = require('../lib/drive');

const OUT = path.join(__dirname, '..', 'public', 'images', 'logos');

// Variantes elegidas del Kit (4500×4500 PNG con alpha).
const LOGOS = {
  'wordmark-blanco': '1yQAUzVBkTMYqb8rM-WpEVhexoH0gVbWR', // LOGO2 — "PIZZERÍA POPULAR" blanco
  'wordmark-oscuro': '17r8CyNlhMbXCkIlr6x0fX9rR9JRc1nS4', // LOGO1 — wordmark oscuro
  'iso-blanco': '11IMi55u8v74KHlZQdzGNnCYAIU88qMXp',      // ISO5 — P blanca
  'iso-fuego': '1eNajydPG6HinBEqcPvhFBW_svQve9QrW',       // ISO1 — P fuego
  'iso-rojo': '1ml-K5_uUYVtU_SseImZ-gFMrtVCgRiWl',        // ISO3 — P roja
  'iso-verde': '1MEOge6L-MxHsGRfC-_Me-awfNUBefMps',       // ISO4 — P verde
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [nombre, id] of Object.entries(LOGOS)) {
    const buf = await downloadFile(id);
    // Recorta el transparente sobrante y limita el ancho a 1000px.
    const out = await sharp(buf)
      .trim()
      .resize({ width: 1000, withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const meta = await sharp(out).metadata();
    fs.writeFileSync(path.join(OUT, nombre + '.png'), out);
    console.log(nombre.padEnd(18), meta.width + '×' + meta.height, (out.length / 1024).toFixed(0) + 'kb');
  }
  console.log('Listo →', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
