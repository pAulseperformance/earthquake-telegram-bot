# Earthquake Telegram Notification Bot

A Telegram bot that sends real-time earthquake notifications from USGS feeds. Users can subscribe to different earthquake categories based on magnitude.

## Features

- Real-time earthquake notifications via Telegram
- Customizable notification preferences by magnitude category
- Support for multiple subscribers/chat rooms
- Persistent storage of subscriber preferences
- Docker support for easy deployment to cloud platforms
- Health check endpoint for container monitoring

## Supported Earthquake Categories

Users can subscribe to the following earthquake notification categories:

- **Significant earthquakes**: Only the most notable events (typically M6.0+ with significant impact)
- **Magnitude 4.5+**: Moderate to large earthquakes that can be felt over wide areas
- **Magnitude 2.5+**: Minor earthquakes that are often felt but rarely cause damage
- **Magnitude 1.0+**: Very minor earthquakes, usually only detected by seismographs
- **All earthquakes**: Every earthquake detected, including very small events

Data is sourced from the [USGS Earthquake Feeds](https://earthquake.usgs.gov/earthquakes/feed/v1.0/atom.php), which are updated every 15 minutes.

## Available Commands

- `/start` - Start the bot and receive instructions
- `/subscribe` - Subscribe to earthquake notifications
- `/unsubscribe` - Unsubscribe from earthquake notifications
- `/status` - Check your current subscription status
- `/latest` - Get the latest earthquakes
- `/customize` - Customize your notification preferences

## Deployment to Google Cloud Platform

This guide will help you deploy the earthquake notification bot to Google Cloud Platform (GCP).

### Prerequisites

1. A Google Cloud Platform account
2. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed
3. [Docker](https://docs.docker.com/get-docker/) installed

### Deployment Options

There are multiple deployment options available, each with its own advantages:

1. **Cloud Run (Recommended for most users)**
   - Serverless, scales to zero when not in use (cost-effective)
   - Easy deployment and updates
   - Built-in health checks
   - Use the provided `deploy-to-gcp.sh` script

2. **Compute Engine**
   - Better for consistent, long-running workloads
   - More control over the environment
   - Simpler persistent storage setup
   - Use the provided `setup-compute-engine.sh` script

3. **Cloud Build with Continuous Deployment**
   - Automatic builds and deployments from GitHub
   - Use the provided `cloudbuild.yaml` configuration

### Quick Start with Cloud Run

1. Update the bot token and configuration
   ```bash
   cp earthquake-notifier/.env.example earthquake-notifier/.env
   # Edit the .env file with your Telegram bot token
   ```

2. Run the deployment script (after reviewing and setting your GCP project ID in the script)
   ```bash
   ./deploy-to-gcp.sh
   ```

### Manual Deployment Steps

1. Set up environment variables
   ```bash
   export PROJECT_ID="your-gcp-project-id"
   export REGION="us-central1"
   ```

2. Build the Docker image
   ```bash
   docker build -t gcr.io/${PROJECT_ID}/earthquake-bot .
   ```

3. Push to Google Container Registry
   ```bash
   gcloud auth configure-docker
   docker push gcr.io/${PROJECT_ID}/earthquake-bot
   ```

4. Deploy to Cloud Run
   ```bash
   gcloud run deploy earthquake-bot \
     --image gcr.io/${PROJECT_ID}/earthquake-bot \
     --platform managed \
     --region ${REGION} \
     --allow-unauthenticated \
     --memory 512Mi
   ```

### Setting Up a Service Account

For better security, you should create a dedicated service account:

```bash
./setup-service-account.sh
```

### Data Persistence

For persisting subscriber data when using Cloud Run:

1. Create a Cloud Storage bucket
   ```bash
   gsutil mb -l us-central1 gs://${PROJECT_ID}-earthquake-data
   ```

2. Set up periodic sync of data to/from the bucket
   ```bash
   # Add these commands to your Dockerfile or as a startup script
   gsutil cp gs://${PROJECT_ID}-earthquake-data/subscribers.json /app/data/subscribers.json || true
   # Add a cron job to sync data back to the bucket periodically
   ```

## Local Development

1. Clone the repository
   ```bash
   git clone https://github.com/pAulseperformance/earthquake-telegram-bot.git
   cd earthquake-telegram-bot
   ```

2. Install dependencies
   ```bash
   cd earthquake-notifier
   npm install
   ```

3. Set up environment variables
   ```bash
   cp .env.example .env
   # Edit .env file with your Telegram bot token and chat ID:
   # TELEGRAM_BOT_TOKEN=your_bot_token_here
   # TELEGRAM_CHAT_ID=your_chat_id_here
   # NOTIFICATION_INTERVAL=15  # Minutes between checks
   ```

4. Build TypeScript files
   ```bash
   npm run build
   ```

5. Start the bot
   ```bash
   npm start
   ```

6. Development mode with auto-reloading (alternative to steps 4-5)
   ```bash
   npm run dev
   ```

7. Access the health endpoint
   ```
   http://localhost:8080/health
   ```

### Interacting with the Bot

Once your bot is running, you can interact with it through Telegram:

1. Open Telegram and search for your bot by username
2. Start a conversation with `/start`
3. Subscribe to earthquake notifications with `/subscribe`
4. Check your current subscription with `/status`
5. Get the latest earthquakes with `/latest`
6. Customize notification preferences with `/customize`

## Docker Compose for Local Testing

To test the Docker setup locally before deploying to GCP:

1. Make sure Docker is installed and running on your machine

2. Configure your environment variables
   ```bash
   cp earthquake-notifier/.env.example earthquake-notifier/.env
   # Edit the .env file with your Telegram bot token and chat ID
   ```

3. Build and start the container
   ```bash
   docker-compose up --build
   ```

4. To run in detached mode (background)
   ```bash
   docker-compose up --build -d
   ```

5. Check logs when running in detached mode
   ```bash
   docker-compose logs -f
   ```

6. Stop the container
   ```bash
   docker-compose down
   ```

7. Access the health endpoint
   ```
   http://localhost:8080/health
   ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Troubleshooting

### Common Issues

1. **Bot doesn't respond to commands**
   - Verify your Telegram bot token in the `.env` file
   - Make sure your bot is running (`npm start` shows no errors)
   - Check if you've started a conversation with the bot on Telegram

2. **Environment variables not loading**
   - Ensure the `.env` file is in the correct location
   - Check for syntax errors in your `.env` file
   - Try running with explicit environment variables: `TELEGRAM_BOT_TOKEN=yourtoken npm start`

3. **Error when building TypeScript files**
   - Run `npm install` to make sure all dependencies are installed
   - Check if TypeScript is installed (`npm list typescript`)
   - Look for errors in your `tsconfig.json` file

4. **Docker issues**
   - Make sure Docker is running on your system
   - Try building the image with `docker build -t earthquake-bot .`
   - Check Docker logs for any errors

### Viewing Logs

Local logs are stored in the `earthquake-notifier/logs/` directory. The most recent log file will be named with the current date (e.g., `2025-05-14.log`).

## License

This project is licensed under the MIT License.