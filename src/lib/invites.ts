// Invitación pendiente: quien abre un enlace sin sesión puede registrarse, confirmar el email o entrar
// con OAuth; al llegar a la app se le devuelve a la invitación (ver AppShell).
const KEY = 'rumbo-pending-invite'

export const inviteUrl = (token: string) => `${location.origin}/invitacion/${token}`

export function savePendingInvite(token: string) {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    /* sin almacenamiento: el usuario tendrá que volver a abrir el enlace */
  }
}

export function takePendingInvite(): string | null {
  try {
    const t = localStorage.getItem(KEY)
    localStorage.removeItem(KEY)
    return t
  } catch {
    return null
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nada que limpiar */
  }
}
