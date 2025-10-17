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
       default-jdk \
       maven \
       python3-dev \
       python3-venv \
       python3-pip \
       mysql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18 (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get update && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create a dedicated Python virtual environment and install packages there
ENV VENV_PATH=/opt/venv
RUN python3 -m venv $VENV_PATH \
    && $VENV_PATH/bin/python -m pip install --upgrade pip setuptools wheel \
    && $VENV_PATH/bin/pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu \
    && $VENV_PATH/bin/pip install --no-cache-dir onnxruntime boto3 poetry

# Make the venv's python the default for interactive shells in the container
ENV PATH="$VENV_PATH/bin:$PATH"

# Install AWS CLI v2
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \
    && unzip /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install --update \
    && rm -rf /tmp/aws /tmp/awscliv2.zip

# Set Java alternatives (ensure JAVA_HOME)
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
ENV PATH="$JAVA_HOME/bin:$PATH"

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

# Cleanup
RUN apt-get clean || true

WORKDIR /workspace

# Pre-cache Maven dependencies for any Java projects in the repository
# This will run mvn dependency:go-offline in each folder that contains a pom.xml
RUN if command -v mvn >/dev/null 2>&1; then \
            echo "Searching for pom.xml files to pre-cache Maven dependencies..." && \
            find . -name pom.xml -print -execdir bash -lc 'mvn -DskipTests dependency:go-offline || true' \; ; \
        else \
            echo "mvn not found, skipping Maven pre-cache"; \
        fi

CMD ["sleep", "infinity"]
