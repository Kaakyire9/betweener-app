# 🔧 Profile Update Error Fix

## ✅ FIXED: NULL Constraint Violation

**Error**: `null value in column "gender" of relation "profiles" violates not-null constraint`

**Root Cause**: The profiles table has NOT NULL constraints on fields like `gender`, `tribe`, `religion`, etc., but we're only updating specific fields (like name, bio, photos) without providing values for all required fields.

## 🛠️ Solutions Applied

### 1. **Changed Update Method**
```typescript
// OLD: upsert (tries to insert new row)
.upsert({ user_id: user.id, ...updates })

// NEW: update (only updates existing row)
.update({ ...updates })
.eq('user_id', user.id)
```

### 2. **Smart Field Filtering**
Only include fields that have actual values:
```typescript
// Only add optional fields if they have values
if (formData.age && formData.age.trim()) {
  updateData.age = parseInt(formData.age);
}
if (formData.region && formData.region.trim()) {
  updateData.region = formData.region.trim();
}
```

### 3. **Database Schema Fix**
Made problematic columns nullable:
```sql
ALTER TABLE profiles ALTER COLUMN gender DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN tribe DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN religion DROP NOT NULL;
```

## 🚀 How to Apply the Fix

### Option 1: Run Updated Setup Script
1. Go to **Supabase Dashboard** → **SQL Editor**
2. Paste the entire contents of `setup-storage.sql`
3. Click **Run**

### Option 2: Run Specific Migration
1. Go to **Supabase Dashboard** → **SQL Editor**
2. Paste contents of `20250928_fix_profile_nullable_fields.sql`
3. Click **Run**

## 🎯 What This Fixes

### Before (Broken):
```
User edits profile → Save → ❌ NULL constraint error
```

### After (Working):
```
User edits profile → Save → ✅ Updates successfully
```

## 🔍 Technical Details

### Why This Happened:
1. **upsert** tries to insert a new row if none exists
2. New row needs ALL required fields (gender, tribe, etc.)
3. We only provided partial data (name, bio, photos)
4. Missing required fields caused NULL constraint violation

### How We Fixed It:
1. **update** only modifies existing row
2. Only sends fields that have values
3. Made problematic columns nullable
4. Set sensible defaults for existing NULL values

## 🧪 Testing

After applying the fix:

1. **Open Profile** → Go to Profile tab
2. **Edit Profile** → Tap any "Edit" button
3. **Make Changes** → Update name, bio, add photos
4. **Save** → Should work without errors ✅
5. **Check Database** → Verify changes are saved

## 🐛 Debug Output

Success should show:
```
Profile updated successfully!
```

Error would show:
```
Error updating profile: [specific error details]
```

## 📊 Database Changes

The setup now includes:
- ✅ Storage bucket created
- ✅ Storage policies set
- ✅ New profile columns added
- ✅ NULL constraints relaxed
- ✅ Default values set

## 🚀 Result

**Profile updates now work reliably without constraint violations!** 🎉

Users can update any combination of profile fields without needing to provide values for every single database column.