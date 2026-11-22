import { Outlet, createRootRoute } from '@tanstack/react-router';
import { AppShellLayout } from '@/app/layout/AppShellLayout';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <AppShellLayout>
      <Outlet />
    </AppShellLayout>
  );
}
