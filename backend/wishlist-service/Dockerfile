# Multi-stage build for wishlist-service
FROM gradle:8.14.3-jdk21-alpine AS builder

WORKDIR /app

# Copy only the necessary files for this service
COPY settings.gradle build.gradle ./
COPY wishlist-service/build.gradle wishlist-service/
COPY wishlist-service/src wishlist-service/src

# Copy Firebase credentials from accounts-service (shared across authenticated services)
COPY accounts-service/src/main/resources/firebase-service-account.json wishlist-service/src/main/resources/firebase-service-account.json

# Build the application
RUN gradle wishlist-service:bootJar --no-daemon

# Runtime stage
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Copy the built jar
COPY --from=builder /app/wishlist-service/build/libs/*.jar app.jar

# Create a non-root user
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

# Expose port
EXPOSE 8085

# Use environment variable for JVM options
ENV JAVA_OPTS="-Xmx256m -Xms128m -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC"

# Run the application
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
