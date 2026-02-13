import { Request, Response } from 'express';
import { Webhook } from 'svix';
import User from '../models/user';

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

if (!webhookSecret) {
  throw new Error('CLERK_WEBHOOK_SECRET is required');
}

export const handleClerkWebhook = async (req: Request, res: Response) => {
  try {
    console.log('🔔 ===== CLERK WEBHOOK RECEIVED =====');
    const headers = req.headers;
    
    // Get raw body as string - req.body is Buffer from express.raw()
    const payload = req.body.toString();
    
    console.log('📦 Payload length:', payload.length);
    console.log('🔑 Headers:', {
      'svix-id': headers['svix-id'],
      'svix-timestamp': headers['svix-timestamp'],
      'svix-signature': headers['svix-signature'] ? 'present' : 'missing'
    });

    const wh = new Webhook(webhookSecret);
    let evt: any;

    try {
      evt = wh.verify(payload, headers as any);
      console.log('✅ Webhook signature verified');
    } catch (err) {
      console.error('❌ Error verifying webhook:', err);
      return res.status(400).json({ error: 'Webhook verification failed' });
    }

    const eventType = evt.type;
    const { id, email_addresses, first_name, last_name, image_url, public_metadata, private_metadata, unsafe_metadata } = evt.data as any;

    console.log('📧 Received Clerk webhook:', eventType, '| User ID:', id);
    console.log('🏷️  Metadata:', { public_metadata, private_metadata, unsafe_metadata });

    switch (eventType) {
      case 'user.created':
      case 'user.updated':
        await handleUserUpsert({
          id,
          emailAddresses: email_addresses,
          firstName: first_name,
          lastName: last_name,
          imageUrl: image_url,
          metadata: { public_metadata, private_metadata, unsafe_metadata },
          primaryEmailAddressId: (evt.data as any).primary_email_address_id
        });
        break;

      case 'user.deleted':
        await handleUserDeletion(id);
        break;

      default:
        console.log('Unhandled webhook event type:', eventType);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const handleUserUpsert = async (clerkUserData: any) => {
  try {
    console.log('👤 Upserting user:', clerkUserData);
    const { id: clerkId, emailAddresses, firstName, lastName, imageUrl, primaryEmailAddressId, metadata } = clerkUserData;
    const primaryEmail = emailAddresses?.find((email: any) => email.id === primaryEmailAddressId)?.email_address;
    
    console.log('📧 Primary email:', primaryEmail);

    // Extract role from Clerk metadata (check all metadata sources)
    const clerkRole = metadata?.public_metadata?.role || 
                     metadata?.private_metadata?.role || 
                     metadata?.unsafe_metadata?.role;
    console.log('🏷️  Clerk role from metadata:', clerkRole);

    if (!primaryEmail) {
      console.error('❌ No primary email found for Clerk user:', clerkId);
      return;
    }

    let user = await User.findOne({ clerkId });
    console.log('🔍 Existing user with clerkId?', user ? 'Yes' : 'No');
    
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
        user.role = clerkRole;
        console.log('🔄 Updated role from Clerk:', clerkRole);
      }
      
      await user.save();
      console.log('✅ Updated user:', user.email, '| Role:', user.role);
    } else {
      // Check if user exists with this email (JWT user upgrading to Clerk)
      user = await User.findOne({ email: primaryEmail });
      
      if (user) {
        // Link existing JWT user to Clerk
        user.clerkId = clerkId;
        user.authMethod = 'clerk';
        user.firstName = firstName;
        user.lastName = lastName;
        user.profileImageUrl = imageUrl;
        user.lastSyncedAt = new Date();
        
        // Sync role from Clerk metadata if provided
        if (clerkRole && ['student', 'tutor', 'admin'].includes(clerkRole)) {
          user.role = clerkRole;
          console.log('🔄 Linked user role from Clerk:', clerkRole);
        }
        
        await user.save();
        console.log('✅ Linked existing user to Clerk:', user.email, '| Role:', user.role);
      } else {
        // Create new user - determine role
        const defaultRole = clerkRole && ['student', 'tutor', 'admin'].includes(clerkRole) ? clerkRole : 'student';
        
        user = await User.create({
          clerkId,
          email: primaryEmail,
          name: `${firstName} ${lastName}`.trim() || primaryEmail.split('@')[0],
          firstName,
          lastName,
          profileImageUrl: imageUrl,
          authMethod: 'clerk',
          role: defaultRole, // Use Clerk role or default to student
          lastSyncedAt: new Date()
        });
        console.log('✅ Created new user:', user.email, '| Role:', user.role);
      }
    }
  } catch (error) {
    console.error('Error upserting user:', error);
  }
};

const handleUserDeletion = async (clerkId: string) => {
  try {
    const user = await User.findOne({ clerkId });
    if (user) {
      // Option 1: Soft delete - just remove Clerk association
      user.clerkId = undefined;
      user.authMethod = 'jwt';
      await user.save();
      
      // Option 2: Hard delete (uncomment if preferred)
      // await User.findByIdAndDelete(user._id);
      
      console.log('Handled user deletion for:', clerkId);
    }
  } catch (error) {
    console.error('Error deleting user:', error);
  }
};