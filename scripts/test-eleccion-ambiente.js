// Simula el botón "🔄 Otra" de la foto de ambientación en modo placa completa:
// 4 elecciones seguidas excluyendo las anteriores, con escena INTERIOR. Todas
// deberían ser interiores (salón/mesas/barra/horno), nunca fachada/calle.
// Corre en el VPS:  node scripts/test-eleccion-ambiente.js
require('dotenv').config();
const { elegirFotos } = require('../lib/banco');
const { supabaseAdmin } = require('../lib/supabase');

const INSTRUCCION = 'Necesito hacer una placa para promocionar el partido de Portugal-España para el Mundial. Juegan el lunes 6 de julio a las 9:00 p. m.\nQuiero que haya hinchas de España en la imagen, ¿sí? Con la camiseta de España y demás.\nQuiero que la ubicación, o sea, el local, esté ambientado como los locales nuestros. Tienes que usar de referencia nuestras imágenes de las instalaciones.';
const ESCENA = 'Interior cálido de una pizzería artesanal de noche: al fondo, una pantalla grande encendida mostrando el verde de una cancha iluminada por reflectores de estadio; hinchas de espaldas con camisetas rojas lisas mirando la pantalla.';
const NUDGE = '\n(Elegí una foto de las INSTALACIONES del local como referencia de ambientación — NO primeros planos de comida. La foto tiene que mostrar el MISMO tipo de espacio que esta escena: si la escena es un salón interior, elegí SOLO interiores (salón, mesas, barra, horno), NUNCA la fachada ni la calle; si es exterior, fachada o terraza. Escena: ' + ESCENA.slice(0, 160) + '…)';

(async () => {
  const placa = { titulo: 'La previa se juega acá', bajada: 'Lunes 6 de julio, 21:00. Pizza al horno de leña y la pelota rodando.', cta: 'Reservá tu mesa' };
  const excluir = [];
  for (let k = 1; k <= 4; k++) {
    const [el] = await elegirFotos(INSTRUCCION + NUDGE, 'historia', [placa], excluir);
    if (!el || !el.bancoId) { console.log(k + '. (sin elección)'); break; }
    excluir.push(el.bancoId);
    const { data } = await supabaseAdmin.from('ppweb_banco_imagenes')
      .select('descripcion,tipo').eq('id', el.bancoId).single();
    console.log(k + '. [' + (data ? data.tipo : '?') + '] ' + (data ? data.descripcion : '(sin descripción)'));
  }
  process.exit(0);
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
