# Propuesta: fotos fijas en eventos graves

**Estado:** pendiente de decisión del dueño del producto (evaluada el 11 de octubre de 2026). Hoy el sistema no guarda imágenes ni audio: la cámara y el micrófono se procesan en el navegador y solo viajan eventos.

## Contexto

La especificación original pedía evidencia "cuando corresponda y exista autorización: video, audio, eventos, timestamps", pero también "no almacenar video/audio indefinidamente" y procesar en el navegador cuando sea posible. El análisis (decisión 1 de la sección 14) dejó la versión inicial sin grabación y las fotos puntuales como evolución opcional.

## Opciones evaluadas

| | A. Sin imágenes (actual) | B. Foto fija en eventos graves | C. Video en vivo al docente | D. Grabación completa |
|---|---|---|---|---|
| Qué ve quien revisa | Hechos con hora y señales | Lo de A y de 1 a 3 fotos del momento | La cámara mientras se presenta | Video y audio de todo el examen |
| Privacidad | Máxima | Mínima exposición, acotada | Alta exposición | Máxima exposición |
| Infraestructura y costo | Ninguna | Casi nula (fotos pequeñas en la base) | Transmisión en tiempo real | Almacenamiento de horas de video |
| Coherencia con la promesa del producto | Total | Alta, si se cumplen las condiciones | Baja | Contradice la propuesta |

C y D se descartan por desproporcionadas: convierten la supervisión en vigilancia y rompen la promesa de que la imagen no se graba.

## Por qué B tiene sentido

La única señal de severidad alta es "más de un rostro", y es la más propensa a falsos positivos: el detector puede "ver" un rostro en una foto, un televisor o un patrón (pasó con la cámara simulada de las pruebas). Con una foto del momento, quien revisa puede descartar en segundos una sospecha injusta.

## Condiciones de la versión responsable

1. **Disparador:** solo "más de un rostro" confirmado (sostenido 1,5 s o más). Máximo 3 fotos por sesión, pequeñas (alrededor de 320×240, 20 KB). Nunca audio.
2. **Consentimiento aparte:** casilla propia ("Autorizo que se guarde una foto si la cámara detecta más de una persona"), independiente de autorizar la cámara. Para menores, el acudiente debe autorizar las fotos de forma explícita (campo nuevo en su autorización).
3. **Transparencia:** el estudiante ve "Se guardó una foto" cuando ocurre, y puede ver sus fotos en "Mis datos de supervisión".
4. **Acceso:** solo quien revisa esa sesión, en la página de revisión, junto al evento; cada visualización queda en la auditoría; sin descarga ni enlace público.
5. **Retención:** las fotos se borran con el resto de la evidencia, al vencer la retención de la institución (preferencia del dueño del producto).
6. **Límites:** la foto no se analiza en el servidor, no se envía a la IA y no se usa para reconocer a nadie.

Riesgo a advertir: si un tercero entra al cuadro, queda en la foto sin haber consentido; debe decirlo el aviso. El texto del consentimiento debe validarlo un abogado antes de usarse con estudiantes reales.

## Implementación estimada (si se aprueba)

Una fase pequeña (uno a dos días con pruebas): modelo de foto ligado al evento y a la sesión, nueva versión del aviso con la casilla, campo en la autorización del acudiente, captura en el navegador (canvas a JPEG) al confirmar el episodio, ruta con límite de tamaño y cantidad, vista en la revisión y en "Mis datos" con auditoría de acceso, borrado en la tarea de retención, y pruebas unitarias, de integración y E2E.

## Recomendación técnica

B con las seis condiciones. A sigue siendo válida si se prefiere el mensaje más simple: "nada sale del equipo".
