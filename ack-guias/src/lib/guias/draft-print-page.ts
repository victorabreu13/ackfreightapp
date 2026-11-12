/** Browser page when someone opens AWB or labels before the guía is issued. */
export function draftPrintPage(guiaId: string): string {
  const id = guiaId.replace(/[^a-zA-Z0-9_-]/g, "");
  const back = `/guias/${id}`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Issue the guía first</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; max-width: 36rem; margin: 4rem auto; padding: 0 1.25rem; color: #1c1917; }
  a { color: #1a3848; }
</style>
</head>
<body>
  <h1>Issue the guía first</h1>
  <p>The final air waybill and the final labels print after the number is issued. Before issuing you can use <strong>Print without issuing</strong> on the guía: labels with the AWB number you type and a 1-copy draft of the guía.</p>
  <p><a href="${back}">Back to the guía</a></p>
</body>
</html>
`;
}
