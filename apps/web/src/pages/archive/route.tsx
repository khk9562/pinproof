import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/archive')({
  component: ArchiveLayout,
});

function ArchiveLayout() {
  return <Outlet />;
}
