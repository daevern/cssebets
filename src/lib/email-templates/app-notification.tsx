import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  title?: string;
  message?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  preheader?: string;
  subject?: string;
}

const Email = ({
  title = "CSSEBets update",
  message = "You have a new update on CSSEBets.",
  ctaLabel = "Open CSSEBets",
  ctaUrl = "https://cssebets.com",
  preheader,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{preheader ?? message}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>CSSEBets</Text>
          <Heading as="h1" style={heading}>
            {title}
          </Heading>
        </Section>

        <Section style={card}>
          <Text style={body}>{message}</Text>
          <Button href={ctaUrl} style={button}>
            {ctaLabel}
          </Button>
        </Section>

        <Hr style={divider} />
        <Text style={footer}>
          You're receiving this because you have a CSSEBets account. Manage notifications in Settings.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    (data?.subject as string) || (data?.title as string) || "CSSEBets update",
  displayName: "App notification",
  previewData: {
    title: "Account Approved",
    message: "Your CSSEBets account has been approved. Tap below to sign in.",
    ctaLabel: "Open CSSEBets",
    ctaUrl: "https://cssebets.com/dashboard",
    subject: "Your CSSEBets Account Has Been Approved",
  },
} satisfies TemplateEntry;

const main: React.CSSProperties = {
  backgroundColor: "#ffffff",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
  margin: 0,
  padding: "24px 0",
};
const container: React.CSSProperties = {
  maxWidth: "480px",
  margin: "0 auto",
  padding: "0 16px",
};
const header: React.CSSProperties = {
  backgroundColor: "#0b1220",
  color: "#e6edf3",
  padding: "22px 26px",
  borderRadius: "14px 14px 0 0",
};
const brand: React.CSSProperties = {
  color: "#22e08a",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  margin: 0,
};
const heading: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "20px",
  fontWeight: 800,
  margin: "6px 0 0 0",
};
const card: React.CSSProperties = {
  backgroundColor: "#f7faf9",
  padding: "24px 26px",
  borderRadius: "0 0 14px 14px",
};
const body: React.CSSProperties = {
  color: "#0b1220",
  fontSize: "15px",
  lineHeight: 1.55,
  margin: "0 0 20px 0",
};
const button: React.CSSProperties = {
  backgroundColor: "#22e08a",
  color: "#0b1220",
  fontWeight: 700,
  textDecoration: "none",
  padding: "12px 22px",
  borderRadius: "999px",
  display: "inline-block",
};
const divider: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "24px 0 12px 0",
};
const footer: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "11px",
  lineHeight: 1.5,
  margin: 0,
};
