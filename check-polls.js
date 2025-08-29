const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkPollStatus() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    
    // Get all polls and their status
    const polls = await db.collection('polls').find({}).toArray();
    console.log(`\n📊 Found ${polls.length} polls:`);
    
    polls.forEach(poll => {
      const votePercentage = poll.targetVotes > 0 ? Math.round((poll.votes.length / poll.targetVotes) * 100) : 0;
      console.log(`- "${poll.title}"`);
      console.log(`  Status: ${poll.status}`);
      console.log(`  Votes: ${poll.votes.length}/${poll.targetVotes} (${votePercentage}%)`);
      console.log(`  AcceptedBy: ${poll.acceptedBy || 'none'}`);
      console.log(`  DeclinedBy: ${poll.declinedBy?.length || 0} tutors`);
      console.log(`  ID: ${poll._id}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

checkPollStatus().catch(console.error);
