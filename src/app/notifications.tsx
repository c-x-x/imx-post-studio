import type { ReactNode } from 'react'

interface NotificationsProps {
  status?: string
  alert?: ReactNode
}

export function Notifications({ status, alert }: NotificationsProps) {
  return <div className="notifications" aria-live="polite">
    {status ? <p className="notification-status" role="status">{status}</p> : null}
    {alert ? <div className="notification-alert" role="alert">{alert}</div> : null}
  </div>
}
