import { Sidebar } from "@/components/sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="min-h-screen px-4 pb-12 pt-20 sm:px-6 lg:ml-[268px] lg:px-8 lg:pt-8 xl:px-10">
        <div className="mx-auto max-w-[1420px]">{children}</div>
      </main>
    </div>
  );
}
