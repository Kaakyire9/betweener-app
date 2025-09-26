# Universal Links Setup Guide for Betweener

## 🎯 What We're Implementing
Universal Links will allow email verification links to open your app directly instead of showing browser choice dialogs. This provides a seamless user experience for email verification.

## 📁 Files Created/Updated
✅ **Apple App Site Association file**: `public/apple-app-site-association`  
✅ **Web fallback page**: `public/auth/callback.html`  
✅ **App configuration**: `app.json` updated with `associatedDomains`  

## 🌐 Domain Setup Required

### 1. Host the Apple App Site Association File
Upload `public/apple-app-site-association` to your domain root:
```
https://getbetweener.com/.well-known/apple-app-site-association
```

**Critical Requirements:**
- ✅ Accessible via HTTPS (not HTTP)
- ✅ Content-Type: `application/json` (no .json extension on filename)
- ✅ No redirects (301/302 will break Universal Links)
- ✅ Must be exactly at `/.well-known/apple-app-site-association`

### 2. Host the Web Callback Page
Upload `public/auth/callback.html` to:
```
https://getbetweener.com/auth/callback.html
```

## 🔧 Supabase Configuration

### Update Site URL and Redirect URLs
In your Supabase Dashboard → Authentication → URL Configuration:

**Site URL:**
```
https://getbetweener.com
```

**Redirect URLs (add these):**
```
https://getbetweener.com/auth/callback
https://getbetweener.com/auth/callback/
betweenerapp://auth/callback
```

### Email Template Update
In Supabase Dashboard → Authentication → Email Templates → Confirm signup:

Update the confirmation link to:
```html
<a href="https://getbetweener.com/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/welcome">Confirm your signup</a>
```

## 📱 App Rebuild Required

After domain setup, rebuild your app with Universal Links entitlements:

```powershell
# Clean previous build
eas build:cancel --all

# Create new development build with Universal Links
eas build --platform ios --profile development

# Install the new build on your test device
```

## 🧪 Testing Universal Links

### 1. Verify AASA File
Test your Apple App Site Association file:
```bash
curl -H "Accept: application/json" https://getbetweener.com/.well-known/apple-app-site-association
```

Should return your JSON configuration without redirects.

### 2. Test Email Flow
1. Sign up with a test email
2. Check email verification link format
3. Tap link on iOS device with your app installed
4. Should open app directly (no browser dialog)

### 3. Fallback Testing
- Link should still work if app isn't installed (shows web page)
- Web page should offer app download and manual app opening

## 🔍 Troubleshooting

### Universal Links Not Working?
1. **Check AASA file accessibility**:
   ```bash
   curl -I https://getbetweener.com/.well-known/apple-app-site-association
   ```
   Should return `200 OK` with `Content-Type: application/json`

2. **Verify app installation**: Universal Links only work with apps installed from App Store or via direct IPA installation

3. **Clear iOS cache**: Delete and reinstall app, or restart device

4. **Check Supabase logs**: Authentication → Logs for redirect URL issues

### Still Using Custom Scheme?
If Universal Links fail, the app will fallback to `betweenerapp://` scheme automatically.

## 📋 Current Status
- ✅ AASA file created with correct App ID: `A964DV394M.com.aduboffour.betweener`
- ✅ App configuration updated with `associatedDomains`
- ✅ Web fallback page ready
- ⏳ **Next**: Set up domain hosting and rebuild app

## 🚀 Next Steps
1. Upload AASA file to `https://getbetweener.com/.well-known/apple-app-site-association`
2. Upload callback page to `https://getbetweener.com/auth/callback.html`
3. Update Supabase redirect URLs
4. Rebuild app with `eas build --platform ios --profile development`
5. Test email verification flow

---

Once domain hosting is complete, Universal Links will provide reliable email-to-app transitions for all your users! 🎉