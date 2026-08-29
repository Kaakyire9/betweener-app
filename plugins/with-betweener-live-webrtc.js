const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
  withMainApplication,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const pkg = {
  name: 'with-betweener-live-webrtc',
  version: '1.1.0',
};

const moduleName = 'BetweenerLivePictureInPicture';

const kotlinSources = (androidPackage) => ({
  'BetweenerLivePictureInPictureModule.kt': `package ${androidPackage}.livepip

import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Rational
import ${androidPackage}.R
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

class BetweenerLivePictureInPictureModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "${moduleName}"

  @ReactMethod
  fun setActions(microphoneEnabled: Boolean, cameraEnabled: Boolean) {
    updateActions(
      listOf(
        buildAction(
          action = BetweenerLivePictureInPictureActionReceiver.ACTION_TOGGLE_MICROPHONE,
          requestCode = 4101,
          iconResource = if (microphoneEnabled) R.drawable.betweener_live_mic_on else R.drawable.betweener_live_mic_off,
          title = if (microphoneEnabled) "Mute" else "Unmute",
        ),
        buildAction(
          action = BetweenerLivePictureInPictureActionReceiver.ACTION_TOGGLE_CAMERA,
          requestCode = 4102,
          iconResource = if (cameraEnabled) R.drawable.betweener_live_camera_on else R.drawable.betweener_live_camera_off,
          title = if (cameraEnabled) "Camera off" else "Camera on",
        ),
      ),
    )
  }

  @ReactMethod
  fun clearActions() = updateActions(emptyList())

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun buildAction(
    action: String,
    requestCode: Int,
    iconResource: Int,
    title: String,
  ): RemoteAction {
    val intent = Intent(reactApplicationContext, BetweenerLivePictureInPictureActionReceiver::class.java).apply {
      this.action = action
      setPackage(reactApplicationContext.packageName)
    }
    val pendingIntent = PendingIntent.getBroadcast(
      reactApplicationContext,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return RemoteAction(
      Icon.createWithResource(reactApplicationContext, iconResource),
      title,
      title,
      pendingIntent,
    )
  }

  private fun updateActions(actions: List<RemoteAction>) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    UiThreadUtil.runOnUiThread {
      val activity = reactApplicationContext.currentActivity ?: return@runOnUiThread
      val builder = PictureInPictureParams.Builder().apply {
        val metrics = activity.resources.displayMetrics
        if (metrics.widthPixels > 0 && metrics.heightPixels > 0) {
          setAspectRatio(Rational(metrics.widthPixels, metrics.heightPixels))
        }
      }
      activity.setPictureInPictureParams(builder.setActions(actions).build())
    }
  }
}
`,
  'BetweenerLivePictureInPicturePackage.kt': `package ${androidPackage}.livepip

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class BetweenerLivePictureInPicturePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(BetweenerLivePictureInPictureModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
`,
  'BetweenerLivePictureInPictureActionReceiver.kt': `package ${androidPackage}.livepip

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule

class BetweenerLivePictureInPictureActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != ACTION_TOGGLE_CAMERA && action != ACTION_TOGGLE_MICROPHONE) return
    val reactApplication = context.applicationContext as? ReactApplication ?: return
    reactApplication.reactHost?.currentReactContext
      ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(EVENT_NAME, action)
  }

  companion object {
    const val ACTION_TOGGLE_CAMERA = "toggle_camera"
    const val ACTION_TOGGLE_MICROPHONE = "toggle_microphone"
    const val EVENT_NAME = "BetweenerLivePictureInPictureAction"
  }
}
`,
});

const drawableSources = {
  'betweener_live_camera_off.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFFFF" android:pathData="M2.27,3L1,4.27l3.73,3.73H3c-1.1,0 -2,0.9 -2,2v8c0,1.1 0.9,2 2,2h12c0.21,0 0.39,-0.04 0.58,-0.1L19.73,24 21,22.73 2.27,3zM21,6h-4l-2,-2H7.82l2,2H14.17l2,2H21v6.17l2,2V8c0,-1.1 -0.9,-2 -2,-2z"/></vector>`,
  'betweener_live_camera_on.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFFFF" android:pathData="M17,10.5V7c0,-1.1 -0.9,-2 -2,-2H3C1.9,5 1,5.9 1,7v10c0,1.1 0.9,2 2,2h12c1.1,0 2,-0.9 2,-2v-3.5l4,4v-11l-4,4z"/></vector>`,
  'betweener_live_mic_off.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFFFF" android:pathData="M19,11h-1.7c0,0.74 -0.16,1.43 -0.43,2.05l1.23,1.23C18.66,13.3 19,12.19 19,11zM14.98,11.17c0.01,-0.06 0.02,-0.11 0.02,-0.17V5c0,-1.66 -1.34,-3 -3,-3S9,3.34 9,5v0.18l5.98,5.99zM4.27,3L3,4.27l6.01,6.01V11c0,1.66 1.33,3 2.99,3 0.22,0 0.44,-0.03 0.65,-0.08l1.66,1.66c-0.71,0.33 -1.5,0.52 -2.31,0.52 -2.76,0 -5.3,-2.1 -5.3,-5.1H5c0,3.41 2.72,6.23 6,6.72V21h2v-3.28c0.91,-0.13 1.77,-0.45 2.54,-0.9L19.73,21 21,19.73 4.27,3z"/></vector>`,
  'betweener_live_mic_on.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFFFF" android:pathData="M12,14c1.66,0 2.99,-1.34 2.99,-3L15,5c0,-1.66 -1.34,-3 -3,-3S9,3.34 9,5v6c0,1.66 1.34,3 3,3zM17.3,11c0,3 -2.54,5.1 -5.3,5.1S6.7,14 6.7,11H5c0,3.41 2.72,6.23 6,6.72V21h2v-3.28c3.28,-0.48 6,-3.3 6,-6.72h-1.7z"/></vector>`,
};

const withAndroidPictureInPictureControls = (config) => {
  config = withMainApplication(config, (modConfig) => {
    const androidPackage = modConfig.android?.package;
    if (!androidPackage) throw new Error('Betweener Live PiP requires android.package');
    const importLine = `import ${androidPackage}.livepip.BetweenerLivePictureInPicturePackage`;
    if (!modConfig.modResults.contents.includes(importLine)) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /^(package\s+[^\r\n]+\r?\n)/,
        `$1\n${importLine}\n`,
      );
    }
    if (!modConfig.modResults.contents.includes('add(BetweenerLivePictureInPicturePackage())')) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        'PackageList(this).packages.apply {',
        'PackageList(this).packages.apply {\n          add(BetweenerLivePictureInPicturePackage())',
      );
    }
    return modConfig;
  });

  config = withAndroidManifest(config, (modConfig) => {
    const androidPackage = modConfig.android?.package;
    if (!androidPackage) throw new Error('Betweener Live PiP requires android.package');
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    application.receiver ??= [];
    const receiverName = `${androidPackage}.livepip.BetweenerLivePictureInPictureActionReceiver`;
    if (!application.receiver.some((receiver) => receiver.$?.['android:name'] === receiverName)) {
      application.receiver.push({
        $: {
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:name': receiverName,
        },
      });
    }
    return modConfig;
  });

  return withDangerousMod(config, ['android', async (modConfig) => {
    const androidPackage = modConfig.android?.package;
    if (!androidPackage) throw new Error('Betweener Live PiP requires android.package');
    const sourceDirectory = path.join(
      modConfig.modRequest.platformProjectRoot,
      'app',
      'src',
      'main',
      'java',
      ...androidPackage.split('.'),
      'livepip',
    );
    const drawableDirectory = path.join(
      modConfig.modRequest.platformProjectRoot,
      'app',
      'src',
      'main',
      'res',
      'drawable',
    );
    fs.mkdirSync(sourceDirectory, { recursive: true });
    fs.mkdirSync(drawableDirectory, { recursive: true });
    for (const [fileName, source] of Object.entries(kotlinSources(androidPackage))) {
      fs.writeFileSync(path.join(sourceDirectory, fileName), source);
    }
    for (const [fileName, source] of Object.entries(drawableSources)) {
      fs.writeFileSync(path.join(drawableDirectory, fileName), source);
    }
    return modConfig;
  }]);
};

const withBetweenerLiveWebRtc = (config) => {
  config = withInfoPlist(config, (modConfig) => {
    modConfig.modResults.NSCameraUsageDescription ??=
      'Betweener uses your camera when you choose to join a Live stage.';
    modConfig.modResults.NSMicrophoneUsageDescription ??=
      'Betweener uses your microphone when you choose to speak in a Live session.';

    const backgroundModes = Array.isArray(modConfig.modResults.UIBackgroundModes)
      ? modConfig.modResults.UIBackgroundModes
      : [];
    // Live is an audible, user-started RTC session. Keep its native audio and
    // VoIP modes explicit and deduplicated so PiP survives app backgrounding.
    modConfig.modResults.UIBackgroundModes = [
      ...new Set([...backgroundModes, 'audio', 'voip']),
    ];
    return modConfig;
  });

  config.ios ??= {};
  config.ios.bitcode = false;

  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.CAMERA',
    'android.permission.INTERNET',
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.RECORD_AUDIO',
    'android.permission.WAKE_LOCK',
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_CONNECT',
  ]);

  return withAndroidPictureInPictureControls(config);
};

module.exports = createRunOncePlugin(
  withBetweenerLiveWebRtc,
  pkg.name,
  pkg.version,
);
