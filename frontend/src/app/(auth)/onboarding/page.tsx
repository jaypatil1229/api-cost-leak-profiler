import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/auth/onboarding-wizard";

export const metadata: Metadata = { title: "Set up your workspace" };

export default function OnboardingPage() {
  return <OnboardingWizard />;
}
