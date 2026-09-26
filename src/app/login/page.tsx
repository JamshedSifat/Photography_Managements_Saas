import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, LoginForm } from "@/components/auth-form";
import { PageLoader } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader fullscreen />}>
      <AuthShell title="Welcome back" subtitle="Choose your portal and sign in to continue.">
        <LoginForm />
      </AuthShell>
    </Suspense>
  );
}
