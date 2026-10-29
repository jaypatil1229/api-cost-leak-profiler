"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlayIcon } from "lucide-react";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { apiRequest } from "@/lib/api/client";
import { pollDetectionRun } from "@/lib/api/detection-run-polling";
import type { DetectionRun } from "@/lib/api/types";
import { cn } from "@/lib/utils";

// Available detector types from the backend
export const DETECTOR_OPTIONS = [
  { value: "DUPLICATE_PROMPT", label: "Duplicate Prompts" },
  { value: "RETRY_LOOP", label: "Retry Loops" },
  { value: "UNBOUNDED_CONTEXT", label: "Unbounded Context" },
  { value: "OVERSIZED_PROMPT", label: "Oversized Prompts" },
  { value: "SPEND_SPIKE", label: "Spend Spike" },
  { value: "ANOMALY_ISOLATION_FOREST", label: "Anomaly (Isolation Forest)" },
];

interface DetectionControlProps {
  onRunComplete?: (_run: DetectionRun) => void;
  className?: string;
  buttonText?: string;
  buttonVariant?: "default" | "outline" | "secondary" | "destructive" | "ghost" | "link";
  buttonSize?: "default" | "sm" | "lg" | "icon";
}

export function DetectionControl({
  onRunComplete,
  className,
  buttonText = "Run Detection",
  buttonVariant = "default",
  buttonSize = "sm",
}: DetectionControlProps) {
  const { organization, project } = useWorkspace();
  const organizationId = organization?.id;
  const projectId = project?.id;

  const [open, setOpen] = React.useState(false);
  const [detectorType, setDetectorType] = React.useState<string>("DUPLICATE_PROMPT");
  const [from, setFrom] = React.useState<Date | null>(null);
  const [to, setTo] = React.useState<Date | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Initialize dates and reset state when dialog opens
  const initializeDialog = React.useCallback(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCHours(now.getUTCHours() - 24);
    setFrom(yesterday);
    setTo(now);
    setDetectorType("DUPLICATE_PROMPT");
  }, []);

  // Handle dialog open change
  React.useEffect(() => {
    if (open) {
      // Use microtask to avoid synchronous state updates
      Promise.resolve().then(() => {
        if (open) {
          initializeDialog();
        }
      });
    }
  }, [open, initializeDialog]);

  const canRun = Boolean(organizationId && projectId && from && to);

  async function runDetection() {
    if (!canRun || !organizationId || !projectId) return;

    setIsSubmitting(true);
    try {
      const run = await apiRequest<DetectionRun>(
        `/organizations/${organizationId}/detection/runs`,
        {
          method: "POST",
          body: {
            detectorType,
            projectId,
            windowStart: from!.toISOString(),
            windowEnd: to!.toISOString(),
          },
        }
      );

      const detectorLabel = DETECTOR_OPTIONS.find((item) => item.value === detectorType)?.label ?? detectorType;
      toast.success('Detection started', {
        description: `Running ${detectorLabel}...`,
      });

      let latestRun = run;
      try {
        latestRun = await pollDetectionRun(
          () => apiRequest<DetectionRun>(
            `/organizations/${organizationId}/detection/runs/${run.id}`,
          ),
        );
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : 'Unable to check detection status.';
        toast.error('Could not check detection status', { description: error });
      }

      onRunComplete?.(latestRun);
      if (latestRun.status === 'COMPLETED') {
        const runSummary = latestRun.detectorType === 'SPEND_SPIKE'
          ? `${latestRun.recordsScanned} cost-valued usage record(s) across current, previous, and fallback windows; ${latestRun.findingsCreated} finding(s) recorded.`
          : `${latestRun.recordsScanned} usage record(s) scanned; ${latestRun.findingsCreated} finding(s) recorded.`;
        toast.success('Detection completed', {
          description: runSummary,
        });
      } else if (latestRun.status === 'FAILED') {
        toast.error('Detection run failed', {
          description: latestRun.error ?? 'The backend could not complete this run.',
        });
      } else {
        toast('Detection is still running', {
          description: 'The latest run state is visible in the analysis runs list.',
        });
      }
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : "Unable to start detection";
      toast.error(`Detection failed`, {
        description: error,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button
        variant={buttonVariant}
        size={buttonSize}
        className={cn("gap-2", className)}
        onClick={() => setOpen(true)}
        disabled={!organizationId || !projectId}
      >
        <PlayIcon className="size-4" />
        {buttonText}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run Detection</DialogTitle>
            <DialogDescription>
              Select a detector and time window for cost leak analysis.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium">Detector</label>
              <Select value={detectorType} onValueChange={setDetectorType} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select detector" />
                </SelectTrigger>
                <SelectContent>
                  {DETECTOR_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium">Time Window</label>
              <div className="flex items-center gap-2 text-sm">
                <div className="flex flex-col gap-1 flex-1">
                  <label htmlFor="from-date" className="text-xs text-muted-foreground">From</label>
                  <input
                    id="from-date"
                    type="date"
                    className="rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={from?.toISOString().split("T")[0] ?? ""}
                    max={to?.toISOString().split("T")[0] ?? ""}
                    onChange={(e) => setFrom(e.target.value ? new Date(e.target.value) : null)}
                    disabled={isSubmitting}
                  />
                </div>
                <span className="text-muted-foreground">to</span>
                <div className="flex flex-col gap-1 flex-1">
                  <label htmlFor="to-date" className="text-xs text-muted-foreground">To</label>
                  <input
                    id="to-date"
                    type="date"
                    className="rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={to?.toISOString().split("T")[0] ?? ""}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setTo(e.target.value ? new Date(e.target.value) : null)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>

            <Button
              onClick={runDetection}
              disabled={isSubmitting || !canRun}
              className="w-full gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full border-2 border-current border-t-transparent h-4 w-4" />
                  Running...
                </>
              ) : (
                <>
                  <PlayIcon className="h-4 w-4" />
                  Start Detection
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
