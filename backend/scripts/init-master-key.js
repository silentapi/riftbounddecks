import mongoose from 'mongoose';
import dotenv from 'dotenv';
import RegistrationKey from '../src/models/RegistrationKey.js';
import User from '../src/models/User.js';
import connectDB from '../src/config/database.js';
import logger from '../src/config/logger.js';

dotenv.config();

/**
 * Script to create a master registration key
 * Usage: node scripts/init-master-key.js [ownerUserId]
 * If no ownerUserId is provided, creates a system master key
 */
const initMasterKey = async () => {
  try {
    await connectDB();

    const ownerUserId = process.argv[2];

    let ownerId;
    if (ownerUserId) {
      // Use provided user ID
      if (!mongoose.Types.ObjectId.isValid(ownerUserId)) {
        logger.error('Invalid user ID provided');
        process.exit(1);
      }
      ownerId = new mongoose.Types.ObjectId(ownerUserId);
      
      // Verify user exists
      const user = await User.findById(ownerId);
      if (!user) {
        logger.error('User not found with provided ID');
        process.exit(1);
      }
      logger.info(`Creating master key for user: ${user.username}`);
    } else {
      // Create a system admin user if it doesn't exist
      let adminUser = await User.findOne({ username: 'admin' });
      
      if (!adminUser) {
        logger.info('Creating system admin user...');
        const passwordHash = await User.hashPassword('admin123'); // Change this!
        adminUser = new User({
          username: 'admin',
          email: 'admin@riftbound.local',
          password_hash: passwordHash
        });
        await adminUser.save();
        logger.warn('⚠️  System admin user created with default password. Please change it!');
      }
      
      ownerId = adminUser._id;
      logger.info(`Creating master key for system admin: ${adminUser.username}`);
    }

    // Check if master key already exists
    const existingMasterKey = await RegistrationKey.findOne({
      ownerId,
      isMasterKey: true
    });

    if (existingMasterKey) {
      logger.info('Master key already exists:', {
        key: existingMasterKey.key,
        ownerId: existingMasterKey.ownerId.toString()
      });
      console.log(`\nMaster Key: ${existingMasterKey.key}`);
      await mongoose.connection.close();
      process.exit(0);
    }

    // Create master key
    const masterKey = new RegistrationKey({
      ownerId,
      maxUses: -1, // Unlimited
      currentUses: 0,
      isMasterKey: true
    });

    await masterKey.save();

    logger.info('Master key created successfully');
    console.log(`\n✅ Master Key Created: ${masterKey.key}`);
    console.log(`   Owner ID: ${masterKey.ownerId.toString()}`);
    console.log(`   Uses: Unlimited (master key)\n`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error('Failed to create master key:', {
      error: error.message,
      stack: error.stack
    });
    await mongoose.connection.close();
    process.exit(1);
  }
};

initMasterKey();

