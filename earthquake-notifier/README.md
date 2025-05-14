# Earthquake Notifier

This project is an Earthquake Notification System that sends updates to a Telegram channel using the USGS Earthquake Atom feed.

## Features

- Fetches the latest earthquake data from the USGS Atom feed.
- Parses the earthquake data to extract relevant information.
- Sends notifications to a specified Telegram channel.

## Project Structure

```
earthquake-notifier
├── src
│   ├── config
│   │   └── index.ts        # Configuration for Telegram bot
│   ├── fetcher
│   │   └── index.ts        # Fetches earthquake data
│   ├── notifier
│   │   └── index.ts        # Sends notifications to Telegram
│   ├── parser
│   │   └── index.ts        # Parses earthquake data
│   └── index.ts            # Entry point of the application
├── package.json             # npm configuration
├── tsconfig.json            # TypeScript configuration
└── README.md                # Project documentation
```

## Setup Instructions

1. Clone the repository:
   ```
   git clone <repository-url>
   cd earthquake-notifier
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure your Telegram bot:
   - Create a new bot using [BotFather](https://core.telegram.org/bots#botfather).
   - Obtain the bot token and chat ID for your channel.
   - Update the configuration in `src/config/index.ts`.

4. Run the application:
   ```
   npm start
   ```

## Usage

The application will periodically fetch the latest earthquake data and send notifications to the specified Telegram channel. You can customize the frequency of updates in the `src/index.ts` file.

## License

This project is licensed under the MIT License.