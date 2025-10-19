# Database Setup Guide - Status Tables

## Issue Resolution

The error `Could not find the table 'public.user_statuses'` indicates that the status tables haven't been created in your Supabase database yet.

## Quick Fix Options

### Option 1: Run SQL Manually in Supabase Dashboard (Recommended)

1. **Go to your Supabase Dashboard**: https://supabase.com/dashboard
2. **Navigate to your project**: `betweener-app`
3. **Go to SQL Editor** (left sidebar)
4. **Create a new query** and paste the contents of `create-status-tables.sql`
5. **Run the query** to create the status tables

### Option 2: Use Supabase CLI (Alternative)

```bash
# If you have Supabase CLI configured locally
npx supabase db push --include-all

# Or apply just the status migration
npx supabase db apply supabase/migrations/20250130_status_tables.sql
```

## Tables Created

After running the SQL, you should have:

- ✅ `user_statuses` - Stores 24-hour status updates
- ✅ `status_views` - Tracks who viewed which statuses
- ✅ RLS policies for security
- ✅ Indexes for performance
- ✅ Proper foreign key relationships

## Verification

After creating the tables, you can verify they exist by running this query in Supabase SQL Editor:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_statuses', 'status_views');
```

You should see both tables listed.

## Test the App

Once the tables are created:

1. **Restart the Expo app** (it should now load without the table error)
2. **Check the explore screen** - status rings should appear (even if empty)
3. **No more "table not found" errors** in the logs

## App Behavior After Fix

- ✅ Explore screen loads without database errors
- ✅ Status rings component displays (may be empty initially)
- ✅ Backend services can query status data
- ✅ Ready for status creation and viewing features

## Next Steps

After the tables are created, you can:

1. **Test status creation** - Create your first status
2. **Test status viewing** - View analytics and interactions
3. **Add sample data** - Create test statuses for development
4. **Enable status notifications** - Set up real-time updates

The app should now run without the database table errors!