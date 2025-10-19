import { supabase } from './supabase';

export interface StatusMedia {
  uri: string;
  type: 'image' | 'video';
  duration?: number; // for videos
}

export interface StatusCreate {
  media: StatusMedia;
  caption?: string;
  backgroundColor?: string;
  textPosition?: 'top' | 'center' | 'bottom';
}

export interface Status {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption?: string;
  background_color?: string;
  text_position?: string;
  created_at: string;
  expires_at: string;
  is_active: boolean;
  view_count: number;
  views?: StatusView[];
}

export interface StatusView {
  id: string;
  status_id: string;
  viewer_id: string;
  viewer_name: string;
  viewer_avatar: string | null;
  viewed_at: string;
}

export interface StatusRing {
  userId: string;
  userName: string;
  userAvatar: string | null;
  hasUnviewedStatus: boolean;
  statusCount: number;
  lastStatusTime: string;
  isMyStatus?: boolean;
}

export class StatusService {
  
  /**
   * Create a new status
   */
  static async createStatus(userId: string, statusData: StatusCreate): Promise<Status> {
    try {
      // Upload media to storage
      const mediaUrl = await this.uploadStatusMedia(userId, statusData.media);
      
      // Calculate expiry time (24 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const { data, error } = await supabase
        .from('user_statuses')
        .insert({
          user_id: userId,
          media_url: mediaUrl,
          media_type: statusData.media.type,
          caption: statusData.caption,
          background_color: statusData.backgroundColor,
          text_position: statusData.textPosition,
          expires_at: expiresAt.toISOString(),
          is_active: true,
          view_count: 0
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error creating status:', error);
      throw error;
    }
  }

  /**
   * Upload status media to Supabase storage
   */
  static async uploadStatusMedia(userId: string, media: StatusMedia): Promise<string> {
    try {
      // Convert URI to blob for upload
      const response = await fetch(media.uri);
      const blob = await response.blob();
      
      // Generate unique filename
      const fileExt = media.type === 'image' ? 'jpg' : 'mp4';
      const fileName = `${userId}/${Date.now()}_status.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('status-media')
        .upload(fileName, blob, {
          contentType: media.type === 'image' ? 'image/jpeg' : 'video/mp4',
          cacheControl: '3600'
        });

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('status-media')
        .getPublicUrl(data.path);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading status media:', error);
      throw error;
    }
  }

  /**
   * Get user's own statuses
   */
  static async getMyStatuses(userId: string): Promise<Status[]> {
    try {
      // First get the statuses
      const { data: statuses, error: statusError } = await supabase
        .from('user_statuses')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (statusError) {
        // If table doesn't exist, return empty array
        if (statusError.code === 'PGRST205' || statusError.message.includes('user_statuses')) {
          console.warn('Status tables not yet created. Run the database migration.');
          return [];
        }
        throw statusError;
      }

      if (!statuses || statuses.length === 0) {
        return [];
      }

      // Then get the views for each status
      const statusesWithViews = await Promise.all(
        statuses.map(async (status) => {
          // Get views for this status
          const { data: views } = await supabase
            .from('status_views')
            .select(`
              id,
              viewer_id,
              viewed_at
            `)
            .eq('status_id', status.id);

          // Get viewer profiles separately
          const viewsWithProfiles = await Promise.all(
            (views || []).map(async (view) => {
              const { data: profile } = await supabase
                .from('profiles')
                .select('full_name, avatar_url')
                .eq('user_id', view.viewer_id)
                .single();

              return {
                id: view.id,
                status_id: status.id,
                viewer_id: view.viewer_id,
                viewer_name: profile?.full_name || 'Unknown User',
                viewer_avatar: profile?.avatar_url || null,
                viewed_at: view.viewed_at
              };
            })
          );

          return {
            ...status,
            views: viewsWithProfiles
          };
        })
      );

      return statusesWithViews;

    } catch (error) {
      console.error('Error fetching my statuses:', error);
      return [];
    }
  }

  /**
   * Get status rings for discovery page
   */
  static async getStatusRings(userId: string, limit: number = 50): Promise<StatusRing[]> {
    try {
      // Get user's own status first
      const myStatuses = await this.getMyStatuses(userId);
      const rings: StatusRing[] = [];

      // Add user's own status ring if they have active statuses
      if (myStatuses.length > 0) {
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('user_id', userId)
          .single();

        rings.push({
          userId: userId,
          userName: 'Your story',
          userAvatar: userProfile?.avatar_url || null,
          hasUnviewedStatus: false, // User has seen their own status
          statusCount: myStatuses.length,
          lastStatusTime: myStatuses[0].created_at,
          isMyStatus: true
        });
      }

      // Get other users' status rings
      const { data: otherStatuses, error } = await supabase
        .from('user_statuses')
        .select('id, user_id, created_at')
        .neq('user_id', userId)
        .eq('is_active', true)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        // If table doesn't exist, return empty array
        if (error.code === 'PGRST205' || error.message.includes('user_statuses')) {
          console.warn('Status tables not yet created. Run the database migration.');
          return rings; // Return just user's own status if any
        }
        throw error;
      }

      // Group by user and check if current user has viewed their latest status
      const userStatusMap = new Map<string, any[]>();
      
      otherStatuses?.forEach(status => {
        const statusUserId = status.user_id;
        if (!userStatusMap.has(statusUserId)) {
          userStatusMap.set(statusUserId, []);
        }
        userStatusMap.get(statusUserId)!.push(status);
      });

      // Create rings for each user
      const ringPromises = Array.from(userStatusMap.entries()).map(async ([statusUserId, statuses]) => {
        const latestStatus = statuses[0];
        
        // Get user profile separately
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('user_id', statusUserId)
          .single();
        
        // Check if current user has viewed the latest status
        const { data: hasViewed } = await supabase
          .from('status_views')
          .select('id')
          .eq('status_id', latestStatus.id)
          .eq('viewer_id', userId)
          .single();

        return {
          userId: statusUserId,
          userName: userProfile?.full_name || 'Unknown User',
          userAvatar: userProfile?.avatar_url || null,
          hasUnviewedStatus: !hasViewed,
          statusCount: statuses.length,
          lastStatusTime: latestStatus.created_at,
          isMyStatus: false
        };
      });

      const otherRings = await Promise.all(ringPromises);
      rings.push(...otherRings);

      // Sort rings: own status first, then unviewed statuses, then viewed ones
      return rings.sort((a, b) => {
        if (a.isMyStatus) return -1;
        if (b.isMyStatus) return 1;
        if (a.hasUnviewedStatus && !b.hasUnviewedStatus) return -1;
        if (!a.hasUnviewedStatus && b.hasUnviewedStatus) return 1;
        return new Date(b.lastStatusTime).getTime() - new Date(a.lastStatusTime).getTime();
      });

    } catch (error) {
      console.error('Error fetching status rings:', error);
      return [];
    }
  }

  /**
   * Get statuses for a specific user
   */
  static async getUserStatuses(targetUserId: string, viewerId: string): Promise<Status[]> {
    try {
      const { data, error } = await supabase
        .from('user_statuses')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('is_active', true)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching user statuses:', error);
      throw error;
    }
  }

  /**
   * Mark status as viewed
   */
  static async markStatusViewed(statusId: string, viewerId: string): Promise<void> {
    try {
      // Check if already viewed
      const { data: existingView } = await supabase
        .from('status_views')
        .select('id')
        .eq('status_id', statusId)
        .eq('viewer_id', viewerId)
        .single();

      if (existingView) return; // Already viewed

      // Record the view
      const { error: viewError } = await supabase
        .from('status_views')
        .insert({
          status_id: statusId,
          viewer_id: viewerId
        });

      if (viewError) throw viewError;

      // Increment view count
      const { error: updateError } = await supabase
        .from('user_statuses')
        .update({ 
          view_count: supabase.rpc('increment_view_count', { status_id: statusId })
        })
        .eq('id', statusId);

      if (updateError) {
        // Fallback: manually increment
        const { data: currentStatus } = await supabase
          .from('user_statuses')
          .select('view_count')
          .eq('id', statusId)
          .single();

        if (currentStatus) {
          await supabase
            .from('user_statuses')
            .update({ view_count: (currentStatus.view_count || 0) + 1 })
            .eq('id', statusId);
        }
      }

    } catch (error) {
      console.error('Error marking status as viewed:', error);
      throw error;
    }
  }

  /**
   * Delete a status
   */
  static async deleteStatus(statusId: string, userId: string): Promise<void> {
    try {
      // Verify ownership
      const { data: status } = await supabase
        .from('user_statuses')
        .select('user_id, media_url')
        .eq('id', statusId)
        .single();

      if (!status || status.user_id !== userId) {
        throw new Error('Status not found or unauthorized');
      }

      // Delete from storage
      const urlParts = status.media_url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const filePath = `${userId}/${fileName}`;

      await supabase.storage
        .from('status-media')
        .remove([filePath]);

      // Soft delete the status
      const { error } = await supabase
        .from('user_statuses')
        .update({ is_active: false })
        .eq('id', statusId);

      if (error) throw error;

    } catch (error) {
      console.error('Error deleting status:', error);
      throw error;
    }
  }

  /**
   * Clean up expired statuses (can be called periodically)
   */
  static async cleanupExpiredStatuses(): Promise<void> {
    try {
      const { data: expiredStatuses } = await supabase
        .from('user_statuses')
        .select('id, user_id, media_url')
        .eq('is_active', true)
        .lt('expires_at', new Date().toISOString());

      if (expiredStatuses && expiredStatuses.length > 0) {
        // Delete media files from storage
        for (const status of expiredStatuses) {
          try {
            const urlParts = status.media_url.split('/');
            const fileName = urlParts[urlParts.length - 1];
            const filePath = `${status.user_id}/${fileName}`;
            
            await supabase.storage
              .from('status-media')
              .remove([filePath]);
          } catch (error) {
            console.warn(`Failed to delete media for status ${status.id}:`, error);
          }
        }

        // Mark statuses as inactive
        const statusIds = expiredStatuses.map(s => s.id);
        await supabase
          .from('user_statuses')
          .update({ is_active: false })
          .in('id', statusIds);

        console.log(`Cleaned up ${expiredStatuses.length} expired statuses`);
      }

    } catch (error) {
      console.error('Error cleaning up expired statuses:', error);
    }
  }

  /**
   * Get status analytics for user
   */
  static async getStatusAnalytics(userId: string): Promise<{
    totalViews: number;
    uniqueViewers: number;
    statusCount: number;
    avgViewsPerStatus: number;
    topViewers: Array<{ name: string; avatar: string | null; viewCount: number }>;
  }> {
    try {
      // Get user's active statuses
      const { data: statuses } = await supabase
        .from('user_statuses')
        .select(`
          id,
          view_count,
          status_views(
            viewer_id,
            profiles!inner(
              full_name,
              avatar_url
            )
          )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .gte('expires_at', new Date().toISOString());

      if (!statuses || statuses.length === 0) {
        return {
          totalViews: 0,
          uniqueViewers: 0,
          statusCount: 0,
          avgViewsPerStatus: 0,
          topViewers: []
        };
      }

      const totalViews = statuses.reduce((sum, status) => sum + (status.view_count || 0), 0);
      const statusCount = statuses.length;
      
      // Count unique viewers
      const allViewers = new Set();
      const viewerCounts = new Map<string, { name: string; avatar: string | null; count: number }>();

      statuses.forEach(status => {
        status.status_views?.forEach((view: any) => {
          allViewers.add(view.viewer_id);
          
          const key = view.viewer_id;
          if (viewerCounts.has(key)) {
            viewerCounts.get(key)!.count++;
          } else {
            viewerCounts.set(key, {
              name: view.profiles.full_name,
              avatar: view.profiles.avatar_url,
              count: 1
            });
          }
        });
      });

      // Get top 5 viewers
      const topViewers = Array.from(viewerCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(viewer => ({
          name: viewer.name,
          avatar: viewer.avatar,
          viewCount: viewer.count
        }));

      return {
        totalViews,
        uniqueViewers: allViewers.size,
        statusCount,
        avgViewsPerStatus: statusCount > 0 ? Math.round(totalViews / statusCount) : 0,
        topViewers
      };

    } catch (error) {
      console.error('Error fetching status analytics:', error);
      return {
        totalViews: 0,
        uniqueViewers: 0,
        statusCount: 0,
        avgViewsPerStatus: 0,
        topViewers: []
      };
    }
  }
}