# Multi-stage build for payments-service
# Switch from Alpine to standard JDK image to avoid TLS/SSL handshake issues
FROM gradle:8.14.3-jdk21 AS builder

WORKDIR /app

# Copy build files (standalone build from service directory)
COPY build.gradle ./
RUN echo 'rootProject.name = "payments-service"' > settings.gradle
COPY src src

# Build the application
RUN gradle bootJar --no-daemon

# Runtime stage
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Copy the built jar
COPY --from=builder /app/build/libs/*.jar app.jar

# Create a non-root user
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

# Expose port
EXPOSE 8083

# Use environment variable for JVM options
ENV JAVA_OPTS="-Xmx256m -Xms128m -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC"

# Run the application
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
