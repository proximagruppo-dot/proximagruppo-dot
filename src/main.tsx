import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'

// The backoffice CRM is an unlinked route: nothing on the marketing site points at
// it, it is reached only by typing /admin, and it is gated behind a Supabase login.
// It is lazily imported so none of its weight (Refine, Supabase, Tailwind) lands in
// the marketing site's bundle -- a normal visitor never downloads a byte of it.
const AdminApp = lazy(() => import('./admin/AdminApp.tsx'))

const adminPath = `${import.meta.env.BASE_URL}admin`.replace(/\/{2,}/g, '/')
const { pathname } = window.location
const isAdmin = pathname === adminPath || pathname.startsWith(`${adminPath}/`)

const root = createRoot(document.getElementById('root')!)

if (isAdmin) {
  root.render(
    <StrictMode>
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    </StrictMode>,
  )
} else {
  // Only the public site pulls in the public site's global stylesheet.
  void Promise.all([import('./styles/theme.css'), import('./App.tsx')]).then(([, { default: App }]) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}
