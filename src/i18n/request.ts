import { getRequestConfig } from "next-intl/server";

// Interfaz en español, preparada para más idiomas: todos los textos viven en
// messages/<idioma>.json. Para agregar inglés basta con messages/en.json y elegir
// aquí el idioma (cookie o preferencia del usuario), sin tocar componentes.
export const DEFAULT_LOCALE = "es";

export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;
  return {
    locale,
    // Una sola zona horaria evita que las fechas cambien entre servidor y navegador.
    timeZone: "America/Bogota",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
