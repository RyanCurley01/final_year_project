# Music Recommendation Store — Final Year Project

A full-stack music store and discovery platform built with a microservices architecture. Users can browse, stream, and purchase music while exploring audio-reactive visuals, ML-powered recommendations, a spectrogram synthesizer, and MIDI-driven feature-space navigation.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Frontend](#frontend)
- [Backend Microservices](#backend-microservices)
- [Audio / ML Service](#audio--ml-service)
- [Database Schema](#database-schema)
- [Infrastructure & Deployment](#infrastructure--deployment)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend  (React 19 / Vite 7 / Tailwind CSS)  — port 5173     │
│  Firebase Auth · PayPal SDK · TensorFlow.js · Web MIDI API      │
└────────────────────────────┬─────────────────────────────────────┘
                             │  REST / JSON
        ┌────────────────────┼─────────────────────┐
        ▼                    ▼                      ▼
┌───────────────┐  ┌─────────────────┐  ┌─────────────────────────┐
│ Java / Spring │  │ Audio Service   │  │  AWS S3                 │
│ Boot Services │  │ (FastAPI/Python)│  │  Album art, audio files,│
│ ports 8080-89 │  │ port 5000       │  │  generated images       │
└───────┬───────┘  └────────┬────────┘  └─────────────────────────┘
        │                   │
        └─────────┬─────────┘
                  ▼
        ┌─────────────────┐
        │   MySQL 8.0     │
        │    Database     │
        └─────────────────┘
```

The system is composed of three tiers:

1. **Frontend** — React SPA served by Vite with Firebase authentication, PayPal checkout, and real-time audio analysis.
2. **Backend** — 10 Spring Boot microservices handling accounts, products, orders, payments, stock, wishlists, and reporting, plus a Python FastAPI service for audio ML, recommendations, iTunes integration, and image generation.
3. **Data** — MySQL 8.0 relational database and AWS S3 object storage.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS 4, Bootstrap 5, Redux Toolkit, React Router 7, Framer Motion |
| Auth | Firebase Authentication (email/password + Google OAuth) |
| Payments | PayPal REST SDK (frontend buttons + backend capture) |
| Client ML | TensorFlow.js (sky segmentation), Web Audio API (onset detection) |
| Backend Services | Java 17, Spring Boot, Spring Data JPA, Hibernate, Gradle |
| Audio / ML Service | Python 3, FastAPI, scikit-learn, librosa, ONNX Runtime, NumPy |
| Database | MySQL 8.0 |
| Object Storage | AWS S3 (presigned URLs, Signature V4) |
| Containerization | Docker, Docker Compose |
| Deployment | Railway (services + managed MySQL), Vercel (frontend), Render (alternative) |

---

## Frontend

**Location:** `frontend/`  
**Dev server:** `http://localhost:5173`

### Pages & Features

| Page | Description |
|------|-------------|
| **Home / Discover** | Browse the song catalog with album art, play previews, and add to cart or wishlist |
| **For You** | Personalized artist-curated content (Aphex Twin, Boards of Canada, Squarepusher) |
| **Top Charts** | Live iTunes top charts with audio feature data |
| **Similar Songs** | Find songs similar to a given track using audio feature cosine similarity |
| **Song Details** | Full song view with streaming playback, audio-reactive onset-synced visuals, and purchase options |
| **Album / Artist Details** | Album and artist detail pages |
| **Search** | Global catalog search |
| **Cart** | Shopping cart with integrated PayPal checkout |
| **Wishlist** | Saved songs for later |
| **Purchase History** | Past order history |
| **ML Visualization** | Interactive PCA scatter plot of the audio feature space, colored by genre cluster |
| **Spectrogram Creator** | Aphex Twin–inspired draw-to-sound synthesizer — paint frequencies on a canvas and hear them, load images into spectrograms, export as WAV |
| **MIDI Explorer** | Connect hardware MIDI controllers and map physical knobs to audio features (tempo, energy, danceability, etc.) for real-time recommendation navigation |
| **Login / Register** | Firebase email/password and Google OAuth sign-in |

### Key Components

- **MusicPlayer** — Full in-browser player with play/pause, seek, volume, next/prev, playback rate, and "Quantum Mode"
- **DiscoverVisualizer** — Real-time recommendation node graph driven by audio features
- **AudioReactiveVideo** — TensorFlow.js sky segmentation with color shifts on drum onsets
- **OnsetImageCard** — AI-generated mood-matched images that swap in sync with audio onsets
- **MidiKnob / MidiMappingPanel** — Web MIDI API controls for hardware knob integration
- **Admin Sidebars** — Customer summary, stock, sold/purchased products panels (role-based)

### State Management

- **Redux Toolkit** with slices for player, cart, wishlist, and purchase history
- **Redux Persist** for local storage persistence
- **RTK Query** services for all 10 backend microservices
- **React Context** for Firebase auth, shared audio features, video modal, and live spectrogram state

---

## Backend Microservices

**Location:** `backend/`  
**Build:** Gradle multi-project  
**Runtime:** Spring Boot with JPA/Hibernate on MySQL

Each service is an independent Spring Boot application with its own Dockerfile.

| Service | Port | API Base | Purpose |
|---------|------|----------|---------|
| **accounts-service** | 8080 | `/api/accounts` | User accounts, Firebase token verification, login, registration |
| **products-service** | 8081 | `/api/products` | Product catalog (albums/songs), CRUD, S3 presigned URL generation for cover art and audio |
| **orders-service** | 8082 | `/api/orders` | Order creation and retrieval, filter by customer |
| **payments-service** | 8083 | `/api/payments` | Payment records, PayPal create-order and capture-order integration |
| **stock-service** | 8084 | `/api/stock` | Binary product availability tracking with lifecycle timestamps |
| **wishlist-service** | 8085 | `/api/wishlist` | User wishlists (account + product) |
| **orderItems-service** | 8086 | `/api/order-items` | Line items within orders (quantity, unit price) |
| **customerSummary-service** | 8087 | `/api/customer-summary` | Aggregated customer purchase summaries |
| **soldProducts-service** | 8088 | `/api/sold-products` | Sold product tracking per order item |
| **purchasedProducts-service** | 8089 | `/api/purchased-products` | Purchased product tracking per order item |

### PayPal Integration

The **payments-service** integrates the PayPal REST API:

1. Frontend renders PayPal buttons via `@paypal/react-paypal-js`.
2. `POST /api/payments/paypal/create-order` creates a PayPal order with the cart total.
3. The user approves payment in the PayPal popup.
4. The backend captures the payment and records it in Orders, Order_Items, Payments, CustomerSummary, and SoldProducts tables.

---

## Audio / ML Service

**Location:** `audio_service/`  
**Framework:** FastAPI (Python)  
**Port:** 5000

A dedicated Python service for audio feature extraction, ML-powered recommendations, iTunes integration, image generation, and data visualization.

### Startup Pipeline

1. Warm the ML cache — load audio features from MySQL, train/load the feature scaler.
2. Precompute per-song AI image pools.
3. Start the background iTunes top-charts auto-refresh scheduler.

### Endpoints

#### Recommendations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/audio/unified-recommendations` | Cosine-similarity recommendations over 30+ audio features |
| `POST` | `/api/audio/midi-recommendations` | Recommendations from MIDI knob target feature values |
| `POST` | `/api/audio/melody-finder` | Find songs matching a melodic pattern |
| `POST` | `/api/audio/match-library` | Match external tracks against the local library |
| `GET`  | `/api/audio/cached-features` | Return the cached feature matrix |
| `POST` | `/api/audio/warm-cache` | Force ML cache rebuild |

#### iTunes Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/itunes/search` | Proxy to the iTunes Search API |
| `POST` | `/api/itunes/import-top-songs` | Import top chart songs with audio feature extraction |
| `POST` | `/api/itunes/import-to-database` | Import iTunes tracks into Products + AudioFeatures |
| `POST` | `/api/itunes/refresh-topcharts` | Manual top-charts refresh trigger |

#### Image Generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/images/pool` | Mood-matched image pool for a song (LoremFlickr → S3) |
| `GET`  | `/api/images/search` | Cached prompt-based image search |
| `GET`  | `/api/images/file/{product_id}/{url_hash}` | Serve a hosted image |
| `GET`  | `/api/images/pool-video` | Generate an onset-synced MP4 slideshow from the image pool |

#### Feature Processing

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/audio/extract-all-features` | Batch-extract audio features via librosa from S3 audio |
| `POST` | `/api/audio/backfill-mood` | Backfill mood classification (Russell's Circumplex Model) |
| `POST` | `/api/audio/backfill-genre` | Backfill genre clustering |

#### Visualization

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/visualize` | Interactive Plotly.js PCA scatter plot page |
| `GET`  | `/api/visualization/data` | Raw PCA projection JSON with genre groupings and model metrics |

#### Interactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/songs/top-played` | Top songs by play count |
| `POST` | `/api/interactions/record` | Record a user interaction (play, skip, purchase, etc.) |
| `GET`  | `/api/interactions` | Query interaction history |

### ML Pipeline

- **Feature vector (30+ dimensions):** Tempo, Energy, Danceability, Valence, Acousticness, Instrumentalness, Loudness, Speechiness, Key, Time Signature, Duration, Spectral Centroid, Spectral Rolloff, Zero Crossing Rate, Spectral Bandwidth, Spectral Contrast, RMS Energy, Onset Rate, Harmonic Ratio, Percussive Ratio, 13 MFCCs, 12 Chroma bins
- **Models:** KNN, SVM, Random Forest, Logistic Regression, Voting Classifier, KMeans clustering
- **Mood derivation:** Russell's Circumplex Model mapping Energy × Valence → Energetic / Happy / Calm / Sad
- **Visualization:** PCA projection to 2D for interactive genre-colored scatter plots

### Image Generation Pipeline

1. Audio features (mood, energy, valence, genre) are mapped to safe keyword groups.
2. LoremFlickr Creative Commons URLs are generated per keyword.
3. Downloaded images pass moderation (face detection via Haar cascade, red-border detection).
4. Approved images are uploaded to S3 and stored as hosted pool records.
5. The frontend preloads a window of upcoming images and swaps them on audio onsets.
6. An optional video export renders the pool as an onset-synced MP4 slideshow with audio mux.

---

## Database Schema

**Engine:** MySQL 8.0  
**Database:** `Game_Store_System` (local) / `railway` (production)

| Table | Purpose |
|-------|---------|
| `Accounts` | User accounts (AccountID, FirebaseUID, email, password, AccountType) |
| `Products` | Music albums/songs (title, price, cover URL, audio file URL, preview URL, stock quantity) |
| `Orders` | Customer orders (date, total amount, linked to account) |
| `Order_Items` | Line items within an order (product, quantity, unit price) |
| `Payments` | Payment records (amount, status, PayPalOrderID) |
| `Stock` | Binary availability tracking with IsAvailable flag and lifecycle timestamps |
| `Wishlist` | User wishlists (account + product FK) |
| `CustomerSummary` | Aggregated account + product + order summary |
| `Sold_Products` | Tracks sold products per order item |
| `Purchased_Products` | Tracks purchased products per order item |
| `AudioFeatures` | 30+ extracted audio features per product for ML (tempo, energy, MFCCs, chroma, etc.) |
| `ImageGeneration` | Per-song image pool records (provider, keyword, S3 storage key, dimensions) |
| `ImageCache` | Cached AI-generated images by mood |
| `UserInteractions` | User interaction events (play, skip, purchase) for analytics and recommendations |

---

## Infrastructure & Deployment

### Docker Compose (Local Development)

`deployment/docker-compose.services.yml` defines:

- **MySQL 8.0** container with health checks, persistent volume, and init script
- **10 Java microservice** containers (512 MB memory limit each)
- **Audio service** container (1 GB memory limit)
- Shared Docker network (`services-network`)

### Dev Container

`.devcontainer/` provides a VS Code Dev Container with Docker Compose, pre-configured extensions (Java, Python, Gradle, Docker, Tailwind CSS), and port forwarding for all services.

### Production Deployment

| Platform | What it hosts |
|----------|--------------|
| **Railway** | All backend services, audio service, and managed MySQL |
| **Vercel** | Frontend static build (`frontend/dist`) |
| **Render** | Alternative one-click blueprint for all services (`render.yaml`) |
| **AWS S3** | Album art, audio files, and generated images (`game-and-music-files` bucket, `eu-west-1`) |

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Java 17+
- Python 3.10+
- A MySQL 8.0 instance (or use the Docker Compose setup)
- AWS S3 bucket and credentials
- Firebase project (for authentication)
- PayPal developer account (for payments)

### 1. Clone the Repository

```bash
git clone <repo-url>
cd final_year_project
```

### 2. Configure Environment Variables

Copy the example files and fill in your credentials:

```bash
cp .env.docker.example .env.docker
cp deployment/.env.example deployment/.env
cp audio_service/.env.example audio_service/.env
```

See [Environment Variables](#environment-variables) for the full list.

### 3. Start All Services with Docker Compose

```bash
cd deployment
docker compose -f docker-compose.services.yml up --build
```

This starts MySQL, all 10 Java microservices, and the audio service.

### 4. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### 5. Initialize Data

```bash
# Import top chart songs into the database
curl -X POST http://localhost:5000/api/itunes/import-top-songs

# Extract audio features for all products
curl -X POST http://localhost:5000/api/audio/extract-all-features

# Backfill mood and genre classifications
curl -X POST http://localhost:5000/api/audio/backfill-mood
curl -X POST http://localhost:5000/api/audio/backfill-genre
```

---

## Environment Variables

All services read credentials from environment variables. **Never commit `.env` files to version control.**

### Database

| Variable | Description |
|----------|-------------|
| `MYSQL_HOST` | MySQL hostname (`localhost`, `host.docker.internal`, or Railway host) |
| `MYSQL_PORT` | MySQL port (default `3306`) |
| `MYSQL_USER` | Database username |
| `MYSQL_PASSWORD` | Database password |
| `MYSQL_ROOT_PASSWORD` | MySQL root password |
| `MYSQL_DATABASE` | Database name (`Game_Store_System`) |

### AWS S3

| Variable | Description |
|----------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `AWS_REGION` | S3 region (`eu-west-1`) |
| `AWS_S3_BUCKET_NAME` | S3 bucket name (`game-and-music-files`) |

### Java Backend Services

| Variable | Description |
|----------|-------------|
| `DB_USERNAME` | Database username (used by Spring Boot `application.yml`) |
| `DB_PASSWORD` | Database password |
| `DB_HOST` | Database hostname |
| `DB_PORT` | Database port |

### PayPal

| Variable | Description |
|----------|-------------|
| `PAYPAL_CLIENT_ID` | PayPal REST API client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal REST API client secret |
| `PAYPAL_MODE` | `sandbox` or `live` |

### Firebase

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase Web API key (frontend) |
| `FIREBASE_CREDENTIALS` | Firebase Admin SDK credentials (backend) |
