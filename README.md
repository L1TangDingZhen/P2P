# P2P File Transfer

A peer-to-peer file transfer application that allows easy transfer of files and text between devices under the same account.

## Project Structure

- **P2P/**: ASP.NET Core backend
  - **Controllers/**: API controllers
  - **Models/**: Data models
  - **Services/**: Business logic
  - **Hubs/**: SignalR real-time communication

- **p2p-client/**: React frontend
  - **src/components/**: UI components
  - **src/pages/**: Pages
  - **src/services/**: Service layer

## Features

- Invitation code login system
- Maximum of 2 devices online simultaneously per account
- Real-time text message transfer between devices under the same account
- File transfer between devices under the same account
- Device online status monitoring

## Local Development

### Backend (ASP.NET Core)

```bash
cd P2P
dotnet run
```

Backend will run on http://localhost:5235

### Frontend (React)

```bash
cd p2p-client
npm install
npm start
```

Frontend will run on http://localhost:3000

## Amazon Linux Deployment Instructions

### Prerequisites

1. Ensure the server has Docker and Docker Compose installed
```bash
sudo yum update -y
sudo yum install -y docker
sudo service docker start
sudo usermod -a -G docker ec2-user
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### Deployment Steps

1. Clone the repository
```bash
git clone <repository-url>
cd P2P
```

2. Frontend build
```bash
# Enter frontend directory
cd p2p-client

# Modify environment variables
echo "REACT_APP_API_URL=http://your-domain" > .env.production

# Build frontend
docker build -t p2p-frontend-builder .
docker run --rm -v $(pwd):/app -w /app p2p-frontend-builder npm run build

# Return to project root
cd ..
```

3. Start services
```bash
docker-compose up -d
```

4. Check service status
```bash
docker-compose ps
```

## Configuration

### docker-compose.yml
- Backend deployed using image build method
- Frontend deployed using static file mount method
- Nginx used for reverse proxy

### Custom Domain
1. Modify server_name in nginx/nginx.conf
2. Update domain in frontend and backend environment variables
3. Modify the ALLOWED_ORIGINS environment variable in docker-compose.yml

### Troubleshooting
- Check logs: `docker-compose logs -f`
- Inspect network: `docker network inspect p2p-network`
- Check containers: `docker-compose ps`

## Technology Stack

- **Backend**: ASP.NET Core, SignalR
- **Frontend**: React, Bootstrap, SignalR client
- **Deployment**: Docker, Docker Compose, Nginx

## Troubleshooting

If you encounter connection issues:

1. Ensure the backend service is running
2. Check browser console for error messages
3. Check `/api/connectionstatus/health` to confirm service status
4. If you encounter "maximum devices" error, visit `/api/device/clear/{invitation-code}` to clear devices
5. For CORS errors, ensure that allowed origins are configured in the backend

For detailed troubleshooting guide, refer to the `debug.md` file.