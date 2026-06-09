import { auth } from "@/lib/auth";
import { LandingPage } from "@/components/landing/landing-page";

export default async function Home() {
  const session = await auth();
  return <LandingPage isLoggedIn={!!session?.user} />;
}
