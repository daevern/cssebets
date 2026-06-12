import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  staffListConversations,
  staffListMessages,
  staffSendMessage,
  staffMarkConvRead,
  staffCloseConversation,
  staffGetSupportAttachmentUrl,
} from "@/lib/management.functions";
import { getMyAttachmentUploadUrl } from "@/lib/support.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Paperclip, FileText, Download, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/management/chat")({
  head: () => ({ meta: [{ title: "Chat — CSSEBETS Management" }] }),
  component: ChatPage,
});

function ChatPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(staffListConversations);
  const list = useQuery({
    queryKey: ["staff-conversations"],
    queryFn: () => listFn({}),
    refetchInterval: 15_000,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const filtered = (list.data?.conversations ?? []).filter((c: any) => {
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return [c.display_name, c.public_reference, c.user_id].some((v) => v && String(v).toLowerCase().includes(f));
  });

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-9rem)]">
      <aside className="rounded-xl border border-slate-800 bg-slate-900 flex flex-col overflow-hidden">
        <div className="p-2 border-b border-slate-800">
          <Input
            placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)}
            className="bg-slate-800 border-slate-700 text-slate-100 h-8 text-sm"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.isLoading ? (
            <div className="p-4 text-center text-slate-400"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs">No conversations.</div>
          ) : (
            filtered.map((c: any) => (
              <button key={c.id} onClick={() => setSelected(c.id)}
                className={`w-full text-left px-3 py-2 border-b border-slate-800 hover:bg-slate-800/50 ${selected === c.id ? "bg-slate-800" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm truncate">{c.display_name}</span>
                  {c.hasUnread && <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />}
                </div>
                <div className="text-[10px] text-violet-300 font-mono truncate">{c.public_reference ?? "—"}</div>
                <div className="text-[10px] text-slate-500">
                  {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : "no messages"}
                  {c.status === "closed" && " · closed"}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="rounded-xl border border-slate-800 bg-slate-900 flex flex-col overflow-hidden">
        {selected ? (
          <Thread key={selected} conversationId={selected} onChange={() => {
            qc.invalidateQueries({ queryKey: ["staff-conversations"] });
            qc.invalidateQueries({ queryKey: ["mgmt-unread-conv"] });
          }} />
        ) : (
          <div className="flex-1 grid place-items-center text-slate-500 text-sm">
            Select a conversation to start chatting.
          </div>
        )}
      </section>
    </div>
  );
}

function Thread({ conversationId, onChange }: { conversationId: string; onChange: () => void }) {
  const qc = useQueryClient();
  const msgsFn = useServerFn(staffListMessages);
  const sendFn = useServerFn(staffSendMessage);
  const markFn = useServerFn(staffMarkConvRead);
  const closeFn = useServerFn(staffCloseConversation);
  const dlFn = useServerFn(staffGetSupportAttachmentUrl);
  const uploadFn = useServerFn(getMyAttachmentUploadUrl);

  const q = useQuery({
    queryKey: ["staff-conv-msgs", conversationId],
    queryFn: () => msgsFn({ data: { conversationId } }),
    refetchInterval: 8_000,
  });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [q.data?.messages.length]);

  useEffect(() => {
    markFn({ data: { conversationId } }).catch(() => {});
    onChange();
  }, [conversationId, q.data?.messages.length]);

  useEffect(() => {
    const ch = supabase.channel(`staff-conv-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "support_messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, () => qc.invalidateQueries({ queryKey: ["staff-conv-msgs", conversationId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, qc]);

  async function send(file?: File) {
    if (sending) return;
    const body = text.trim();
    if (!body && !file) return;
    setSending(true);
    try {
      let att: any = null;
      if (file) {
        const { path, token } = await uploadFn({ data: { fileName: file.name, contentType: file.type } });
        const { error } = await supabase.storage
          .from("support-attachments").uploadToSignedUrl(path, token, file, { contentType: file.type });
        if (error) throw error;
        att = { attachmentPath: path, attachmentName: file.name, attachmentType: file.type };
      }
      await sendFn({ data: { conversationId, body: body || undefined, ...att } });
      setText("");
      qc.invalidateQueries({ queryKey: ["staff-conv-msgs", conversationId] });
      onChange();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSending(false); }
  }

  async function openAtt(path: string) {
    try {
      const { url } = await dlFn({ data: { path } });
      window.open(url, "_blank", "noopener");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function toggleClose() {
    const close = q.data?.conversation.status !== "closed";
    try {
      await closeFn({ data: { conversationId, close } });
      toast.success(close ? "Closed" : "Reopened");
      qc.invalidateQueries({ queryKey: ["staff-conv-msgs", conversationId] });
      onChange();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  const u: any = q.data?.user ?? {};
  const closed = q.data?.conversation.status === "closed";

  return (
    <>
      <header className="px-4 py-2 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{u.display_name || "user"}</div>
          <div className="text-[10px] text-slate-400 flex gap-2 flex-wrap">
            {u.public_reference && <span className="text-violet-300 font-mono">{u.public_reference}</span>}
            {u.email && <span>{u.email}</span>}
            {u.phone_number && <span>{u.phone_number}</span>}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={toggleClose}
          className={closed ? "border-emerald-700 text-emerald-400" : "border-slate-700 text-slate-300"}>
          {closed ? <><Unlock className="h-4 w-4 mr-1" />Reopen</> : <><Lock className="h-4 w-4 mr-1" />Close</>}
        </Button>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {q.isLoading ? (
          <div className="text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : (q.data?.messages ?? []).length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-8">No messages yet.</div>
        ) : (q.data!.messages as any[]).map((m) => {
          const isStaff = m.sender_role === "staff";
          return (
            <div key={m.id} className={`flex ${isStaff ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${isStaff ? "bg-violet-900 text-white" : "bg-slate-800 text-slate-100"}`}>
                <div className="text-[10px] uppercase opacity-70 mb-0.5">{isStaff ? "Staff" : "User"}</div>
                {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                {m.attachment_path && (
                  <button onClick={() => openAtt(m.attachment_path)}
                    className={`mt-1 inline-flex items-center gap-1 text-xs underline ${isStaff ? "text-slate-900" : "text-violet-300"}`}>
                    <FileText className="h-3 w-3" /> {m.attachment_name || "attachment"} <Download className="h-3 w-3" />
                  </button>
                )}
                <div className={`text-[10px] mt-1 ${isStaff ? "text-slate-700" : "text-slate-400"}`}>
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-slate-800 p-2 flex items-end gap-2">
        <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} disabled={sending || closed} title="Attach">
          <Paperclip className="h-4 w-4" />
        </Button>
        <input ref={fileRef} type="file" className="hidden" accept="image/*,application/pdf"
          onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await send(f); }}
        />
        <Textarea
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder={closed ? "Conversation closed — reopen to reply" : "Type a reply…"}
          rows={1} disabled={closed}
          className="flex-1 min-h-[40px] max-h-32 resize-none bg-slate-800 border-slate-700 text-slate-100"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <Button onClick={() => send()} disabled={sending || closed || !text.trim()} size="icon"
          className="bg-violet-900 hover:bg-violet-900 text-white">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </>
  );
}
