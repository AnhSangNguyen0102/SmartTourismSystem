# ==========================================
# Stage 1: Build dependencies
# ==========================================
FROM python:3.11-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install system utilities needed for building python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy only the requirements file first to take advantage of Docker caching
COPY requirements.txt .

# Install dependencies into a separate directory
RUN pip install --no-cache-dir --user -r requirements.txt

# ==========================================
# Stage 2: Clean runtime image
# ==========================================
FROM python:3.11-slim AS runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/home/appuser/.local/bin:$PATH

# Install PostgreSQL runtime library (libpq5) for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security (essential for production hardening)
RUN useradd -u 10001 -m appuser

# Copy installed python dependencies from the builder stage to the user's home
COPY --from=builder /root/.local /home/appuser/.local

# Copy the rest of the application files
COPY --chown=appuser:appuser . .

# Set permissions for the app directory
RUN chown -R appuser:appuser /app

# Switch to the non-root user
USER appuser

# Expose the default FastAPI port
EXPOSE 8000

# Start FastAPI using Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
