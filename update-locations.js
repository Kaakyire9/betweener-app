const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

// Ghana major cities coordinates
const ghanaCities = {
  'Ashanti': { latitude: 6.6885, longitude: -1.6244, city: 'Kumasi' },
  'Greater Accra': { latitude: 5.6037, longitude: -0.1870, city: 'Accra' },
  'Northern': { latitude: 9.4034, longitude: -0.8424, city: 'Tamale' },
  'Central': { latitude: 5.1053, longitude: -1.2466, city: 'Cape Coast' },
  'Western': { latitude: 4.9344, longitude: -1.7639, city: 'Sekondi-Takoradi' },
};

async function updateTestUsersLocation() {
  try {
    console.log('Updating test users with location data...');
    
    // Get all profiles that need location updates
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, region, current_country, latitude, longitude')
      .is('latitude', null);
    
    if (error) throw error;
    
    console.log('Found profiles without coordinates:', profiles.length);
    
    for (const profile of profiles) {
      let coords = null;
      
      // Try to get coordinates based on region
      if (profile.region && ghanaCities[profile.region]) {
        coords = ghanaCities[profile.region];
        console.log(`Setting ${profile.full_name} to ${coords.city} (${profile.region})`);
      } else if (profile.current_country === 'Ghana') {
        // Default to Accra for Ghana users without specific region
        coords = ghanaCities['Greater Accra'];
        console.log(`Setting ${profile.full_name} to default Accra location`);
      }
      
      if (coords) {
        // Add some randomness to make locations more realistic (within ~5km)
        const latOffset = (Math.random() - 0.5) * 0.09; // ~5km variance
        const lonOffset = (Math.random() - 0.5) * 0.09;
        
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            latitude: coords.latitude + latOffset,
            longitude: coords.longitude + lonOffset,
            city: coords.city,
            location_updated_at: new Date().toISOString(),
            location_precision: 'APPROXIMATE'
          })
          .eq('user_id', profile.user_id);
        
        if (updateError) {
          console.error(`Error updating ${profile.full_name}:`, updateError);
        } else {
          console.log(`✅ Updated ${profile.full_name} location`);
        }
      }
    }
    
    console.log('Location update complete!');
    
  } catch (error) {
    console.error('Error updating locations:', error);
  }
}

// Run the update
updateTestUsersLocation();