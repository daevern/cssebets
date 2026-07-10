// Server-only notification dispatch. Fans out to Web Push + Email.
// Called from other server functions AFTER a successful DB transaction.
import webpush from "web-push";
import * as React from "react";
import { render } from "@react-email/render";
import { createHash, randomUUID } from "crypto";
import { TEMPLATES } from "@/lib/email-templates/registry";


type EventType =
  // user-facing
  | "account_approved"
  | "account_rejected"
  | "topup_approved"
  | "topup_rejected"
  | "cashout_approved"
  | "cashout_rejected"
  | "cashout_completed"
  | "support_reply"
  // admin-facing
  | "admin_new_registration"
  | "admin_new_topup"
  | "admin_new_cashout"
  | "admin_new_support_message";

const ADMIN_EVENTS: EventType[] = [
  "admin_new_registration",
  "admin_new_topup",
  "admin_new_cashout",
  "admin_new_support_message",
];

type CopyEntry = { title: string; body: string; url: string; subject: string; emailHtml: string };

function copyFor(event: EventType): CopyEntry {
  switch (event) {
    case "account_approved":
      return {
        title: "Account Approved",
        body: "Your account has been approved. Tap to continue.",
        url: "/dashboard",
        subject: "Your CSSEBets Account Has Been Approved",
        emailHtml: "Great news — your CSSEBets account has been approved. You can now sign in and start playing.",
      };
    case "account_rejected":
      return {
        title: "Account Update",
        body: "There is an update on your account. Tap to view.",
        url: "/auth",
        subject: "Update on your CSSEBets account",
        emailHtml: "There has been an update on your CSSEBets account. Please open the app for details.",
      };
    case "topup_approved":
      return {
        title: "Top-up Approved",
        body: "Your points have been credited successfully.",
        url: "/wallet",
        subject: "Your Top-up Has Been Approved",
        emailHtml: "Your top-up request has been approved and your points have been credited.",
      };
    case "topup_rejected":
      return {
        title: "Top-up Update",
        body: "There is an update on your top-up request. Tap to view.",
        url: "/wallet",
        subject: "Update on your CSSEBets top-up request",
        emailHtml: "There has been an update on your top-up request. Please open the app for details.",
      };
    case "cashout_approved":
      return {
        title: "Cashout Approved",
        body: "Your cashout request has been approved.",
        url: "/payout",
        subject: "Your Cashout Has Been Approved",
        emailHtml: "Your cashout request has been approved and is being processed.",
      };
    case "cashout_rejected":
      return {
        title: "Cashout Update",
        body: "There is an update on your cashout request. Tap to view.",
        url: "/payout",
        subject: "Update on your CSSEBets cashout request",
        emailHtml: "There has been an update on your cashout request. Please open the app for details.",
      };
    case "cashout_completed":
      return {
        title: "Cashout Completed",
        body: "Your cashout has been completed successfully.",
        url: "/payout",
        subject: "Your Cashout Has Been Completed",
        emailHtml: "Your cashout has been completed and sent to your bank account.",
      };
    case "support_reply":
      return {
        title: "Support Reply",
        body: "You have received a new reply from Support.",
        url: "/support",
        subject: "New Reply From CSSEBets Support",
        emailHtml: "You've received a new reply from CSSEBets Support. Open the app to view.",
      };
    case "admin_new_registration":
      return {
        title: "New Registration",
        body: "A new user is waiting for approval.",
        url: "/management/admin/users",
        subject: "CSSEBets — new user registration",
        emailHtml: "A new user is waiting for approval on the CSSEBets Admin page.",
      };
    case "admin_new_topup":
      return {
        title: "New Top-up Request",
        body: "A new request is waiting for review.",
        url: "/management/admin/points",
        subject: "CSSEBets — new top-up request",
        emailHtml: "A new top-up request is waiting for review on the CSSEBets Admin page.",
      };
    case "admin_new_cashout":
      return {
        title: "New Cashout Request",
        body: "A new request is waiting for review.",
        url: "/management/admin/payouts",
        subject: "CSSEBets — new cashout request",
        emailHtml: "A new cashout request is waiting for review on the CSSEBets Admin page.",
      };
    case "admin_new_support_message":
      return {
        title: "New Support Message",
        body: "A user is waiting for a reply.",
        url: "/management/admin/support-ops",
        subject: "CSSEBets — new support message",
        emailHtml: "A user has sent a new support message on CSSEBets.",
      };
  }
}

function baseUrl() {
  return process.env.PUBLIC_APP_URL || "https://cssebets.com";
}

function emailWrap(preheader: string, heading: string, message: string, ctaLabel: string, ctaUrl: string) {
  const brand = "#22e08a";
  const bg = "#ffffff";
  const surface = "#0b1220";
  const ink = "#e6edf3";
  return `<!doctype html><html><body style="margin:0;padding:0;background:${bg};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0b1220;">
    <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${bg};padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellspacing="0" cellpadding="0" style="max-width:480px;">
          <tr><td style="background:${surface};color:${ink};padding:22px 26px;border-radius:14px 14px 0 0;">
            <div style="font-size:12px;letter-spacing:.18em;font-weight:700;color:${brand};text-transform:uppercase;">CSSEBets</div>
            <div style="font-size:20px;font-weight:800;margin-top:6px;">${heading}</div>
          </td></tr>
          <tr><td style="background:#f7faf9;padding:22px 26px;color:#0b1220;font-size:15px;line-height:1.55;">
            <p style="margin:0 0 16px 0;">${message}</p>
            <p style="margin:22px 0 6px 0;"><a href="${ctaUrl}" style="display:inline-block;background:${brand};color:#0b1220;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px;">${ctaLabel}</a></p>
          </td></tr>
          <tr><td style="background:#0b1220;color:#8f9aa6;padding:14px 26px;border-radius:0 0 14px 14px;font-size:11px;">
            You're receiving this because you have a CSSEBets account. Manage notifications in Settings.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

async function sendOneEmail(
  supabaseAdmin: any,
  to: string,
  subject: string,
  copy: { title: string; body: string; url: string; emailHtml: string },
  idempotencyKey: string,
) {
  const senderDomain = "notify.cssebets.com";
  const fromDomain = "notify.cssebets.com";
  const siteName = "cssebets";
  const messageId = randomUUID();
  const normalizedEmail = to.toLowerCase();

  // Suppression check — respect unsubscribes and bounces.
  const { data: suppressed } = await supabaseAdmin
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (suppressed) {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "app-notification",
      recipient_email: to,
      status: "suppressed",
    });
    return { skipped: "suppressed" };
  }

  // Get or create unsubscribe token (one per email address).
  let unsubscribeToken: string | null = null;
  const { data: existingToken } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (existingToken && !existingToken.used_at) {
    unsubscribeToken = existingToken.token;
  } else if (!existingToken) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const newToken = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .upsert({ token: newToken, email: normalizedEmail }, { onConflict: "email", ignoreDuplicates: true });
    const { data: stored } = await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", normalizedEmail)
      .maybeSingle();
    unsubscribeToken = stored?.token ?? newToken;
  }

  // Render the registered React Email template.
  const entry = TEMPLATES["app-notification"];
  if (!entry) throw new Error("app-notification template not registered");
  const templateData = {
    title: copy.title,
    message: copy.emailHtml,
    ctaLabel: "Open CSSEBets",
    ctaUrl: baseUrl() + copy.url,
    preheader: copy.body,
    subject,
  };
  const element = React.createElement(entry.component, templateData);
  const html = await render(element);
  const text = await render(element, { plainText: true });

  // Log pending BEFORE enqueue so we always have a record.
  await supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: "app-notification",
    recipient_email: to,
    status: "pending",
  });

  const { error } = await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to,
      from: `${siteName} <noreply@${fromDomain}>`,
      sender_domain: senderDomain,
      subject,
      html,
      text,
      purpose: "transactional",
      label: "app-notification",
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  });
  if (error) throw new Error(`enqueue_email: ${error.message}`);
  return { ok: true };
}


async function sendOnePush(supabaseAdmin: any, sub: any, payload: any) {
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@cssebets.com";
  const publicKey = process.env.VAPID_PUBLIC_KEY!;
  const privateKey = process.env.VAPID_PRIVATE_KEY!;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 }
    );
    await supabaseAdmin
      .from("push_subscriptions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", sub.id);
    return { ok: true };
  } catch (e: any) {
    const status = e?.statusCode || e?.status;
    if (status === 404 || status === 410) {
      await supabaseAdmin
        .from("push_subscriptions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", sub.id);
    }
    return { ok: false, error: String(e?.body || e?.message || e), status };
  }
}

async function getAdminUserIds(supabaseAdmin: any): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "super_admin"]);
  const ids = new Set<string>();
  (data ?? []).forEach((r: any) => ids.add(r.user_id));
  return Array.from(ids);
}

export type DispatchInput = {
  eventType: EventType;
  recipientUserId?: string | null;
  relatedRecordType?: string | null;
  relatedRecordId?: string | null;
};

export async function dispatchNotification(input: DispatchInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const isAdminEvent = ADMIN_EVENTS.includes(input.eventType);
    const recipients: string[] = isAdminEvent
      ? await getAdminUserIds(supabaseAdmin)
      : input.recipientUserId
      ? [input.recipientUserId]
      : [];
    if (recipients.length === 0) return;

    const copy = copyFor(input.eventType);
    const deepLink = baseUrl() + copy.url;

    for (const uid of recipients) {
      // idempotency: same event + record + user won't send twice
      const idem = createHash("sha256")
        .update(`${input.eventType}|${input.relatedRecordType ?? ""}|${input.relatedRecordId ?? ""}|${uid}`)
        .digest("hex")
        .slice(0, 40);

      const { data: existing } = await supabaseAdmin
        .from("notification_events")
        .select("id, status")
        .eq("recipient_user_id", uid)
        .eq("event_type", input.eventType)
        .eq("related_record_type", input.relatedRecordType ?? "")
        .eq("related_record_id", input.relatedRecordId ?? "")
        .maybeSingle();
      if (existing && existing.status === "sent") continue;

      const { data: eventRow } = await supabaseAdmin
        .from("notification_events")
        .insert({
          recipient_user_id: uid,
          event_type: input.eventType,
          related_record_type: input.relatedRecordType ?? "",
          related_record_id: input.relatedRecordId ?? "",
          payload: { title: copy.title, body: copy.body, url: copy.url },
          status: "pending",
        })
        .select("id")
        .single();
      const eventId = eventRow?.id;

      // Preferences
      const { data: prefs } = await supabaseAdmin
        .from("notification_preferences")
        .select("push_enabled, email_enabled")
        .eq("user_id", uid)
        .maybeSingle();
      const pushEnabled = prefs?.push_enabled ?? true;
      const emailEnabled = prefs?.email_enabled ?? true;

      const results: any = { push: null, email: null };

      // Push
      if (pushEnabled) {
        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth")
          .eq("user_id", uid)
          .is("revoked_at", null);
        if (subs && subs.length) {
          const pushResults = await Promise.all(
            subs.map((s: any) =>
              sendOnePush(supabaseAdmin, s, {
                title: copy.title,
                body: copy.body,
                url: deepLink,
                event_type: input.eventType,
                tag: `${input.eventType}:${input.relatedRecordId ?? ""}`,
              })
            )
          );
          results.push = { attempted: subs.length, ok: pushResults.filter((r) => r.ok).length };
        } else {
          results.push = { attempted: 0, ok: 0 };
        }
      } else {
        results.push = { skipped: "disabled" };
      }

      // Email
      if (emailEnabled) {
        try {
          const { data: user } = await supabaseAdmin.auth.admin.getUserById(uid);
          const email = user?.user?.email;
          const isSynthetic = !!email && email.endsWith("@phone.cssebets.local");
          if (email && !isSynthetic) {
            const emailRes = await sendOneEmail(supabaseAdmin, email, copy.subject, copy, `${idem}:${eventId}`);
            results.email = emailRes.ok ? { ok: true, to: email } : { skipped: emailRes.skipped, to: email };
          } else {
            results.email = { skipped: "no_email" };
          }

        } catch (e: any) {
          results.email = { ok: false, error: String(e?.message || e) };
        }
      } else {
        results.email = { skipped: "disabled" };
      }

      const pushOk = !results.push?.skipped && (results.push?.ok ?? 0) > 0;
      const emailOk = !results.email?.skipped && results.email?.ok;
      const anyOk = pushOk || emailOk;
      const anyChannel = !results.push?.skipped || !results.email?.skipped;
      const status = !anyChannel ? "sent" : anyOk ? "sent" : "failed";

      if (eventId) {
        await supabaseAdmin
          .from("notification_events")
          .update({
            channel_results: results,
            status,
            sent_at: status === "sent" ? new Date().toISOString() : null,
            failed_at: status === "failed" ? new Date().toISOString() : null,
          })
          .eq("id", eventId);
      }
    }
  } catch (e) {
    // Never let notifications break the caller's action.
    // eslint-disable-next-line no-console
    console.error("[dispatchNotification]", e);
  }
}
