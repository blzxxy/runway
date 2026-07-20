import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "@/components/bottom-nav";
import FinanceProvider from "@/components/finance-provider";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.onboarded) redirect("/onboarding");

  return (
    <FinanceProvider userId={user.id}>
      <main className="max-w-md mx-auto px-4 pt-4 pb-36">{children}</main>
      <BottomNav />
    </FinanceProvider>
  );
}
