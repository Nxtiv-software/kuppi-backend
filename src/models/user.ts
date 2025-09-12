import mongoose from "mongoose";

// Define interfaces for better type safety
interface EmailAddress {
    id: string;
    emailAddress: string;
}

interface ClerkUserData {
    id: string;
    primaryEmailAddressId: string;
    emailAddresses: EmailAddress[];
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
}

type UserRole = 'student' | 'tutor' | 'admin';

const user = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: false // Not required for Clerk users
    },
    clerkId: {
        type: String,
        required: false // Will be required for new Clerk users
    },
    // Additional fields that might be useful
    firstName: {
        type: String,
        required: false
    },
    lastName: {
        type: String,
        required: false
    },
    profileImageUrl: {
        type: String,
        required: false
    },
    // Track authentication method
    authMethod: {
        type: String,
        enum: ['jwt', 'clerk', 'mock'], // Added 'mock' for testing
        default: 'jwt'
    },
    // User role for authorization
    role: {
        type: String,
        enum: ['student', 'tutor', 'admin'],
        default: 'student'
    },
    // Clerk webhook sync
    lastSyncedAt: {
        type: Date,
        default: Date.now
    },
    // User preferences
    preferences: {
        subjects: [{
            type: String,
            enum: ['combined-maths', 'physics', 'chemistry']
        }],
        notifications: {
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: true }
        },
        language: {
            type: String,
            enum: ['en', 'si'],
            default: 'en'
        }
    },
    // Statistics
    stats: {
        pollsCreated: { type: Number, default: 0 },
        votesGiven: { type: Number, default: 0 },
        sessionsAttended: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

// Index for better query performance
user.index({ email: 1 }, { unique: true });
user.index({ clerkId: 1 }, { unique: true, sparse: true });
user.index({ authMethod: 1 });
user.index({ role: 1 });

// Pre-save middleware to set authMethod
user.pre('save', function(next) {
    if (this.clerkId && !this.authMethod) {
        this.authMethod = 'clerk';
    } else if (!this.clerkId && !this.authMethod) {
        this.authMethod = 'jwt';
    }
    next();
});

// Static method to find or create user from Clerk data
user.statics.findOrCreateFromClerk = async function(clerkUserData: ClerkUserData) {
    const { id: clerkId, emailAddresses, firstName, lastName, imageUrl } = clerkUserData;
    // FIX 1: Add proper typing for the email parameter
    const primaryEmail = emailAddresses?.find((email: EmailAddress) => email.id === clerkUserData.primaryEmailAddressId)?.emailAddress;
    
    if (!primaryEmail) {
        throw new Error('No primary email found for Clerk user');
    }

    let user = await this.findOne({ clerkId });
    
    if (!user) {
        // Try to find by email first (for existing JWT users)
        user = await this.findOne({ email: primaryEmail });
        
        if (user) {
            // Update existing user with Clerk data
            user.clerkId = clerkId;
            user.authMethod = 'clerk';
            user.firstName = firstName;
            user.lastName = lastName;
            user.profileImageUrl = imageUrl;
            user.lastSyncedAt = new Date();
            await user.save();
        } else {
            // Create new user
            user = await this.create({
                clerkId,
                email: primaryEmail,
                name: `${firstName} ${lastName}`.trim() || primaryEmail.split('@')[0],
                firstName,
                lastName,
                profileImageUrl: imageUrl,
                authMethod: 'clerk',
                lastSyncedAt: new Date()
            });
        }
    }
    
    return user;
};

// Static method to create mock user for testing
user.statics.createMockUser = async function(mockData = {}) {
    const defaultMockUser = {
        _id: 'test-user-123',
        name: 'Test User',
        email: 'test@example.com',
        authMethod: 'mock',
        role: 'student',
        firstName: 'Test',
        lastName: 'User',
        preferences: {
            subjects: ['data-structures', 'algorithms'],
            notifications: {
                email: true,
                push: true
            },
            language: 'en'
        },
        stats: {
            pollsCreated: 0,
            votesGiven: 0,
            sessionsAttended: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    };

    return { ...defaultMockUser, ...mockData };
};

// Method to update user statistics
user.methods.updateStats = function(type: string, increment = 1) {
    switch (type) {
        case 'pollCreated':
            this.stats.pollsCreated += increment;
            break;
        case 'voteGiven':
            this.stats.votesGiven += increment;
            break;
        case 'sessionAttended':
            this.stats.sessionsAttended += increment;
            break;
    }
    return this.save();
};

// Method to check if user has required permissions
user.methods.hasPermission = function(action: string) {
    const permissions = {
        student: ['create_poll', 'vote', 'view_polls'],
        tutor: ['create_poll', 'vote', 'view_polls', 'manage_sessions', 'view_analytics'],
        admin: ['create_poll', 'vote', 'view_polls', 'manage_sessions', 'view_analytics', 'manage_users', 'system_settings']
    };

    // FIX 2: Use proper type assertion for the role
    return permissions[this.role as UserRole]?.includes(action) || false;
};

const User = mongoose.model("User", user);
export default User;