# Build stage
FROM node:20 AS builder

# Install pnpm and esbuild
RUN corepack enable && corepack prepare pnpm@latest --activate && \
  npm install -g esbuild

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN esbuild src/index.ts --outfile=dist/index.cjs --bundle --platform=node --format=cjs --banner:js='#!/usr/bin/env node' && \
  chmod +x dist/index.cjs

# Production stage
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy index.html
COPY src/index.html ./dist

# Set environment variables
ENV NODE_ENV=production

# Start the application
CMD ["node", "dist/index.cjs" ] 