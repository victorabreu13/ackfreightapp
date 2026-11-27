import type { LabelPreview } from "@/lib/guias/custom-label";

/**
 * The label as the PDF will draw it, in the page itself. It does not depend on the browser having a PDF viewer, which
 * the panel of some apps does not. The PDF stays the file that is printed.
 */
export function LabelPreviewSvg({ preview }: { preview: LabelPreview }) {
  const { width, height, border } = preview;
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Label preview" className="block w-full rounded-md border border-border bg-white shadow-sm" style={{ aspectRatio: `${width} / ${height}`, maxHeight: "70vh" }}>
        <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
        {border > 0 ? <rect x={border / 2 + 4} y={border / 2 + 4} width={width - border - 8} height={height - border - 8} fill="none" stroke="#000000" strokeWidth={border} /> : null}
        {preview.rows.map((row, index) =>
          row.text ? (
            <text
              key={index}
              x={row.x}
              y={row.y}
              textAnchor={preview.textAnchor}
              fontFamily={preview.fontFamily}
              fontWeight={preview.fontWeight}
              fontStyle={preview.fontStyle}
              fontSize={preview.size}
              textDecoration={preview.underline ? "underline" : undefined}
              fill="#000000"
              xmlSpace="preserve"
            >
              {row.text}
            </text>
          ) : null,
        )}
      </svg>
      <p className="text-xs text-muted-foreground">This is how the label will print. Open PDF to print sends the real file to the printer.</p>
    </div>
  );
}
