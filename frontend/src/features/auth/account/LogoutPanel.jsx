import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthStore } from '../../../stores/authStore'
import { useToast } from '../../../components/ui'
import { AccountButton, Panel } from './shell'

export function LogoutPanel() {
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const signOut = async () => {
    setBusy(true)

    try {
      await logout()
      navigate('/')
    } catch {
      // The local session is cleared either way, so the only thing left to
      // report is that the server was not told -- not worth blocking on.
      toast.error('Signed out on this device, but the server could not be reached.')
      navigate('/')
    }
  }

  return (
    <Panel title="Logout" description="Are you sure you want to log out?">
      <AccountButton type="button" onClick={signOut} disabled={busy} className="mt-1">
        {busy ? 'Signing out…' : 'Yes, Logout'}
      </AccountButton>
    </Panel>
  )
}
