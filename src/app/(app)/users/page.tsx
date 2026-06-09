import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UsersClient } from "@/components/users/users-client";

export default async function UsersPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");
  return <UsersClient />;
}
