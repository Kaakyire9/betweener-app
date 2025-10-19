const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read environment variables
const envContent = fs.readFileSync('.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    envVars[key.trim()] = value.trim().replace(/"/g, '');
  }
});

const supabase = createClient(
  envVars.EXPO_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
);

async function debugDistanceIssue() {
  console.log('🔍 Debugging distance calculation issue...\n');
  
  // Get all profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('full_name, city, region, latitude, longitude, user_id')
    .limit(10);
    
  console.log('📋 Current database profiles:');
  profiles.forEach((p, i) => {
    console.log(`${i+1}. ${p.full_name}`);
    console.log(`   Location: ${p.city}, ${p.region}`);
    console.log(`   Coordinates: ${p.latitude}, ${p.longitude}`);
    console.log(`   User ID: ${p.user_id}`);
    console.log('');
  });
  
  console.log('🤔 The issue might be:');
  console.log('1. App is using cached data from before the mock removal');
  console.log('2. There might be StatusService or other service returning mock data');
  console.log('3. The frontend might have cached components');
  console.log('\n💡 Try refreshing the app or clearing cache');
}

debugDistanceIssue().catch(console.error);