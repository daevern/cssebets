import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyNotificationPrefs,
  updateMyNotificationPrefs,
  listMyDevices,
} from "@/lib/notifications.functions";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { StencilPanel } from "@/components/ui/page-shell";
import { Bell, Mail, Smartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function NotificationSettings() {
  const getPrefs = useServerFn(getMyNotificationPrefs);
  const updatePrefs = useServerFn(updateMyNotificationPrefs);
  const getDevices = useServerFn(listMyDevices);
  const qc = useQueryClient();
  const push = usePushSubscription();

  const prefs = useQuery({ queryKey: ["notif-prefs"], queryFn: () => getPrefs() });
  const devices = useQuery({ queryKey: ["notif-devices"], queryFn: () => getDevices() });

  const save = useMutation({
    mutationFn: (patch: { push_enabled?: boolean; email_enabled?: boolean }) =>
      updatePrefs({ data: patch }),
    onSuccess: () => {
      toast.success("Notification preferences updated.");
      qc.invalidateQueries({ queryKey: ["notif-prefs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pushEnabled = prefs.data?.push_enabled ?? true;
  const emailEnabled = prefs.data?.email_enabled ?? true;

  async function togglePush(next: boolean) {
    if (next) {
      await push.enable();
    } else {
      await push.disable();
    }
    save.mutate({ push_enabled: next });
    qc.invalidateQueries({ queryKey: ["notif-devices"] });
  }

  return (
    <StencilPanel kicker={<><Bell className="h-3 w-3" /> Notifications</>}>
      {prefs.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-[var(--color-ink-muted)]" />
      ) : (
        <div className="space-y-3">
          <Row
            icon={<Smartphone className="h-4 w-4" />}
            title="Push notifications"
            desc={
              push.status === "unsupported"
                ? "This browser does not support push notifications."
                : push.status === "denied"
                ? "Blocked in browser settings. Allow notifications for cssebets.com."
                : push.status === "granted-subscribed"
                ? "On — this device will receive push notifications."
                : "Off on this device. Enable to receive instant phone alerts."
            }
            checked={pushEnabled && push.status === "granted-subscribed"}
            onChange={togglePush}
            disabled={push.status === "unsupported" || push.status === "denied"}
          />
          <Row
            icon={<Mail className="h-4 w-4" />}
            title="Email notifications"
            desc="Receive important updates by email as a backup."
            checked={emailEnabled}
            onChange={(next) => save.mutate({ email_enabled: next })}
          />

          <div>
            <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
              Devices ({devices.data?.devices.length ?? 0})
            </div>
            <div className="mt-2 space-y-1.5">
              {(devices.data?.devices ?? []).length === 0 ? (
                <div className="text-[12px] text-[var(--color-ink-muted)]">No devices enrolled yet.</div>
              ) : (
                devices.data!.devices.map((d: any) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--color-surface-border)] bg-[#070D0A] px-3 py-2 text-[12px]"
                  >
                    <div className="min-w-0 flex-1 truncate text-white/80">
                      {(d.user_agent as string)?.slice(0, 60) || "Unknown device"}
                    </div>
                    <div className="ml-2 shrink-0 text-[10px] text-white/40">
                      {new Date(d.last_seen_at).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </StencilPanel>
  );
}

function Row({
  icon, title, desc, checked, onChange, disabled,
}: {
  icon: React.ReactNode; title: string; desc: string;
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--color-surface-border)] bg-[#070D0A] p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="text-[var(--color-neon)]">{icon}</span>
          {title}
        </div>
        <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">{desc}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          disabled ? "cursor-not-allowed opacity-40" : ""
        } ${checked ? "bg-[var(--color-neon)]" : "bg-white/10"}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
