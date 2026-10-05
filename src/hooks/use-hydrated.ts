import * as React from "react"

// ¿React ya tomó el control de la página? En el HTML del servidor es false y en el
// navegador, tras hidratar, true. Sirve para deshabilitar formularios con campos
// controlados hasta ese momento: lo que se escribe antes de hidratar se ve en pantalla
// pero no llega al estado, y el formulario lo daría por vacío.
const subscribe = () => () => {}

export function useHydrated() {
  return React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
