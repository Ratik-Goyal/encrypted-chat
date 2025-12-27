const mongoose = require("mongoose");
const User = require("./models/User");
const Conversation = require("./models/Conversation");
const Message = require("./message.model");

mongoose.connect(
  "mongodb+srv://Ratik_Goyal:Ratikgoyal4647%26%26@cluster.iwpicqh.mongodb.net/?appName=Cluster"
).then(() => {
  console.log("🟢 MongoDB connected");
  seedDatabase();
}).catch(err => {
  console.error("🔴 MongoDB error:", err);
  process.exit(1);
});

const generateEncryptedMessage = (text) => {
  return Array.from(Buffer.from(text)).map(byte => byte + Math.floor(Math.random() * 50));
};

const sampleMessages = [
  "Hey, how are you?",
  "I'm doing great, thanks!",
  "Did you see the latest update?",
  "Yes, it looks amazing!",
  "Let's catch up later",
  "Sure, what time works for you?",
  "How about 3 PM?",
  "Perfect, see you then!",
  "Thanks for your help earlier",
  "No problem, anytime!",
  "Are you free this weekend?",
  "I have some plans, but flexible",
  "Great! Let's plan something",
  "Sounds good to me",
  "What do you think about the project?",
  "I think it's going well",
  "We should add more features",
  "Agreed, let's discuss tomorrow",
  "Can you send me that file?",
  "Sure, sending it now"
];

async function seedDatabase() {
  try {
    await User.deleteMany({});
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    console.log("🗑️  Cleared existing data");

    const users = [];
    for (let i = 1; i <= 100; i++) {
      users.push({
        walletAddress: `0x${Math.random().toString(16).substr(2, 40)}`,
        publicKey: `pk_${Math.random().toString(36).substr(2, 32)}`,
        lastSeen: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
      });
    }
    const createdUsers = await User.insertMany(users);
    console.log(`✅ Created ${createdUsers.length} users`);

    const conversations = [];
    const messages = [];
    
    for (let i = 0; i < 200; i++) {
      const user1 = createdUsers[Math.floor(Math.random() * createdUsers.length)];
      const user2 = createdUsers[Math.floor(Math.random() * createdUsers.length)];
      
      if (user1._id.toString() !== user2._id.toString()) {
        const participants = [user1.walletAddress, user2.walletAddress].sort();
        
        const existingConv = conversations.find(c => 
          c.participants[0] === participants[0] && c.participants[1] === participants[1]
        );
        
        if (!existingConv) {
          conversations.push({
            participants,
            lastMessageAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
          });
          
          const msgCount = Math.floor(Math.random() * 30) + 10;
          for (let j = 0; j < msgCount; j++) {
            const isFromUser1 = Math.random() > 0.5;
            messages.push({
              from: isFromUser1 ? user1.walletAddress : user2.walletAddress,
              to: isFromUser1 ? user2.walletAddress : user1.walletAddress,
              encrypted: generateEncryptedMessage(
                sampleMessages[Math.floor(Math.random() * sampleMessages.length)]
              ),
              timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
            });
          }
        }
      }
    }

    const createdConversations = await Conversation.insertMany(conversations);
    console.log(`✅ Created ${createdConversations.length} conversations`);

    const createdMessages = await Message.insertMany(messages);
    console.log(`✅ Created ${createdMessages.length} messages`);

    console.log("\n🎉 Database seeded successfully!");
    console.log(`📊 Summary:`);
    console.log(`   - Users: ${createdUsers.length}`);
    console.log(`   - Conversations: ${createdConversations.length}`);
    console.log(`   - Messages: ${createdMessages.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}
