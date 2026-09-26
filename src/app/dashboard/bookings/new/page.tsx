"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BookingWizard } from "@/components/booking-wizard";
import { PageLoader } from "@/components/ui";
import { isValidDateKey } from "@/lib/shared";

function WizardFromParams() {
  const params = useSearchParams();
  const packageId = Number(params.get("packageId")) || undefined;
  const clientId = Number(params.get("clientId")) || undefined;
  const date = params.get("date");
  const photographerId = Number(params.get("photographer")) || undefined;
  return (
    <BookingWizard
      initialPackageId={packageId}
      initialClientId={clientId}
      initialDate={date && isValidDateKey(date) ? date : undefined}
      initialPhotographerId={photographerId}
    />
  );
}

export default function NewBookingPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <WizardFromParams />
    </Suspense>
  );
}
