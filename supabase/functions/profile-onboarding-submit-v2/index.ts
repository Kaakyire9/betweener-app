// @ts-nocheck -- checked by the Supabase Edge Function bundler.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleProfileGuardRequest } from '../_shared/profile-guard-handler.ts';

// Additive v1.2 endpoint. Released clients continue using the v1 endpoint.
serve((request) => handleProfileGuardRequest(request, {
  requireOnboarding: true,
  onboardingContractVersion: 2,
}));
