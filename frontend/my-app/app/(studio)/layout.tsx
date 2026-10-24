import { SessionProvider } from '@/lib/session/SessionProvider';

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="studio-root">
        {children}
      </div>
    </SessionProvider>
  );
}