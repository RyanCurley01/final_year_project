# Base image
FROM mcr.microsoft.com/vscode/devcontainers/base:ubuntu

# Install common packages
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       apt-transport-https \
       ca-certificates \
       curl \
       wget \
       git \
       build-essential \
       openssh-client \
       unzip \
       sudo \
       lsb-release \
       gnupg \
       software-properties-common \
       iputils-ping \
       openjdk-21-jdk \
       python3-dev \
       python3-venv \
       python3-pip \
       mysql-client \
       git-lfs \
       ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome for Puppeteer
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 (Latest LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get update && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create a dedicated Python virtual environment and install packages there
ENV VENV_PATH=/opt/venv
RUN python3 -m venv $VENV_PATH \
    && $VENV_PATH/bin/python -m pip install --upgrade pip setuptools wheel \
    && $VENV_PATH/bin/pip install --no-cache-dir \
        fastapi \
        uvicorn[standard] \
        pydantic \
        onnxruntime \
        numpy \
        pymysql \
        cryptography \
        python-dotenv \
        requests \
        google-api-python-client \
        google-auth \
        google-auth-oauthlib \
        google-auth-httplib2

# Make the venv's python the default for interactive shells in the container
ENV PATH="$VENV_PATH/bin:$PATH"

# Configure Puppeteer to use system Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Install AWS CLI v2
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \
    && unzip /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install --update \
    && rm -rf /tmp/aws /tmp/awscliv2.zip

# Set Java alternatives (ensure JAVA_HOME)
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
ENV PATH="$JAVA_HOME/bin:$PATH"

# Verify Java installation
RUN java -version && javac -version

# Create a non-root vscode user (devcontainers base already creates 'vscode', ensure packages owned)
ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN if id -u $USERNAME >/dev/null 2>&1; then echo "user exists"; else \
      groupadd --gid $USER_GID $USERNAME || true && \
      useradd -s /bin/bash --uid $USER_UID --gid $USER_GID -m $USERNAME || true; \
    fi && \
    echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME && \
    chmod 0440 /etc/sudoers.d/$USERNAME

# Change ownership of venv to vscode user
RUN chown -R $USERNAME:$USERNAME $VENV_PATH

# Cleanup
RUN apt-get clean || true

WORKDIR /workspace

# Add a startup script to fix gradlew permissions if it exists
RUN echo '#!/bin/bash\n\
if [ -f /workspace/gradlew ]; then\n\
    chmod +x /workspace/gradlew\n\
fi\n\
exec "$@"' > /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["sleep", "infinity"]
