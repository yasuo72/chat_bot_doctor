# Lightweight Node.js image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json ./
RUN npm install --only=production

# Copy application source
COPY src ./src

# Environment
ENV NODE_ENV=production

# Railway / generic platforms will inject PORT; default to 4000
ENV PORT=4000
EXPOSE 4000

# Start MediGuideBackend
CMD ["node", "src/server.js"]
