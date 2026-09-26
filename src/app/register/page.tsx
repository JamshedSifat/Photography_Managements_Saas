import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, RegisterForm } from "@/components/auth-form";
import { PageLoader } from "@/components/ui";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <Suspense fallback={<PageLoader fullscreen />}>
      <AuthShell title="Create your account" subtitle="Clients can register instantly. Staff accounts require a studio invite code.">
        <RegisterForm />
      </AuthShell>
    </Suspense>
  );
}
