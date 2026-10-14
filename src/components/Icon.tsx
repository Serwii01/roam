/** Icono de Material Symbols (la fuente se carga en index.css). */
export function Icon({ name, className = '', filled = false, size }: { name: string; className?: string; filled?: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      className={`material-symbols-outlined select-none ${className}`}
      style={{ fontSize: size, fontVariationSettings: filled ? "'FILL' 1" : undefined }}
    >
      {name}
    </span>
  )
}
