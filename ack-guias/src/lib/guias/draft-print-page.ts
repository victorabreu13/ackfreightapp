/** Browser page when someone opens AWB or labels before the guía is issued. */
export function draftPrintPage(guiaId: string): string {
  const id = guiaId.replace(/[^a-zA-Z0-9_-]/g, "");
  const back = `/guias/${id}`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Emite la guía primero</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; max-width: 36rem; margin: 4rem auto; padding: 0 1.25rem; color: #1c1917; }
  a { color: #1a3848; }
</style>
</head>
<body>
  <h1>Emite la guía primero</h1>
  <p>La guía aérea y las etiquetas se imprimen después de emitir el número. Los demás documentos se pueden generar en borrador.</p>
  <p><a href="${back}">Volver a la guía</a></p>
</body>
</html>
`;
}
