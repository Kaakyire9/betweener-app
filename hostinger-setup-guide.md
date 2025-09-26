# Hostinger Domain Setup for Universal Links

## 🚀 Quick Setup Guide

### Step 1: Access Hostinger File Manager
1. Log into your Hostinger control panel
2. Go to "File Manager" (or "hPanel" → "Files" → "File Manager")
3. Navigate to your domain's `public_html` folder

### Step 2: Upload Required Files

#### A. Create the Apple App Site Association file
1. In `public_html`, create folder: `.well-known`
2. Inside `.well-known`, upload file: `apple-app-site-association` (no extension)
3. **Important**: Set MIME type to `application/json`

#### B. Create the auth callback page
1. In `public_html`, create folder: `auth`
2. Inside `auth`, upload file: `callback.html`

### Step 3: File Structure Should Look Like:
```
public_html/
├── .well-known/
│   └── apple-app-site-association
├── auth/
│   └── callback.html
└── index.html (optional homepage)
```

### Step 4: Test Your Setup
Visit these URLs to verify:
- https://getbetweener.com/.well-known/apple-app-site-association
- https://getbetweener.com/auth/callback.html

## 📁 Files to Upload

### File 1: `.well-known/apple-app-site-association`
Content: (Copy from your local `public/apple-app-site-association` file)

### File 2: `auth/callback.html`  
Content: (Copy from your local `public/auth/callback.html` file)

## ⚙️ Hostinger-Specific Settings

### Set Correct MIME Type for AASA File
1. In File Manager, right-click `apple-app-site-association`
2. Select "Change Permissions" or "Properties"  
3. Ensure it serves as `application/json`
4. If needed, add this to `.htaccess` in your root directory:

```apache
<Files "apple-app-site-association">
    Header set Content-Type application/json
</Files>
```

### Enable HTTPS (Required for Universal Links)
1. In Hostinger control panel, go to "SSL"
2. Enable "Free SSL Certificate" 
3. Ensure "Force HTTPS" is enabled

## 🎯 Alternative: Simple HTML Homepage

Create a basic `index.html` in `public_html` to make your domain complete:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Betweener - Coming Soon</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial; text-align: center; padding: 50px; }
        .logo { font-size: 48px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="logo">💕</div>
    <h1>Betweener</h1>
    <p>Dating app for the Ghanaian community</p>
    <p><em>Coming soon to the App Store</em></p>
</body>
</html>
```

## ✅ Verification Steps

After uploading:
1. Visit: https://getbetweener.com/.well-known/apple-app-site-association
   - Should show JSON content (not download)
   - Should return `Content-Type: application/json`

2. Visit: https://getbetweener.com/auth/callback.html  
   - Should show the Betweener verification page

3. Test with curl:
   ```bash
   curl -H "Accept: application/json" https://getbetweener.com/.well-known/apple-app-site-association
   ```

## 🔧 Troubleshooting

### If AASA file downloads instead of displaying:
Add to `.htaccess` in root directory:
```apache
<Files "apple-app-site-association">
    ForceType application/json
    Header set Content-Type "application/json"
</Files>

# Prevent .well-known folder from being blocked
<Directory ".well-known">
    Require all granted
</Directory>
```

### If getting 404 errors:
- Ensure folder/file names are exact (case-sensitive)
- Check file permissions (755 for folders, 644 for files)
- Verify you're in the correct `public_html` directory

## 📱 Next Steps After Upload
1. Update Supabase redirect URLs
2. Rebuild your app with EAS
3. Test email verification flow

---
*Need help? Check Hostinger's documentation or contact their support.*