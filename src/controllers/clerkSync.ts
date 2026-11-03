import { Request, Response } from 'express';
import { clerkClient } from '@clerk/clerk-sdk-node';
import User from '../models/user';

/**
 * Sync all users from Clerk to MongoDB
 */
export const syncUsersFromClerk = async (req: Request, res: Response) => {
  try {
    console.log('🔄 ===== SYNCING USERS FROM CLERK =====');
    
    // Fetch all users from Clerk
    const clerkUsers = await clerkClient.users.getUserList();
    console.log(`📊 Found ${clerkUsers.length} users in Clerk`);

    let updated = 0;
    let created = 0;
    let errors = 0;

    for (const clerkUser of clerkUsers) {
      try {
        const { id: clerkId, emailAddresses, firstName, lastName, imageUrl, publicMetadata, privateMetadata, unsafeMetadata } = clerkUser;
        
        // Get primary email
        const primaryEmail = clerkUser.emailAddresses.find(email => email.id === clerkUser.primaryEmailAddressId)?.emailAddress;
        if (!primaryEmail) {
          console.log(`⚠️  Skipping user ${clerkId} - no primary email`);
          continue;
        }

        // Extract role from metadata
        const clerkRole = (publicMetadata?.role || privateMetadata?.role || unsafeMetadata?.role) as string;
        console.log(`👤 Processing ${primaryEmail} | Clerk role: ${clerkRole || 'none'}`);

        // Find existing user in MongoDB
        let user = await User.findOne({ clerkId });

        if (user) {
          // Update existing user
          user.email = primaryEmail;
          user.firstName = firstName;
          user.lastName = lastName;
          user.name = `${firstName} ${lastName}`.trim() || primaryEmail.split('@')[0];
          user.profileImageUrl = imageUrl;
          user.lastSyncedAt = new Date();
          
          // Sync role from Clerk metadata if provided
          if (clerkRole && ['student', 'tutor', 'admin'].includes(clerkRole)) {
            user.role = clerkRole as 'student' | 'tutor' | 'admin';
            console.log(`  ✅ Updated role: ${clerkRole}`);
          }
          
          await user.save();
          updated++;
        } else {
          // Check if user exists by email (might be a JWT user)
          user = await User.findOne({ email: primaryEmail });
          
          if (user) {
            // Link existing user to Clerk
            user.clerkId = clerkId;
            user.authMethod = 'clerk';
            user.firstName = firstName;
            user.lastName = lastName;
            user.profileImageUrl = imageUrl;
            user.lastSyncedAt = new Date();
            
            if (clerkRole && ['student', 'tutor', 'admin'].includes(clerkRole)) {
              user.role = clerkRole as 'student' | 'tutor' | 'admin';
            }
            
            await user.save();
            console.log(`  ✅ Linked existing user: ${primaryEmail}`);
            updated++;
          } else {
            // Create new user
            const defaultRole = clerkRole && ['student', 'tutor', 'admin'].includes(clerkRole) ? clerkRole as 'student' | 'tutor' | 'admin' : 'student';
            
            user = await User.create({
              clerkId,
              email: primaryEmail,
              name: `${firstName} ${lastName}`.trim() || primaryEmail.split('@')[0],
              firstName,
              lastName,
              profileImageUrl: imageUrl,
              authMethod: 'clerk',
              role: defaultRole,
              lastSyncedAt: new Date()
            });
            
            console.log(`  ✅ Created new user: ${primaryEmail} | Role: ${defaultRole}`);
            created++;
          }
        }
      } catch (error) {
        console.error(`❌ Error processing user ${clerkUser.id}:`, error);
        errors++;
      }
    }

    console.log('🔄 ===== SYNC COMPLETE =====');
    console.log(`📊 Results: ${created} created, ${updated} updated, ${errors} errors`);

    res.json({
      success: true,
      message: 'Users synced successfully',
      stats: { created, updated, errors, total: clerkUsers.length }
    });

  } catch (error) {
    console.error('❌ Failed to sync users from Clerk:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync users',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Sync a specific user from Clerk to MongoDB
 */
export const syncUserFromClerk = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    console.log(`🔄 Syncing user ${userId} from Clerk`);

    // Fetch user from Clerk
    const clerkUser = await clerkClient.users.getUser(userId);
    
    const { id: clerkId, firstName, lastName, imageUrl, publicMetadata, privateMetadata, unsafeMetadata } = clerkUser;
    const primaryEmail = clerkUser.emailAddresses.find(email => email.id === clerkUser.primaryEmailAddressId)?.emailAddress;

    if (!primaryEmail) {
      return res.status(400).json({
        success: false,
        message: 'User has no primary email address'
      });
    }

    // Extract role from metadata
    const clerkRole = (publicMetadata?.role || privateMetadata?.role || unsafeMetadata?.role) as string;
    
    // Find or create user in MongoDB
    let user = await User.findOne({ clerkId });
    
    if (user) {
      // Update existing user
      user.email = primaryEmail;
      user.firstName = firstName;
      user.lastName = lastName;
      user.name = `${firstName} ${lastName}`.trim() || primaryEmail.split('@')[0];
      user.profileImageUrl = imageUrl;
      user.lastSyncedAt = new Date();
      
      if (clerkRole && ['student', 'tutor', 'admin'].includes(clerkRole)) {
        user.role = clerkRole as 'student' | 'tutor' | 'admin';
      }
      
      await user.save();
      console.log(`✅ Updated user: ${primaryEmail} | Role: ${user.role}`);
    } else {
      // Create new user
      const defaultRole = clerkRole && ['student', 'tutor', 'admin'].includes(clerkRole) ? clerkRole as 'student' | 'tutor' | 'admin' : 'student';
      
      user = await User.create({
        clerkId,
        email: primaryEmail,
        name: `${firstName} ${lastName}`.trim() || primaryEmail.split('@')[0],
        firstName,
        lastName,
        profileImageUrl: imageUrl,
        authMethod: 'clerk',
        role: defaultRole,
        lastSyncedAt: new Date()
      });
      
      console.log(`✅ Created user: ${primaryEmail} | Role: ${user.role}`);
    }

    res.json({
      success: true,
      message: 'User synced successfully',
      user: {
        email: user.email,
        role: user.role,
        clerkId: user.clerkId
      }
    });

  } catch (error) {
    console.error(`❌ Failed to sync user ${req.params.userId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync user',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};