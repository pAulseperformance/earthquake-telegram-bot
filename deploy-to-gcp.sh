#!/bin/bash
# Deployment script for Earthquake Telegram Bot to Google Cloud Platform

# Exit on any error
set -e

# Configuration
PROJECT_ID="YOUR_PROJECT_ID"  # Replace with your actual GCP project ID
REGION="us-central1"
SERVICE_NAME="earthquake-bot"
REGISTRY="gcr.io"
IMAGE_NAME="${REGISTRY}/${PROJECT_ID}/${SERVICE_NAME}"
BUCKET_NAME="${PROJECT_ID}-earthquake-data"

# Print banner
echo "========================================"
echo "Earthquake Telegram Bot Deployment Tool"
echo "========================================"
echo

# Check if required commands are available
command -v gcloud >/dev/null 2>&1 || { echo "Error: gcloud is required but not installed. Please install Google Cloud SDK."; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Error: docker is required but not installed."; exit 1; }
command -v gsutil >/dev/null 2>&1 || { echo "Error: gsutil is required but not installed. Please install Google Cloud SDK."; exit 1; }

# Ask for confirmation
read -p "Deploy Earthquake Telegram Bot to GCP project ${PROJECT_ID}? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Deployment cancelled."
    exit 0
fi

# Ensure the project exists
echo "Setting default project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo "Enabling required Google Cloud APIs..."
gcloud services enable containerregistry.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable storage-api.googleapis.com

# Build the Docker image
echo "Building Docker image..."
docker build -t ${IMAGE_NAME}:latest .

# Configure Docker to authenticate with Google Cloud
echo "Configuring Docker authentication for Google Cloud..."
gcloud auth configure-docker

# Push the image to Google Container Registry
echo "Pushing image to Google Container Registry..."
docker push ${IMAGE_NAME}:latest

# Create Cloud Storage bucket for data persistence (if it doesn't exist)
echo "Setting up Cloud Storage for persistent data..."
if gsutil ls -b gs://${BUCKET_NAME} > /dev/null 2>&1; then
    echo "Bucket gs://${BUCKET_NAME} already exists."
else
    echo "Creating bucket gs://${BUCKET_NAME}..."
    gsutil mb -l ${REGION} gs://${BUCKET_NAME}
fi

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:latest \
  --platform managed \
  --allow-unauthenticated \
  --region ${REGION} \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 1 \
  --concurrency 80

# Create a health check scheduler
CLOUD_RUN_URL=$(gcloud run services describe ${SERVICE_NAME} --platform managed --region ${REGION} --format 'value(status.url)')
echo "Setting up health check scheduler..."
gcloud scheduler jobs create http ${SERVICE_NAME}-health-check \
  --schedule="*/15 * * * *" \
  --uri="${CLOUD_RUN_URL}/health" \
  --http-method=GET \
  --attempt-deadline=30s

echo
echo "========================================"
echo "Deployment completed successfully!"
echo "Service URL: ${CLOUD_RUN_URL}"
echo "Health check endpoint: ${CLOUD_RUN_URL}/health"
echo "========================================"
echo
echo "Note: For true persistence with Cloud Run, you need to set up additional"
echo "infrastructure. Consider using Compute Engine for simpler persistent storage."
