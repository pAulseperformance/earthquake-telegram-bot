import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import cron from 'node-cron';
import TelegramBot from 'node-telegram-bot-api';
import config from './config';
import * as fs from 'fs';
import * as path from 'path';
import { startHealthCheckServer, updateSubscriberCount } from './health';
import { logger } from './utils/logger';

// Start the health check server for container monitoring
startHealthCheckServer();

// Earthquake feed URLs for different categories
const EARTHQUAKE_FEEDS = {
  significant: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_hour.atom',
  m4plus: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_hour.atom',
  m2plus: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_hour.atom',
  m1plus: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/1.0_hour.atom',
  all: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.atom'
};

// Create bot with polling to receive messages
const bot = new TelegramBot(config.telegramBotToken, { polling: true });

// Define the subscriber structure
interface Subscriber {
  chatId: string;
  preferences: {
    significant: boolean;
    m4plus: boolean;
    m2plus: boolean;
    m1plus: boolean;
    all: boolean;
  }
}

// File path for storing subscriber data
const SUBSCRIBERS_FILE_PATH = path.join(__dirname, '..', 'data', 'subscribers.json');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(SUBSCRIBERS_FILE_PATH))) {
  fs.mkdirSync(path.dirname(SUBSCRIBERS_FILE_PATH), { recursive: true });
}

// Load subscribed users from file or initialize if file doesn't exist
let subscribers: Subscriber[] = [];
try {
  if (fs.existsSync(SUBSCRIBERS_FILE_PATH)) {
    const data = fs.readFileSync(SUBSCRIBERS_FILE_PATH, 'utf8');
    let loadedData = JSON.parse(data);
    
    // Handle migration from old format (array of chat IDs) to new format (array of Subscriber objects)
    if (Array.isArray(loadedData) && loadedData.length > 0 && typeof loadedData[0] === 'string') {
      logger.info('Migrating subscribers from old format to new format with preferences');
      subscribers = loadedData.map(chatId => ({
        chatId,
        preferences: { significant: true, m4plus: true, m2plus: true, m1plus: true, all: true }
      }));
      saveSubscribers(); // Save the migrated data
    } else {
      subscribers = loadedData;
    }
    
    logger.info(`Loaded ${subscribers.length} subscribers from storage.`);
  } else {
    // Initialize with the default subscriber
    subscribers = [{
      chatId: config.telegramChatId,
      preferences: { significant: true, m4plus: true, m2plus: true, m1plus: true, all: true }
    }];
    saveSubscribers();
    logger.info('Created new subscribers file with the default subscriber.');
  }
} catch (error) {
  logger.error('Error loading subscribers, starting with default:', error);
  subscribers = [{
    chatId: config.telegramChatId,
    preferences: { significant: true, m4plus: true, m2plus: true, m1plus: true, all: true }
  }];
}

// Function to save subscribers to file
function saveSubscribers() {
  try {
    fs.writeFileSync(
      SUBSCRIBERS_FILE_PATH,
      JSON.stringify(subscribers, null, 2),
      'utf8'
    );
    logger.info(`Saved ${subscribers.length} subscribers to storage.`);
    
    // Update health metrics with subscriber count
    updateSubscriberCount(subscribers.length);
  } catch (error) {
    logger.error('Error saving subscribers:', error);
  }
}

// Function to find a subscriber by chat ID
function findSubscriber(chatId: string): Subscriber | undefined {
  return subscribers.find(sub => sub.chatId === chatId);
}

// Function to add or update a subscriber
function upsertSubscriber(chatId: string, preferences?: Partial<Subscriber['preferences']>) {
  const existingIndex = subscribers.findIndex(sub => sub.chatId === chatId);
  
  if (existingIndex >= 0) {
    // Update existing subscriber
    if (preferences) {
      subscribers[existingIndex].preferences = {
        ...subscribers[existingIndex].preferences,
        ...preferences
      };
    }
  } else {
    // Add new subscriber
    subscribers.push({
      chatId,
      preferences: preferences ? {
        significant: preferences.significant ?? true,
        m4plus: preferences.m4plus ?? true,
        m2plus: preferences.m2plus ?? false,
        m1plus: preferences.m1plus ?? false, 
        all: preferences.all ?? false
      } : { significant: true, m4plus: true, m2plus: false, m1plus: false, all: false }
    });
  }
  
  saveSubscribers();
}

// Function to remove a subscriber
function removeSubscriber(chatId: string) {
  subscribers = subscribers.filter(sub => sub.chatId !== chatId);
  saveSubscribers();
}

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id.toString();
  bot.sendMessage(
    chatId,
    "Welcome to EarthBoundBot! 🌍 I provide real-time earthquake notifications from USGS.\n\n" +
    "Commands:\n" +
    "/subscribe - Subscribe to all earthquake notifications\n" +
    "/customize - Customize which types of earthquakes you receive\n" +
    "/status - Check your subscription status\n" +
    "/unsubscribe - Stop receiving all notifications\n" +
    "/latest - Get latest earthquake data"
  );
});

// Handle /subscribe command
bot.onText(/\/subscribe/, (msg) => {
  const chatId = msg.chat.id.toString();
  upsertSubscriber(chatId, { significant: true, m4plus: true, m2plus: true, m1plus: true, all: true });
  bot.sendMessage(
    chatId,
    "✅ You've successfully subscribed to all earthquake notifications! You'll receive alerts for new earthquakes."
  );
});

// Handle /customize command
bot.onText(/\/customize/, (msg) => {
  const chatId = msg.chat.id.toString();
  bot.sendMessage(
    chatId,
    "Please choose the types of earthquakes you want to receive notifications for:\n" +
    "/significant - Significant earthquakes\n" +
    "/m4plus - Magnitude 4.5+ earthquakes\n" +
    "/m2plus - Magnitude 2.5+ earthquakes\n" +
    "/m1plus - Magnitude 1.0+ earthquakes\n" +
    "/all - All earthquakes"
  );
});

// Handle /significant command
bot.onText(/\/significant/, (msg) => {
  const chatId = msg.chat.id.toString();
  const subscriber = findSubscriber(chatId);
  const currentValue = subscriber?.preferences.significant || false;
  
  upsertSubscriber(chatId, { significant: !currentValue });
  
  bot.sendMessage(
    chatId,
    !currentValue 
      ? "✅ You will now receive notifications for significant earthquakes."
      : "❌ You will no longer receive notifications for significant earthquakes."
  );
});

// Handle /m4plus command
bot.onText(/\/m4plus/, (msg) => {
  const chatId = msg.chat.id.toString();
  const subscriber = findSubscriber(chatId);
  const currentValue = subscriber?.preferences.m4plus || false;
  
  upsertSubscriber(chatId, { m4plus: !currentValue });
  
  bot.sendMessage(
    chatId,
    !currentValue 
      ? "✅ You will now receive notifications for earthquakes of magnitude 4.5+."
      : "❌ You will no longer receive notifications for earthquakes of magnitude 4.5+."
  );
});

// Handle /m2plus command
bot.onText(/\/m2plus/, (msg) => {
  const chatId = msg.chat.id.toString();
  const subscriber = findSubscriber(chatId);
  const currentValue = subscriber?.preferences.m2plus || false;
  
  upsertSubscriber(chatId, { m2plus: !currentValue });
  
  bot.sendMessage(
    chatId,
    !currentValue 
      ? "✅ You will now receive notifications for earthquakes of magnitude 2.5+."
      : "❌ You will no longer receive notifications for earthquakes of magnitude 2.5+."
  );
});

// Handle /m1plus command
bot.onText(/\/m1plus/, (msg) => {
  const chatId = msg.chat.id.toString();
  const subscriber = findSubscriber(chatId);
  const currentValue = subscriber?.preferences.m1plus || false;
  
  upsertSubscriber(chatId, { m1plus: !currentValue });
  
  bot.sendMessage(
    chatId,
    !currentValue 
      ? "✅ You will now receive notifications for earthquakes of magnitude 1.0+."
      : "❌ You will no longer receive notifications for earthquakes of magnitude 1.0+."
  );
});

// Handle /all command
bot.onText(/\/all/, (msg) => {
  const chatId = msg.chat.id.toString();
  const subscriber = findSubscriber(chatId);
  const currentValue = subscriber?.preferences.all || false;
  
  upsertSubscriber(chatId, { all: !currentValue });
  
  bot.sendMessage(
    chatId,
    !currentValue 
      ? "✅ You will now receive notifications for all earthquakes."
      : "❌ You will no longer receive notifications for all earthquakes."
  );
});

// Handle /unsubscribe command
bot.onText(/\/unsubscribe/, (msg) => {
  const chatId = msg.chat.id.toString();
  removeSubscriber(chatId);
  bot.sendMessage(
    chatId,
    "🔕 You've unsubscribed from earthquake notifications. You can subscribe again anytime with /subscribe."
  );
});

// Handle /status command
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id.toString();
  const subscriber = findSubscriber(chatId);
  
  if (!subscriber) {
    bot.sendMessage(
      chatId,
      "❌ You are not subscribed to any earthquake notifications. Use /subscribe to start receiving updates."
    );
    return;
  }
  
  const { preferences } = subscriber;
  const statusEmoji = (value: boolean) => value ? '✅' : '❌';
  
  bot.sendMessage(
    chatId,
    "Your subscription status:\n\n" +
    `${statusEmoji(preferences.significant)} Significant earthquakes\n` +
    `${statusEmoji(preferences.m4plus)} Magnitude 4.5+ earthquakes\n` +
    `${statusEmoji(preferences.m2plus)} Magnitude 2.5+ earthquakes\n` +
    `${statusEmoji(preferences.m1plus)} Magnitude 1.0+ earthquakes\n` +
    `${statusEmoji(preferences.all)} All earthquakes\n\n` +
    "Use /customize to change your preferences."
  );
});

// Handle /latest command
bot.onText(/\/latest/, async (msg) => {
  const chatId = msg.chat.id.toString();
  const subscriber = findSubscriber(chatId);
  
  if (!subscriber) {
    bot.sendMessage(
      chatId,
      "❌ You must be subscribed to receive earthquake data. Use /subscribe first."
    );
    return;
  }
  
  bot.sendMessage(chatId, "Fetching the latest earthquake data based on your preferences...");
  
  try {
    await fetchAndNotify(chatId);
    bot.sendMessage(chatId, "✅ Latest earthquake data has been sent for your subscribed categories.");
  } catch (error) {
    bot.sendMessage(chatId, "❌ Sorry, there was an error fetching the latest earthquake data. Please try again later.");
  }
});

// Function to fetch data from earthquake feeds and send notifications
export const fetchAndNotify = async (specificChatId?: string) => {
  logger.info('Fetching earthquake data...');
  
  try {
    // Process each feed type based on user preferences
    for (const [feedType, feedUrl] of Object.entries(EARTHQUAKE_FEEDS)) {
      logger.debug(`Processing feed: ${feedType}`);
      
      // For specific chat ID requests, check if they're subscribed to this feed type
      if (specificChatId) {
        const subscriber = findSubscriber(specificChatId);
        if (!subscriber || !subscriber.preferences[feedType as keyof Subscriber['preferences']]) {
          logger.debug(`Skipping ${feedType} for ${specificChatId} - not subscribed to this category`);
          continue;
        }
      }
      
      try {
        const response = await axios.get(feedUrl);
        const xmlData = response.data as string;
        
        const result = await parseStringPromise(xmlData, { explicitArray: false });
        
        // Extract entries from different possible XML structures
        let entries;
        if (result.feed && result.feed.entry) {
          entries = result.feed.entry;
        } else if (result.entry) {
          entries = result.entry;
        } else {
          logger.debug(`No earthquake entries found for ${feedType}. Skipping.`);
          continue;
        }
        
        const earthquakeUpdates = Array.isArray(entries) ? entries : [entries];
        logger.debug(`Found ${earthquakeUpdates.length} entries for ${feedType}.`);
        
        // Only process the most recent entry for each feed type
        if (earthquakeUpdates.length === 0) continue;
        
        const entry = earthquakeUpdates[0];
        const title = entry.title || 'Unknown Earthquake';
        
        // Extract link
        let link = '';
        if (entry.link) {
          if (typeof entry.link === 'string') {
            link = entry.link;
          } else if (Array.isArray(entry.link) && entry.link.length > 0) {
            link = entry.link[0].$ ? entry.link[0].$.href : entry.link[0];
          } else if (entry.link.$ && entry.link.$.href) {
            link = entry.link.$.href;
          }
        }
        
        // Extract update time
        const updated = entry.updated || entry.pubDate || new Date().toISOString();
        
        // Extract magnitude with fallback to title parsing
        let magnitude = 'N/A';
        if (entry['georss:point']) {
          const parts = entry['georss:point'].split(' ');
          if (parts.length > 2) {
            magnitude = parts[2];
          }
        } else if (entry.magnitude) {
          magnitude = entry.magnitude;
        }
        
        if (magnitude === 'N/A' && entry.title) {
          const match = entry.title.match(/M(?:agnitude)?\s*(\d+\.\d+)/i);
          if (match && match[1]) {
            magnitude = match[1];
          }
        }
        
        // Create the message
        const message = `
🚨 **Earthquake Alert** 🚨
**Category:** ${getFeedDisplayName(feedType)}
**Title:** ${title}
**Magnitude:** ${magnitude}
**Updated:** ${new Date(updated).toLocaleString()}
**Link:** ${link}
        `;          // Send notifications
          if (specificChatId) {
            await bot.sendMessage(specificChatId, message, { parse_mode: 'Markdown' });
            logger.info(`Sent ${feedType} notification to specific chat ${specificChatId}`);
          } else {
            // Send to all subscribers who want this category
            for (const subscriber of subscribers) {
              if (subscriber.preferences[feedType as keyof Subscriber['preferences']]) {
                await bot.sendMessage(subscriber.chatId, message, { parse_mode: 'Markdown' });
                logger.info(`Sent ${feedType} notification to ${subscriber.chatId}`);
              }
            }
          }
        } catch (feedError: any) {
          logger.error(`Error processing ${feedType} feed:`, { error: feedError.message, stack: feedError.stack });
        }
      }
    } catch (error: any) {
      logger.error('Error in fetchAndNotify:', { error: error.message, stack: error.stack });
      throw error;
    }
};

// Helper function to get user-friendly feed category names
function getFeedDisplayName(feedType: string): string {
  switch (feedType) {
    case 'significant': return 'Significant Earthquake';
    case 'm4plus': return 'M4.5+ Earthquake';
    case 'm2plus': return 'M2.5+ Earthquake';
    case 'm1plus': return 'M1.0+ Earthquake';
    case 'all': return 'All Earthquakes';
    default: return 'Earthquake';
  }
}

// Schedule the check for new earthquakes based on configuration
const interval = parseInt(config.notificationInterval, 10);
cron.schedule(`*/${interval} * * * *`, () => fetchAndNotify());

logger.info(`Earthquake notification service started. Scheduled to run every ${interval} minutes.`);
logger.info('Bot is now listening for commands...');

// Initial fetch
console.log("Starting fetchAndNotify from index.ts");
fetchAndNotify();