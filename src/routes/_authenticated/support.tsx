import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Headset, Paperclip, Send, Loader2, FileText, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({ meta: [{ title: "Support — CSSEBets" }] }),
  component: SupportPage,
});

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

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <header className="flex items-center gap-2">
        <Headset className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Support chat</h1>
          <p className="text-xs text-muted-foreground">Reach our customer support team.</p>
        </div>
      </header>

      <div className="rounded-xl border bg-card flex flex-col h-[60vh] min-h-[400px]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {q.isLoading ? (
            <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          ) : (q.data?.messages ?? []).length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No messages yet. Send the first message below — our team will respond shortly.
            </div>
          ) : (
            (q.data!.messages as any[]).map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                    {!mine && <div className="text-[10px] uppercase opacity-70 mb-0.5">CSSEBets Support</div>}
                    {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                    {m.attachment_path && (
                      <button onClick={() => openAttachment(m.attachment_path)}
                        className={`mt-1 inline-flex items-center gap-1 text-xs underline ${mine ? "text-primary-foreground/90" : "text-primary"}`}>
                        <FileText className="h-3 w-3" /> {m.attachment_name || "attachment"} <Download className="h-3 w-3" />
                      </button>
                    )}
                    <div className={`text-[10px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {new Date(m.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="border-t p-2 flex items-end gap-2">
          <Button variant="ghost" size="icon" type="button" onClick={() => fileRef.current?.click()} disabled={sending} title="Attach file">
            <Paperclip className="h-4 w-4" />
          </Button>
          <input ref={fileRef} type="file" className="hidden"
            accept="image/*,application/pdf"
            onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (f) await send(f);
            }}
          />
          <Textarea
            value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…" rows={1}
            className="flex-1 min-h-[40px] max-h-32 resize-none"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <Button onClick={() => send()} disabled={sending || !text.trim()} size="icon">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
