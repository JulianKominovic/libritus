# Mejoras

## No veo indicadores en los web embeds ni las notes

Las webembeds y las notes se 'activan' al hacer click en el centro de ellas, pero no hay ningun indicador visual que te indique eso. A su vez si clickeas dentro de ellas pero no en el centro, se seleccionan y se pueden mover, resizear, etc. como si fueran elementos normales del canvas.
Sumar indicadores visuales en los web embeds y las notes para que el usuario sepa que puede interactuar con ellas.

## Diferencias visuales en la pestaña annotations entre search y note

Las notes tienen un efecto de fading un mask image que las search no tienen. Quiero que las search tambien tengan ese efecto.

## Mostrar las imágenes en la pestaña annotations

Estaria bueno poder buscar las imagenes en la pestaña annotations.

## Agregar margin entre los items de la pestaña annotations

Los items de la pestaña annotations están pegados uno al otro. Quiero que haya un margin entre ellos para que se vea mejor.

De paso agregar virtualizado si no tiene.

## Estilos de botón de pdf sidebar activo

Cuando el pdf sidebar está activo, el botón de la pestaña annotations debería tener un estilo diferente para indicar que está activo, un background más oscuro.

## Guardar la última pestaña activa en el pdf sidebar

Cuando el usuario sale del pdf sidebar, la última pestaña activa debería ser la que se muestre cuando vuelva al pdf sidebar.

# To fix

## No puedo cambiar el color de los stroke de los elementos del canvas

Intento cambiar el color de los stroke de los elementos del canvas y no puedo, ni siquiera puedo hacer click al parecer, no se me cambia el cursor.

## WebcontentsView queda en pantalla luego de eliminar el search web embed del canvas

Coloco un search web embed en el canvas y luego lo elimino. La webcontents view queda en pantalla y no se va hasta que clickeo fuera del webcontents view en cualquier lado del canvas.

## Esconder boton de desbloqueo en los highlights

Con el ultimo update de excalidraw ahora el usuario puede clickear el highlight y aparece un boton con un candado de icono. El usuario puede clickear el boton para desbloquear el highlight y editarlo. Quiero que ese botón no aparezca en pantalla ni se pueda clickear (solo cuando se trate de highlights. No quiero que ese boton deje de funcionar o aparecer en otros elementos).

## El texto cerca de los highlights no se puede seleccionar.

Lo veo en el dom pero no puedo seleccionar el texto que está debajo del highlight. Sin embargo, si coloco el cursor en la siguiente linea de texto debajo del highlight pero lo coloco del lado derecho o izquierdo, sobre el espacio en blanco, puedo seleccionar el texto.

Ver pagina 3430 del pdf de la Biblia.

## Se renderizan muchas más paginas de las que se ven en pantalla.

Tengo un zoom de 170% en excalidraw, veo apenas un tercio de una pagina y el comienzo de la siguiente, sin embargo se renderizan 7 paginas en el dom sin sentido. Deberiamos elegir cuantas paginas renderizar segun el zoom y la posición del scroll, maximo 7. Asi no cargamos tanto el dom a la vez.

## Pierdo el texto seleccionado al hacer zoom out

Selecciono texto del pdf arrastrando el mouse. Luego hago zoom out y el texto seleccionado se pierde, sin embargo sigo viendo la highlight toolbar en el lugar donde estaba el texto seleccionado.

## Bug al seleccionar texto haciendo triple click

Selecciono texto haciendo triple click. El comportamiento del triple click en el browser y en general es que la seleccion se extiende a la palabra siguiente. Sin embargo, en el pdf canvas, la seleccion se extiende a la palabra siguiente pero luego de eso se deselecciona parte de la palabra inicialmente seleccionada, concretamente el inicio de la palabra.

## No puedo arrastrar y soltar imagenes al canvas

Intento arrastrar y soltar una imagen al canvas y no sucede nada. No hay errores en consola.
