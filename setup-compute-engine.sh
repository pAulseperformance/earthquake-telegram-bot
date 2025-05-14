#!/bin/bash
# Setup script for deploying Earthquake Telegram Bot to Google Compute Engine

# Exit on any error
set -e

# Configuration
PROJECT_ID="YOUR_PROJECT_ID"  # Replace with your actual GCP project ID
ZONE="us-central1-a"
INSTANCE_NAME="earthquake-bot"
REGISTRY="gcr.io"
IMAGE_NAME="${REGISTRY}/${PROJECT_ID}/${INSTANCE_NAME}"
DISK_NAME="earthquake-data"
DISK_SIZE="10GB"

# Print banner
echo "========================================================"
echo "Earthquake Telegram Bot - Google Compute Engine Setup"
echo "========================================================"
echo

# Check if required commands are available
command -v gcloud >/dev/null 2>&1 || { echo "Error: gcloud is required but not installed. Please install Google Cloud SDK."; exit 1; }

# Ask for confirmation
read -p "Deploy Earthquake Telegram Bot to GCP Compute Engine? (y/n): " -n 1 -r
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
gcloud services enable compute.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Check if the persistent disk already exists
echo "Checking for persistent disk..."
if gcloud compute disks list --filter="name=${DISK_NAME}" | grep -q "${DISK_NAME}"; then
    echo "Disk ${DISK_NAME} already exists."
else
    echo "Creating persistent disk ${DISK_NAME}..."
    gcloud compute disks create ${DISK_NAME} --size=${DISK_SIZE} --zone=${ZONE}
fi

# Check if the VM instance already exists
echo "Checking for VM instance..."
if gcloud compute instances list --filter="name=${INSTANCE_NAME}" | grep -q "${INSTANCE_NAME}"; then
    echo "VM instance ${INSTANCE_NAME} already exists."
    
    # Ask to recreate
    read -p "Do you want to delete and recreate the VM? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Deleting existing VM instance ${INSTANCE_NAME}..."
        gcloud compute instances delete ${INSTANCE_NAME} --zone=${ZONE} --quiet
        CREATE_VM=true
    else
        CREATE_VM=false
    fi
else
    CREATE_VM=true
fi

# Create VM instance with container
if [[ "$CREATE_VM" = true ]]; then
    echo "Creating VM instance ${INSTANCE_NAME} with container..."
    gcloud compute instances create-with-container ${INSTANCE_NAME} \
        --container-image ${IMAGE_NAME}:latest \
        --machine-type e2-micro \
        --zone=${ZONE} \
        --tags=http-server,https-server \
        --disk=name=${DISK_NAME},device-name=${DISK_NAME},mode=rw,boot=no
fi

# Print instructions for manually mounting the disk
echo
echo "========================================================"
echo "VM Instance created successfully!"
echo "========================================================"
echo
echo "Next steps:"
echo "1. SSH into the VM to set up the persistent disk:"
echo "   gcloud compute ssh ${INSTANCE_NAME} --zone=${ZONE}"
echo
echo "2. Inside the VM, run these commands to set up the disk:"
echo "   # Format disk (first time only)"
echo "   sudo mkfs.ext4 -m 0 -E lazy_itable_init=0,lazy_journal_init=0,discard /dev/disk/by-id/google-${DISK_NAME}"
echo
echo "   # Create mount point"
echo "   sudo mkdir -p /mnt/disks/${DISK_NAME}"
echo
echo "   # Mount disk"
echo "   sudo mount -o discard,defaults /dev/disk/by-id/google-${DISK_NAME} /mnt/disks/${DISK_NAME}"
echo
echo "   # Set folder permissions"
echo "   sudo chmod 777 /mnt/disks/${DISK_NAME}"
echo
echo "3. Update your container config to mount the volume:"
echo "   gcloud compute instances update-container ${INSTANCE_NAME} \\"
echo "     --zone=${ZONE} \\"
echo "     --container-mount-host-path=host-path=/mnt/disks/${DISK_NAME},mount-path=/app/data"
echo
echo "4. To make the mount persistent across VM restarts, add this to /etc/fstab:"
echo "   sudo echo '/dev/disk/by-id/google-${DISK_NAME} /mnt/disks/${DISK_NAME} ext4 discard,defaults 0 2' | sudo tee -a /etc/fstab"
