const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {sha256}=require('../scripts/lib/connect-source-closure.cjs');
const location='docs/betweener-connect/connect-secure-calling.proposal.json';
const proposal=JSON.parse(fs.readFileSync(location));
const deltaLocation='docs/betweener-connect/connect-android-ending-fix.local.json';
const delta=JSON.parse(fs.readFileSync(deltaLocation));
const routeDeltaLocation='docs/betweener-connect/connect-android-audio-route-fix.local.json';
const routeDelta=JSON.parse(fs.readFileSync(routeDeltaLocation));
const recoveryDeltaLocation='docs/betweener-connect/connect-startup-recovery-fix.local.json';
const recoveryDelta=JSON.parse(fs.readFileSync(recoveryDeltaLocation));
const muteDeltaLocation='docs/betweener-connect/connect-mute-controls-fix.local.json';
const muteDelta=JSON.parse(fs.readFileSync(muteDeltaLocation));
const diagnosticsDeltaLocation='docs/betweener-connect/connect-mute-fault-diagnostics.local.json';
const diagnosticsDelta=JSON.parse(fs.readFileSync(diagnosticsDeltaLocation));
const encryptedMuteDeltaLocation='docs/betweener-connect/connect-encrypted-mute-fix.local.json';
const encryptedMuteDelta=JSON.parse(fs.readFileSync(encryptedMuteDeltaLocation));
const activationDeltaLocation='docs/betweener-connect/connect-native-activation-fix.local.json';
const activationDelta=JSON.parse(fs.readFileSync(activationDeltaLocation));
const activationDiagnosticsLocation='docs/betweener-connect/connect-native-activation-diagnostics.local.json';
const activationDiagnostics=JSON.parse(fs.readFileSync(activationDiagnosticsLocation));
const audioUiLocation='docs/betweener-connect/connect-audio-call-ui.local.json';
const audioUi=JSON.parse(fs.readFileSync(audioUiLocation));
const videoUiLocation='docs/betweener-connect/connect-video-call-ui.local.json';
const videoUi=JSON.parse(fs.readFileSync(videoUiLocation));
const journalLocation='docs/betweener-connect/connect-connection-journal.local.json';
const journal=JSON.parse(fs.readFileSync(journalLocation));
test('secure calling preserves frozen snapshots and declares the exact local Android repair chain',()=>{
  assert.equal(proposal.scope,'LOCAL_PROPOSAL_ONLY_NOT_AUTHORISED');assert.equal(proposal.target.reference,'xsgzxadwuxuziubglvps');
  assert.equal(sha256(fs.readFileSync(deltaLocation)),'b3ed0374d2a4c69f003ba84e09485f816532abf70e9288b040a6a63d4e06a034');
  assert.equal(delta.scope,'LOCAL_CLIENT_REPAIR_NO_HOSTED_DEPLOYMENT');
  assert.equal(delta.frozenPackage.path,location);assert.equal(delta.frozenPackage.sha256,sha256(fs.readFileSync(location)));
  assert.deepEqual(delta.files.map(row=>row.path),['features/connect/voice/voice-controller.ts']);
  assert.equal(sha256(fs.readFileSync(routeDeltaLocation)),'953fc1bf3ec17fb1e2e6e5b0eb1ddf3692361e3222d379727d141be8fc2463ec');
  assert.equal(routeDelta.scope,'LOCAL_CLIENT_REPAIR_NO_HOSTED_DEPLOYMENT');
  assert.deepEqual(routeDelta.frozenPackage,delta.frozenPackage);
  assert.deepEqual(routeDelta.baseLocalChange,{path:deltaLocation,sha256:sha256(fs.readFileSync(deltaLocation))});
  assert.deepEqual(routeDelta.files.map(row=>row.path),['features/connect/media/native-audio-route.ts','features/connect/voice/voice-controller.ts']);
  assert.equal(sha256(fs.readFileSync(recoveryDeltaLocation)),'2d6f5972367c764f7f6cc60ac1f210345eb4a0c8980224b2cf020c2e4893b3d8');
  assert.equal(recoveryDelta.scope,'LOCAL_CLIENT_REPAIR_NO_HOSTED_DEPLOYMENT');
  assert.deepEqual(recoveryDelta.frozenPackage,delta.frozenPackage);
  assert.deepEqual(recoveryDelta.baseLocalChange,{path:routeDeltaLocation,sha256:sha256(fs.readFileSync(routeDeltaLocation))});
  assert.deepEqual(recoveryDelta.files.map(row=>row.path),['features/connect/voice/voice-controller.ts','features/connect/media/recovery-policy.ts','features/connect/media/native-stream-sdk.ts','features/connect/experimental/encryption-transform-guard.ts']);
  assert.equal(sha256(fs.readFileSync(muteDeltaLocation)),'2bb8ac776903ab49cd02f95e36bbf90a7164f7d9248582721afc860018de0748');
  assert.equal(muteDelta.scope,'LOCAL_CLIENT_REPAIR_NO_HOSTED_DEPLOYMENT');
  assert.deepEqual(muteDelta.frozenPackage,delta.frozenPackage);
  assert.deepEqual(muteDelta.baseLocalChange,{path:recoveryDeltaLocation,sha256:sha256(fs.readFileSync(recoveryDeltaLocation))});
  assert.deepEqual(muteDelta.files.map(row=>row.path),['features/connect/media/connect-native-owner.ts','features/connect/media/stream-voice-transport.ts','features/connect/voice/voice-controller.ts','features/connect/voice/voice-types.ts','features/connect/diagnostics/connect-terminal-logger.ts']);
  assert.equal(muteDelta.hostedChanges,0);assert.equal(muteDelta.newBuildRequired,false);
  assert.equal(sha256(fs.readFileSync(diagnosticsDeltaLocation)),'d8d72e1c9dc229418fdb81e79c4e62e84aaef98c40266c2c66813b881df1c0de');
  assert.equal(diagnosticsDelta.scope,'LOCAL_CLIENT_REPAIR_NO_HOSTED_DEPLOYMENT');
  assert.deepEqual(diagnosticsDelta.frozenPackage,delta.frozenPackage);
  assert.deepEqual(diagnosticsDelta.baseLocalChange,{path:muteDeltaLocation,sha256:sha256(fs.readFileSync(muteDeltaLocation))});
  assert.deepEqual(diagnosticsDelta.files.map(row=>row.path),['features/connect/media/native-stream-sdk.ts','features/connect/media/native-owner-types.ts','features/connect/media/connect-native-owner.ts','features/connect/diagnostics/connect-terminal-logger.ts']);
  assert.equal(diagnosticsDelta.hostedChanges,0);assert.equal(diagnosticsDelta.symptomResolved,false);
  assert.equal(diagnosticsDelta.limits.activeEncryptionFaultsRemainFatal,true);
  assert.equal(diagnosticsDelta.limits.lifecyclePolicyChanged,false);
  assert.equal(sha256(fs.readFileSync(encryptedMuteDeltaLocation)),'c8f2cbf4426fa2dc17348b06615659d5e77e7946ee6ad2451bb0dbe450539044');
  assert.equal(encryptedMuteDelta.scope,'LOCAL_CLIENT_REPAIR_NO_HOSTED_DEPLOYMENT');
  assert.deepEqual(encryptedMuteDelta.frozenPackage,delta.frozenPackage);
  assert.deepEqual(encryptedMuteDelta.baseLocalChange,{path:diagnosticsDeltaLocation,sha256:sha256(fs.readFileSync(diagnosticsDeltaLocation))});
  assert.deepEqual(encryptedMuteDelta.files.map(row=>row.path),['features/connect/media/native-stream-sdk.ts','features/connect/media/native-owner-types.ts','features/connect/media/connect-native-owner.ts','features/connect/voice/voice-controller.ts','features/connect/media/native-microphone-pause.ts']);
  assert.equal(encryptedMuteDelta.hostedChanges,0);assert.equal(encryptedMuteDelta.limits.unencryptedFrameEventsRemainFatal,true);
  assert.equal(encryptedMuteDelta.limits.dependencyChanges,0);
  assert.equal(sha256(fs.readFileSync(activationDeltaLocation)),'94cb6080c8e6c748f67c5ebe4d3b0f56309e69d30af060c07a75f2c55c20586e');
  assert.equal(activationDelta.scope,'LOCAL_CLIENT_REPAIR_NO_HOSTED_DEPLOYMENT');
  assert.deepEqual(activationDelta.frozenPackage,delta.frozenPackage);
  assert.deepEqual(activationDelta.baseLocalChange,{path:encryptedMuteDeltaLocation,sha256:sha256(fs.readFileSync(encryptedMuteDeltaLocation))});
  assert.deepEqual(activationDelta.files.map(row=>row.path),["features/connect/media/native-stream-sdk.ts","features/connect/media/native-owner-types.ts","features/connect/media/connect-native-owner.ts","features/connect/diagnostics/connect-terminal-logger.ts","features/connect/media/native-call-activation.ts"]);
  assert.equal(activationDelta.hostedChanges,0);assert.equal(activationDelta.providerCalls,0);
  assert.equal(activationDelta.limits.activationDeadlineMs,3000);
  assert.equal(activationDelta.limits.activeEncryptionFaultsRemainFatal,true);
  assert.equal(activationDelta.limits.backgroundOptInChanged,false);
  assert.equal(sha256(fs.readFileSync(activationDiagnosticsLocation)),'6a0c5013e8262debc1a7f132b60c09e7b63a4f21393b13b6871a4df0f160ae58');
  assert.equal(activationDiagnostics.scope,'LOCAL_CLIENT_REPAIR_NO_HOSTED_DEPLOYMENT');
  assert.equal(activationDiagnostics.diagnosticOnly,true);assert.equal(activationDiagnostics.symptomResolved,false);
  assert.deepEqual(activationDiagnostics.frozenPackage,delta.frozenPackage);
  assert.deepEqual(activationDiagnostics.baseLocalChange,{path:activationDeltaLocation,sha256:sha256(fs.readFileSync(activationDeltaLocation))});
  assert.deepEqual(activationDiagnostics.files.map(row=>row.path),["features/connect/media/native-stream-sdk.ts","features/connect/media/native-owner-types.ts","features/connect/media/connect-native-owner.ts","features/connect/diagnostics/connect-terminal-logger.ts","features/connect/media/native-call-activation.ts"]);
  assert.equal(activationDiagnostics.limits.activeEventAndBridgeAckRequired,true);
  assert.equal(activationDiagnostics.limits.activeEncryptionFaultsRemainFatal,true);
  assert.equal(sha256(fs.readFileSync(audioUiLocation)),'0492d8c55b0bcea19a3e810e8763636798b0c0d0bcec3229444252cf3a2daf0d');
  assert.equal(audioUi.scope,'LOCAL_CLIENT_UI_CHANGE_NO_HOSTED_DEPLOYMENT');
  assert.deepEqual(audioUi.frozenPackage,delta.frozenPackage);
  assert.deepEqual(audioUi.baseLocalChange,{path:activationDiagnosticsLocation,sha256:sha256(fs.readFileSync(activationDiagnosticsLocation))});
  assert.equal(audioUi.hostedChanges,0);assert.equal(audioUi.providerCalls,0);assert.equal(audioUi.dependencyChanges,0);
  assert.equal(audioUi.behavior.permissionOrMediaRequestsForVisuals,0);
  assert.equal(audioUi.behavior.autoIntervalMs,8000);
  assert.equal(audioUi.behavior.nativeIncomingPresentationChanged,false);
  assert.deepEqual(audioUi.files.map(row=>row.path),["features/connect/components/AudioCallCanvas.tsx", "features/connect/components/AudioCallIdentity.tsx", "features/connect/components/AudioCallPortrait.tsx", "features/connect/components/CallControlButton.tsx", "features/connect/components/ConnectCallRoute.tsx", "features/connect/components/ConnectVoiceSession.tsx", "features/connect/components/VoiceCallControls.tsx", "features/connect/components/VoiceCallLobby.tsx", "features/connect/components/VoiceCallScreen.tsx", "features/connect/data/load-connect-product.ts", "features/connect/hooks/use-call-visual-activity.ts", "features/connect/voice/peer-gallery.ts", "features/connect/voice/voice-types.ts"]);
  assert.equal(sha256(fs.readFileSync(videoUiLocation)),'106824ead900a36868b220c408d8bfd0eb3b57beba481dae373fe0ea67f736b9');
  assert.equal(videoUi.scope,'LOCAL_VIDEO_UI_AND_LAUNCH_POLICY_NO_HOSTED_DEPLOYMENT');
  assert.deepEqual(videoUi.frozenPackage,delta.frozenPackage);
  assert.deepEqual(videoUi.baseLocalChange,{path:audioUiLocation,sha256:sha256(fs.readFileSync(audioUiLocation))});
  assert.equal(videoUi.hostedChanges,0);assert.equal(videoUi.providerCalls,0);assert.equal(videoUi.dependencyChanges,0);
  assert.equal(videoUi.behavior.matchedOnly,true);assert.equal(videoUi.behavior.incomingSelectionStartsCapture,false);
  assert.equal(videoUi.behavior.nativeGenericAnswerCameraOn,false);assert.equal(videoUi.behavior.productionRuntimeEnabled,false);
  assert.deepEqual(videoUi.files.map(row=>row.path),["features/connect/application/native-call-coordinator.ts", "features/connect/components/ConnectCallEntry.tsx", "features/connect/components/ConnectCallRoute.tsx", "features/connect/components/ConnectVoiceSession.tsx", "features/connect/components/ConnectVoiceSetup.tsx", "features/connect/components/IntentCallingConsent.tsx", "features/connect/components/VideoCallScreen.tsx", "features/connect/components/VideoCallStage.tsx", "features/connect/components/VideoIncomingControls.tsx", "features/connect/components/VoiceCallLobby.tsx", "features/connect/config/connect-feature-flags.ts", "features/connect/config/connect-runtime-policy.ts", "features/connect/data/authenticated-connect-services.ts", "features/connect/domain/calling-launch-policy.ts", "features/connect/media/native-private-camera-preview.ts", "features/connect/media/native-safety-composition.ts", "features/connect/video/private-camera-preview.ts", "features/connect/video/video-types.ts", "features/connect/voice/voice-controller.ts", "features/connect/voice/voice-types.ts"]);
  for(const row of videoUi.backendChanges){assert.equal(row.deployed,false);assert.equal(sha256(fs.readFileSync(row.path)),row.sha256);}
  assert.equal(sha256(fs.readFileSync(journalLocation)),'3ea520889719f87d898030894056db01a69739da4cb2158e62aafe43233035ff');
  assert.equal(journal.scope,'LOCAL_HISTORY_UI_AND_READ_MODEL_NO_HOSTED_DEPLOYMENT');
  assert.deepEqual(journal.frozenPackage,delta.frozenPackage);
  assert.deepEqual(journal.baseLocalChange,{path:videoUiLocation,sha256:sha256(fs.readFileSync(videoUiLocation))});
  assert.equal(journal.hostedChanges,0);assert.equal(journal.providerCalls,0);assert.equal(journal.dependencyChanges,0);
  assert.equal(journal.behavior.callingGatesChanged,false);assert.equal(journal.behavior.historyReadsDefaultOff,true);
  assert.equal(journal.behavior.unreadMessageSemanticsChanged,false);assert.equal(journal.behavior.clientCallWrites,0);
  assert.deepEqual(journal.files.map(row=>row.path),["features/connect/components/ConnectCallRoute.tsx", "features/connect/journal/CallTimelineCard.tsx", "features/connect/journal/ConnectedCallTimelineCard.tsx", "features/connect/journal/ConnectionJournalProvider.tsx", "features/connect/journal/ConnectionJournalRoute.tsx", "features/connect/journal/journal-context.ts", "features/connect/journal/journal-continuity.ts", "features/connect/journal/journal-integrity.ts", "features/connect/journal/journal-presentation.ts", "features/connect/journal/journal-runtime.ts", "features/connect/journal/journal-safety-actions.ts", "features/connect/journal/journal-service.ts", "features/connect/journal/journal-store.ts", "features/connect/journal/journal-timeline.ts", "features/connect/journal/journal-types.ts", "features/connect/journal/JournalDetailRoute.tsx", "features/connect/journal/JournalDetails.tsx", "features/connect/journal/JournalPrimitives.tsx", "features/connect/journal/JournalPulse.tsx", "features/connect/journal/JournalScreen.tsx", "features/connect/journal/JournalShortcut.tsx", "features/connect/journal/use-journal-actions.ts", "features/connect/journal/use-journal-feed.ts"]);
  for(const row of journal.backendChanges){assert.equal(row.deployed,false);assert.equal(sha256(fs.readFileSync(row.path)),row.sha256);}
  for(const row of [...journal.integrationFiles,...journal.validationFiles]){
    if(row.beforeSha256!==null)assert.equal(sha256(fs.readFileSync(row.beforeSnapshot)),row.beforeSha256,row.path);
    assert.equal(sha256(fs.readFileSync(row.path)),row.afterSha256,row.path);
  }
  const changes=new Map();
  for(const candidate of [delta,routeDelta,recoveryDelta,muteDelta,diagnosticsDelta,encryptedMuteDelta,activationDelta,activationDiagnostics,audioUi,videoUi,journal])for(const change of candidate.files){
    const previous=changes.get(change.path)?.afterSha256??proposal.mobileFiles.find(row=>row.path===change.path)?.sha256;
    if(change.beforeSha256===null){
      assert.ok(['features/connect/experimental/encryption-transform-guard.ts','features/connect/media/native-microphone-pause.ts','features/connect/media/native-call-activation.ts','features/connect/components/AudioCallCanvas.tsx','features/connect/components/AudioCallIdentity.tsx','features/connect/components/AudioCallPortrait.tsx','features/connect/hooks/use-call-visual-activity.ts','features/connect/voice/peer-gallery.ts','features/connect/components/VideoIncomingControls.tsx','features/connect/domain/calling-launch-policy.ts','features/connect/media/native-private-camera-preview.ts','features/connect/video/private-camera-preview.ts','features/connect/journal/CallTimelineCard.tsx','features/connect/journal/ConnectedCallTimelineCard.tsx','features/connect/journal/ConnectionJournalProvider.tsx','features/connect/journal/ConnectionJournalRoute.tsx','features/connect/journal/journal-context.ts','features/connect/journal/journal-continuity.ts','features/connect/journal/journal-integrity.ts','features/connect/journal/journal-presentation.ts','features/connect/journal/journal-runtime.ts','features/connect/journal/journal-safety-actions.ts','features/connect/journal/journal-service.ts','features/connect/journal/journal-store.ts','features/connect/journal/journal-timeline.ts','features/connect/journal/journal-types.ts','features/connect/journal/JournalDetailRoute.tsx','features/connect/journal/JournalDetails.tsx','features/connect/journal/JournalPrimitives.tsx','features/connect/journal/JournalPulse.tsx','features/connect/journal/JournalScreen.tsx','features/connect/journal/JournalShortcut.tsx','features/connect/journal/use-journal-actions.ts','features/connect/journal/use-journal-feed.ts'].includes(change.path));assert.equal(previous,undefined);assert.equal(change.beforeSnapshot,null);
    }else{
      assert.equal(change.beforeSha256,previous,change.path);
      assert.equal(sha256(fs.readFileSync(change.originalSnapshot??change.beforeSnapshot)),previous,change.path);
    }
    changes.set(change.path,change);
  }

  const laterRepairs = [
  {
    "path": "docs/betweener-connect/connect-encrypted-hangup-fix.local.json",
    "sha256": "f7f69e167dae0ec7a4dcc62661c6a06b9e8ce9aaa180c813b37ab6a0d7bad499"
  },
  {
    "path": "docs/betweener-connect/connect-foreground-call-drop-fix.local.json",
    "sha256": "846f0f31eeb4d9db012cdc44572bb3a4d23f3a24c59ad3fc49f0b675fd9fb955"
  },
  {
    "path": "docs/betweener-connect/connect-encrypted-retirement-fix.local.json",
    "sha256": "80fa58f8479d276458e8fcf08e5845333ee62f42f254645fd4938777c6a1a219"
  },
  {
    "path": "docs/betweener-connect/connect-call-audio-fix.local.json",
    "sha256": "4e792a46f1774feabe8ec5f6f736c0cd86c0178081da294444dc64cb624a4680"
  },
  {
    "path": "docs/betweener-connect/connect-receiver-retirement-fix.local.json",
    "sha256": "8ad998f3402077a38d13029d082fb350eb6238c78bafc47ec19b1957ad52a169"
  },
  {
    "path": "docs/betweener-connect/connect-native-crypto-validation.local.json",
    "sha256": "0ed37b87198db1a05a6eeb5196fbe64b79451f89c83bc86a3822e24316740840"
  }
];
  laterRepairs.push({ path: 'docs/betweener-connect/connect-v1-development-repairs.local.json', sha256: 'fe77a98c7db78beb517b5b9e153ce71429e1890c23b0e810ac8ff820d3d3f627' });
  const startupReceipt = { path: 'docs/betweener-connect/connect-startup-latency-investigation.local.json', sha256: '24cfdde64dff49fd0a9357ec17e8a4d565ebf856f9c364ad78c9f251fe34e6c2' };
  const startup = JSON.parse(fs.readFileSync(startupReceipt.path));
  assert.deepEqual(startup.baseLocalChange, laterRepairs.at(-1));
  assert.equal(startup.newBuildRequired, false); assert.equal(startup.symptomResolved, false);
  assert.equal(startup.hostedChanges, 0); assert.equal(startup.providerCalls, 0); assert.equal(startup.dependencyChanges, 0);
  assert.equal(startup.limits.activeEncryptionFaultsRemainFatal, true); assert.equal(startup.limits.plaintextFallback, false);
  laterRepairs.push(startupReceipt);
  for (const receipt of laterRepairs) {
    const bytes = fs.readFileSync(receipt.path);
    assert.equal(sha256(bytes), receipt.sha256, receipt.path);
    const repair = JSON.parse(bytes);
    if ('callingGatesChanged' in repair) assert.equal(repair.callingGatesChanged, false);
    for (const change of repair.files) {
      const previous = changes.get(change.path)?.afterSha256;
      if (previous !== undefined) assert.equal(change.beforeSha256, previous, change.path);
      changes.set(change.path, change);
    }
  }
  for(const change of changes.values())assert.equal(sha256(fs.readFileSync(change.path)),change.afterSha256,change.path);
  for(const row of [...proposal.historicalPackages,...proposal.migrations,...proposal.mobileFiles]){
    const change=changes.get(row.path);
    assert.equal(sha256(fs.readFileSync(row.path)),change?.afterSha256??row.sha256,row.path);
  }
  for(const row of proposal.mobileFiles)assert.equal(sha256(fs.readFileSync(path.join(`tmp/connect-secure-calling/package/mobile-revision-${proposal.revision}/forward`,row.path))),row.sha256,row.path);
  for(const fn of proposal.functions)for(const variant of ['forward','rollback'])if(fn[variant])for(const row of fn[variant].files){
    assert.equal(sha256(fs.readFileSync(path.join(fn[variant].root,row.path))),row.sha256,row.path);
    if(variant==='forward')assert.equal(sha256(fs.readFileSync(row.path)),row.sha256,row.path);
  }
});
test('only the new migration and three exact JWT/custom-auth functions are proposed',()=>{
  assert.deepEqual(proposal.functions.map(fn=>[fn.name,fn.verifyJwt]),[['connect-provider-worker',false],['connect-credentials',true],['connect-native-device',true]]);
  assert.equal(proposal.migrations.length,1);assert.match(proposal.migrations[0].path,/20261103150558_connect_secure_calling.sql$/);
  assert.deepEqual(proposal.activation.installationOnly,{native_incoming_enabled:false,e2ee_enabled:false});
  assert.equal(proposal.activation.authorised,false);
  for(const field of ['accountChanges','budgetChanges','existingSecretChanges','schedulerChanges','sharedPushChanges','liveChanges'])assert.deepEqual(proposal.activation[field],[]);
});
test('actual revision-2 rollback closures are retained without dropping new cleanup obligations',()=>{
  assert.equal(proposal.functions.reduce((n,fn)=>n+(fn.rollback?.files.length||0),0),22);
  for(const fn of proposal.functions.filter(fn=>fn.rollback)){assert.equal(fn.rollback.revision,2);assert.match(fn.rollback.source,/READ_ONLY_STAGING/);}
  assert.match(proposal.rollback.steps.join(' '),/Older worker2 cannot process that journal/);
  assert.match(proposal.rollback.steps.join(' '),/restoring it earlier would bypass/);
  assert.equal(proposal.deviceValidation,'NOT_RUN');assert.equal(proposal.remoteRevocation,'UNVERIFIED');
});
test('the frozen secure-calling proposal cannot be silently overwritten',()=>{
  const before=sha256(fs.readFileSync(location));
  assert.throws(()=>execFileSync(process.execPath,['scripts/prepare-connect-secure-calling.cjs'],{stdio:'pipe'}),error=>/already_frozen/.test(String(error.stderr)));
  assert.equal(sha256(fs.readFileSync(location)),before);
});
