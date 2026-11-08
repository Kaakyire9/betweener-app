// @ts-nocheck -- Deno entry point. No Stream token issuance or media admission.
import { connectBackend, connectJson, connectRpc } from '../_shared/connect-edge.ts';
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return connectJson({});
  if (request.method !== 'POST') return connectJson({ error: 'method_not_allowed' },405);
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return connectJson({ error: 'unauthorized' },401);
  try {
    if (Number(request.headers.get('Content-Length') ?? 0)>6000) return connectJson({ error:'invalid_request' },400);
    const text=await request.text(); if(text.length>6000) return connectJson({error:'invalid_request'},400);
    const body=JSON.parse(text);
    if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!['deviceId','platform','token','register'].includes(k))
      || typeof body.token!=='string' || body.token.length<16 || body.token.length>4096 || /\s/.test(body.token)
      || !/^[0-9a-f-]{36}$/i.test(body.deviceId) || !['ios','android'].includes(body.platform) || typeof body.register!=='boolean') return connectJson({error:'invalid_request'},400);
    const {authenticated}=connectBackend(), user=authenticated(authorization);
    const {data,error}=await user.auth.getUser(); if(error||!data.user) return connectJson({error:'unauthorized'},401);
    const queued=await connectRpc(user,'rpc_connect_native_device_intent',{p_device:body.deviceId,p_platform:body.platform,p_token:body.token,p_register:body.register});
    return connectJson({queued:queued===true});
  } catch { return connectJson({error:'connect_native_registration_unavailable'},403); }
});
