import { useGetIdentity, useLogout } from '@refinedev/core'
import { LogOut, Moon, Sun } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

import { Button } from '@admin/components/ui/button'
import { resources } from '@admin/config/resources'
import { useTheme } from '@admin/lib/use-theme'
import { cn } from '@admin/lib/utils'

export function AppLayout() {
  const { mutate: logout } = useLogout()
  const { data: identity } = useGetIdentity<{ id: string; name?: string }>()
  const { theme, toggle } = useTheme()

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="px-4 py-5">
          <p className="text-sm font-semibold tracking-tight">PROXIMA</p>
          <p className="text-xs text-muted-foreground">Backoffice</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {resources.map((resource) => (
            <NavLink
              key={resource.name}
              to={`/${resource.name}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )
              }
            >
              <resource.icon className="size-4" />
              {resource.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3">
          <p className="truncate px-1 pb-2 text-xs text-muted-foreground">{identity?.name}</p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => logout()}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  )
}
