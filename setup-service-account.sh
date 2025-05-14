#!/bin/bash
# Setup script for creating a service account for Cloud Run deployment

# Exit on any error
set -e

# Configuration
PROJECT_ID="YOUR_PROJECT_ID"  # Replace with your actual GCP project ID
SERVICE_ACCOUNT_NAME="earthquake-bot-sa"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Print banner
echo "========================================================"
echo "Earthquake Telegram Bot - Service Account Setup"
echo "========================================================"
echo

# Check if required commands are available
command -v gcloud >/dev/null 2>&1 || { echo "Error: gcloud is required but not installed. Please install Google Cloud SDK."; exit 1; }

# Ensure the project exists
echo "Setting default project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# Create service account
echo "Creating service account ${SERVICE_ACCOUNT_NAME}..."
gcloud iam service-accounts create ${SERVICE_ACCOUNT_NAME} \
    --display-name="Earthquake Bot Service Account"

# Grant required roles
echo "Granting required roles to service account..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/logging.logWriter"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/monitoring.metricWriter"

# Create service account key (optional)
echo "Creating service account key..."
gcloud iam service-accounts keys create ./earthquake-bot-key.json \
    --iam-account=${SERVICE_ACCOUNT_EMAIL}

echo
echo "========================================================"
echo "Service account setup completed successfully!"
echo "========================================================"
echo
echo "Service account: ${SERVICE_ACCOUNT_EMAIL}"
echo "Key file: ./earthquake-bot-key.json"
echo
echo "Use this service account when deploying to Cloud Run:"
echo "gcloud run deploy earthquake-bot \\"
echo "  --image gcr.io/${PROJECT_ID}/earthquake-bot \\"
echo "  --service-account=${SERVICE_ACCOUNT_EMAIL} \\"
echo "  --platform managed \\"
echo "  --region=us-central1"
