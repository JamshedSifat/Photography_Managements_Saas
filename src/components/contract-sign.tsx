"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { toast } from "sonner";
import { Aperture, Check, Clock, FileCheck2, KeyRound, Lock, Mail, PenLine, RotateCcw, ShieldCheck, Type, UserRound } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { Button, Card, Field, Input, PageLoader, Textarea, Toggle } from "./ui";
import { formatDateKey, formatDuration, formatMoney, minutesToLabel, timeRangeLabel, type ContractPublicDTO } from "@/lib/shared";

type Phase = "loading" | "verify" | "contract" | "signed";

function SignaturePad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = el.getBoundingClientRect();
    el.width = rect.width * ratio;
    el.height = rect.height * ratio;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#d1a95c";
    ctx.lineWidth = 2.4;
  }, []);

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    last.current = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const next = point(e);
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    last.current = next;
    setHasInk(true);
  };
  const up = () => {
    drawing.current = false;
    last.current = null;
    if (canvas.current) onChange(canvas.current.toDataURL("image/png"));
  };
  const clear = () => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    setHasInk(false);
    onChange("");
  };
  void value;

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <canvas ref={canvas} className="h-36 w-full touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        <span className="pointer-events-none absolute inset-x-5 bottom-8 border-b border-white/15" />
        <span className="pointer-events-none absolute bottom-2 left-5 text-[10px] uppercase tracking-[0.2em] text-white/25">Draw your signature here</span>
      </div>
      <button type="button" onClick={clear} disabled={!hasInk} className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white disabled:opacity-30">
        <RotateCcw className="h-3.5 w-3.5" /> Clear signature
      </button>
    </div>
  );
}

export function ContractSigning({ token }: { token: string }) {
  const [contract, setContract] = useState<ContractPublicDTO | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [signatureType, setSignatureType] = useState<"typed" | "drawn">("typed");
  const [signatureData, setSignatureData] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `/contracts/${encodeURIComponent(token)}`;

  useEffect(() => {
    void (async () => {
      try {
        const saved = window.sessionStorage.getItem(`contract-access-${token}`);
        const res = await api<ContractPublicDTO>(saved ? `${key}?access=${encodeURIComponent(saved)}` : key);
        setContract(res);
        setEmail(res.client.email);
        if (res.package) {
          setSignerName(res.signerName ?? res.client.name);
          setSignerEmail(res.signerEmail ?? res.client.email);
        }
        setAccessToken(saved);
        setPhase(saved && res.package ? "contract" : "verify");
      } catch (e) {
        setError(errorMessage(e, "This contract link is invalid or expired."));
        setPhase("verify");
      }
    })();
  }, [key, token]);

  async function sendOtp() {
    setBusy("otp");
    setError(null);
    try {
      await api(`${key}/otp`, { method: "POST", body: { email } });
      toast.success("A verification code was sent to your email");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    setBusy("verify");
    setError(null);
    try {
      const res = await api<{ accessToken: string }>(`${key}/verify`, { method: "POST", body: { code } });
      window.sessionStorage.setItem(`contract-access-${token}`, res.accessToken);
      const next = await api<ContractPublicDTO>(`${key}?access=${encodeURIComponent(res.accessToken)}`);
      setAccessToken(res.accessToken);
      setContract(next);
      setSignerName(next.client.name);
      setSignerEmail(next.client.email);
      setPhase("contract");
      toast.success("Contract unlocked");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (!contract || !accessToken || !consent || signatureData.trim().length < 2) return;
    setBusy("sign");
    setError(null);
    try {
      await api(`${key}/sign`, { method: "POST", body: { accessToken, signerName, signerEmail, signatureType, signatureData } });
      setPhase("signed");
      toast.success("Agreement signed — a PDF copy is on its way");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (phase === "loading") return <PageLoader fullscreen label="Loading secure agreement" />;

  return (
    <div className="min-h-screen ambient px-4 py-6 sm:px-6 sm:py-10">
      <header className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl gold-fill text-ink-950"><Aperture className="h-5 w-5" /></span>
          <span className="font-display text-xl tracking-[0.3em] text-white">LUMIÈRE</span>
        </Link>
        <span className="flex items-center gap-2 text-xs text-white/40"><Lock className="h-3.5 w-3.5 text-gold-300" /> Secure document</span>
      </header>

      <main className="mx-auto mt-10 max-w-5xl">
        {phase === "verify" ? (
          <div className="mx-auto max-w-md animate-scale-in">
            <Card className="p-7 sm:p-9">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gold-400/10 text-gold-300"><KeyRound className="h-7 w-7" /></span>
              <h1 className="mt-6 text-center font-display text-3xl text-white">Verify your email</h1>
              <p className="mt-2 text-center text-sm leading-relaxed text-white/50">We need to verify the booking email before showing the agreement. We&apos;ll send a one-time code that expires in 10 minutes.</p>
              {error ? <p className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-xs text-rose-200">{error}</p> : null}
              <div className="mt-6 space-y-4">
                <Field label="Booking email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
                <Button className="w-full" loading={busy === "otp"} onClick={sendOtp}><Mail className="h-4 w-4" /> Send verification code</Button>
                <div className="flex items-center gap-3"><span className="h-px flex-1 bg-white/10" /><span className="text-[10px] uppercase tracking-[0.2em] text-white/30">then</span><span className="h-px flex-1 bg-white/10" /></div>
                <Field label="6-digit code"><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className="text-center text-lg tracking-[0.45em]" /></Field>
                <Button variant="outline" className="w-full" disabled={code.length !== 6} loading={busy === "verify"} onClick={verify}><ShieldCheck className="h-4 w-4" /> Verify & view agreement</Button>
              </div>
              <p className="mt-6 text-center text-[11px] text-white/30">The secure link and code are unique to this booking.</p>
            </Card>
          </div>
        ) : phase === "signed" ? (
          <div className="mx-auto max-w-lg animate-scale-in"><Card className="p-8 text-center sm:p-12"><span className="mx-auto grid h-20 w-20 place-items-center rounded-full gold-fill text-ink-950"><Check className="h-9 w-9" /></span><h1 className="mt-6 font-display text-4xl text-white">Agreement signed</h1><p className="mt-3 text-sm leading-relaxed text-white/55">Thank you, {signerName}. A signed PDF has been emailed to you and the studio for your records.</p><div className="mt-7 rounded-2xl glass-gold p-4 text-sm text-gold-100/80"><FileCheck2 className="mx-auto h-6 w-6 text-gold-300" /><p className="mt-2">Contract ID {contract?.contractNumber}</p></div><Link href="/" className="mt-7 inline-flex text-sm text-gold-300 hover:text-gold-200">Return to Lumière →</Link></Card></div>
        ) : contract ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <Card className="animate-fade-up p-7 sm:p-10">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6"><div><p className="text-[10px] uppercase tracking-[0.3em] text-gold-300">Photography services agreement</p><h1 className="mt-2 font-display text-4xl text-white">{contract.studio.name}</h1></div><div className="text-right text-xs text-white/40"><p>{contract.contractNumber}</p><p>Booking {contract.booking.reference}</p></div></div>
              <div className="prose prose-invert mt-7 max-w-none text-sm leading-relaxed text-white/65"><h2 className="font-display text-2xl font-normal text-white">1. Services & session details</h2><p>This agreement covers the professional photography services described below. The Studio will provide the listed package deliverables with reasonable artistic direction and care.</p><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-white/[0.03] p-4"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-300">Session</p><p className="mt-1 text-white">{contract.booking.title}</p><p>{formatDateKey(contract.booking.date, "long")}</p><p>{timeRangeLabel(contract.booking.startMinutes, contract.booking.endMinutes)} · {formatDuration(contract.booking.endMinutes - contract.booking.startMinutes)}</p></div><div className="rounded-2xl bg-white/[0.03] p-4"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-300">Location & package</p><p className="mt-1 text-white">{contract.booking.location ?? contract.studio.address ?? "Studio"}</p><p>{contract.package?.name ?? contract.booking.title}</p><p>{formatMoney(contract.package?.priceCents ?? contract.booking.totalCents, "USD")}</p></div></div><h2 className="mt-8 font-display text-2xl font-normal text-white">2. Payment & cancellation</h2><p>The session fee is due according to the invoice. The required advance reserves the date. Rescheduling is subject to availability. The Studio will communicate any cancellation or refund decisions directly to the Client.</p><h2 className="mt-8 font-display text-2xl font-normal text-white">3. Copyright & usage</h2><p>The Studio retains copyright in all images. The Client receives a personal, non-exclusive license for private use. Commercial use, resale or alteration requires written permission.</p><h2 className="mt-8 font-display text-2xl font-normal text-white">4. Acceptance</h2><p>By signing below, the Client confirms they have read, understood and agree to this agreement and the booking details.</p></div>
              <div className="mt-8 border-t border-white/10 pt-7"><p className="text-[10px] uppercase tracking-[0.25em] text-gold-300">Your digital signature</p><div className="mt-4 flex gap-2"><Button variant={signatureType === "typed" ? "primary" : "outline"} size="sm" onClick={() => { setSignatureType("typed"); setSignatureData(""); }}><Type className="h-3.5 w-3.5" /> Type</Button><Button variant={signatureType === "drawn" ? "primary" : "outline"} size="sm" onClick={() => { setSignatureType("drawn"); setSignatureData(""); }}><PenLine className="h-3.5 w-3.5" /> Draw</Button></div><div className="mt-4">{signatureType === "typed" ? <Field label="Type your full name"><Input value={signatureData} onChange={(e) => setSignatureData(e.target.value)} placeholder={signerName || "Your full name"} className="font-display text-2xl italic" /></Field> : <SignaturePad value={signatureData} onChange={setSignatureData} />}</div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Signer name"><Input value={signerName} onChange={(e) => setSignerName(e.target.value)} /></Field><Field label="Signer email"><Input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} /></Field></div><label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-white/60"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#d1a95c]" /><span>I agree to the terms above and authorize this digital signature to execute the agreement.</span></label>{error ? <p className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-xs text-rose-200">{error}</p> : null}<Button size="lg" className="mt-6 w-full sm:w-auto" disabled={!consent || !signatureData || !signerName || !signerEmail} loading={busy === "sign"} onClick={sign}><FileCheck2 className="h-4 w-4" /> Sign & finalize agreement</Button></div>
            </Card>
            <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start"><Card className="glass-gold"><p className="flex items-center gap-2 text-sm text-gold-100"><ShieldCheck className="h-4 w-4" /> Secure & legally traceable</p><ul className="mt-4 space-y-3 text-xs leading-relaxed text-white/55"><li>• Email OTP verification before viewing</li><li>• Timestamp and contract ID recorded</li><li>• Signer email, IP and device recorded</li><li>• Signed PDF emailed to both parties</li></ul></Card><Card><p className="flex items-center gap-2 text-sm text-white"><UserRound className="h-4 w-4 text-gold-300" /> Signing as</p><p className="mt-3 text-white">{contract.client.name}</p><p className="text-xs text-white/45">{contract.client.email}</p><p className="mt-4 flex items-center gap-2 text-xs text-white/45"><Clock className="h-3.5 w-3.5" /> Session {formatDateKey(contract.booking.date, "medium")}</p></Card></aside>
          </div>
        ) : null}
      </main>
    </div>
  );
}
