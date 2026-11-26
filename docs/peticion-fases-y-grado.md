# Petición pendiente: fases de misión y cambio de grado

Guardada antes de empezar la implementación para poder retomarla si no se
completa en esta sesión.

> la funcionaliad añadir fases consiste en que al crear una mision podemos
> dividirla en fases. para poder hacer esto se abrira una pantalla nueva con un
> menu interactivo en el que se pueden añadir elementos: rectangulos con bordes
> redondeados y fechas. los bordes redondeados representan las fases entonces se
> seleccionaria el rectangulo(llamaremos fase a partir de ahora), lo ponemos en
> el lienzo y en el borde derecho tendra un icono de ajustes que permitira
> modificar alguno de los parametros de la fase. Los parametros de una fase son
> los mismo que una mision con las mismas restricciones mas una opcion de añadir
> el peso o valor a esa fase. Las flechas sirven para unir fases, es decir, si
> tenemos fase A y fase B y A va antes de B entonces seleccionamos flechas y de
> ahi pulsamos en A y arrastramos a B. Cada fase menos la primera y la ultima
> deben poder recibir multiples flechas tanto antes como despues como en un
> diagrama de actividad en UML. Obviamente la fase inicial(puede haber varias al
> igual que fases finales) puede ser el inicio de varias flechas y las fases
> finales pueden ser el final de varias flechas. Finalmente habra un boton para
> confirmar. Una vez confirmado, en el menu de misiones, las que tengan fases
> mostraran todas las fases activas, es decir, todas aquellas fases que no
> necesitan que se cumpla una anterior y se mostraran en un menu desplegable de
> la mision. Ademas todas las misiones se les puede modificar el grado en el
> boton de ajuste que tienes que añadir tambien, es decir, se debe poder
> downgradear una mision principal a una secundaria y al reves por ejemplo.

## Estado

Implementación realizada en las versiones web y PWA: editor de lienzo con
posicionamiento y ajustes de fases, flechas dirigidas sin ciclos, desbloqueo
cuando todas las predecesoras están completas, valor por fase y cambio de
categoría de misión. El texto original de la petición se conserva arriba.
