// Update user role in MongoDB manually for testing
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  clerkId: String,
  role: String,
  authMethod: String,
  firstName: String,
  lastName: String,
  lastSyncedAt: Date
});

const User = mongoose.model('User', userSchema);

async function updateUserRole() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Update nxtivsoftware@gmail.com to tutor role
    const result = await User.findOneAndUpdate(
      { email: 'nxtivsoftware@gmail.com' },
      { 
        role: 'tutor',
        lastSyncedAt: new Date()
      },
      { new: true }
    );

    if (result) {
      console.log('✅ Updated user role:');
      console.log(`  - Email: ${result.email}`);
      console.log(`  - Role: ${result.role}`);
      console.log(`  - ClerkId: ${result.clerkId}`);
    } else {
      console.log('❌ User not found');
    }

    // Verify all users and their roles
    const allUsers = await User.find({});
    console.log('\n📊 All users in database:');
    allUsers.forEach(user => {
      console.log(`  - ${user.email}: ${user.role}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Done! nxtivsoftware@gmail.com is now a tutor.');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

updateUserRole();