// Estilos compartidos por los informes (por local y de dirección), para que
// las dos piezas se vean como la misma familia.
const CSS = `<style>
  :root { --tinta:#22262b; --gris:#5f6a75; --linea:#e6e8ec; --marca:#c62828; --verde:#1e8e3e; --ambar:#b26a00; --fondo:#f4f5f7; --amarillo:#fff6dd; }
  * { box-sizing: border-box; margin: 0; }
  html { -webkit-text-size-adjust: 100%; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: var(--tinta); background: var(--fondo); max-width: 780px; margin: 0 auto; padding: 20px 14px 40px; line-height: 1.6; font-size: 16px; }
  header { background: var(--marca); color: #fff; border-radius: 16px; padding: 22px 20px; margin-bottom: 18px; }
  .kicker { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; opacity: .85; }
  h1 { font-size: clamp(24px, 5.5vw, 32px); margin-top: 4px; line-height: 1.2; }
  .sub { opacity: .9; font-size: 14px; margin-top: 4px; }

  section { background: #fff; border: 1px solid var(--linea); border-radius: 16px; padding: 18px 18px 20px; margin: 14px 0; }
  h2 { font-size: 19px; display: flex; align-items: center; gap: 10px; }
  h2 .n { background: var(--marca); color: #fff; border-radius: 50%; min-width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; font-size: 15px; flex: none; }
  .explica { color: var(--gris); font-size: 14px; margin: 6px 0 14px; }
  h3 { font-size: 14px; text-transform: uppercase; letter-spacing: .6px; color: var(--gris); margin: 18px 0 8px; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 10px; }
  .stat { background: var(--fondo); border-radius: 12px; padding: 12px 14px; }
  .stat .v { font-size: 26px; font-weight: 800; line-height: 1.15; }
  .stat .l { font-size: 13px; color: var(--gris); margin-top: 2px; }
  .stat .pill { margin-top: 6px; }
  .pill { display: inline-block; font-size: 11.5px; font-weight: 700; border-radius: 20px; padding: 2px 9px; margin-top: 6px; }
  .pill.verde { background: #e3f3e6; color: var(--verde); }
  .pill.rojo { background: #fde8e8; color: var(--marca); }
  .pill.neutro { background: #eceef1; color: var(--gris); }

  .semaforo { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 0 0 14px; }
  .sem { border-radius: 12px; padding: 12px 14px; border-left: 5px solid; background: #fff; border: 1px solid var(--linea); border-left-width: 5px; }
  .sem.ok { border-left-color: var(--verde); } .sem.medio { border-left-color: var(--ambar); } .sem.mal { border-left-color: var(--marca); } .sem.neutro { border-left-color: #b9c0c8; }
  .sem .v { font-size: 22px; font-weight: 800; line-height: 1.1; }
  .sem .l { font-size: 12.5px; color: var(--gris); margin-top: 2px; }

  .barra { display: flex; align-items: center; gap: 10px; margin: 7px 0; font-size: 14.5px; }
  .barra .txt { flex: 1 1 40%; min-width: 0; overflow-wrap: anywhere; }
  .barra .track { flex: 1 1 52%; background: var(--fondo); border-radius: 20px; height: 18px; overflow: hidden; }
  .barra .fill { height: 100%; background: var(--verde); border-radius: 20px; min-width: 4px; }
  .barra .val { flex: none; min-width: 44px; text-align: right; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .barra.mala .fill { background: #e57373; }
  .barra.neutra .fill { background: #7e8b99; }

  .destacado { background: var(--amarillo); border: 1px solid #f0dfa8; border-radius: 14px; padding: 14px 16px; margin: 0 0 14px; font-size: 15.5px; }
  .aviso { background: #fdf1f1; border-left: 4px solid var(--marca); border-radius: 0 10px 10px 0; padding: 10px 14px; margin: 10px 0; font-size: 14.5px; }
  .ok { background: #eef8ef; border-left: 4px solid var(--verde); border-radius: 0 10px 10px 0; padding: 10px 14px; margin: 10px 0; font-size: 14.5px; }
  .vacio { color: var(--gris); font-size: 14px; }
  .nota-chica { font-size: 12.5px; color: var(--gris); margin-top: 8px; }
  .glosario { font-size: 14px; color: var(--gris); padding-left: 18px; }
  .glosario li { margin: 6px 0; }
  .glosario b { color: var(--tinta); }

  .resena { background: var(--fondo); border-radius: 12px; padding: 12px 14px; margin: 8px 0; font-size: 14.5px; }
  .resena .cab { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; font-size: 12.5px; color: var(--gris); margin-bottom: 4px; }
  .estrellas { white-space: nowrap; }
  .estrellas b { color: var(--marca); font-size: 13.5px; }
  .estrellas .llenas { color: var(--marca); letter-spacing: 1px; }
  .estrellas .vacias { color: #d3d7dd; letter-spacing: 1px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
  .chip { background: var(--fondo); border-radius: 20px; padding: 5px 12px; font-size: 14px; }
  .chip b { color: var(--marca); }
  .resena .txt { font-style: italic; }
  .resena .pend { display: inline-block; background: #fde8e8; color: var(--marca); font-size: 11.5px; font-weight: 700; border-radius: 20px; padding: 1px 8px; }

  .equipo { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .persona { background: var(--fondo); border-radius: 12px; padding: 10px 12px; }
  .persona .nom { font-weight: 700; font-size: 15px; }
  .persona .men { font-size: 22px; font-weight: 800; line-height: 1.1; }
  .persona .det { font-size: 12px; color: var(--gris); }

  .pedido { border: 2px dashed var(--marca); border-radius: 14px; padding: 16px 18px; background: #fffdf7; }
  .ejemplos { font-size: 14px; color: var(--gris); background: #fff; border-radius: 10px; padding: 10px 14px; margin: 4px 0 6px; }
  .ejemplos i { color: var(--tinta); }

  .acciones { counter-reset: acc; }
  .accion { display: flex; gap: 12px; background: var(--fondo); border-radius: 12px; padding: 12px 14px; margin: 8px 0; font-size: 15px; }
  .accion::before { counter-increment: acc; content: counter(acc); background: var(--marca); color: #fff; border-radius: 50%; min-width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex: none; margin-top: 1px; }

  ul { padding-left: 20px; margin: 6px 0; } li { margin: 4px 0; }
  p { margin: 8px 0; }
  .nota { font-size: 12.5px; color: var(--gris); margin-top: 22px; padding: 0 6px; }
  /* Las secciones NO llevan break-inside:avoid: son largas y, si no entran en lo
     que queda de hoja, saltan enteras y dejan media página en blanco. Se permite
     que una sección se parta; lo que no se parte son las piezas chicas. */
  .accion.seg .ico { margin-right: 4px; }
  .accion.seg.ok { border-left: 4px solid #2e7d32; }
  .accion.seg.mal { border-left: 4px solid #c62828; }
  .accion.seg.parcial { border-left: 4px solid #d9a441; }
  .accion.seg.na { border-left: 4px solid #b9b2a5; }
  @media print {
    body { background: #fff; padding: 0; font-size: 13px; }
    .stat, .accion, .destacado, .resena, .sem, .barra, .persona, .pedido { break-inside: avoid; }
    h2, h3 { break-after: avoid; }
    header { border-radius: 0; }
  }
</style>`;

module.exports = { CSS };
