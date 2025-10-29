import { clerkClient } from '@clerk/clerk-sdk-node';

interface UserInfo {
  id: string;
  name: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  username?: string;
}

class UserService {
  // Cache for user data to avoid repeated API calls
  private userCache = new Map<string, UserInfo>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get user information by Clerk user ID
   */
  async getUserInfo(userId: string): Promise<UserInfo | null> {
    try {
      // Validate userId is a string and not an object
      if (!userId || typeof userId !== 'string') {
        console.error(`❌ Invalid userId type: ${typeof userId}, value:`, userId);
        return null;
      }

      // Additional check for [object Object] string
      if (userId === '[object Object]' || userId.includes('[object')) {
        console.error(`❌ Received [object Object] as userId, skipping`);
        return null;
      }

      // Check cache first
      const cached = this.getUserFromCache(userId);
      if (cached) {
        return cached;
      }

      console.log(`👤 Fetching user info for: ${userId}`);

      // Fetch from Clerk
      const user = await clerkClient.users.getUser(userId);
      
      if (!user) {
        console.warn(`⚠️ User not found in Clerk: ${userId}`);
        return null;
      }

      const userInfo: UserInfo = {
        id: user.id,
        name: this.getFullName(user.firstName, user.lastName) || user.emailAddresses[0]?.emailAddress.split('@')[0] || 'Unknown User',
        email: user.emailAddresses[0]?.emailAddress || 'No email',
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        imageUrl: user.imageUrl || undefined,
        username: user.username || undefined
      };

      // Cache the result
      this.cacheUser(userId, userInfo);
      
      console.log(`✅ Retrieved user: ${userInfo.name} (${userInfo.email})`);
      return userInfo;

    } catch (error) {
      console.error(`❌ Error fetching user ${userId}:`, error);
      
      // Return fallback user info
      return {
        id: userId,
        name: this.extractNameFromUserId(userId),
        email: 'Unknown email'
      };
    }
  }

  /**
   * Get multiple users' information
   */
  async getUsersInfo(userIds: string[]): Promise<Map<string, UserInfo>> {
    const userMap = new Map<string, UserInfo>();
    
    // Process in batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      const promises = batch.map(async (userId) => {
        const userInfo = await this.getUserInfo(userId);
        if (userInfo) {
          userMap.set(userId, userInfo);
        }
      });
      
      await Promise.all(promises);
    }
    
    return userMap;
  }

  /**
   * Get user information with fallback to cached or default values
   */
  getUserInfoSync(userId: string): UserInfo {
    const cached = this.getUserFromCache(userId);
    if (cached) {
      return cached;
    }

    // Return fallback
    return {
      id: userId,
      name: this.extractNameFromUserId(userId),
      email: 'Loading...'
    };
  }

  /**
   * Cache management
   */
  private cacheUser(userId: string, userInfo: UserInfo): void {
    this.userCache.set(userId, userInfo);
    this.cacheExpiry.set(userId, Date.now() + this.CACHE_TTL);
  }

  private getUserFromCache(userId: string): UserInfo | null {
    const expiry = this.cacheExpiry.get(userId);
    if (expiry && Date.now() < expiry) {
      return this.userCache.get(userId) || null;
    }
    
    // Remove expired entries
    this.userCache.delete(userId);
    this.cacheExpiry.delete(userId);
    return null;
  }

  /**
   * Utility methods
   */
  private getFullName(firstName?: string | null, lastName?: string | null): string {
    const parts = [firstName, lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '';
  }

  private extractNameFromUserId(userId: string): string {
    // Try to extract a readable name from Clerk user ID
    if (userId.startsWith('user_')) {
      return `User ${userId.slice(-6)}`; // Show last 6 characters
    }
    return 'Unknown User';
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.userCache.clear();
    this.cacheExpiry.clear();
  }
}

// Export singleton instance
export const userService = new UserService();
export { UserInfo };
