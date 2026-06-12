import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/management/access-denied")({
  head: () => ({ meta: [{ title: "Access denied — CSSEBETS Management" }] }),
  component: AccessDenied,
});

function AccessDenied() {
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="max-w-md text-center space-y-4 p-8 rounded-2xl border border-slate-800 bg-slate-900">
        <Shield className="h-12 w-12 mx-auto text-red-400" />
        <h1 className="text-2xl font-bold">Access denied</h1>
        <p className="text-sm text-slate-400">
          You do not have permission to access this management area.
        </p>
        <Link to="/management/login">
          <Button className="w-full bg-violet-900 hover:bg-violet-900 text-white">Return to login</Button>
        </Link>
      </div>
    </div>
  );
}
