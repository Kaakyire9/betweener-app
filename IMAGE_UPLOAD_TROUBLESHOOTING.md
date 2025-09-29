# 🐛 Image Upload Troubleshooting Guide

## ✅ FIXED: Property 'blob' doesn't exist

**Problem**: React Native doesn't have the `blob()` method like web browsers.

**Solution**: Updated to use `arrayBuffer()` and `Uint8Array` which works in React Native:

```typescript
// OLD (doesn't work in React Native)
const blob = await response.blob();

// NEW (works in React Native)
const blob = await response.arrayBuffer();
const uint8Array = new Uint8Array(blob);
```

## 🔧 Current Upload Method

The image upload now uses this reliable approach:

1. **Pick Image**: Camera or gallery using expo-image-picker
2. **Read File**: Using `fetch(uri)` and `arrayBuffer()`
3. **Convert**: To `Uint8Array` (Supabase compatible format)
4. **Upload**: To Supabase storage with proper content type
5. **Get URL**: Public URL for displaying

## 🚨 Common Issues & Solutions

### 1. **"Row-level security policy" Error**
- ❌ **Problem**: Storage bucket doesn't exist
- ✅ **Solution**: Run the SQL from `setup-storage.sql` in Supabase dashboard

### 2. **"Permission denied" Error**
- ❌ **Problem**: Camera/gallery permissions not granted
- ✅ **Solution**: The app will request permissions automatically

### 3. **"File too large" Error**
- ❌ **Problem**: Image exceeds 10MB limit
- ✅ **Solution**: Images are automatically compressed by expo-image-picker

### 4. **"Network error" or "Upload failed"**
- ❌ **Problem**: Network issues or Supabase credentials
- ✅ **Solution**: Check `.env` file has correct Supabase URL and key

### 5. **Image uploads but doesn't appear**
- ❌ **Problem**: Bucket not public or wrong URL
- ✅ **Solution**: Ensure bucket is public in Supabase dashboard

## 🎯 Testing Steps

To verify image upload works:

1. **✅ Supabase Setup**: Run `setup-storage.sql` first
2. **✅ Start App**: `npx expo start`
3. **✅ Open Profile**: Go to Profile tab
4. **✅ Tap Edit**: Any "Edit" button or camera icon
5. **✅ Add Photo**: Tap avatar or "Add Photo"
6. **✅ Choose Source**: Camera or Gallery
7. **✅ Crop/Edit**: Adjust image if needed
8. **✅ Upload**: Should show success message
9. **✅ Verify**: Photo should appear immediately

## 📱 Expected User Flow

```
User taps camera icon
    ↓
Permission request (if first time)
    ↓
Choose: Camera or Gallery
    ↓
Select/take photo
    ↓
Crop/edit interface
    ↓
"Uploading photo..." indicator
    ↓
"Photo uploaded successfully!" message
    ↓
Photo appears in profile instantly
```

## 🔍 Debug Information

If upload still fails, check the console for these messages:

```typescript
// Success flow:
"Photo uploaded successfully!"

// Error flow:
"Upload error details: [specific error message]"
"Error uploading image: [error details]"
```

## 📊 File Format Support

Supported formats (configured in bucket):
- ✅ **JPEG** (.jpg, .jpeg)
- ✅ **PNG** (.png) 
- ✅ **WebP** (.webp)
- ✅ **HEIC** (.heic) - iOS photos

## 🚀 Performance Notes

- **Compression**: Images automatically compressed to reasonable sizes
- **Upload Speed**: Depends on file size and network
- **Storage**: 10MB limit per file
- **CDN**: Supabase provides fast global delivery

---

**The image upload should now work reliably!** 🎉

If you still encounter issues, they're likely related to Supabase setup rather than the code.