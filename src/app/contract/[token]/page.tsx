"use client";

import { useParams } from "next/navigation";
import { ContractSigning } from "@/components/contract-sign";

export default function ContractPage() {
  const { token } = useParams<{ token: string }>();
  return <ContractSigning token={token} />;
}
