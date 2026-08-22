import { useQuery } from '@tanstack/react-query'
import { Lock, ShieldCheck } from 'lucide-react'
import { get } from '../../lib/api'
import { useList } from './useResource'
import { Badge, Card, CardHeader, ErrorState, Spinner } from '../../components/ui'

export default function RolesPage() {
  const roles = useList('admin.roles', '/admin/roles')

  const catalogue = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: () => get('/admin/permissions'),
  })

  if (roles.isLoading || catalogue.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    )
  }

  if (roles.isError) return <ErrorState error={roles.error} onRetry={roles.refetch} />

  const groups = catalogue.data?.data ?? {}

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Roles and permissions</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          The API checks these on every request. Hiding a button is not access control, so both
          layers use the same names.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(roles.data?.data ?? []).map((role) => (
          <Card key={role.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-800" aria-hidden="true" />
                <span className="font-medium text-ink-900">{role.name}</span>
                {role.is_protected && (
                  <span title="Referenced by name in code">
                    <Lock className="h-3 w-3 text-ink-400" aria-label="Protected role" />
                  </span>
                )}
              </div>

              <Badge tone="neutral">{role.users_count ?? 0} user(s)</Badge>
            </div>

            <p className="mt-2 text-sm text-ink-500">
              {role.permissions?.length ?? 0} permission(s)
            </p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Permission catalogue"
          description="Every permission the system understands, grouped by area."
        />

        <div className="grid gap-px bg-ink-200 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(groups).map(([group, permissions]) => (
            <div key={group} className="bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{group}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {Object.entries(permissions).map(([name, label]) => (
                  <li key={name} className="text-sm">
                    <span className="text-ink-800">{label}</span>
                    <code className="ml-1.5 rounded bg-ink-100 px-1 text-xs text-ink-500">{name}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
