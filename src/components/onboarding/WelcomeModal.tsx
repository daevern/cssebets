import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { markOnboardingSkipped } from "@/lib/onboarding.functions";
import { useTour } from "./TourProvider";

export function WelcomeModal() {
  const { status, startFullTour } = useTour();
  const { user } = useAuth();
  const skipFn = useServerFn(markOnboardingSkipped);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!status) return;
    const shouldShow =
      status.userEnabled &&
      status.globalEnabled &&
      !status.completedAt &&
      !status.skippedAt;
    setOpen(!!shouldShow);
  }, [status]);

  const onStart = () => {
    setOpen(false);
    setTimeout(() => startFullTour(), 200);
  };

  const onSkip = async () => {
    setOpen(false);
    try {
      await skipFn({});
      qc.invalidateQueries({ queryKey: ["onboarding-status", user?.id] });
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onSkip()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center mb-2">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-2xl">Welcome to CSSEBets</DialogTitle>
          <DialogDescription className="text-base">
            A 20-second tour of the essentials — your balance, where to bet, and where to find your picks.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onSkip} className="w-full sm:w-auto">
            Skip for now
          </Button>
          <Button onClick={onStart} className="w-full sm:w-auto">
            Start tour
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
