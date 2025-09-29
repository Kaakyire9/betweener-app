# 🔧 Supabase Storage Setup Guide

## ⚠️ IMPORTANT: Required Setup Steps

You're getting the "row-level security policy" error because the Supabase storage bucket and policies haven't been created yet. Follow these steps:

### 1. 🗄️ Create Storage Bucket

**Option A: Via Supabase Dashboard (Recommended)**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Storage** → **Buckets**
4. Click **"New Bucket"**
5. Configure:
   - **Name**: `profile-photos`
   - **Public**: ✅ **ON** (important for displaying images)
   - **File size limit**: `10485760` (10MB)
   - **Allowed file types**: `image/jpeg, image/png, image/webp, image/heic`

**Option B: Via SQL Editor**
1. Go to **SQL Editor** in Supabase Dashboard
2. Copy and paste the contents of `setup-storage.sql`
3. Click **Run**

### 2. 🔒 Set Up Security Policies

If you used Option A above, you still need to run this SQL:

```sql
-- Create storage policies for profile-photos bucket
CREATE POLICY "Users can view any profile photo" ON storage.objects
FOR SELECT USING (bucket_id = 'profile-photos');

CREATE POLICY "Users can upload their own profile photos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'profile-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own profile photos" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'profile-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
) WITH CHECK (
  bucket_id = 'profile-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own profile photos" ON storage.objects
FOR DELETE USING (
  bucket_id = 'profile-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

### 3. 📋 Update Profile Table

Add the new columns to your profiles table:

```sql
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS occupation TEXT,
ADD COLUMN IF NOT EXISTS education TEXT,
ADD COLUMN IF NOT EXISTS height TEXT,
ADD COLUMN IF NOT EXISTS looking_for TEXT,
ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';
```

### 4. 🔄 Restart Development Server

After setting up Supabase:

```bash
# Stop the current server (Ctrl+C)
# Then restart
npx expo start --clear
```

## ✅ Verification

After setup, test the photo upload:

1. **Open your app**
2. **Go to Profile tab**
3. **Tap camera icon** or any "Edit" button
4. **Try uploading a photo**
5. **Should work without errors!**

## 🐛 Troubleshooting

### Still getting RLS errors?
- ✅ Check bucket exists: `profile-photos`
- ✅ Check bucket is **public**
- ✅ Check policies are created
- ✅ Check user is authenticated

### Upload fails?
- ✅ Check file size < 10MB
- ✅ Check file type is image
- ✅ Check internet connection
- ✅ Check Supabase URL/keys in `.env`

### Files uploaded but can't see them?
- ✅ Check bucket is **public**
- ✅ Check `SELECT` policy exists
- ✅ Check image URLs in database

## 📁 Expected Structure

After successful setup, your storage should look like:

```
profile-photos/
├── [user-id-1]/
│   ├── 1640995200000.jpg
│   └── 1640995201000.jpg
└── [user-id-2]/
    └── 1640995300000.jpg
```

---

**Once you complete these steps, photo upload will work perfectly!** 🎉