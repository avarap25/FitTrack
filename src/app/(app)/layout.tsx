import { AppProvider } from "@/components/AppProvider";
import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <main className="mx-auto w-full max-w-xl px-4 pb-32 pt-[max(env(safe-area-inset-top),0.75rem)] md:max-w-3xl">{children}</main>
      <BottomNav />
    </AppProvider>
  );
}
