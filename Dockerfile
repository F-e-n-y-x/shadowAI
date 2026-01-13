# Base Image
FROM node:20-alpine

# Working Directory
WORKDIR /app

# Dependencies
COPY package*.json ./
RUN npm install

# Source Code
COPY . .

# Expose HTTP and HTTPS ports
EXPOSE 3000
EXPOSE 3001

# Start
CMD ["node", "server.js"]
