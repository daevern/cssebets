import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog } from "@/components/ui/dialog";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";
import {
  Loader2,
  Check,
  Copy,
  Upload,
  FileCheck,
  X,
  Building2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  getMyWallet,
  createDraftPointRequest,
  attachProofToRequest,
  submitPointRequest,
  cancelDraftPointRequest,
} from "@/lib/wallet.functions";

const BANK_NAME = "CIMB";
const BANK_ACCOUNT_NAME = "BRICKSPLUG ENTERPRISE SD BHD";
const BANK_ACCOUNT_NUMBER = "8010575969";

const ACCEPTED = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];
const MAX_SIZE = 10 * 1024 * 1024;
const PROOF_BUCKET = "point-request-proofs";

/* ---------- shared button styles ---------- */

function GhostBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-md px-4 py-2.5 text-[13px] font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function NeonBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--color-neon)] px-5 py-2.5 text-[13px] font-semibold text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/* ---------- copy row ---------- */

function CopyRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Could not copy");
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="group flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-surface-border)] bg-[#070D0A] px-3 py-2 text-left transition-colors hover:border-[var(--color-ink-muted)]/40"
    >
      <div className="min-w-0">
        <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
          {label}
        </div>
        <div
          className={`truncate text-[13px] font-semibold leading-tight text-[var(--color-ink)] ${
            mono ? "font-mono tabular-nums" : ""
          }`}
        >
          {value || "—"}
        </div>
      </div>
      <span className="shrink-0 text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-neon)]">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </span>
    </button>
  );
}

/* ---------- main modal ---------- */

export function TopUpInstructionsModal({
  open,
  amount,
  onOpenChange,
}: {
  open: boolean;
  amount: number;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();

  const wFn = useServerFn(getMyWallet);
  const draftFn = useServerFn(createDraftPointRequest);
  const attachFn = useServerFn(attachProofToRequest);
  const submitFn = useServerFn(submitPointRequest);
  const cancelFn = useServerFn(cancelDraftPointRequest);

  const wallet = useQuery({
    queryKey: ["my-wallet", uid],
    queryFn: () => wFn({}),
    enabled: !!uid && open,
    staleTime: 5_000,
  });
  const profile = useQuery({
    queryKey: ["my-profile-ref", uid],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("public_reference")
        .eq("id", uid!)
        .maybeSingle();
      return { reference: (data as any)?.public_reference ?? null };
    },
    enabled: !!uid && open,
    staleTime: 60_000,
  });

  const reference =
    profile.data?.reference ?? wallet.data?.publicReference ?? "";

  const [draftId, setDraftId] = useState<string | null>(null);
  const [proofName, setProofName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setDraftId(null);
      setProofName(null);
      setUploading(false);
      setSuccess(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  async function handleFile(file: File | null) {
    if (!file || !uid) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Unsupported file. Allowed: PDF, JPG, PNG, WEBP.");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("File too large (max 10MB).");
      return;
    }
    if (!amount || amount < 50) {
      toast.error("Invalid amount.");
      return;
    }
    setUploading(true);
    try {
      const { id }: any = await draftFn({
        data: { amount, reason: null },
      });
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `point-requests/${uid}/${id}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from(PROOF_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      await attachFn({
        data: {
          requestId: id,
          filePath: path,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        },
      });
      setDraftId(id);
      setProofName(file.name);
      toast.success("Receipt uploaded.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeProof() {
    if (!draftId) return;
    try {
      await cancelFn({ data: { requestId: draftId } });
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    setDraftId(null);
    setProofName(null);
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!draftId) throw new Error("Upload your receipt first.");
      return submitFn({
        data: { requestId: draftId, amount, reason: null },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-point-requests", uid] });
      setSuccess(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function copyAll() {
    const text = [
      `Bank Name: ${BANK_NAME}`,
      `Account Name: ${BANK_ACCOUNT_NAME}`,
      `Account Number: ${BANK_ACCOUNT_NUMBER}`,
      `Amount: RM${amount.toLocaleString()}`,
      `Reference ID: ${reference || "—"}`,
      ``,
      `Please include the Reference ID in your bank transfer reference.`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Full payment details copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  /* ---------- success state ---------- */
  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <StencilDialogContent
          kicker="Top up · Submitted"
          title="Request received"
          description="Points will be credited once admin verifies your payment."
          footer={
            <NeonBtn onClick={() => onOpenChange(false)}>Done</NeonBtn>
          }
        >
          <div className="flex flex-col items-center py-6 animate-fade-in">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-neon)]/10 ring-1 ring-[var(--color-neon)]/30">
              <Check
                className="h-5 w-5 text-[var(--color-neon)]"
                strokeWidth={3}
              />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="font-display text-4xl font-semibold tabular-nums text-[var(--color-ink)]">
                {amount.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-[var(--color-ink-muted)]">
                pts
              </span>
            </div>
          </div>
        </StencilDialogContent>
      </Dialog>
    );
  }

  const canSubmit = !!draftId && !uploading && !submit.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <StencilDialogContent
        kicker={
          <>
            <Building2 className="h-3 w-3" /> Top up · Payment instructions
          </>
        }
        title="Send bank transfer"
        size="md"
        footer={
          <>
            <GhostBtn
              onClick={() => onOpenChange(false)}
              disabled={submit.isPending}
            >
              Cancel
            </GhostBtn>
            <NeonBtn onClick={() => submit.mutate()} disabled={!canSubmit}>
              {submit.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting
                </>
              ) : (
                <>
                  Submit request{" "}
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </NeonBtn>
          </>
        }
      >
        <div className="space-y-5">
          {/* Amount hero */}
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
              Transfer this amount
            </div>
            <div className="mt-1 flex items-baseline justify-center gap-1.5">
              <span className="font-display text-5xl font-semibold tabular-nums tracking-tight text-[var(--color-ink)]">
                {amount.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-[var(--color-ink-muted)]">
                pts
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">
              = RM{amount.toLocaleString()}
            </div>
          </div>

          {/* Bank details */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">
                Bank details
              </span>
              <button
                type="button"
                onClick={copyAll}
                className="text-[11px] font-semibold text-[var(--color-neon)] transition-colors hover:brightness-110"
              >
                Copy all
              </button>
            </div>
            <div className="space-y-1.5">
              <CopyRow label="Bank" value={BANK_NAME} />
              <CopyRow label="Account name" value={BANK_ACCOUNT_NAME} />
              <CopyRow
                label="Account number"
                value={BANK_ACCOUNT_NUMBER}
                mono
              />
              <CopyRow label="Reference ID" value={reference} mono />
            </div>
            <p className="pt-1 text-[11px] leading-snug text-[var(--color-ink-muted)]">
              Include the Reference ID in your bank transfer reference so we
              can verify your top-up faster.
            </p>
          </div>

          {/* Upload receipt */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-[var(--color-ink-muted)]">
              Upload receipt
            </div>
            {!draftId ? (
              <label
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-4 text-[12px] font-medium transition-colors ${
                  uploading
                    ? "border-[var(--color-surface-border)] text-[var(--color-ink-muted)]"
                    : "border-[var(--color-surface-border)] text-[var(--color-ink-muted)] hover:border-[var(--color-neon)]/40 hover:text-[var(--color-ink)]"
                }`}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>
                  {uploading
                    ? "Uploading…"
                    : "Choose file · PDF, JPG, PNG, WEBP (max 10MB)"}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/[0.06] px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <FileCheck className="h-4 w-4 shrink-0 text-[var(--color-neon)]" />
                  <span className="truncate text-[12px] font-medium text-[var(--color-ink)]">
                    {proofName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={removeProof}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                >
                  <X className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </StencilDialogContent>
    </Dialog>
  );
}
