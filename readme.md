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

- Significant earthquakes
- Magnitude 4.5+
- Magnitude 2.5+
- Magnitude 1.0+
- All earthquakes (including smaller ones)

Data source: [USGS Earthquake Feeds](https://earthquake.usgs.gov/earthquakes/feed/v1.0/atom.php)

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
   git clone https://github.com/yourusername/earthquake-telegram.git
   cd earthquake-telegram
   ```

2. Install dependencies
   ```bash
   cd earthquake-notifier
   npm install
   ```

3. Set up environment variables
   ```bash
   cp .env.example .env
   # Edit .env with your Telegram bot token and chat ID
   ```

4. Build TypeScript files
   ```bash
   npm run build
   ```

5. Start the bot
   ```bash
   npm start
   ```

## Docker Compose for Local Testing

Test the Docker setup locally before deploying:

```bash
docker-compose up --build
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.