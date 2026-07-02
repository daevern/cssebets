import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import type { SVGProps } from "react";
import {
  listMyMessages,
  sendMyMessage,
  markMyMessagesRead,
  getMyAttachmentUploadUrl,
  getMyAttachmentDownloadUrl,
} from "@/lib/support.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { BrandText } from "@/components/brand/CsseMark";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Send, Loader2, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { PageShell, StencilPanel } from "@/components/ui/page-shell";
import { SupportStats } from "@/components/trust/SupportStats";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({ meta: [{ title: "Support — CSSEBets" }] }),
  component: SupportPage,
});

function HeadsetIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 200 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-full max-w-[160px] h-auto mx-auto text-[var(--color-neon)] opacity-90 drop-shadow-[0_0_8px_rgba(var(--color-neon-glow-rgb),0.3)]"
      {...props}
    >
      {/* Headband */}
      <path d="M 50 70 Q 50 30 100 30 Q 150 30 150 70" strokeWidth="2.5" />
      {/* Left earcup */}
      <rect x="35" y="65" width="22" height="32" rx="3" />
      <line x1="42" y1="73" x2="50" y2="73" strokeDasharray="2,2" />
      <line x1="42" y1="80" x2="50" y2="80" strokeDasharray="2,2" />
      <line x1="42" y1="87" x2="50" y2="87" strokeDasharray="2,2" />
      {/* Right earcup */}
      <rect x="143" y="65" width="22" height="32" rx="3" />
      <line x1="150" y1="73" x2="158" y2="73" strokeDasharray="2,2" />
      <line x1="150" y1="80" x2="158" y2="80" strokeDasharray="2,2" />
      <line x1="150" y1="87" x2="158" y2="87" strokeDasharray="2,2" />
      {/* Mic boom */}
      <path d="M 143 88 Q 125 95 115 100" />
      <circle cx="112" cy="101" r="4" fill="currentColor" />
      {/* Signal waves */}
      <path d="M 92 100 Q 100 108 108 100" strokeDasharray="3,2" />
    </svg>
  );
}

function SupportPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyMessages);
  const sendFn = useServerFn(sendMyMessage);
  const markFn = useServerFn(markMyMessagesRead);
  const uploadFn = useServerFn(getMyAttachmentUploadUrl);
  const downloadFn = useServerFn(getMyAttachmentDownloadUrl);

  const q = useQuery({
    queryKey: ["my-support-messages"],
    queryFn: () => listFn({}),
    refetchInterval: 10_000,
  });

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [q.data?.messages.length]);

  useEffect(() => {
    if (q.data?.conversationId) markFn({}).catch(() => {});
    qc.invalidateQueries({ queryKey: ["my-support-unread"] });
  }, [q.data?.conversationId, q.data?.messages.length]);

  useEffect(() => {
    if (!q.data?.conversationId) return;
    const ch = supabase.channel(`support-${q.data.conversationId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "support_messages",
        filter: `conversation_id=eq.${q.data.conversationId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ["my-support-messages"] });
        qc.invalidateQueries({ queryKey: ["my-support-unread"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [q.data?.conversationId, qc]);

  async function uploadFile(file: File): Promise<{ path: string; name: string; type: string } | null> {
    try {
      const { path, token } = await uploadFn({ data: { fileName: file.name, contentType: file.type } });
      const { error } = await supabase.storage
        .from("support-attachments").uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (error) throw error;
      return { path, name: file.name, type: file.type };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      return null;
    }
  }

  async function send(file?: File) {
    if (sending) return;
    const body = text.trim();
    if (!body && !file) return;
    setSending(true);
    try {
      let attachment: { path: string; name: string; type: string } | null = null;
      if (file) {
        attachment = await uploadFile(file);
        if (!attachment) { setSending(false); return; }
      }
      await sendFn({
        data: {
          body: body || undefined,
          attachmentPath: attachment?.path,
          attachmentName: attachment?.name,
          attachmentType: attachment?.type,
        },
      });
      setText("");
      qc.invalidateQueries({ queryKey: ["my-support-messages"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function openAttachment(path: string) {
    try {
      const { url } = await downloadFn({ data: { path } });
      window.open(url, "_blank", "noopener");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  const messages = (q.data?.messages ?? []) as any[];

  return (
    <PageShell kicker="DIRECT LINE · OPEN" title="Help &" titleAccent="Search" wide>
      <SupportStats />
      <StencilPanel
        accent
        kicker={<><span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-neon)] animate-pulse" /> Live channel</>}
        meta={<><BrandText /> team</>}
      >
        <div className="flex flex-col h-[60vh] min-h-[400px] -mx-1">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-2 space-y-3">
            {q.isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-5 w-5 animate-spin inline text-[var(--color-neon)]" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <HeadsetIcon />
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                  Channel is quiet.
                </p>
                <p className="text-xs text-[var(--color-ink-muted)] max-w-xs">
                  Send the first message — our team picks up fast.
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] border px-3 py-2 text-sm ${
                        mine
                          ? "bg-[var(--color-neon)]/10 border-[var(--color-neon)]/40 text-[var(--color-ink)]"
                          : "bg-[var(--color-surface)]/60 border-[var(--color-surface-border)] text-[var(--color-ink)]"
                      }`}
                    >
                      {!mine && (
                        <div className="text-[10px] font-bold tracking-[0.04em] text-[var(--color-neon)] mb-0.5">
                          <BrandText /> <span className="uppercase tracking-[0.22em]">Support</span>
                        </div>
                      )}
                      {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                      {m.attachment_path && (
                        <button
                          onClick={() => openAttachment(m.attachment_path)}
                          className="mt-1 inline-flex items-center gap-1 text-xs underline text-[var(--color-neon)]"
                        >
                          <FileText className="h-3 w-3" /> {m.attachment_name || "attachment"} <Download className="h-3 w-3" />
                        </button>
                      )}
                      <div className="text-[10px] mt-1 text-[var(--color-ink-muted)]">
                        {new Date(m.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-dashed border-[var(--color-surface-border)] pt-3 mt-2 flex items-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={sending}
              title="Attach file"
              className="text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf"
              onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (f) await send(f);
              }}
            />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message…"
              rows={1}
              className="flex-1 min-h-[40px] max-h-32 resize-none bg-[var(--color-surface)]/60 border-[var(--color-surface-border)]"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <Button
              onClick={() => send()}
              disabled={sending || !text.trim()}
              size="icon"
              className="bg-[var(--color-neon)] text-[var(--color-surface)] hover:bg-[var(--color-neon)]/90"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </StencilPanel>
    </PageShell>
  );
}
