// @ts-nocheck -- checked by the Supabase Edge Function bundler.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleProfileGuardRequest } from '../_shared/profile-guard-handler.ts';

serve((request) => handleProfileGuardRequest(request));
