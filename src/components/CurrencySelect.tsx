import { CURRENCIES, currencyName } from '../lib/money'

export function CurrencySelect({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  const options = CURRENCIES.includes(value) ? CURRENCIES : [value, ...CURRENCIES]
  return (
    <select aria-label={label} className="field w-28 shrink-0 px-2! py-2.5!" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((c) => (
        <option key={c} value={c}>
          {c} · {currencyName(c)}
        </option>
      ))}
    </select>
  )
}
