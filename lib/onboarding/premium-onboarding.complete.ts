import {
  prepareProfileGuardWrite,
  PROFILE_GUARD_SAFETY_CONTRACT_V1_2,
} from "@/lib/profile-guard/write-payload";
import { supabase } from "@/lib/supabase";

export const PREMIUM_ONBOARDING_COMPLETION_CONTRACT = "2.0";
export const PREMIUM_ONBOARDING_COMPLETION_FUNCTION = "profile-onboarding-submit-v2";

export type PremiumOnboardingCompletionResult = {
  committed: true;
  alreadyCompleted: boolean;
  completionRequestId: string;
  updatedAt: string | null;
};

export class PremiumOnboardingCompletionError extends Error {
  code: string;
  fieldNames: string[];
  retryable: boolean;
  status: number;

  constructor(args: {
    code: string;
    fieldNames?: string[];
    retryable?: boolean;
    status?: number;
  }) {
    super(args.code);
    this.name = "PremiumOnboardingCompletionError";
    this.code = args.code;
    this.fieldNames = args.fieldNames ?? [];
    this.retryable = args.retryable === true;
    this.status = args.status ?? 0;
  }
}

const readErrorPayload = async (error: any, data: any) => {
  let payload = data && typeof data === "object" ? data : null;
  const context = error?.context;
  if (!payload && context?.json && typeof context.json === "object") payload = context.json;
  if (!payload && context && typeof context.clone === "function") {
    try {
      payload = await context.clone().json();
    } catch {
      // The transport error remains the fallback.
    }
  }
  return { payload, status: Number(context?.status || error?.status || 0) };
};

export async function completePremiumOnboardingV2(args: {
  updates: Record<string, unknown>;
  interestNames: string[];
  completionRequestId: string;
}): Promise<PremiumOnboardingCompletionResult> {
  const write = prepareProfileGuardWrite(args.updates);
  const { data, error } = await supabase.functions.invoke(
    PREMIUM_ONBOARDING_COMPLETION_FUNCTION,
    {
      body: {
        contract_version: PREMIUM_ONBOARDING_COMPLETION_CONTRACT,
        safety_contract_version: PROFILE_GUARD_SAFETY_CONTRACT_V1_2,
        updates: write.updates,
        interest_names: args.interestNames,
        completion_request_id: args.completionRequestId,
      },
    },
  );

  if (error || data?.ok !== true || data?.committed !== true) {
    const { payload, status } = await readErrorPayload(error, data);
    const code = String(payload?.code || error?.code || "ONBOARDING_COMPLETION_UNAVAILABLE");
    throw new PremiumOnboardingCompletionError({
      code,
      fieldNames: Array.isArray(payload?.field_names)
        ? payload.field_names.filter((value: unknown) => typeof value === "string")
        : [],
      retryable: payload?.retryable === true || status >= 500 || status === 0,
      status,
    });
  }

  return {
    committed: true,
    alreadyCompleted: data.already_completed === true,
    completionRequestId: String(data.completion_request_id || args.completionRequestId),
    updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
  };
}

export function premiumOnboardingCompletionMessage(error: unknown): string {
  const code = String((error as any)?.code || "");
  if (code === "ONBOARDING_INTERESTS_INVALID") {
    return "Choose 3 to 5 interests before creating your profile.";
  }
  if (code === "ONBOARDING_INTEREST_CATALOG_MISMATCH") {
    return "Some interests are no longer available. Review your interests and try again.";
  }
  if (code === "ONBOARDING_REQUIREMENTS_NOT_MET") {
    return "A required profile detail still needs your attention.";
  }
  if (code === "PROFILE_CONTENT_NOT_ALLOWED") {
    return "Remove contact details, external promotion, or solicitation from the highlighted profile details.";
  }
  if (code === "PROFILE_WRITE_CONFLICT") {
    return "Your profile changed on another device. Review the latest details and try again.";
  }
  if (code === "ONBOARDING_ALREADY_COMPLETED") {
    return "This profile has already completed onboarding. Sign in again to continue.";
  }
  return "We couldn't securely create your profile. Check your connection and try again.";
}
