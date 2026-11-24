import { useCallback, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { DocViewer } from './DocViewer'
import { Icon } from './Icon'
import { api } from '../lib/api'

/** Abre la foto del ticket de un gasto. */
export function ReceiptButton({ path, label, className = '' }: { path: string; label: string; className?: string }) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const close = useCallback(() => setBlob(null), [])
  const open = useMutation({
    mutationFn: async () => {
      const res = await fetch(await api.receiptUrl(path))
      if (!res.ok) throw new Error('No se ha podido abrir el ticket')
      setBlob(await res.blob())
    },
  })
  return (
    <>
      <button type="button" aria-label={label} title={open.isError ? 'No se ha podido abrir: necesita conexión' : label} className={className} disabled={open.isPending} onClick={() => open.mutate()}>
        <Icon name={open.isError ? 'cloud_off' : 'receipt_long'} size={18} />
      </button>
      {blob && <DocViewer blob={blob} name="Ticket.jpg" onClose={close} />}
    </>
  )
}
