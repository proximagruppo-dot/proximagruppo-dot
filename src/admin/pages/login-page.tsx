import { useLogin } from '@refinedev/core'
import { Lock, Mail, Moon, Sun } from 'lucide-react'
import { useState, type ComponentProps, type FormEvent } from 'react'

import { Button } from '@admin/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@admin/components/ui/card'
import { Input } from '@admin/components/ui/input'
import { Label } from '@admin/components/ui/label'
import { useTheme } from '@admin/lib/use-theme'
import { cn } from '@admin/lib/utils'

function IconInput({ icon: Icon, className, ...props }: ComponentProps<typeof Input> & { icon: typeof Mail }) {
  return (
    <div className="relative flex items-center">
      <Icon className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
      <Input className={cn('h-10 pl-9', className)} {...props} />
    </div>
  )
}

export function LoginPage() {
  const { mutate: login, isPending: isLoading } = useLogin()
  const { theme, toggle } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    // authProvider.login (which IS useLogin's mutationFn) catches its own errors and
    // always *resolves*, never rejects -- react-query's onError never fires for a
    // { success: false } result, only onSuccess does, with the failure as its data.
    login(
      { email, password },
      { onSuccess: (data) => { if (!data.success) setError(data.error?.message ?? 'Login failed') } }
    )
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4"
        onClick={toggle}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
      <div className="w-full max-w-sm">
        <Card className="shadow-lg">
          <CardHeader className="items-center text-center">
            <CardTitle className="text-xl">PROXIMA Backoffice</CardTitle>
            <CardDescription>Sign in to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-email">Email</Label>
                <IconInput
                  id="login-email"
                  icon={Mail}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-password">Password</Label>
                <IconInput
                  id="login-password"
                  icon={Lock}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={isLoading} className="h-10 w-full">
                {isLoading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
