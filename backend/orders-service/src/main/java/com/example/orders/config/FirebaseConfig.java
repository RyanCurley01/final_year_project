package com.example.orders.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

@Component
public class FirebaseConfig {

    private static final Logger logger = LoggerFactory.getLogger(FirebaseConfig.class);

    @PostConstruct
    public void initialize() {
        if (!FirebaseApp.getApps().isEmpty()) {
            return;
        }

        String firebaseJson = System.getenv("FIREBASE_SERVICE_ACCOUNT_JSON");
        try {
            InputStream credentialsStream;
            if (firebaseJson != null && !firebaseJson.isBlank()) {
                credentialsStream = new ByteArrayInputStream(firebaseJson.getBytes(StandardCharsets.UTF_8));
            } else {
                ClassPathResource credentialsFile = new ClassPathResource("firebase-service-account.json");
                if (!credentialsFile.exists()) {
                    logger.warn("Firebase credentials are not configured; Firebase bearer authentication will be unavailable");
                    return;
                }
                credentialsStream = credentialsFile.getInputStream();
            }

            try (InputStream stream = credentialsStream) {
                FirebaseOptions options = FirebaseOptions.builder()
                        .setCredentials(GoogleCredentials.fromStream(stream))
                        .build();
                FirebaseApp.initializeApp(options);
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to initialize Firebase credentials", exception);
        }
    }
}
