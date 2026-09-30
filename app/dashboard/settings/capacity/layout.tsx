// Restricts meter capacity and GA administration to manually assigned administrators.
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function CapacitySettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard/settings");
  return children;
}
