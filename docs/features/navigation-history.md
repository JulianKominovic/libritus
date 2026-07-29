Quiero que los saltos entre paginas se vayan guardando en un historial de navegación en memoria.
Guardaremos máximo 100 paginas visitadas.
Quiero que al lado del boton de pagina hacia atras en [../../src/renderer/src/organisms/pdf-canvas/PageNavigator.tsx](../../src/renderer/src/organisms/pdf-canvas/PageNavigator.tsx) haya un boton de 'historial' que tenga como icono un reloj.
Cuando se haga click en el boton de historial, se debe mostrar un popover con el historial de navegacion.

- Se mostrará el historial de navegacion con una lista de paginas visitadas ordenadas por fecha de visita. El primer item de la lista estará fijo siempre y será la página máxima a la que se haya navegado y tendrá una leyenda que indique que es la página máxima a la que se haya navegado. Cada item de la lista tendrá una miniatura de la pagina al igual que en en [../../src/renderer/src/organisms/pdf-canvas/PdfSidebar.tsx](../../src/renderer/src/organisms/pdf-canvas/PdfSidebar.tsx) y al hacer click en el item se debe navegar a la pagina correspondiente.
