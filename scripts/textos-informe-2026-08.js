// Textos de lectura y acciones de los informes de AGOSTO 2026. Es lo único que se
// escribe a mano: los números salen todos de extract-informe-mensual.js y de
// menciones-mes.js. Clave: '<local_id>|2026-08'.
//
// Campos opcionales que el build renderiza si están:
//   avisoDatos   → aviso arriba de "Qué dice la gente" (fuente incompleta).
//   avisoFicha   → texto del aviso cuando no hay datos de la ficha de Google.
//   seguimiento  → checklist de las acciones del mes anterior:
//                  [{ accion, estado: 'ok' | 'parcial' | 'mal' | 'na', efecto }]
module.exports = {
  // ------------------------------------------------------------ PLAYA SAN JUAN
  'playa-san-juan|2026-08': {
    destacado: 'El mes más grande que tuvo el local en reseñas: <b>950 reseñas nuevas</b> (567 en julio) sosteniendo 4,85★ y con las de 1-2★ en un <b>0,6%</b> — menos de la mitad que en julio. Y la ficha convirtió más que nunca: <b>285 reservas desde Google (+32,6% vs agosto 2025)</b> y 1.250 “cómo llegar” (+32,8%).',

    seguimiento: [
      { accion: 'Responder las 3 reseñas pendientes de julio', estado: 'mal', efecto: 'julio sigue en 99,3% (4 sin respuesta) y agosto cierra en 98,4%: 15 sin responder, 3 de ellas de 1-2★.' },
      { accion: 'Recepción y espera en terraza', estado: 'parcial', efecto: 'las reseñas de 1-2★ bajaron del 1,6% al 0,6%, pero 2 de las 5 malas con texto siguen siendo por espera (18 y 19 de agosto).' },
      { accion: 'Revisar la pizza Americana', estado: 'ok', efecto: 'ninguna reseña mala la nombra en agosto; sigue siendo la más mirada de la carta (424 veces).' },
      { accion: 'Reconocer a Cata, Martina y Sergio', estado: 'na', efecto: 'el 88% de las reseñas con texto sigue nombrando a alguien; el informe de menciones de agosto va adjunto.' },
      { accion: 'Fainá = opción sin gluten, en sala y en la carta', estado: 'parcial', efecto: '“sin gluten” sigue entre lo más buscado de la carta digital (7 veces): verificar que la fainá figure como sin gluten.' },
    ],

    lecturaNegativas: '⚠️ <b>Lo que se repite es la espera</b>: la del 18 de agosto (una familia con dos niños que a las 22:00 seguía sin comida y se fue) y la del 19 (“ves tu comida en la barra esperando”, 10 minutos por cada cosa que se pide). Es el mismo patrón que en julio. Las otras tres son casos sueltos: una pizza de mariscos quemada (6/8), unas pizzas “del montón” (13/8) y una de <b>1★ que en realidad es de 5</b>: la del 21 de agosto dice “Magníficamente atendido con Lara” — se equivocó de estrellas y conviene responderle agradeciendo y pidiéndole que la revise.',

    lectura: [
      'Agosto es tu temporada alta y se compara contra agosto del año pasado. La ficha creció en lo que importa: <b>reservas por Google +32,6%</b> (285), <b>cómo llegar +32,8%</b> (1.250) y vistas del menú casi el doble (526 contra 266). Bajan llamadas (−20,6%) y clics a la web (−27,4%), y es el mismo fenómeno de julio: Google resuelve todo adentro de la ficha, así que la gente ya no necesita llamar ni entrar a la web para decidir. El total de interacciones subió un 11%.',
      'En reseñas pasó algo que no es normal: <b>950 reseñas en un mes</b>, casi el doble que julio (que ya había sido récord), y la nota se sostuvo en 4,85★ con solo <b>6 reseñas de 1-2★</b> (0,6%). Cuando entra este volumen de gente lo esperable es que la calidad se resienta; acá la proporción de malas se redujo a menos de la mitad. Es el mejor mes de la cadena en calidad y en cantidad.',
      'El equipo sostiene eso: <b>739 de las 839 reseñas con texto nombran a alguien</b> (88%, igual que en julio). Cata (200) y Martina (187) siguen arriba, y la revelación del mes es <b>Giuliana: pasó de 4 menciones en julio a 104</b>. Lara (82) y Leila (76) completan un grupo de cinco personas que juntan casi 650 menciones. Todas con medias por encima de 4,85★.',
      'Lo que hay para trabajar es lo mismo que en julio y sigue siendo acotado: <b>la espera en horas pico</b>. Dos de las cinco reseñas malas con comentario hablan de eso, y una (18 de agosto) es grave: una hora y cuarto sin que llegue la comida. Con 950 reseñas al mes, cada mala pesa poco en la nota, pero el patrón conviene cortarlo ahora que empieza la temporada baja y hay margen para ajustar el servicio.',
      'La respuesta a las reseñas bajó del 99,3% al 98,4%: son <b>15 reseñas sin responder</b>. Con este volumen es el precio de crecer, pero tres de las quince son de 1-2★ y esas sí piden respuesta pronto. La carta digital acompañó el mes: 7.796 aperturas (6.772 en julio), la Americana sigue primera y <b>“sin gluten” sigue entre lo más buscado</b> (7 búsquedas); aparece también “desayuno” (3), que hoy no está en la carta.',
    ],

    acciones: [
      'Responder las <b>15 reseñas sin respuesta</b> de agosto (empezando por las tres de 1-2★ del 6, 13 y 18 de agosto) y las 4 que quedaron de julio.',
      'Responder a la reseña del <b>21 de agosto</b> (1★ con texto de 5★, “Magníficamente atendido con Lara”): agradecer y pedirle amablemente que revise la puntuación. Es una estrella regalada que se puede recuperar.',
      '<b>La espera en horas pico</b>: que cada mesa sepa cuánto va a tardar lo que pidió y que nadie vea su plato esperando en la barra. Es el único patrón que se repite desde julio.',
      'Reconocer con nombre a <b>Cata (200)</b>, <b>Martina (187)</b> y <b>Giuliana (104)</b>. Va adjunto el informe de menciones con las frases de los clientes, persona por persona. Una duda para el local: <b>Agostina (18) y Agus/Agustina (15)</b> figuran como dos personas — si son la misma, avisar y se unifican.',
      '<b>Sin gluten</b>: 7 búsquedas en la carta digital. Confirmar que la fainá esté cargada como “sin gluten” y que en sala se ofrezca cuando lo pidan.',
    ],
  },

  // ---------------------------------------------------------------- LUCEROS
  'luceros|2026-08': {
    destacado: 'Tu ficha casi duplicó su público: <b>18.880 visitas, +73,7% vs agosto 2025</b>, con “cómo llegar” +90,9% y <b>36 reservas por Google</b> (+28,6%). Y las reseñas se duplicaron respecto de julio: <b>141 en agosto</b>, sosteniendo 4,89★ con una sola de 1★.',

    seguimiento: [
      { accion: 'Verificar que el botón de reservar de la ficha funcione', estado: 'ok', efecto: '36 reservas desde Google en agosto (20 en julio, 28 en agosto 2025): el botón funciona y la proporción sobre “cómo llegar” subió del 4% al 7%.' },
      { accion: 'Reconocer a Ailin, Cintia, Sergio, Joaco y Valen', estado: 'na', efecto: 'el ranking de agosto cambió: Joaco pasó de 6 a 29 menciones; va adjunto el informe del mes.' },
      { accion: 'Sostener cero reseñas malas y 100% respondidas', estado: 'parcial', efecto: 'una sola de 1★ en 141 (0,7%), pero la respuesta bajó al 95,7%: 6 reseñas sin contestar.' },
      { accion: 'Pedir reseñas el fin de semana', estado: 'ok', efecto: '141 reseñas, el doble que en julio; el sábado (34) fue el día fuerte.' },
    ],

    lecturaNegativas: '⚠️ Una sola en todo el mes (26 de agosto, en croata) y está <b>sin responder</b>. No se queja del trato: dice que la pizza Especial estaba sin sabor, que la masa era “de panadería” y que la <b>“Grande” no era tan grande para 19 €</b>. Ese último punto es el aprovechable: si la carta dijera los centímetros de cada tamaño, la expectativa se ajusta antes de pedir.',

    lectura: [
      'Agosto se compara contra agosto del año pasado, y la ficha explotó: <b>+73,7% de visitas</b> (18.880, unas 650 personas por día), <b>“cómo llegar” +90,9%</b> y las vistas del menú pasaron de 25 a 279. Llamadas (−34%) y clics a la web (−17,8%) bajan como en toda la cadena: la gente resuelve dentro de la ficha. El total de interacciones creció un 60%.',
      'Un dato que explica el crecimiento: <b>las 8 búsquedas por las que más te encuentran son genéricas</b> — “restaurantes” (4.957), “pizza” (1.144), “pizzeria alicante” (617)… ninguna incluye tu nombre. Luceros es el local que más gente nueva descubre por Google, y por eso lo que se vea en la ficha (fotos, horario, carta) pesa más que en cualquier otro.',
      'En reseñas fue un mes redondo: <b>141 reseñas, el doble que en julio</b>, la nota se mantuvo en 4,89★ y solo una fue de 1★. Lo único que aflojó es la respuesta: del 100% al 95,7%, seis reseñas sin contestar. Con el doble de volumen, cuesta más sostenerlo, pero es lo que estaba perfecto.',
      'El equipo aparece más repartido que en julio: <b>90 de las 125 reseñas con texto nombran a alguien</b> (72%; en julio fue el 82%). <b>Joaco pasó de 6 a 29 menciones</b> y encabeza el mes, seguido de Ailin (20), Federica (19) y Cintia (17). Los cuatro con media de 4,97★ o más.',
      'La carta digital cuenta otra historia: <b>941 aperturas, igual que en julio (957)</b>, mientras la ficha creció un 74% y las reseñas se duplicaron. La carta del QR no está acompañando el crecimiento del local. Y hay una señal chica pero clara: alguien buscó <b>“tostadas” tres veces</b>, con distintas grafías — buscó desayuno en la carta y no había nada, porque la carta digital de Luceros no tiene la sección de desayunos.',
    ],

    acciones: [
      'Responder las <b>6 reseñas sin contestar</b>, incluida la única de 1★ (26 de agosto).',
      '<b>Que la carta diga los centímetros de cada tamaño</b> (Chica / Grande). La única reseña mala del mes es por la expectativa del tamaño “Grande” a 19 €: se ajusta antes de pedir, no después.',
      '<b>Cargar los desayunos en la carta digital.</b> El desayuno es el turno que más crece y la carta del QR no lo tiene: buscaron “tostadas” y no encontraron nada.',
      'Reconocer con nombre a <b>Joaco (29)</b>, <b>Ailin (20)</b>, <b>Federica (19)</b> y <b>Cintia (17)</b>. Va adjunto el informe de menciones con las frases de los clientes.',
      'Que el QR de la carta se ofrezca en cada mesa: con el doble de clientes, la carta digital se abrió las mismas veces que en julio.',
    ],
  },

  // --------------------------------------------------------------- BENIDORM
  'benidorm|2026-08': {
    destacado: 'Agosto fue enorme: <b>405 reseñas</b> (65 en julio) con la nota subiendo a <b>4,82★</b> y las de 1-2★ bajando otra vez (3,1% → 2,2%); 23.001 visitas a la ficha y <b>160 reservas desde Google</b>. Lo que hay que atacar ya: <b>4 de las 9 reseñas malas son de reservas que no estaban al llegar</b>, y las 9 están sin responder.',

    seguimiento: [
      { accion: 'Sostener la mejora de julio', estado: 'parcial', efecto: 'la proporción de malas volvió a bajar (3,1% → 2,2%) y la nota subió a 4,82★ con seis veces más reseñas — pero las 9 malas del mes están sin responder y 4 hablan de reservas perdidas.' },
      { accion: '“Nombrá a quien te atendió” al pedir la reseña', estado: 'ok', efecto: 'del 28% al 43% de las reseñas con texto nombran a alguien: Kelly 52, Florencia 37, Emiliano 27.' },
      { accion: 'Revisar el escalope', estado: 'ok', efecto: 'ninguna reseña mala lo nombra en agosto.' },
      { accion: 'Fainá = opción sin gluten, en sala', estado: 'parcial', efecto: '“sin gluten” sigue siendo lo más buscado de la carta digital (6 veces).' },
      { accion: 'Confirmar que las reservas de la ficha siguen entrando', estado: 'ok', efecto: '160 reservas desde Google (62 en julio). El canal funciona; el problema apareció en sala: reservas que no estaban al llegar.' },
    ],

    lecturaNegativas: '⚠️ <b>Cuatro de las nueve hablan de lo mismo: la reserva no estaba al llegar</b> (7, 14, 16 y 17 de agosto) — dos hechas con días de antelación, una en persona. Y tres más son de mesas a las que nadie se acerca (16 de agosto y dos el 28, esperando una cerveza que nunca llegó). Es un problema de libro de reservas y de recepción, no de cocina. Aparte, una grave del 25 de agosto: un vegetariano recibió la pizza con jamón y, en vez de rehacerla, se la devolvieron con el jamón sacado. <b>Las nueve están sin responder.</b>',

    lectura: [
      'Es tu primer agosto con medición, así que la ficha va sin comparativa: <b>23.001 visitas</b> (unas 790 personas por día), 951 “cómo llegar”, 263 llamadas, 583 vistas del menú y <b>160 reservas desde Google</b> — en junio eran 0 y en julio 62. Las 8 búsquedas por las que más te encuentran son genéricas (“restaurantes” 6.142, “pizza” 679, “pizzeria benidorm” 536): es gente que no te conoce y te descubre en el mapa, el perfil típico de Benidorm en agosto.',
      'En reseñas el mes fue descomunal: <b>405 reseñas, seis veces las de julio</b>, y aun así la nota <b>subió de 4,78★ a 4,82★</b> y la proporción de malas volvió a bajar (3,1% → 2,2%). Crecer así sin perder calidad es lo más difícil de lograr, y en junio este local era el que había que estabilizar. Se estabilizó.',
      'Lo que no acompañó es la respuesta: del 96,9% al <b>93,1%, con 28 reseñas sin contestar — entre ellas las 9 malas</b>. Una reseña de 1★ sin respuesta la ve cada persona que compara restaurantes en el mapa. Y esas nueve tienen un patrón claro y de sala: <b>reservas que no estaban al llegar</b> (cuatro casos) y <b>mesas a las que nadie se acerca</b> (tres). Con 160 reservas por Google y 188 por la web en un mes, el libro de reservas tiene que ser uno solo y revisarse antes de cada turno.',
      'El equipo dio el salto que se pedía: <b>144 de las 336 reseñas con texto nombran a alguien</b> (43%; en julio era el 28%). <b>Kelly encabeza con 52</b>, después Florencia (37), Emiliano (27), Matías (25), Vanina (21), Valentino (17) y Juanqui (13); Luz (5) y Morena (4) también aparecen. Casi todos con medias por encima de 4,8★.',
      'La carta digital creció con el local: <b>3.391 aperturas</b> (2.298 en julio), 1.649 personas. Las cuatro pizzas más miradas son la Especial, la Cacciatore, la Fugazzeta y la Americana, y <b>“sin gluten” sigue siendo lo más buscado</b>, escrito de dos maneras. Aparece “mocktails” (2): alguien buscó cócteles sin alcohol.',
    ],

    acciones: [
      '<b>Responder hoy las 9 reseñas de 1-2★</b> (todas sin respuesta) y después las otras 19 pendientes. Las de reservas perdidas, con disculpa concreta y qué se cambió.',
      '<b>Un solo libro de reservas</b>: las que entran por Google, por la web, por teléfono y en persona tienen que terminar en el mismo lugar, y revisarse antes de abrir el turno. Cuatro reseñas malas en un mes por reservas que no estaban.',
      '<b>Nadie más de cinco minutos sin que alguien se acerque</b> a la mesa, aunque sea para decir “ya voy”. Tres reseñas malas son de gente que se fue sin que la atendieran.',
      'Reconocer con nombre a <b>Kelly (52)</b>, <b>Florencia (37)</b>, <b>Emiliano (27)</b>, <b>Matías (25)</b> y <b>Vanina (21)</b>. Va adjunto el informe de menciones con las frases de los clientes, persona por persona.',
      'Si un plato sale con un ingrediente que el cliente no puede comer, <b>se rehace, no se “arregla”</b> (reseña del 25 de agosto). Y sin gluten sigue siendo lo más buscado de la carta: que en sala sepan que la fainá es la opción.',
    ],
  },

  // ---------------------------------------------------------------- RUSSAFA
  'russafa|2026-08': {
    avisoFicha: '⚠️ <b>Este mes no hay datos de la ficha de Google.</b> Desde el <b>14 de agosto</b> Google nos quitó el acceso a la ficha de Russafa (la solicitud del 25/8 sigue sin respuesta), así que no tenemos visitas, “cómo llegar”, llamadas ni reservas de agosto. Gerencia está reclamando el acceso; en cuanto se recupere, se completa esta sección.',
    avisoDatos: '⚠️ <b>Datos incompletos:</b> las reseñas de este informe llegan <b>hasta el 14 de agosto</b>, cuando Google nos quitó el acceso a la ficha. Faltan unas 22 reseñas de la segunda quincena. Lo que sigue es la lectura de la primera mitad del mes.',

    destacado: 'El calor del local se comió el mes: <b>las 3 reseñas malas de agosto hablan del calor</b> (“no funcionaban los aires”, “ya se los dijeron”) y la nota de la primera quincena cayó a <b>4,13★</b> (4,74★ en julio). Era la acción más urgente del informe de julio y no se resolvió.',

    seguimiento: [
      { accion: 'Resolver el calor dentro del local', estado: 'mal', efecto: 'las 3 reseñas malas de agosto son por el calor (1/8 y dos el 8/8): “no funcionaban los aires”, “lo del calor es una vergüenza, ya se los dijeron”.' },
      { accion: 'Pedir reseñas de forma sistemática', estado: 'parcial', efecto: '15 reseñas hasta el 14/8 (desde ahí no hay acceso). A ese ritmo serían unas 32 en el mes contra 23 en julio — pero con 3 malas.' },
      { accion: 'Responder la reseña pendiente de julio', estado: 'mal', efecto: 'julio sigue en 95,7% y agosto tiene 2 sin responder: justamente las dos del calor del 8 de agosto.' },
      { accion: 'Invitar al cliente a nombrar a quien lo atendió', estado: 'mal', efecto: '3 de las 11 reseñas con texto nombran a alguien (27%; en julio era el 53%). Samuel no aparece este mes.' },
      { accion: 'Revisar si “cómo llegar” y reservas se recuperan', estado: 'na', efecto: 'sin dato: Google nos quitó el acceso a la ficha el 14/8.' },
    ],

    lecturaNegativas: '⚠️ <b>Las tres son por lo mismo, y dos están sin responder.</b> La del 1 de agosto suma las milanesas secas “y el calor”; las dos del 8 de agosto son solo calor: una clienta con reserva a la que no le avisaron que el aire no funcionaba, y otro que escribe “ya se los dijeron, pónganse las pilas” y aclara que el personal fue muy amable a pesar de trabajar con ese calor. No es una queja de servicio: <b>es el local</b>.',

    lectura: [
      'Este informe es de media temporada: <b>desde el 14 de agosto Google no nos deja entrar a la ficha de Russafa</b>, así que no hay datos de visitas, “cómo llegar” ni reservas, y las reseñas llegan hasta esa fecha. Se está reclamando el acceso desde gerencia. Lo que hay alcanza para una conclusión.',
      'En julio la acción número uno era resolver el calor antes de agosto. <b>No se resolvió, y agosto lo cobró</b>: las tres reseñas de 1-2★ de la primera quincena hablan del calor, una de ellas de una clienta con reserva a la que “no le avisaron que no funcionaban los aires”. La nota de esas 15 reseñas es <b>4,13★</b>, contra 4,74★ en julio. Con tan pocas reseñas cada mala pesa muchísimo, y en un mes con tres, la nota se hunde.',
      'Lo bueno del mes está en lo que no depende del calor: la carta digital se abrió <b>3.208 veces</b> (2.722 en julio) por 1.530 personas, la web trajo <b>66 clics de reserva</b> y la <b>Buenos Aires (Fugazzeta)</b> es la pizza más mirada (146). Y lo que la gente busca en la carta es una sola cosa, repetida: <b>milanesa</b> — “milanesa con huevos y patatas” escrito de cinco formas.',
      'El equipo casi no aparece: <b>3 de 11 reseñas con texto nombran a alguien</b> (Juliana 2, Vanessa 1, Santiago 1). En julio era la mitad, y Samuel se llevaba 8. Cuando el cliente nombra a quien lo atendió, la reseña suele ser mejor — y en un local que necesita subir la nota, cada reseña con nombre cuenta doble.',
    ],

    acciones: [
      '<b>El calor, primero y antes que nada.</b> Tercer mes seguido que aparece (RESTOO en julio, Google en agosto). Si el aire no alcanza, avisar al cliente al reservar y al sentarse: la queja no es el calor, es que no le avisaron.',
      'Responder las <b>dos reseñas del 8 de agosto</b> diciendo qué se hizo con el aire. Están sin respuesta y son las que más lee quien compara restaurantes.',
      '<b>Pedir la reseña en cada mesa que se va contenta</b>, y pedir que nombren a quien los atendió. Con 15-30 reseñas al mes, una sola mala mueve la nota; la única defensa es volumen de buenas.',
      '<b>Milanesa a la vista</b>: es lo único que buscan en la carta digital. Foto y posición arriba en la carta, y sugerencia en sala.',
      'Desde gerencia: <b>recuperar el acceso a la ficha de Google</b> (revisar el correo de Google por el reclamo del 25/8). Sin eso, el informe de septiembre tampoco tendrá datos de ficha.',
    ],
  },
};
