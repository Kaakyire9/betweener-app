# 🚀 Hostinger Upload Checklist for getbetweener.com

## 📂 Files Ready to Upload
All files are prepared in: `c:\Projects\betweener-app\hostinger-files\`

### File Structure to Create on Hostinger:
```
public_html/
├── .htaccess                                    ✅ Ready
├── index.html                                   ✅ Ready  
├── .well-known/
│   └── apple-app-site-association              ✅ Ready
└── auth/
    └── callback.html                           ✅ Ready
```

## 🔧 Step-by-Step Upload Process

### 1. Access Hostinger File Manager
- Login to Hostinger control panel
- Navigate to "File Manager" or "hPanel" → "Files"
- Go to your domain's `public_html` folder

### 2. Upload Files in This Order:

#### A. Upload Root Files
1. Upload `index.html` to `public_html/`
2. Upload `.htaccess` to `public_html/`

#### B. Create .well-known Directory
1. In `public_html/`, create new folder: `.well-known`
2. Enter the `.well-known` folder
3. Upload `apple-app-site-association` (NO file extension!)

#### C. Create auth Directory  
1. Back in `public_html/`, create new folder: `auth`
2. Enter the `auth` folder
3. Upload `callback.html`

### 3. Set File Permissions
- Folders: 755 (rwxr-xr-x)
- Files: 644 (rw-r--r--)

### 4. Enable SSL Certificate
- In Hostinger panel: "SSL" → Enable "Free SSL Certificate"
- Enable "Force HTTPS" option

## ✅ Testing Your Setup

### Test URLs (after upload):
1. **Homepage**: https://getbetweener.com
   - Should show: Beautiful Betweener landing page

2. **AASA File**: https://getbetweener.com/.well-known/apple-app-site-association
   - Should show: JSON content (not download)
   - Content-Type: application/json

3. **Auth Callback**: https://getbetweener.com/auth/callback.html
   - Should show: Email verification page

### Command Line Test:
```bash
curl -H "Accept: application/json" https://getbetweener.com/.well-known/apple-app-site-association
```

## 🔍 Troubleshooting

### If AASA file downloads instead of displaying:
- Check `.htaccess` is uploaded correctly
- Verify file name has NO extension
- Contact Hostinger support to ensure mod_headers is enabled

### If getting 404 errors:
- Double-check folder names (case-sensitive)
- Ensure you're in the correct `public_html` directory
- Verify file permissions

### If SSL issues:
- Wait 10-15 minutes after enabling SSL
- Clear browser cache
- Contact Hostinger if SSL doesn't activate

## 📱 After Successful Upload

### 1. Update Supabase Configuration
In Supabase Dashboard → Authentication → URL Configuration:

**Add Redirect URL:**
```
https://getbetweener.com/auth/callback
```

**Update Email Template:**
Change confirmation link to:
```html
<a href="https://getbetweener.com/auth/callback?token_hash={{ .TokenHash }}&type={{ .Type }}">Confirm your signup</a>
```

**Note:** Supabase will automatically replace `{{ .TokenHash }}` and `{{ .Type }}` with the actual values.

### 2. Rebuild Your App
```bash
eas build --platform ios --profile development
```

### 3. Test Complete Flow
1. Sign up with test email
2. Check verification email
3. Tap link on iOS device
4. Should open app directly! 🎉

---

## 📞 Need Help?
- Hostinger has 24/7 chat support
- Check their knowledge base for File Manager guides
- All files are ready - just upload and test! 

**Ready to make email verification seamless! 🚀**