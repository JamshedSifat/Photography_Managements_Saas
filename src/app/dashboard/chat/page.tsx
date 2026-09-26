"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { BookingChat } from "@/components/chat";
import { PageHeader } from "@/components/ui";

function ChatContent() {
  const params = useSearchParams();
  const room = Number(params.get("room"));
  return <BookingChat initialRoomId={Number.isFinite(room) && room > 0 ? room : undefined} />;
}

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Messaging"
        title="Booking conversations"
        description="One private, permanent conversation per booking — only the client, the assigned photographer and studio admins can take part."
      />
      <Suspense fallback={<div className="h-[560px] animate-pulse rounded-3xl bg-white/[0.03]" />}>
        <ChatContent />
      </Suspense>
      <p className="flex items-center gap-2 text-[11px] text-white/30">
        <MessagesSquare className="h-3.5 w-3.5" /> Messages, photos and files are delivered instantly and kept with the booking record.
      </p>
    </div>
  );
}
