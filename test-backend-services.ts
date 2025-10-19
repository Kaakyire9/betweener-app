/**
 * Test script for Explore and Status backend services
 * Run this to verify the backend integration is working
 */

import { ExploreService } from './lib/explore-service';
import { StatusService } from './lib/status-service';

// Mock user ID for testing (replace with actual user ID)
const TEST_USER_ID = 'test-user-id';

async function testExploreService() {
  console.log('🧪 Testing Explore Service...');
  
  try {
    // Test discovery matches
    console.log('📍 Fetching discovery matches...');
    const matches = await ExploreService.getDiscoveryMatches(TEST_USER_ID, {
      diasporaStatus: 'ALL',
      minAge: 18,
      maxAge: 35
    }, 5);
    
    console.log(`✅ Found ${matches.length} matches`);
    if (matches.length > 0) {
      console.log('🔍 Sample match:', {
        name: matches[0].full_name,
        age: matches[0].age,
        location: matches[0].location,
        hasStatus: matches[0].hasStatus,
        verification: matches[0].verification_level
      });
    }
    
    // Test insights
    console.log('💡 Fetching discovery insights...');
    const insights = await ExploreService.getDiscoveryInsights(TEST_USER_ID);
    console.log(`✅ Found ${insights.length} insights:`, insights);
    
    return true;
  } catch (error) {
    console.error('❌ Explore Service Error:', error);
    return false;
  }
}

async function testStatusService() {
  console.log('\n🧪 Testing Status Service...');
  
  try {
    // Test status rings
    console.log('📍 Fetching status rings...');
    const rings = await StatusService.getStatusRings(TEST_USER_ID, 10);
    
    console.log(`✅ Found ${rings.length} status rings`);
    if (rings.length > 0) {
      console.log('🔍 Sample ring:', {
        userName: rings[0].userName,
        hasUnviewed: rings[0].hasUnviewedStatus,
        statusCount: rings[0].statusCount,
        isMyStatus: rings[0].isMyStatus
      });
    }
    
    // Test user's own statuses
    console.log('📱 Fetching user statuses...');
    const myStatuses = await StatusService.getMyStatuses(TEST_USER_ID);
    console.log(`✅ Found ${myStatuses.length} of your statuses`);
    
    // Test status analytics
    console.log('📊 Fetching status analytics...');
    const analytics = await StatusService.getStatusAnalytics(TEST_USER_ID);
    console.log('✅ Analytics:', {
      totalViews: analytics.totalViews,
      uniqueViewers: analytics.uniqueViewers,
      statusCount: analytics.statusCount,
      topViewers: analytics.topViewers.length
    });
    
    return true;
  } catch (error) {
    console.error('❌ Status Service Error:', error);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Backend Service Tests\n');
  
  const exploreTest = await testExploreService();
  const statusTest = await testStatusService();
  
  console.log('\n📊 Test Results:');
  console.log(`🔍 Explore Service: ${exploreTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`📱 Status Service: ${statusTest ? '✅ PASS' : '❌ FAIL'}`);
  
  if (exploreTest && statusTest) {
    console.log('\n🎉 All tests passed! Backend services are ready.');
  } else {
    console.log('\n⚠️  Some tests failed. Check your Supabase configuration and database setup.');
  }
}

// Export for use in the app
export { runTests, testExploreService, testStatusService };

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}