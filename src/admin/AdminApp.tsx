import { Authenticated, Refine } from '@refinedev/core'
import routerProvider, { CatchAllNavigate, NavigateToResource, UnsavedChangesNotifier } from '@refinedev/react-router'
import { dataProvider } from '@refinedev/supabase'
import { useEffect } from 'react'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@admin/components/layout/app-layout'
import { DataShow } from '@admin/components/data-show/data-show'
import { DataTable } from '@admin/components/data-table/data-table'
import { resources } from '@admin/config/resources'
import { supabaseClient } from '@admin/lib/supabase'
import { ThemeContext, useThemeState } from '@admin/lib/use-theme'
import { LoginPage } from '@admin/pages/login-page'
import { authProvider } from '@admin/providers/auth-provider'

// Tailwind + the backoffice theme tokens. Imported here, inside the lazily-loaded
// admin entry, so the whole stylesheet ships in the admin's own chunk -- a visitor
// to the marketing site never downloads it, and Tailwind's preflight reset never
// gets a chance to touch the marketing site's own CSS-module styling.
import '@admin/admin.css'

// Where the CRM lives, accounting for the deploy base (GitHub Pages serves this
// site from a /<repo>/ subpath, so BASE_URL is not just "/" in production).
export const ADMIN_BASENAME = `${import.meta.env.BASE_URL}admin`.replace(/\/{2,}/g, '/')

export default function AdminApp() {
  const themeState = useThemeState()

  // The marketing site should be indexed; this must never be. There is only one
  // index.html for both, so the tag is set at runtime when the CRM actually mounts.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    const previousTitle = document.title
    document.title = 'PROXIMA Backoffice'
    return () => {
      meta.remove()
      document.title = previousTitle
    }
  }, [])

  return (
    <ThemeContext.Provider value={themeState}>
      <BrowserRouter basename={ADMIN_BASENAME}>
        <Refine
        dataProvider={dataProvider(supabaseClient)}
        authProvider={authProvider}
        routerProvider={routerProvider}
        resources={resources.map((r) => ({
          name: r.name,
          list: `/${r.name}`,
          show: `/${r.name}/show/:id`,
          meta: { label: r.label },
        }))}
        options={{ syncWithLocation: true, warnWhenUnsavedChanges: true }}
      >
        <Routes>
          <Route
            element={
              <Authenticated key="authenticated-layout" fallback={<CatchAllNavigate to="/login" />}>
                <AppLayout />
              </Authenticated>
            }
          >
            <Route index element={<NavigateToResource resource={resources[0].name} />} />
            <Route path=":resource">
              <Route index element={<DataTable />} />
              <Route path="show/:id" element={<DataShow />} />
            </Route>
            <Route path="*" element={<NavigateToResource resource={resources[0].name} />} />
          </Route>

          <Route
            element={
              <Authenticated key="authenticated-auth-pages" fallback={<Outlet />}>
                <NavigateToResource resource={resources[0].name} />
              </Authenticated>
            }
          >
            <Route path="/login" element={<LoginPage />} />
          </Route>
        </Routes>
          <UnsavedChangesNotifier />
        </Refine>
      </BrowserRouter>
    </ThemeContext.Provider>
  )
}
