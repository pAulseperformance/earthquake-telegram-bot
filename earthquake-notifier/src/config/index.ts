// Load environment variables from .env file
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN',  // Bot token for Telegram API
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',  // Personal chat ID for direct notifications
    port: process.env.PORT || 8080,  // Port for health check server
    notificationInterval: process.env.NOTIFICATION_INTERVAL || '60',  // Minutes between checks
};

export default config;