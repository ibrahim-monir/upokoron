import { useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { get } from '../../lib/api'
import { useList, useWrite } from './useResource'
import { dateTime, initials } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Pagination,
  Spinner,
  TableWrap,
  Td,
  Th,
} from '../../components/ui'

export default function UsersPage() {
  const can = useAuthStore((state) => state.can)
  const currentUser = useAuthStore((state) => state.user)
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)

  const query = useList('admin.users', '/admin/users', { page })
  const write = useWrite('admin.users', { onSuccess: () => setCreating(false) })

  const roles = useQuery({
    queryKey: ['admin', 'roles', 'options'],
    queryFn: () => get('/admin/roles'),
  })

  const users = query.data?.data ?? []

  const submit = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)

    write.mutate({
      url: '/admin/users',
      body: {
        name: data.get('name'),
        email: data.get('email') || null,
        phone: data.get('phone') || null,
        password: data.get('password'),
        password_confirmation: data.get('password_confirmation'),
        roles: data.getAll('roles'),
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Users</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            You can only grant roles whose permissions you already hold yourself.
          </p>
        </div>

        {can('users.manage') && !creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New user
          </Button>
        )}
      </div>

      {creating && (
        <Card>
          <CardHeader title="New user" />
          <form onSubmit={submit} className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Full name" name="name" required />
            <Field label="Email" name="email" type="email" />
            <Field label="Mobile number" name="phone" placeholder="01712345678" />
            <div />
            <Field label="Password" name="password" type="password" required />
            <Field label="Confirm password" name="password_confirmation" type="password" required />

            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium text-ink-800">Roles</legend>
              <div className="flex flex-wrap gap-3">
                {(roles.data?.data ?? []).map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm text-ink-700">
                    <input type="checkbox" name="roles" value={role.name} className="h-4 w-4 rounded border-ink-300" />
                    {role.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" loading={write.isPending}>
                Create user
              </Button>
              <Button variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}

      {query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users" />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Roles</Th>
                <Th>Last seen</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-ink-50">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
                        {initials(user.name)}
                      </span>
                      <span className="font-medium text-ink-900">{user.name}</span>
                      {user.id === currentUser?.id && <Badge tone="brand">You</Badge>}
                    </div>
                  </Td>
                  <Td className="text-ink-600">
                    {user.email ?? '—'}
                    {user.phone && <span className="block text-xs text-ink-400">{user.phone}</span>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {(user.roles ?? []).map((role) => (
                        <Badge key={role} tone={role === 'owner' ? 'accent' : 'neutral'}>
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td className="text-xs text-ink-500">{dateTime(user.last_login_at)}</Td>
                  <Td>
                    <Badge tone={user.is_active ? 'success' : 'danger'}>
                      {user.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    {can('users.manage') && user.id !== currentUser?.id && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Remove ${user.name}? Their sign-in is revoked immediately.`)) {
                            write.mutate({ method: 'delete', url: `/admin/users/${user.id}` })
                          }
                        }}
                        className="text-sm font-medium text-danger-700 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          <Pagination meta={query.data?.meta} onPage={setPage} />
        </>
      )}
    </div>
  )
}
