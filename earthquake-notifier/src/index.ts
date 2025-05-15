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

// Create persistent bottom menu keyboard
function createMainKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: '🔔 Subscribe' }, { text: '⚙️ Customize' }],
      [{ text: '📊 Status' }, { text: '🔄 Latest' }],
      [{ text: '🔕 Unsubscribe' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

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

// Handle start command with custom keyboard
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id.toString();
  bot.sendMessage(
    chatId,
    "Welcome to EarthBoundBot! 🌍\n\n" +
    "I'm your real-time earthquake monitoring companion, providing reliable notifications directly from the USGS (United States Geological Survey).\n\n" +
    "🔔 *Available Options:*\n" +
    "• Subscribe - Get notifications for all earthquakes\n" +
    "• Customize - Choose which magnitude levels to monitor:\n" +
    "  - Significant events (typically M6.0+)\n" +
    "  - M4.5+ (moderate to large)\n" +
    "  - M2.5+ (minor earthquakes)\n" +
    "  - M1.0+ (very minor)\n" +
    "  - All detected events\n" +
    "• Status - View your current notification settings\n" +
    "• Latest - Get the most recent earthquake data\n" +
    "• Unsubscribe - Stop all notifications\n\n" +
    "🔄 Updates occur every 15 minutes with fresh data from USGS.\n\n" +
    "Use the menu buttons below to get started! 👇",
    {
      parse_mode: 'Markdown',
      reply_markup: createMainKeyboard()
    }
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
  const subscriber = findSubscriber(chatId);
  const currentPreferences = subscriber?.preferences || {
    significant: false,
    m4plus: false,
    m2plus: false,
    m1plus: false,
    all: false
  };

  const statusEmoji = (value: boolean) => value ? '✅' : '⭕️';
  
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: `${statusEmoji(currentPreferences.significant)} Significant (M6.0+)`,
          callback_data: 'toggle_significant'
        }
      ],
      [
        {
          text: `${statusEmoji(currentPreferences.m4plus)} Strong (M4.5+)`,
          callback_data: 'toggle_m4plus'
        }
      ],
      [
        {
          text: `${statusEmoji(currentPreferences.m2plus)} Moderate (M2.5+)`,
          callback_data: 'toggle_m2plus'
        }
      ],
      [
        {
          text: `${statusEmoji(currentPreferences.m1plus)} Minor (M1.0+)`,
          callback_data: 'toggle_m1plus'
        }
      ],
      [
        {
          text: `${statusEmoji(currentPreferences.all)} All Events`,
          callback_data: 'toggle_all'
        }
      ]
    ]
  };

  bot.sendMessage(
    chatId,
    "*🎛 Customize Your Earthquake Notifications*\n\n" +
    "Tap each button to toggle notifications for that magnitude level. " +
    "Your current settings are shown below:\n\n" +
    "✅ = Enabled  |  ⭕️ = Disabled",
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
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

// Handle inline keyboard callbacks
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message?.chat.id.toString();
  const messageId = callbackQuery.message?.message_id;
  
  if (!chatId || !messageId) {
    return;
  }

  const action = callbackQuery.data;
  if (!action?.startsWith('toggle_')) {
    return;
  }

  const preference = action.replace('toggle_', '') as keyof Subscriber['preferences'];
  const subscriber = findSubscriber(chatId);
  const currentValue = subscriber?.preferences[preference] || false;
  
  // Update the preference
  upsertSubscriber(chatId, { [preference]: !currentValue });
  
  // Get updated preferences
  const updatedSubscriber = findSubscriber(chatId);
  const updatedPreferences = updatedSubscriber?.preferences || {
    significant: false,
    m4plus: false,
    m2plus: false,
    m1plus: false,
    all: false
  };

  // Update the keyboard with new status
  const statusEmoji = (value: boolean) => value ? '✅' : '⭕️';
  
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: `${statusEmoji(updatedPreferences.significant)} Significant (M6.0+)`,
          callback_data: 'toggle_significant'
        }
      ],
      [
        {
          text: `${statusEmoji(updatedPreferences.m4plus)} Strong (M4.5+)`,
          callback_data: 'toggle_m4plus'
        }
      ],
      [
        {
          text: `${statusEmoji(updatedPreferences.m2plus)} Moderate (M2.5+)`,
          callback_data: 'toggle_m2plus'
        }
      ],
      [
        {
          text: `${statusEmoji(updatedPreferences.m1plus)} Minor (M1.0+)`,
          callback_data: 'toggle_m1plus'
        }
      ],
      [
        {
          text: `${statusEmoji(updatedPreferences.all)} All Events`,
          callback_data: 'toggle_all'
        }
      ]
    ]
  };

  // Update the message with the new keyboard
  await bot.editMessageText(
    "*🎛 Customize Your Earthquake Notifications*\n\n" +
    "Tap each button to toggle notifications for that magnitude level. " +
    "Your current settings are shown below:\n\n" +
    "✅ = Enabled  |  ⭕️ = Disabled",
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  );

  // Answer the callback query to remove the loading state
  await bot.answerCallbackQuery(callbackQuery.id, {
    text: `${getFeedDisplayName(preference)} notifications ${!currentValue ? 'enabled' : 'disabled'}`
  });
});

// Handle menu button messages
bot.on('message', (msg) => {
  if (!msg.text) return;
  
  const chatId = msg.chat.id.toString();
  
  switch (msg.text) {
    case '🔔 Subscribe':
      upsertSubscriber(chatId, { significant: true, m4plus: true, m2plus: true, m1plus: true, all: true });
      bot.sendMessage(
        chatId,
        "✅ You've successfully subscribed to all earthquake notifications! You'll receive alerts for new earthquakes.",
        { reply_markup: createMainKeyboard() }
      );
      break;
      
    case '⚙️ Customize':
      const subscriber = findSubscriber(chatId);
      const currentPreferences = subscriber?.preferences || {
        significant: false,
        m4plus: false,
        m2plus: false,
        m1plus: false,
        all: false
      };

      const statusEmoji = (value: boolean) => value ? '✅' : '⭕️';
      
      const keyboard = {
        inline_keyboard: [
          [{ text: `${statusEmoji(currentPreferences.significant)} Significant (M6.0+)`, callback_data: 'toggle_significant' }],
          [{ text: `${statusEmoji(currentPreferences.m4plus)} Strong (M4.5+)`, callback_data: 'toggle_m4plus' }],
          [{ text: `${statusEmoji(currentPreferences.m2plus)} Moderate (M2.5+)`, callback_data: 'toggle_m2plus' }],
          [{ text: `${statusEmoji(currentPreferences.m1plus)} Minor (M1.0+)`, callback_data: 'toggle_m1plus' }],
          [{ text: `${statusEmoji(currentPreferences.all)} All Events`, callback_data: 'toggle_all' }]
        ]
      };

      bot.sendMessage(
        chatId,
        "*🎛 Customize Your Earthquake Notifications*\n\n" +
        "Tap each button to toggle notifications for that magnitude level. " +
        "Your current settings are shown below:\n\n" +
        "✅ = Enabled  |  ⭕️ = Disabled",
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
      break;
      
    case '📊 Status':
      const statusSubscriber = findSubscriber(chatId);
      
      if (!statusSubscriber) {
        bot.sendMessage(
          chatId,
          "❌ You are not subscribed to any earthquake notifications. Use Subscribe to start receiving updates.",
          { reply_markup: createMainKeyboard() }
        );
        return;
      }
      
      const { preferences } = statusSubscriber;
      const statusEmojiFunc = (value: boolean) => value ? '✅' : '❌';
      
      bot.sendMessage(
        chatId,
        "Your subscription status:\n\n" +
        `${statusEmojiFunc(preferences.significant)} Significant earthquakes\n` +
        `${statusEmojiFunc(preferences.m4plus)} Magnitude 4.5+ earthquakes\n` +
        `${statusEmojiFunc(preferences.m2plus)} Magnitude 2.5+ earthquakes\n` +
        `${statusEmojiFunc(preferences.m1plus)} Magnitude 1.0+ earthquakes\n` +
        `${statusEmojiFunc(preferences.all)} All earthquakes\n\n` +
        "Use Customize to change your preferences.",
        { reply_markup: createMainKeyboard() }
      );
      break;
      
    case '🔄 Latest':
      const latestSubscriber = findSubscriber(chatId);
      
      if (!latestSubscriber) {
        bot.sendMessage(
          chatId,
          "❌ You must be subscribed to receive earthquake data. Use Subscribe first.",
          { reply_markup: createMainKeyboard() }
        );
        return;
      }
      
      bot.sendMessage(chatId, "Fetching the latest earthquake data based on your preferences...", 
        { reply_markup: createMainKeyboard() });
      
      fetchAndNotify(chatId)
        .then(() => {
          bot.sendMessage(chatId, "✅ Latest earthquake data has been sent for your subscribed categories.",
            { reply_markup: createMainKeyboard() });
        })
        .catch(() => {
          bot.sendMessage(chatId, "❌ Sorry, there was an error fetching the latest earthquake data. Please try again later.",
            { reply_markup: createMainKeyboard() });
        });
      break;
      
    case '🔕 Unsubscribe':
      removeSubscriber(chatId);
      bot.sendMessage(
        chatId,
        "🔕 You've unsubscribed from earthquake notifications. You can subscribe again anytime using the Subscribe button.",
        { reply_markup: createMainKeyboard() }
      );
      break;
  }
});

// Function to fetch data from earthquake feeds and send notifications
export const fetchAndNotify = async (specificChatId?: string) => {
  logger.info('Fetching earthquake data...');
  
  // Track sent earthquakes to prevent duplicates per chat ID and event
  // Using a Map<chatId, Set<earthquakeId>> structure
  const sentEarthquakes = new Map<string, Set<string>>();

  // Initialize tracking for specific chat ID if provided
  if (specificChatId) {
    sentEarthquakes.set(specificChatId, new Set());
  } else {
    // Initialize tracking for all subscribers
    for (const subscriber of subscribers) {
      sentEarthquakes.set(subscriber.chatId, new Set());
    }
  }
  
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
        
        // Create a unique identifier for this earthquake
        const earthquakeId = `${title}_${updated}`;

        // Create the message
        const message = `
🚨 **Earthquake Alert** 🚨
**Category:** ${getFeedDisplayName(feedType)}
**Title:** ${title}
**Magnitude:** ${magnitude}
**Updated:** ${new Date(updated).toLocaleString()}
**Link:** ${link}
        `;

        // Send notifications
        if (specificChatId) {
          // Initialize set for this chat if it doesn't exist
          if (!sentEarthquakes.has(specificChatId)) {
            sentEarthquakes.set(specificChatId, new Set());
          }
          
          // Check if this earthquake was already sent to this chat
          if (!sentEarthquakes.get(specificChatId)!.has(earthquakeId)) {
            await bot.sendMessage(specificChatId, message, { parse_mode: 'Markdown' });
            logger.info(`Sent ${feedType} notification to specific chat ${specificChatId}`);
            // Mark this earthquake as sent for this chat
            sentEarthquakes.get(specificChatId)!.add(earthquakeId);
          } else {
            logger.debug(`Skipping duplicate earthquake ${earthquakeId} for chat ${specificChatId}`);
          }
        } else {
          // Send to all subscribers who want this category
          for (const subscriber of subscribers) {
            if (subscriber.preferences[feedType as keyof Subscriber['preferences']]) {
              // Initialize set for this chat if it doesn't exist
              if (!sentEarthquakes.has(subscriber.chatId)) {
                sentEarthquakes.set(subscriber.chatId, new Set());
              }
              
              // Check if this earthquake was already sent to this chat
              if (!sentEarthquakes.get(subscriber.chatId)!.has(earthquakeId)) {
                await bot.sendMessage(subscriber.chatId, message, { parse_mode: 'Markdown' });
                logger.info(`Sent ${feedType} notification to ${subscriber.chatId}`);
                // Mark this earthquake as sent for this chat
                sentEarthquakes.get(subscriber.chatId)!.add(earthquakeId);
              } else {
                logger.debug(`Skipping duplicate earthquake ${earthquakeId} for chat ${subscriber.chatId}`);
              }
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